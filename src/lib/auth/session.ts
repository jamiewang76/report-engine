import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Browser session = signed cookie with user + org ids only. CRM tokens never go to the browser. */
export type Session = { userId: string; orgId: string; orgName?: string | null; email: string | null; name: string | null };

const COOKIE = "re_session";
const key = () => new TextEncoder().encode(env.sessionSecret);

export async function setSession(s: Session) {
  const jwt = await new SignJWT(s).setProtectedHeader({ alg: "HS256" }).setExpirationTime("12h").sign(key());
  (await cookies()).set(COOKIE, jwt, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
}

export async function getSession(): Promise<Session | null> {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, key());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** AES-256-GCM for refresh tokens stored in Supabase. */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(env.tokenKey, "base64"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(env.tokenKey, "base64"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
