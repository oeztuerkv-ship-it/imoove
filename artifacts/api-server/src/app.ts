import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import router from "./routes";
import ridesRouter from "./routes/rides";
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
 */
function resolvePublicRoot(): string {
  const fromEnv = process.env["ADMIN_STATIC_ROOT"];
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }
  const apiDistDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(apiDistDir, "..", "..", "admin-panel", "dist");
}

const staticRoot = resolveStaticRoot();

/* Hinter Nginx/Ingress: korrektes req.protocol / Host für OAuth-Redirects */
app.set("trust proxy", 1);

function hostname(req: express.Request): string {
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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
 * WICHTIG: API- und Admin-Routen zuerst – vor Static/Marketing,
 * sonst kann express.static oder Host-Logik Anfragen verschlucken.
 */
app.use("/api", router);
app.use(ridesRouter);
app.use(adminRouter);

/* Admin-Panel (Vite-Build mit base `/partners/` → admin-panel/dist). */
const adminPublicRoot = resolvePublicRoot();
app.use("/partners", express.static(adminPublicRoot));
app.use("/partners", (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }
  res.sendFile(path.join(adminPublicRoot, "index.html"), (err) => {
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
      adminPanel: "/partners/",
    });
  }
  /* z. B. admin.onroda.de: Root auf gebaute App unter /partners/ */
  return res.redirect(302, "/partners/");
});

export default app;
