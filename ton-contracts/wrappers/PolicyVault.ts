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

export const VaultAction = {
    ALLOCATE: 1,
    WITHDRAW: 2,
    SET_POLICY: 3,
    PAUSE: 4,
    UNPAUSE: 5,
} as const;

export const VaultPolicyKey = {
    MIN_RESERVE: 1,
    MAX_PER_ACTION: 2,
    MAX_DAILY: 3,
    EXECUTION_DELAY: 4,
} as const;

export const VaultOpcodes = {
    BIND_GOVERNANCE: 0x5a11a001,
    REGISTER_ADAPTER: 0x5a11a002,
    VAULT_DEPOSIT: 0x5a11a003,
    SCHEDULE_ACTION: 0x5a11a004,
    EXECUTE_ACTION: 0x5a11a005,
    EMERGENCY_PAUSE: 0x5a11a006,
    ADAPTER_RETURN: 0x5a11a007,
    ADAPTER_RECEIPT: 0x5a11a008,
    DEPOSIT_ACCEPTED: 0x5a11b001,
    ACTION_SCHEDULED: 0x5a11b002,
    ACTION_EXECUTED: 0x5a11b003,
} as const;

export type PolicyVaultConfig = {
    bootstrapOwner: Address;
    emergencyGuardian: Address;
    minReserve: bigint;
    immutableMinReserve: bigint;
    maxPerAction: bigint;
    immutableMaxPerAction: bigint;
    maxDaily: bigint;
    immutableMaxDaily: bigint;
    minDelay: number;
    executionDelay: number;
    maxDelay: number;
    executionWindow: number;
};

export function policyVaultConfigToCell(config: PolicyVaultConfig): Cell {
    if (config.minReserve < config.immutableMinReserve) {
        throw new Error('minReserve is below immutableMinReserve');
    }
    if (config.maxPerAction <= 0n || config.maxPerAction > config.immutableMaxPerAction) {
        throw new Error('maxPerAction is outside immutable bounds');
    }
    if (config.maxDaily <= 0n || config.maxDaily > config.immutableMaxDaily) {
        throw new Error('maxDaily is outside immutable bounds');
    }
    if (config.executionDelay < config.minDelay || config.executionDelay > config.maxDelay) {
        throw new Error('executionDelay is outside immutable bounds');
    }

    const core = beginCell()
        .storeAddress(config.bootstrapOwner)
        .storeAddress(config.bootstrapOwner)
        .storeAddress(config.emergencyGuardian)
        .storeBit(false)
        .storeBit(false)
        .endCell();

    const bounds = beginCell()
        .storeCoins(config.immutableMinReserve)
        .storeCoins(config.immutableMaxPerAction)
        .storeCoins(config.immutableMaxDaily)
        .storeUint(config.minDelay, 32)
        .storeUint(config.maxDelay, 32)
        .storeUint(config.executionWindow, 32)
        .endCell();

    const policy = beginCell()
        .storeCoins(config.minReserve)
        .storeCoins(config.maxPerAction)
        .storeCoins(config.maxDaily)
        .storeUint(config.executionDelay, 32)
        .storeUint(0, 32)
        .storeCoins(0)
        .storeRef(bounds)
        .endCell();

    return beginCell()
        .storeRef(core)
        .storeRef(policy)
        .storeDict(null)
        .storeDict(null)
        .endCell();
}

export class PolicyVault implements Contract {
    abi: ContractABI = { name: 'PolicyVault' };

    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new PolicyVault(address);
    }

    static createFromConfig(config: PolicyVaultConfig, code: Cell, workchain = 0) {
        const data = policyVaultConfigToCell(config);
        const init = { code, data };
        return new PolicyVault(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendRegisterAdapter(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; adapterId: number; adapterAddress: Address; maxPerAction: bigint; queryId?: bigint },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(VaultOpcodes.REGISTER_ADAPTER, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .storeUint(opts.adapterId, 16)
                .storeAddress(opts.adapterAddress)
                .storeCoins(opts.maxPerAction)
                .endCell(),
        });
    }

    async sendBindGovernance(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; governanceAddress: Address; queryId?: bigint },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(VaultOpcodes.BIND_GOVERNANCE, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .storeAddress(opts.governanceAddress)
                .endCell(),
        });
    }

    async sendScheduleForTest(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            proposalId: bigint;
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
                .storeUint(VaultOpcodes.SCHEDULE_ACTION, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .storeUint(opts.proposalId, 64)
                .storeUint(opts.actionKind, 8)
                .storeUint(opts.adapterId ?? 0, 16)
                .storeCoins(opts.amount ?? 0n)
                .storeUint(opts.policyKey ?? 0, 8)
                .storeCoins(opts.policyValue ?? 0n)
                .endCell(),
        });
    }

    async sendExecute(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; proposalId: bigint; queryId?: bigint },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(VaultOpcodes.EXECUTE_ACTION, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .storeUint(opts.proposalId, 64)
                .endCell(),
        });
    }

    async sendEmergencyPause(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; queryId?: bigint },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(VaultOpcodes.EMERGENCY_PAUSE, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .endCell(),
        });
    }

    async getVaultState(provider: ContractProvider) {
        const { stack } = await provider.get('vaultState', []);
        return {
            isBound: stack.readBoolean(),
            paused: stack.readBoolean(),
            minReserve: stack.readBigNumber(),
            maxPerAction: stack.readBigNumber(),
            maxDaily: stack.readBigNumber(),
            executionDelay: stack.readNumber(),
            minDelay: stack.readNumber(),
            maxDelay: stack.readNumber(),
            spentToday: stack.readBigNumber(),
        };
    }

    async getGovernanceAddress(provider: ContractProvider) {
        const { stack } = await provider.get('governanceAddress', []);
        return stack.readAddress();
    }

    async getAdapterState(provider: ContractProvider, adapterId: number) {
        const { stack } = await provider.get('adapterState', [
            { type: 'int', value: BigInt(adapterId) },
        ]);
        return {
            address: stack.readAddress(),
            enabled: stack.readBoolean(),
            maxPerAction: stack.readBigNumber(),
        };
    }

    async getScheduledAction(provider: ContractProvider, proposalId: bigint) {
        const { stack } = await provider.get('scheduledAction', [
            { type: 'int', value: proposalId },
        ]);
        return {
            actionKind: stack.readNumber(),
            adapterId: stack.readNumber(),
            amount: stack.readBigNumber(),
            policyKey: stack.readNumber(),
            policyValue: stack.readBigNumber(),
            executeAfter: stack.readNumber(),
            expiresAt: stack.readNumber(),
            status: stack.readNumber(),
        };
    }
}




