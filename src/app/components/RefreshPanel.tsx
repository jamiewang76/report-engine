"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DataStatus } from "@/lib/orgs";

/** Shows when the org's data was last refreshed. Only syncs when the button is clicked — never on page load. */
export default function RefreshPanel({ status }: { status: DataStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(
    status.lastError ? { text: status.lastError, error: true } : null,
  );
  // Format in the viewer's own timezone (after mount, so server and client HTML match).
  const [when, setWhen] = useState<string | null>(null);
  useEffect(() => {
    setWhen(status.lastRefreshedAt ? new Date(status.lastRefreshedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null);
  }, [status.lastRefreshedAt]);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ text: body.error ?? "Refresh failed.", error: true });
      else setMessage({ text: "Data refreshed.", error: false });
      router.refresh();
    } catch {
      setMessage({ text: "Refresh failed. Check your connection and try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  const running = busy || status.running;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, color: "#666" }}>Data last refreshed</div>
        <div style={{ fontWeight: 600 }}>
          {status.lastRefreshedAt ? (when ?? "…") : "Never. Click Refresh to load your CRM data."}
        </div>
        {message && <div style={{ fontSize: 13, marginTop: 4, color: message.error ? "#b42318" : "#067647" }}>{message.text}</div>}
      </div>
      <button
        onClick={refresh}
        disabled={running}
        style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #1f4fd1", background: running ? "#e8edfb" : "#1f4fd1", color: running ? "#1f4fd1" : "#fff", cursor: running ? "default" : "pointer", fontSize: 14 }}
      >
        {running ? "Refreshing… (can take a few minutes)" : "Refresh data now"}
      </button>
    </div>
  );
}
