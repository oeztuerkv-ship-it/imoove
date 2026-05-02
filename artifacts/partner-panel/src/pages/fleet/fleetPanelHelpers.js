/** Antwort von `POST /panel/v1/fleet/drivers` bei Fehler — siehe `fleetPanelApi.ts` / `insertFleetDriver`. */
export function messageForFleetDriverCreateError(data) {
  const code = typeof data?.error === "string" ? data.error : "";
  const hint = data?.hint;
  const maxDrivers = data?.maxDrivers;
  switch (code) {
    case "email_taken":
      return "Diese E-Mail ist bereits als Fahrer registriert (systemweit eindeutig). Mit bestehendem Konto anmelden oder andere E-Mail wählen.";
    case "email_invalid":
      return "Bitte eine gültige E-Mail-Adresse eingeben.";
    case "company_profile_incomplete":
      return "Unternehmensprofil unvollständig. Bitte Stammdaten unter Firmendaten vervollständigen.";
    case "company_not_verified":
      return "Unternehmen ist noch nicht verifiziert. Freigabe abwarten oder Support kontaktieren.";
    case "company_not_compliant":
      return "Compliance-Anforderungen nicht erfüllt. Bitte Status im Panel prüfen.";
    case "contract_not_active":
      return "Kein aktiver Vertrag. Ohne aktiven Vertrag können keine Fahrer angelegt werden.";
    case "required_documents_missing":
      return "Pflichtnachweise fehlen (z. B. Gewerbe oder Versicherung). Bitte im Bereich „Dokumente“ prüfen.";
    case "company_blocked":
      return "Unternehmen ist gesperrt. Bitte Support kontaktieren.";
    case "company_not_found":
      return "Unternehmen wurde nicht gefunden.";
    case "driver_limit_reached":
      return maxDrivers != null
        ? `Maximale Fahreranzahl für Ihr Paket (${maxDrivers}) ist erreicht.`
        : "Maximale Fahreranzahl ist erreicht.";
    case "fleet_only_taxi_company":
      return "Flottenverwaltung steht nur Taxi-Unternehmen zur Verfügung.";
    case "module_not_enabled":
      return "Das Modul „Flotte“ ist für Ihr Konto nicht freigeschaltet.";
    case "forbidden":
      return hint
        ? `Keine Berechtigung (${String(hint)}). Bitte Rolle „Flotte verwalten“ zuweisen oder anderen Benutzer nutzen.`
        : "Keine Berechtigung. Bitte mit einem Benutzer anmelden, der „Flotte verwalten“ darf.";
    case "database_not_configured":
      return "Dienst vorübergehend nicht verfügbar. Bitte später erneut versuchen.";
    case "unauthorized":
    case "user_inactive_or_missing":
    case "token_out_of_sync":
      return "Sitzung abgelaufen oder ungültig. Bitte abmelden und neu anmelden.";
    case "timeout":
      return "Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.";
    case "network_error":
      return "Netzwerkfehler. Bitte Verbindung prüfen und erneut versuchen.";
    default:
      return code ? `Ein unbekannter Fehler ist aufgetreten (Technisch: ${code}).` : "Ein unbekannter Fehler ist aufgetreten.";
  }
}

export const VEHICLE_TYPES = [
  { value: "sedan", label: "Limousine" },
  { value: "station_wagon", label: "Kombi" },
  { value: "van", label: "Großraum / V-Klasse" },
  { value: "wheelchair", label: "Rollstuhlgerecht" },
];

export const VEHICLE_LEGAL_HINT =
  "Onroda arbeitet nur mit Taxi-Schätzpreis. Alle Fahrzeuge werden als Taxi geführt; die Zuordnung erfolgt weiterhin über Fahrzeugklasse (Standard, XL, Rollstuhl).";

export const VEHICLE_CLASSES = [
  { value: "standard", label: "Standard" },
  { value: "xl", label: "XL / Großraum" },
  { value: "wheelchair", label: "Rollstuhl / barrierefrei" },
];

export function vehicleStatusDe(v) {
  const s = v?.approvalStatus;
  if (s === "draft") return "Entwurf";
  if (s === "pending_approval") return "In Prüfung";
  if (s === "approved") return "Freigegeben";
  if (s === "rejected") return "Abgelehnt";
  if (s === "blocked") return "Gesperrt";
  return "—";
}

export function vehicleStatusTone(v) {
  const s = v?.approvalStatus;
  if (s === "approved") return "ok";
  if (s === "pending_approval") return "warn";
  if (s === "rejected" || s === "blocked") return "danger";
  return "soft";
}

export function formatDateDe(isoDate) {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString("de-DE");
}

export function pScheinMeta(isoDate) {
  if (!isoDate) return { label: "Kein Datum", tone: "warn" };
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { label: String(isoDate), tone: "warn" };
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expiryUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (expiryUtc < todayUtc) {
    return { label: `abgelaufen (${formatDateDe(isoDate)})`, tone: "danger" };
  }
  return { label: formatDateDe(isoDate), tone: "ok" };
}

function workflowKeyToTone(key) {
  if (key === "inactive" || key === "suspended") return "missing";
  if (key === "rejected") return "missing";
  if (key === "in_review" || key === "pending") return "review";
  if (key === "approved") return "neutral";
  return "soft";
}

export function workflowPill(driver) {
  const w = driver?.workflow;
  if (w?.label) {
    return { label: w.label, tone: workflowKeyToTone(w.key) };
  }
  const st = String(driver?.approvalStatus ?? "approved").toLowerCase();
  if (driver && (!driver.isActive || driver.accessStatus === "suspended")) {
    return { label: "Gesperrt", tone: "missing" };
  }
  if (st === "rejected") return { label: "Abgelehnt", tone: "missing" };
  if (st === "in_review") return { label: "In Prüfung", tone: "review" };
  if (st === "pending") return { label: "Angelegt", tone: "review" };
  if (st === "approved") return { label: "Freigegeben", tone: "neutral" };
  return { label: "—", tone: "soft" };
}
