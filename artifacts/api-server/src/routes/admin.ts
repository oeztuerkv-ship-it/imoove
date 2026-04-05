import { Router, type IRouter } from "express";

const router: IRouter = Router();

/** Einfaches Admin-Panel (erweiterbar). */
router.get("/admin", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Onroda Admin</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 48px auto; padding: 0 16px; }
    a { color: #dc2626; }
    code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Onroda Admin</h1>
  <p>API-Gesundheit: <a href="/api/healthz"><code>GET /api/healthz</code></a></p>
  <p>Alternativ: <a href="/api/v1/health"><code>GET /api/v1/health</code></a></p>
</body>
</html>`);
});

export default router;
