import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { validateSession, getClientIp, auditLog } from "@/lib/admin-auth";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

// GET /api/admin — dashboard data (stats only, no conversation content)
export async function GET(req: NextRequest) {
  if (!(await validateSession(req))) return unauthorized();

  const ip = getClientIp(req);
  await auditLog("page_view", ip, "dashboard");

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

  const sessions = recentSessions.map((s: (typeof recentSessions)[number]) => ({
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

  // Recent audit log entries
  const auditLogs = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

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
    auditLogs,
  });
}

// POST /api/admin — actions (delete session only, no read)
export async function POST(req: NextRequest) {
  if (!(await validateSession(req))) return unauthorized();

  const ip = getClientIp(req);
  const { action, sessionId } = await req.json();

  if (action === "delete" && sessionId) {
    // Cascading deletes handle messages, summary, notes, rateLimit, spamLock, injectionLogs
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    await auditLog("session_delete", ip, `session: ${sessionId.slice(0, 8)}`);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
