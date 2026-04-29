import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import router from "./routes";
import adminRouter from "./routes/admin";
import { logger } from "./lib/logger";

const app: Express = express();

function isPanelBrowserHost(h: string): boolean {
  return h === "panel.onroda.de";
}

function isAdminBrowserHost(h: string): boolean {
  return h === "admin.onroda.de";
}

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

/** Größeres Body-Limit nur für Krankenfahrt-Transportschein (Base64 in JSON); übrige Routen bleiben klein. */
app.use((req, res, next) => {
  const u = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
  const medicalUpload =
    req.method === "POST" && u.includes("/rides/") && u.includes("/medical/transport-document");
  const limit = medicalUpload ? "6mb" : "200kb";
  express.json({ limit })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: "200kb" }));

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
const staticRoot = path.join(__dirname, "../static");
const panelPublicRoot = path.join(__dirname, "../../partner-panel/dist");
function resolvePublicRoot() { return path.join(__dirname, "../../admin-panel/dist"); }

app.use((req, res, next) => {
  if (!isPanelBrowserHost(hostname(req))) return next();
  if (req.path === "/partners" || req.path.startsWith("/partners/")) return res.redirect(302, "/");
  return next();
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
  if (host === "onroda.de" || host === "www.onroda.de") return res.sendFile(path.join(staticRoot, "index.html"));
  return next();
});

app.get(["/partner/anfrage-status", "/partner-status"], (req, res, next) => {
  const host = hostname(req);
  if (host === "onroda.de" || host === "www.onroda.de") return res.sendFile(path.join(staticRoot, "partner-status.html"), (err) => { if (err) next(err); });
  return next();
});

app.get("/", (req, res, next) => {
  const host = hostname(req);
  if (host === "onroda.de" || host === "www.onroda.de") return res.sendFile(path.join(staticRoot, "index.html"));
  if (isApiHost(host)) {
    return res.json({ ok: true, service: "onroda-api" });
  }
  if (isPanelBrowserHost(host)) return res.sendFile(path.join(panelPublicRoot, "index.html"), (err) => { if (err) next(err); });
  if (isAdminBrowserHost(host)) return res.redirect(302, "/partners/");
  return next();
});

export default app;
