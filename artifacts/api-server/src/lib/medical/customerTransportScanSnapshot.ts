import type { MedicalInsuranceRuleResult, MedicalScanWarningDto } from "../lib/medical/medicalScanService";

export type CustomerTransportScanTrafficLight = "green" | "yellow" | "red";

/** Persistierter Snapshot — wird in rides.partner_booking_meta.customer_transport_scan abgelegt. */
export type CustomerTransportScanMeta = {
  scanId: string;
  trafficLight: CustomerTransportScanTrafficLight;
  scannedAt: string;
  testMode: false;
  primaryReasonDe: string;
  requiresDriverRecheck: boolean;
  insuranceName: string;
  transportDate: string | null;
  /** Kurzliste für Fahrer (max. 3 Einträge, ohne Codes). */
  driverHintLines: string[];
  storageKey: string;
};

const PARTNER_IK_WARNING_CODES = new Set(["stationaer_missing_taxi_ik", "missing_partner_ik"]);

/** Partner-/Leistungserbringer-IK: beim Kunden-Scan irrelevant (kommt vom Mandanten). */
export function isPartnerIkIrrelevantForCustomerScan(item: { code?: string; message?: string }): boolean {
  if (item.code && PARTNER_IK_WARNING_CODES.has(item.code)) return true;
  const m = (item.message ?? "").toLowerCase();
  return m.includes("leistungserbringer-ik") || m.includes("partner-ik");
}

export function filterWarningsForCustomerScan<T extends { code?: string; message?: string }>(items: T[]): T[] {
  return items.filter((w) => !isPartnerIkIrrelevantForCustomerScan(w));
}

export function pickPrimaryCustomerScanReasonDe(
  trafficLight: CustomerTransportScanTrafficLight,
  warnings: MedicalScanWarningDto[],
  insuranceRules?: MedicalInsuranceRuleResult | null,
): string {
  const visible = filterWarningsForCustomerScan(
    warnings.filter((w) => w.severity !== "info" && (w.message?.trim() || w.code)),
  );
  const fromWarning = visible.find((w) => w.severity === "block_recommended") ?? visible[0];
  if (fromWarning?.message?.trim()) return fromWarning.message.trim();
  const fromRules = filterWarningsForCustomerScan(
    (insuranceRules?.warnings ?? []).map((message) => ({ message })),
  ).find((w) => w.message?.trim());
  if (fromRules?.message?.trim()) return fromRules.message.trim();
  const summary = insuranceRules?.summary?.trim();
  if (summary) return summary;
  if (trafficLight === "yellow") return "Der Schein konnte nicht vollständig geprüft werden.";
  if (trafficLight === "red") return "Der Schein erfüllt die Anforderungen nicht.";
  return "";
}

export function buildDriverHintLines(
  warnings: MedicalScanWarningDto[],
  insuranceRules?: MedicalInsuranceRuleResult | null,
): string[] {
  const lines: string[] = [];
  for (const w of filterWarningsForCustomerScan(warnings)) {
    if (w.severity === "info") continue;
    const msg = w.message?.trim();
    if (msg && !lines.includes(msg)) lines.push(msg);
    if (lines.length >= 3) break;
  }
  if (lines.length < 3 && insuranceRules) {
    for (const w of filterWarningsForCustomerScan(
      insuranceRules.warnings.map((message) => ({ message })),
    )) {
      const t = w.message?.trim() ?? "";
      if (t && !lines.includes(t)) lines.push(t);
      if (lines.length >= 3) break;
    }
  }
  return lines;
}

export function buildCustomerTransportScanMeta(input: {
  scanId: string;
  trafficLight: CustomerTransportScanTrafficLight;
  scannedAt: string;
  primaryReasonDe: string;
  insuranceName: string;
  transportDate: string | null;
  driverHintLines: string[];
  storageKey: string;
}): CustomerTransportScanMeta {
  return {
    scanId: input.scanId,
    trafficLight: input.trafficLight,
    scannedAt: input.scannedAt,
    testMode: false,
    primaryReasonDe: input.primaryReasonDe,
    requiresDriverRecheck: input.trafficLight !== "green",
    insuranceName: input.insuranceName,
    transportDate: input.transportDate,
    driverHintLines: input.driverHintLines,
    storageKey: input.storageKey,
  };
}

export function customerTransportScanMetaToPartnerJson(meta: CustomerTransportScanMeta): Record<string, unknown> {
  return JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
}

export function parseCustomerMedicalScanIdFromBody(raw: Record<string, unknown>): string {
  const top =
    typeof raw.customerMedicalScanId === "string"
      ? raw.customerMedicalScanId
      : typeof raw.customer_medical_scan_id === "string"
        ? raw.customer_medical_scan_id
        : "";
  if (top.trim()) return top.trim();
  const pm = raw.partnerBookingMeta ?? raw.partner_booking_meta;
  if (!pm || typeof pm !== "object" || Array.isArray(pm)) return "";
  const rec = pm as Record<string, unknown>;
  const nested =
    typeof rec.customerMedicalScanId === "string"
      ? rec.customerMedicalScanId
      : typeof rec.customer_medical_scan_id === "string"
        ? rec.customer_medical_scan_id
        : "";
  return nested.trim();
}
