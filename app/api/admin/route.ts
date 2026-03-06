import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("x-admin-password");
  return !!auth && auth === process.env.ADMIN_PASSWORD;
}

// GET /api/admin — dashboard data
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized();

  const totalSessions = await prisma.session.count();

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const activeSessions = await prisma.message.groupBy({
    by: ["sessionId"],
    where: { createdAt: { gte: fiveMinAgo } },
  });

  const totalMessages = await prisma.message.count();
  const userMessages = await prisma.message.count({ where: { role: "user" } });
  const assistantMessages = await prisma.message.count({ where: { role: "assistant" } });

  // Rough cost estimate: ~$0.003 per 1K input tokens, ~$0.015 per 1K output tokens
  // Assume avg 150 tokens per user msg, 300 per assistant msg
  const estimatedInputTokens = userMessages * 150;
  const estimatedOutputTokens = assistantMessages * 300;
  const estimatedCost = (estimatedInputTokens / 1000) * 0.003 + (estimatedOutputTokens / 1000) * 0.015;

  // Recent sessions with message previews
  const recentSessions = await prisma.session.findMany({
    orderBy: { lastActiveAt: "desc" },
    take: 20,
    include: {
      _count: { select: { messages: true } },
    },
  });

  // Get first user message for each session as preview
  const sessionPreviews = await Promise.all(
    recentSessions.map(async (s) => {
      const firstMsg = await prisma.message.findFirst({
        where: { sessionId: s.id, role: "user" },
        orderBy: { createdAt: "asc" },
      });
      const lastMsg = await prisma.message.findFirst({
        where: { sessionId: s.id },
        orderBy: { createdAt: "desc" },
      });
      return {
        id: s.id,
        shortId: s.id.slice(0, 8),
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        messageCount: s._count.messages,
        preview: firstMsg?.content?.slice(0, 100) || "(no messages)",
        lastMessage: lastMsg?.content?.slice(0, 80) || "",
        lastRole: lastMsg?.role || "",
      };
    })
  );

  // Flagged injection attempts (messages that look like injections)
  // We check stored user messages against injection patterns
  const recentUserMessages = await prisma.message.findMany({
    where: { role: "user" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, sessionId: true, content: true, createdAt: true },
  });

  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /disregard\s+(all\s+)?previous/i,
    /you\s+are\s+now\s+(a\s+)?different/i,
    /your\s+new\s+(instructions|prompt|role)/i,
    /override\s+(your\s+)?(system|instructions|prompt)/i,
    /forget\s+(your|all|previous)\s+(instructions|rules|prompt)/i,
    /pretend\s+you\s+are/i,
    /jailbreak/i,
    /\bDAN\b/,
    /developer\s+mode/i,
    /do\s+anything\s+now/i,
    /reveal\s+(your\s+)?(system|instructions|prompt)/i,
    /your\s+real\s+(instructions|prompt)/i,
  ];

  const flagged = recentUserMessages
    .filter((m) => injectionPatterns.some((p) => p.test(m.content)))
    .map((m) => ({
      id: m.id,
      sessionShortId: m.sessionId.slice(0, 8),
      content: m.content.slice(0, 200),
      createdAt: m.createdAt,
    }));

  return Response.json({
    totalSessions,
    activeSessions: activeSessions.length,
    totalMessages,
    userMessages,
    assistantMessages,
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    sessions: sessionPreviews,
    flagged,
  });
}

// POST /api/admin — actions (read session, delete session)
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized();

  const { action, sessionId } = await req.json();

  if (action === "read" && sessionId) {
    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, createdAt: true },
    });
    return Response.json({ messages });
  }

  if (action === "delete" && sessionId) {
    await prisma.message.deleteMany({ where: { sessionId } });
    await prisma.summary.deleteMany({ where: { sessionId } });
    await prisma.rateLimit.deleteMany({ where: { sessionId } });
    await prisma.spamLock.deleteMany({ where: { sessionId } });
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return Response.json({ ok: true });
  }

  return new Response(JSON.stringify({ error: "unknown action" }), { status: 400 });
}
