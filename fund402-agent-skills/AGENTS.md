# Fund402 skills — for agents

You are working in a repo of **Agent Skills** for [Fund402](https://github.com/nickthelegend/fund402-casper),
a just-in-time credit protocol for AI agents on Casper.

When a task involves paying an x402 / HTTP-402 endpoint, taking or repaying credit,
or creating a pool-settled paid endpoint, **read the relevant skill in `skills/`**:

- `skills/fund402-overview/SKILL.md` — read this first for the model + which skill to use.
- `skills/fund402-pay-x402/SKILL.md` — borrow + pay an x402 endpoint.
- `skills/fund402-repay-loan/SKILL.md` — repay an open loan.
- `skills/fund402-create-paywall/SKILL.md` — create an x402 endpoint settled by the pool.
- `skills/fund402-manage-wallet/SKILL.md` — create/fund wallets, reputation, liquidity.

All actions are **real on-chain** (casper-test) via `@nickthelegend69/fund402`.
Config + the agent key come from environment variables — see each skill and the README.
