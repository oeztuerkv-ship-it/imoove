/**
 * Einheitliche Compliance-Stufe (Dashboard, Dokumente, KPI) — identisch zur API `complianceBucket`
 * und zur Ableitung in `companyComplianceDocumentsData.deriveGlobalComplianceStatus`.
 *
 * Werte: missing | in_review | rejected | compliant
 */

/** @param {Record<string, unknown> | null | undefined} c */
export function complianceBucketFromCompany(c) {
  if (!c) return "missing";
  const b = c.complianceBucket;
  if (b === "missing" || b === "in_review" || b === "rejected" || b === "compliant") return b;

  const hasG = Boolean(c.hasComplianceGewerbe);
  const hasI = Boolean(c.hasComplianceInsurance);
  if (!hasG || !hasI) return "missing";
  const st = String(c.complianceStatus ?? "")
    .trim()
    .toLowerCase();
  if (st === "non_compliant") return "rejected";
  if (st === "compliant") return "compliant";
  if (st === "in_review") return "in_review";
  return "missing";
}

/** @param {"missing"|"in_review"|"rejected"|"compliant"} bucket */
export function complianceKpiLabelAndClass(bucket) {
  switch (bucket) {
    case "compliant":
      return {
        label: "Freigegeben",
        hint: "Beide Pflichtnachweise sind genehmigt.",
        cls: " partner-kpi--muted",
      };
    case "in_review":
      return {
        label: "In Prüfung",
        hint: "Alle Dateien liegen vor; Freigabe durch Onroda ausstehend.",
        cls: " partner-kpi--warn",
      };
    case "rejected":
      return {
        label: "Abgelehnt",
        hint: "Mindestens ein Nachweis wurde abgelehnt — siehe Dokumente.",
        cls: " partner-kpi--danger",
      };
    default:
      return {
        label: "Unvollständig",
        hint: "Mindestens ein Pflichtnachweis fehlt noch.",
        cls: " partner-kpi--danger",
      };
  }
}

/**
 * @param {Record<string, unknown>} company
 * @param {"gewerbe"|"insurance"} kind
 */
export function complianceDocSpotlight(company, kind) {
  const key = kind === "gewerbe" ? "gewerbe" : "insurance";
  const has = kind === "gewerbe" ? Boolean(company?.hasComplianceGewerbe) : Boolean(company?.hasComplianceInsurance);
  const side = company?.complianceDocuments?.[key];
  const st = String(side?.reviewStatus ?? "")
    .trim()
    .toLowerCase();
  if (!has) {
    return { value: "fehlt — unter „Dokumente“ nachreichen", ok: false };
  }
  if (st === "approved" || st === "freigegeben") {
    return { value: "freigegeben", ok: true };
  }
  if (st === "rejected" || st === "abgelehnt") {
    return { value: "abgelehnt — siehe Dokumente", ok: false };
  }
  if (st === "pending" || st === "") {
    return { value: "in Prüfung (Datei liegt vor)", ok: false };
  }
  return { value: st || "in Prüfung", ok: false };
}

/** @param {Record<string, unknown> | null | undefined} company */
export function complianceOverviewCopy(company) {
  const b = complianceBucketFromCompany(company);
  if (b === "compliant") {
    return {
      label: "Freigegeben",
      tone: "ok",
      text: "Beide Pflichtnachweise sind genehmigt; Ihr Mandant ist aus Compliance-Sicht freigegeben.",
    };
  }
  if (b === "rejected") {
    return {
      label: "Abgelehnt",
      tone: "warn",
      text: "Mindestens ein Nachweis wurde nicht akzeptiert. Bitte Bemerkung unter „Dokumente“ prüfen und ggf. erneut hochladen.",
    };
  }
  if (b === "in_review") {
    return {
      label: "In Prüfung",
      tone: "pending",
      text: "Alle erwarteten Dateien liegen vor; die Prüfung durch Onroda läuft oder steht noch aus.",
    };
  }
  return {
    label: "Unvollständig",
    tone: "warn",
    text: "Mindestens ein Pflichtnachweis fehlt noch. Bitte unter „Dokumente“ nachreichen.",
  };
}
