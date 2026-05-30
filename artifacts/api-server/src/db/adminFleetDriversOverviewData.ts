import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import {
  getAdminTaxiFleetDriverDetail,
  listAdminTaxiFleetDriverRows,
  type AdminTaxiFleetDriverRow,
} from "./fleetDriverReadiness";
import { computeFleetDriverComplianceGaps } from "./fleetDriversData";
import { adminCompaniesTable, fleetDriversTable, ridesTable } from "./schema";
import { listRidesAdminPage, type AdminRideRow } from "./ridesData";

const ACTIVE_RIDE_STATUSES = ["accepted", "arrived", "in_progress"] as const;

export type AdminFleetDriverOverviewFilters = {
  q?: string;
  companyId?: string;
  workflowKey?: string;
  online?: "yes" | "no" | "all";
  blocked?: "yes" | "no" | "all";
  documents?: "complete" | "incomplete" | "all";
  hasActiveRide?: "yes" | "no" | "all";
  /** Standard: Nachname/Vorname A–Z */
  sort?: "name" | "activity";
};

/** Keine Vollliste ohne Suchkriterium (Performance + UX: erst suchen). */
export function adminFleetDriverOverviewHasSearchCriteria(filters: AdminFleetDriverOverviewFilters): boolean {
  const q = filters.q?.trim() ?? "";
  if (q.length >= 2) return true;
  if (filters.companyId?.trim()) return true;
  if (filters.workflowKey?.trim()) return true;
  if (filters.online && filters.online !== "all") return true;
  if (filters.blocked && filters.blocked !== "all") return true;
  if (filters.documents && filters.documents !== "all") return true;
  if (filters.hasActiveRide && filters.hasActiveRide !== "all") return true;
  return false;
}

export type AdminFleetDriverOverviewRow = {
  id: string;
  companyId: string;
  companyName: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  accessStatus: string;
  isActive: boolean;
  approvalStatus: string;
  isMarketOnline: boolean;
  workflow: { key: string; label: string };
  presenceStatus: "online" | "offline" | "unavailable";
  accountStatusLabel: string;
  documentsComplete: boolean;
  documentGaps: string[];
  assignedVehicle: { id: string; licensePlate: string; model: string } | null;
  lastActivityAt: string | null;
  rideCount: number;
  hasActiveRide: boolean;
  activeRideId: string | null;
  suspensionReason: string;
  readinessReady: boolean;
  createdAt: string;
};

function fleetDriverOverviewSortKey(
  row: Pick<AdminFleetDriverOverviewRow, "displayName" | "lastName" | "firstName" | "email">,
): string {
  const dn = (row.displayName ?? "").trim();
  if (dn) return dn;
  const full = `${row.lastName ?? ""} ${row.firstName ?? ""}`.trim();
  if (full) return full;
  return (row.email ?? "").trim();
}

function sortAdminFleetDriverOverviewRows(
  rows: AdminFleetDriverOverviewRow[],
  sort: AdminFleetDriverOverviewFilters["sort"],
): void {
  if (sort === "activity") {
    rows.sort((a, b) => {
      const ta = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const tb = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return tb - ta;
    });
    return;
  }
  rows.sort((a, b) => {
    const cmp = fleetDriverOverviewSortKey(a).localeCompare(fleetDriverOverviewSortKey(b), "de", {
      sensitivity: "base",
    });
    if (cmp !== 0) return cmp;
    return a.companyName.localeCompare(b.companyName, "de", { sensitivity: "base" });
  });
}

function lastActivityIso(row: {
  lastLoginAt: string | null;
  lastHeartbeatAt: string | null;
  updatedAt: string;
}): string | null {
  const candidates = [row.lastHeartbeatAt, row.lastLoginAt, row.updatedAt].filter(Boolean) as string[];
  if (!candidates.length) return null;
  let best = candidates[0]!;
  for (const c of candidates.slice(1)) {
    if (Date.parse(c) > Date.parse(best)) best = c;
  }
  return best;
}

function derivePresence(row: AdminTaxiFleetDriverRow): "online" | "offline" | "unavailable" {
  if (!row.isActive || row.accessStatus !== "active" || row.approvalStatus !== "approved") {
    return "unavailable";
  }
  return row.isMarketOnline ? "online" : "offline";
}

