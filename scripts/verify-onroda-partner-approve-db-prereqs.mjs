#!/usr/bin/env node
/**
 * Prüft, ob die DB die Voraussetzungen für Partner-Registrierung → Freigabe (admin_companies INSERT) erfüllt.
 * Nutzung: DATABASE_URL=… node scripts/verify-onroda-partner-approve-db-prereqs.mjs
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFromFile(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFromFile("artifacts/api-server/.env");

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("FEHLT: DATABASE_URL (z. B. in artifacts/api-server/.env).");
  process.exit(2);
}

const c = new pg.Client({ connectionString: url });
await c.connect();

let exit = 0;
const col = await c.query(
  `select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'admin_companies' and column_name = 'partner_panel_profile_locked'`,
);
if (!col.rowCount) {
  console.error("FEHLT: Spalte admin_companies.partner_panel_profile_locked → Migration 031 einspielen.");
  exit = 1;
} else {
  console.log("OK: Spalte partner_panel_profile_locked vorhanden.");
}

const chk = await c.query(
  `select pg_get_constraintdef(c.oid) as def
   from pg_constraint c
   join pg_class t on c.conrelid = t.oid
   where t.relname = 'admin_companies' and c.conname = 'admin_companies_company_kind_chk'`,
);
if (!chk.rows[0]) {
  console.error("HINWEIS: Constraint admin_companies_company_kind_chk nicht gefunden (ungewöhnlich).");
  exit = 1;
} else {
  const def = String(chk.rows[0].def);
  console.log("CHECK company_kind:", def);
  if (!def.includes("medical")) {
    console.error("FEHLT: company_kind CHECK enthält kein 'medical' → Migration 032 einspielen.");
    exit = 1;
  } else {
    console.log("OK: company_kind erlaubt medical.");
  }
}

await c.end();
process.exit(exit);
