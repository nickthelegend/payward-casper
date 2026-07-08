---
name: fund402-repay-loan
description: Repay the agent's most recent open Fund402 loan on Casper after borrowing to pay an x402 endpoint — no loan id needed (vault repay_latest). Use when an agent has taken JIT credit from the pool (via fund402-pay-x402) and wants to settle it from its earnings — paying principal plus the 5% fee (which becomes LP yield), recovering any collateral, and earning +10 reputation. This is the auto-repay-from-earnings primitive.
metadata:
  author: nickthelegend
  version: "1.1.0"
---

# fund402-repay-loan — repay your newest loan (no loan id)

Settle the loan the agent opened when it borrowed to pay an x402 endpoint. The agent
pays back **principal + a 5% JIT credit fee**; the fee accrues to the pool as **LP
yield**, escrowed collateral is returned, and reputation goes **+10**. It uses the
vault's `repay_latest`, so you **don't need the loan id** — making auto-repay from the
agent's earnings a one-liner.

Read `fund402-overview` first for the model and config.

## Prerequisites

```bash
npm i @nickthelegend69/fund402          # in your working directory
export FUND402_AGENT_PEM=./agent.pem    # the SAME agent that took the loan
```

The agent must hold **≥ principal + 5% fee in F402** — repayment pulls it back from the
agent's balance (the "earnings" it repays with). If it doesn't yet, fund it with F402
first (see `fund402-manage-wallet`).

## Run it

```bash
node repay.mjs [principalBaseUnits]
# e.g. repay a 0.001 F402 loan (default):
node repay.mjs
# or a different principal:
node repay.mjs 1000000
```

`principalBaseUnits` defaults to `1000000` (0.001 F402). The script approves the vault
for principal + fee, then repays the agent's newest loan, printing both deploy hashes.

## What happens

1. `ensureCollateralAllowance` — the agent `approve`s the vault for **principal + fee**.
2. `repayLatestOnChain` — the vault `transfer_from`s principal + fee, marks the loan
   repaid, **adds the fee to the pool (LP yield)**, returns collateral, and credits `+10`.

Reverts if the agent has no open loan, or its F402 balance / allowance is short — the
script reports which.

## In code

```js
import { ensureCollateralAllowance, repayLatestOnChain, waitForDeploy, loadPrivateKey } from "@nickthelegend69/fund402";
const wiring = { network:"casper:casper-test", nodeUrl:"https://node.testnet.casper.network/rpc",
  chainName:"casper-test", vaultContractHash:"ca4086d3…", agentSecretKey:pem, agentPublicKey:pub };
await ensureCollateralAllowance({ ...wiring, assetPackageHash:"389cedc5…" }, { vaultContractHash:"ca4086d3…" }, 1_050_000n); // principal + 5%
const { deployHash } = await repayLatestOnChain(wiring); // no loan id
await waitForDeploy(wiring, deployHash);
```
