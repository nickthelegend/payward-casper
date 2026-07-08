"use client";

import dynamic from "next/dynamic";

// The dashboard uses CSPR.click's `useClickRef` hook, and CSPR.click is a
// browser-only SDK that crashes when evaluated on the server (it reads a React
// 18 internal at module load). Load the whole dashboard client-side only.
const DashboardClient = dynamic(() => import("./DashboardClient"), {
  ssr: false,
  loading: () => (
    <main className="mx-auto max-w-6xl px-6 py-12 text-zinc-500">Loading liquidity dashboard…</main>
  ),
});

export default function Page() {
  return <DashboardClient />;
}
