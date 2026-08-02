import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import router from "./routes";
import adminRouter from "./routes/admin";
import { handleStripeWebhook } from "./routes/stripeWebhook.js";
import { logger } from "./lib/logger";
import { isPostgresConfigured } from "./db/client";
import { getLegalPagePublic, type LegalPageSlug } from "./db/legalPagesData";
import { getHomepageContentPublic } from "./db/homepageContentData";
import { renderLegalPageHtml } from "./lib/renderLegalPageHtml";
import { injectMarketingMetaDescription } from "./lib/injectMarketingMetaDescription";
import fs from "node:fs/promises";

const app: Express = express();

function isPanelBrowserHost(h: string): boolean {
  return h === "panel.onroda.de";
}

function isAdminBrowserHost(h: string): boolean {
  return h === "admin.onroda.de";
}

app.set("trust proxy", 1);

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Mobile App + diverse Origins
  crossOriginEmbedderPolicy: false,
}));

// Rate Limiting — Auth-Endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 20, // max 20 Requests pro IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Zu viele Anfragen. Bitte warte 15 Minuten." },
});
const generalRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 Minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Zu viele Anfragen." },
});
app.use("/admin/auth/login", authRateLimit);
app.use("/api/admin/auth/login", authRateLimit);
app.use("/panel/v1/auth/login", authRateLimit);
app.use("/api/panel/v1/auth/login", authRateLimit);
app.use("/fleet/auth/login", authRateLimit);
app.use("/api/fleet/auth/login", authRateLimit);
app.use(generalRateLimit);

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

/** Stripe Webhook: Signatur braucht unveränderten Raw-Body (vor express.json). */
const stripeWebhookRawBody = express.raw({ type: "application/json" });
app.post("/api/stripe/webhook", stripeWebhookRawBody, (req, res) => {
  void handleStripeWebhook(req, res);
});
app.post("/stripe/webhook", stripeWebhookRawBody, (req, res) => {
  void handleStripeWebhook(req, res);
});

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

/** Pfad für große JSON-Bodies (Base64-Bilder/PDFs). originalUrl und url prüfen (/api/… und ohne Präfix). */
function requestPathname(req: express.Request): string {
  const raw = (req.originalUrl ?? req.url ?? req.path ?? "").split("?")[0] ?? "";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function isMedicalLargeJsonPost(pathname: string): boolean {
  return (
    /\/fleet-driver\/v1\/medical\/scan(?:-test)?\/?$/.test(pathname) ||
    /\/customer\/v1\/medical\/scan(?:-test)?\/?$/.test(pathname) ||
    (/\/rides\/[^/]+\/medical\/(?:transport-document|signature)\/?$/.test(pathname)) ||
    /\/fleet-driver\/v1\/avatar\/?$/.test(pathname)
  );
}

const jsonBodyDefault = express.json({ limit: "200kb" });
const jsonBodyMedical = express.json({ limit: "10mb" });
const jsonBodyPartnerRegInitial = express.json({ limit: "25mb" });
const jsonBodyPartnerRegDoc = express.json({ limit: "12mb" });
const urlencodedDefault = express.urlencoded({ extended: true, limit: "200kb" });

app.use((req, res, next) => {
  const ct = String(req.headers["content-type"] ?? "").toLowerCase();
  if (ct.includes("multipart/form-data")) {
    return next();
  }
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") {
    return jsonBodyDefault(req, res, next);
  }
  const pathname = requestPathname(req);
  if (isMedicalLargeJsonPost(pathname)) {
    return jsonBodyMedical(req, res, next);
  }
  if (/\/panel-auth\/registration-request\/?$/.test(pathname)) {
    return jsonBodyPartnerRegInitial(req, res, next);
  }
  if (/\/panel-auth\/registration-request\/[^/]+\/documents\/?$/.test(pathname)) {
    return jsonBodyPartnerRegDoc(req, res, next);
  }
  return jsonBodyDefault(req, res, next);
});

/** Nach JSON-Parser: urlencoded nur bei nicht-JSON (sonst doppeltes Lesen / falsches Limit). */
app.use((req, res, next) => {
  const ct = String(req.headers["content-type"] ?? "").toLowerCase();
  if (ct.includes("application/json") || ct.includes("multipart/form-data")) {
    return next();
  }
  return urlencodedDefault(req, res, next);
});

app.use("/api", router);
app.use(router);
app.use(adminRouter);
/**
 * Panel-Auth inkl. öffentlicher Partner-Registrierung: `routes/index.ts` → `router.use(panelAuthRouter)`.
 * Kanonische URLs: `/api/panel-auth/...` (kein zweites Mount unter `/api/panel-auth`, sonst entstehen
 * Pfade mit doppeltem `panel-auth`).
 */

