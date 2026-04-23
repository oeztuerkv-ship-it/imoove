import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable, companyComplianceDocumentsTable } from "./schema";

export type ComplianceDocumentKind = "gewerbe" | "insurance";

export type PanelComplianceDocumentSide = {
  uploadedAt: string;
  reviewStatus: string;
  reviewNote: string;
};

export type PanelComplianceDocuments = {
  gewerbe: PanelComplianceDocumentSide;
  insurance: PanelComplianceDocumentSide;
};

function asReview(s: string | null | undefined): "pending" | "approved" | "rejected" {
  const v = String(s ?? "").trim();
  if (v === "approved" || v === "rejected" || v === "pending") return v;
  return "pending";
}

/**
 * Abgeleiteter Plattform-Status aus zwei Pflicht-Nachweisen.
 * (DB-Werte: pending, in_review, compliant, non_compliant — vgl. admin_companies_compliance_status_chk)
 */
export function deriveGlobalComplianceStatus(args: {
  hasGewerbe: boolean;
  hasInsurance: boolean;
  /** null = Nachweis fehlt (kein Beitrag zur Ableitung) */
  gewerbeReview: "pending" | "approved" | "rejected" | null;
  insuranceReview: "pending" | "approved" | "rejected" | null;
}): "pending" | "in_review" | "compliant" | "non_compliant" {
  if (!args.hasGewerbe || !args.hasInsurance) return "pending";
  const g = args.gewerbeReview ?? "pending";
  const i = args.insuranceReview ?? "pending";
  if (g === "rejected" || i === "rejected") return "non_compliant";
  if (g === "pending" || i === "pending") return "in_review";
  if (g === "approved" && i === "approved") return "compliant";
  return "in_review";
}

function reviewForSide(
  has: boolean,
  companyKey: string | null,
  row: typeof companyComplianceDocumentsTable.$inferSelect | undefined,
): "pending" | "approved" | "rejected" | null {
  if (!has) return null;
  const k = (companyKey ?? "").trim();
  if (!k) return "pending";
  if (!row || (row.storage_key ?? "").trim() !== k) return "pending";
  return asReview(row.review_status);
}

function buildSide(
  has: boolean,
  companyKey: string | null,
  row: typeof companyComplianceDocumentsTable.$inferSelect | undefined,
): PanelComplianceDocumentSide {
  if (!has) {
    return { uploadedAt: "", reviewStatus: "", reviewNote: "" };
  }
  const k = (companyKey ?? "").trim();
  if (row && (row.storage_key ?? "").trim() === k) {
    const uploaded = row.uploaded_at;
    return {
      uploadedAt: uploaded instanceof Date ? uploaded.toISOString() : String(uploaded ?? ""),
      reviewStatus: asReview(row.review_status),
      reviewNote: String(row.review_note ?? "").trim(),
    };
  }
  return { uploadedAt: "", reviewStatus: "pending", reviewNote: "" };
}

async function listCurrentDocRows(companyId: string) {
  const db = getDb();
  if (!db) {
    return [] as (typeof companyComplianceDocumentsTable.$inferSelect)[];
  }
  return db
    .select()
    .from(companyComplianceDocumentsTable)
    .where(
      and(
        eq(companyComplianceDocumentsTable.company_id, companyId),
        eq(companyComplianceDocumentsTable.is_current, true),
      ),
    );
}

