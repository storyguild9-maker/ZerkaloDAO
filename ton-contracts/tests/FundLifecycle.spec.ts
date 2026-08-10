import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
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
    VaultPolicyKey,
} from '../wrappers/PolicyVault';
import { TestYieldAdapter } from '../wrappers/TestYieldAdapter';

describe('Zerkalo TON fund lifecycle', () => {
    let vaultCode: Cell;
    let governanceCode: Cell;
    let adapterCode: Cell;

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let guardian: SandboxContract<TreasuryContract>;
    let alice: SandboxContract<TreasuryContract>;
    let bob: SandboxContract<TreasuryContract>;
    let carol: SandboxContract<TreasuryContract>;
    let attacker: SandboxContract<TreasuryContract>;
    let keeper: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<PolicyVault>;
    let governance: SandboxContract<FundGovernance>;
    let adapter: SandboxContract<TestYieldAdapter>;

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

        deployer = await blockchain.treasury('deployer');
        guardian = await blockchain.treasury('guardian');
        alice = await blockchain.treasury('alice');
        bob = await blockchain.treasury('bob');
        carol = await blockchain.treasury('carol');
        attacker = await blockchain.treasury('attacker');
        keeper = await blockchain.treasury('keeper');

        vault = blockchain.openContract(
            PolicyVault.createFromConfig(
                {
                    bootstrapOwner: deployer.address,
                    emergencyGuardian: guardian.address,
                    minReserve: toNano('2'),
                    immutableMinReserve: toNano('1'),
                    maxPerAction: toNano('5'),
                    immutableMaxPerAction: toNano('5'),
                    maxDaily: toNano('8'),
                    immutableMaxDaily: toNano('8'),
                    minDelay: 3_600,
                    executionDelay: 7_200,
                    maxDelay: 7 * 86_400,
                    executionWindow: 86_400,
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
                    votingPeriod: 3_600,
                },
                governanceCode,
            ),
        );
        adapter = blockchain.openContract(
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

        await governance.sendContribute(alice.getSender(), { value: toNano('7.1'), queryId: 1n });
        await governance.sendContribute(bob.getSender(), { value: toNano('2.1'), queryId: 2n });
        await governance.sendContribute(carol.getSender(), { value: toNano('1.1'), queryId: 3n });
    });

    async function createAndSchedule(opts: {
        actionKind: number;
        adapterId?: number;
        amount?: bigint;
        policyKey?: number;
        policyValue?: bigint;
    }) {
        const before = await governance.getGovernanceState();
        const proposalId = before.nextProposalId;
        await governance.sendCreateProposal(alice.getSender(), {
            value: toNano('0.1'),
            ...opts,
        });
        const proposal = await governance.getProposal(proposalId);
        blockchain.now = proposal.voteEndsAt + 1;
        await governance.sendFinalize(keeper.getSender(), {
            value: toNano('0.2'),
            proposalId,
        });
        const scheduled = await governance.getProposal(proposalId);
        expect(scheduled.status).toBe(GovernanceProposalStatus.SCHEDULED);
        return { proposalId, scheduled };
    }

    async function executeScheduled(proposalId: bigint, executeAfter: number) {
        blockchain.now = executeAfter;
        return vault.sendExecute(keeper.getSender(), {
            value: toNano('0.2'),
            proposalId,
        });
    }

    it('records contribution weight on-chain and freezes the snapshot during a proposal', async () => {
        expect(await governance.getMemberShares(alice.address)).toBe(toNano('7'));
        expect(await governance.getMemberShares(bob.address)).toBe(toNano('2'));
        expect(await governance.getMemberShares(carol.address)).toBe(toNano('1'));
        const initial = await governance.getGovernanceState();
        expect(initial.totalShares).toBe(toNano('10'));
        expect(initial.pendingDepositCount).toBe(0);

        await governance.sendCreateProposal(alice.getSender(), {
            value: toNano('0.1'),
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('4'),
        });
        const contributionDuringVote = await governance.sendContribute(bob.getSender(), {
            value: toNano('1.1'),
        });
        expect(contributionDuringVote.transactions).toHaveTransaction({
            from: bob.address,
            to: governance.address,
            success: false,
            exitCode: 201,
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
        expect(proposal.snapshotTotalShares).toBe(toNano('10'));
        expect(proposal.yesVotes).toBe(toNano('7'));
        expect(proposal.noVotes).toBe(toNano('2'));
        expect(proposal.abstainVotes).toBe(toNano('1'));
    });

    it('schedules the exact typed action, enforces timelock, and executes permissionlessly', async () => {
        const { proposalId, scheduled } = await createAndSchedule({
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('4'),
        });
        const vaultAction = await vault.getScheduledAction(proposalId);
        expect(vaultAction.actionKind).toBe(VaultAction.ALLOCATE);
        expect(vaultAction.adapterId).toBe(1);
        expect(vaultAction.amount).toBe(toNano('4'));

        blockchain.now = scheduled.executeAfter - 1;
        const tooEarly = await vault.sendExecute(attacker.getSender(), {
            value: toNano('0.2'),
            proposalId,
        });
        expect(tooEarly.transactions).toHaveTransaction({
            from: attacker.address,
            to: vault.address,
            success: false,
            exitCode: 106,
        });

        await executeScheduled(proposalId, scheduled.executeAfter);
        expect((await adapter.getAdapterState()).principal).toBe(toNano('4'));
        expect((await governance.getProposal(proposalId)).status).toBe(GovernanceProposalStatus.EXECUTED);
        expect((await vault.getScheduledAction(proposalId)).status).toBe(3);
    });

    it('permanently closes adapter registration after governance binding', async () => {
        const attackerAttempt = await vault.sendRegisterAdapter(attacker.getSender(), {
            value: toNano('0.1'),
            adapterId: 2,
            adapterAddress: attacker.address,
            maxPerAction: toNano('5'),
        });
        expect(attackerAttempt.transactions).toHaveTransaction({
            from: attacker.address,
            to: vault.address,
            success: false,
            exitCode: 100,
        });

        const deployerAttempt = await vault.sendRegisterAdapter(deployer.getSender(), {
            value: toNano('0.1'),
            adapterId: 2,
            adapterAddress: attacker.address,
            maxPerAction: toNano('5'),
        });
        expect(deployerAttempt.transactions).toHaveTransaction({
            from: deployer.address,
            to: vault.address,
            success: false,
            exitCode: 101,
        });
    });

    it('allows the guardian only to pause and blocks allocation while paused', async () => {
        const unauthorized = await vault.sendEmergencyPause(attacker.getSender(), { value: toNano('0.1') });
        expect(unauthorized.transactions).toHaveTransaction({
            from: attacker.address,
            to: vault.address,
            success: false,
            exitCode: 100,
        });
        await vault.sendEmergencyPause(guardian.getSender(), { value: toNano('0.1') });
        expect((await vault.getVaultState()).paused).toBe(true);

        const { proposalId, scheduled } = await createAndSchedule({
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('1'),
        });
        const blocked = await executeScheduled(proposalId, scheduled.executeAfter);
        expect(blocked.transactions).toHaveTransaction({
            from: keeper.address,
            to: vault.address,
            success: false,
            exitCode: 108,
        });
        expect((await vault.getScheduledAction(proposalId)).status).toBe(1);
    });

    it('rejects a proposal that does not meet the weighted approval threshold', async () => {
        await governance.sendCreateProposal(bob.getSender(), {
            value: toNano('0.1'),
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('1'),
        });
        await governance.sendCastVote(alice.getSender(), {
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
        await governance.sendFinalize(keeper.getSender(), {
            value: toNano('0.2'),
            proposalId: 1n,
        });
        expect((await governance.getProposal(1n)).status).toBe(GovernanceProposalStatus.REJECTED);
    });

    it('enforces immutable policy floors even after a successful vote', async () => {
        const { proposalId, scheduled } = await createAndSchedule({
            actionKind: VaultAction.SET_POLICY,
            policyKey: VaultPolicyKey.EXECUTION_DELAY,
            policyValue: 10n,
        });
        const rejectedExecution = await executeScheduled(proposalId, scheduled.executeAfter);
        expect(rejectedExecution.transactions).toHaveTransaction({
            from: keeper.address,
            to: vault.address,
            success: false,
            exitCode: 111,
        });
        expect((await vault.getVaultState()).executionDelay).toBe(7_200);
        expect((await vault.getScheduledAction(proposalId)).status).toBe(1);
    });

    it('enforces the daily allocation cap across multiple accepted proposals', async () => {
        const first = await createAndSchedule({
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('5'),
        });
        await executeScheduled(first.proposalId, first.scheduled.executeAfter);

        const second = await createAndSchedule({
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('4'),
        });
        const capFailure = await executeScheduled(second.proposalId, second.scheduled.executeAfter);
        expect(capFailure.transactions).toHaveTransaction({
            from: keeper.address,
            to: vault.address,
            success: false,
            exitCode: 109,
        });
        expect((await adapter.getAdapterState()).principal).toBe(toNano('5'));
    });

    it('returns funds from the whitelisted adapter through another accepted vote', async () => {
        const allocation = await createAndSchedule({
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('4'),
        });
        await executeScheduled(allocation.proposalId, allocation.scheduled.executeAfter);
        await adapter.sendAddTestYield(deployer.getSender(), { value: toNano('1') });

        const withdrawal = await createAndSchedule({
            actionKind: VaultAction.WITHDRAW,
            adapterId: 1,
            amount: toNano('3'),
        });
        await executeScheduled(withdrawal.proposalId, withdrawal.scheduled.executeAfter);
        expect((await adapter.getAdapterState()).principal).toBe(toNano('1'));
        expect((await governance.getProposal(withdrawal.proposalId)).status).toBe(
            GovernanceProposalStatus.EXECUTED,
        );
    });

    it('rejects a direct scheduling attempt that bypasses governance', async () => {
        const bypass = await vault.sendScheduleForTest(attacker.getSender(), {
            value: toNano('0.2'),
            proposalId: 99n,
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('1'),
        });
        expect(bypass.transactions).toHaveTransaction({
            from: attacker.address,
            to: vault.address,
            success: false,
            exitCode: 100,
        });
    });

    it('rejects a second vote from the same wallet', async () => {
        await governance.sendCreateProposal(alice.getSender(), {
            value: toNano('0.1'),
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('1'),
        });
        const duplicate = await governance.sendCastVote(alice.getSender(), {
            value: toNano('0.1'),
            proposalId: 1n,
            choice: GovernanceVote.NO,
        });
        expect(duplicate.transactions).toHaveTransaction({
            from: alice.address,
            to: governance.address,
            success: false,
            exitCode: 206,
        });
        expect(await governance.getMemberVote(1n, alice.address)).toBe(GovernanceVote.YES);
    });

    it('rejects execution after the immutable execution window', async () => {
        const { proposalId, scheduled } = await createAndSchedule({
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('1'),
        });
        blockchain.now = scheduled.expiresAt + 1;
        const expired = await vault.sendExecute(keeper.getSender(), {
            value: toNano('0.2'),
            proposalId,
        });
        expect(expired.transactions).toHaveTransaction({
            from: keeper.address,
            to: vault.address,
            success: false,
            exitCode: 107,
        });
        expect((await vault.getScheduledAction(proposalId)).status).toBe(1);
    });

    it('rejects replay after an action has been executed once', async () => {
        const { proposalId, scheduled } = await createAndSchedule({
            actionKind: VaultAction.ALLOCATE,
            adapterId: 1,
            amount: toNano('1'),
        });
        await executeScheduled(proposalId, scheduled.executeAfter);
        const replay = await vault.sendExecute(attacker.getSender(), {
            value: toNano('0.2'),
            proposalId,
        });
        expect(replay.transactions).toHaveTransaction({
            from: attacker.address,
            to: vault.address,
            success: false,
            exitCode: 112,
        });
        expect((await adapter.getAdapterState()).principal).toBe(toNano('1'));
    });

});




