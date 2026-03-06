import { prisma } from "@/lib/db";

export async function GET() {
  // Count sessions with a message in the last 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const count = await prisma.message.groupBy({
    by: ["sessionId"],
    where: { createdAt: { gte: fiveMinAgo } },
  });

  const totalSessions = await prisma.session.count();

  return Response.json({ count: count.length, totalSessions });
}
