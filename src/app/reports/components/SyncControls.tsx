"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Header "Refresh" button: runs a sync for the org (rate-limited server-side), then re-renders the report. */
export function RefreshButton({ running }: { running: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      setMsg(res.ok ? { text: "Data refreshed.", error: false } : { text: body.error ?? "Refresh failed.", error: true });
      router.refresh();
    } catch {
      setMsg({ text: "Refresh failed. Check your connection and try again.", error: true });
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || running;
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button type="button" onClick={refresh} disabled={disabled} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff", cursor: disabled ? "default" : "pointer", fontSize: 13, color: disabled ? "#98a2b3" : "#1a1a1a" }}>
        {disabled ? "Refreshing…" : "Refresh"}
      </button>
      {msg && <span style={{ fontSize: 12, color: msg.error ? "#b42318" : "#067647" }}>{msg.text}</span>}
    </span>
  );
}

/**
 * "Preparing your data…": shown when this org has never been synced. Starts the first sync once (only in this
 * situation; normal page opens never sync) and re-checks every 15 seconds until data is available.
 */
export function PreparingData({ running }: { running: boolean }) {
  const router = useRouter();
  const started = useRef(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!started.current && !running) {
      started.current = true;
      fetch("/api/sync", { method: "POST" })
        .then(async (res) => { if (!res.ok && res.status !== 429) setNote((await res.json().catch(() => ({}))).error ?? "Couldn't start the data sync."); })
        .catch(() => setNote("Couldn't start the data sync."))
        .finally(() => router.refresh());
    }
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [router, running]);
  return (
    <div style={{ background: "#fff", border: "1px solid #e4e7ec", borderRadius: 12, padding: 32, textAlign: "center" }}>
      <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 6 }}>Preparing your data…</div>
      <div style={{ color: "#667085" }}>We&apos;re loading your MeasureSquare CRM data for the first time. This can take a few minutes; this page updates automatically.</div>
      {note && <div style={{ color: "#b42318", marginTop: 10, fontSize: 14 }}>{note}</div>}
    </div>
  );
}
