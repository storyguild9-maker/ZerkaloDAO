# TON fund test report

Date: 2026-08-11

## Result

PASS. The complete fund stack was deployed to the public TON testnet and all five governance actions were executed on-chain. No mainnet wallet or real funds were used.

## Public testnet stack

- PolicyVault: [`kQAl...XIL`](https://testnet.tonviewer.com/kQAlERCz0jWeUoqmOe2pnI-mYH2BlG8cRu7T1xocyQoPAXIL)
- FundGovernance: [`kQBf...47P`](https://testnet.tonviewer.com/kQBfcxMkb4L-LKIECI7Q5GRgwFXWZm5EABoOgsyZRKRNE47P)
- TestYieldAdapter: [`kQBA...NWL`](https://testnet.tonviewer.com/kQBAblWshqO1fQdUD51P-aIzscpZJD8FZ3PyfdgcCnZEnNWL)
- Test wallet: [`kQCo...UlE`](https://testnet.tonviewer.com/kQCoEAgWGFfB08gEDTl30GyyvDDAOvcnUA4m2zorHm4MLUlE)

All three contracts were independently reported as `active` by the public TON Center testnet API after the scenario.

## Executed governance lifecycle

1. A contribution established `0.21 GRAM` of confirmed voting weight.
2. Proposal `1` allocated `0.08 GRAM` to immutable adapter `1`.
3. Proposal `2` withdrew `0.04 GRAM`; the adapter return receipt was verified.
4. Proposal `3` reduced the bounded maximum per action from `0.5` to `0.4 GRAM`.
5. Proposal `4` paused the vault through governance.
6. Proposal `5` unpaused the vault using the stronger policy threshold.

Every proposal completed the sequence `active -> accepted pending -> scheduled -> executed`, including the on-chain voting period, timelock and matching execution receipt.

## Independent final-state readback

Public getter results returned exit code `0`:

- governance: total voting weight `0.21 GRAM`, active proposal `0`, next proposal ID `6`, pending deposits `0`, quorum `60%`, ordinary approval threshold `66.67%`;
- vault: governance bound, adapter list frozen, not paused, minimum reserve `0.05 GRAM`, maximum per action `0.4 GRAM`, maximum per day `1.5 GRAM`, execution delay `15 seconds`;
- adapter `1`: remaining principal `0.04 GRAM` after the allocation and withdrawal cycle.

Balances at final readback:

- test wallet: `0.511134119 GRAM`;
- PolicyVault: `0.720650875 GRAM`;
- FundGovernance: `0.549134971 GRAM`;
- TestYieldAdapter: `0.179344307 GRAM`.

## Verification completed

- Tolk 1.4.2 compilation: passed for all three contracts.
- TypeScript wrapper and script typecheck: passed.
- TON Sandbox: 17 of 17 tests passed.
- Existing application tests: 38 of 38 passed before the public testnet step.
- Next.js production build: passed before the public testnet step.
- Public TON testnet deployment: passed.
- Public TON testnet end-to-end scenario: passed.
- Independent public getter and balance readback: passed.

## Testnet findings

The public run exposed two integration timing cases that do not appear in the local sandbox:

1. contract deployment can complete after the default explorer polling window;
2. a finalized proposal briefly remains in `accepted pending` while the vault processes the schedule message.

The deployment and scenario scripts now poll contract state directly and can resume the last matching unfinished proposal without creating a duplicate.

## Scope and safety

This is a testnet-only validation stack. `TestYieldAdapter` simulates an earning destination and must never be used on mainnet. The tested vault accepts typed actions only, has no arbitrary transfer destination or code-upgrade operation, freezes its adapter whitelist after governance binding, applies limits and a timelock, and marks execution complete only after a matching adapter receipt.