function deriveAccountStatusLabel(row: AdminTaxiFleetDriverRow): string {
  if (row.accessStatus === "suspended") return "Gesperrt";
  if (!row.isActive) return "Deaktiviert";
  if (row.approvalStatus === "approved") return "Aktiv";
  if (row.approvalStatus === "pending" || row.approvalStatus === "in_review") {
    return "Wartet auf Freigabe";
  }
  if (row.approvalStatus === "missing_documents") return "Unterlagen fehlen";
  if (row.approvalStatus === "rejected") return "Abgelehnt";
  return row.workflow?.label ?? "—";
}

function rowMatchesFilters(row: AdminFleetDriverOverviewRow, f: AdminFleetDriverOverviewFilters): boolean {
  const q = f.q?.trim().toLowerCase();
  if (q) {
    const hay = [
      row.id,
      row.displayName,
      row.firstName,
      row.lastName,
      row.email,
      row.phone,
      row.companyName,
      row.companyId,
      row.assignedVehicle?.licensePlate,
      row.assignedVehicle?.model,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.companyId?.trim() && row.companyId !== f.companyId.trim()) return false;
  if (f.workflowKey?.trim() && row.workflow.key !== f.workflowKey.trim()) return false;
  if (f.online === "yes" && row.presenceStatus !== "online") return false;
  if (f.online === "no" && row.presenceStatus !== "offline") return false;
  if (f.blocked === "yes" && row.accessStatus !== "suspended") return false;
  if (f.blocked === "no" && row.accessStatus === "suspended") return false;
  if (f.documents === "complete" && !row.documentsComplete) return false;
  if (f.documents === "incomplete" && row.documentsComplete) return false;
  if (f.hasActiveRide === "yes" && !row.hasActiveRide) return false;
  if (f.hasActiveRide === "no" && row.hasActiveRide) return false;
  return true;
}

async function loadRideStatsByDriverId(
  driverIds: string[],
): Promise<Map<string, { rideCount: number; hasActiveRide: boolean; activeRideId: string | null }>> {
  const map = new Map<string, { rideCount: number; hasActiveRide: boolean; activeRideId: string | null }>();
  for (const id of driverIds) {
    map.set(id, { rideCount: 0, hasActiveRide: false, activeRideId: null });
  }
  if (!driverIds.length) return map;
  const db = getDb();
  if (!db) return map;

  const countRows = await db
    .select({
      driverId: ridesTable.driver_id,
      rideCount: sql<number>`count(*)::int`,
    })
    .from(ridesTable)
    .where(inArray(ridesTable.driver_id, driverIds))
    .groupBy(ridesTable.driver_id);
  for (const r of countRows) {
    const id = String(r.driverId ?? "").trim();
    if (!id || !map.has(id)) continue;
    const cur = map.get(id)!;
    cur.rideCount = Number(r.rideCount ?? 0);
  }

  const activeRows = await db
    .select({ id: ridesTable.id, driverId: ridesTable.driver_id, createdAt: ridesTable.created_at })
    .from(ridesTable)
    .where(
      and(inArray(ridesTable.driver_id, driverIds), inArray(ridesTable.status, [...ACTIVE_RIDE_STATUSES])),
    )
    .orderBy(desc(ridesTable.created_at));
  for (const r of activeRows) {
    const id = String(r.driverId ?? "").trim();
    if (!id || !map.has(id)) continue;
    const cur = map.get(id)!;
    if (!cur.hasActiveRide) {
      cur.hasActiveRide = true;
      cur.activeRideId = r.id;
    }
  }
  return map;
}

/** Plattform-weite Taxi-Fahrerliste (alle Mandanten). */
export async function listAdminFleetDriversOverview(
  filters: AdminFleetDriverOverviewFilters,
  scope?: { taxiCompanyIds?: string[] },
): Promise<AdminFleetDriverOverviewRow[]> {
  if (!adminFleetDriverOverviewHasSearchCriteria(filters)) return [];
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const companyRows = await db
    .select({ id: adminCompaniesTable.id, name: adminCompaniesTable.name })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.company_kind, "taxi"));
  let taxiCompanies = companyRows.map((c) => ({ id: c.id, name: c.name }));
  if (scope?.taxiCompanyIds?.length) {
    const allowed = new Set(scope.taxiCompanyIds);
    taxiCompanies = taxiCompanies.filter((c) => allowed.has(c.id));
  }
  if (!taxiCompanies.length) return [];

  const nameById = new Map(taxiCompanies.map((c) => [c.id, c.name]));
  const companyIds = taxiCompanies.map((c) => c.id);

  const allRows: AdminFleetDriverOverviewRow[] = [];
  for (const companyId of companyIds) {
    const drivers = await listAdminTaxiFleetDriverRows(companyId);
    const driverIds = drivers.map((d) => d.id);
    const rideStats = await loadRideStatsByDriverId(driverIds);
    const companyName = nameById.get(companyId) ?? companyId;

    for (const d of drivers) {
      const gaps = computeFleetDriverComplianceGaps(d);
      const stats = rideStats.get(d.id) ?? { rideCount: 0, hasActiveRide: false, activeRideId: null };
      const overview: AdminFleetDriverOverviewRow = {
        id: d.id,
        companyId: d.companyId,
        companyName,
        firstName: d.firstName,
        lastName: d.lastName,
        displayName: `${d.firstName} ${d.lastName}`.trim() || d.email,
        email: d.email,
        phone: d.phone,
        accessStatus: d.accessStatus,
        isActive: d.isActive,
        approvalStatus: d.approvalStatus,
        isMarketOnline: d.isMarketOnline,
        workflow: d.workflow,
        presenceStatus: derivePresence(d),
        accountStatusLabel: deriveAccountStatusLabel(d),
        documentsComplete: gaps.length === 0 && d.approvalStatus === "approved",
        documentGaps: gaps,
        assignedVehicle: d.assignedVehicle
          ? {
              id: d.assignedVehicle.id,
              licensePlate: d.assignedVehicle.licensePlate,
              model: d.assignedVehicle.model,
            }
          : null,
        lastActivityAt: lastActivityIso(d),
        rideCount: stats.rideCount,
        hasActiveRide: stats.hasActiveRide,
        activeRideId: stats.activeRideId,
        suspensionReason: d.suspensionReason,
        readinessReady: Boolean(d.readiness?.ready),
        createdAt: d.createdAt,
      };
      if (rowMatchesFilters(overview, filters)) allRows.push(overview);
    }
  }

  sortAdminFleetDriverOverviewRows(allRows, filters.sort ?? "name");
  return allRows;
}

