import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import { keyPairFromSeed, sign } from '@ton/crypto';
import '@ton/test-utils';
import {
    buildTestnetGramClaimBody,
    buildTestnetGramClaimVoucher,
    TestnetGramDistributor,
} from '../wrappers/TestnetGramDistributor';

describe('Testnet GRAM distributor', () => {
    const now = 1_800_000_000;
    const claimAmount = toNano('100');
    const minReserve = toNano('1');
    const authorizer = keyPairFromSeed(Buffer.alloc(32, 7));
    const publicKey = BigInt(`0x${authorizer.publicKey.toString('hex')}`);

    let code: Cell;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let alice: SandboxContract<TreasuryContract>;
    let bob: SandboxContract<TreasuryContract>;
    let distributor: SandboxContract<TestnetGramDistributor>;

    beforeAll(async () => {
        code = await compile('TestnetGramDistributor');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = now;
        deployer = await blockchain.treasury('gram-deployer');
        alice = await blockchain.treasury('gram-alice');
        bob = await blockchain.treasury('gram-bob');
        distributor = blockchain.openContract(
            TestnetGramDistributor.createFromConfig(
                { authorizerPublicKey: publicKey, claimAmount, minReserve },
                code,
            ),
        );
        await distributor.sendDeploy(deployer.getSender(), toNano('350'));
    });

    function signedClaim(
        subjectHash: bigint,
        recipient: TreasuryContract['address'],
        options: { validUntil?: number; signer?: typeof authorizer } = {},
    ) {
        const voucher = buildTestnetGramClaimVoucher({
            validUntil: options.validUntil ?? now + 300,
            distributorAddress: distributor.address,
            recipientAddress: recipient,
            subjectHash,
        });
        return buildTestnetGramClaimBody(voucher, sign(voucher.hash(), (options.signer ?? authorizer).secretKey));
    }

    it('sends exactly 100 GRAM and records both replay guards', async () => {
        const result = await distributor.sendClaim(signedClaim(1n, alice.address));

        expect(result.transactions).toHaveTransaction({
            to: distributor.address,
            success: true,
        });
        expect(result.transactions).toHaveTransaction({
            from: distributor.address,
            to: alice.address,
            value: claimAmount,
            success: true,
        });
        expect(await distributor.getClaimStatus(1n, alice.address)).toEqual({
            subjectClaimed: true,
            walletClaimed: true,
        });
        expect((await distributor.getDistributorState()).issuedCount).toBe(1n);
    });

    it('rejects replay and the same Telegram participant using another wallet', async () => {
        const body = signedClaim(2n, alice.address);
        await distributor.sendClaim(body);

        await expect(distributor.sendClaim(body)).rejects.toThrow('Exit code: 406');

        await expect(distributor.sendClaim(signedClaim(2n, bob.address))).rejects.toThrow(
            'Exit code: 406',
        );
        expect((await distributor.getDistributorState()).issuedCount).toBe(1n);
    });

    it('rejects a second Telegram participant using the same wallet', async () => {
        await distributor.sendClaim(signedClaim(3n, alice.address));
        await expect(distributor.sendClaim(signedClaim(4n, alice.address))).rejects.toThrow(
            'Exit code: 407',
        );
        expect((await distributor.getDistributorState()).issuedCount).toBe(1n);
    });

    it('rejects forged and expired vouchers before accepting the external message', async () => {
        const outsider = keyPairFromSeed(Buffer.alloc(32, 9));
        await expect(
            distributor.sendClaim(signedClaim(5n, alice.address, { signer: outsider })),
        ).rejects.toThrow('Exit code: 405');

        await expect(
            distributor.sendClaim(signedClaim(5n, alice.address, { validUntil: now - 1 })),
        ).rejects.toThrow('Exit code: 402');
        expect((await distributor.getDistributorState()).issuedCount).toBe(0n);
    });

    it('does not record a claim when the distributor cannot preserve its reserve', async () => {
        const small = blockchain.openContract(
            TestnetGramDistributor.createFromConfig(
                { authorizerPublicKey: publicKey, claimAmount, minReserve },
                code,
                -1,
            ),
        );
        await small.sendDeploy(deployer.getSender(), toNano('100'));
        const voucher = buildTestnetGramClaimVoucher({
            validUntil: now + 300,
            distributorAddress: small.address,
            recipientAddress: bob.address,
            subjectHash: 6n,
        });
        await expect(
            small.sendClaim(
                buildTestnetGramClaimBody(voucher, sign(voucher.hash(), authorizer.secretKey)),
            ),
        ).rejects.toThrow('Exit code: 408');
        expect((await small.getDistributorState()).issuedCount).toBe(0n);
    });
});
