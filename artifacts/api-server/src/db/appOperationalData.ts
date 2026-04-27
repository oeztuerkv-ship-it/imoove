import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import type { FinancePricingContext } from "../lib/financeCalculationService";
import { isFarFutureReservation } from "../lib/dispatchStatus";
import { getDb, isPostgresConfigured } from "./client";
import { appOperationalConfigTable, appServiceRegionsTable } from "./schema";

const DEFAULT_ID = "default";

const NESTED_TOP_KEYS = [
  "messages",
  "commission",
  "tariffs",
  "dispatch",
  "features",
  "driverRules",
  "bookingRules",
  "system",
] as const;

/** Defaults für App — überschreibbar per Admin-JSON, ohne App-Build. */
const DEFAULT_PAYLOAD: Record<string, unknown> = {
  version: 1,
  commission: {
    defaultRate: 0.07,
    active: true,
    minPercent: null,
    maxPercent: null,
    minProvisionEur: null,
    byServiceRegion: {} as Record<string, unknown>,
    byCompany: {} as Record<string, unknown>,
    rideKindRates: {
      standard: { rate: 0.07, active: true },
      medical: { rate: 0.07, active: true },
      voucher: { rate: 0.07, active: true },
      company: { rate: 0.07, active: true },
    },
  },
  messages: {
    outOfServiceAreaDe: "ONRODA ist in deiner Stadt momentan noch nicht verfügbar.",
    bookingBlockedDe: "Neue Buchungen sind vorübergehend deaktiviert.",
    customerAppClosedDe: "Die Kunden-App ist im Wartungsmodus.",
    operationalRuleDe: "Diese Buchung ist mit den aktuellen Plattform-Regeln nicht zulässig.",
  },
  tariffs: {
    active: true,
    baseFare: 4.3,
    rateFirstPerKm: 3.0,
    rateAfterPerKm: 2.5,
    thresholdKm: 4,
    waitingPerHour: 38,
    pricePerMinute: 0.63,
    minPrice: 0,
    nightSurchargePercent: 0,
    weekendSurchargePercent: 0,
    holidaySurchargePercent: 0,
    prebookSurchargeEur: 0,
    cancellationFeeEur: 0,
    airportFlatEur: 0,
    onrodaFixBase: 3.5,
    onrodaFixPerKm: 2.2,
    shortTripRule: "none",
    rounding: "ceil_tenth",
    taxiMandatoryArea: false,
    forbidUnlawfulFixedPriceInMandatoryArea: true,
    byServiceRegion: {} as Record<string, unknown>,
    info: "Schätzwerte: Grundgebühr + km-Staffel. Live-Endpreis Taxameter. Zuschläge optional.",
  },
  dispatch: {
    active: true,
    ownDriversFirst: true,
    exclusiveSeconds: 10,
    radiusKm: 10,
    openMarket: true,
    autoReassignOnReject: true,
    autoReassignOnTimeout: true,
    priority: "distance",
    blockAfterMultipleRejects: false,
  },
  features: {
    normalRide: true,
    preBooking: true,
    medicalRide: true,
    voucher: true,
    accessCode: true,
    companyTrip: true,
    hotelBooking: true,
    cash: true,
    invoice: true,
    onlinePayLater: false,
    driverTracking: true,
  },
  driverRules: {
    pScheinRequired: true,
    vehicleRequired: true,
    documentsRequired: true,
    systemOverrideAllowed: false,
    requirePlatformApprovalToGoOnline: true,
    vehicleAssignmentRequired: true,
    documentExpiryCheck: true,
  },
  bookingRules: {
    minPrebookLeadMinutes: 30,
    maxRouteKm: 200,
    maxWaitMinutes: 20,
    requireName: true,
    requirePhone: false,
    requireFromAddress: true,
    requireToAddress: true,
    medicalCostCenterRequired: false,
    medicalTransportDocumentRequired: false,
    doNotStoreDiagnosis: true,
    cancellationWindowMinutes: 120,
    cancellationFeeAfterWindowEur: 0,
  },
  system: {
    maintenanceMode: false,
    blockNewBookings: false,
    allowDriverApp: true,
    allowCustomerApp: true,
    globalNoticeDe: "",
    minAppVersionHint: null as string | null,
    emergencyShutdown: false,
  },
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/** Tiefe Zusammenführung der bekannten Top-Level-Objekte. */
function deepMergePayload(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base, ...over };
  for (const k of NESTED_TOP_KEYS) {
    const b = base[k];
    const o = over[k];
    if (o === undefined) continue;
    if (isPlainObject(b) && isPlainObject(o)) {
      out[k] = { ...b, ...o };
    } else {
      out[k] = o;
    }
  }
  return out;
}

