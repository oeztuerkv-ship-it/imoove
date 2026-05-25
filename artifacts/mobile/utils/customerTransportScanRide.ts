import type { MedicalTrafficLight } from "@/utils/medicalScanApi";

export type CustomerTransportScanRideSnap = {
  trafficLight: MedicalTrafficLight;
  primaryReasonDe: string;
  insuranceName: string;
};

export function customerTransportScanFromPartnerMeta(
  meta: Record<string, unknown> | null | undefined,
): CustomerTransportScanRideSnap | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = meta.customer_transport_scan;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const tl = rec.trafficLight;
  if (tl !== "green" && tl !== "yellow" && tl !== "red") return null;
  return {
    trafficLight: tl,
    primaryReasonDe: typeof rec.primaryReasonDe === "string" ? rec.primaryReasonDe.trim() : "",
    insuranceName: typeof rec.insuranceName === "string" ? rec.insuranceName.trim() : "",
  };
}

export function customerTransportScanAmpelLabel(tl: MedicalTrafficLight): string {
  if (tl === "green") return "Grün";
  if (tl === "yellow") return "Gelb";
  return "Rot";
}
