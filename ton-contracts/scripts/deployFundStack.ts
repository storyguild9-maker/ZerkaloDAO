import { Address, toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { FundGovernance } from '../wrappers/FundGovernance';
import { PolicyVault } from '../wrappers/PolicyVault';
import { TestYieldAdapter } from '../wrappers/TestYieldAdapter';

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForState(
    label: string,
    predicate: () => Promise<boolean>,
    timeoutMilliseconds = 120_000,
) {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
        try {
            if (await predicate()) {
                return;
            }
        } catch {
            // Public testnet APIs can briefly lag behind the accepted transaction.
        }
        await delay(2_000);
    }
    throw new Error(`${label} was not confirmed on-chain before the timeout.`);
}

export async function run(provider: NetworkProvider) {
    if (provider.network() !== 'testnet') {
        throw new Error('This script is testnet-only. Run it with --testnet.');
    }

    const bootstrapOwner = provider.sender().address;
    if (!bootstrapOwner) {
        throw new Error('Connect a testnet wallet before deployment.');
    }

    const guardian = process.env.TESTNET_GUARDIAN_ADDRESS
        ? Address.parse(process.env.TESTNET_GUARDIAN_ADDRESS)
        : bootstrapOwner;

    const [vaultCode, governanceCode, adapterCode] = await Promise.all([
        compile('PolicyVault'),
        compile('FundGovernance'),
        compile('TestYieldAdapter'),
    ]);

    const vault = provider.open(
        PolicyVault.createFromConfig(
            {
                bootstrapOwner,
                emergencyGuardian: guardian,
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

    if (!(await provider.isContractDeployed(vault.address))) {
        await vault.sendDeploy(provider.sender(), toNano('0.15'));
        await provider.waitForDeploy(vault.address);
    }
    if (!(await provider.isContractDeployed(governance.address))) {
        await governance.sendDeploy(provider.sender(), toNano('0.1'));
        await provider.waitForDeploy(governance.address);
    }
    if (!(await provider.isContractDeployed(adapter.address))) {
        await adapter.sendDeploy(provider.sender(), toNano('0.1'));
        await provider.waitForDeploy(adapter.address);
    }

    const vaultState = await vault.getVaultState();
    if (!vaultState.isBound) {
        await vault.sendRegisterAdapter(provider.sender(), {
            value: toNano('0.03'),
            adapterId: 1,
            adapterAddress: adapter.address,
            maxPerAction: toNano('0.5'),
        });
        await waitForState('Adapter registration', async () => {
            const registered = await vault.getAdapterState(1);
            return registered.enabled && registered.address.equals(adapter.address);
        });
        await vault.sendBindGovernance(provider.sender(), {
            value: toNano('0.03'),
            governanceAddress: governance.address,
        });
        await waitForState('Governance binding', async () => {
            const state = await vault.getVaultState();
            if (!state.isBound) {
                return false;
            }
            return (await vault.getGovernanceAddress()).equals(governance.address);
        });
    }

    const finalState = await vault.getVaultState();
    const boundGovernance = await vault.getGovernanceAddress();
    if (!finalState.isBound || !boundGovernance.equals(governance.address)) {
        throw new Error('Post-deploy verification failed: governance binding mismatch.');
    }

    provider.ui().write(`PolicyVault: ${vault.address.toString({ testOnly: true })}`);
    provider.ui().write(`FundGovernance: ${governance.address.toString({ testOnly: true })}`);
    provider.ui().write(`TestYieldAdapter: ${adapter.address.toString({ testOnly: true })}`);
    provider.ui().write('Testnet stack deployed, adapter whitelist frozen, governance binding verified.');
}
