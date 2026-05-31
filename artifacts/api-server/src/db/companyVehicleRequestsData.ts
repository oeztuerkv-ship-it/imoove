import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  isCompanyVehicleReviewStatus,
  type CompanyVehicleReviewStatus,
} from "../lib/companyOnboardingConstants";
import { getDb, isPostgresConfigured } from "./client";
import {
  type CompanyDocumentMeta,
  type CompanyOnboardingProfile,
  type CompanyVehicleRow,
  getCompanyOnboardingBundle,
  getCompanyOnboardingDocumentFile,
  listCompanyOnboardingDocuments,
  rowToVehicle,
} from "./companyOnboardingData";
import { adminCompaniesTable, companyOperatorMessagesTable, companyVehiclesTable } from "./schema";

export type CompanyOperatorMessageRow = {
  id: string;
  companyId: string;
  vehicleId: string | null;
  senderType: "admin" | "partner";
  body: string;
  createdAt: string;
};

export type CompanyVehicleRequestListItem = {
  companyId: string;
  companyName: string;
  onboardingStatus: string;
  pendingVehicleCount: number;
  lastSubmittedAt: string | null;
  hasKonzessionDoc: boolean;
  hasFahrzeugscheinDoc: boolean;
};

export type CompanyVehicleRequestDetail = {
  profile: CompanyOnboardingProfile;
  vehicles: CompanyVehicleRow[];
  documents: CompanyDocumentMeta[];
  messages: CompanyOperatorMessageRow[];
};

function mapMessage(r: typeof companyOperatorMessagesTable.$inferSelect): CompanyOperatorMessageRow {
  return {
    id: r.id,
    companyId: r.company_id,
    vehicleId: r.vehicle_id ?? null,
    senderType: r.sender_type === "admin" ? "admin" : "partner",
    body: r.body,
    createdAt: r.created_at.toISOString(),
  };
}

function vehicleDocFlags(
  docs: CompanyDocumentMeta[],
  vehicleId: string,
): { hasKonzession: boolean; hasFahrzeugschein: boolean } {
  let hasKonzession = false;
  let hasFahrzeugschein = false;
  for (const d of docs) {
    if (d.vehicleId !== vehicleId) continue;
    if (d.docType === "konzession") hasKonzession = true;
    if (d.docType === "fahrzeugschein") hasFahrzeugschein = true;
  }
  return { hasKonzession, hasFahrzeugschein };
}

export async function listCompanyVehicleRequestsForAdmin(opts?: {
  status?: "pending" | "all";
  limit?: number;
}): Promise<CompanyVehicleRequestListItem[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 80, 1), 200);
  const onlyPending = opts?.status !== "all";

  const companyRows = await db
    .select({
      id: adminCompaniesTable.id,
      name: adminCompaniesTable.name,
      onboarding_status: adminCompaniesTable.onboarding_status,
      company_kind: adminCompaniesTable.company_kind,
    })
    .from(adminCompaniesTable)
    .where(
      onlyPending
        ? or(
            eq(adminCompaniesTable.onboarding_status, "pending"),
            sql`EXISTS (
              SELECT 1 FROM company_vehicles cv
              WHERE cv.company_id = ${adminCompaniesTable.id}
                AND cv.review_status = 'pending'
            )`,
          )
        : and(
            eq(adminCompaniesTable.company_kind, "taxi"),
            or(
              inArray(adminCompaniesTable.onboarding_status, ["pending", "incomplete"]),
              sql`EXISTS (
                SELECT 1 FROM company_vehicles cv2
                WHERE cv2.company_id = ${adminCompaniesTable.id}
                  AND cv2.review_status IN ('pending', 'active', 'inactive', 'rejected')
              )`,
            ),
          ),
    )
    .orderBy(desc(adminCompaniesTable.onboarding_status), adminCompaniesTable.name)
    .limit(limit);

  const out: CompanyVehicleRequestListItem[] = [];
  for (const c of companyRows) {
    if (String(c.company_kind ?? "") !== "taxi") continue;
    const vehicles = await db
      .select()
      .from(companyVehiclesTable)
      .where(eq(companyVehiclesTable.company_id, c.id));
    const docs = await listCompanyOnboardingDocuments(c.id);
    const pendingVehicles = vehicles.filter((v) => v.review_status === "pending");
    if (onlyPending && c.onboarding_status !== "pending" && pendingVehicles.length === 0) continue;

    let lastSubmitted: string | null = null;
    let hasKonzessionDoc = false;
    let hasFahrzeugscheinDoc = false;
    for (const v of vehicles) {
      const sub = v.submitted_at?.toISOString() ?? null;
      if (sub && (!lastSubmitted || sub > lastSubmitted)) lastSubmitted = sub;
      const flags = vehicleDocFlags(docs, v.id);
      if (flags.hasKonzession) hasKonzessionDoc = true;
      if (flags.hasFahrzeugschein) hasFahrzeugscheinDoc = true;
    }
    for (const d of docs) {
      if (!d.vehicleId) continue;
      if (d.docType === "konzession") hasKonzessionDoc = true;
      if (d.docType === "fahrzeugschein") hasFahrzeugscheinDoc = true;
    }

    out.push({
      companyId: c.id,
      companyName: c.name,
      onboardingStatus: c.onboarding_status ?? "incomplete",
      pendingVehicleCount: pendingVehicles.length,
      lastSubmittedAt: lastSubmitted,
      hasKonzessionDoc,
      hasFahrzeugscheinDoc,
    });
  }
  return out.sort((a, b) => {
    const ta = a.lastSubmittedAt ?? "";
    const tb = b.lastSubmittedAt ?? "";
    return tb.localeCompare(ta);
  });
}

