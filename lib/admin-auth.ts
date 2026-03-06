import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "./db";

const SESSION_COOKIE_NAME = "reed_admin_session";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function getSigningSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  return secret;
}

function signToken(token: string): string {
  const sig = createHmac("sha256", getSigningSecret()).update(token).digest("hex");
  return `${token}.${sig}`;
}

function verifySignedToken(signed: string): string | null {
  const dotIndex = signed.lastIndexOf(".");
  if (dotIndex === -1) return null;
  const token = signed.slice(0, dotIndex);
  const sig = signed.slice(dotIndex + 1);
  const expected = createHmac("sha256", getSigningSecret()).update(token).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}

export function getClientIp(req: NextRequest): string {
  const platformIp = (req as unknown as { ip?: string }).ip;
  if (platformIp) return platformIp;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    return ips[ips.length - 1] || "unknown";
  }
  return req.headers.get("x-real-ip") || "unknown";
}

export async function auditLog(action: string, ip: string, details?: string): Promise<void> {
  await prisma.adminAuditLog.create({
    data: { action, ip, details: details ?? null },
  });
}

// Check brute force lockout for an IP. Returns "locked" or "ok".
async function checkLockout(ip: string): Promise<"locked" | "ok"> {
  const now = new Date();
  const entry = await prisma.adminLoginAttempt.findUnique({ where: { ip } });
  if (entry && entry.lockedUntil && entry.lockedUntil > now) return "locked";
  if (entry && entry.lockedUntil && entry.lockedUntil <= now && entry.count >= LOGIN_MAX_ATTEMPTS) {
    await prisma.adminLoginAttempt.delete({ where: { ip } });
  }
  return "ok";
}

// Record a failed login attempt. Returns "locked" if this attempt triggers lockout.
async function recordFailedAttempt(ip: string): Promise<"locked" | "failed"> {
  const now = new Date();
  const entry = await prisma.adminLoginAttempt.findUnique({ where: { ip } });
  const current = entry && (!entry.lockedUntil || entry.lockedUntil <= now) ? entry : null;
  const newCount = (current?.count ?? 0) + 1;
  const lockedUntil = newCount >= LOGIN_MAX_ATTEMPTS ? new Date(now.getTime() + LOGIN_LOCKOUT_MS) : null;
  await prisma.adminLoginAttempt.upsert({
    where: { ip },
    update: { count: newCount, lockedUntil },
    create: { ip, count: newCount, lockedUntil },
  });
  return lockedUntil ? "locked" : "failed";
}

// Attempt login with username + password. Returns a signed session token on success.
export async function attemptLogin(
  ip: string,
  username: string,
  password: string
): Promise<{ ok: true; signedToken: string; expiresAt: Date } | { ok: false; reason: "locked" | "invalid" }> {
  const lockStatus = await checkLockout(ip);
  if (lockStatus === "locked") {
    await auditLog("login_failed_locked", ip);
    return { ok: false, reason: "locked" };
  }

  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) {
    return { ok: false, reason: "invalid" };
  }

  const userBuf = Buffer.from(username);
  const expectedUserBuf = Buffer.from(expectedUser);
  const userMatch = userBuf.length === expectedUserBuf.length && timingSafeEqual(userBuf, expectedUserBuf);

  const passBuf = Buffer.from(password);
  const expectedPassBuf = Buffer.from(expectedPass);
  const passMatch = passBuf.length === expectedPassBuf.length && timingSafeEqual(passBuf, expectedPassBuf);

  if (!userMatch || !passMatch) {
    const result = await recordFailedAttempt(ip);
    await auditLog("login_failed", ip, `username: ${username.slice(0, 20)}`);
    return { ok: false, reason: result === "locked" ? "locked" : "invalid" };
  }

  // Success — clear attempts and create session
  await prisma.adminLoginAttempt.delete({ where: { ip } }).catch(() => {});

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.adminSession.create({ data: { token, ip, expiresAt } });
  await auditLog("login_success", ip);

  return { ok: true, signedToken: signToken(token), expiresAt };
}

// Validate a session cookie. Returns true if valid.
export async function validateSession(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return false;

  const token = verifySignedToken(cookie.value);
  if (!token) return false;

  const session = await prisma.adminSession.findUnique({ where: { token } });
  if (!session) return false;

  if (new Date() > session.expiresAt) {
    await prisma.adminSession.delete({ where: { token } }).catch(() => {});
    return false;
  }

  return true;
}

// Destroy a session by cookie value.
export async function destroySession(req: NextRequest): Promise<void> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return;
  const token = verifySignedToken(cookie.value);
  if (!token) return;
  await prisma.adminSession.delete({ where: { token } }).catch(() => {});
}

export { SESSION_COOKIE_NAME };
