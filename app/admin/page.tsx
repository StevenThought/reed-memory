"use client";

import { useState, useCallback } from "react";

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
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(false);

  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    "x-admin-password": password,
  }), [password]);

  async function login() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin", { headers: headers() });
      if (res.status === 401) {
        setError("wrong password");
        setLoading(false);
        return;
      }
      if (res.status === 429) {
        const d = await res.json();
        setError(d.message || "too many attempts");
        setLoading(false);
        return;
      }
      const d = await res.json();
      setData(d);
      setAuthed(true);
    } catch {
      setError("failed to connect");
    }
    setLoading(false);
  }

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin", { headers: headers() });
      if (res.ok) setData(await res.json());
    } catch { /* */ }
    setLoading(false);
  }

  async function deleteSession(sessionId: string) {
    if (!confirm(`Delete session ${sessionId.slice(0, 8)}...? This cannot be undone.`)) return;
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ action: "delete", sessionId }),
    });
    if (res.ok) refresh();
  }

  const s: React.CSSProperties = {
    fontFamily: "monospace",
    background: "#0a0f1a",
    color: "#c8d0e0",
    minHeight: "100vh",
    padding: "32px",
    fontSize: "13px",
  };

  if (!authed) {
    return (
      <div style={{ ...s, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "24px" }}>
            REED ADMIN
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="password"
            autoFocus
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              padding: "10px 16px",
              color: "#fff",
              fontSize: "14px",
              fontFamily: "monospace",
              outline: "none",
              width: "260px",
            }}
          />
          <div style={{ marginTop: "12px" }}>
            <button
              onClick={login}
              disabled={loading}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "6px",
                padding: "8px 24px",
                color: "#fff",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
            >
              {loading ? "..." : "enter"}
            </button>
          </div>
          {error && <div style={{ color: "#ff6b6b", marginTop: "12px", fontSize: "12px" }}>{error}</div>}
        </div>
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
        <button onClick={refresh} disabled={loading} style={btn}>{loading ? "..." : "refresh"}</button>
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
          <div style={{ marginBottom: "16px" }}>
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
        </>
      )}
    </div>
  );
}
