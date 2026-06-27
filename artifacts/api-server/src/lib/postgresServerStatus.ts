import { sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../db/client";
import type { ResourceAmpel } from "./netdataServerStatus";

export type PostgresConnectionSnapshot = {
  available: boolean;
  database: string | null;
  totalConnections: number | null;
  activeConnections: number | null;
  idleConnections: number | null;
  maxConnections: number | null;
  percentUsed: number | null;
  ampel: ResourceAmpel;
  error: string | null;
};

function ampelForPercent(percent: number | null): ResourceAmpel {
  if (percent == null || !Number.isFinite(percent)) return "warn";
  if (percent >= 85) return "alert";
  if (percent >= 70) return "warn";
  return "ok";
}

export async function readPostgresConnectionStats(): Promise<PostgresConnectionSnapshot> {
  if (!isPostgresConfigured()) {
    return {
      available: false,
      database: null,
      totalConnections: null,
      activeConnections: null,
      idleConnections: null,
      maxConnections: null,
      percentUsed: null,
      ampel: "warn",
      error: "database_not_configured",
    };
  }

  const db = getDb();
  if (!db) {
    return {
      available: false,
      database: null,
      totalConnections: null,
      activeConnections: null,
      idleConnections: null,
      maxConnections: null,
      percentUsed: null,
      ampel: "warn",
      error: "database_unavailable",
    };
  }

  try {
    const result = await db.execute(sql`
      SELECT
        current_database() AS database_name,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
        count(*) FILTER (WHERE pid <> pg_backend_pid())::int AS total_connections,
        count(*) FILTER (WHERE pid <> pg_backend_pid() AND state = 'active')::int AS active_connections,
        count(*) FILTER (WHERE pid <> pg_backend_pid() AND state = 'idle')::int AS idle_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);

    const row = result.rows[0] as Record<string, unknown> | undefined;
    const database = typeof row?.database_name === "string" ? row.database_name : null;
    const maxConnections = Number(row?.max_connections);
    const totalConnections = Number(row?.total_connections);
    const activeConnections = Number(row?.active_connections);
    const idleConnections = Number(row?.idle_connections);
    const maxConn = Number.isFinite(maxConnections) ? maxConnections : null;
    const total = Number.isFinite(totalConnections) ? totalConnections : null;
    const percentUsed =
      maxConn != null && maxConn > 0 && total != null ? Math.max(0, Math.min(100, (total / maxConn) * 100)) : null;

    return {
      available: true,
      database,
      totalConnections: total,
      activeConnections: Number.isFinite(activeConnections) ? activeConnections : null,
      idleConnections: Number.isFinite(idleConnections) ? idleConnections : null,
      maxConnections: maxConn,
      percentUsed,
      ampel: ampelForPercent(percentUsed),
      error: null,
    };
  } catch (e) {
    return {
      available: false,
      database: null,
      totalConnections: null,
      activeConnections: null,
      idleConnections: null,
      maxConnections: null,
      percentUsed: null,
      ampel: "warn",
      error: e instanceof Error ? e.message : "postgres_stats_failed",
    };
  }
}
