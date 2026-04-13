import type { RequestHandler } from "express";
import { jwtVerify, SignJWT } from "jose";
import { findActiveAdminAuthUserByUsername, upsertAdminAuthUser, type AdminRole } from "../db/adminAuthData";
import { isPostgresConfigured } from "../db/client";
import { hashPassword, verifyPassword } from "../lib/password";

type AdminAuthPrincipal = {
  username: string;
  role: AdminRole;
  kind: "bearer" | "session";
};

declare module "express-serve-static-core" {
  interface Request {
    adminAuth?: AdminAuthPrincipal;
  }
}

function getAdminSessionSecret(): Uint8Array {
  const s = (process.env.ADMIN_PANEL_JWT_SECRET ?? process.env.AUTH_JWT_SECRET ?? "").trim();
  if (!s) throw new Error("ADMIN_PANEL_JWT_SECRET not configured");
  return new TextEncoder().encode(s);
}

function readConfiguredUsers(): Array<{ username: string; password: string; role: AdminRole }> {
  const users: Array<{ username: string; password: string; role: AdminRole }> = [];
  const ownerUser = (process.env.ADMIN_PANEL_USERNAME ?? "").trim();
  const ownerPass = (process.env.ADMIN_PANEL_PASSWORD ?? "").trim();
  if (ownerUser && ownerPass) users.push({ username: ownerUser, password: ownerPass, role: "admin" });
  const svcUser = (process.env.ADMIN_PANEL_SERVICE_USERNAME ?? "").trim();
  const svcPass = (process.env.ADMIN_PANEL_SERVICE_PASSWORD ?? "").trim();
  if (svcUser && svcPass) users.push({ username: svcUser, password: svcPass, role: "service" });
  return users;
}

export async function signAdminSessionJwt(input: { username: string; role: AdminRole }): Promise<string> {
  const secret = getAdminSessionSecret();
  return new SignJWT({
    kind: "admin_panel",
    username: input.username,
    role: input.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("onroda-admin")
    .setExpirationTime("12h")
    .sign(secret);
}

async function verifyAdminSessionJwt(token: string): Promise<AdminAuthPrincipal | null> {
  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "onroda-admin",
    });
    if (payload.kind !== "admin_panel") return null;
    const username = typeof payload.username === "string" ? payload.username : "";
    const role = payload.role === "service" ? "service" : payload.role === "admin" ? "admin" : null;
    if (!username || !role) return null;
    return { username, role, kind: "session" };
  } catch {
    return null;
  }
}

export async function authenticateAdminCredentials(
  username: string,
  password: string,
): Promise<
  | { ok: true; role: AdminRole; source: "db" | "env_bootstrap" }
  | { ok: false; error: "invalid_credentials" | "bootstrap_persist_failed" }
> {
  const u = username.trim();
  const p = password;
  if (!u || !p) return { ok: false, error: "invalid_credentials" };
  const dbUser = await findActiveAdminAuthUserByUsername(u);
  if (dbUser) {
    const ok = await verifyPassword(p, dbUser.passwordHash);
    if (!ok) return { ok: false, error: "invalid_credentials" };
    return { ok: true, role: dbUser.role, source: "db" };
  }
  const users = readConfiguredUsers();
  const hit = users.find((x) => x.username === u && x.password === p);
  if (!hit) return { ok: false, error: "invalid_credentials" };
  if (!isPostgresConfigured()) {
    return { ok: false, error: "bootstrap_persist_failed" };
  }
  // First successful env-login must seed persistent DB auth for future logins/password changes.
  try {
    const hash = await hashPassword(p);
    await upsertAdminAuthUser({
      username: hit.username,
      passwordHash: hash,
      role: hit.role,
    });
  } catch {
    return { ok: false, error: "bootstrap_persist_failed" };
  }
  return { ok: true, role: hit.role, source: "env_bootstrap" };
}

/**
 * Schützt `/admin/*`-JSON-Endpunkte: `Authorization: Bearer <ADMIN_API_BEARER_TOKEN>`.
 * Ohne gesetztes Secret: in Produktion 503, in Entwicklung weiter (lokales Arbeiten).
 * Modellübersicht: `docs/access-control.md` (Plattform-Admin vs Partner-Panel).
 */
export const requireAdminApiBearer: RequestHandler = (req, res, next) => {
  const token = (process.env.ADMIN_API_BEARER_TOKEN ?? "").trim();
  const auth = req.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token && bearer === token) {
    req.adminAuth = { username: "api_bearer", role: "admin", kind: "bearer" };
    next();
    return;
  }
  if (bearer) {
    void verifyAdminSessionJwt(bearer).then((principal) => {
      if (principal) {
        req.adminAuth = principal;
        next();
        return;
      }
      res.status(401).json({ error: "unauthorized" });
    });
    return;
  }
  if (!token && process.env.NODE_ENV !== "production") {
    req.adminAuth = { username: "dev_local", role: "admin", kind: "bearer" };
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
};
