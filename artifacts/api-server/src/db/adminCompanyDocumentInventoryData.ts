import { desc, eq } from "drizzle-orm";
import { docTypeLabelDe } from "../lib/companyOnboardingConstants.js";
import { fileNameFromStorageKey } from "../lib/adminFleetUploadFile.js";
import { findCompanyById } from "./adminData.js";
import { listCompanyOnboardingDocuments } from "./companyOnboardingData.js";
import { getDb, isPostgresConfigured } from "./client.js";
import { listFleetDriversForCompany } from "./fleetDriversData.js";
import { parseFleetVehicleDocumentKind, listFleetVehiclesForCompany } from "./fleetVehiclesData.js";
import { adminCompaniesTable, companyComplianceDocumentsTable } from "./schema.js";

export type AdminDocumentOpenKind =
  | "onboarding"
  | "compliance"
  | "fleet-driver"
  | "fleet-vehicle";

export type AdminCompanyDocumentInventoryItem = {
  id: string;
  category: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number | null;
  uploadedAt: string | null;
  meta: string | null;
  openKind: AdminDocumentOpenKind;
  openRef: string;
  storageKey?: string;
};

function fmtTs(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  const s = String(v ?? "").trim();
  return s || null;
}

function complianceKindDe(kind: string): string {
  if (kind === "gewerbe") return "Gewerbenachweis (Unternehmen)";
  if (kind === "insurance") return "Versicherung (Unternehmen)";
  return kind;
}

const FLEET_VEHICLE_DOC_KIND_DE: Record<string, string> = {
  concession: "Konzession",
  registration: "Fahrzeugschein",
  insurance: "Versicherung",
  taximeter: "Taxameter / Eichschein",
  accessibility: "Sonderausstattung",
};

function fleetVehicleDocKindLabelDe(kind: ReturnType<typeof parseFleetVehicleDocumentKind>): string {
  if (!kind) return "Nachweis (älterer Upload)";
  return FLEET_VEHICLE_DOC_KIND_DE[kind] ?? kind;
}