export async function getAdminFleetDriverOverviewDetail(
  driverId: string,
): Promise<
  | {
      driver: AdminTaxiFleetDriverRow;
      companyName: string;
      recentRides: AdminRideRow[];
    }
  | null
> {
  const db = getDb();
  if (!db) return null;
  const row = await db
    .select()
    .from(fleetDriversTable)
    .where(eq(fleetDriversTable.id, driverId.trim()))
    .limit(1);
  const raw = row[0];
  if (!raw) return null;
  const companyId = raw.company_id;
  const [coRows, driver] = await Promise.all([
    db
      .select({ name: adminCompaniesTable.name })
      .from(adminCompaniesTable)
      .where(eq(adminCompaniesTable.id, companyId))
      .limit(1),
    getAdminTaxiFleetDriverDetail(companyId, driverId.trim()),
  ]);
  if (!driver) return null;
  const recentRides = await listRidesAdminPage({ driverId: driverId.trim(), companyId }, 30, 0);
  return {
    driver,
    companyName: coRows[0]?.name ?? companyId,
    recentRides,
  };
}

export function parseAdminFleetDriverOverviewFilters(
  query: Record<string, unknown>,
): AdminFleetDriverOverviewFilters {
  const str = (k: string) => (typeof query[k] === "string" ? query[k].trim() : "");
  const online = str("online");
  const blocked = str("blocked");
  const documents = str("documents");
  const hasActiveRide = str("hasActiveRide");
  return {
    q: str("q") || undefined,
    companyId: str("companyId") || undefined,
    workflowKey: str("workflowKey") || str("status") || undefined,
    online: online === "yes" || online === "no" ? online : "all",
    blocked: blocked === "yes" || blocked === "no" ? blocked : "all",
    documents: documents === "complete" || documents === "incomplete" ? documents : "all",
    hasActiveRide: hasActiveRide === "yes" || hasActiveRide === "no" ? hasActiveRide : "all",
    sort: str("sort") === "activity" ? "activity" : "name",
  };
}
