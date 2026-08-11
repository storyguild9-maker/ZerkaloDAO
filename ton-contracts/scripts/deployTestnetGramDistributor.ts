import { Buffer } from 'node:buffer';
import { toNano } from '@ton/core';
import { keyPairFromSeed } from '@ton/crypto';
import { compile, NetworkProvider } from '@ton/blueprint';
import { TestnetGramDistributor } from '../wrappers/TestnetGramDistributor';

function loadAuthorizerSeed() {
    const configured = process.env.TON_TESTNET_DISTRIBUTOR_AUTHORIZER_SEED?.trim();
    if (!configured) {
        throw new Error('Set TON_TESTNET_DISTRIBUTOR_AUTHORIZER_SEED before deployment.');
    }
    const seed = /^[0-9a-f]{64}$/i.test(configured)
        ? Buffer.from(configured, 'hex')
        : Buffer.from(configured, 'base64url');
    if (seed.length !== 32) throw new Error('Authorizer seed must contain exactly 32 bytes.');
    return seed;
}

export async function run(provider: NetworkProvider) {
    if (provider.network() !== 'testnet') {
        throw new Error('This distributor is testnet-only. Run with --testnet.');
    }
    if (!provider.sender().address) throw new Error('Connect a TON Testnet wallet first.');

    const keys = keyPairFromSeed(loadAuthorizerSeed());
    const code = await compile('TestnetGramDistributor');
    const distributor = provider.open(
        TestnetGramDistributor.createFromConfig(
            {
                authorizerPublicKey: BigInt(`0x${keys.publicKey.toString('hex')}`),
                claimAmount: toNano('100'),
                minReserve: toNano('0.1'),
            },
            code,
        ),
    );

    if (!(await provider.isContractDeployed(distributor.address))) {
        const deployValue = toNano(process.env.TON_TESTNET_DISTRIBUTOR_DEPLOY_VALUE?.trim() || '0.2');
        await distributor.sendDeploy(provider.sender(), deployValue);
        await provider.waitForDeploy(distributor.address);
    }

    const topUp = process.env.TON_TESTNET_DISTRIBUTOR_TOP_UP?.trim();
    if (topUp && toNano(topUp) > 0n) {
        await distributor.sendTopUp(provider.sender(), toNano(topUp));
    }

    const state = await distributor.getDistributorState();
    if (state.claimAmount !== toNano('100')) throw new Error('Post-deploy claim amount mismatch.');
    if (state.authorizerPublicKey !== BigInt(`0x${keys.publicKey.toString('hex')}`)) {
        throw new Error('Post-deploy authorizer key mismatch.');
    }

    provider.ui().write(`TestnetGramDistributor: ${distributor.address.toString({ testOnly: true })}`);
    provider.ui().write('Each accepted voucher sends exactly 100 test GRAM once per subject and wallet.');
    provider.ui().write('Fund the address with 100 GRAM per planned participant plus the 0.1 GRAM reserve.');
}
