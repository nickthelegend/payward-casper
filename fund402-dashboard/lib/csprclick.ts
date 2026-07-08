"use client";
/**
 * CSPR.click integration via the CDN client (global `window.csprclick`).
 *
 * The `@make-software/csprclick-react` npm package (0.7.4, the latest) reads a
 * React-18 internal that Next 15's webpack resolves to `undefined`, crashing the
 * whole app. So — exactly like the consumer app — we skip the React wrapper and
 * load the CSPR.click client from the CDN as a global, then drive it imperatively.
 * No React internals, no bundler coupling: works on any Next/React.
 *
 * Docs: https://docs.cspr.click — events csprclick:loaded / :signed_in /
 * :switched_account / :disconnected; methods signIn(), signOut(),
 * getActiveAccount(), getActivePublicKey(), send(deploy, publicKey, wait).
 */
import { useCallback, useEffect, useState } from "react";
import type { ClickLike } from "./tx";

const APP_ID = process.env.NEXT_PUBLIC_CSPR_CLICK_APP_ID ?? "fund402-dashboard";
const CLIENT_SRC = "https://cdn.cspr.click/ui/v2.1.0/csprclick-client-2.1.0.js";

interface CsprClickAccount {
  public_key: string | null;
  provider?: string;
}
interface CsprClickGlobal {
  on(event: string, cb: (evt: { account?: CsprClickAccount }) => void): void;
  off?(event: string, cb: (evt: { account?: CsprClickAccount }) => void): void;
  signIn(): void;
  signOut?(): void;
  disconnect?(from?: string): void;
  getActiveAccount?(): CsprClickAccount | null;
  getActivePublicKey?(): Promise<string | undefined> | string | undefined;
  send(
    deployJson: string | object,
    signingPublicKey: string,
    waitProcessing?: boolean,
    timeout?: number
  ): Promise<{ deployHash?: string; deploy_hash?: string } | undefined>;
}
declare global {
  interface Window {
    csprclick?: CsprClickGlobal;
    clickSDKOptions?: unknown;
    __csprclickLoading?: boolean;
  }
}

/** Inject the CSPR.click client once (idempotent, client-side only). */
const UI_CONTAINER_ID = "csprclick-navbar";

export function ensureCsprClick(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;

  // The client reads TWO globals (bare references — undefined throws before init):
  //  · clickSDKOptions — the SDK config (appId, providers, network mode)
  //  · clickUIOptions  — the UI config; `uiContainer` names the element the
  //    client mounts its React root into (createRoot → must already exist).
  w.clickSDKOptions ??= {
    appName: "Fund402",
    appId: APP_ID,
    contentMode: "iframe",
    providers: ["casper-wallet", "casper-signer", "ledger", "metamask-snap"],
  };
  w.clickUIOptions ??= {
    uiContainer: UI_CONTAINER_ID,
    rootAppElement: "body",
    showTopBar: false,
    accountMenuItems: [],
    defaultTheme: "dark",
  };

  // The mount element must exist before the script runs its createRoot().
  if (!document.getElementById(UI_CONTAINER_ID)) {
    const d = document.createElement("div");
    d.id = UI_CONTAINER_ID;
    document.body.appendChild(d);
  }

  if (window.csprclick || window.__csprclickLoading) return;
  if (document.querySelector(`script[src="${CLIENT_SRC}"]`)) return;
  window.__csprclickLoading = true;
  const s = document.createElement("script");
  s.src = CLIENT_SRC;
  s.async = true;
  document.head.appendChild(s);
}

/** ClickLike adapter (used by lib/tx.ts) backed by the global client. */
function adapter(): ClickLike {
  return {
    async getActivePublicKey() {
      const c = window.csprclick;
      if (!c) return undefined;
      if (c.getActivePublicKey) return await c.getActivePublicKey();
      return c.getActiveAccount?.()?.public_key ?? undefined;
    },
    async send(json, pub, wait, timeout) {
      return window.csprclick!.send(json, pub, wait, timeout);
    },
  };
}

/** React hook: tracks the connected account + connect/disconnect + a tx clickRef. */
export function useCsprClick() {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    ensureCsprClick();
    let click: CsprClickGlobal | undefined;
    const onSignedIn = (evt: { account?: CsprClickAccount }) =>
      setAccount(evt?.account?.public_key ?? null);
    const onSwitched = (evt: { account?: CsprClickAccount }) =>
      setAccount(evt?.account?.public_key ?? null);
    const onDisconnected = () => setAccount(null);

    const attach = () => {
      click = window.csprclick;
      if (!click) return;
      setReady(true);
      setAccount(click.getActiveAccount?.()?.public_key ?? null);
      click.on("csprclick:signed_in", onSignedIn);
      click.on("csprclick:switched_account", onSwitched);
      click.on("csprclick:disconnected", onDisconnected);
    };

    if (window.csprclick) attach();
    else window.addEventListener("csprclick:loaded", attach, { once: true });

    return () => {
      window.removeEventListener("csprclick:loaded", attach);
      if (click?.off) {
        click.off("csprclick:signed_in", onSignedIn);
        click.off("csprclick:switched_account", onSwitched);
        click.off("csprclick:disconnected", onDisconnected);
      }
    };
  }, []);

  const connect = useCallback(() => window.csprclick?.signIn(), []);
  const disconnect = useCallback(() => {
    try {
      const c = window.csprclick;
      (c?.signOut ?? c?.disconnect)?.call(c);
    } catch {
      /* ignore */
    }
    setAccount(null);
  }, []);

  return { ready, account, connect, disconnect, clickRef: ready ? adapter() : null };
}
