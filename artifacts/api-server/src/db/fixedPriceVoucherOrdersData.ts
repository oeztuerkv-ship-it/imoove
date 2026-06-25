import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { fixedPriceVoucherOrdersTable } from "./schema";

export type FixedPriceVoucherOrderStatus = "pending" | "paid" | "failed" | "expired" | "cancelled";

export type FixedPriceVoucherOrderRow = {
  id: string;
  companyId: string;
  panelUserId: string | null;
  status: FixedPriceVoucherOrderStatus;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  accessCodeId: string | null;
  codePlain: string | null;
  label: string;
  fromFull: string;
  toFull: string;
  fromLat: number | null;
  fromLon: number | null;
  toLat: number | null;
  toLon: number | null;
  distanceKm: number;
  vehicle: string;
  priceEur: number;
  basePriceEur: number | null;
  vehicleSurchargeEur: number | null;
  pricingSnapshot: Record<string, unknown>;
  createdAt: string;
  paidAt: string | null;
};

type MemOrder = typeof fixedPriceVoucherOrdersTable.$inferSelect;
const memOrders = new Map<string, MemOrder>();

function rowToDto(r: MemOrder): FixedPriceVoucherOrderRow {
  return {
    id: r.id,
    companyId: r.company_id,
    panelUserId: r.panel_user_id ?? null,
    status: r.status as FixedPriceVoucherOrderStatus,
    stripeCheckoutSessionId: r.stripe_checkout_session_id ?? null,
    stripePaymentIntentId: r.stripe_payment_intent_id ?? null,
    accessCodeId: r.access_code_id ?? null,
    codePlain: r.code_plain ?? null,
    label: r.label ?? "",
    fromFull: r.from_full ?? "",
    toFull: r.to_full ?? "",
    fromLat: r.from_lat ?? null,
    fromLon: r.from_lon ?? null,
    toLat: r.to_lat ?? null,
    toLon: r.to_lon ?? null,
    distanceKm: Number(r.distance_km ?? 0),
    vehicle: r.vehicle ?? "standard",
    priceEur: Number(r.price_eur ?? 0),
    basePriceEur: r.base_price_eur ?? null,
    vehicleSurchargeEur: r.vehicle_surcharge_eur ?? null,
    pricingSnapshot:
      r.pricing_snapshot && typeof r.pricing_snapshot === "object" && !Array.isArray(r.pricing_snapshot)
        ? (r.pricing_snapshot as Record<string, unknown>)
        : {},
    createdAt: new Date(r.created_at).toISOString(),
    paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
  };
}

export type CreateFixedPriceVoucherOrderInput = {
  companyId: string;
  panelUserId: string | null;
  label: string;
  fromFull: string;
  toFull: string;
  fromLat?: number | null;
  fromLon?: number | null;
  toLat?: number | null;
  toLon?: number | null;
  distanceKm: number;
  vehicle: string;
  priceEur: number;
  basePriceEur: number;
  vehicleSurchargeEur: number;
  pricingSnapshot: Record<string, unknown>;
};

export async function createFixedPriceVoucherOrder(
  input: CreateFixedPriceVoucherOrderInput,
): Promise<FixedPriceVoucherOrderRow> {
  const id = `fpvo-${randomUUID()}`;
  const now = new Date();
  const row: MemOrder = {
    id,
    company_id: input.companyId,
    panel_user_id: input.panelUserId,
    status: "pending",
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    access_code_id: null,
    code_plain: null,
    label: input.label,
    from_full: input.fromFull,
    to_full: input.toFull,
    from_lat: input.fromLat ?? null,
    from_lon: input.fromLon ?? null,
    to_lat: input.toLat ?? null,
    to_lon: input.toLon ?? null,
    distance_km: input.distanceKm,
    vehicle: input.vehicle,
    price_eur: input.priceEur,
    base_price_eur: input.basePriceEur,
    vehicle_surcharge_eur: input.vehicleSurchargeEur,
    pricing_snapshot: input.pricingSnapshot,
    created_at: now,
    paid_at: null,
  };

  const db = getDb();
  if (!db || !isPostgresConfigured()) {
    memOrders.set(id, row);
    return rowToDto(row);
  }

  await db.insert(fixedPriceVoucherOrdersTable).values(row);
  return rowToDto(row);
}

export async function getFixedPriceVoucherOrderForCompany(
  companyId: string,
  orderId: string,
): Promise<FixedPriceVoucherOrderRow | null> {
  const db = getDb();
  if (!db || !isPostgresConfigured()) {
    const r = memOrders.get(orderId);
    if (!r || r.company_id !== companyId) return null;
    return rowToDto(r);
  }
  const [r] = await db
    .select()
    .from(fixedPriceVoucherOrdersTable)
    .where(and(eq(fixedPriceVoucherOrdersTable.id, orderId), eq(fixedPriceVoucherOrdersTable.company_id, companyId)))
    .limit(1);
  return r ? rowToDto(r) : null;
}

