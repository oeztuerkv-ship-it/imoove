import { ClientAuthentication, OAuth2Client } from "google-auth-library";
import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "crypto";
import { getFirebaseAuth, isFirebaseAdminConfigured } from "../lib/firebaseAdmin";
import {
  isSessionJwtConfigured,
  signSessionJwt,
  verifySessionJwt,
} from "../lib/sessionJwt";

const router = Router();

/** Zur Laufzeit lesen (nach dotenv / PM2-Env), nicht nur beim ersten Modul-Import. */
function googleClientId(): string {
  return (
    process.env.GOOGLE_CLIENT_ID ??
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ??
    ""
  ).trim();
}

function googleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
}

function normalizePublicBaseUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (/\/api$/i.test(u)) u = u.replace(/\/api$/i, "");
  return u;
}

/**
 * Öffentliche Basis-URL der API (ohne /api-Suffix).
 * Priorität: OAUTH_PUBLIC_ORIGIN → BACKEND_URL → X-Forwarded-* / Host.
 * Muss zu den autorisierten Redirect-URIs in der Google Console passen.
 */
function publicApiOrigin(req: Request): string {
  const explicit = normalizePublicBaseUrl(
    (process.env.OAUTH_PUBLIC_ORIGIN ?? process.env.BACKEND_URL ?? "").trim(),
  );
  if (explicit) {
    if (/^https?:\/\//i.test(explicit)) return explicit;
    return `https://${explicit}`;
  }
  const xfProto = req.get("x-forwarded-proto");
  const proto =
    (typeof xfProto === "string" ? xfProto.split(",")[0] : "")?.trim() || req.protocol || "https";
  const xfHost = req.get("x-forwarded-host");
  const hostRaw =
    (typeof xfHost === "string" ? xfHost.split(",")[0] : "")?.trim() || req.get("host") || "";
  if (!hostRaw) return "http://localhost:3000";
  return `${proto}://${hostRaw}`;
}

function apiBaseFromReq(req: Request): string {
  return `${publicApiOrigin(req)}/api`;
}

function callbackUriFromReq(req: Request): string {
  return `${apiBaseFromReq(req)}/auth/google/callback`;
}

function panelOAuthDefaultReturnUrl(): string {
  const raw = (process.env.PANEL_OAUTH_RETURN_URL ?? "https://panel.onroda.de/").trim();
  return raw.length > 0 ? raw : "https://panel.onroda.de/";
}

/**
 * Verhindert offene Redirects: nur Panel-/Admin-Host oder explizite Zusatz-Origins.
 */
function isAllowedPanelReturnUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      return u.protocol === "http:" || u.protocol === "https:";
    }
    if (host === "panel.onroda.de" || host === "admin.onroda.de") {
      return u.protocol === "https:";
    }
    const extra = (process.env.PANEL_ALLOWED_RETURN_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const e of extra) {
      try {
        const parsed = new URL(e.includes("://") ? e : `https://${e}`);
        if (parsed.hostname.toLowerCase() === host) {
          return u.protocol === "https:" || (host === "localhost" && u.protocol === "http:");
        }
      } catch {
        /* ignore */
      }
    }
    return false;
  } catch {
    return false;
  }
}

