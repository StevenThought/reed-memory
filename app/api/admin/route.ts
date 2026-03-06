import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Brute force protection: 5 failed attempts = 15 min lockout per IP ──
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

function checkAuth(req: NextRequest): boolean | "locked" {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && entry.lockedUntil > now) {
    return "locked";
  }

  // Reset if lockout expired
  if (entry && entry.lockedUntil <= now && entry.count >= LOGIN_MAX_ATTEMPTS) {
    loginAttempts.delete(ip);
  }

  const auth = req.headers.get("x-admin-password");
  const valid = !!auth && auth === process.env.ADMIN_PASSWORD;

  if (!valid) {
    const current = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    current.count += 1;
    if (current.count >= LOGIN_MAX_ATTEMPTS) {
      current.lockedUntil = now + LOGIN_LOCKOUT_MS;
    }
    loginAttempts.set(ip, current);
    return false;
  }

  // Successful login — clear attempts
  loginAttempts.delete(ip);
  return true;
}

// GET /api/admin — dashboard data (stats only, no conversation content)
export async function GET(req: NextRequest) {
  const authResult = checkAuth(req);
  if (authResult === "locked") {
    return new Response(JSON.stringify({ error: "too_many_attempts", message: "Too many failed attempts. Try again in 15 minutes." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!authResult) return unauthorized();

  const totalSessions = await prisma.session.count();

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const activeSessions = await prisma.message.groupBy({
    by: ["sessionId"],
    where: { createdAt: { gte: fiveMinAgo } },
  });

  const totalMessages = await prisma.message.count();
  const userMessages = await prisma.message.count({ where: { role: "user" } });
  const assistantMessages = await prisma.message.count({ where: { role: "assistant" } });

  // Rough cost estimate
  const estimatedInputTokens = userMessages * 150;
  const estimatedOutputTokens = assistantMessages * 300;
  const estimatedCost = (estimatedInputTokens / 1000) * 0.003 + (estimatedOutputTokens / 1000) * 0.015;

  // Session list — stats only, no message content
  const recentSessions = await prisma.session.findMany({
    orderBy: { lastActiveAt: "desc" },
    take: 20,
    include: {
      _count: { select: { messages: true } },
    },
  });

  const sessions = recentSessions.map((s) => ({
    id: s.id,
    shortId: s.id.slice(0, 8),
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    messageCount: s._count.messages,
  }));

  // Flagged injection attempts — count and session only, no content
  const flagged = await prisma.injectionLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, sessionShortId: true, createdAt: true },
  });
  const totalInjectionAttempts = await prisma.injectionLog.count();

  return Response.json({
    totalSessions,
    activeSessions: activeSessions.length,
    totalMessages,
    userMessages,
    assistantMessages,
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    sessions,
    flagged,
    totalInjectionAttempts,
  });
}

// POST /api/admin — actions (delete session only, no read)
export async function POST(req: NextRequest) {
  const authResult = checkAuth(req);
  if (authResult === "locked") {
    return new Response(JSON.stringify({ error: "too_many_attempts", message: "Too many failed attempts. Try again in 15 minutes." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!authResult) return unauthorized();

  const { action, sessionId } = await req.json();

  if (action === "delete" && sessionId) {
    await prisma.message.deleteMany({ where: { sessionId } });
    await prisma.summary.deleteMany({ where: { sessionId } });
    await prisma.note.deleteMany({ where: { sessionId } });
    await prisma.rateLimit.deleteMany({ where: { sessionId } });
    await prisma.spamLock.deleteMany({ where: { sessionId } });
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return Response.json({ ok: true });
  }

  return new Response(JSON.stringify({ error: "unknown action" }), { status: 400 });
}
