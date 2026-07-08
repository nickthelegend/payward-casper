"use client";

import { useCallback, useEffect, useState } from "react";
import { explorerTx, type PoolStats, type BorrowerRow } from "@/lib/casper";
import { depositLiquidity, withdrawLiquidity, toBaseUnits, type ClickLike } from "@/lib/tx";
import { useCsprClick } from "@/lib/csprclick";

const fmtUnits = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function Dashboard() {
  // Wallet via the CSPR.click CDN client (see lib/csprclick.ts) — connect,
  // active account, and the clickRef used to sign deposit/withdraw deploys.
  const { account, connect: signIn, disconnect, clickRef: click } = useCsprClick();
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [borrowers, setBorrowers] = useState<BorrowerRow[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string>("");
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(!!d.configured);
        setReason(d.reason ?? "");
        if (d.stats) setStats(d.stats);
        if (d.borrowers) setBorrowers(d.borrowers);
      })
      .catch((e) => {
        setConfigured(false);
        setReason(String(e));
      });
  };
  useEffect(load, []);

  const connected = !!account;
  const utilization = stats ? (stats.utilizationRate / 100).toFixed(1) : "—";

  const connect = () => (connected ? disconnect() : signIn());

  const runTx = useCallback(
    async (kind: "deposit" | "withdraw") => {
      if (!click) return;
      setErr(null);
      setTxHash(null);
      setBusy(kind);
      try {
        const units = toBaseUnits(amount);
        if (units <= 0n) throw new Error("Enter an amount greater than 0.");
        const fn = kind === "deposit" ? depositLiquidity : withdrawLiquidity;
        const hash = await fn(click as unknown as ClickLike, units);
        setTxHash(hash || null);
        load();
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setBusy(null);
      }
    },
    [click, amount]
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-emerald-400">Casper {NETWORK()} · Fund402 Vault</p>
          <h1 className="text-3xl font-bold">Liquidity Dashboard</h1>
          <p className="mt-1 text-zinc-400">
            Provide CEP-18 liquidity that funds Just-In-Time loans for autonomous AI agents.
          </p>
        </div>
        <button
          onClick={connect}
          disabled={!click}
          title={click ? account ?? undefined : "Loading CSPR.click…"}
          className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
        >
          {connected ? `${account!.slice(0, 6)}…${account!.slice(-4)}` : "Connect CSPR.click"}
        </button>
      </header>

      {configured === false && (
        <div className="mt-8 rounded-xl border border-amber-600/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <strong>Live data not configured.</strong> Set <code className="font-mono">CSPR_CLOUD_API_KEY</code>,{" "}
          <code className="font-mono">VAULT_ACCOUNT_HASH</code> and{" "}
          <code className="font-mono">X402_ASSET_PACKAGE</code> in <code>.env.local</code> after deploying.
          {reason ? <span className="block mt-1 opacity-80">Reason: {reason}</span> : null}
        </div>
      )}

      {/* Treasury metrics (real or em-dash until configured) */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Value Locked" value={stats ? fmtUnits(stats.totalLiquidity) : "—"} accent />
        <Stat label="Capital Deployed" value={stats ? fmtUnits(stats.totalBorrowed) : "—"} />
        <Stat label="Utilization" value={stats ? `${utilization}%` : "—"} />
        <Stat label="JIT Loans" value={stats ? String(stats.totalLoans) : "—"} accent />
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {/* Deposit / withdraw */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold">Provide Liquidity</h2>
          <p className="mt-1 text-sm text-zinc-400">Deposit CEP-18 into the Fund402 vault.</p>
          <div className="mt-5">
            <label className="text-xs uppercase tracking-wide text-zinc-500">Amount</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/40 px-3 py-2 font-mono text-lg outline-none focus:border-emerald-500"
            />
          </div>
          <div className="mt-4 flex gap-3">
            <button
              disabled={!connected || busy !== null}
              onClick={() => runTx("deposit")}
              className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black disabled:opacity-40 hover:bg-emerald-400"
            >
              {busy === "deposit" ? "Signing…" : "Deposit"}
            </button>
            <button
              disabled={!connected || busy !== null}
              onClick={() => runTx("withdraw")}
              className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 font-semibold disabled:opacity-40 hover:bg-zinc-800"
            >
              {busy === "withdraw" ? "Signing…" : "Withdraw"}
            </button>
          </div>
          {!connected && (
            <p className="mt-3 text-xs text-zinc-500">Connect CSPR.click to deposit or withdraw.</p>
          )}
          {txHash && (
            <a
              href={explorerTx(txHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block break-all font-mono text-xs text-emerald-400 hover:underline"
            >
              submitted: {txHash.slice(0, 12)}… ↗
            </a>
          )}
          {err && <p className="mt-3 break-words text-xs text-rose-400">{err}</p>}
          <p className="mt-3 text-xs text-zinc-500">
            Deposit signs an <code className="font-mono">approve</code> + <code className="font-mono">deposit_liquidity</code>{" "}
            via CSPR.click — no keys in the browser.
          </p>
        </div>

        {/* Borrower directory */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Live Borrower Activity</h2>
            <button onClick={load} className="text-xs text-emerald-400 hover:underline">
              refresh
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            {borrowers.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">
                {configured ? "No JIT loans settled yet." : "Configure the vault to stream activity."}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="pb-2">Agent (vault)</th>
                    <th className="pb-2">Merchant</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">When</th>
                    <th className="pb-2">Deploy</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {borrowers.map((b) => (
                    <tr key={b.deployHash} className="border-t border-zinc-800/70">
                      <td className="py-2">{b.agent}</td>
                      <td className="py-2">{b.merchant}</td>
                      <td className="py-2">{b.amount}</td>
                      <td className="py-2 text-zinc-400">{new Date(b.at).toLocaleTimeString()}</td>
                      <td className="py-2">
                        <a
                          href={explorerTx(b.deployHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:underline"
                        >
                          {b.deployHash.slice(0, 8)}↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <footer className="mt-12 text-sm text-zinc-500">
        Fund402 · reads via CSPR.cloud REST · writes via CSPR.click — gateway{" "}
        <span className="font-mono">:3005</span>, demo <span className="font-mono">:3006</span>
      </footer>
    </main>
  );
}

function NETWORK() {
  return (process.env.NEXT_PUBLIC_NETWORK ?? "testnet").includes("test") ? "Testnet" : "Mainnet";
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${accent ? "text-emerald-400" : "text-zinc-100"}`}>
        {value}
      </div>
    </div>
  );
}
