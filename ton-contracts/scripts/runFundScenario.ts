import { toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import {
    FundGovernance,
    GovernanceProposalStatus,
} from '../wrappers/FundGovernance';
import {
    PolicyVault,
    VaultAction,
    VaultPolicyKey,
} from '../wrappers/PolicyVault';
import { TestYieldAdapter } from '../wrappers/TestYieldAdapter';

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitUntil(timestamp: number, label: string, provider: NetworkProvider) {
    const remaining = Math.max(0, timestamp + 1 - Math.floor(Date.now() / 1000));
    if (remaining > 0) {
        provider.ui().write(`${label}: ${remaining} sec`);
        await delay(remaining * 1_000);
    }
}

export async function run(provider: NetworkProvider) {
    if (provider.network() !== 'testnet') {
        throw new Error('This scenario is testnet-only. Run it with --testnet.');
    }

    const senderAddress = provider.sender().address;
    if (!senderAddress) {
        throw new Error('Connect a funded testnet wallet before running the scenario.');
    }

    const [vaultCode, governanceCode, adapterCode] = await Promise.all([
        compile('PolicyVault'),
        compile('FundGovernance'),
        compile('TestYieldAdapter'),
    ]);
    const vault = provider.open(
        PolicyVault.createFromConfig(
            {
                bootstrapOwner: senderAddress,
                emergencyGuardian: senderAddress,
                minReserve: toNano('0.05'),
                immutableMinReserve: toNano('0.02'),
                maxPerAction: toNano('0.5'),
                immutableMaxPerAction: toNano('0.5'),
                maxDaily: toNano('1.5'),
                immutableMaxDaily: toNano('1.5'),
                minDelay: 10,
                executionDelay: 15,
                maxDelay: 3_600,
                executionWindow: 600,
            },
            vaultCode,
        ),
    );
    const governance = provider.open(
        FundGovernance.createFromConfig(
            {
                vaultAddress: vault.address,
                minProposalStake: toNano('0.05'),
                quorumBps: 6_000,
                approvalBps: 6_667,
                votingPeriod: 15,
            },
            governanceCode,
        ),
    );
    const adapter = provider.open(
        TestYieldAdapter.createFromConfig(
            { vaultAddress: vault.address, adapterId: 1 },
            adapterCode,
        ),
    );

    for (const [name, address] of [
        ['PolicyVault', vault.address],
        ['FundGovernance', governance.address],
        ['TestYieldAdapter', adapter.address],
    ] as const) {
        if (!(await provider.isContractDeployed(address))) {
            throw new Error(`${name} is not deployed at the deterministic testnet address.`);
        }
    }

    const boundGovernance = await vault.getGovernanceAddress();
    if (!boundGovernance.equals(governance.address)) {
        throw new Error('Governance binding does not match the deterministic testnet stack.');
    }

    if ((await governance.getMemberShares(senderAddress)) === 0n) {
        provider.ui().write('1/6 Contributing 0.25 GRAM of voting weight');
        await governance.sendContribute(provider.sender(), {
            value: toNano('0.31'),
            queryId: BigInt(Date.now()),
        });
        await provider.waitForLastTransaction();
    }
    if ((await governance.getMemberShares(senderAddress)) < toNano('0.05')) {
        throw new Error('The test wallet does not have enough confirmed voting weight.');
    }

    async function approveAndExecute(label: string, action: {
        actionKind: number;
        adapterId?: number;
        amount?: bigint;
        policyKey?: number;
        policyValue?: bigint;
    }) {
        const state = await governance.getGovernanceState();
        if (state.activeProposalId !== 0n) {
            throw new Error(`Proposal ${state.activeProposalId} is still active; finish it before retrying ${label}.`);
        }
        const proposalId = state.nextProposalId;
        provider.ui().write(`${label}: create proposal ${proposalId}`);
        await governance.sendCreateProposal(provider.sender(), {
            value: toNano('0.05'),
            queryId: BigInt(Date.now()),
            ...action,
        });
        await provider.waitForLastTransaction();
        let proposal = await governance.getProposal(proposalId);
        await waitUntil(proposal.voteEndsAt, `${label}: voting period`, provider);
        await governance.sendFinalize(provider.sender(), {
            value: toNano('0.05'),
            proposalId,
            queryId: BigInt(Date.now()),
        });
        await provider.waitForLastTransaction();
        proposal = await governance.getProposal(proposalId);
        if (proposal.status !== GovernanceProposalStatus.SCHEDULED) {
            throw new Error(`${label}: proposal was not scheduled, status ${proposal.status}.`);
        }
        await waitUntil(proposal.executeAfter, `${label}: on-chain timelock`, provider);
        await vault.sendExecute(provider.sender(), {
            value: toNano('0.05'),
            proposalId,
            queryId: BigInt(Date.now()),
        });
        await provider.waitForLastTransaction();
        proposal = await governance.getProposal(proposalId);
        if (proposal.status !== GovernanceProposalStatus.EXECUTED) {
            throw new Error(`${label}: execution receipt was not confirmed, status ${proposal.status}.`);
        }
        provider.ui().write(`${label}: verified on-chain`);
    }

    provider.ui().write('2/6 Allocating funds to the immutable test adapter');
    await approveAndExecute('Allocate', {
        actionKind: VaultAction.ALLOCATE,
        adapterId: 1,
        amount: toNano('0.08'),
    });
    if ((await adapter.getAdapterState()).principal !== toNano('0.08')) {
        throw new Error('Adapter principal does not match the allocated amount.');
    }

    provider.ui().write('3/6 Withdrawing funds from the adapter');
    await approveAndExecute('Withdraw', {
        actionKind: VaultAction.WITHDRAW,
        adapterId: 1,
        amount: toNano('0.04'),
    });
    if ((await adapter.getAdapterState()).principal !== toNano('0.04')) {
        throw new Error('Adapter principal does not match the remaining amount.');
    }

    provider.ui().write('4/6 Changing a bounded policy value');
    await approveAndExecute('Policy change', {
        actionKind: VaultAction.SET_POLICY,
        policyKey: VaultPolicyKey.MAX_PER_ACTION,
        policyValue: toNano('0.4'),
    });
    if ((await vault.getVaultState()).maxPerAction !== toNano('0.4')) {
        throw new Error('The bounded max-per-action policy was not updated.');
    }

    provider.ui().write('5/6 Pausing through governance');
    await approveAndExecute('Pause', { actionKind: VaultAction.PAUSE });
    if (!(await vault.getVaultState()).paused) {
        throw new Error('Vault did not enter paused state.');
    }

    provider.ui().write('6/6 Unpausing through the stronger governance threshold');
    await approveAndExecute('Unpause', { actionKind: VaultAction.UNPAUSE });
    if ((await vault.getVaultState()).paused) {
        throw new Error('Vault did not leave paused state.');
    }

    provider.ui().write('PASS: all public testnet fund actions and receipts are verified.');
}
