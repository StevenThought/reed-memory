import { NextRequest } from "next/server";
import { destroySession, getClientIp, auditLog, SESSION_COOKIE_NAME } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  await destroySession(req);
  await auditLog("logout", ip);

  const res = Response.json({ ok: true });
  res.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
  return res;
}
