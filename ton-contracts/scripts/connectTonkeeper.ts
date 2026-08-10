import TonConnect, { IStorage, WalletInfoRemote } from '@tonconnect/sdk';
import qrcode from 'qrcode-terminal';
import fs from 'node:fs/promises';
import path from 'node:path';

class JsonFileStorage implements IStorage {
    constructor(private readonly filePath: string) {}

    private async readAll(): Promise<Record<string, string>> {
        try {
            return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as Record<string, string>;
        } catch {
            return {};
        }
    }

    private async writeAll(value: Record<string, string>) {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(value), 'utf8');
    }

    async setItem(key: string, value: string) {
        const all = await this.readAll();
        all[key] = value;
        await this.writeAll(all);
    }

    async getItem(key: string) {
        const all = await this.readAll();
        return all[key] ?? null;
    }

    async removeItem(key: string) {
        const all = await this.readAll();
        delete all[key];
        await this.writeAll(all);
    }
}

function isRemoteWallet(wallet: unknown): wallet is WalletInfoRemote {
    return Boolean(
        wallet
        && typeof wallet === 'object'
        && 'universalLink' in wallet
        && 'bridgeUrl' in wallet,
    );
}

async function main() {
    console.log('TON_CONNECT_STEP=start');
    const storage = new JsonFileStorage(path.join(process.cwd(), 'temp', 'testnet', 'tonconnect.json'));
    const connector = new TonConnect({
        storage,
        manifestUrl: 'https://zerkalo-dao.vercel.app/tonconnect-manifest.json',
    });

    console.log('TON_CONNECT_STEP=registry');
    const wallets = (await connector.getWallets()).filter(isRemoteWallet);
    console.log(`TON_CONNECT_STEP=wallets:${wallets.length}`);
    const tonkeeper = wallets.find((wallet) => wallet.name.toLowerCase().includes('tonkeeper'));
    if (!tonkeeper) {
        throw new Error('Tonkeeper is not present in the TON Connect wallet registry.');
    }

    console.log('TON_CONNECT_STEP=pairing');
    const connectionUrl = connector.connect({
        universalLink: tonkeeper.universalLink,
        bridgeUrl: tonkeeper.bridgeUrl,
    });
    qrcode.generate(connectionUrl, { small: true });
    console.log(`TONKEEPER_TESTNET_LINK=${connectionUrl}`);
    console.log('Open the link in Tonkeeper and approve the testnet connection.');

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('TON Connect approval timed out after 10 minutes.')), 10 * 60 * 1000);
        connector.onStatusChange((wallet) => {
            if (!wallet) return;
            clearTimeout(timeout);
            console.log(`Connected: ${wallet.account.address}`);
            resolve();
        }, (error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});




