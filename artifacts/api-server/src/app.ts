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
 * Pfad zum Ordner `static/` (onroda-brand.css, index.html, partners/…).
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

/** Optionales gebautes Admin-Panel: `dist/public` neben `index.mjs`. */
function resolvePublicRoot(): string {
  const fromEnv = process.env["ADMIN_STATIC_ROOT"];
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(distDir, "public");
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

/* Partner-Bereich: Platzhalter-Seite. Express fasst /partners und /partners/ oft gleich — eine Route für beide. */
app.get(["/partners", "/partners/"], (_req, res, next) => {
  res.sendFile(path.join(staticRoot, "partners", "index.html"), (err) => {
    if (err) next(err);
  });
});
app.use(
  "/partners",
  express.static(path.join(staticRoot, "partners"), {
    index: false,
  }),
);

/* Gemeinsame Marken-Styles (Homepage + externe Einbindung); keine index.html am Root. */
app.use(
  express.static(staticRoot, {
    index: false,
  }),
);

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
    });
  }
  next();
});

/* Weitere Hosts: optionales Static-Frontend unter dist/public (falls vorhanden) */
app.use((req, res, next) => {
  const host = hostname(req);
  if (isApiHost(host)) {
    return next();
  }
  express.static(resolvePublicRoot())(req, res, next);
});

export default app;
