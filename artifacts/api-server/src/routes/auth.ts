import { Router } from "express";
import { createHash, randomBytes } from "crypto";

const router = Router();

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ??
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ??
  "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

const API_BASE = (() => {
  const domain = process.env.REPLIT_DEV_DOMAIN ?? "";
  return domain ? `https://${domain}/api` : "";
})();

const CALLBACK_URI = () => `${API_BASE}/auth/google/callback`;

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

interface PendingAuth {
  codeVerifier: string;
  returnUrl: string;
  expiresAt: number;
}
interface ProfileCache {
  googleId: string;
  name: string;
  email: string;
  photoUri: string | null;
  expiresAt: number;
}

const pending = new Map<string, PendingAuth>();
const profiles = new Map<string, ProfileCache>();

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

function codeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

router.get("/auth/google/start", (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(500).json({ error: "Google Client ID not configured" });
    return;
  }

  const returnUrl = (req.query.returnUrl as string | undefined) ?? `${API_BASE}/auth/google/done`;
  const state = base64url(randomBytes(16));
  const verifier = generateCodeVerifier();
  const challenge = codeChallenge(verifier);

  console.log(`[auth/start] state=${state} returnUrl=${returnUrl}`);
  pending.set(state, { codeVerifier: verifier, returnUrl, expiresAt: Date.now() + 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: CALLBACK_URI(),
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "select_account",
  });

  res.json({ authUrl: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`, state });
});

router.get("/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  console.log(`[auth/callback] state=${state} code=${code ? "present" : "missing"} error=${error ?? "none"} pendingStates=${[...pending.keys()].join(",")}`);

  if (error) {
    res.redirect(`${API_BASE}/auth/google/done?error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${API_BASE}/auth/google/done?error=missing_params`);
    return;
  }

  const auth = pending.get(state);
  if (!auth || auth.expiresAt < Date.now()) {
    pending.delete(state);
    console.log(`[auth/callback] INVALID STATE — no match found in pending map`);
    res.redirect(`${API_BASE}/auth/google/done?error=invalid_state`);
    return;
  }
  const { codeVerifier, returnUrl } = auth;
  console.log(`[auth/callback] state matched, returnUrl=${returnUrl}`);
  pending.delete(state);

  const addParams = (base: string, params: Record<string, string>) => {
    const sep = base.includes("?") ? "&" : "?";
    return base + sep + new URLSearchParams(params).toString();
  };

  try {
    const tokenResp = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: CALLBACK_URI(),
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!tokenResp.ok) {
      const t = await tokenResp.text();
      console.error("[auth] token exchange failed:", t);
      res.redirect(addParams(returnUrl, { error: "token_exchange_failed" }));
      return;
    }

    const tokenData = (await tokenResp.json()) as { access_token: string };
    const profileResp = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResp.ok) {
      res.redirect(addParams(returnUrl, { error: "profile_fetch_failed" }));
      return;
    }

    const profile = (await profileResp.json()) as {
      sub: string;
      name?: string;
      email?: string;
      picture?: string;
    };

    const resultState = base64url(randomBytes(16));
    profiles.set(resultState, {
      googleId: profile.sub,
      name: profile.name ?? "",
      email: profile.email ?? "",
      photoUri: profile.picture ?? null,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.redirect(addParams(returnUrl, { result: resultState }));
  } catch (e) {
    console.error("[auth] exception:", e);
    res.redirect(addParams(returnUrl, { error: "server_error" }));
  }
});

router.get("/auth/google/done", (_req, res) => {
  res.send(
    `<!DOCTYPE html><html><body><p style="font-family:sans-serif;text-align:center;margin-top:40px">
    Anmeldung abgeschlossen. Diese Seite kann geschlossen werden.</p></body></html>`,
  );
});

router.get("/auth/google/profile", (req, res) => {
  const { result } = req.query as { result?: string };
  if (!result) {
    res.status(400).json({ error: "result param required" });
    return;
  }
  const profile = profiles.get(result);
  if (!profile || profile.expiresAt < Date.now()) {
    profiles.delete(result ?? "");
    res.status(404).json({ error: "Profile not found or expired" });
    return;
  }
  profiles.delete(result);
  res.json({
    googleId: profile.googleId,
    name: profile.name,
    email: profile.email,
    photoUri: profile.photoUri,
  });
});

export default router;
