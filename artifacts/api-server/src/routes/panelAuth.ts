import { Router } from "express";
import { getDb } from "../db/client.js";
import { sql } from "drizzle-orm";
import { verifyPassword } from "../lib/password.js";
import { signPanelJwt } from "../lib/panelJwt.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/login", async (req, res) => {
  const rawUsername = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const username = rawUsername.trim();

  if (!username || !password) {
    res.status(400).json({ error: "username_and_password_required" });
    return;
  }

  const db = getDb();
  if (!db) {
    logger.error("Database connection could not be established");
    res.status(500).json({ error: "database_error" });
    return;
  }

  try {
    // Wir nutzen getDb() und führen eine SQL-Abfrage aus
    const result = await db.execute(sql`
      SELECT 
        u.*, 
        c.name as company_name, 
        c.company_kind 
      FROM panel_users u
      JOIN admin_companies c ON c.id = u.company_id
      WHERE lower(trim(u.username)) = lower(trim(${username}))
         OR lower(trim(u.email)) = lower(trim(${username}))
      LIMIT 1
    `);

    // Bei Drizzle/pg liegen die Daten in .rows
    const row = result.rows[0] as any;

    if (!row || !row.is_active) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      logger.warn({ username }, "Login failed: wrong password");
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const token = await signPanelJwt({
      panelUserId: row.id,
      companyId: row.company_id,
      username: row.username,
      email: row.email,
      role: row.role,
    });

    res.json({
      ok: true,
      token,
      passwordChangeRequired: row.must_change_password,
      user: {
        id: row.id,
        username: row.username,
        email: row.email,
        role: row.role,
        companyId: row.company_id,
        company: {
          id: row.company_id,
          name: row.company_name,
          company_kind: row.company_kind 
        }
      },
    });
  } catch (err) {
    logger.error({ err }, "Database error during login");
    res.status(500).json({ error: "internal_server_error" });
  }
});

export default router;
