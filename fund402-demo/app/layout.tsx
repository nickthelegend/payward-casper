import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fund402 — Live JIT Loan Demo",
  description: "Watch an AI agent borrow, settle on Casper, and break a paywall in real time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