export async function listAdminCompanyDocumentInventory(
  companyId: string,
): Promise<AdminCompanyDocumentInventoryItem[] | null> {
  if (!isPostgresConfigured()) return null;
  const company = await findCompanyById(companyId);
  if (!company) return null;

  const items: AdminCompanyDocumentInventoryItem[] = [];

  const [onboardingDocs, drivers, vehicles] = await Promise.all([
    listCompanyOnboardingDocuments(companyId),
    listFleetDriversForCompany(companyId),
    listFleetVehiclesForCompany(companyId),
  ]);

  for (const d of onboardingDocs) {
    const plate =
      d.vehicleId && vehicles.length
        ? vehicles.find((v) => v.id === d.vehicleId)?.licensePlate?.trim()
        : "";
    items.push({
      id: `onb-${d.id}`,
      category: "Onboarding",
      title: docTypeLabelDe(d.docType),
      fileName: d.fileName,
      mimeType: d.mimeType,
      fileSizeBytes: d.fileSizeBytes ?? null,
      uploadedAt: d.uploadedAt ?? null,
      meta: [plate ? `Fahrzeug ${plate}` : "Unternehmen", d.uploadedBy ? `von ${d.uploadedBy}` : null]
        .filter(Boolean)
        .join(" · "),
      openKind: "onboarding",
      openRef: d.id,
    });
  }

  const db = getDb();
  if (db) {
    const complianceRows = await db
      .select()
      .from(companyComplianceDocumentsTable)
      .where(eq(companyComplianceDocumentsTable.company_id, companyId))
      .orderBy(desc(companyComplianceDocumentsTable.uploaded_at));

    for (const row of complianceRows) {
      const sk = String(row.storage_key ?? "").trim();
      if (!sk) continue;
      const kind = String(row.document_type ?? "").trim();
      items.push({
        id: `cmp-${row.id}`,
        category: "Compliance",
        title: complianceKindDe(kind),
        fileName: fileNameFromStorageKey(sk),
        mimeType: "application/pdf",
        fileSizeBytes: null,
        uploadedAt: fmtTs(row.uploaded_at),
        meta: [
          row.is_current ? "aktuell" : "ältere Version",
          row.review_status ? `Prüfung: ${row.review_status}` : null,
          row.uploaded_by_panel_user_id ? `Panel ${row.uploaded_by_panel_user_id}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        openKind: "compliance",
        openRef: kind,
        storageKey: sk,
      });
    }
  }

  const gewKey = String(company.compliance_gewerbe_storage_key ?? "").trim();
  const insKey = String(company.compliance_insurance_storage_key ?? "").trim();
  for (const [kind, sk] of [
    ["gewerbe", gewKey],
    ["insurance", insKey],
  ] as const) {
    if (!sk) continue;
    if (items.some((i) => i.openKind === "compliance" && i.storageKey === sk)) continue;
    items.push({
      id: `cmp-legacy-${kind}`,
      category: "Compliance",
      title: complianceKindDe(kind),
      fileName: fileNameFromStorageKey(sk),
      mimeType: "application/pdf",
      fileSizeBytes: null,
      uploadedAt: null,
      meta: "Speicherpfad (Stammdaten)",
      openKind: "compliance",
      openRef: kind,
      storageKey: sk,
    });
  }

  for (const drv of drivers) {
    const sk = String(drv.pScheinDocStorageKey ?? "").trim();
    if (!sk) continue;
    const name = `${drv.firstName} ${drv.lastName}`.trim() || drv.email;
    items.push({
      id: `drv-${drv.id}`,
      category: "Fahrer",
      title: `P-Schein — ${name}`,
      fileName: fileNameFromStorageKey(sk),
      mimeType: "application/pdf",
      fileSizeBytes: null,
      uploadedAt: drv.updatedAt ?? null,
      meta: drv.pScheinExpiry ? `gültig bis ${drv.pScheinExpiry}` : null,
      openKind: "fleet-driver",
      openRef: drv.id,
      storageKey: sk,
    });
  }

  for (const veh of vehicles) {
    const plate = veh.licensePlate?.trim() || veh.id;
    const docs = veh.vehicleDocuments ?? [];
    docs.forEach((doc, idx) => {
      const sk = String(doc.storageKey ?? "").trim();
      if (!sk) return;
      const kind = parseFleetVehicleDocumentKind(doc.kind);
      const kindLabel = kind ? fleetVehicleDocKindLabelDe(kind) : "Nachweis";
      items.push({
        id: `veh-${veh.id}-${idx}-${sk}`,
        category: "Fahrzeug",
        title: `${kindLabel} — ${plate}`,
        fileName: fileNameFromStorageKey(sk),
        mimeType: "application/pdf",
        fileSizeBytes: null,
        uploadedAt: doc.uploadedAt ?? veh.updatedAt ?? null,
        meta: [
          veh.model?.trim() || null,
          doc.uploadedByPanelUserId ? `Panel ${doc.uploadedByPanelUserId}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        openKind: "fleet-vehicle",
        openRef: veh.id,
        storageKey: sk,
      });
    });
  }

  items.sort((a, b) => {
    const ca = a.category.localeCompare(b.category, "de");
    if (ca !== 0) return ca;
    const ta = a.uploadedAt ?? "";
    const tb = b.uploadedAt ?? "";
    return tb.localeCompare(ta);
  });

  return items;
}

async function companyComplianceStorageKeys(companyId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const company = await findCompanyById(companyId);
  if (company) {
    const g = String(company.compliance_gewerbe_storage_key ?? "").trim();
    const i = String(company.compliance_insurance_storage_key ?? "").trim();
    if (g) keys.add(g);
    if (i) keys.add(i);
  }
  const db = getDb();
  if (db) {
    const rows = await db
      .select({ storage_key: companyComplianceDocumentsTable.storage_key })
      .from(companyComplianceDocumentsTable)
      .where(eq(companyComplianceDocumentsTable.company_id, companyId));
    for (const r of rows) {
      const sk = String(r.storage_key ?? "").trim();
      if (sk) keys.add(sk);
    }
  }
  return keys;
}

export async function resolveAdminComplianceDocumentStorageKey(
  companyId: string,
  kindRaw: string,
  storageKeyQuery?: string,
): Promise<string | null> {
  const kind = kindRaw.trim().toLowerCase();
  if (kind !== "gewerbe" && kind !== "insurance") return null;
  const allowed = await companyComplianceStorageKeys(companyId);
  const q = storageKeyQuery?.trim();
  if (q) return allowed.has(q) ? q : null;
  const company = await findCompanyById(companyId);
  if (!company) return null;
  const fallback =
    kind === "gewerbe"
      ? String(company.compliance_gewerbe_storage_key ?? "").trim()
      : String(company.compliance_insurance_storage_key ?? "").trim();
  return fallback && allowed.has(fallback) ? fallback : null;
}

export async function resolveAdminFleetDriverDocStorageKey(
  companyId: string,
  driverId: string,
): Promise<string | null> {
  const drivers = await listFleetDriversForCompany(companyId);
  const d = drivers.find((x) => x.id === driverId);
  const sk = String(d?.pScheinDocStorageKey ?? "").trim();
  return sk || null;
}