const MEM_REGIONS: {
  id: string;
  label: string;
  matchTerms: string[];
  isActive: boolean;
  sortOrder: number;
  matchMode: string;
  geoFence: Record<string, unknown> | null;
}[] = [
  {
    id: "asr-stuttgart",
    label: "Stuttgart",
    matchTerms: ["stuttgart"],
    isActive: true,
    sortOrder: 1,
    matchMode: "substring",
    geoFence: null,
  },
  {
    id: "asr-esslingen",
    label: "Esslingen",
    matchTerms: ["esslingen", "esslingen am neckar"],
    isActive: true,
    sortOrder: 2,
    matchMode: "substring",
    geoFence: null,
  },
];

let memPayload: Record<string, unknown> = {};

function normalizeMatchTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : String(x)))
    .filter((s) => s.length > 0);
}

export type ServiceRegionPublic = {
  id: string;
  label: string;
  matchTerms: string[];
  isActive: boolean;
  sortOrder: number;
  matchMode: string;
  geoFence: Record<string, unknown> | null;
};

function rowToRegion(r: typeof appServiceRegionsTable.$inferSelect): ServiceRegionPublic {
  const gf = r.geo_fence_json;
  return {
    id: r.id,
    label: r.label,
    matchTerms: normalizeMatchTerms(r.match_terms),
    isActive: r.is_active,
    sortOrder: r.sort_order,
    matchMode: typeof r.match_mode === "string" && r.match_mode.trim() ? r.match_mode.trim() : "substring",
    geoFence: isPlainObject(gf) ? (gf as Record<string, unknown>) : null,
  };
}

/** Liefert aktive Einfahrt-Gebiete inkl. Terms. */
export async function listServiceRegionsForApi(): Promise<ServiceRegionPublic[]> {
  if (!isPostgresConfigured()) {
    return MEM_REGIONS.map((x) => ({ ...x, matchTerms: [...x.matchTerms] }));
  }
  const db = getDb();
  if (!db) {
    return MEM_REGIONS.map((x) => ({ ...x, matchTerms: [...x.matchTerms] }));
  }
  const rows = await db
    .select()
    .from(appServiceRegionsTable)
    .orderBy(asc(appServiceRegionsTable.sort_order), asc(appServiceRegionsTable.label));
  return rows.map(rowToRegion);
}

export async function getOperationalConfigPayload(): Promise<Record<string, unknown>> {
  if (!isPostgresConfigured()) {
    return deepMergePayload({ ...DEFAULT_PAYLOAD }, memPayload);
  }
  const db = getDb();
  if (!db) return deepMergePayload({ ...DEFAULT_PAYLOAD }, memPayload);
  const [r] = await db.select().from(appOperationalConfigTable).where(eq(appOperationalConfigTable.id, DEFAULT_ID)).limit(1);
  if (!r || !r.payload || typeof r.payload !== "object") {
    return { ...DEFAULT_PAYLOAD };
  }
  return deepMergePayload({ ...DEFAULT_PAYLOAD }, r.payload as Record<string, unknown>);
}

export function addressMatchesServiceTerms(address: string, terms: string[]): boolean {
  if (!address || terms.length === 0) return false;
  const a = address.toLowerCase();
  for (const t of terms) {
    const s = String(t).trim().toLowerCase();
    if (s && a.includes(s)) return true;
  }
  return false;
}

