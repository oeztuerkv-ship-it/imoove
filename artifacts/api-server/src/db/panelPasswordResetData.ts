import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, isPostgresConfigured } from "./client";
import { panelPasswordResetsTable } from "./schema";

export type PanelPasswordResetRow = {
  id: string;
  panelUserId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export async function createPanelPasswordResetToken(input: {
  panelUserId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<PanelPasswordResetRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .insert(panelPasswordResetsTable)
    .values({
      id: randomUUID(),
      panel_user_id: input.panelUserId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      created_at: new Date(),
    })
    .returning({
      id: panelPasswordResetsTable.id,
      panelUserId: panelPasswordResetsTable.panel_user_id,
      tokenHash: panelPasswordResetsTable.token_hash,
      expiresAt: panelPasswordResetsTable.expires_at,
      usedAt: panelPasswordResetsTable.used_at,
      createdAt: panelPasswordResetsTable.created_at,
    });
  return rows[0] ?? null;
}

export async function findUsablePanelPasswordResetByTokenHash(
  tokenHash: string,
): Promise<PanelPasswordResetRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: panelPasswordResetsTable.id,
      panelUserId: panelPasswordResetsTable.panel_user_id,
      tokenHash: panelPasswordResetsTable.token_hash,
      expiresAt: panelPasswordResetsTable.expires_at,
      usedAt: panelPasswordResetsTable.used_at,
      createdAt: panelPasswordResetsTable.created_at,
    })
    .from(panelPasswordResetsTable)
    .where(eq(panelPasswordResetsTable.token_hash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

export async function markPanelPasswordResetUsed(id: string): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  if (!db) return;
  await db
    .update(panelPasswordResetsTable)
    .set({ used_at: new Date() })
    .where(eq(panelPasswordResetsTable.id, id));
}