export async function getFixedPriceVoucherOrderByCheckoutSessionId(
  sessionId: string,
): Promise<FixedPriceVoucherOrderRow | null> {
  const sid = sessionId.trim();
  if (!sid) return null;
  const db = getDb();
  if (!db || !isPostgresConfigured()) {
    for (const r of memOrders.values()) {
      if ((r.stripe_checkout_session_id ?? "").trim() === sid) return rowToDto(r);
    }
    return null;
  }
  const [r] = await db
    .select()
    .from(fixedPriceVoucherOrdersTable)
    .where(eq(fixedPriceVoucherOrdersTable.stripe_checkout_session_id, sid))
    .limit(1);
  return r ? rowToDto(r) : null;
}

export async function listFixedPriceVoucherOrdersForCompany(
  companyId: string,
  limit = 40,
): Promise<FixedPriceVoucherOrderRow[]> {
  const db = getDb();
  if (!db || !isPostgresConfigured()) {
    return [...memOrders.values()]
      .filter((r) => r.company_id === companyId)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit)
      .map(rowToDto);
  }
  const rows = await db
    .select()
    .from(fixedPriceVoucherOrdersTable)
    .where(eq(fixedPriceVoucherOrdersTable.company_id, companyId))
    .orderBy(desc(fixedPriceVoucherOrdersTable.created_at))
    .limit(limit);
  return rows.map(rowToDto);
}

export async function attachCheckoutSessionToFixedPriceVoucherOrder(
  orderId: string,
  companyId: string,
  stripeCheckoutSessionId: string,
): Promise<FixedPriceVoucherOrderRow | null> {
  const db = getDb();
  if (!db || !isPostgresConfigured()) {
    const r = memOrders.get(orderId);
    if (!r || r.company_id !== companyId) return null;
    r.stripe_checkout_session_id = stripeCheckoutSessionId;
    return rowToDto(r);
  }
  const [updated] = await db
    .update(fixedPriceVoucherOrdersTable)
    .set({ stripe_checkout_session_id: stripeCheckoutSessionId })
    .where(
      and(eq(fixedPriceVoucherOrdersTable.id, orderId), eq(fixedPriceVoucherOrdersTable.company_id, companyId)),
    )
    .returning();
  return updated ? rowToDto(updated) : null;
}

export async function markFixedPriceVoucherOrderPaid(input: {
  orderId: string;
  stripePaymentIntentId: string | null;
  accessCodeId: string;
  codePlain: string;
}): Promise<FixedPriceVoucherOrderRow | null> {
  const now = new Date();
  const db = getDb();
  if (!db || !isPostgresConfigured()) {
    const r = memOrders.get(input.orderId);
    if (!r) return null;
    if (r.status === "paid") return rowToDto(r);
    r.status = "paid";
    r.paid_at = now;
    r.stripe_payment_intent_id = input.stripePaymentIntentId;
    r.access_code_id = input.accessCodeId;
    r.code_plain = input.codePlain;
    return rowToDto(r);
  }
  const [updated] = await db
    .update(fixedPriceVoucherOrdersTable)
    .set({
      status: "paid",
      paid_at: now,
      stripe_payment_intent_id: input.stripePaymentIntentId,
      access_code_id: input.accessCodeId,
      code_plain: input.codePlain,
    })
    .where(
      and(eq(fixedPriceVoucherOrdersTable.id, input.orderId), eq(fixedPriceVoucherOrdersTable.status, "pending")),
    )
    .returning();
  if (updated) return rowToDto(updated);
  const [existing] = await db
    .select()
    .from(fixedPriceVoucherOrdersTable)
    .where(eq(fixedPriceVoucherOrdersTable.id, input.orderId))
    .limit(1);
  return existing?.status === "paid" ? rowToDto(existing) : null;
}

/** Partner-API: Klartext-Code nur für bezahlte Bestellungen. */
export function fixedPriceVoucherOrderForPanelApi(row: FixedPriceVoucherOrderRow): Record<string, unknown> {
  return {
    id: row.id,
    status: row.status,
    label: row.label,
    fromFull: row.fromFull,
    toFull: row.toFull,
    distanceKm: row.distanceKm,
    vehicle: row.vehicle,
    priceEur: row.priceEur,
    basePriceEur: row.basePriceEur,
    vehicleSurchargeEur: row.vehicleSurchargeEur,
    accessCodeId: row.accessCodeId,
    codePlain: row.status === "paid" ? row.codePlain : null,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
    canDownloadPdf: row.status === "paid" && Boolean(row.codePlain),
  };
}
