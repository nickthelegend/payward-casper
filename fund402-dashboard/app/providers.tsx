"use client";

import { type ReactNode } from "react";

// NOTE: CSPR.click (@make-software/csprclick-react 0.7.4 — the latest) ships a
// bundle that reads a React internal (`ReactCurrentDispatcher`) which resolves
// to `undefined` under Next 15's webpack, throwing at module load on both the
// server and the client. It cannot be initialized here without white-screening
// the whole dashboard. The dashboard's data is read from CSPR.cloud's REST API
// (see /api/stats), so it renders fully without the wallet SDK. Wallet-signed
// deposit/withdraw is therefore disabled in this build; the borrow/settle flow
// is demonstrated wallet-signed in the consumer app + the demo cockpit instead.
export default function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
