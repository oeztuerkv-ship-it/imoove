/** Gemeinsame Darstellung für Compliance-Dokumente (Gewerbe/Versicherung) — ohne API-Änderung. */

export function complianceDocItems(company) {
  const docs =
    company?.complianceDocuments && typeof company.complianceDocuments === "object" ? company.complianceDocuments : {};
  const gewerbe = docs.gewerbe && typeof docs.gewerbe === "object" ? docs.gewerbe : {};
  const insurance = docs.insurance && typeof docs.insurance === "object" ? docs.insurance : {};
  return [
    {
      key: "gewerbe",
      title: "Gewerbenachweis",
      ok: Boolean(company?.hasComplianceGewerbe),
      hintMissing: "Nachweis fehlt. Bitte über den vorgesehenen Änderungs-/Freigabeprozess nachreichen.",
      uploadedAt: typeof gewerbe.uploadedAt === "string" ? gewerbe.uploadedAt : "",
      reviewStatus: typeof gewerbe.reviewStatus === "string" ? gewerbe.reviewStatus : "",
      reviewNote: typeof gewerbe.reviewNote === "string" ? gewerbe.reviewNote : "",
    },
    {
      key: "insurance",
      title: "Versicherungsnachweis",
      ok: Boolean(company?.hasComplianceInsurance),
      hintMissing: "Nachweis fehlt. Bitte über den vorgesehenen Änderungs-/Freigabeprozess nachreichen.",
      uploadedAt: typeof insurance.uploadedAt === "string" ? insurance.uploadedAt : "",
      reviewStatus: typeof insurance.reviewStatus === "string" ? insurance.reviewStatus : "",
      reviewNote: typeof insurance.reviewNote === "string" ? insurance.reviewNote : "",
    },
  ];
}

export function formatDateTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE");
}

export function docUiState(item) {
  const st = String(item?.reviewStatus ?? "").trim().toLowerCase();
  const uploadedAt = String(item?.uploadedAt ?? "").trim();
  if (!item?.ok) {
    return {
      key: "missing",
      label: "fehlt",
      tone: "missing",
      text: item?.hintMissing || "Noch kein Nachweis im System.",
      validity: "—",
    };
  }
  if (st === "approved" || st === "freigegeben") {
    return {
      key: "approved",
      label: "freigegeben",
      tone: "neutral",
      text: "Von Onroda geprüft und akzeptiert.",
      validity: "gültig",
    };
  }
  if (st === "rejected" || st === "abgelehnt") {
    return {
      key: "rejected",
      label: "abgelehnt",
      tone: "missing",
      text: item?.reviewNote || "Nicht akzeptiert — bitte korrigieren und erneut als PDF hochladen.",
      validity: "ungültig",
    };
  }
  if (!uploadedAt) {
    return {
      key: "uploaded",
      label: "hochgeladen",
      tone: "review",
      text: "Datei ist im System gespeichert; die fachliche Prüfung steht noch aus.",
      validity: "noch nicht gültig",
    };
  }
  return {
    key: "in_review",
    label: "in Prüfung",
    tone: "review",
    text: "Datei liegt vor und wird durch Onroda geprüft.",
    validity: "noch nicht gültig",
  };
}

export function statusPillClass(tone) {
  if (tone === "missing") return "partner-pill partner-pill--missing";
  if (tone === "review") return "partner-pill partner-pill--review";
  return "partner-pill partner-pill--neutral";
}
