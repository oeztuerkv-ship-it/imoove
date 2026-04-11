import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

let pool: pg.Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

function connectionString(): string | null {
  const u = (process.env.DATABASE_URL ?? "").trim();
  return u.length > 0 ? u : null;
}

export function isPostgresConfigured(): boolean {
  return connectionString() !== null;
}

export function getDb(): NodePgDatabase<typeof schema> | null {
  if (!isPostgresConfigured()) return null;
  if (db) return db;
  const url = connectionString()!;
  pool = new pg.Pool({ connectionString: url, max: 10 });
  db = drizzle(pool, { schema });
  return db;
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
