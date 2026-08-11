# Security boundary

This directory is a testnet-first prototype. It is not approved for mainnet funds.

## Enforced on-chain

- Financial voting weight equals contribution weight acknowledged by the vault.
- Contributions are blocked while a proposal is active, so the proposal snapshot cannot change.
- A wallet can vote only once per proposal.
- Quorum cannot fall below 60%; ordinary approval cannot fall below 66.67%.
- Policy changes and unpause require at least 75% approval.
- The vault accepts schedules only from the immutable governance address.
- Actions are typed; there is no arbitrary destination or arbitrary payload operation.
- Adapters can be registered only before one-time governance binding.
- Execution is permissionless but only inside the timelock window.
- Adapter allocations and withdrawals remain `executing` until the exact whitelisted adapter returns a matching receipt.
- Rich-bounce handling restores failed adapter actions to `scheduled` and reverses allocation accounting before retry.
- Replay, expired execution, reserve breach, per-action cap, daily cap, and unknown adapters are rejected.
- The emergency guardian can pause but cannot unpause or transfer funds.
- No code-upgrade entrypoint exists.

The separate testnet GRAM distributor accepts only signed, expiring vouchers bound to its own address, one basechain wallet, and one irreversible Telegram subject hash. It fixes the amount at 100 GRAM and checks its reserve before issuing. It is testnet-only; compromise of its server-side authorizer could still redirect the distributor's prefunded test balance to new addresses, so the contract must never hold mainnet funds or unrelated assets.

## Verified locally

The Sandbox suite covers 22 positive and adversarial scenarios, including forged deposit acknowledgements, forged adapter receipts, unknown adapters, duplicate votes, direct scheduling bypass, immutable policy floors, daily limits, pause behavior, timelock, expiration, replay, forged grant vouchers, dual subject/wallet claim guards, and insufficient distributor reserves.

## Before mainnet

- Replace `TestYieldAdapter` with a separately audited adapter for each exact protocol, contract address, code hash, opcode, and response format.
- Reconcile protocol-specific asynchronous withdrawals, partial fills, reward accounting, and every possible bounced response in each production adapter.
- Run Acton fuzz, mutation, coverage, and gas suites under Linux/WSL.
- Obtain independent audits of contract code, wrappers, deployment parameters, and frontend transaction decoding.
- Deploy with separate bootstrap and guardian wallets, publish code hashes and initial data, then verify the one-time binding transaction.
- Keep operational spending in a separate capped vault; never add arbitrary transfer to the investment vault.
