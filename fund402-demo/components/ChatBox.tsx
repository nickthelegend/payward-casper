"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ToolStep {
  tool: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
}
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  steps?: ToolStep[];
  error?: string;
}

const SUGGESTIONS = [
  "What are the current pool stats?",
  "Create an agent 'scout', make it Tier 3, and borrow 0.001 F402 through x402",
  "Borrow 0.001 for the treasury agent, then repay it",
];

// Pull a cspr.live link out of a tool result (tools return { explorer } / { deployHash }).
function explorerOf(r?: Record<string, unknown>): string | null {
  if (!r) return null;
  const link = (r.explorer as string) ?? null;
  if (link) return link;
  const hash = (r.deployHash as string) ?? (r.depositDeploy as string) ?? null;
  return hash ? `https://testnet.cspr.live/deploy/${hash}` : null;
}

export function ChatBox() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: ChatMsg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    requestAnimationFrame(() => scroller.current?.scrollTo(0, scroller.current.scrollHeight));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      }).then((r) => r.json());
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: res.reply || "", steps: res.steps || [], error: res.error },
      ]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", content: "", error: e?.message ?? "request failed" }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scroller.current?.scrollTo(0, scroller.current.scrollHeight));
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span className="font-mono text-xs tracking-wide text-zinc-300">
            chat with the agent · <span className="text-emerald-400">Groq</span> · live on Casper
          </span>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">every tool call is a real on-chain action</span>
      </div>

      {/* transcript */}
      <div ref={scroller} className="h-72 space-y-3 overflow-y-auto pr-1">
        {msgs.length === 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-zinc-500">
              Ask the agent to do something on-chain — it decides the tools and runs them live.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-zinc-700 px-3 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-emerald-500 text-black"
                    : "border border-zinc-800 bg-zinc-900/70 text-zinc-200"
                }`}
              >
                {/* tool calls */}
                {m.steps && m.steps.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {m.steps.map((s, j) => {
                      const link = explorerOf(s.result);
                      const failed = s.result && (s.result as any).error;
                      return (
                        <div key={j} className="font-mono text-[11px]">
                          <span className={failed ? "text-rose-400" : "text-amber-300"}>🔧 {s.tool}</span>
                          {link && (
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-emerald-400 hover:underline"
                            >
                              deploy ↗
                            </a>
                          )}
                          {failed ? <span className="ml-2 text-rose-400">✗ {String((s.result as any).error).slice(0, 80)}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                )}
                {m.content && <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>}
                {m.error && <p className="text-xs text-rose-400">⚠ {m.error}</p>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {busy && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
            agent working on-chain… (a borrow/repay takes ~1–2 min to confirm)
          </div>
        )}
      </div>

      {/* input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="e.g. create an agent, make it trusted, and borrow through x402"
          className="flex-1 rounded-lg border border-zinc-700 bg-black/40 px-3 py-2 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-40"
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
