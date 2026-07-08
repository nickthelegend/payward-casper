import { NextResponse } from "next/server";
import { fetchPoolStats, fetchVaultActions, notConfiguredReason } from "@/lib/casper";

// Real on-chain reads via CSPR.cloud. Returns configured:false (not fake data)
// when the vault/asset/api-key aren't set yet.
export async function GET() {
  const reason = notConfiguredReason();
  if (reason) {
    return NextResponse.json({ configured: false, reason, stats: null, borrowers: [] });
  }
  const [stats, borrowers] = await Promise.all([fetchPoolStats(), fetchVaultActions()]);
  return NextResponse.json({ configured: true, stats, borrowers });
}