/**
 * Wenn mindestens ein aktives Gebiet existiert, müssen Start- und Ziel
 * je mindestens ein aktives Gebiet matchen. Ohne aktive Gebiete: kein Einschränk (Fail-open).
 */
export function validateServiceAreaForRide(fromFull: string, toFull: string, activeRegions: { matchTerms: string[] }[]): boolean {
  const from = String(fromFull ?? "").trim();
  const to = String(toFull ?? "").trim();
  if (activeRegions.length === 0) return true;
  return (
    activeRegions.some((r) => addressMatchesServiceTerms(from, r.matchTerms)) &&
    activeRegions.some((r) => addressMatchesServiceTerms(to, r.matchTerms))
  );
}

export type ServiceAreaBlock =
  | { ok: true }
  | { ok: false; code: "service_area_not_covered" };

export async function checkCustomerRideServiceArea(fromFull: string, toFull: string): Promise<ServiceAreaBlock> {
  const all = await listServiceRegionsForApi();
  const active = all.filter((r) => r.isActive);
  if (active.length === 0) return { ok: true };
  const ok = validateServiceAreaForRide(fromFull, toFull, active);
  if (ok) return { ok: true };
  return { ok: false, code: "service_area_not_covered" };
}

export function getOutOfServiceAreaMessage(payload: Record<string, unknown>): string {
  const m = (payload as { messages?: { outOfServiceAreaDe?: string } }).messages;
  const t = m?.outOfServiceAreaDe;
  if (typeof t === "string" && t.trim()) return t.trim();
  return (DEFAULT_PAYLOAD.messages as { outOfServiceAreaDe: string }).outOfServiceAreaDe;
}

function msgRuleDe(opPayload: Record<string, unknown>): string {
  const m = (opPayload.messages as { operationalRuleDe?: string } | undefined)?.operationalRuleDe;
  if (typeof m === "string" && m.trim()) return m.trim();
  return (DEFAULT_PAYLOAD.messages as { operationalRuleDe: string }).operationalRuleDe;
}

/**
 * Kunden-POST /rides: Server prüft dieselben Regeln wie die App (Feature-Toggles, Buchungsregeln, Tarif aktiv).
 */
