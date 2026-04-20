import type { RequestHandler } from "express";
import { jwtVerify, SignJWT } from "jose";
import {
  findActiveAdminAuthUserByIdentity,
  findActiveAdminAuthUserByUsername,
  upsertAdminAuthUser,
} from "../db/adminAuthData";
import type { AdminRole } from "../lib/adminConsoleRoles";
import { parseAdminRole } from "../lib/adminConsoleRoles";
import { isPostgresConfigured } from "../db/client";
import { hashPassword, verifyPassword } from "../lib/password";

export type AdminAuthPrincipal = {
  username: string;
  role: AdminRole;
  kind: "bearer" | "session";
  scopeCompanyId?: string | null;
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
  const user = await findActiveAdminAuthUserByUsername(input.username);
  const secret = getAdminSessionSecret();
  return new SignJWT({
    kind: "admin_panel",
    username: input.username,
    role: input.role,
    sv: user?.sessionVersion ?? 1,
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
    const role = parseAdminRole(typeof payload.role === "string" ? payload.role : "");
    const sessionVersion = typeof payload.sv === "number" ? payload.sv : 1;
    if (!username || !role) return null;
    const user = await findActiveAdminAuthUserByUsername(username);
    if (!user) return null;
    if (user.sessionVersion !== sessionVersion) return null;
    return {
      username,
      role,
      kind: "session",
      scopeCompanyId: user.scopeCompanyId ?? null,
    };
  } catch {
    return null;
  }
}

/** Nur für Server-Logs (ADMIN_AUTH_LOGIN_AUDIT); nie an den Client senden. */
export type AdminAuthFailureDetail =
  | "empty_identity"
  | "admin_password_rejected_db"
  | "admin_password_rejected_env"
  | "admin_identity_unknown";

export type AuthenticateAdminCredentialsResult =
  | { ok: true; role: AdminRole; source: "db" | "env_bootstrap" }
  | { ok: false; error: "invalid_credentials"; detail?: AdminAuthFailureDetail }
  | { ok: false; error: "bootstrap_persist_failed" };

export async function authenticateAdminCredentials(
  username: string,
  password: string,
): Promise<AuthenticateAdminCredentialsResult> {
  const u = username.trim();
  const p = password;
  if (!u || !p) return { ok: false, error: "invalid_credentials", detail: "empty_identity" };
  const dbUser = await findActiveAdminAuthUserByIdentity(u);
  if (dbUser) {
    const pwOk = await verifyPassword(p, dbUser.passwordHash);
    if (!pwOk) return { ok: false, error: "invalid_credentials", detail: "admin_password_rejected_db" };
    return { ok: true, role: dbUser.role, source: "db" };
  }
  const users = readConfiguredUsers();
  const hit = users.find((x) => x.username === u && x.password === p);
  if (!hit) {
    const envUsernameMatch = users.find((x) => x.username === u);
    if (envUsernameMatch) {
      return { ok: false, error: "invalid_credentials", detail: "admin_password_rejected_env" };
    }
    return { ok: false, error: "invalid_credentials", detail: "admin_identity_unknown" };
  }
  if (!isPostgresConfigured()) {
    return { ok: false, error: "bootstrap_persist_failed" };
  }
  // First successful env-login must seed persistent DB auth for future logins/password changes.
  try {
    const hash = await hashPassword(p);
    await upsertAdminAuthUser({
      username: hit.username,
      email: "",
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
    req.adminAuth = { username: "api_bearer", role: "admin", kind: "bearer", scopeCompanyId: null };
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
    req.adminAuth = { username: "dev_local", role: "admin", kind: "bearer", scopeCompanyId: null };
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
};