function sendGoogleOAuthStart(req: Request, res: Response, returnUrl: string): void {
  const cid = googleClientId();
  if (!cid) {
    res.status(500).json({
      error: "Google Client ID not configured",
      hint:
        "Set GOOGLE_CLIENT_ID (and GOOGLE_CLIENT_SECRET) in the process environment. " +
        "If you use a .env file: PM2 cwd must be the api-server folder, or use pm2 ecosystem env / dotenv. " +
        "After deploy: rebuild api-server (pnpm run build) so loadEnv is included.",
    });
    return;
  }

  if (!isSessionJwtConfigured()) {
    res.status(500).json({
      error: "AUTH_JWT_SECRET not configured",
      hint: "Set AUTH_JWT_SECRET (long random string, e.g. openssl rand -base64 48) in the API environment.",
    });
    return;
  }

  const state = base64url(randomBytes(16));
  const secret = googleClientSecret();

  const redirectUri = callbackUriFromReq(req);
  console.log("GOOGLE REDIRECT URI:", redirectUri);
  console.log(
    `[auth/start] state=${state} returnUrl=${returnUrl} pkce=${!secret}`,
  );

  let codeVerifier: string | null = null;
  if (!secret) {
    codeVerifier = generateCodeVerifier();
  }

  pending.set(state, {
    codeVerifier,
    returnUrl,
    clientId: cid,
    redirectUri,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: cid,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
    access_type: "offline",
    prompt: "select_account",
  });
  if (codeVerifier) {
    params.set("code_challenge", codeChallenge(codeVerifier));
    params.set("code_challenge_method", "S256");
  }

  res.json({ authUrl: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`, state });
}

const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

interface PendingAuth {
  /**
   * Nur bei OAuth ohne Client-Secret (öffentlicher Client) — sonst null.
   * Mit Web-Client + Secret: klassischer Server-Flow ohne PKCE (stabiler bei Google).
   */
  codeVerifier: string | null;
  returnUrl: string;
  /** Gleiche client_id wie in der authorize-URL — nicht erneut aus Env lesen. */
  clientId: string;
  /** Muss beim Token-Tausch 1:1 wie bei /auth/google/start sein (Google prüft strikt). */
  redirectUri: string;
  expiresAt: number;
}
const pending = new Map<string, PendingAuth>();

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

function codeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

function firstQueryString(q: unknown): string {
  if (typeof q === "string") return q;
  if (Array.isArray(q) && q.length > 0 && typeof q[0] === "string") return q[0];
  return "";
}

function appendQueryParams(base: string, params: Record<string, string>): string {
  const sep = base.includes("?") ? "&" : "?";
  return base + sep + new URLSearchParams(params).toString();
}

router.get("/auth/google/start", (req, res) => {
  const returnUrl =
    (req.query.returnUrl as string | undefined) ?? `${apiBaseFromReq(req)}/auth/google/done`;
  sendGoogleOAuthStart(req, res, returnUrl);
});

/**
 * Gleiche Antwort wie GET /auth/google/start (JSON mit authUrl + state), aber mit Default-returnUrl
 * fürs Partner-Panel. Optional: ?returnUrl= muss zu PANEL_ALLOWED_RETURN_ORIGINS / panel.onroda.de passen.
 * Pfade: /api/auth/panel-login oder — bei Nginx ohne /api-Präfix — /auth/panel-login
 */
router.get("/auth/panel-login", (req, res) => {
  const incoming =
    typeof req.query.returnUrl === "string" ? req.query.returnUrl.trim() : "";
  const returnUrl = incoming || panelOAuthDefaultReturnUrl();
  if (!isAllowedPanelReturnUrl(returnUrl)) {
    res.status(400).json({
      error: "invalid_return_url",
      hint:
        "returnUrl must use https://panel.onroda.de, https://admin.onroda.de, localhost, or a host listed in PANEL_ALLOWED_RETURN_ORIGINS.",
    });
    return;
  }
  sendGoogleOAuthStart(req, res, returnUrl);
});

router.get("/auth/google/callback", async (req, res) => {
  const authCode = firstQueryString(req.query.code).trim();
  const authState = firstQueryString(req.query.state);
  const oauthError = firstQueryString(req.query.error);

  console.log(
    `[auth/callback] state=${authState} code=${authCode ? "present" : "missing"} error=${oauthError || "none"} pendingStates=${[...pending.keys()].join(",")}`,
  );

  if (oauthError) {
    res.redirect(
      `${apiBaseFromReq(req)}/auth/google/done?error=${encodeURIComponent(oauthError)}`,
    );
    return;
  }

  if (!authCode || !authState) {
    res.redirect(`${apiBaseFromReq(req)}/auth/google/done?error=missing_params`);
    return;
  }

  const auth = pending.get(authState);
  if (!auth || auth.expiresAt < Date.now()) {
    pending.delete(authState);
    console.log(`[auth/callback] INVALID STATE — no match found in pending map`);
    res.redirect(`${apiBaseFromReq(req)}/auth/google/done?error=invalid_state`);
    return;
  }
  const { codeVerifier, returnUrl, redirectUri, clientId } = auth;
  console.log(
    `[auth/callback] state matched, returnUrl=${returnUrl} redirectUri=${redirectUri} pkce=${!!codeVerifier}`,
  );
  pending.delete(authState);

  const googleTokenErrorDetail = (raw: string): string => {
    try {
      const j = JSON.parse(raw) as { error?: string; error_description?: string };
      if (j.error_description) return j.error_description.slice(0, 400);
      if (j.error) return j.error.slice(0, 200);
    } catch {
      /* ignore */
    }
    return raw.trim().slice(0, 200);
  };

  try {
    const secret = googleClientSecret();
    const oauth2Client = secret
      ? new OAuth2Client(clientId, secret, redirectUri)
      : new OAuth2Client({
          clientId,
          redirectUri,
          clientAuthentication: ClientAuthentication.None,
        });

    let accessToken: string;
    let idToken: string | null = null;
    let accessTokenExpiresAt: number | null = null;
    try {
      const { tokens } = await oauth2Client.getToken({
        code: authCode,
        codeVerifier: codeVerifier ?? undefined,
        redirect_uri: redirectUri,
      });
      if (!tokens.access_token) throw new Error("Google lieferte kein access_token.");
      accessToken = tokens.access_token;
      idToken = tokens.id_token ?? null;
      accessTokenExpiresAt =
        typeof tokens.expiry_date === "number" && Number.isFinite(tokens.expiry_date)
          ? tokens.expiry_date
          : null;
    } catch (err: unknown) {
      let raw = "";
      if (err && typeof err === "object" && "response" in err) {
        const data = (err as { response?: { data?: unknown } }).response?.data;
        raw = typeof data === "string" ? data : JSON.stringify(data ?? {});
      } else if (err instanceof Error) {
        raw = err.message;
      } else {
        raw = String(err);
      }
      console.error("[auth] google-auth-library getToken:", raw);
      res.redirect(
        appendQueryParams(returnUrl, {
          error: "token_exchange_failed",
          detail: googleTokenErrorDetail(raw) || raw.slice(0, 400),
        }),
      );
      return;
    }

    const profileResp = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileResp.ok) {
      res.redirect(appendQueryParams(returnUrl, { error: "profile_fetch_failed" }));
      return;
    }

    const profile = (await profileResp.json()) as {
      sub: string;
      name?: string;
      email?: string;
      picture?: string;
    };

    void idToken;
    void accessToken;
    void accessTokenExpiresAt;

    let sessionToken: string;
    try {
      sessionToken = await signSessionJwt({
        googleId: profile.sub,
        name: profile.name ?? "",
        email: profile.email ?? "",
        photoUri: profile.picture ?? null,
      });
    } catch (jwtErr) {
      console.error("[auth] session JWT:", jwtErr);
      res.redirect(appendQueryParams(returnUrl, { error: "session_token_failed" }));
      return;
    }

    res.redirect(appendQueryParams(returnUrl, { token: sessionToken }));
  } catch (e) {
    console.error("[auth] exception:", e);
    res.redirect(appendQueryParams(returnUrl, { error: "server_error" }));
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fallback, wenn `/auth/google/start` ohne clientspezifisches `returnUrl` läuft (z. B. reiner Browser).
 * Mobile nutzt immer ein App-Deep-Link als `returnUrl` — der landet nicht hier.
 * Redirect zur Web-App **nur** bei gesetztem `OAUTH_SUCCESS_WEB_URL` (später z. B. Panel-Subdomain), nie auf die Marketing-Homepage.
 */
router.get("/auth/google/done", (req, res) => {
  const token = firstQueryString(req.query.token).trim();
  const err = firstQueryString(req.query.error);
  const detail = firstQueryString(req.query.detail);

  if (token && !err) {
    const explicit = (process.env.OAUTH_SUCCESS_WEB_URL ?? "").trim();
    if (explicit) {
      const base = /^https?:\/\//i.test(explicit)
        ? explicit
        : `https://${explicit.replace(/^\/+/, "")}`;
      res.redirect(302, appendQueryParams(base, { token }));
      return;
    }
    res.send(
      `<!DOCTYPE html><html><body><p style="font-family:sans-serif;text-align:center;margin-top:40px;max-width:520px;margin-inline:auto">
      Anmeldung abgeschlossen. Bitte die <strong>Onroda-App</strong> nutzen — dort ist der Login aktiv.<br/><br/>
      <span style="color:#6b7280;font-size:14px">Die Website onroda.de ist nur die öffentliche Startseite.</span>
      </p></body></html>`,
    );
    return;
  }

  if (err) {
    const msg = detail ? `${err} — ${detail}` : err;
    res.status(400).send(
      `<!DOCTYPE html><html><body><p style="font-family:sans-serif;text-align:center;margin-top:40px;max-width:520px;margin-inline:auto">
      <strong>Anmeldung fehlgeschlagen</strong><br/><br/>${escapeHtml(msg)}</p></body></html>`,
    );
    return;
  }

  res.send(
    `<!DOCTYPE html><html><body><p style="font-family:sans-serif;text-align:center;margin-top:40px">
    Anmeldung abgeschlossen. Diese Seite kann geschlossen werden.</p></body></html>`,
  );
});

