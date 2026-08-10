# TON fund test report

Date: 2026-08-11

## Completed

- Tolk 1.4.2 compilation: passed for all three contracts.
- TypeScript wrapper and script typecheck: passed.
- TON Sandbox: 17 of 17 tests passed.
- Existing application tests: 38 of 38 passed before the public testnet step.
- Next.js production build: passed before the public testnet step.
- Separate Acton 1.1.0 testnet wallet created locally in WSL.

## Public testnet stack

The deterministic public testnet stack is ready to deploy with:

```text
npm run ton:testnet:deploy
npm run ton:testnet:scenario
```

The E2E scenario verifies:

1. confirmed contribution and on-chain voting weight;
2. allocation to immutable adapter `1`;
3. withdrawal and matching adapter return receipt;
4. bounded policy change;
5. governance pause;
6. governance unpause with the stronger approval threshold.

## Pending external condition

Public testnet deployment requires test GRAM for gas. The official automatic faucet returned HTTP 429 because the IP allowance was exhausted. The dedicated wallet address is:

```text
kQCoEAgWGFfB08gEDTl30GyyvDDAOvcnUA4m2zorHm4MLUlE
```

No mainnet wallet, real funds, or seed phrase is used. This report must not be marked public-testnet complete until the deploy and E2E commands finish and the resulting transactions are independently read back from the chain.