// Restliche Middleware und Static-Logik
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "../../marketing-site");
const panelPublicRoot = path.join(__dirname, "../../partner-panel/dist");
function resolvePublicRoot() { return path.join(__dirname, "../../admin-panel/dist"); }

app.use((req, res, next) => {
  if (!isPanelBrowserHost(hostname(req))) return next();
  if (req.path === "/partners" || req.path.startsWith("/partners/")) return res.redirect(302, "/");
  return next();
});

function isMarketingHost(host: string): boolean {
  return host === "onroda.de" || host === "www.onroda.de";
}

async function serveMarketingHomepage(req: express.Request, res: express.Response, next: express.NextFunction) {
  const indexPath = path.join(staticRoot, "index.html");
  try {
    let html = await fs.readFile(indexPath, "utf8");
    if (isPostgresConfigured()) {
      const content = await getHomepageContentPublic();
      const subline = (content?.heroSubline ?? "").trim();
      if (subline) {
        html = injectMarketingMetaDescription(html, subline);
      }
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(html);
  } catch (e) {
    res.sendFile(indexPath, (err) => {
      if (err) next(err);
    });
  }
}

async function serveMarketingLegalPage(slug: LegalPageSlug, req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isMarketingHost(hostname(req))) return next();
  if (!isPostgresConfigured()) {
    return res.sendFile(path.join(staticRoot, `${slug}.html`), (err) => {
      if (err) next(err);
    });
  }
  try {
    const page = await getLegalPagePublic(slug);
    if (!page) {
      res.status(404).send("Seite nicht gefunden");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(renderLegalPageHtml(page));
  } catch (e) {
    next(e);
  }
}

app.get("/agb", (req, res, next) => {
  void serveMarketingLegalPage("agb", req, res, next);
});
app.get("/datenschutz", (req, res, next) => {
  void serveMarketingLegalPage("datenschutz", req, res, next);
});
app.get("/impressum", (req, res, next) => {
  void serveMarketingLegalPage("impressum", req, res, next);
});

// Admin-Static
const adminPublicRoot = resolvePublicRoot();
app.use("/partners", (req, res, next) => {
  if (!isAdminBrowserHost(hostname(req))) return next();
  express.static(adminPublicRoot)(req, res, (err) => { if (err) return next(err); return next(); });
});
app.use("/partners", (req, res, next) => {
  if (!isAdminBrowserHost(hostname(req))) return next();
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  res.sendFile(path.join(adminPublicRoot, "index.html"), (err) => { if (err) next(err); });
});

// Panel-Static
app.use((req, res, next) => {
  if (!isPanelBrowserHost(hostname(req))) return next();
  express.static(panelPublicRoot)(req, res, next);
});
app.use((req, res, next) => {
  if (!isPanelBrowserHost(hostname(req))) return next();
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/partners")) return next();
  res.sendFile(path.join(panelPublicRoot, "index.html"), (err) => { if (err) next(err); });
});

app.use((req, res, next) => {
  const p = req.path;
  if (p === "/partners" || p.startsWith("/partners/")) return next();
  express.static(staticRoot, { index: false })(req, res, next);
});

app.get(["/partnerschaft", "/partner"], (req, res, next) => {
  const host = hostname(req);
  if (host === "onroda.de" || host === "www.onroda.de") {
    void serveMarketingHomepage(req, res, next);
    return;
  }
  return next();
});

app.get(["/partner/anfrage-status", "/partner-status"], (req, res, next) => {
  const host = hostname(req);
  if (host === "onroda.de" || host === "www.onroda.de") return res.sendFile(path.join(staticRoot, "partner-status.html"), (err) => { if (err) next(err); });
  return next();
});

app.get("/konto-loeschen", (req, res, next) => {
  const host = hostname(req);
  if (host === "onroda.de" || host === "www.onroda.de") {
    return res.sendFile(path.join(staticRoot, "konto-loeschen.html"), (err) => { if (err) next(err); });
  }
  return next();
});

app.get("/fixpreise", (req, res, next) => {
  const host = hostname(req);
  if (host === "onroda.de" || host === "www.onroda.de") {
    return res.sendFile(path.join(staticRoot, "fixpreise.html"), (err) => { if (err) next(err); });
  }
  return next();
});

app.get("/", (req, res, next) => {
  const host = hostname(req);
  if (host === "onroda.de" || host === "www.onroda.de") {
    void serveMarketingHomepage(req, res, next);
    return;
  }
  if (isApiHost(host)) {
    return res.json({ ok: true, service: "onroda-api" });
  }
  if (isPanelBrowserHost(host)) return res.sendFile(path.join(panelPublicRoot, "index.html"), (err) => { if (err) next(err); });
  if (isAdminBrowserHost(host)) return res.redirect(302, "/partners/");
  return next();
});

export default app;