export async function getCompanyVehicleRequestDetailForAdmin(
  companyId: string,
): Promise<CompanyVehicleRequestDetail | null> {
  const bundle = await getCompanyOnboardingBundle(companyId);
  if (!bundle) return null;
  const messages = await listCompanyOperatorMessages(companyId);
  return {
    profile: bundle.profile,
    vehicles: bundle.vehicles,
    documents: bundle.documents,
    messages,
  };
}

export async function listCompanyOperatorMessages(companyId: string): Promise<CompanyOperatorMessageRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(companyOperatorMessagesTable)
    .where(eq(companyOperatorMessagesTable.company_id, companyId))
    .orderBy(companyOperatorMessagesTable.created_at);
  return rows.map(mapMessage);
}

export async function insertCompanyOperatorMessage(input: {
  companyId: string;
  vehicleId?: string | null;
  senderType: "admin" | "partner";
  senderAdminUserId?: string | null;
  senderPanelUserId?: string | null;
  body: string;
  updateVehicleOperatorMessage?: boolean;
}): Promise<
  { ok: true; message: CompanyOperatorMessageRow } | { ok: false; error: string }
> {
  const body = input.body.trim().slice(0, 8000);
  if (!body) return { ok: false, error: "body_required" };
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const vehicleId = (input.vehicleId ?? "").trim() || null;
  if (vehicleId) {
    const v = await db
      .select({ id: companyVehiclesTable.id })
      .from(companyVehiclesTable)
      .where(
        and(eq(companyVehiclesTable.id, vehicleId), eq(companyVehiclesTable.company_id, input.companyId)),
      )
      .limit(1);
    if (!v[0]) return { ok: false, error: "vehicle_not_found" };
  }

  const ins = await db
    .insert(companyOperatorMessagesTable)
    .values({
      id: randomUUID(),
      company_id: input.companyId,
      vehicle_id: vehicleId,
      sender_type: input.senderType,
      sender_admin_user_id: input.senderAdminUserId ?? null,
      sender_panel_user_id: input.senderPanelUserId ?? null,
      body,
    })
    .returning();
  if (!ins[0]) return { ok: false, error: "insert_failed" };

  if (input.senderType === "admin" && input.updateVehicleOperatorMessage !== false) {
    if (vehicleId) {
      await db
        .update(companyVehiclesTable)
        .set({ operator_message: body })
        .where(
          and(eq(companyVehiclesTable.id, vehicleId), eq(companyVehiclesTable.company_id, input.companyId)),
        );
    } else {
      await db
        .update(companyVehiclesTable)
        .set({ operator_message: body })
        .where(eq(companyVehiclesTable.company_id, input.companyId));
    }
  }

  return { ok: true, message: mapMessage(ins[0]) };
}

export async function patchCompanyVehicleReviewForAdmin(
  companyId: string,
  vehicleId: string,
  input: {
    reviewStatus?: CompanyVehicleReviewStatus;
    operatorMessage?: string;
    reviewedByAdmin?: string | null;
  },
): Promise<{ ok: true; vehicle: CompanyVehicleRow } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const set: Record<string, unknown> = {};
  if (input.reviewStatus !== undefined) {
    if (!isCompanyVehicleReviewStatus(input.reviewStatus)) {
      return { ok: false, error: "invalid_review_status" };
    }
    set.review_status = input.reviewStatus;
    set.reviewed_at = new Date();
    set.reviewed_by_admin = (input.reviewedByAdmin ?? "").trim().slice(0, 120) || null;
    if (input.reviewStatus === "active") set.is_active = true;
    if (input.reviewStatus === "inactive" || input.reviewStatus === "rejected") {
      set.is_active = false;
    }
  }
  if (input.operatorMessage !== undefined) {
    set.operator_message = input.operatorMessage.trim().slice(0, 4000);
  }

  if (Object.keys(set).length === 0) return { ok: false, error: "no_changes" };

  const u = await db
    .update(companyVehiclesTable)
    .set(set)
    .where(
      and(eq(companyVehiclesTable.id, vehicleId), eq(companyVehiclesTable.company_id, companyId)),
    )
    .returning();
  if (!u[0]) return { ok: false, error: "not_found" };
  return { ok: true, vehicle: rowToVehicle(u[0]) };
}

export { getCompanyOnboardingDocumentFile };