export function assertCustomerRideOperational(
  raw: Record<string, unknown>,
  opPayload: Record<string, unknown>,
): { ok: true } | { ok: false; error: string; message: string } {
  const defF = DEFAULT_PAYLOAD.features as Record<string, unknown>;
  const defT = DEFAULT_PAYLOAD.tariffs as Record<string, unknown>;
  const defB = DEFAULT_PAYLOAD.bookingRules as Record<string, unknown>;
  const f = { ...defF, ...(isPlainObject(opPayload.features) ? opPayload.features : {}) };
  const t = { ...defT, ...(isPlainObject(opPayload.tariffs) ? opPayload.tariffs : {}) };
  const b = { ...defB, ...(isPlainObject(opPayload.bookingRules) ? opPayload.bookingRules : {}) };
  if (t.active === false) {
    return { ok: false, error: "tariffs_inactive", message: msgRuleDe(opPayload) };
  }
  const rideKind = typeof raw.rideKind === "string" && raw.rideKind.trim() ? raw.rideKind.trim() : "standard";
  if (rideKind === "standard" && f.normalRide === false) {
    return { ok: false, error: "feature_normal_ride_disabled", message: msgRuleDe(opPayload) };
  }
  if (rideKind === "medical" && f.medicalRide === false) {
    return { ok: false, error: "feature_medical_disabled", message: msgRuleDe(opPayload) };
  }
  if (rideKind === "voucher" && f.voucher === false) {
    return { ok: false, error: "feature_voucher_disabled", message: msgRuleDe(opPayload) };
  }
  if (rideKind === "company" && f.companyTrip === false) {
    return { ok: false, error: "feature_company_trip_disabled", message: msgRuleDe(opPayload) };
  }
  const accessPlain =
    typeof raw.accessCode === "string" && raw.accessCode.trim() ? raw.accessCode.trim() : "";
  if (accessPlain && f.accessCode === false) {
    return { ok: false, error: "feature_access_code_disabled", message: msgRuleDe(opPayload) };
  }
  const sched =
    typeof raw.scheduledAt === "string" && raw.scheduledAt.trim()
      ? raw.scheduledAt.trim()
      : typeof raw.scheduled_at === "string" && raw.scheduled_at.trim()
        ? raw.scheduled_at.trim()
        : null;
  if (isFarFutureReservation(sched) && f.preBooking === false) {
    return { ok: false, error: "feature_prebooking_disabled", message: msgRuleDe(opPayload) };
  }
  if (sched) {
    const t0 = new Date(sched).getTime();
    if (Number.isFinite(t0) && t0 > Date.now()) {
      const leadMin = (t0 - Date.now()) / 60_000;
      const minLead = typeof b.minPrebookLeadMinutes === "number" && Number.isFinite(b.minPrebookLeadMinutes) ? b.minPrebookLeadMinutes : 0;
      if (leadMin < minLead) {
        return { ok: false, error: "prebook_lead_too_short", message: msgRuleDe(opPayload) };
      }
    }
  }
  const pm = String(raw.paymentMethod ?? raw.payment_method ?? "")
    .trim()
    .toLowerCase();
  if (pm && f.cash === false && (pm === "bar" || pm.includes("cash") || pm === "bargeld")) {
    return { ok: false, error: "feature_cash_disabled", message: msgRuleDe(opPayload) };
  }
  if (pm && f.invoice === false && (pm.includes("rechnung") || pm.includes("invoice"))) {
    return { ok: false, error: "feature_invoice_disabled", message: msgRuleDe(opPayload) };
  }
  const dist = Number(raw.distanceKm ?? raw.distance_km);
  if (!Number.isFinite(dist) || dist <= 0) {
    return { ok: false, error: "distance_km_invalid", message: msgRuleDe(opPayload) };
  }
  const maxKm = typeof b.maxRouteKm === "number" && Number.isFinite(b.maxRouteKm) ? b.maxRouteKm : 99999;
  if (dist > maxKm) {
    return { ok: false, error: "route_too_long", message: msgRuleDe(opPayload) };
  }
  const est = Number(raw.estimatedFare ?? raw.estimated_fare);
  if (!Number.isFinite(est) || est < 0) {
    return { ok: false, error: "estimated_fare_invalid", message: msgRuleDe(opPayload) };
  }
  const dur = Number(raw.durationMinutes ?? raw.duration_minutes);
  if (!Number.isFinite(dur) || dur < 0) {
    return { ok: false, error: "duration_minutes_invalid", message: msgRuleDe(opPayload) };
  }
  if (b.requireName === true) {
    const name = String(raw.customerName ?? raw.customer_name ?? "").trim();
    if (!name) return { ok: false, error: "name_required", message: msgRuleDe(opPayload) };
  }
  if (b.requirePhone === true) {
    const ph = String(raw.customerPhone ?? raw.passengerPhone ?? raw.phone ?? "").trim();
    if (!ph) return { ok: false, error: "phone_required", message: msgRuleDe(opPayload) };
  }
  const fromFull = String(raw.fromFull ?? raw.from ?? raw.from_location ?? "").trim();
  const toFull = String(raw.toFull ?? raw.to ?? raw.to_location ?? "").trim();
  if (b.requireFromAddress === true && !fromFull) {
    return { ok: false, error: "from_required", message: msgRuleDe(opPayload) };
  }
  if (b.requireToAddress === true && !toFull) {
    return { ok: false, error: "to_required", message: msgRuleDe(opPayload) };
  }
  if (rideKind === "medical") {
    const bill = String(raw.billingReference ?? raw.billing_reference ?? "").trim();
    if (b.medicalCostCenterRequired === true && !bill) {
      return { ok: false, error: "medical_cost_center_required", message: msgRuleDe(opPayload) };
    }
  }
  return { ok: true };
}

