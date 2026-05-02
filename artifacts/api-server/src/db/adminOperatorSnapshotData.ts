import { count, desc, eq, inArray, ne, or } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { countPendingFleetDriversForAdmin, listPendingFleetDriversForAdmin } from "./fleetDriversData";
import {
  countPendingFleetVehiclesForAdmin,
  listPendingFleetVehiclesForAdmin,
} from "./fleetVehiclesData";
import { adminCompaniesTable, partnerRegistrationRequestsTable } from "./schema";
import {
  countSupportThreadsByStatusForAdmin,
  listSupportThreadsAdmin,
} from "./supportThreadsData";

const PENDING_REGISTRATION_STATUSES = ["open", "in_review", "documents_required"] as const;

function registrationStatusDe(s: string): string {
  const m: Record<string, string> = {
    open: "Eingereicht",
    in_review: "In Prüfung",
    documents_required: "Dokumente offen",
    approved: "Freigegeben",
    rejected: "Abgelehnt",
    blocked: "Gesperrt",
  };
  return m[s] ?? s;
}

function parseIsoToMs(v: string): number {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

export type AdminOperatorTaskItem = {
  kind: "registration" | "support" | "fleet" | "fleet_driver";
  at: string;
  title: string;
  subtitle: string;
  pageKey: "company-registration-requests" | "support-inbox" | "fleet-vehicles-review" | "taxi-fleet-drivers";
  refId: string;
  severity: "high" | "medium";
};

export type AdminOperatorSnapshot = {
  registration: {
    pendingCount: number;
    latest: Array<{
      id: string;
      companyName: string;
      email: string;
      partnerType: string;
      registrationStatus: string;
      createdAt: string;
    }>;
  };
  support: {
    openCount: number;
    inProgressCount: number;
    answeredCount: number;
    latestOpenThreads: Array<{
      id: string;
      companyId: string;
      companyName: string;
      title: string;
      status: string;
      category: string;
      lastMessageAt: string;
      lastSnippet: string;
    }>;
  };
  fleet: {
    pendingApprovalCount: number;
    latest: Array<{
      vehicleId: string;
      companyId: string;
      companyName: string;
      licensePlate: string;
      model: string;
      updatedAt: string;
      approvalStatus: string;
    }>;
  };
  fleetDrivers: {
    pendingApprovalCount: number;
    latest: Array<{
      driverId: string;
      companyId: string;
      companyName: string;
      firstName: string;
      lastName: string;
      email: string;
      approvalStatus: string;
      updatedAt: string;
    }>;
  };
  companies: {
    blockedCount: number;
    incompleteComplianceCount: number;
    latestProblematic: Array<{
      id: string;
      name: string;
      isBlocked: boolean;
      complianceStatus: string;
    }>;
  };
  recentTasks: AdminOperatorTaskItem[];
};

export async function getAdminOperatorSnapshot(): Promise<AdminOperatorSnapshot> {
  const empty: AdminOperatorSnapshot = {
    registration: { pendingCount: 0, latest: [] },
    support: { openCount: 0, inProgressCount: 0, answeredCount: 0, latestOpenThreads: [] },
    fleet: { pendingApprovalCount: 0, latest: [] },
    fleetDrivers: { pendingApprovalCount: 0, latest: [] },
    companies: { blockedCount: 0, incompleteComplianceCount: 0, latestProblematic: [] },
    recentTasks: [],
  };

  if (!isPostgresConfigured()) return empty;
  const db = getDb();
  if (!db) return empty;

  const [
    regCountRow,
    regLatestRows,
    supportByStatus,
    supportOpen,
    fleetPendingN,
    fleetPreview,
    fleetDriversPendingN,
    fleetDriversPreview,
    blockedRow,
    incompleteRow,
    probRows,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(partnerRegistrationRequestsTable)
      .where(inArray(partnerRegistrationRequestsTable.registration_status, [...PENDING_REGISTRATION_STATUSES])),
    db
      .select({
        id: partnerRegistrationRequestsTable.id,
        companyName: partnerRegistrationRequestsTable.company_name,
        email: partnerRegistrationRequestsTable.email,
        partnerType: partnerRegistrationRequestsTable.partner_type,
        registrationStatus: partnerRegistrationRequestsTable.registration_status,
        createdAt: partnerRegistrationRequestsTable.created_at,
      })
      .from(partnerRegistrationRequestsTable)
      .where(
        inArray(partnerRegistrationRequestsTable.registration_status, [...PENDING_REGISTRATION_STATUSES]),
      )
      .orderBy(desc(partnerRegistrationRequestsTable.created_at))
      .limit(5),
    countSupportThreadsByStatusForAdmin(),
    listSupportThreadsAdmin({
      status: "open",
      companyId: undefined,
      category: undefined,
      q: undefined,
      limit: 5,
      offset: 0,
    }),
    countPendingFleetVehiclesForAdmin(),
    listPendingFleetVehiclesForAdmin(5),
    countPendingFleetDriversForAdmin(),
    listPendingFleetDriversForAdmin(5),
    db
      .select({ n: count() })
      .from(adminCompaniesTable)
      .where(eq(adminCompaniesTable.is_blocked, true)),
    db
      .select({ n: count() })
      .from(adminCompaniesTable)
      .where(ne(adminCompaniesTable.compliance_status, "compliant")),
    db
      .select({
        id: adminCompaniesTable.id,
        name: adminCompaniesTable.name,
        isBlocked: adminCompaniesTable.is_blocked,
        complianceStatus: adminCompaniesTable.compliance_status,
      })
      .from(adminCompaniesTable)
      .where(
        or(
          eq(adminCompaniesTable.is_blocked, true),
          ne(adminCompaniesTable.compliance_status, "compliant"),
        )!,
      )
      .orderBy(desc(adminCompaniesTable.is_blocked), desc(adminCompaniesTable.id))
      .limit(5),
  ]);

  const registration = {
    pendingCount: Number(regCountRow[0]?.n ?? 0),
    latest: regLatestRows.map((r) => ({
      id: r.id,
      companyName: r.companyName,
      email: r.email,
      partnerType: r.partnerType,
      registrationStatus: r.registrationStatus,
      createdAt: r.createdAt.toISOString(),
    })),
  };

  const support = {
    openCount: supportByStatus.open,
    inProgressCount: supportByStatus.in_progress,
    answeredCount: supportByStatus.answered,
    latestOpenThreads: supportOpen.map((t) => ({
      id: t.id,
      companyId: t.companyId,
      companyName: t.companyName,
      title: t.title,
      status: t.status,
      category: t.category,
      lastMessageAt: t.lastMessageAt,
      lastSnippet: t.lastSnippet,
    })),
  };

  const fleet = {
    pendingApprovalCount: fleetPendingN,
    latest: fleetPreview.map((r) => ({
      vehicleId: r.vehicle.id,
      companyId: r.vehicle.companyId,
      companyName: r.companyName,
      licensePlate: r.vehicle.licensePlate,
      model: r.vehicle.model,
      updatedAt: r.vehicle.updatedAt,
      approvalStatus: r.vehicle.approvalStatus,
    })),
  };

  const fleetDrivers = {
    pendingApprovalCount: fleetDriversPendingN,
    latest: fleetDriversPreview.map((r) => ({
      driverId: r.driverId,
      companyId: r.companyId,
      companyName: r.companyName,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      approvalStatus: r.approvalStatus,
      updatedAt: r.updatedAt,
    })),
  };

  const companies = {
    blockedCount: Number(blockedRow[0]?.n ?? 0),
    incompleteComplianceCount: Number(incompleteRow[0]?.n ?? 0),
    latestProblematic: probRows.map((r) => ({
      id: r.id,
      name: r.name,
      isBlocked: r.isBlocked,
      complianceStatus: r.complianceStatus,
    })),
  };

  const recentTasks: AdminOperatorTaskItem[] = [];

  for (const r of registration.latest) {
    recentTasks.push({
      kind: "registration",
      at: r.createdAt,
      title: r.companyName,
      subtitle: `Registrierung · ${registrationStatusDe(r.registrationStatus)}`,
      pageKey: "company-registration-requests",
      refId: r.id,
      severity: "high",
    });
  }
  for (const t of support.latestOpenThreads) {
    recentTasks.push({
      kind: "support",
      at: t.lastMessageAt,
      title: t.title,
      subtitle: t.companyName,
      pageKey: "support-inbox",
      refId: t.id,
      severity: "high",
    });
  }
  for (const v of fleet.latest) {
    recentTasks.push({
      kind: "fleet",
      at: v.updatedAt,
      title: v.licensePlate,
      subtitle: v.companyName,
      pageKey: "fleet-vehicles-review",
      refId: v.vehicleId,
      severity: "medium",
    });
  }
  for (const d of fleetDrivers.latest) {
    const name = `${d.firstName} ${d.lastName}`.trim() || d.email;
    recentTasks.push({
      kind: "fleet_driver",
      at: d.updatedAt,
      title: name,
      subtitle: `${d.companyName} · Fahrer-Freigabe`,
      pageKey: "taxi-fleet-drivers",
      refId: d.driverId,
      severity: "medium",
    });
  }

  recentTasks.sort((a, b) => parseIsoToMs(b.at) - parseIsoToMs(a.at));
  const trimmedTasks = recentTasks.slice(0, 10);

  return {
    registration,
    support,
    fleet,
    fleetDrivers,
    companies,
    recentTasks: trimmedTasks,
  };
}
