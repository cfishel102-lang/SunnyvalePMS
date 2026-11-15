import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "crypto";
import { db } from "./db";

function key() {
  const s = process.env.AUTH_SECRET;
  // Online, sign-in must be protected by a private secret, never the sample one.
  if (process.env.NODE_ENV === "production" && process.env.VERCEL && (!s || s.startsWith("dev-only"))) {
    throw new Error("AUTH_SECRET is not set. Add it in the project's environment variables.");
  }
  return new TextEncoder().encode(s ?? "dev-only-secret");
}
const COOKIE = "session";

export async function signIn(userId: string) {
  const token = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("14d").sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 14 * 86400 });
}
export async function signOut() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return await db.user.findUnique({ where: { id: String(payload.sub) }, include: { organization: true } });
  } catch {
    return null;
  }
}

/** Use at the top of every staff page and staff action. */
export async function requireStaff() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  const property = await db.property.findFirst({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" } });
  if (!property) throw new Error("No property is set up for this account.");
  return { user, property };
}

// ---- API keys (for the open API and MCP connections) ----

export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

export async function createApiKey(organizationId: string, name: string) {
  const key = "cg_" + randomBytes(24).toString("base64url");
  await db.apiKey.create({ data: { organizationId, name, prefix: key.slice(0, 10), keyHash: hashKey(key) } });
  return key; // shown once; only the hash is stored
}

/** Resolve "Authorization: Bearer cg_..." to an organization, or null. */
export async function orgFromRequest(req: Request) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const k = await db.apiKey.findUnique({ where: { keyHash: hashKey(m[1]) } });
  if (!k) return null;
  db.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return k.organizationId;
}