/** System: neue Buchungen (Kunde + Partner-Anlage) — gleiche Logik wie POST /rides. */
export function assertPlatformNewRideAllowed(
  opPayload: Record<string, unknown>,
): { ok: true } | { ok: false; status: number; error: string; message: string } {
  const sys = opPayload.system as Record<string, unknown> | undefined;
  const opMsg = opPayload.messages as { bookingBlockedDe?: string; customerAppClosedDe?: string } | undefined;
  if (sys?.emergencyShutdown === true) {
    const m = opMsg?.customerAppClosedDe;
    return {
      ok: false,
      status: 503,
      error: "app_unavailable",
      message: typeof m === "string" && m.trim() ? m.trim() : "Dienst nicht verfügbar.",
    };
  }
  if (sys?.maintenanceMode === true && sys?.allowCustomerApp === false) {
    const m = opMsg?.customerAppClosedDe;
    return {
      ok: false,
      status: 503,
      error: "app_unavailable",
      message: typeof m === "string" && m.trim() ? m.trim() : "Kunden-App in Wartung.",
    };
  }
  if (sys?.blockNewBookings === true) {
    const m = opMsg?.bookingBlockedDe;
    return {
      ok: false,
      status: 400,
      error: "bookings_blocked",
      message: typeof m === "string" && m.trim() ? m.trim() : "Neue Buchungen derzeit deaktiviert.",
    };
  }
  return { ok: true };
}

/**
 * Kunden-Storno: Gebühr abhängig von Zeit vor Abholung (scheduled) bzw. nach Fahrerzuweisung.
 * Ohne geplante Abholzeit: vor Zuweisung kostenfrei, danach Gebühr (Tarif + Buchungsregel max).
 */
export function evaluateCustomerCancellationFeeEur(
  ride: { status: string; scheduledAt?: string | null; createdAt: string },
  opPayload: Record<string, unknown>,
  nowMs: number = Date.now(),
): { feeEur: number; reason: string } {
  const defB = DEFAULT_PAYLOAD.bookingRules as Record<string, unknown>;
  const defT = DEFAULT_PAYLOAD.tariffs as Record<string, unknown>;
  const b = { ...defB, ...(isPlainObject(opPayload.bookingRules) ? opPayload.bookingRules : {}) };
  const t = { ...defT, ...(isPlainObject(opPayload.tariffs) ? opPayload.tariffs : {}) };
  const windowMin =
    typeof b.cancellationWindowMinutes === "number" && Number.isFinite(b.cancellationWindowMinutes)
      ? b.cancellationWindowMinutes
      : 120;
  const feeBooking =
    typeof b.cancellationFeeAfterWindowEur === "number" && Number.isFinite(b.cancellationFeeAfterWindowEur)
      ? b.cancellationFeeAfterWindowEur
      : 0;
  const feeTariff =
    typeof t.cancellationFeeEur === "number" && Number.isFinite(t.cancellationFeeEur) ? t.cancellationFeeEur : 0;
  const fee = Math.max(Number(feeBooking) || 0, Number(feeTariff) || 0);

  const pickupRaw = ride.scheduledAt && String(ride.scheduledAt).trim() ? String(ride.scheduledAt).trim() : "";
  const pickupMs = pickupRaw ? new Date(pickupRaw).getTime() : NaN;
  if (Number.isFinite(pickupMs)) {
    const minsBefore = (pickupMs - nowMs) / 60_000;
    if (minsBefore > windowMin) return { feeEur: 0, reason: "free_before_pickup_window" };
    return { feeEur: fee, reason: "inside_pickup_cancellation_window" };
  }

  const early = new Set(["draft", "requested", "searching_driver", "offered", "pending", "scheduled"]);
  if (early.has(ride.status)) return { feeEur: 0, reason: "no_pickup_time_pre_assignment_pool" };

  const post = new Set([
    "accepted",
    "driver_arriving",
    "driver_waiting",
    "passenger_onboard",
    "in_progress",
    "arrived",
  ]);
  if (post.has(ride.status)) return { feeEur: fee, reason: "post_driver_assignment_no_scheduled_pickup" };

  return { feeEur: 0, reason: "terminal_or_unknown" };
}

