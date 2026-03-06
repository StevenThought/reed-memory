"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type Session = {
  id: string;
  shortId: string;
  createdAt: string;
  lastActiveAt: string;
  messageCount: number;
};

type Flagged = {
  id: string;
  sessionShortId: string;
  createdAt: string;
};

type AuditEntry = {
  id: string;
  action: string;
  ip: string;
  details: string | null;
  createdAt: string;
};

type DashData = {
  totalSessions: number;
  activeSessions: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  estimatedCost: number;
  sessions: Session[];
  flagged: Flagged[];
  totalInjectionAttempts: number;
  auditLogs: AuditEntry[];
};

export default function AdminPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin");
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (res.ok) setData(await res.json());
    } catch { /* */ }
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function deleteSession(sessionId: string) {
    if (!confirm(`Delete session ${sessionId.slice(0, 8)}...? This cannot be undone.`)) return;
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", sessionId }),
    });
    if (res.status === 401) { router.push("/admin/login"); return; }
    if (res.ok) fetchData();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  const s: React.CSSProperties = {
    fontFamily: "monospace",
    background: "#0a0f1a",
    color: "#c8d0e0",
    minHeight: "100vh",
    padding: "32px",
    fontSize: "13px",
  };

  if (loading && !data) {
    return (
      <div style={{ ...s, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#556" }}>loading...</div>
      </div>
    );
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const label: React.CSSProperties = {
    fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#556", marginBottom: "6px",
  };
  const stat: React.CSSProperties = {
    fontSize: "28px", fontWeight: 700, color: "#fff",
  };
  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    padding: "16px 20px",
  };
  const btn: React.CSSProperties = {
    background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "4px",
    padding: "3px 10px", color: "#8a9ab5", cursor: "pointer", fontFamily: "monospace", fontSize: "11px",
  };

  return (
    <div style={s}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#556" }}>
          REED ADMIN
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={fetchData} disabled={loading} style={btn}>{loading ? "..." : "refresh"}</button>
          <button onClick={logout} style={{ ...btn, color: "#ff6b6b", borderColor: "rgba(255,100,100,0.2)" }}>logout</button>
        </div>
      </div>

      {data && (
        <>
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px", marginBottom: "32px" }}>
            <div style={card}>
              <div style={label}>Total Conversations</div>
              <div style={stat}>{data.totalSessions}</div>
            </div>
            <div style={card}>
              <div style={label}>Active Now</div>
              <div style={stat}>{data.activeSessions}</div>
            </div>
            <div style={card}>
              <div style={label}>Total Messages</div>
              <div style={stat}>{data.totalMessages}</div>
            </div>
            <div style={card}>
              <div style={label}>Est. API Cost</div>
              <div style={stat}>${data.estimatedCost.toFixed(2)}</div>
            </div>
            <div style={card}>
              <div style={label}>Injection Attempts</div>
              <div style={{ ...stat, color: data.totalInjectionAttempts > 0 ? "#ff6b6b" : "#fff" }}>{data.totalInjectionAttempts}</div>
            </div>
          </div>

          {/* Flagged attempts — session and time only, no content */}
          {data.flagged.length > 0 && (
            <div style={{ marginBottom: "32px" }}>
              <div style={{ ...label, marginBottom: "12px" }}>Recent Injection Attempts</div>
              {data.flagged.map((f) => (
                <div key={f.id} style={{
                  ...card, marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ color: "#ff6b6b" }}>[{f.sessionShortId}...]</span>
                  <span style={{ color: "#556", fontSize: "11px" }}>
                    {timeAgo(f.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Session list — stats only, no content */}
          <div style={{ marginBottom: "32px" }}>
            <div style={{ ...label, marginBottom: "12px" }}>Recent Conversations</div>
            {data.sessions.map((sess) => (
              <div key={sess.id} style={{
                ...card, marginBottom: "8px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ color: "#6a8ccc" }}>{sess.shortId}...</span>
                    <span style={{ color: "#556", fontSize: "11px" }}>{sess.messageCount} msgs</span>
                    <span style={{ color: "#445", fontSize: "11px" }}>{timeAgo(sess.lastActiveAt)}</span>
                  </div>
                </div>
                <div style={{ marginLeft: "16px", flexShrink: 0 }}>
                  <button onClick={() => deleteSession(sess.id)} style={{ ...btn, color: "#ff6b6b", borderColor: "rgba(255,100,100,0.2)" }}>
                    delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Audit log */}
          {data.auditLogs.length > 0 && (
            <div style={{ marginBottom: "32px" }}>
              <div style={{ ...label, marginBottom: "12px" }}>Audit Log</div>
              {data.auditLogs.map((entry) => (
                <div key={entry.id} style={{
                  ...card, marginBottom: "6px", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{
                      color: entry.action.includes("fail") ? "#ff6b6b"
                        : entry.action === "login_success" ? "#6bcc6b"
                        : entry.action === "session_delete" ? "#cc8a6b"
                        : "#8a9ab5",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}>
                      {entry.action}
                    </span>
                    {entry.details && <span style={{ color: "#445", fontSize: "11px" }}>{entry.details}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                    <span style={{ color: "#334", fontSize: "10px" }}>{entry.ip}</span>
                    <span style={{ color: "#445", fontSize: "11px" }}>{timeAgo(entry.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
