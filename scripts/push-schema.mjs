import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const statements = [
  `CREATE TABLE IF NOT EXISTS "Session" ("id" TEXT NOT NULL PRIMARY KEY, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS "SpamLock" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "lockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" DATETIME NOT NULL, CONSTRAINT "SpamLock_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "RateLimit" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 0, "windowStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RateLimit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "Message" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL, "imageData" TEXT, "imageMimeType" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "Summary" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "content" TEXT NOT NULL, "themes" TEXT NOT NULL, "userName" TEXT, "updatedAt" DATETIME NOT NULL, CONSTRAINT "Summary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "AdminLoginAttempt" ("id" TEXT NOT NULL PRIMARY KEY, "ip" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 0, "lockedUntil" DATETIME, "updatedAt" DATETIME NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "AdminSession" ("id" TEXT NOT NULL PRIMARY KEY, "token" TEXT NOT NULL, "ip" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" DATETIME NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "AdminAuditLog" ("id" TEXT NOT NULL PRIMARY KEY, "action" TEXT NOT NULL, "ip" TEXT NOT NULL, "details" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS "IpRateLimit" ("id" TEXT NOT NULL PRIMARY KEY, "ip" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 0, "windowStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS "InjectionLog" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "sessionShortId" TEXT NOT NULL, "content" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "InjectionLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "Note" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "authorName" TEXT NOT NULL, "content" TEXT NOT NULL, "emotionalTags" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Note_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SpamLock_sessionId_key" ON "SpamLock"("sessionId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "RateLimit_sessionId_key" ON "RateLimit"("sessionId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Summary_sessionId_key" ON "Summary"("sessionId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AdminLoginAttempt_ip_key" ON "AdminLoginAttempt"("ip")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AdminSession_token_key" ON "AdminSession"("token")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IpRateLimit_ip_key" ON "IpRateLimit"("ip")`,
];

console.log("Pushing schema to Turso...");
for (const sql of statements) {
  try {
    await client.execute(sql);
    const match = sql.match(/"(\w+)"/);
    console.log(`  ✓ ${match ? match[1] : "index"}`);
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    console.error(`    SQL: ${sql.substring(0, 80)}...`);
  }
}
console.log("Done!");
client.close();
