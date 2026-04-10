import crypto from "node:crypto";
import { app } from "electron";

/**
 * 基于机器信息生成固定密钥
 * 攻击者需要在同一台机器上才能解密
 */
function getMachineKey(): string {
  const machineId = app.getPath("userData");
  return crypto.createHash("sha256").update(machineId).digest("hex").slice(0, 32);
}

const ALGORITHM = "aes-256-cbc";
const KEY = Buffer.from(getMachineKey(), "utf8");
const IV_LENGTH = 16;

/**
 * AES-256-CBC 加密
 */
export function encrypt(text: string): string {
  if (!text) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  // 格式：iv:加密内容
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * AES-256-CBC 解密
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) return "";
  const parts = encrypted.split(":");
  if (parts.length !== 2) return "";
  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

