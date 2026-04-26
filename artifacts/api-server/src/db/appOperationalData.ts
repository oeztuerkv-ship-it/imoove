import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
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
  commission: { defaultRate: 0.07, active: true, minPercent: null, maxPercent: null },
  messages: {
    outOfServiceAreaDe: "ONRODA ist in deiner Stadt momentan noch nicht verfügbar.",
    bookingBlockedDe: "Neue Buchungen sind vorübergehend deaktiviert.",
    customerAppClosedDe: "Die Kunden-App ist im Wartungsmodus.",
  },
  tariffs: {
    baseFare: 4.3,
    rateFirstPerKm: 3.0,
    rateAfterPerKm: 2.5,
    thresholdKm: 4,
    waitingPerHour: 38,
    onrodaFixBase: 3.5,
    onrodaFixPerKm: 2.2,
    minPrice: 0,
    shortTripRule: "none",
    rounding: "ceil_tenth",
    info: "Schätzwerte: Grundgebühr + km-Staffel wie Esslinger Regel. Live-Endpreis Taxameter.",
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
    requirePhone: true,
    requireFromAddress: true,
    requireToAddress: true,
    medicalCostCenterRequired: false,
    medicalTransportDocumentRequired: false,
    doNotStoreDiagnosis: true,
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
}[] = [
  { id: "asr-stuttgart", label: "Stuttgart", matchTerms: ["stuttgart"], isActive: true, sortOrder: 1 },
  { id: "asr-esslingen", label: "Esslingen", matchTerms: ["esslingen", "esslingen am neckar"], isActive: true, sortOrder: 2 },
];

let memPayload: Record<string, unknown> = {};

function normalizeMatchTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : String(x)))
    .filter((s) => s.length > 0);
}

function rowToRegion(r: typeof appServiceRegionsTable.$inferSelect): {
  id: string;
  label: string;
  matchTerms: string[];
  isActive: boolean;
  sortOrder: number;
} {
  return {
    id: r.id,
    label: r.label,
    matchTerms: normalizeMatchTerms(r.match_terms),
    isActive: r.is_active,
    sortOrder: r.sort_order,
  };
}

/** Liefert aktive Einfahrt-Gebiete inkl. Terms. */
export async function listServiceRegionsForApi(): Promise<
  { id: string; label: string; matchTerms: string[]; isActive: boolean; sortOrder: number }[]
> {
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
    });
    return id;
  }
  const db = getDb();
  if (!db) {
    MEM_REGIONS.push({ id, label: input.label, matchTerms: [...input.matchTerms], isActive: true, sortOrder: 99 });
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
  const c = (payload.commission as Record<string, unknown> | undefined) ?? {};
  const dr = c.defaultRate;
  const defaultRate = typeof dr === "number" && Number.isFinite(dr) ? dr : 0.07;
  const provision: AppConfigPublic["provision"] = {
    defaultRate,
    active: c.active !== false,
    minPercent: typeof c.minPercent === "number" || c.minPercent === null ? (c.minPercent as number | null) : null,
    maxPercent: typeof c.maxPercent === "number" || c.maxPercent === null ? (c.maxPercent as number | null) : null,
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