export async function getDerivedComplianceAndDocumentsForRow(
  r: typeof adminCompaniesTable.$inferSelect,
): Promise<{
  status: "pending" | "in_review" | "compliant" | "non_compliant";
  complianceDocuments: PanelComplianceDocuments;
}> {
  const hasG = Boolean((r.compliance_gewerbe_storage_key ?? "").trim());
  const hasI = Boolean((r.compliance_insurance_storage_key ?? "").trim());
  if (!isPostgresConfigured() || !getDb()) {
    const gR = hasG ? "pending" : null;
    const iR = hasI ? "pending" : null;
    return {
      status: deriveGlobalComplianceStatus({
        hasGewerbe: hasG,
        hasInsurance: hasI,
        gewerbeReview: gR,
        insuranceReview: iR,
      }),
      complianceDocuments: {
        gewerbe: { uploadedAt: "", reviewStatus: hasG ? "pending" : "", reviewNote: "" },
        insurance: { uploadedAt: "", reviewStatus: hasI ? "pending" : "", reviewNote: "" },
      },
    };
  }
  const rows = await listCurrentDocRows(r.id);
  const gRow = rows.find((x) => x.document_type === "gewerbe");
  const iRow = rows.find((x) => x.document_type === "insurance");
  const gRev = reviewForSide(hasG, r.compliance_gewerbe_storage_key, gRow);
  const iRev = reviewForSide(hasI, r.compliance_insurance_storage_key, iRow);
  const status = deriveGlobalComplianceStatus({
    hasGewerbe: hasG,
    hasInsurance: hasI,
    gewerbeReview: gRev,
    insuranceReview: iRev,
  });
  return {
    status,
    complianceDocuments: {
      gewerbe: buildSide(hasG, r.compliance_gewerbe_storage_key, gRow),
      insurance: buildSide(hasI, r.compliance_insurance_storage_key, iRow),
    },
  };
}

export async function getDerivedGlobalComplianceStatusForCompanyRow(
  r: typeof adminCompaniesTable.$inferSelect,
): Promise<"pending" | "in_review" | "compliant" | "non_compliant"> {
  const { status } = await getDerivedComplianceAndDocumentsForRow(r);
  return status;
}

export async function recomputeAndPersistGlobalCompliance(companyId: string): Promise<void> {
  if (!isPostgresConfigured() || !getDb()) return;
  const db = getDb()!;
  const rows = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
  const r = rows[0];
  if (!r) return;
  const { status } = await getDerivedComplianceAndDocumentsForRow(r);
  await db
    .update(adminCompaniesTable)
    .set({ compliance_status: status })
    .where(eq(adminCompaniesTable.id, companyId));
}

/**
 * Neuer Datei-Upload: neue Zeile, alte is_current, Speicher-Key in admin_companies, globaler Status.
 */
export async function insertComplianceDocumentUpload(
  companyId: string,
  kind: ComplianceDocumentKind,
  storageKey: string,
  panelUserId: string,
): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new Error("database_not_configured");
  }
  const docId = randomUUID();
  const col =
    kind === "gewerbe" ? { compliance_gewerbe_storage_key: storageKey } : { compliance_insurance_storage_key: storageKey };

  await db.transaction(async (tx) => {
    await tx
      .update(companyComplianceDocumentsTable)
      .set({ is_current: false })
      .where(
        and(
          eq(companyComplianceDocumentsTable.company_id, companyId),
          eq(companyComplianceDocumentsTable.document_type, kind),
          eq(companyComplianceDocumentsTable.is_current, true),
        ),
      );
    await tx.insert(companyComplianceDocumentsTable).values({
      id: docId,
      company_id: companyId,
      document_type: kind,
      storage_key: storageKey,
      uploaded_by_panel_user_id: panelUserId,
      review_status: "pending",
      review_note: "",
      is_current: true,
    });
    await tx.update(adminCompaniesTable).set(col).where(eq(adminCompaniesTable.id, companyId));
  });
  await recomputeAndPersistGlobalCompliance(companyId);
}

/**
 * Plattform-Admin: Prüfung des aktuellen Nachweises (current row) setzen, globaler Status folgt daraus.
 */
export async function setCurrentComplianceDocumentReview(
  companyId: string,
  kind: ComplianceDocumentKind,
  input: { reviewStatus: "approved" | "rejected"; reviewNote: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) {
    return { ok: false, error: "database_not_configured" };
  }
  const note = input.reviewNote.trim().slice(0, 4000);
  const rows = await db
    .select()
    .from(companyComplianceDocumentsTable)
    .where(
      and(
        eq(companyComplianceDocumentsTable.company_id, companyId),
        eq(companyComplianceDocumentsTable.document_type, kind),
        eq(companyComplianceDocumentsTable.is_current, true),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    return { ok: false, error: "no_current_document" };
  }
  await db
    .update(companyComplianceDocumentsTable)
    .set({
      review_status: input.reviewStatus,
      review_note: input.reviewStatus === "rejected" ? note : "",
    })
    .where(eq(companyComplianceDocumentsTable.id, rows[0]!.id));
  await recomputeAndPersistGlobalCompliance(companyId);
  return { ok: true };
}
