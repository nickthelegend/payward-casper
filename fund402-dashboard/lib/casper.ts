// Real on-chain reads for the Fund402 LP dashboard via the CSPR.cloud REST API.
//
// TVL  = the vault's CEP-18 balance (ft-token-ownership for owner=vault).
// Flow = the CEP-18 transfers the vault made to merchants (ft-token-actions),
//        i.e. the JIT payments it fronted for agents.
// No mock data: if CSPR.cloud + the contract hashes aren't configured, callers
// get an explicit "not configured" result instead of fabricated numbers.

export const NETWORK = process.env.NEXT_PUBLIC_NETWORK ?? "casper-test";
export const IS_TESTNET = NETWORK.includes("test");
export const CSPR_CLOUD_REST =
  process.env.CSPR_CLOUD_REST ?? (IS_TESTNET ? "https://api.testnet.cspr.cloud" : "https://api.cspr.cloud");
export const CSPR_CLOUD_API_KEY = process.env.CSPR_CLOUD_API_KEY ?? "";

// Vault identity (set after deploy).
export const VAULT_ACCOUNT_HASH = (process.env.VAULT_ACCOUNT_HASH ?? "").replace(/^account-hash-/, "");
export const ASSET_PACKAGE = process.env.X402_ASSET_PACKAGE ?? "";
export const ASSET_DECIMALS = Number(process.env.X402_ASSET_DECIMALS ?? "9");

export interface PoolStats {
  totalLiquidity: number;
  totalBorrowed: number;
  totalLoans: number;
  utilizationRate: number; // basis points
  configured: boolean;
}

export interface BorrowerRow {
  loanId: number;
  agent: string;
  merchant: string;
  amount: number;
  deployHash: string;
  status: "settled" | "repaid";
  at: string;
}

const headers = (): Record<string, string> =>
  CSPR_CLOUD_API_KEY ? { Authorization: CSPR_CLOUD_API_KEY } : {};
const scale = (raw: string) => Number(BigInt(raw || "0")) / 10 ** ASSET_DECIMALS;

export function notConfiguredReason(): string | null {
  if (!CSPR_CLOUD_API_KEY) return "CSPR_CLOUD_API_KEY not set";
  if (!ASSET_PACKAGE) return "X402_ASSET_PACKAGE not set";
  if (!VAULT_ACCOUNT_HASH) return "VAULT_ACCOUNT_HASH not set";
  return null;
}

/** Vault CEP-18 balance = pool liquidity currently held. */
export async function fetchPoolStats(): Promise<PoolStats> {
  if (notConfiguredReason()) {
    return { totalLiquidity: 0, totalBorrowed: 0, totalLoans: 0, utilizationRate: 0, configured: false };
  }
  let held = 0;
  try {
    const res = await fetch(
      `${CSPR_CLOUD_REST}/accounts/${VAULT_ACCOUNT_HASH}/ft-token-ownership?contract_package_hash=${ASSET_PACKAGE}`,
      { headers: headers() }
    );
    const body = await res.json();
    const row = (body?.data ?? []).find((r: any) =>
      String(r.contract_package_hash).toLowerCase().includes(ASSET_PACKAGE.toLowerCase())
    );
    held = row ? scale(String(row.balance)) : 0;
  } catch {
    /* leave 0 */
  }

  const actions = await fetchVaultActions();
  const totalBorrowed = actions
    .filter((a) => a.status === "settled")
    .reduce((s, a) => s + a.amount, 0);
  const totalLiquidity = held + totalBorrowed; // funds in pool + currently deployed
  const utilizationRate =
    totalLiquidity > 0 ? Math.round((totalBorrowed / totalLiquidity) * 10000) : 0;

  return {
    totalLiquidity,
    totalBorrowed,
    totalLoans: actions.length,
    utilizationRate,
    configured: true,
  };
}

/** CEP-18 transfers FROM the vault = JIT payments it fronted to merchants. */
export async function fetchVaultActions(): Promise<BorrowerRow[]> {
  if (notConfiguredReason()) return [];
  try {
    const res = await fetch(
      `${CSPR_CLOUD_REST}/contract-packages/${ASSET_PACKAGE}/ft-token-actions?page_size=25`,
      { headers: headers() }
    );
    const body = await res.json();
    const rows: any[] = body?.data ?? [];
    return rows
      .filter((r) => String(r.from_hash).toLowerCase() === VAULT_ACCOUNT_HASH.toLowerCase())
      .map((r, i) => ({
        loanId: i,
        agent: short(String(r.from_hash)),
        merchant: short(String(r.to_hash)),
        amount: scale(String(r.amount)),
        deployHash: String(r.deploy_hash),
        status: "settled" as const,
        at: r.timestamp,
      }));
  } catch {
    return [];
  }
}

export function explorerTx(deployHash: string): string {
  return `https://cspr.live/deploy/${deployHash}?network=${NETWORK}`;
}

function short(h: string, n = 6): string {
  return h.length <= n * 2 ? h : `${h.slice(0, n)}…${h.slice(-4)}`;
}
