import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import router from "./routes";
import adminRouter from "./routes/admin";
import { logger } from "./lib/logger";

const app: Express = express();

/**
 * Pfad zum Ordner `static/` (onroda-brand.css, Marketing-index.html).
 * Nicht `process.cwd()` — in Production ist das oft nicht das api-server-Verzeichnis.
 * Gebündelter Einstieg: `dist/index.mjs` → ein Verzeichnis darüber liegt `static/`.
 */
function resolveStaticRoot(): string {
  const fromEnv = process.env["STATIC_ROOT"];
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(distDir, "..", "static");
}

/**
 * Gebautes Admin-Panel (Vite, base `/partners/`).
 * Standard: `artifacts/admin-panel/dist` (API-Build löscht `dist/`, daher nicht unter api-server/dist/public).
 *
 * Hinweis: `/partners/` bleibt als technischer Pfad für den Admin-Build erhalten,
 * wird aber nur noch auf dem Admin-Host ausgeliefert.
 */
function resolvePublicRoot(): string {
  const fromEnv = process.env["ADMIN_STATIC_ROOT"];
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }
  const apiDistDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(apiDistDir, "..", "..", "admin-panel", "dist");
}

/** Partner-Portal (Vite base `/` → partner-panel/dist), Host panel.onroda.de. */
function resolvePanelPublicRoot(): string {
  const fromEnv = process.env["PANEL_STATIC_ROOT"];
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }
  const apiDistDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(apiDistDir, "..", "..", "partner-panel", "dist");
}

const staticRoot = resolveStaticRoot();
const panelPublicRoot = resolvePanelPublicRoot();

function isPanelBrowserHost(h: string): boolean {
  return h === "panel.onroda.de";
}

function isAdminBrowserHost(h: string): boolean {
  return h === "admin.onroda.de";
}

/* Hinter Nginx/Ingress: korrektes req.protocol / Host für OAuth-Redirects */
app.set("trust proxy", 1);

function hostname(req: express.Request): string {
  const fromTrust = (req.hostname ?? "").toLowerCase();
  if (fromTrust) return fromTrust;
  return (req.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
}

function isApiHost(h: string): boolean {
  return (
    h === "api.onroda.de" ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.endsWith(".ngrok-free.dev") ||
    h.endsWith(".ngrok-free.app") ||
    h.endsWith(".ngrok.io")
  );
}

/** Browser-Origins, die die API per CORS ansprechen dürfen (Admin-/Panel-Subdomains, Marketing, Dev). */
function buildCorsAllowedOrigins(): Set<string> {
  const set = new Set<string>([
    "https://onroda.de",
    "https://www.onroda.de",
    "https://api.onroda.de",
    "https://admin.onroda.de",
    "https://panel.onroda.de",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:4175",
    "http://127.0.0.1:4175",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const extra = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of extra) {
    set.add(o);
  }
  return set;
}

const corsAllowedOrigins = buildCorsAllowedOrigins();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsAllowedOrigins.has(origin)) {
        callback(null, origin);
        return;
      }
      if (process.env.NODE_ENV !== "production") {
        callback(null, origin);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86400,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
 * WICHTIG: API- und Admin-Routen zuerst – vor Static/Marketing,
 * sonst kann express.static oder Host-Logik Anfragen verschlucken.
 *
 * Doppel-Mount: Viele Nginx-Setups proxy_pass mit URI `/api/…` auf den Node-Upstream;
 * andere entfernen das Präfix und liefern `/admin/…` direkt. Beides soll dieselbe App treffen.
 */
app.use("/api", router);
app.use(router);
app.use(adminRouter);

/* Partner-Host: /partners* vor Admin-Static — darf niemals die Admin-SPA treffen. */
app.use((req, res, next) => {
  if (!isPanelBrowserHost(hostname(req))) {
    return next();
  }
  if (req.path === "/partners" || req.path.startsWith("/partners/")) {
    return res.redirect(302, "/");
  }
  return next();
});

/* Admin-Panel (Vite-Build mit base `/partners/` → admin-panel/dist), nur auf admin.onroda.de. */
const adminPublicRoot = resolvePublicRoot();
app.use("/partners", (req, res, next) => {
  if (!isAdminBrowserHost(hostname(req))) {
    return next();
  }
  express.static(adminPublicRoot)(req, res, (err) => {
    if (err) return next(err);
    return next();
  });
});
app.use("/partners", (req, res, next) => {
  if (!isAdminBrowserHost(hostname(req))) {
    return next();
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }
  res.sendFile(path.join(adminPublicRoot, "index.html"), (err) => {
    if (err) next(err);
  });
});

/* Partner-Panel SPA: nur Host panel.onroda.de (API bleibt api.onroda.de). */
app.use((req, res, next) => {
  if (!isPanelBrowserHost(hostname(req))) {
    return next();
  }
  express.static(panelPublicRoot)(req, res, next);
});
app.use((req, res, next) => {
  if (!isPanelBrowserHost(hostname(req))) {
    return next();
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }
  if (req.path.startsWith("/partners")) {
    return next();
  }
  res.sendFile(path.join(panelPublicRoot, "index.html"), (err) => {
    if (err) next(err);
  });
});

/* Marketing-Static darf /partners nicht bedienen (kein altes static/partners mehr überschreiben). */
app.use((req, res, next) => {
  const p = req.path;
  if (p === "/partners" || p.startsWith("/partners/")) {
    return next();
  }
  express.static(staticRoot, { index: false })(req, res, next);
});

/* Root: Marketing-Domain = nur öffentliche Homepage; App = Mobile + API; Panel später eigene Subdomain. */
app.get(["/partnerschaft", "/partner"], (req, res, next) => {
  const host = hostname(req);
  if (host === "onroda.de" || host === "www.onroda.de") {
    return res.sendFile(path.join(staticRoot, "index.html"));
  }
  return next();
});

app.get("/", (req, res, next) => {
  const host = hostname(req);
  if (host === "onroda.de" || host === "www.onroda.de") {
    const filePath = path.join(staticRoot, "index.html");
    return res.sendFile(filePath);
  }
  if (isApiHost(host)) {
    return res.json({
      ok: true,
      service: "onroda-api",
      health: "/api/healthz",
      healthV1: "/api/v1/health",
      admin: "/admin",
      adminPanel: "https://admin.onroda.de/partners/",
      partnerPanel: "https://panel.onroda.de/",
      partnerAuth: {
        googlePanelStart: "/api/auth/panel-login",
        panelPasswordLogin: "/api/panel-auth/login",
        panelMe: "/api/panel/v1/me",
        panelCompany: "/api/panel/v1/company",
        panelCompanyPatch: "PATCH /api/panel/v1/company",
        panelRidesList: "/api/panel/v1/rides",
        panelRidesCreate: "POST /api/panel/v1/rides",
        panelHealth: "/api/panel/v1/health",
        panelLogout: "/api/panel-auth/logout",
        fleetAuthLogin: "/api/fleet-auth/login",
        fleetDriverMe: "/api/fleet-driver/v1/me",
      },
    });
  }
  if (isPanelBrowserHost(host)) {
    return res.sendFile(path.join(panelPublicRoot, "index.html"), (err) => {
      if (err) next(err);
    });
  }
  if (isAdminBrowserHost(host)) {
    return res.redirect(302, "/partners/");
  }
  return next();
});

export default app;