/* ── Telefon / SMS (Stub: In-Memory; Produktion z. B. Twilio) ── */
const phoneOtps = new Map<string, { code: string; expiresAt: number }>();

router.post("/auth/phone/send", (req, res) => {
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  if (!phone || !phone.startsWith("+")) {
    res.status(400).json({ error: "invalid_phone" });
    return;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  phoneOtps.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
  const devCode =
    process.env.NODE_ENV !== "production" ? code : undefined;
  if (devCode) {
    console.info(`[auth/phone/send] ${phone} devCode=${devCode}`);
  }
  res.json({ ok: true, devCode });
});

router.post("/auth/phone/verify", (req, res) => {
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.replace(/\D/g, "").trim() : "";
  if (!phone || code.length !== 6) {
    res.status(400).json({ error: "invalid_params" });
    return;
  }
  const entry = phoneOtps.get(phone);
  if (!entry || entry.expiresAt < Date.now() || entry.code !== code) {
    res.status(400).json({ error: "invalid_code" });
    return;
  }
  phoneOtps.delete(phone);
  res.json({ ok: true });
});

/**
 * Verifiziert ein Firebase Auth ID-Token (z. B. nach Phone Sign-In in der App).
 * Client sendet { idToken }; Antwort enthält uid, phone_number etc. aus dem Token.
 */
router.post("/auth/firebase/verify-id-token", async (req, res) => {
  if (!isFirebaseAdminConfigured()) {
    res.status(503).json({
      error: "firebase_admin_not_configured",
      hint: "GOOGLE_APPLICATION_CREDENTIALS oder FIREBASE_SERVICE_ACCOUNT setzen (siehe api-server/.env.example).",
    });
    return;
  }

  const idToken = typeof req.body?.idToken === "string" ? req.body.idToken.trim() : "";
  if (!idToken) {
    res.status(400).json({ error: "idToken_required" });
    return;
  }

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(idToken);
    res.json({
      ok: true,
      uid: decoded.uid,
      phone: decoded.phone_number ?? null,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      picture: decoded.picture ?? null,
      emailVerified: decoded.email_verified ?? false,
      signInProvider: decoded.firebase?.sign_in_provider ?? null,
    });
  } catch (err) {
    console.warn("[auth/firebase/verify-id-token] invalid token", err);
    res.status(401).json({ error: "invalid_id_token" });
  }
});

/** Profil aus Session-JWT (z. B. Web-App nach Redirect mit ?token=). */
router.get("/auth/google/profile", async (req, res) => {
  const token = firstQueryString(req.query.token).trim();
  if (!token) {
    res.status(400).json({ error: "token query required", hint: "Pass the session JWT from ?token= after OAuth." });
    return;
  }
  try {
    const c = await verifySessionJwt(token);
    res.json({
      googleId: c.googleId,
      name: c.name,
      email: c.email,
      photoUri: c.photoUri,
      idToken: null,
      accessToken: null,
      accessTokenExpiresAt: null,
    });
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
});

export default router;
