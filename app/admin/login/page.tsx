"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.status === 401) {
        setError("invalid credentials");
      } else if (res.status === 429) {
        const d = await res.json();
        setError(d.message || "too many attempts");
      } else if (res.ok) {
        router.push("/admin");
      } else {
        setError("something went wrong");
      }
    } catch {
      setError("failed to connect");
    }
    setLoading(false);
  }

  const s: React.CSSProperties = {
    fontFamily: "monospace",
    background: "#0a0f1a",
    color: "#c8d0e0",
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "10px 16px",
    color: "#fff",
    fontSize: "14px",
    fontFamily: "monospace",
    outline: "none",
    width: "260px",
    display: "block",
    marginBottom: "12px",
  };

  return (
    <div style={s}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: "24px" }}>
          REED ADMIN
        </div>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          placeholder="username"
          autoFocus
          autoComplete="username"
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          placeholder="password"
          autoComplete="current-password"
          style={inputStyle}
        />
        <div style={{ marginTop: "4px" }}>
          <button
            onClick={handleLogin}
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
            {loading ? "..." : "sign in"}
          </button>
        </div>
        {error && <div style={{ color: "#ff6b6b", marginTop: "12px", fontSize: "12px" }}>{error}</div>}
      </div>
    </div>
  );
}
