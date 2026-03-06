import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { timingSafeEqual } from "crypto";

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Brute force protection: 5 failed attempts = 15 min lockout, tracked in DB ──
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    return ips[ips.length - 1] || "unknown";
  }
  return req.headers.get("x-real-ip") || "unknown";
}

async function checkAuth(req: NextRequest): Promise<boolean | "locked"> {
  const ip = getClientIp(req);
  const now = new Date();

  const entry = await prisma.adminLoginAttempt.findUnique({ where: { ip } });

  if (entry && entry.lockedUntil && entry.lockedUntil > now) {
    return "locked";
  }

  // Reset if lockout expired
  if (entry && entry.lockedUntil && entry.lockedUntil <= now && entry.count >= LOGIN_MAX_ATTEMPTS) {
    await prisma.adminLoginAttempt.delete({ where: { ip } });
  }

  const auth = req.headers.get("x-admin-password");
  const expected = process.env.ADMIN_PASSWORD;
  let valid = false;
  if (auth && expected) {
    const a = Buffer.from(auth);
    const b = Buffer.from(expected);
    valid = a.length === b.length && timingSafeEqual(a, b);
  }

  if (!valid) {
    const current = entry && (!entry.lockedUntil || entry.lockedUntil <= now) ? entry : null;
    const newCount = (current?.count ?? 0) + 1;
    const lockedUntil = newCount >= LOGIN_MAX_ATTEMPTS ? new Date(now.getTime() + LOGIN_LOCKOUT_MS) : null;

    await prisma.adminLoginAttempt.upsert({
      where: { ip },
      update: { count: newCount, lockedUntil },
      create: { ip, count: newCount, lockedUntil },
    });
    return false;
  }

  // Successful login — clear attempts
  if (entry) {
    await prisma.adminLoginAttempt.delete({ where: { ip } }).catch(() => {});
  }
  return true;
}

// GET /api/admin — dashboard data (stats only, no conversation content)
export async function GET(req: NextRequest) {
  const authResult = await checkAuth(req);
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
  const authResult = await checkAuth(req);
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
