"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FLOW, type StepId, type DemoResult } from "@/lib/flow";
import { CreditPipeline } from "@/components/CreditPipeline";

const MISSIONS = [
  { id: "btc", label: "Arbitrage bot", task: "Fetch BTC-USD spot to price a trade", q: "BTC-USD spot" },
  { id: "cspr", label: "Treasury agent", task: "Get the live CSPR-USD price", q: "CSPR-USD price" },
  { id: "eth", label: "Yield router", task: "Read ETH-USD before rebalancing", q: "ETH-USD price" },
];

export default function Demo() {
  const [mission, setMission] = useState(MISSIONS[0]);
  const [running, setRunning] = useState(false);
  const [fired, setFired] = useState<StepId[]>([]);
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const [log, setLog] = useState<{ id: StepId; t: string }[]>([]);
  const [result, setResult] = useState<DemoResult | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setFired([]);
    setActiveStep(null);
    setLog([]);
    setResult(null);
  };

  const run = useCallback(async () => {
    reset();
    setRunning(true);

    // Call the REAL agent: it borrows from the vault, settles on Casper, replays.
    const r: DemoResult = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: mission.q }),
    })
      .then((res) => res.json())
      .catch(() => ({ configured: false, reason: "request to /api/agent failed" }));

    // Reveal the events that actually fired (canonical order), with the result
    // pinned to the end so the settlement card only shows real on-chain data.
    const order = FLOW.map((s) => s.id);
    const fireOrder = (r.events ?? ["request"]).slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));

    fireOrder.forEach((id, i) => {
      const step = FLOW.find((s) => s.id === id);
      const t = setTimeout(() => {
        setActiveStep(id);
        setFired((f) => (f.includes(id) ? f : [...f, id]));
        if (step) setLog((l) => [...l, { id, t: step.detail }]);
      }, 520 * i);
      timers.current.push(t);
    });

    const doneT = setTimeout(() => {
      setActiveStep(null);
      setResult(r);
      setRunning(false);
    }, 520 * fireOrder.length + 250);
    timers.current.push(doneT);
  }, [mission]);

  const price = pickPrice(result?.data);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {/* header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-widest text-emerald-400">FUND402 · CASPER · x402</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Live JIT Credit</h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1 font-mono text-zinc-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> casper-test
          </span>
          <span className="rounded-full border border-amber-600/50 bg-amber-500/10 px-3 py-1 font-mono text-amber-300">
            Tier 1 · new agent
          </span>
        </div>
      </header>

      <p className="mt-3 max-w-2xl text-zinc-400">
        An autonomous agent with an <span className="text-rose-300">empty wallet</span> hits a paid
        endpoint. Fund402 fronts the CEP-18 payment as a just-in-time loan, settles it on Casper, and
        hands back the data — no human, no pre-funding.
      </p>

      {/* agent + mission */}
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="text-xs uppercase tracking-wide text-zinc-500">The agent</div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-lg">◎</div>
            <div>
              <div className="font-mono text-sm text-zinc-200">agent-0x7f…a3</div>
              <div className="font-mono text-xs text-zinc-500">CSPR.cloud · ed25519</div>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <motion.span
              className="font-mono text-3xl font-bold text-rose-400"
              animate={{ opacity: [1, 0.55, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              0.00
            </motion.span>
            <span className="text-sm text-zinc-400">CSPR — can't pay</span>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="text-xs uppercase tracking-wide text-zinc-500">The mission</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {MISSIONS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMission(m)}
                className={`rounded-full px-3 py-1 text-xs ${
                  mission.id === m.id ? "bg-emerald-500 text-black" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-zinc-300">“{mission.task}”</p>
          <button
            onClick={run}
            disabled={running}
            className="mt-4 w-full rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {running ? "Agent working…" : "▶ Dispatch agent"}
          </button>
        </div>
      </div>

      {/* pipeline */}
      <div className="mt-6 rounded-2xl border border-zinc-800 bg-black/30 p-6">
        <CreditPipeline firedSteps={fired} activeStep={activeStep} done={!running && fired.length > 1} />
      </div>

      {/* console + settlement */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* live console */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="ml-2 font-mono text-xs text-zinc-500">agent.log</span>
          </div>
          <div className="h-56 space-y-1.5 overflow-y-auto font-mono text-xs">
            <AnimatePresence initial={false}>
              {log.length === 0 && (
                <p className="text-zinc-600">▸ awaiting dispatch…</p>
              )}
              {log.map((l, i) => (
                <motion.div
                  key={`${l.id}-${i}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex gap-2 text-zinc-300"
                >
                  <span className="text-emerald-500">▸</span>
                  <span>{l.t}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* settlement */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Settlement</div>

          {!result ? (
            <p className="text-sm text-zinc-500">Dispatch the agent to front a CEP-18 micropayment and settle on Casper.</p>
          ) : result.configured === false ? (
            <div className="space-y-2 rounded-lg border border-sky-600/40 bg-sky-500/10 p-3 text-sm text-sky-200">
              <div className="font-semibold">Flow preview (not yet live)</div>
              <p className="opacity-90">
                The pipeline above shows the real flow. To settle on Casper, deploy the vault + fund the
                agent (see <span className="font-mono">fund402/SETUP.md</span>), then dispatch again.
              </p>
              {result.reason && <p className="font-mono text-[11px] opacity-70">{result.reason}</p>}
            </div>
          ) : result.error ? (
            <div className="space-y-2 rounded-lg border border-rose-600/40 bg-rose-500/10 p-3 text-sm text-rose-200">
              <div className="font-semibold">Agent run failed</div>
              <p className="break-words opacity-90">{result.error}</p>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="font-semibold">Loan fronted · settled on Casper</span>
              </div>

              {price && (
                <div className="rounded-lg border border-zinc-800 bg-black/40 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">Data the agent paid for</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-emerald-300">{price}</div>
                </div>
              )}

              <div>
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">Casper deploy</div>
                {result.deployHash ? (
                  <a
                    href={result.explorerUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-mono text-sm text-emerald-400 hover:underline"
                  >
                    {result.deployHash} ↗
                  </a>
                ) : (
                  <span className="text-sm text-zinc-400">settled (hash not captured)</span>
                )}
              </div>

              {/* reputation reward */}
              <div>
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-zinc-500">
                  <span>Reputation</span>
                  <span className="text-emerald-400">+10 on-time</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <motion.div
                    className="h-full rounded-full bg-emerald-400"
                    initial={{ width: 0 }}
                    animate={{ width: "20%" }}
                    transition={{ duration: 0.8 }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  10 / 50 to Tier 2 — at Tier 3 the agent borrows with zero collateral.
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <footer className="mt-10 text-center text-xs text-zinc-500">
        Powered by <span className="font-mono">@fund402/agent-sdk</span> · casper-x402 facilitator · Buildathon 2026
      </footer>
    </main>
  );
}

// Pull a human price string out of whatever the upstream returned (Coinbase shape
// { data: { amount, currency } }, or a generic { amount }/{ price } object).
function pickPrice(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d: any = data;
  const amount = d?.data?.amount ?? d?.amount ?? d?.price ?? null;
  const cur = d?.data?.currency ?? d?.currency ?? "USD";
  if (amount == null) return null;
  const n = Number(amount);
  return Number.isFinite(n) ? `$${n.toLocaleString()} ${cur}` : `${amount} ${cur}`;
}
