import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import pinoHttp from "pino-http";
import router from "./routes";
import ridesRouter from "./routes/rides";
import adminRouter from "./routes/admin";
import { logger } from "./lib/logger";

const app: Express = express();

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

/* Gemeinsame Marken-Styles (Homepage + externe Einbindung); keine index.html-Autoverzeichnis-Auslieferung. */
app.use(
  express.static(path.join(process.cwd(), "static"), {
    index: false,
  }),
);

/* Root: Marketing-Domain = nur öffentliche Homepage; App = Mobile + API; Panel später eigene Subdomain. */
app.get("/", (req, res, next) => {
  const host = hostname(req);
  if (host === "onroda.de" || host === "www.onroda.de") {
    const filePath = path.join(process.cwd(), "static", "index.html");
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
  const publicPath = path.join(process.cwd(), "dist", "public");
  express.static(publicPath)(req, res, next);
});

export default app;
