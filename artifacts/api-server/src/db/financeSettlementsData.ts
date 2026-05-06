import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./client";
import {
  financialAuditLogTable,
  paymentsTable,
  rideFinancialsTable,
  settlementRideAllocationsTable,
  settlementsTable,
} from "./schema";

type ExecDb = NonNullable<ReturnType<typeof getDb>>;

async function insertFinancialAuditInTx(
  tx: ExecDb,
  input: {
    entityType: string;
    entityId: string;
    action: string;
    newValue: Record<string, unknown>;
    oldValue?: Record<string, unknown>;
    actorType: string;
    actorId?: string | null;
  },
): Promise<void> {
  await tx.insert(financialAuditLogTable).values({
    id: `fal-${randomUUID()}`,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    old_value_json: input.oldValue ?? {},
    new_value_json: input.newValue,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
  });
}

/** Admin: Settlement für Partner anlegen oder bei gleicher `idempotency_key` zurückgeben (Retry-safe). */
export async function adminCreateSettlementWithRideAllocations(input: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  rideIds: string[];
  idempotencyKey?: string | null;
  actorLabel: string;
}): Promise<
  | { ok: true; settlementId: string; idempotent?: boolean }
  | { ok: false; error: string; conflictSettlementId?: string }
> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const companyId = input.companyId.trim();
  const periodStart = input.periodStart.trim();
  const periodEnd = input.periodEnd.trim();
  const rideIds = [...new Set(input.rideIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  const keyFiltered = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";

  if (!companyId || !periodStart || !periodEnd || rideIds.length === 0) {
    return { ok: false, error: "invalid_input" };
  }

  if (keyFiltered) {
    const prior = await db
      .select()
      .from(settlementsTable)
      .where(eq(settlementsTable.idempotency_key, keyFiltered))
      .limit(1);
    const p = prior[0];
    if (p) {
      if (p.company_id !== companyId) {
        return { ok: false, error: "idempotency_company_mismatch", conflictSettlementId: p.id };
      }
      const allocs = await db
        .select({ rideId: settlementRideAllocationsTable.ride_id })
        .from(settlementRideAllocationsTable)
        .where(eq(settlementRideAllocationsTable.settlement_id, p.id));
      const sortedExpected = [...rideIds].sort().join("|");
      const sortedGot = allocs.map((a) => a.rideId).sort().join("|");
      if (sortedExpected !== sortedGot) {
        return { ok: false, error: "idempotency_ride_set_mismatch", conflictSettlementId: p.id };
      }
      return { ok: true, settlementId: p.id, idempotent: true };
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const sortedRideIds = [...rideIds].sort();

      /** Zuerst Sperren/Validierung, dann Settlement-Kopf (vermeidet leere Settlement-Zeilen bei Abbruch). */
      type RfRow = (typeof rideFinancialsTable.$inferSelect);
      const lockedRows: Array<{ rideId: string; rf: RfRow }> = [];
      for (const rideId of sortedRideIds) {
        const rows = await tx
          .select()
          .from(rideFinancialsTable)
          .where(eq(rideFinancialsTable.ride_id, rideId))
          .for("update")
          .limit(1);
        const rf = rows[0];
        if (!rf) {
          throw Object.assign(new Error("ride_financial_not_found"), { code: "ride_financial_not_found", rideId });
        }
        if ((rf.partner_company_id ?? "").trim() !== companyId) {
          throw Object.assign(new Error("ride_company_mismatch"), { code: "ride_company_mismatch", rideId });
        }
        if (!["open", "calculated"].includes(String(rf.settlement_status ?? ""))) {
          throw Object.assign(new Error("settlement_status_not_eligible"), {
            code: "settlement_status_not_eligible",
            rideId,
          });
        }
        const dup = await tx
          .select({ settlement_id: settlementRideAllocationsTable.settlement_id })
          .from(settlementRideAllocationsTable)
          .where(eq(settlementRideAllocationsTable.ride_id, rideId))
          .limit(1);
        if (dup[0]) {
          throw Object.assign(new Error("ride_already_allocated"), {
            code: "ride_already_allocated",
            rideId,
            settlementId: dup[0].settlement_id,
          });
        }
        lockedRows.push({ rideId, rf });
      }

      const settlementNumber = `ST-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
      const settlementId = `setl-${randomUUID().replace(/-/g, "").slice(0, 22)}`;

      await tx.insert(settlementsTable).values({
        id: settlementId,
        company_id: companyId,
        settlement_number: settlementNumber,
        period_start: periodStart,
        period_end: periodEnd,
        gross_revenue: 0,
        platform_commission: 0,
        adjustments: 0,
        payout_amount: 0,
        status: "draft",
        payment_reference: "",
        ...(keyFiltered ? { idempotency_key: keyFiltered } : {}),
        metadata_json: { createdByActor: input.actorLabel, rideIds: sortedRideIds },
      });

      let sumGross = 0;
      let sumComm = 0;
      let sumPay = 0;

      for (const { rideId, rf } of lockedRows) {
        await tx.insert(settlementRideAllocationsTable).values({
          settlement_id: settlementId,
          ride_id: rideId,
          ride_financial_id: rf.id,
          gross_amount_snap: rf.gross_amount,
          commission_amount_snap: rf.commission_amount,
          operator_payout_snap: rf.operator_payout_amount,
        });
        sumGross += Number(rf.gross_amount ?? 0);
        sumComm += Number(rf.commission_amount ?? 0);
        sumPay += Number(rf.operator_payout_amount ?? 0);
        await tx
          .update(rideFinancialsTable)
          .set({
            settlement_status: "calculated",
            updated_at: new Date(),
          })
          .where(eq(rideFinancialsTable.id, rf.id));
      }

      await tx
        .update(settlementsTable)
        .set({
          gross_revenue: Math.round(sumGross * 100) / 100,
          platform_commission: Math.round(sumComm * 100) / 100,
          payout_amount: Math.round(sumPay * 100) / 100,
          updated_at: new Date(),
        })
        .where(eq(settlementsTable.id, settlementId));

      await insertFinancialAuditInTx(tx, {
        entityType: "settlement",
        entityId: settlementId,
        action: "settlement_created_with_allocations",
        newValue: {
          companyId,
          rideCount: rideIds.length,
          gross: sumGross,
          idempotencyKey: keyFiltered || null,
        },
        actorType: "admin",
        actorId: input.actorLabel,
      });

      return { ok: true as const, settlementId };
    });
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    if (err.code === "ride_financial_not_found") return { ok: false, error: "ride_financial_not_found" };
    if (err.code === "ride_company_mismatch") return { ok: false, error: "ride_company_mismatch" };
    if (err.code === "settlement_status_not_eligible") return { ok: false, error: "settlement_status_not_eligible" };
    if (err.code === "ride_already_allocated") {
      return {
        ok: false,
        error: "ride_already_allocated",
        conflictSettlementId: (e as { settlementId?: string }).settlementId,
      };
    }
    // Unique idempotency key race
    const msg = String(err.message ?? "");
    if ((msg.includes("settlements_idempotency_key_unique") || msg.includes("duplicate key")) && keyFiltered) {
      const dupq = await db
        .select()
        .from(settlementsTable)
        .where(eq(settlementsTable.idempotency_key, keyFiltered))
        .limit(1);
      const dup = dupq[0];
      if (dup && dup.company_id === companyId) {
        const allocs = await db
          .select({ rideId: settlementRideAllocationsTable.ride_id })
          .from(settlementRideAllocationsTable)
          .where(eq(settlementRideAllocationsTable.settlement_id, dup.id));
        const sortedExpected = [...rideIds].sort().join("|");
        const sortedGot = allocs.map((a) => a.rideId).sort().join("|");
        if (sortedExpected === sortedGot) return { ok: true, settlementId: dup.id, idempotent: true };
      }
    }
    throw e;
  }
}

/** Genau eine offene/booked Zahlungszeile je Settlement (partial unique Index + zweite Prüfung in Tx). */
export async function adminRecordSettlementPayoutAttempt(input: {
  settlementId: string;
  companyId?: string | null;
  amount: number;
  reference?: string;
  paymentMethod?: string;
  actorLabel: string;
}): Promise<
  { ok: true; paymentId: string; idempotent?: boolean } | { ok: false; error: string }
> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const sid = input.settlementId.trim();
  if (!sid) return { ok: false, error: "settlement_required" };
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) return { ok: false, error: "bad_amount" };

  try {
    return await db.transaction(async (tx) => {
      const stRows = await tx
        .select()
        .from(settlementsTable)
        .where(eq(settlementsTable.id, sid))
        .for("update")
        .limit(1);
      const st = stRows[0];
      if (!st) throw Object.assign(new Error("not_found"), { code: "settlement_not_found" });
      if (input.companyId && st.company_id !== String(input.companyId).trim()) {
        throw Object.assign(new Error("company_mismatch"), { code: "company_mismatch" });
      }

      const openpay = await tx
        .select()
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.target_type, "settlement"),
            eq(paymentsTable.target_id, sid),
            inArray(paymentsTable.status, ["pending", "booked"]),
          ),
        )
        .orderBy(desc(paymentsTable.created_at))
        .limit(2);
      if (openpay[0]) {
        await insertFinancialAuditInTx(tx, {
          entityType: "payment",
          entityId: openpay[0].id,
          action: "settlement_payment_idempotent_skip",
          newValue: { settlementId: sid, existingStatus: openpay[0].status },
          actorType: "admin",
          actorId: input.actorLabel,
        });
        return { ok: true as const, paymentId: openpay[0].id, idempotent: true };
      }

      const pid = `pay-${randomUUID()}`;
      await tx.insert(paymentsTable).values({
        id: pid,
        target_type: "settlement",
        target_id: sid,
        company_id: st.company_id,
        payment_method: (input.paymentMethod ?? "bank_transfer").trim() || "bank_transfer",
        amount,
        paid_at: null,
        reference: (input.reference ?? "").trim(),
        status: "pending",
        metadata_json: { createdByActor: input.actorLabel },
      });

      await insertFinancialAuditInTx(tx, {
        entityType: "payment",
        entityId: pid,
        action: "settlement_payment_created",
        newValue: { settlementId: sid, amount, reference: (input.reference ?? "").trim() },
        actorType: "admin",
        actorId: input.actorLabel,
      });

      return { ok: true as const, paymentId: pid };
    });
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    if (err.code === "settlement_not_found") return { ok: false, error: "settlement_not_found" };
    if (err.code === "company_mismatch") return { ok: false, error: "company_mismatch" };
    const msg = String(err.message ?? "");
    if (msg.includes("payments_settlement_single_open")) {
      return { ok: false, error: "duplicate_payment_blocked" };
    }
    throw e;
  }
}