/** Provision für ride_financials aus App/Betrieb-Konfig (Firma > Region Start > Fahrtart > Default). */
export function resolveFinancePricingContextFromOperational(
  ride: { rideKind: string; companyId?: string | null; fromFull?: string | null },
  opPayload: Record<string, unknown>,
  serviceRegions: { id: string; matchTerms: string[]; isActive: boolean }[],
): FinancePricingContext {
  const defC = DEFAULT_PAYLOAD.commission as Record<string, unknown>;
  const c = { ...defC, ...(isPlainObject(opPayload.commission) ? opPayload.commission : {}) };
  if (c.active === false) {
    return { commissionType: "none", commissionValue: 0, minCommissionEur: null };
  }
  let rate = typeof c.defaultRate === "number" && Number.isFinite(c.defaultRate) ? c.defaultRate : 0.07;
  const companyId = typeof ride.companyId === "string" ? ride.companyId.trim() : "";
  const byCo = c.byCompany as Record<string, unknown> | undefined;
  if (companyId && isPlainObject(byCo) && isPlainObject(byCo[companyId])) {
    const row = byCo[companyId] as { defaultRate?: unknown; active?: unknown };
    if (row.active === false) return { commissionType: "none", commissionValue: 0, minCommissionEur: null };
    if (typeof row.defaultRate === "number" && Number.isFinite(row.defaultRate)) rate = row.defaultRate;
  }
  const fromFull = String(ride.fromFull ?? "");
  for (const reg of serviceRegions.filter((r) => r.isActive)) {
    if (!addressMatchesServiceTerms(fromFull, reg.matchTerms)) continue;
    const bySr = c.byServiceRegion as Record<string, unknown> | undefined;
    if (isPlainObject(bySr) && isPlainObject(bySr[reg.id])) {
      const br = bySr[reg.id] as { defaultRate?: unknown; active?: unknown };
      if (br.active === false) return { commissionType: "none", commissionValue: 0, minCommissionEur: null };
      if (typeof br.defaultRate === "number" && Number.isFinite(br.defaultRate)) rate = br.defaultRate;
    }
    break;
  }
  const rkr = c.rideKindRates as Record<string, { rate?: unknown; active?: unknown }> | undefined;
  const rk = rkr?.[ride.rideKind];
  if (rk && typeof rk === "object") {
    if (rk.active === false) return { commissionType: "none", commissionValue: 0, minCommissionEur: null };
    if (typeof rk.rate === "number" && Number.isFinite(rk.rate)) rate = rk.rate;
  }
  const minPe = c.minProvisionEur;
  const minCommissionEur = typeof minPe === "number" && Number.isFinite(minPe) && minPe > 0 ? minPe : null;
  return { commissionType: "percentage", commissionValue: rate, minCommissionEur };
}

// --- Admin mutations ---

