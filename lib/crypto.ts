import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is not set — add a 64-char hex string to .env.local");
  return Buffer.from(key, "hex");
}

export function encrypt(text: string): string {
  if (!text) return text;
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  if (!encrypted) return encrypted;
  // Unencrypted legacy messages won't have the iv:tag:ciphertext format
  const parts = encrypted.split(":");
  if (parts.length !== 3) return encrypted;
  try {
    const key = getKey();
    const iv = Buffer.from(parts[0], "hex");
    const tag = Buffer.from(parts[1], "hex");
    const ciphertext = parts[2];
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // If decryption fails, assume it's a legacy unencrypted message
    return encrypted;
  }
}
