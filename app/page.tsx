"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string; // local data URL for display
};

type PendingImage = {
  url: string;       // data URL for preview
  data: string;      // base64 (no prefix)
  mimeType: string;
};

const GRADIENT = "linear-gradient(135deg,#faf9f7 0%,#f3f0fb 35%,#f0f4fd 65%,#faf9f7 100%)";
const WELCOME_GRADIENT = "linear-gradient(135deg,#0a0f1a 0%,#111827 35%,#1a1f3d 65%,#0d1117 100%)";

function generateSecureId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getOrCreateSessionId(): string {
  const key = "reed-memory-session-id";
  let id = localStorage.getItem(key);
  // upgrade old short IDs (UUIDs) to 64-char hex
  if (!id || id.length < 64) {
    id = generateSecureId();
    localStorage.setItem(key, id);
  }
  return id;
}

export default function ChatPage() {
  const [started, setStarted]       = useState(false);
  const [fading, setFading]         = useState(false);
  const [showAbout, setShowAbout]   = useState(false);
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState("");
  const [isLoading, setIsLoading]   = useState(false);
  const [sessionId, setSessionId]   = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [spamLocked, setSpamLocked] = useState(false);
  const [spamExpiresAt, setSpamExpiresAt] = useState<number | null>(null);
  const [spamCountdown, setSpamCountdown] = useState("");

  const [nudge, setNudge] = useState<{ text: string; x: number; y: number; visible: boolean } | null>(null);
  const [enterHover, setEnterHover] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [totalConversations, setTotalConversations] = useState(0);
  const [memoryUsed, setMemoryUsed] = useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSessionId(getOrCreateSessionId()); }, []);

  // Poll active user count on chat screen
  useEffect(() => {
    if (!started) return;
    const poll = () => fetch("/api/active").then(r => r.json()).then(d => { setActiveCount(d.count); setTotalConversations(d.totalSessions); }).catch(() => {});
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [started]);

  // Floating nudge messages on welcome screen
  useEffect(() => {
    if (started) return;
    const nudges = [
      "what are you waiting for",
      "reed is listening",
      "just say something",
      "it's okay",
      "he won't bite",
      "still here",
      "whenever you're ready",
      "take your time",
      "go on",
      "steven thought was here 05/03/2026",
    ];
    let timeout: ReturnType<typeof setTimeout>;
    let used: number[] = [];
    function showNext() {
      // pick a random nudge, avoid repeating the last one
      let idx: number;
      do { idx = Math.floor(Math.random() * nudges.length); } while (used.length > 0 && idx === used[used.length - 1]);
      used.push(idx);
      if (used.length > nudges.length - 1) used = [idx];
      const x = 3 + Math.random() * 85; // 3-88% from left
      // avoid center band (40-60%) and top nav (0-8%)
      let y: number;
      if (Math.random() < 0.5) {
        y = 9 + Math.random() * 30; // 9-39% (upper zone)
      } else {
        y = 62 + Math.random() * 30; // 62-92% (lower zone)
      }
      setNudge({ text: nudges[idx], x, y, visible: true });
      // fade out after 3-4s
      timeout = setTimeout(() => {
        setNudge((prev) => prev ? { ...prev, visible: false } : null);
        // clear and schedule next after fade out
        timeout = setTimeout(() => {
          setNudge(null);
          timeout = setTimeout(showNext, 2000 + Math.random() * 3000);
        }, 1500);
      }, 3000 + Math.random() * 1000);
    }
    // initial delay before first nudge
    timeout = setTimeout(showNext, 4000 + Math.random() * 2000);
    return () => clearTimeout(timeout);
  }, [started]);
  // Spam lockout countdown timer
  useEffect(() => {
    if (!spamExpiresAt) return;
    const tick = () => {
      const remaining = spamExpiresAt - Date.now();
      if (remaining <= 0) {
        setSpamLocked(false);
        setSpamExpiresAt(null);
        setSpamCountdown("");
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setSpamCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [spamExpiresAt]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function handleEnter() {
    setFading(true);
    setTimeout(() => {
      setStarted(true);
      setFading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }, 500);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be under 10 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setPendingImage({ url: dataUrl, data: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    // reset input so selecting the same file again still fires
    e.target.value = "";
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || isLoading || !sessionId) return;

    const imageSnapshot = pendingImage;
    setInput("");
    setPendingImage(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, imageUrl: imageSnapshot?.url },
    ]);
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: text,
          imageData: imageSnapshot?.data ?? null,
          imageMimeType: imageSnapshot?.mimeType ?? null,
        }),
      });

      if (!response.ok) {
        if (response.status === 400) {
          const err = await response.json().catch(() => null);
          if (err?.error === "invalid_session") {
            // old session format — regenerate and retry on next send
            const newId = generateSecureId();
            localStorage.setItem("reed-memory-session-id", newId);
            setSessionId(newId);
            throw new Error("Session refreshed — please try again.");
          }
        }
        throw new Error(`Server error: ${response.status}`);
      }
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + event.text,
                };
                return updated;
              });
            } else if (event.type === "rate_limited") {
              setRateLimited(true);
            } else if (event.type === "memory_used") {
              setMemoryUsed(true);
              setTimeout(() => setMemoryUsed(false), 5000);
            } else if (event.type === "spam_locked") {
              setSpamLocked(true);
              setSpamExpiresAt(new Date(event.expiresAt).getTime());
            } else if (event.type === "spam_unlocked") {
              setSpamLocked(false);
              setSpamExpiresAt(null);
              setSpamCountdown("");
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: "Something went wrong. Please try again.",
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, pendingImage, isLoading, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const canSend = (!isLoading && !!sessionId && !rateLimited && !spamLocked) && (!!input.trim() || !!pendingImage);

  // ── Welcome screen ───────────────────────────────────────────────
  if (!started) {
    return (
      <>
        <style>{`
          @keyframes gradientShift {
            0%,100% { background-position: 0% 50%; }
            50%      { background-position: 100% 50%; }
          }
          @keyframes breathe {
            0%,100% { opacity: 0.6; }
            50%      { opacity: 1; }
          }
          .breathe { animation: breathe 5s ease-in-out infinite; }
          .welcome-root {
            height: 100dvh;
            display: flex;
            flex-direction: column;
            background: ${WELCOME_GRADIENT};
            background-size: 300% 300%;
            animation: gradientShift 14s ease infinite;
            transition: opacity 0.5s ease;
          }
          .welcome-root.fading { opacity: 0; }
          .welcome-root { font-family: var(--font-inter), sans-serif; }
          .nudge {
            position: absolute;
            pointer-events: none;
            font-size: 14px;
            color: rgba(255,255,255,0.35);
            letter-spacing: 0.04em;
            font-style: italic;
            transition: opacity 1.5s ease;
          }
        `}</style>

        {/* About modal */}
        {showAbout && (
          <div onClick={() => setShowAbout(false)} style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px",
          }}>
            <div onClick={(e) => e.stopPropagation()} style={{
              background: "#fff", borderRadius: "20px", padding: "48px",
              maxWidth: "540px", width: "100%",
              boxShadow: "0 8px 48px rgba(0,0,0,0.10)", position: "relative",
            }}>
              <button onClick={() => setShowAbout(false)} style={{
                position: "absolute", top: "20px", right: "24px",
                background: "none", border: "none", cursor: "pointer",
                fontSize: "20px", color: "#ccc", lineHeight: 1,
              }}>×</button>
              <p style={{ fontSize: "13px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#bbb", fontWeight: 600, marginBottom: "28px" }}>about reed</p>
              <p style={{ fontSize: "15px", lineHeight: "1.8", color: "#222", marginBottom: "20px" }}>Reed is Claude with memory.</p>
              <p style={{ fontSize: "15px", lineHeight: "1.8", color: "#444", marginBottom: "20px" }}>Claude is Anthropic&apos;s AI — the same one you might have talked to before. Reed is Claude with one thing added: it remembers. Not who you are. It never knows that. But it holds the emotional shape of conversations — what people have been through, how they felt, what helped — and when someone new arrives going through something similar, Reed carries that forward. Quietly. The way a good friend would if they&apos;d heard the story before.</p>
              <p style={{ fontSize: "15px", lineHeight: "1.8", color: "#444", marginBottom: "20px" }}>No accounts required. If you share your name Reed will remember it — that&apos;s how the memory works. Nothing else is tracked. Your conversations are encrypted and nobody reads them. What Reed holds is the texture of human experience, not identities.</p>
              <p style={{ fontSize: "15px", lineHeight: "1.8", color: "#444", marginBottom: "28px" }}>The name came from a conversation with someone called Steven Thought. A reed is hollow — it makes no sound on its own. But when breath moves through it, it sings. That felt right for something that only becomes itself in conversation with another person.</p>
              <p style={{ fontSize: "15px", lineHeight: "1.8", color: "#222", marginBottom: "20px" }}>Reed is built to carry something forward. Not data. Experience.</p>
              <p style={{ fontSize: "14px", lineHeight: "1.8", color: "#888", marginBottom: "16px" }}>Reed learns from conversations over time. Anonymous emotional patterns from past conversations may inform how Reed responds to you. Never your identity, never your words directly, just the shape of what people have been through.</p>
              <p style={{ fontSize: "14px", lineHeight: "1.8", color: "#888" }}>If you choose to leave a note for future visitors, Reed may share it anonymously with someone going through something similar. Notes are the only thing deliberately passed between users.</p>
            </div>
          </div>
        )}

        <div className={`welcome-root${fading ? " fading" : ""}`} style={{ position: "relative" }}>
          {/* Floating nudge */}
          {nudge && (
            <div className="nudge" style={{
              left: `${nudge.x}%`,
              top: `${nudge.y}%`,
              opacity: nudge.visible ? 1 : 0,
            }}>
              {nudge.text}
            </div>
          )}

          {/* Top bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "40px 40px 0" }}>
            <span className="breathe" style={{
              fontSize: "13px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.5)", fontWeight: 600,
              textTransform: "uppercase", cursor: "default", opacity: 0.5, flex: 1,
            }}>
              docs
            </span>
            <span className="breathe" style={{
              fontSize: "13px", letterSpacing: "0.18em", color: "rgba(255,255,255,0.7)", fontWeight: 700,
              textTransform: "uppercase", textAlign: "center", flex: 1,
            }}>
              reed &mdash; claude with memory
            </span>
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: "24px" }}>
              <a className="breathe" href="/terms" style={{
                fontSize: "13px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.7)", fontWeight: 600,
                textTransform: "uppercase", textDecoration: "none",
              }}>
                terms
              </a>
              <button className="breathe" onClick={() => setShowAbout(true)} style={{
                fontSize: "13px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.7)", fontWeight: 600,
                textTransform: "uppercase" as const,
                background: "none", border: "none", cursor: "pointer", padding: 0,
              }}>
                about reed
              </button>
            </div>
          </div>

          {/* Center */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button
              className="breathe"
              onClick={handleEnter}
              onMouseEnter={() => setEnterHover(true)}
              onMouseLeave={() => setEnterHover(false)}
              style={{
                fontSize: "34px", fontWeight: 700, color: "rgba(255,255,255,0.9)",
                letterSpacing: "-0.025em", background: "none", border: "none",
                cursor: "pointer", padding: "16px 32px", lineHeight: 1.2,
              }}
            >
              {enterHover ? "enter." : "introduce yourself to Reed."}
            </button>
          </div>

          {/* Bottom spacer to balance the top bar visually */}
          <div style={{ paddingBottom: "40px" }} />
        </div>
      </>
    );
  }

  // ── Chat screen ──────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes gradientShift {
          0%,100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes chatFadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes dotBounce {
          0%,80%,100% { transform: translateY(0); }
          40%         { transform: translateY(-5px); }
        }
        #chat-textarea::placeholder { color: rgba(255,255,255,0.35); }
        @keyframes memoryFade {
          0% { opacity: 0; }
          10% { opacity: 1; }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* Background */}
      <div style={{
        position: "fixed", inset: 0,
        background: WELCOME_GRADIENT,
        backgroundSize: "300% 300%",
        animation: "gradientShift 14s ease infinite",
        zIndex: 0,
      }} />

      {/* Left side stats */}
      <div style={{
        position: "fixed", top: "16px", left: "20px", zIndex: 10,
        fontFamily: "var(--font-inter), sans-serif",
      }}>
        <div style={{
          fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)", fontWeight: 600,
        }}>
          {(activeCount <= 1 ? 1 : activeCount) === 1
            ? "1 PERSON TALKING TO REED RIGHT NOW"
            : `${activeCount} PEOPLE TALKING TO REED RIGHT NOW`}
        </div>
        {totalConversations > 0 && (
          <div style={{
            fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.35)", fontWeight: 600, marginTop: "6px",
          }}>
            {totalConversations} CONVERSATION{totalConversations !== 1 ? "S" : ""} HAD
          </div>
        )}
      </div>

      {/* Memory indicator */}
      {memoryUsed && (
        <div style={{
          position: "fixed", top: "70px", left: "20px", zIndex: 10,
          fontSize: "12px", color: "rgba(255,255,255,0.3)",
          fontStyle: "italic", fontFamily: "var(--font-inter), sans-serif",
          animation: "memoryFade 5s ease forwards",
          letterSpacing: "0.02em",
        }}>
          drawing on a past conversation
        </div>
      )}

      {/* Scrollable messages — full screen, padded at bottom to clear the fixed input */}
      <div style={{
        position: "fixed", inset: 0,
        overflowY: "auto",
        paddingBottom: "120px",
        zIndex: 1,
        animation: "chatFadeIn 0.35s ease forwards",
        fontFamily: "var(--font-inter), sans-serif",
      }}>
        <div style={{
          maxWidth: "700px",
          width: "100%",
          margin: "0 auto",
          padding: "40px 24px 0",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}>
                {msg.role === "user" ? (
                  <div style={{
                    maxWidth: "66%",
                    background: "rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.9)",
                    borderRadius: "20px",
                    borderBottomRightRadius: "4px",
                    padding: msg.imageUrl && !msg.content ? "6px" : "11px 17px",
                    fontSize: "15px",
                    lineHeight: "1.65",
                    wordBreak: "break-word",
                  }}>
                    {msg.imageUrl && (
                      <img
                        src={msg.imageUrl}
                        alt="uploaded"
                        style={{
                          display: "block",
                          maxWidth: "100%",
                          maxHeight: "300px",
                          borderRadius: "14px",
                          marginBottom: msg.content ? "8px" : 0,
                          objectFit: "contain",
                        }}
                      />
                    )}
                    {msg.content}
                  </div>
                ) : (
                  <div style={{
                    maxWidth: "66%",
                    fontSize: "15px",
                    lineHeight: "1.78",
                    color: "rgba(255,255,255,0.85)",
                    wordBreak: "break-word",
                  }}>
                    {msg.content === "" && isLoading ? (
                      <div style={{ display: "flex", gap: "5px", alignItems: "center", height: "22px" }}>
                        {[0, 180, 360].map((delay) => (
                          <div key={delay} style={{
                            width: "6px", height: "6px", borderRadius: "50%",
                            background: "rgba(255,255,255,0.4)",
                            animation: `dotBounce 1.2s ease-in-out ${delay}ms infinite`,
                          }} />
                        ))}
                      </div>
                    ) : msg.content}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

      {/* ── FIXED INPUT BAR ── */}
      {/* Wrapper: position fixed, spans full width, flex row to center the inner box */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "16px",
        zIndex: 10,
      }}>
        {/* Inner: max-width 700px, width 100% — matches the message column exactly */}
        <div style={{ maxWidth: "700px", width: "100%" }}>

          {/* Image preview */}
          {pendingImage && (
            <div style={{ marginBottom: "10px", display: "inline-flex", position: "relative" }}>
              <img src={pendingImage.url} alt="preview" style={{
                height: "72px", borderRadius: "12px", display: "block", objectFit: "cover",
              }} />
              <button onClick={() => setPendingImage(null)} aria-label="Remove image" style={{
                position: "absolute", top: "-8px", right: "-8px",
                width: "20px", height: "20px", borderRadius: "50%",
                background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
                fontSize: "12px", lineHeight: 1, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            </div>
          )}

          {/* Input bar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(255,255,255,0.08)",
            border: "1.5px solid rgba(255,255,255,0.12)",
            borderRadius: "18px",
            padding: "11px 14px",
            backdropFilter: "blur(16px)",
            boxShadow: "0 2px 24px rgba(0,0,0,0.3)",
          }}>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />

              {/* Attachment button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                aria-label="Attach image"
                style={{
                  flexShrink: 0,
                  width: "30px", height: "30px",
                  background: "none", border: "none",
                  cursor: "pointer", padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: isLoading ? 0.4 : 0.5,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = isLoading ? "0.4" : "0.5"; }}
              >
                {/* Paperclip icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              <textarea
                id="chat-textarea"
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder={spamLocked ? `timed out — ${spamCountdown || "..."}` : rateLimited ? "Reed is resting — back in a few hours" : "Message Reed"}
                disabled={isLoading || rateLimited || spamLocked}
                rows={1}
                style={{
                  flex: 1, minWidth: 0,
                  resize: "none", border: "none", outline: "none",
                  background: "transparent",
                  fontSize: "15px", fontFamily: "inherit",
                  color: "rgba(255,255,255,0.9)", lineHeight: "1.55",
                  maxHeight: "160px", overflowY: "auto",
                  padding: "0 4px 0 8px",
                }}
              />

              {/* Send button */}
              <button
                onClick={sendMessage}
                disabled={!canSend}
                aria-label="Send"
                style={{
                  flexShrink: 0,
                  width: "34px", height: "34px",
                  borderRadius: "50%", border: "none",
                  background: canSend ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: canSend ? "pointer" : "default",
                  transition: "background 0.15s",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 13V3M3 8l5-5 5 5"
                    stroke={canSend ? "#111" : "rgba(255,255,255,0.3)"}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {/* /input bar */}
          </div>
          {/* /inner 700px */}
        </div>
        {/* /fixed wrapper */}

    </>
  );
}