export async function updateOperationalConfigPayload(
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | { error: "unavailable" }> {
  const cur = await getOperationalConfigPayload();
  const next = deepMergePayload(cur, patch);
  if (!isPostgresConfigured()) {
    memPayload = next;
    return next;
  }
  const db = getDb();
  if (!db) return { error: "unavailable" };
  await db
    .insert(appOperationalConfigTable)
    .values({ id: DEFAULT_ID, payload: next, updated_at: new Date() })
    .onConflictDoUpdate({ target: appOperationalConfigTable.id, set: { payload: next, updated_at: new Date() } });
  return next;
}

export async function updateServiceRegionById(
  id: string,
  input: { label?: string; matchTerms?: string[]; isActive?: boolean; sortOrder?: number },
): Promise<boolean> {
  if (!isPostgresConfigured()) {
    const i = MEM_REGIONS.findIndex((x) => x.id === id);
    if (i < 0) return false;
    const cur = MEM_REGIONS[i]!;
    MEM_REGIONS[i] = {
      id: cur.id,
      label: input.label !== undefined ? input.label : cur.label,
      matchTerms: input.matchTerms !== undefined ? [...input.matchTerms] : cur.matchTerms,
      isActive: input.isActive !== undefined ? input.isActive : cur.isActive,
      sortOrder: input.sortOrder !== undefined ? input.sortOrder : cur.sortOrder,
      matchMode: cur.matchMode,
      geoFence: cur.geoFence,
    };
    return true;
  }
  const db = getDb();
  if (!db) return false;
  const set: Partial<typeof appServiceRegionsTable.$inferInsert> = { updated_at: new Date() };
  if (input.label !== undefined) set.label = input.label;
  if (input.matchTerms !== undefined) set.match_terms = input.matchTerms;
  if (input.isActive !== undefined) set.is_active = input.isActive;
  if (input.sortOrder !== undefined) set.sort_order = input.sortOrder;
  const u = await db
    .update(appServiceRegionsTable)
    .set(set)
    .where(eq(appServiceRegionsTable.id, id))
    .returning({ id: appServiceRegionsTable.id });
  return u.length > 0;
}

export async function insertServiceRegion(input: { label: string; matchTerms: string[]; isActive?: boolean }): Promise<string> {
  const id = `asr-${randomUUID()}`;
  if (!isPostgresConfigured()) {
    MEM_REGIONS.push({
      id,
      label: input.label,
      matchTerms: [...input.matchTerms],
      isActive: input.isActive !== false,
      sortOrder: Math.max(0, ...MEM_REGIONS.map((x) => x.sortOrder)) + 1,
      matchMode: "substring",
      geoFence: null,
    });
    return id;
  }
  const db = getDb();
  if (!db) {
    MEM_REGIONS.push({
      id,
      label: input.label,
      matchTerms: [...input.matchTerms],
      isActive: true,
      sortOrder: 99,
      matchMode: "substring",
      geoFence: null,
    });
    return id;
  }
  const sortOrder =
    (await db.select({ n: appServiceRegionsTable.sort_order }).from(appServiceRegionsTable).orderBy(desc(appServiceRegionsTable.sort_order)).limit(1))[
      0
    ]?.n ?? 0;
  await db.insert(appServiceRegionsTable).values({
    id,
    label: input.label.trim(),
    match_terms: input.matchTerms,
    is_active: input.isActive !== false,
    sort_order: Number(sortOrder) + 1,
  });
  return id;
}

/** Öffentliche, App-taugliche Konfiguration (camelCase, keine Admin-Interna). */
export type AppConfigPublic = {
  ok: true;
  version: number;
  updatedAt: string | null;
  activeCities: string[];
  serviceRegions: {
    id: string;
    label: string;
    matchTerms: string[];
    isActive: boolean;
    sortOrder: number;
  }[];
  messages: {
    outOfServiceAreaDe: string;
    bookingBlockedDe?: string;
    customerAppClosedDe?: string;
    [k: string]: unknown;
  };
  tariffs: Record<string, unknown>;
  provision: {
    defaultRate: number;
    active: boolean;
    minPercent: number | null;
    maxPercent: number | null;
    minProvisionEur: number | null;
    byServiceRegion: Record<string, unknown>;
    byCompany: Record<string, unknown>;
    rideKindRates: Record<string, { rate: number; active: boolean }>;
  };
  dispatch: Record<string, unknown>;
  features: Record<string, unknown>;
  driverRules: Record<string, unknown>;
  bookingRules: Record<string, unknown>;
  system: Record<string, unknown>;
};

export async function getAppConfigForPublic(): Promise<AppConfigPublic> {
  const payload = await getOperationalConfigPayload();
  const regions = await listServiceRegionsForApi();
  const activeCities = regions.filter((r) => r.isActive).map((r) => r.label.trim()).filter((s) => s.length > 0);
  const defCom = DEFAULT_PAYLOAD.commission as Record<string, unknown>;
  const c = { ...defCom, ...((isPlainObject(payload.commission) ? payload.commission : {}) as object) } as Record<
    string,
    unknown
  >;
  const dr = c.defaultRate;
  const defaultRate = typeof dr === "number" && Number.isFinite(dr) ? dr : 0.07;
  const rkrDef = (defCom.rideKindRates as Record<string, { rate: number; active: boolean }>) ?? {};
  const rkrRaw = c.rideKindRates;
  const rkrMerged: Record<string, { rate: number; active: boolean }> = { ...rkrDef };
  if (isPlainObject(rkrRaw)) {
    for (const [k, v] of Object.entries(rkrRaw)) {
      if (!isPlainObject(v)) continue;
      const rate = typeof (v as { rate?: unknown }).rate === "number" ? (v as { rate: number }).rate : 0.07;
      rkrMerged[k] = { rate, active: (v as { active?: boolean }).active !== false };
    }
  }
  const bySr = isPlainObject(c.byServiceRegion) ? { ...c.byServiceRegion } : {};
  const byCo = isPlainObject(c.byCompany) ? { ...c.byCompany } : {};
  const mpe = c.minProvisionEur;
  const provision: AppConfigPublic["provision"] = {
    defaultRate,
    active: c.active !== false,
    minPercent: typeof c.minPercent === "number" || c.minPercent === null ? (c.minPercent as number | null) : null,
    maxPercent: typeof c.maxPercent === "number" || c.maxPercent === null ? (c.maxPercent as number | null) : null,
    minProvisionEur: typeof mpe === "number" && Number.isFinite(mpe) ? mpe : null,
    byServiceRegion: bySr,
    byCompany: byCo,
    rideKindRates: rkrMerged,
  };
  let updatedAt: string | null = null;
  if (isPostgresConfigured()) {
    const db = getDb();
    if (db) {
      const [row] = await db
        .select({ updated_at: appOperationalConfigTable.updated_at })
        .from(appOperationalConfigTable)
        .where(eq(appOperationalConfigTable.id, DEFAULT_ID))
        .limit(1);
      updatedAt = row?.updated_at ? new Date(row.updated_at as Date).toISOString() : null;
    }
  } else {
    updatedAt = new Date().toISOString();
  }
  const v = payload.version;
  const defMsg = DEFAULT_PAYLOAD.messages as Record<string, unknown>;
  const rawMsg = isPlainObject(payload.messages) ? (payload.messages as Record<string, unknown>) : {};
  const msgMerged: Record<string, unknown> = { ...defMsg, ...rawMsg };
  if (typeof msgMerged.outOfServiceAreaDe !== "string" || !String(msgMerged.outOfServiceAreaDe).trim()) {
    msgMerged.outOfServiceAreaDe = defMsg.outOfServiceAreaDe;
  }
  if (typeof msgMerged.operationalRuleDe !== "string" || !String(msgMerged.operationalRuleDe).trim()) {
    msgMerged.operationalRuleDe = defMsg.operationalRuleDe;
  }

  /** Vollständige Sektionen (Defaults + DB/Admin) — die App darf auf alle Keys zählen. */
  const section = (key: "tariffs" | "dispatch" | "features" | "driverRules" | "bookingRules" | "system") => {
    const def = (DEFAULT_PAYLOAD[key] as Record<string, unknown>) ?? {};
    const p = payload[key];
    if (!isPlainObject(p)) return { ...def };
    return { ...def, ...p };
  };

  return {
    ok: true,
    version: typeof v === "number" && Number.isFinite(v) ? v : 1,
    updatedAt,
    activeCities,
    serviceRegions: regions,
    messages: msgMerged as AppConfigPublic["messages"],
    tariffs: section("tariffs"),
    provision,
    dispatch: section("dispatch"),
    features: section("features"),
    driverRules: section("driverRules"),
    bookingRules: section("bookingRules"),
    system: section("system"),
  };
}
