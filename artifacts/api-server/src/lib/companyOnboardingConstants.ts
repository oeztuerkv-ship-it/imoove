export const ONBOARDING_STATUSES = ["incomplete", "pending", "approved"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const COMPANY_VEHICLE_TYPES = ["limousine", "kombi", "van", "wheelchair"] as const;
export type CompanyVehicleType = (typeof COMPANY_VEHICLE_TYPES)[number];

export const COMPANY_DOC_TYPES = [
  "gewerbeschein",
  "konzession",
  "fahrzeugschein",
  "versicherung",
  "ik_nachweis",
  "personalausweis",
  "sepa",
  "kk_vertrag",
  "sonstige",
] as const;
export type CompanyDocType = (typeof COMPANY_DOC_TYPES)[number];

export const COMPANY_DOC_MAX_BYTES = 10 * 1024 * 1024;

export const COMPANY_DOC_ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

export function isOnboardingStatus(v: string): v is OnboardingStatus {
  return (ONBOARDING_STATUSES as readonly string[]).includes(v);
}

export function isCompanyVehicleType(v: string): v is CompanyVehicleType {
  return (COMPANY_VEHICLE_TYPES as readonly string[]).includes(v);
}

export function isCompanyDocType(v: string): v is CompanyDocType {
  return (COMPANY_DOC_TYPES as readonly string[]).includes(v);
}

export function normalizeCompanyDocMime(mime: string): string | null {
  const m = mime.trim().toLowerCase();
  if (m === "image/jpg") return "image/jpeg";
  if (COMPANY_DOC_ALLOWED_MIMES.has(m)) return m;
  return null;
}

export function docTypeLabelDe(t: string): string {
  const map: Record<string, string> = {
    gewerbeschein: "Gewerbeschein",
    konzession: "Konzession",
    fahrzeugschein: "Fahrzeugschein",
    versicherung: "Versicherung",
    ik_nachweis: "IK-Nachweis",
    personalausweis: "Personalausweis",
    sepa: "SEPA",
    kk_vertrag: "KK-Vertrag",
    sonstige: "Sonstige",
  };
  return map[t] ?? t;
}

export function vehicleTypeLabelDe(t: string): string {
  const map: Record<string, string> = {
    limousine: "Limousine",
    kombi: "Kombi",
    van: "Van",
    wheelchair: "Rollstuhl",
  };
  return map[t] ?? t;
}

export function onboardingStatusLabelDe(s: string): string {
  if (s === "approved") return "Freigegeben";
  if (s === "pending") return "Ausstehend";
  return "Unvollständig";
}
