import { NextRequest } from "next/server";
import { attemptLogin, getClientIp, SESSION_COOKIE_NAME } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return Response.json({ error: "username and password required" }, { status: 400 });
  }

  const result = await attemptLogin(ip, username, password);

  if (!result.ok) {
    if (result.reason === "locked") {
      return Response.json(
        { error: "too_many_attempts", message: "Too many failed attempts. Try again in 15 minutes." },
        { status: 429 },
      );
    }
    return Response.json({ error: "invalid credentials" }, { status: 401 });
  }

  const res = Response.json({ ok: true });
  res.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${result.signedToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200`,
  );
  return res;
}
