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

export const TESTNET_GRAM_CLAIM_DOMAIN = 0x5a475231;

export type TestnetGramDistributorConfig = {
    authorizerPublicKey: bigint;
    claimAmount: bigint;
    minReserve: bigint;
};

export type TestnetGramClaimVoucher = {
    validUntil: number;
    distributorAddress: Address;
    recipientAddress: Address;
    subjectHash: bigint;
};

export function testnetGramDistributorConfigToCell(config: TestnetGramDistributorConfig): Cell {
    if (config.authorizerPublicKey <= 0n || config.authorizerPublicKey >= (1n << 256n)) {
        throw new Error('authorizerPublicKey must be a non-zero uint256');
    }
    if (config.claimAmount <= 0n || config.minReserve < 0n) {
        throw new Error('claimAmount must be positive and minReserve non-negative');
    }
    return beginCell()
        .storeUint(config.authorizerPublicKey, 256)
        .storeCoins(config.claimAmount)
        .storeCoins(config.minReserve)
        .storeUint(0, 64)
        .storeDict(null)
        .storeDict(null)
        .endCell();
}

export function buildTestnetGramClaimVoucher(voucher: TestnetGramClaimVoucher): Cell {
    if (!Number.isSafeInteger(voucher.validUntil) || voucher.validUntil <= 0) {
        throw new Error('validUntil must be a positive unix timestamp');
    }
    if (voucher.recipientAddress.workChain !== 0) {
        throw new Error('recipientAddress must be in the basechain');
    }
    if (voucher.subjectHash < 0n || voucher.subjectHash >= (1n << 256n)) {
        throw new Error('subjectHash must be uint256');
    }
    return beginCell()
        .storeUint(TESTNET_GRAM_CLAIM_DOMAIN, 32)
        .storeUint(voucher.validUntil, 32)
        .storeAddress(voucher.distributorAddress)
        .storeAddress(voucher.recipientAddress)
        .storeUint(voucher.subjectHash, 256)
        .endCell();
}

export function buildTestnetGramClaimBody(voucherCell: Cell, signature: Buffer): Cell {
    if (signature.length !== 64) throw new Error('Ed25519 signature must be 64 bytes');
    return beginCell().storeBuffer(signature).storeRef(voucherCell).endCell();
}

export class TestnetGramDistributor implements Contract {
    abi: ContractABI = { name: 'TestnetGramDistributor' };

    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new TestnetGramDistributor(address);
    }

    static createFromConfig(config: TestnetGramDistributorConfig, code: Cell, workchain = 0) {
        const data = testnetGramDistributorConfigToCell(config);
        const init = { code, data };
        return new TestnetGramDistributor(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendTopUp(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendClaim(provider: ContractProvider, body: Cell) {
        return provider.external(body);
    }

    async getDistributorState(provider: ContractProvider) {
        const { stack } = await provider.get('distributorState', []);
        return {
            authorizerPublicKey: stack.readBigNumber(),
            claimAmount: stack.readBigNumber(),
            minReserve: stack.readBigNumber(),
            issuedCount: stack.readBigNumber(),
        };
    }

    async getClaimStatus(provider: ContractProvider, subjectHash: bigint, recipientAddress: Address) {
        const { stack } = await provider.get('claimStatus', [
            { type: 'int', value: subjectHash },
            { type: 'slice', cell: beginCell().storeAddress(recipientAddress).endCell() },
        ]);
        return {
            subjectClaimed: stack.readBoolean(),
            walletClaimed: stack.readBoolean(),
        };
    }
}
