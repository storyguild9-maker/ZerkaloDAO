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

export const TestYieldAdapterOpcodes = {
    ADD_TEST_YIELD: 0x7a11a001,
} as const;

export type TestYieldAdapterConfig = {
    vaultAddress: Address;
    adapterId: number;
};

export function testYieldAdapterConfigToCell(config: TestYieldAdapterConfig): Cell {
    return beginCell()
        .storeAddress(config.vaultAddress)
        .storeUint(config.adapterId, 16)
        .storeCoins(0)
        .endCell();
}

export class TestYieldAdapter implements Contract {
    abi: ContractABI = { name: 'TestYieldAdapter' };

    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new TestYieldAdapter(address);
    }

    static createFromConfig(config: TestYieldAdapterConfig, code: Cell, workchain = 0) {
        const data = testYieldAdapterConfigToCell(config);
        const init = { code, data };
        return new TestYieldAdapter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendAddTestYield(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; queryId?: bigint },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(TestYieldAdapterOpcodes.ADD_TEST_YIELD, 32)
                .storeUint(opts.queryId ?? 0n, 64)
                .endCell(),
        });
    }

    async getAdapterState(provider: ContractProvider) {
        const { stack } = await provider.get('adapterState', []);
        return {
            vaultAddress: stack.readAddress(),
            adapterId: stack.readNumber(),
            principal: stack.readBigNumber(),
        };
    }
}
