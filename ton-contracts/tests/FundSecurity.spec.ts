import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';
import {
    FundGovernance,
    GovernanceProposalStatus,
    GovernanceVote,
} from '../wrappers/FundGovernance';
import {
    PolicyVault,
    VaultAction,
    VaultOpcodes,
    VaultPolicyKey,
} from '../wrappers/PolicyVault';
import { TestYieldAdapter } from '../wrappers/TestYieldAdapter';

describe('Zerkalo TON fund security boundaries', () => {
    let vaultCode: Cell;
    let governanceCode: Cell;
    let adapterCode: Cell;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let alice: SandboxContract<TreasuryContract>;
    let bob: SandboxContract<TreasuryContract>;
    let carol: SandboxContract<TreasuryContract>;
    let attacker: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<PolicyVault>;
    let governance: SandboxContract<FundGovernance>;

    beforeAll(async () => {
        [vaultCode, governanceCode, adapterCode] = await Promise.all([
            compile('PolicyVault'),
            compile('FundGovernance'),
            compile('TestYieldAdapter'),
        ]);
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 1_800_000_000;
        deployer = await blockchain.treasury('security-deployer');
        alice = await blockchain.treasury('security-alice');
        bob = await blockchain.treasury('security-bob');
        carol = await blockchain.treasury('security-carol');
        attacker = await blockchain.treasury('security-attacker');

        vault = blockchain.openContract(
            PolicyVault.createFromConfig(
                {
                    bootstrapOwner: deployer.address,
                    emergencyGuardian: deployer.address,
                    minReserve: toNano('2'),
                    immutableMinReserve: toNano('1'),
                    maxPerAction: toNano('5'),
                    immutableMaxPerAction: toNano('5'),
                    maxDaily: toNano('8'),
                    immutableMaxDaily: toNano('8'),
                    minDelay: 100,
                    executionDelay: 200,
                    maxDelay: 1_000,
                    executionWindow: 500,
                },
                vaultCode,
            ),
        );
        governance = blockchain.openContract(
            FundGovernance.createFromConfig(
                {
                    vaultAddress: vault.address,
                    minProposalStake: toNano('0.5'),
                    quorumBps: 6_000,
                    approvalBps: 6_667,
                    votingPeriod: 100,
                },
                governanceCode,
            ),
        );
        const adapter = blockchain.openContract(
            TestYieldAdapter.createFromConfig(
                { vaultAddress: vault.address, adapterId: 1 },
                adapterCode,
            ),
        );

        await vault.sendDeploy(deployer.getSender(), toNano('1'));
        await governance.sendDeploy(deployer.getSender(), toNano('1'));
        await adapter.sendDeploy(deployer.getSender(), toNano('1'));
        await vault.sendRegisterAdapter(deployer.getSender(), {
            value: toNano('0.1'),
            adapterId: 1,
            adapterAddress: adapter.address,
            maxPerAction: toNano('5'),
        });
        await vault.sendBindGovernance(deployer.getSender(), {
            value: toNano('0.1'),
            governanceAddress: governance.address,
        });
        await governance.sendContribute(alice.getSender(), { value: toNano('7.1') });
        await governance.sendContribute(bob.getSender(), { value: toNano('2.1') });
        await governance.sendContribute(carol.getSender(), { value: toNano('1.1') });
    });

    it('rejects a forged deposit acknowledgement from an outsider', async () => {
        const result = await attacker.send({
            to: governance.address,
            value: toNano('0.1'),
            body: beginCell()
                .storeUint(VaultOpcodes.DEPOSIT_ACCEPTED, 32)
                .storeUint(0, 64)
                .storeAddress(attacker.address)
                .storeCoins(toNano('100'))
                .endCell(),
        });
        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: governance.address,
            success: false,
            exitCode: 200,
        });
        expect(await governance.getMemberShares(attacker.address)).toBe(0n);
    });

    it('keeps an accepted unknown-adapter proposal pending instead of executing it', async () => {
        await governance.sendCreateProposal(alice.getSender(), {
            value: toNano('0.1'),
            actionKind: VaultAction.ALLOCATE,
            adapterId: 2,
            amount: toNano('1'),
        });
        const proposal = await governance.getProposal(1n);
        blockchain.now = proposal.voteEndsAt + 1;
        await governance.sendFinalize(attacker.getSender(), {
            value: toNano('0.2'),
            proposalId: 1n,
        });
        expect((await governance.getProposal(1n)).status).toBe(
            GovernanceProposalStatus.ACCEPTED_PENDING,
        );
    });

    it('applies a valid bounded policy change only after voting and timelock', async () => {
        await governance.sendCreateProposal(alice.getSender(), {
            value: toNano('0.1'),
            actionKind: VaultAction.SET_POLICY,
            policyKey: VaultPolicyKey.MAX_PER_ACTION,
            policyValue: toNano('4'),
        });
        const proposal = await governance.getProposal(1n);
        blockchain.now = proposal.voteEndsAt + 1;
        await governance.sendFinalize(attacker.getSender(), {
            value: toNano('0.2'),
            proposalId: 1n,
        });
        const scheduled = await governance.getProposal(1n);
        blockchain.now = scheduled.executeAfter;
        await vault.sendExecute(attacker.getSender(), { value: toNano('0.2'), proposalId: 1n });
        expect((await vault.getVaultState()).maxPerAction).toBe(toNano('4'));
        expect((await governance.getProposal(1n)).status).toBe(GovernanceProposalStatus.EXECUTED);
    });

    it('uses the stronger 75 percent threshold for policy changes', async () => {
        await governance.sendContribute(bob.getSender(), { value: toNano('1.1') });
        await governance.sendCreateProposal(alice.getSender(), {
            value: toNano('0.1'),
            actionKind: VaultAction.SET_POLICY,
            policyKey: VaultPolicyKey.MAX_PER_ACTION,
            policyValue: toNano('4'),
        });
        await governance.sendCastVote(bob.getSender(), {
            value: toNano('0.1'),
            proposalId: 1n,
            choice: GovernanceVote.NO,
        });
        await governance.sendCastVote(carol.getSender(), {
            value: toNano('0.1'),
            proposalId: 1n,
            choice: GovernanceVote.ABSTAIN,
        });
        const proposal = await governance.getProposal(1n);
        blockchain.now = proposal.voteEndsAt + 1;
        await governance.sendFinalize(attacker.getSender(), {
            value: toNano('0.2'),
            proposalId: 1n,
        });
        expect((await governance.getProposal(1n)).status).toBe(GovernanceProposalStatus.REJECTED);
    });

    it('rejects a forged adapter execution receipt from an outsider', async () => {
        const result = await attacker.send({
            to: vault.address,
            value: toNano('0.1'),
            body: beginCell()
                .storeUint(VaultOpcodes.ADAPTER_RECEIPT, 32)
                .storeUint(0, 64)
                .storeUint(999, 64)
                .storeUint(1, 16)
                .storeUint(VaultAction.ALLOCATE, 8)
                .storeCoins(toNano('1'))
                .endCell(),
        });
        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: vault.address,
            success: false,
            exitCode: 100,
        });
    });
});
