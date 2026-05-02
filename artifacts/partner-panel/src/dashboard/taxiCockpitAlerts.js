import {
  complianceBucketFromCompany,
  complianceDocSpotlight,
} from "../lib/partnerComplianceBucket.js";

function daysUntilIso(iso) {
  if (iso == null || iso === "") return null;
  const s = String(iso).trim();
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - start) / 86400000);
}

/**
 * @typedef {{ id: string, tone: "danger"|"warn"|"caution", text: string, cta?: { label: string, module: string }, tier: "blocker"|"mandatory"|"deadline"|"info" }} CockpitAlert
 * @returns {CockpitAlert[]}
 */
export function buildTaxiCockpitAlerts(company, drivers, vehicles) {
  /** @type {CockpitAlert[]} */
  const blockers = [];
  /** @type {CockpitAlert[]} */
  const mandatory = [];
  /** @type {CockpitAlert[]} */
  const deadlines = [];
  /** @type {CockpitAlert[]} */
  const info = [];

  if (!company) return [];

  if (company.isBlocked) {
    blockers.push({
      id: "blocked",
      tone: "danger",
      tier: "blocker",
      text: "Ihr Unternehmenszugang ist gesperrt. Bitte wenden Sie sich an Onroda.",
    });
  }
  if (!company.hasComplianceGewerbe) {
    mandatory.push({
      id: "doc-gw",
      tone: "warn",
      tier: "mandatory",
      text: "Gewerbenachweis fehlt – bitte unter „Dokumente“ nachreichen.",
      cta: { label: "Zu Dokumenten", module: "dokumente" },
    });
  }
  if (!company.hasComplianceInsurance) {
    mandatory.push({
      id: "doc-in",
      tone: "warn",
      tier: "mandatory",
      text: "Versicherungsnachweis fehlt – bitte unter „Dokumente“ hochladen.",
      cta: { label: "Zu Dokumenten", module: "dokumente" },
    });
  }

  const bucket = complianceBucketFromCompany(company);
  if (bucket === "rejected") {
    mandatory.push({
      id: "compliance-rejected",
      tone: "danger",
      tier: "mandatory",
      text: "Mindestens ein Pflichtnachweis wurde abgelehnt — bitte Bemerkung unter „Dokumente“ prüfen und erneut hochladen.",
      cta: { label: "Zu Dokumenten", module: "dokumente" },
    });
  } else if (bucket === "in_review" && company.hasComplianceGewerbe && company.hasComplianceInsurance) {
    info.push({
      id: "compliance-in-review",
      tone: "caution",
      tier: "info",
      text: "Alle erwarteten Nachweise sind hochgeladen; die Freigabe durch Onroda steht noch aus.",
      cta: { label: "Zu Dokumenten", module: "dokumente" },
    });
  }

  const pExpired = [];
  const pSoon = [];
  for (const d of drivers) {
    if (!d?.isActive || d?.accessStatus !== "active") continue;
    const days = daysUntilIso(d.pScheinExpiry);
    if (days == null) continue;
    const name = [d.firstName, d.lastName].filter(Boolean).join(" ").trim() || String(d.email || "Fahrer");
    if (days < 0) {
      pExpired.push({ name, days, id: d.id });
    } else if (days >= 0 && days <= 60) {
      pSoon.push({ name, days, id: d.id });
    }
  }
  pSoon.sort((a, b) => a.days - b.days);
  pExpired.sort((a, b) => a.days - b.days);
  for (const t of pExpired.slice(0, 3)) {
    deadlines.push({
      id: `pschein-exp-${t.id}`,
      tone: "danger",
      tier: "deadline",
      text: `P-Schein (${t.name}): abgelaufen — sofort in der Flotte prüfen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (pExpired.length > 3) {
    deadlines.push({
      id: "pschein-exp-more",
      tone: "danger",
      tier: "deadline",
      text: `Weitere ${pExpired.length - 3} Fahrer mit abgelaufenem P-Schein.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  for (const t of pSoon.slice(0, 2)) {
    deadlines.push({
      id: `pschein-${t.id}`,
      tone: "caution",
      tier: "deadline",
      text: `P-Schein (${t.name}): läuft in ${t.days} Tagen ab.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (pSoon.length > 2) {
    deadlines.push({
      id: "pschein-more",
      tone: "caution",
      tier: "deadline",
      text: `Weitere ${pSoon.length - 2} Fahrer mit P-Schein-Frist in den nächsten 60 Tagen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  const huExpired = [];
  const huSoon = [];
  for (const v of vehicles) {
    if (v?.approvalStatus !== "approved") continue;
    const days = daysUntilIso(v.nextInspectionDate);
    if (days == null) continue;
    const plate = v.licensePlate || "Fahrzeug";
    if (days < 0) {
      huExpired.push({ plate, days, id: v.id });
    } else if (days >= 0 && days <= 60) {
      huSoon.push({ plate, days, id: v.id });
    }
  }
  huSoon.sort((a, b) => a.days - b.days);
  huExpired.sort((a, b) => a.days - b.days);
  for (const h of huExpired.slice(0, 2)) {
    deadlines.push({
      id: `hu-exp-${h.id}`,
      tone: "danger",
      tier: "deadline",
      text: `Hauptuntersuchung (${h.plate}): überfällig — Termin in der Flotte klären.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (huExpired.length > 2) {
    deadlines.push({
      id: "hu-exp-more",
      tone: "danger",
      tier: "deadline",
      text: `Weitere ${huExpired.length - 2} Fahrzeug(e) mit überfälliger HU.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (huSoon.length) {
    const h = huSoon[0];
    deadlines.push({
      id: "hu-0",
      tone: "caution",
      tier: "deadline",
      text: `Hauptuntersuchung (${h.plate}): fällig in ${h.days} Tagen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (huSoon.length > 1) {
    deadlines.push({
      id: "hu-more",
      tone: "caution",
      tier: "deadline",
      text: `Weitere ${huSoon.length - 1} Fahrzeug(e) mit fälliger HU in den nächsten 60 Tagen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  return [...blockers, ...mandatory, ...deadlines, ...info];
}

export function buildCockpitSpotlightRows(company, drivers, vehicles) {
  if (!company) return [];
  const actDr = drivers.filter((d) => d?.isActive && d?.accessStatus === "active");
  const actVeh = vehicles.filter((v) => v?.approvalStatus === "approved");
  let p60 = 0;
  let pExp = 0;
  for (const d of actDr) {
    const days = daysUntilIso(d.pScheinExpiry);
    if (days == null) continue;
    if (days < 0) pExp += 1;
    else if (days <= 60) p60 += 1;
  }
  let hu60 = 0;
  let huExp = 0;
  for (const v of actVeh) {
    const days = daysUntilIso(v.nextInspectionDate);
    if (days == null) continue;
    if (days < 0) huExp += 1;
    else if (days <= 60) hu60 += 1;
  }
  const psDetail =
    pExp > 0 ? `${pExp} abgelaufen` : p60 > 0 ? `${p60} Fristen ≤ 60 Tage` : "keine Frist in 60 Tagen";
  const huDetail =
    huExp > 0 ? `${huExp} überfällig` : hu60 > 0 ? `${hu60} fällig ≤ 60 Tage` : "keine Frist in 60 Tagen";
  const gw = complianceDocSpotlight(company, "gewerbe");
  const ins = complianceDocSpotlight(company, "insurance");
  return [
    {
      key: "gw",
      label: "Gewerbenachweis",
      value: gw.value,
      ok: gw.ok,
    },
    {
      key: "in",
      label: "Versicherung",
      value: ins.value,
      ok: ins.ok,
    },
    { key: "ps", label: "P-Schein (aktive Fahrer)", value: psDetail, ok: pExp === 0 && p60 === 0 },
    { key: "hu", label: "Hauptuntersuchung (freigegebene Fahrzeuge)", value: huDetail, ok: huExp === 0 && hu60 === 0 },
    {
      key: "pr",
      label: "Kern-Stammdaten",
      value: company.profileLocked
        ? "gesperrt — Änderung nur über Anfrage bei Onroda"
        : "leere Kernfelder hier befüllbar; nach Setzung nur noch per Anfrage",
      ok: !company.profileLocked,
    },
  ];
}
