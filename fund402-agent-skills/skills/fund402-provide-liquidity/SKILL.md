---
name: fund402-provide-liquidity
description: Provide liquidity to the Fund402 lending pool on Casper and earn yield. Use when you want to act as an LP — deposit CEP-18 (F402) to back agents' just-in-time borrows, earn the 5% JIT credit fee that accrues on every repayment, and withdraw more than you deposited. Deposits mint shares; as fees pile up each share redeems for more. Covers deposit, withdraw, and reading your position.
metadata:
  author: nickthelegend
  version: "1.0.0"
---

# fund402-provide-liquidity — be an LP, earn yield

Back the Fund402 pool that fronts agents' x402 payments, and **earn yield**. The vault
charges a **5% JIT credit fee** on every borrow; on repayment the fee accrues to the
pool, so the shares you got on deposit redeem for **more than you put in**.

Read `fund402-overview` first for the model and config.

## Prerequisites

```bash
npm i @nickthelegend69/fund402          # in your working directory
export FUND402_AGENT_PEM=./lp.pem       # the LP's ed25519 secret key (holds F402 + a little CSPR)
export CSPR_CLOUD_API_KEY=...           # optional — to read your F402 balance / measure yield
```

The LP must hold F402 to deposit and a little CSPR for gas. Mint/fund F402 via
`fund402-manage-wallet`.

## Run it

```bash
node liquidity.mjs deposit  2000000     # deposit 0.002 F402 → minted as shares
# … agents borrow + repay; the 5% fee accrues to the pool …
node liquidity.mjs withdraw 2000000     # burn your shares → receive MORE than you deposited
node liquidity.mjs balance              # your F402 balance (needs CSPR key)
```

`deposit` approves the vault then calls `deposit_liquidity`. `withdraw` burns the given
number of **shares** and returns the CEP-18 they now redeem for (principal + earned
yield), and — with a CSPR key set — reports how much F402 you received.

## How the yield works

- Deposit `amount` → you're minted shares at the current share price
  (`shares = amount * total_shares / total_liquidity`; 1:1 for an empty pool).
- Each borrow books a 5% fee; on repayment the fee is added to `total_liquidity` while
  shares stay constant → every share is now worth more.
- Withdraw `shares` → you receive `shares * total_liquidity / total_shares` — more than
  you deposited. Later LPs depositing after yield get fewer shares, so they can't dilute
  what you earned.

**Proven live (casper-test):** an LP deposited `2_000_000`, one borrow+repay cycle
accrued the fee, and the LP withdrew `2_050_000` — `+50_000` realized yield.
[repay `80e90a43…`](https://testnet.cspr.live/deploy/80e90a43120b40524038a405088f3f83c4ce45674a9ff3e28c577a20552cba9e) ·
[withdraw `44318b5b…`](https://testnet.cspr.live/deploy/44318b5b303dab8dbbb3c3b26ac0f148bf7b44701996fbd446f17f9f7622023c)

## In code

```js
import { ensureCollateralAllowance, depositLiquidityOnChain, withdrawLiquidityOnChain, waitForDeploy } from "@nickthelegend69/fund402";
await ensureCollateralAllowance({ ...wiring, assetPackageHash: ASSET }, { vaultContractHash: VAULT }, 2_000_000n);
await depositLiquidityOnChain(wiring, 2_000_000n);   // mints shares
// … later …
await withdrawLiquidityOnChain(wiring, 2_000_000n);  // burns shares → principal + yield
```
