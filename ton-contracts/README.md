# Zerkalo TON fund contracts

Testnet-first on-chain fund governance for Zerkalo DAO.

## Contracts

- `FundGovernance` records confirmed contribution weight, freezes the weight snapshot during a proposal, accepts one vote per wallet, finalizes quorum/approval, and emits only typed actions.
- `PolicyVault` holds funds, freezes the adapter whitelist during one-time governance binding, and enforces timelock, reserve, per-action and daily caps, pause, expiration, receipts, and replay protection.
- `TestYieldAdapter` simulates a whitelisted earning protocol for testnet and Sandbox. It must never be used as a production yield adapter.
- `TestnetGramDistributor` sends exactly 100 test GRAM for a server-authorized voucher and permanently blocks a second claim by the same private Telegram subject or wallet address.

The investment vault has no arbitrary transfer action, no arbitrary destination, no arbitrary payload, and no code-upgrade entrypoint.

## Commands

From the `zerkalo-dao` root:

```text
npm run ton:build
npm run ton:test
npm run ton:testnet:connect
npm run ton:testnet:deploy
npm run ton:testnet:scenario
npm run ton:testnet:grant:deploy
```

Both public-network commands refuse mainnet. `ton:testnet:deploy` deploys the deterministic stack, registers adapter `1`, permanently closes adapter registration, binds governance, and verifies the binding. `ton:testnet:scenario` then contributes test funds and verifies allocate, withdraw, bounded policy change, pause, and unpause with voting and timelocks.

`ton:testnet:grant:deploy` deploys the separate 100-GRAM distributor. It cannot mint native test GRAM: fund its address with 100 GRAM per intended participant plus its immutable reserve and transaction fees. The signing seed is server-only, testnet-only, and must never be reused as a wallet seed.

Use a separately funded testnet wallet. Confirm every TON Connect transaction explicitly. An optional `TESTNET_GUARDIAN_ADDRESS` may be supplied; otherwise the testnet deployer is also the pause-only guardian.

## Testnet-only parameters

- quorum floor: 60%
- ordinary approval floor: 66.67%
- policy changes and unpause: 75%
- voting period: 15 seconds
- execution delay: 15 seconds, immutable minimum 10 seconds
- execution window: 10 minutes
- minimum reserve: 0.05 GRAM, immutable floor 0.02 GRAM
- allocation cap: 0.5 GRAM per action and 1.5 GRAM per day

The short periods and small limits exist only to make public testnet checks practical. Mainnet requires a new deployment with separately reviewed parameters, production adapters, published code hashes, and independent audits.

See `SECURITY.md` before using any real funds.
