import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

// ── Rate limiting: 1 request per 30 seconds per IP ──
const ACTIVE_RATE_WINDOW_MS = 30 * 1000;
const activeRateMap = new Map<string, number>();

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    return ips[ips.length - 1] || "unknown";
  }
  return req.headers.get("x-real-ip") || "unknown";
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const now = Date.now();
  const lastRequest = activeRateMap.get(ip) || 0;

  if (now - lastRequest < ACTIVE_RATE_WINDOW_MS) {
    return new Response(JSON.stringify({ error: "rate_limited", message: "Try again in 30 seconds." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }
  activeRateMap.set(ip, now);

  // Count sessions with a message in the last 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const count = await prisma.message.groupBy({
    by: ["sessionId"],
    where: { createdAt: { gte: fiveMinAgo } },
  });

  const totalSessions = await prisma.session.count();

  return Response.json({ count: count.length, totalSessions });
}
