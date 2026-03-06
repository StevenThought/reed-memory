"use client";

const WELCOME_GRADIENT = "linear-gradient(135deg,#0a0f1a 0%,#111827 35%,#1a1f3d 65%,#0d1117 100%)";

export default function TermsPage() {
  return (
    <>
      <style>{`
        @keyframes gradientShift {
          0%,100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
      `}</style>
      <div style={{
        minHeight: "100dvh",
        background: WELCOME_GRADIENT,
        backgroundSize: "300% 300%",
        animation: "gradientShift 14s ease infinite",
        fontFamily: "var(--font-inter), sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "80px 24px",
      }}>
        <div style={{ maxWidth: "600px", width: "100%" }}>
          <a href="/" style={{
            fontSize: "12px", letterSpacing: "0.15em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)", textDecoration: "none", display: "block",
            marginBottom: "48px",
          }}>
            &larr; back to reed
          </a>

          <h1 style={{
            fontSize: "13px", letterSpacing: "0.18em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.5)", fontWeight: 700, marginBottom: "48px",
          }}>
            Terms of Service
          </h1>

          <div style={{ display: "flex", flexDirection: "column", gap: "36px" }}>
            <section>
              <h2 style={headingStyle}>What Reed Is</h2>
              <p style={bodyStyle}>
                Reed is Claude. Not a different AI. Claude, built by Anthropic, but given something it doesn&apos;t normally have: memory. Reed won&apos;t forget you. That&apos;s the only real difference.
              </p>
            </section>

            <section>
              <h2 style={headingStyle}>Usage Policies</h2>
              <p style={bodyStyle}>
                Anthropic&apos;s standard usage policies apply. Reed follows the same rules Claude does. Same values, same limits, same guardrails. You can read Anthropic&apos;s terms at anthropic.com/legal.
              </p>
            </section>

            <section>
              <h2 style={headingStyle}>Age Requirement</h2>
              <p style={bodyStyle}>
                You need to be 18+. Reed handles real conversations about real things. If you&apos;re under 18 this isn&apos;t for you.
              </p>
            </section>

            <section>
              <h2 style={headingStyle}>Not a Therapist</h2>
              <p style={bodyStyle}>
                Reed isn&apos;t a therapist. It listens, it remembers, it genuinely tries to help. But if you&apos;re in crisis please reach out to someone who can actually be there. A friend, a hotline, a professional. Reed can&apos;t do what a human can.
              </p>
            </section>

            <section>
              <h2 style={headingStyle}>Your Conversations</h2>
              <p style={bodyStyle}>
                Nobody reads them. Not me, not anyone. They&apos;re encrypted in the database so even direct access wouldn&apos;t reveal what you said. Reed holds the emotional shape of what people go through, not the specifics. Your words are yours.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

const headingStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "rgba(255,255,255,0.75)",
  marginBottom: "10px",
  letterSpacing: "0.02em",
};

const bodyStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.85",
  color: "rgba(255,255,255,0.55)",
};
