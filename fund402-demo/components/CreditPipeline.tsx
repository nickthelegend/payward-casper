"use client";

import { motion } from "framer-motion";
import type { StepId } from "@/lib/flow";

// Four macro-stages the JIT-credit flow passes through. Each granular SDK event
// maps to one stage; the stage lights up + a pulse travels to it when reached.
const STAGES = [
  { key: "agent", label: "AI Agent", sub: "wallet: 0 CSPR", glyph: "◎", color: "#34d399" },
  { key: "paywall", label: "x402 Paywall", sub: "402 required", glyph: "⊘", color: "#60a5fa" },
  { key: "vault", label: "Fund402 Vault", sub: "fronts the payment", glyph: "▲", color: "#f59e0b" },
  { key: "casper", label: "Casper", sub: "settled on-chain", glyph: "◆", color: "#f43f5e" },
] as const;

const STEP_STAGE: Record<StepId, number> = {
  request: 0,
  intercepted_402: 1,
  simulating_borrow: 1,
  signing_authorization: 2,
  borrow_submitted: 2,
  facilitator_settle: 3,
  request_retried: 3,
  data_received: 3,
};

export function CreditPipeline({
  firedSteps,
  activeStep,
  done,
}: {
  firedSteps: StepId[];
  activeStep: StepId | null;
  done: boolean;
}) {
  const reached = new Set(firedSteps.map((s) => STEP_STAGE[s]));
  const activeStage = activeStep != null ? STEP_STAGE[activeStep] : -1;

  return (
    <div className="relative">
      <div className="flex items-stretch justify-between gap-2">
        {STAGES.map((stage, i) => {
          const isReached = reached.has(i);
          const isActive = activeStage === i;
          return (
            <div key={stage.key} className="flex flex-1 items-center">
              {/* node */}
              <motion.div
                className="relative flex-1 rounded-2xl border p-4 text-center"
                animate={{
                  borderColor: isReached ? stage.color : "#272d3b",
                  backgroundColor: isActive ? `${stage.color}1a` : "rgba(9,11,17,0.6)",
                  scale: isActive ? 1.04 : 1,
                }}
                transition={{ type: "spring", stiffness: 240, damping: 20 }}
              >
                {isActive && (
                  <motion.span
                    className="absolute inset-0 rounded-2xl"
                    style={{ boxShadow: `0 0 26px 2px ${stage.color}` }}
                    animate={{ opacity: [0.25, 0.7, 0.25] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                  />
                )}
                <div
                  className="mx-auto flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold"
                  style={{
                    color: isReached ? "#06070d" : stage.color,
                    background: isReached ? stage.color : "transparent",
                    border: `2px solid ${stage.color}`,
                  }}
                >
                  {stage.glyph}
                </div>
                <div className="mt-2 text-sm font-semibold" style={{ color: isReached ? "#e6e9ef" : "#8a93a6" }}>
                  {stage.label}
                </div>
                <div className="text-[11px] text-zinc-500">{stage.sub}</div>
              </motion.div>

              {/* connector wire + traveling pulse */}
              {i < STAGES.length - 1 && (
                <div className="relative mx-1 h-1 w-8 shrink-0 rounded-full bg-zinc-800 sm:w-14">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ background: stage.color }}
                    animate={{ width: reached.has(i + 1) ? "100%" : "0%" }}
                    transition={{ duration: 0.5 }}
                  />
                  {activeStage === i + 1 && (
                    <motion.span
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                      style={{ background: STAGES[i + 1].color }}
                      initial={{ left: "0%" }}
                      animate={{ left: ["0%", "100%"] }}
                      transition={{ duration: 0.6, repeat: Infinity }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {done && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 text-center text-xs font-medium text-emerald-400"
        >
          ✓ Paywall cleared — loan fronted and settled on Casper in one autonomous pass
        </motion.div>
      )}
    </div>
  );
}
