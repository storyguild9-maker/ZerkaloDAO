import {
    Address,
    beginCell,
    Cell,
    Contract,
    ContractABI,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
} from '@ton/core';

export const GovernanceVote = {
    YES: 1,
    NO: 2,
    ABSTAIN: 3,
} as const;

export const GovernanceProposalStatus = {
    ACTIVE: 1,
    ACCEPTED_PENDING: 2,
    REJECTED: 3,
    SCHEDULED: 4,
    EXECUTED: 5,
} as const;

export const GovernanceOpcodes = {
    CONTRIBUTE: 0x6f11a001,
    CREATE_PROPOSAL: 0x6f11a002,
    CAST_VOTE: 0x6f11a003,
    FINALIZE_PROPOSAL: 0x6f11a004,
    RETRY_SCHEDULE: 0x6f11a005,
} as const;

export type FundGovernanceConfig = {
    vaultAddress: Address;
    minProposalStake: bigint;
    quorumBps: number;
    approvalBps: number;
    votingPeriod: number;
};

export function fundGovernanceConfigToCell(config: FundGovernanceConfig): Cell {
    if (config.quorumBps < 6000 || config.quorumBps > 10000) {
        throw new Error('quorumBps must be between the immutable 6000 floor and 10000');
    }
    if (config.approvalBps < 6667 || config.approvalBps > 10000) {
        throw new Error('approvalBps must be between the immutable 6667 floor and 10000');
    }
    if (config.votingPeriod <= 0) {
        throw new Error('votingPeriod must be positive');
    }

    return beginCell()
        .storeAddress(config.vaultAddress)
        .storeCoins(config.minProposalStake)
        .storeUint(config.quorumBps, 16)
        .storeUint(config.approvalBps, 16)
        .storeUint(config.votingPeriod, 32)
        .storeUint(0, 64)
        .storeUint(1, 64)
        .storeUint(0, 32)
        .storeCoins(0)
        .storeDict(null)
        .storeDict(null)
        .storeDict(null)
        .endCell();
}

export class FundGovernance implements Contract {
    abi: ContractABI = { name: 'FundGovernance' };

    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new FundGovernance(address);
    }

    static createFromConfig(config: FundGovernanceConfig, code: Cell, workchain = 0) {
        const data = fundGovernanceConfigToCell(config);
        const init = { code, data };
        return new FundGovernance(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendContribute(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; queryId?: bigint },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(GovernanceOpcodes.CONTRIBUTE, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .endCell(),
        });
    }

    async sendCreateProposal(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            actionKind: number;
            adapterId?: number;
            amount?: bigint;
            policyKey?: number;
            policyValue?: bigint;
            queryId?: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(GovernanceOpcodes.CREATE_PROPOSAL, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .storeUint(opts.actionKind, 8)
                .storeUint(opts.adapterId ?? 0, 16)
                .storeCoins(opts.amount ?? 0n)
                .storeUint(opts.policyKey ?? 0, 8)
                .storeCoins(opts.policyValue ?? 0n)
                .endCell(),
        });
    }

    async sendCastVote(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; proposalId: bigint; choice: number; queryId?: bigint },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(GovernanceOpcodes.CAST_VOTE, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .storeUint(opts.proposalId, 64)
                .storeUint(opts.choice, 8)
                .endCell(),
        });
    }

    async sendFinalize(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; proposalId: bigint; queryId?: bigint },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(GovernanceOpcodes.FINALIZE_PROPOSAL, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .storeUint(opts.proposalId, 64)
                .endCell(),
        });
    }

    async sendRetrySchedule(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; proposalId: bigint; queryId?: bigint },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(GovernanceOpcodes.RETRY_SCHEDULE, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .storeUint(opts.proposalId, 64)
                .endCell(),
        });
    }

    async getGovernanceState(provider: ContractProvider) {
        const { stack } = await provider.get('governanceState', []);
        return {
            totalShares: stack.readBigNumber(),
            minProposalStake: stack.readBigNumber(),
            quorumBps: stack.readNumber(),
            approvalBps: stack.readNumber(),
            votingPeriod: stack.readNumber(),
            activeProposalId: stack.readBigNumber(),
            nextProposalId: stack.readBigNumber(),
            pendingDepositCount: stack.readNumber(),
        };
    }

    async getMemberShares(provider: ContractProvider, memberAddress: Address) {
        const { stack } = await provider.get('memberShares', [
            { type: 'slice', cell: beginCell().storeAddress(memberAddress).endCell() },
        ]);
        return stack.readBigNumber();
    }

    async getMemberVote(provider: ContractProvider, proposalId: bigint, memberAddress: Address) {
        const { stack } = await provider.get('memberVote', [
            { type: 'int', value: proposalId },
            { type: 'slice', cell: beginCell().storeAddress(memberAddress).endCell() },
        ]);
        return stack.readNumber();
    }

    async getProposal(provider: ContractProvider, proposalId: bigint) {
        const { stack } = await provider.get('proposalState', [
            { type: 'int', value: proposalId },
        ]);
        return {
            proposer: stack.readAddress(),
            actionKind: stack.readNumber(),
            adapterId: stack.readNumber(),
            amount: stack.readBigNumber(),
            policyKey: stack.readNumber(),
            policyValue: stack.readBigNumber(),
            createdAt: stack.readNumber(),
            voteEndsAt: stack.readNumber(),
            snapshotTotalShares: stack.readBigNumber(),
            yesVotes: stack.readBigNumber(),
            noVotes: stack.readBigNumber(),
            abstainVotes: stack.readBigNumber(),
            executeAfter: stack.readNumber(),
            expiresAt: stack.readNumber(),
            status: stack.readNumber(),
        };
    }
}
