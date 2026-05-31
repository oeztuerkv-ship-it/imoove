import { useCallback, useEffect, useState, useMemo } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import CompanyMandateEditBlocks from "../components/CompanyMandateEditBlocks.jsx";
import CompanyTaxiOnboardingSections from "../components/CompanyTaxiOnboardingSections.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const KIND_LABEL = {
  taxi: "Taxi",
  hotel: "Hotel",
  insurer: "Krankenkasse (Mandant)",
  medical: "Krankenfahrt (Mandant)",
  general: "Sonstige",
  corporate: "Unternehmen",
  voucher_client: "Gutschein",
};

const NA = "Noch nicht hinterlegt";

function fleetVehicleApprovalDe(st) {
  const m = {
    draft: "Entwurf",
    pending_approval: "Wartet auf Freigabe",
    missing_documents: "Unterlagen fehlen",
    approved: "Freigegeben",
    rejected: "Abgelehnt",
    blocked: "Gesperrt",
  };
  return m[st] || st || "—";
}

function fleetDriverApprovalDe(st) {
  const m = {
    pending: "Angelegt",
    in_review: "In Prüfung",
    missing_documents: "Unterlagen fehlen",
    approved: "Freigegeben",
    rejected: "Abgelehnt",
  };
  return m[st] || st || "—";
}

/** Admin-interne Keys in `fare_permissions` (Merge beim Speichern, Partner-Keys bleiben erhalten). */
const FP_ADMIN = {
  block: "admin_platform_block_reason",
  hotelBookingContact: "hotel_booking_contact",
  hotelVoucherInfo: "hotel_voucher_info",
};

/** Optional dokumentierte Admin-Hinweise in `insurer_permissions` (Merge). */
const IP_ADMIN = {
  defaultBillingRef: "default_billing_reference",
  costCentersNote: "cost_centers_admin_note",
  bookingTypesNote: "allowed_booking_types_admin_note",
};

function asObj(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return { ...v };
}

function strFromRec(rec, k) {
  const v = rec[k];
  return typeof v === "string" ? v : "";
}

function costCenterFromFp(fp) {
  for (const k of ["cost_center", "costCenter", "kostenstelle", "Kostenstelle"]) {
    const v = fp[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function s(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function fmtText(v) {
  const t = s(v);
  return t || NA;
}

function eur(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(x);
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtDateDay(iso) {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function boolJaNein(v) {
  if (v === true) return "Ja";
  if (v === false) return "Nein";
  return NA;
}

function fmtCommissionPercent(c) {
  const r = typeof c?.commission_rate === "number" ? c.commission_rate : Number(c?.commission_rate);
  if (!Number.isFinite(r) || r < 0) return "10 %";
  return `${Math.round(r * 1000) / 10} %`;
}

function commissionPercentFromCompany(c) {
  const r = typeof c?.commission_rate === "number" ? c.commission_rate : Number(c?.commission_rate);
  if (!Number.isFinite(r) || r < 0) return 10;
  return Math.round(r * 1000) / 10;
}

function fmtAuditMeta(meta) {
  if (meta == null || typeof meta !== "object") return null;
  try {
    const j = JSON.stringify(meta);
    if (j.length > 280) return `${j.slice(0, 280)}…`;
    return j;
  } catch {
    return null;
  }
}

/**
 * Mandantenzentrale: Lesen + Stammdaten per `PATCH /admin/companies/:id`
 */
export default function CompanyMandateDetailPage({
  companyId,
  onBack,
  onRequestFullWorkspace,
  onOpenTaxiFleetDrivers,
  onOpenTaxiFleetVehicles,
  onOpenPanelUsers,
}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [taxiFleetBusy, setTaxiFleetBusy] = useState("");
  const [complianceWaiveBusy, setComplianceWaiveBusy] = useState(false);

  const loadMandate = useCallback(() => {
    setLoading(true);
    setErr("");
    fetch(`${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/mandate-read`, {
      headers: adminApiHeaders(),
    })
      .then((res) => {
        if (res.status === 404) {
          setErr("Mandant nicht gefunden.");
          return null;
        }
        if (!res.ok) {
          setErr("Daten konnten nicht geladen werden.");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (json?.ok) {
          setData(json);
        }
        setLoading(false);
      })
      .catch(() => {
        setErr("Netzwerkfehler.");
        setLoading(false);
      });
  }, [companyId]);

  useEffect(() => {
    loadMandate();
  }, [loadMandate]);

  async function postAdminJson(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  }

  async function taxiApproveVehicle(vehicleId, despiteGaps = false) {
    if (!companyId) return;
    const base = `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(vehicleId)}`;
    setTaxiFleetBusy(despiteGaps ? `v-apr-gap-${vehicleId}` : `v-apr-${vehicleId}`);
    try {
      const payload = despiteGaps ? { acknowledgeIncompleteDocuments: true } : {};
      const { r, j } = await postAdminJson(`${base}/approve`, payload);
      if (!r.ok) {
        if (!despiteGaps && j?.error === "incomplete_documents_ack_required") return;
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setTaxiFleetBusy("");
    }
  }

  async function taxiVehicleMissingDocs(vehicleId) {
    if (!companyId) return;
    setTaxiFleetBusy(`v-md-${vehicleId}`);
    try {
      const { r, j } = await postAdminJson(
        `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(vehicleId)}/mark-missing-documents`,
        {},
      );
      if (!r.ok) {
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setTaxiFleetBusy("");
    }
  }

  async function taxiRejectVehicle(vehicleId) {
    if (!companyId) return;
    const reason = window.prompt("Ablehnungsgrund (Pflicht):", "");
    if (reason == null) return;
    if (!String(reason).trim()) {
      window.alert("Grund erforderlich.");
      return;
    }
    setTaxiFleetBusy(`v-rej-${vehicleId}`);
    try {
      const { r, j } = await postAdminJson(
        `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(vehicleId)}/reject`,
        { reason: String(reason).trim() },
      );
      if (!r.ok) {
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setTaxiFleetBusy("");
    }
  }

  async function taxiBlockVehicle(vehicleId) {
    if (!companyId) return;
    const blockReason = window.prompt("Sperrgrund (sichtbar für Partner):", "") ?? "";
    setTaxiFleetBusy(`v-blk-${vehicleId}`);
    try {
      const { r, j } = await postAdminJson(
        `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(vehicleId)}/block`,
        { blockReason },
      );
      if (!r.ok) {
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setTaxiFleetBusy("");
    }
  }

  async function taxiUnblockVehicle(vehicleId) {
    if (!companyId) return;
    setTaxiFleetBusy(`v-unblk-${vehicleId}`);
    try {
      const { r, j } = await postAdminJson(
        `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(vehicleId)}/unblock`,
        {},
      );
      if (!r.ok) {
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setTaxiFleetBusy("");
    }
  }

  async function taxiApproveDriver(driverId, despiteGaps = false) {
    if (!companyId) return;
    const url = `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(driverId)}/approval`;
    setTaxiFleetBusy(despiteGaps ? `d-apr-gap-${driverId}` : `d-apr-${driverId}`);
    try {
      const payload = despiteGaps
        ? { status: "approved", acknowledgeIncompleteDocuments: true }
        : { status: "approved" };
      const { r, j } = await postAdminJson(url, payload);
      if (!r.ok) {
        if (!despiteGaps && j?.error === "incomplete_documents_ack_required") return;
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setTaxiFleetBusy("");
    }
  }

  async function waiveCompanyComplianceDespiteMissing() {
    if (!companyId) return;
    setComplianceWaiveBusy(true);
    try {
      const { r, j } = await postAdminJson(
        `${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/compliance/approve-despite-missing-documents`,
        {},
      );
      if (!r.ok) {
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setComplianceWaiveBusy(false);
    }
  }

  async function taxiDriverMissingDocs(driverId) {
    if (!companyId) return;
    setTaxiFleetBusy(`d-md-${driverId}`);
    try {
      const { r, j } = await postAdminJson(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(driverId)}/approval`,
        { status: "missing_documents" },
      );
      if (!r.ok) {
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setTaxiFleetBusy("");
    }
  }

  async function taxiRejectDriver(driverId) {
    if (!companyId) return;
    const reason = window.prompt("Ablehnungsgrund (Pflicht):", "");
    if (reason == null) return;
    if (!String(reason).trim()) {
      window.alert("Grund erforderlich.");
      return;
    }
    setTaxiFleetBusy(`d-rej-${driverId}`);
    try {
      const { r, j } = await postAdminJson(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(driverId)}/approval`,
        { status: "rejected", reason: String(reason).trim() },
      );
      if (!r.ok) {
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setTaxiFleetBusy("");
    }
  }

  async function taxiSuspendDriver(driverId) {
    if (!companyId) return;
    const reason = window.prompt("Sperrgrund (Zugang inaktiv, sichtbar für Partner):", "") ?? "";
    setTaxiFleetBusy(`d-sus-${driverId}`);
    try {
      const { r, j } = await postAdminJson(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(driverId)}/suspend`,
        { reason },
      );
      if (!r.ok) {
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setTaxiFleetBusy("");
    }
  }

  async function taxiActivateDriver(driverId) {
    if (!companyId) return;
    setTaxiFleetBusy(`d-act-${driverId}`);
    try {
      const { r, j } = await postAdminJson(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(driverId)}/activate`,
        {},
      );
      if (!r.ok) {
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      await loadMandate();
    } finally {
      setTaxiFleetBusy("");
    }
  }

  const c = data?.company;
  const f = data?.financials;
  const isInsurerLike = c && (c.company_kind === "insurer" || c.company_kind === "medical");
  const isHotel = c && (c.company_kind === "hotel" || c.company_kind === "corporate");
  const isTaxi = c && c.company_kind === "taxi";
  const docs = data?.documents;

  const fpRO = c ? asObj(c.fare_permissions) : {};
  const ipRO = c ? asObj(c.insurer_permissions) : {};
  const costCenterRO = c ? costCenterFromFp(fpRO) : "";
  const blockReasonRO = strFromRec(fpRO, FP_ADMIN.block);

  const headBadges = useMemo(() => {
    if (!c) return null;
    return (
      <div className="admin-m-hero__badges">
        <span className="admin-m-hero__kind">{KIND_LABEL[c.company_kind] || c.company_kind}</span>
        {c.is_active ? (
          <span className="admin-c-badge admin-c-badge--ok">Aktiv</span>
        ) : (
          <span className="admin-c-badge admin-c-badge--warn">Inaktiv</span>
        )}
        {c.is_blocked ? <span className="admin-c-badge admin-c-badge--err">Gesperrt (Plattform)</span> : null}
        <span className="admin-c-badge admin-c-badge--neutral" title="Verifizierung">
          Verif.: {c.verification_status}
        </span>
        <span className="admin-c-badge admin-c-badge--neutral" title="Compliance">
          Compl.: {c.compliance_status}
        </span>
        <span className="admin-c-badge admin-c-badge--neutral" title="Vertrag">
          Vertrag: {c.contract_status}
        </span>
      </div>
    );
  }, [c]);

  return (
    <div className="admin-page admin-page--loose admin-page--content admin-mandate-detail-page">
      {err ? <div className="admin-error-banner">{err}</div> : null}
      {loading && !c ? <p className="admin-table-sub">Lade Mandantendaten …</p> : null}

      {c && data ? (
        <>
          <section className="admin-section-block admin-section-block--mandate-hero" aria-label="Mandantenkopf">
            <div className="admin-m-hero__bar">
              <div className="admin-m-hero__left">
                <button type="button" className="admin-m-back" onClick={onBack}>
                  ← Mandantenliste
                </button>
                <h1 className="admin-m-hero__title">{c.name || "Mandantenzentrale"}</h1>
                {headBadges}
                <p className="admin-m-hero__hint">
                  Plattform-Mandantenzentrale: Stammdaten, Status, Abrechnung (einheitliches Layout für alle
                  Unternehmensarten; technische <code>company_kind</code>: {c.company_kind}).
                </p>
              </div>
              <div className="admin-m-hero__actions">
                {typeof onOpenPanelUsers === "function" ? (
                  <button
                    type="button"
                    className="admin-c-btn-panel-access admin-c-btn-panel-access--hero"
                    onClick={() => onOpenPanelUsers()}
                    title="Partner-Portal-Zugang für diesen Mandanten anlegen"
                  >
                    Partner-Zugang
                  </button>
                ) : null}
                {typeof onRequestFullWorkspace === "function" ? (
                  <button
                    type="button"
                    className="admin-c-btn-sec"
                    onClick={() => onRequestFullWorkspace()}
                    title="Werkstatt-Flotte/Kasse in der Mandantenliste öffnen (Fahrer, Fahrzeuge, Kasse — Tabs dort)"
                  >
                    Flotte & Werkstatt
                  </button>
                ) : null}
                <button
                  type="button"
                  className="admin-m-btn-gh"
                  onClick={() => loadMandate()}
                  disabled={loading}
                  aria-label="Aktualisieren"
                >
                  ⟳
                </button>
              </div>
            </div>
          </section>

          <CompanyMandateEditBlocks
            companyId={companyId}
            company={c}
            billingAccount={data.billingAccount}
            billingAccountEmail={data.billingAccountEmail}
            onSaved={loadMandate}
          />

          {isTaxi || isHotel || isInsurerLike ? (
                <section className="admin-section-block">
                  <div className="admin-m-card__h">
                    <span className="admin-panel-card__title" style={{ margin: 0 }}>
                      4. Zusatz je Mandantentyp
                    </span>
                  </div>
                  <div className="admin-mandate-grid admin-mandate-grid--dense">
                    {isTaxi ? (
                      <>
                        <div>
                          <div className="admin-table-sub">Konzession / Ordnungsnr.</div>
                          <div>{fmtText(c.concession_number)}</div>
                        </div>
                        <div>
                          <div className="admin-table-sub">Rechtsform / Inhaber</div>
                          <div>
                            {s(c.legal_form) || NA}
                            {s(c.owner_name) ? ` · Inhaber: ${c.owner_name}` : ""}
                          </div>
                        </div>
                        <div>
                          <div className="admin-table-sub">Kontingent (max.)</div>
                          <div>
                            Fahrer: {c.max_drivers ?? "—"} · Fahrzeuge: {c.max_vehicles ?? "—"}
                          </div>
                        </div>
                    {isHotel ? (
                      <div>
                        <div className="admin-table-sub">Kostenstelle</div>
                        <div>{costCenterRO || NA}</div>
                      </div>
                    ) : null}
                    {c.company_kind === "hotel" && (strFromRec(fpRO, FP_ADMIN.hotelBookingContact) || strFromRec(fpRO, FP_ADMIN.hotelVoucherInfo)) ? (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div className="admin-table-sub">Buchung / Gutschein (Hinweistexte)</div>
                        {strFromRec(fpRO, FP_ADMIN.hotelBookingContact) ? (
                          <div>Ansprechpartner Buchung: {strFromRec(fpRO, FP_ADMIN.hotelBookingContact)}</div>
                        ) : null}
                        {strFromRec(fpRO, FP_ADMIN.hotelVoucherInfo) ? (
                          <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                            {strFromRec(fpRO, FP_ADMIN.hotelVoucherInfo)}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {isInsurerLike ? (
                      <>
                        {strFromRec(ipRO, IP_ADMIN.defaultBillingRef) ? (
                          <div>
                            <div className="admin-table-sub">Vorgabe Abrechnungsreferenz</div>
                            <div>{strFromRec(ipRO, IP_ADMIN.defaultBillingRef)}</div>
                          </div>
                        ) : null}
                        {strFromRec(ipRO, IP_ADMIN.costCentersNote) || strFromRec(ipRO, IP_ADMIN.bookingTypesNote) ? (
                          <div style={{ gridColumn: "1 / -1" }}>
                            {strFromRec(ipRO, IP_ADMIN.costCentersNote) ? (
                              <div style={{ marginBottom: 8, whiteSpace: "pre-wrap" }}>
                                <span className="admin-table-sub">Kostenstellen-Notiz: </span>
                                {strFromRec(ipRO, IP_ADMIN.costCentersNote)}
                              </div>
                            ) : null}
                            {strFromRec(ipRO, IP_ADMIN.bookingTypesNote) ? (
                              <div style={{ whiteSpace: "pre-wrap" }}>
                                <span className="admin-table-sub">Buchungsarten: </span>
                                {strFromRec(ipRO, IP_ADMIN.bookingTypesNote)}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <p className="admin-m-sec__hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
                          Keine Diagnosen; nur Verwaltungshinweise. Fahrten-Details siehe Tabelle unten.
                        </p>
                      </>
                    ) : null}
                  </div>
                </section>
              ) : !isTaxi && !isHotel && !isInsurerLike ? (
                <section className="admin-section-block">
                  <div className="admin-m-card__h">
                    <span className="admin-panel-card__title" style={{ margin: 0 }}>
                      4. Weitere Angaben
                    </span>
                  </div>
                  <div className="admin-mandate-grid admin-mandate-grid--dense">
                    <div>
                      <div className="admin-table-sub">Konzession / Rechtsform</div>
                      <div>
                        {fmtText(c.concession_number)} · {s(c.legal_form) || NA}
                      </div>
                    </div>
                    <div>
                      <div className="admin-table-sub">Inhaber</div>
                      <div>{fmtText(c.owner_name)}</div>
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          <section className="admin-section-block admin-section-block--mandate-kpi">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Abrechnung / Einnahmen
              </span>
            </div>
            <div className="admin-mandate-kpi">
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.revenueCompletedGrossAllTime)}</div>
                <div className="admin-mandate-kpi__lbl">Umsatz gesamt (abgeschlossen, Brutto Fahrpreis)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.revenueCompletedGrossCurrentMonth)}</div>
                <div className="admin-mandate-kpi__lbl">Umsatz laufender Monat (abgeschlossen, UTC)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.totalPlatformCommissionEur)}</div>
                <div className="admin-mandate-kpi__lbl">ONRODA-Provision gesamt (Buchung)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.onrodaCommissionCurrentMonthEur)}</div>
                <div className="admin-mandate-kpi__lbl">ONRODA-Provision aktueller Monat (Fahrt-Anlage, UTC)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.openPlatformCommissionEur)}</div>
                <div className="admin-mandate-kpi__lbl">Offene Onroda-Provision (noch nicht ausgeglichen)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{eur(f?.paidPlatformCommissionEur)}</div>
                <div className="admin-mandate-kpi__lbl">Ausgeglichene / bezahlte Onroda-Provision (Buchung)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.total ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Fahrten gesamt</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.ridesCountCurrentMonth ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Fahrten (Anlage) aktueller Monat (UTC)</div>
              </div>
            </div>
            <p className="admin-table-sub" style={{ fontSize: 12 }}>
              Offene Sammelabrechnung: {f?.openSettlementsCount ?? 0} (Status draft/issued/approved). Werte stammen
              aus Fahrten- und `ride_financials`-Buch; ohne harte Zahlungseingänge, falls noch nicht befüllt.
            </p>
          </section>

          <section className="admin-section-block">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Fahrten im Überblick (Status)
              </span>
            </div>
            <div className="admin-mandate-kpi">
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.openPipeline ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Offen (Warteschlange)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.active ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Aktiv (unterwegs)</div>
              </div>
              <div className="admin-mandate-kpi__cell">
                <div className="admin-mandate-kpi__val">{data.rides?.completed ?? 0}</div>
                <div className="admin-mandate-kpi__lbl">Abgeschlossen</div>
              </div>
              {c.company_kind === "hotel" ? (
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{eur(data.kpi?.voucherLimitAvailable)}</div>
                  <div className="admin-mandate-kpi__lbl">Gutschein-Restkontingent (Hotel-Codes)</div>
                </div>
              ) : null}
            </div>
          </section>

          {data.taxi ? (
            <>
              <CompanyTaxiOnboardingSections companyId={companyId} onChanged={() => void loadMandate()} />
            <section className="admin-section-block">
              <div className="admin-m-card__h">
                <div style={{ minWidth: 0 }}>
                  <div className="admin-panel-card__title" style={{ margin: 0 }}>
                    Taxi · Mandantenzentrale (Flotte &amp; Anfragen)
                  </div>
                  <div className="admin-table-sub" style={{ margin: "6px 0 0", maxWidth: 720, lineHeight: 1.45 }}>
                    Entscheidungen nur durch Plattform-Admin — Unternehmer können nicht selbst freigeben.
                  </div>
                </div>
              </div>
              <div className="admin-mandate-kpi" style={{ padding: "8px 12px 12px" }}>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.driversTotal}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrer gesamt</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.driversActive}</div>
                  <div className="admin-mandate-kpi__lbl">Aktiv (Zugang aktiv)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.driversReady}</div>
                  <div className="admin-mandate-kpi__lbl">Einsatzbereit (Readiness)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.driversSuspended}</div>
                  <div className="admin-mandate-kpi__lbl">Gesperrt (Zugang)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.pScheinDeficient}</div>
                  <div className="admin-mandate-kpi__lbl">P-Schein: Nachweis/ Datum / Ablauf offen</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.vehiclesTotal}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrzeuge gesamt</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.vehiclesApproved}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrzeuge freigegeben</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.taxi.vehiclesPendingReview}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrzeuge in Prüfung</div>
                </div>
              </div>

              {data.taxi.queues ? (
                <div style={{ padding: "12px 16px 16px", borderTop: "1px solid #e8edf4" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                    <button type="button" className="admin-link" onClick={() => onOpenTaxiFleetDrivers?.()}>
                      Vollansicht Fahrer (Werkstatt)
                    </button>
                    <button type="button" className="admin-link" onClick={() => onOpenTaxiFleetVehicles?.()}>
                      Vollansicht Fahrzeuge (Werkstatt)
                    </button>
                  </div>

                  {(() => {
                    const tq = data.taxi.queues;
                    const btnBusy = (prefix, id) => taxiFleetBusy.startsWith(`${prefix}-${id}`);

                    const renderDriverOpenRow = (d) => (
                      <tr key={d.id}>
                        <td className="admin-mandate-td">
                          <div style={{ fontWeight: 600 }}>
                            {d.firstName} {d.lastName}
                          </div>
                          <div className="admin-table-sub" style={{ fontSize: 12 }}>
                            {d.email}
                          </div>
                        </td>
                        <td className="admin-mandate-td">{fleetDriverApprovalDe(d.approvalStatus)}</td>
                        <td className="admin-mandate-td">{d.accessStatus === "suspended" ? "Gesperrt" : "Aktiv"}</td>
                        <td className="admin-mandate-td">
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            <button
                              type="button"
                              className="admin-mandate-taxi-btn admin-mandate-taxi-btn--approve"
                              disabled={!!taxiFleetBusy}
                              onClick={() => void taxiApproveDriver(d.id)}
                            >
                              {btnBusy("d-apr", d.id) ? "…" : "Freigeben"}
                            </button>
                            <button
                              type="button"
                              className="admin-mandate-taxi-btn admin-mandate-taxi-btn--secondary"
                              disabled={!!taxiFleetBusy}
                              title="Plattform-Freigabe ohne vollständige Unterlagen — keine Rückfrage-Dialoge"
                              onClick={() => void taxiApproveDriver(d.id, true)}
                            >
                              {btnBusy("d-apr-gap", d.id) ? "…" : "Trotz Lücken freigeben"}
                            </button>
                            <button
                              type="button"
                              className="admin-mandate-taxi-btn admin-mandate-taxi-btn--inactive"
                              disabled={!!taxiFleetBusy}
                              onClick={() => void taxiSuspendDriver(d.id)}
                            >
                              {btnBusy("d-sus", d.id) ? "…" : "Inaktiv"}
                            </button>
                            <button
                              type="button"
                              className="admin-mandate-taxi-btn admin-mandate-taxi-btn--warn"
                              disabled={!!taxiFleetBusy}
                              onClick={() => void taxiDriverMissingDocs(d.id)}
                            >
                              {btnBusy("d-md", d.id) ? "…" : "Unterlagen fehlen"}
                            </button>
                            <button
                              type="button"
                              className="admin-mandate-taxi-btn admin-mandate-taxi-btn--reject"
                              disabled={!!taxiFleetBusy}
                              onClick={() => void taxiRejectDriver(d.id)}
                            >
                              {btnBusy("d-rej", d.id) ? "…" : "Ablehnen"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );

                    const renderVehicleRow = (v, mode) => (
                      <tr key={v.id}>
                        <td className="admin-mandate-td">
                          <div style={{ fontWeight: 600 }}>{v.licensePlate}</div>
                          {v.model ? (
                            <div className="admin-table-sub" style={{ fontSize: 12 }}>
                              {v.model}
                            </div>
                          ) : null}
                        </td>
                        <td className="admin-mandate-td">{fleetVehicleApprovalDe(v.approvalStatus)}</td>
                        <td className="admin-mandate-td">
                          {mode === "blocked" ? (
                            <button
                              type="button"
                              className="admin-mandate-taxi-btn admin-mandate-taxi-btn--secondary"
                              disabled={!!taxiFleetBusy}
                              onClick={() => void taxiUnblockVehicle(v.id)}
                            >
                              {btnBusy("v-unblk", v.id) ? "…" : "Entsperren"}
                            </button>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              <button
                                type="button"
                                className="admin-mandate-taxi-btn admin-mandate-taxi-btn--approve"
                                disabled={!!taxiFleetBusy}
                                onClick={() => void taxiApproveVehicle(v.id)}
                              >
                                {btnBusy("v-apr", v.id) ? "…" : "Freigeben"}
                              </button>
                              <button
                                type="button"
                                className="admin-mandate-taxi-btn admin-mandate-taxi-btn--secondary"
                                disabled={!!taxiFleetBusy}
                                title="Plattform-Freigabe ohne vollständige Unterlagen — keine Rückfrage-Dialoge"
                                onClick={() => void taxiApproveVehicle(v.id, true)}
                              >
                                {btnBusy("v-apr-gap", v.id) ? "…" : "Trotz Lücken freigeben"}
                              </button>
                              <button
                                type="button"
                                className="admin-mandate-taxi-btn admin-mandate-taxi-btn--inactive"
                                disabled={!!taxiFleetBusy}
                                onClick={() => void taxiBlockVehicle(v.id)}
                              >
                                {btnBusy("v-blk", v.id) ? "…" : "Inaktiv"}
                              </button>
                              <button
                                type="button"
                                className="admin-mandate-taxi-btn admin-mandate-taxi-btn--warn"
                                disabled={!!taxiFleetBusy}
                                onClick={() => void taxiVehicleMissingDocs(v.id)}
                              >
                                {btnBusy("v-md", v.id) ? "…" : "Unterlagen fehlen"}
                              </button>
                              <button
                                type="button"
                                className="admin-mandate-taxi-btn admin-mandate-taxi-btn--reject"
                                disabled={!!taxiFleetBusy}
                                onClick={() => void taxiRejectVehicle(v.id)}
                              >
                                {btnBusy("v-rej", v.id) ? "…" : "Ablehnen"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );

                    return (
                      <>
                        <h4 className="admin-m-card__title" style={{ margin: "8px 0 8px", fontSize: 15 }}>
                          Fahrer — offene Freigaben
                        </h4>
                        {tq.drivers.openRequests.length === 0 ? (
                          <p className="admin-table-sub" style={{ marginBottom: 16 }}>
                            Keine offenen Fahrer-Freigaben.
                          </p>
                        ) : (
                          <div style={{ overflowX: "auto", marginBottom: 20 }}>
                            <table style={{ minWidth: 720, width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th className="admin-mandate-th">Fahrer</th>
                                  <th className="admin-mandate-th">Freigabe</th>
                                  <th className="admin-mandate-th">Zugang</th>
                                  <th className="admin-mandate-th">Aktionen</th>
                                </tr>
                              </thead>
                              <tbody>{tq.drivers.openRequests.map((d) => renderDriverOpenRow(d))}</tbody>
                            </table>
                          </div>
                        )}

                        <h4 className="admin-m-card__title" style={{ margin: "8px 0 8px", fontSize: 15 }}>
                          Fahrzeuge — warten auf Freigabe
                        </h4>
                        {tq.vehicles.waitingApproval.length === 0 ? (
                          <p className="admin-table-sub" style={{ marginBottom: 16 }}>
                            Keine Fahrzeuge in diesem Status.
                          </p>
                        ) : (
                          <div style={{ overflowX: "auto", marginBottom: 20 }}>
                            <table style={{ minWidth: 720, width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th className="admin-mandate-th">Fahrzeug</th>
                                  <th className="admin-mandate-th">Status</th>
                                  <th className="admin-mandate-th">Aktionen</th>
                                </tr>
                              </thead>
                              <tbody>{tq.vehicles.waitingApproval.map((v) => renderVehicleRow(v, "wait"))}</tbody>
                            </table>
                          </div>
                        )}

                        <h4 className="admin-m-card__title" style={{ margin: "8px 0 8px", fontSize: 15 }}>
                          Fahrzeuge — Unterlagen fehlen
                        </h4>
                        {tq.vehicles.missingDocuments.length === 0 ? (
                          <p className="admin-table-sub" style={{ marginBottom: 16 }}>
                            Keine Fahrzeuge in diesem Status.
                          </p>
                        ) : (
                          <div style={{ overflowX: "auto", marginBottom: 20 }}>
                            <table style={{ minWidth: 720, width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th className="admin-mandate-th">Fahrzeug</th>
                                  <th className="admin-mandate-th">Status</th>
                                  <th className="admin-mandate-th">Aktionen</th>
                                </tr>
                              </thead>
                              <tbody>{tq.vehicles.missingDocuments.map((v) => renderVehicleRow(v, "miss"))}</tbody>
                            </table>
                          </div>
                        )}

                        <h4 className="admin-m-card__title" style={{ margin: "8px 0 8px", fontSize: 15 }}>
                          Fahrer — Zugang gesperrt (Inaktiv)
                        </h4>
                        {tq.drivers.accessSuspended.length === 0 ? (
                          <p className="admin-table-sub" style={{ marginBottom: 16 }}>
                            Keine gesperrten Fahrer-Zugänge.
                          </p>
                        ) : (
                          <div style={{ overflowX: "auto", marginBottom: 20 }}>
                            <table style={{ minWidth: 560, width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th className="admin-mandate-th">Fahrer</th>
                                  <th className="admin-mandate-th">Freigabe</th>
                                  <th className="admin-mandate-th">Aktion</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tq.drivers.accessSuspended.map((d) => (
                                  <tr key={d.id}>
                                    <td className="admin-mandate-td">
                                      <div style={{ fontWeight: 600 }}>
                                        {d.firstName} {d.lastName}
                                      </div>
                                      <div className="admin-table-sub" style={{ fontSize: 12 }}>
                                        {d.email}
                                      </div>
                                    </td>
                                    <td className="admin-mandate-td">{fleetDriverApprovalDe(d.approvalStatus)}</td>
                                    <td className="admin-mandate-td">
                                      <button
                                        type="button"
                                        className="admin-mandate-taxi-btn admin-mandate-taxi-btn--approve"
                                        disabled={!!taxiFleetBusy}
                                        onClick={() => void taxiActivateDriver(d.id)}
                                      >
                                        {btnBusy("d-act", d.id) ? "…" : "Zugang aktivieren"}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <h4 className="admin-m-card__title" style={{ margin: "8px 0 8px", fontSize: 15 }}>
                          Abgelehnt (Fahrer / Fahrzeuge)
                        </h4>
                        {tq.drivers.rejected.length === 0 && tq.vehicles.rejected.length === 0 ? (
                          <p className="admin-table-sub" style={{ marginBottom: 16 }}>
                            Keine abgelehnten Einträge.
                          </p>
                        ) : (
                          <div style={{ overflowX: "auto", marginBottom: 20 }}>
                            <table style={{ minWidth: 560, width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th className="admin-mandate-th">Typ</th>
                                  <th className="admin-mandate-th">Eintrag</th>
                                  <th className="admin-mandate-th">Hinweis</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tq.drivers.rejected.map((d) => (
                                  <tr key={`dj-${d.id}`}>
                                    <td className="admin-mandate-td">Fahrer</td>
                                    <td className="admin-mandate-td">
                                      {d.firstName} {d.lastName} · {d.email}
                                    </td>
                                    <td className="admin-mandate-td">
                                      Abgelehnt — erneute Einreichung durch Partner; Aktionen über Vollansicht Fahrer.
                                    </td>
                                  </tr>
                                ))}
                                {tq.vehicles.rejected.map((v) => (
                                  <tr key={`vj-${v.id}`}>
                                    <td className="admin-mandate-td">Fahrzeug</td>
                                    <td className="admin-mandate-td">
                                      {v.licensePlate}
                                      {v.model ? ` · ${v.model}` : ""}
                                    </td>
                                    <td className="admin-mandate-td">
                                      Abgelehnt — Nachreichung durch Partner; Aktionen über Vollansicht Fahrzeuge.
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <h4 className="admin-m-card__title" style={{ margin: "8px 0 8px", fontSize: 15 }}>
                          Fahrzeuge — gesperrt (Inaktiv)
                        </h4>
                        {tq.vehicles.blocked.length === 0 ? (
                          <p className="admin-table-sub">Keine gesperrten Fahrzeuge.</p>
                        ) : (
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ minWidth: 720, width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th className="admin-mandate-th">Fahrzeug</th>
                                  <th className="admin-mandate-th">Status</th>
                                  <th className="admin-mandate-th">Aktionen</th>
                                </tr>
                              </thead>
                              <tbody>{tq.vehicles.blocked.map((v) => renderVehicleRow(v, "blocked"))}</tbody>
                            </table>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : null}
            </section>
            </>
          ) : null}

          {data.hotel ? (
            <section className="admin-section-block">
              <div className="admin-m-card__h">
                <span className="admin-panel-card__title" style={{ margin: 0 }}>
                  Hotel · Zugangscodes
                </span>
              </div>
              <div className="admin-mandate-kpi" style={{ padding: "8px 12px 12px" }}>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.hotel.accessCodesActive}</div>
                  <div className="admin-mandate-kpi__lbl">Aktive Codes</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.hotel.accessCodeRedemptions}</div>
                  <div className="admin-mandate-kpi__lbl">Einlösungen (Nutzungen)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{f?.openSettlementsCount ?? 0}</div>
                  <div className="admin-mandate-kpi__lbl">Offene Sammelabrechnung (s. Finanzen)</div>
                </div>
              </div>
            </section>
          ) : null}

          {data.insurer ? (
            <section className="admin-section-block">
              <div className="admin-m-card__h">
                <span className="admin-panel-card__title" style={{ margin: 0 }}>
                  Kasse / Krankenfahrt (Zählung, o. Diagnosen)
                </span>
              </div>
              <div className="admin-mandate-kpi" style={{ padding: "8px 12px 12px" }}>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.insurer.medicalRides}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrten (Art: Krankenfahrt)</div>
                </div>
                <div className="admin-mandate-kpi__cell">
                  <div className="admin-mandate-kpi__val">{data.insurer.insurancePayerRides}</div>
                  <div className="admin-mandate-kpi__lbl">Fahrten (Zahler: Kasse/Insurance)</div>
                </div>
              </div>
              {data.insurer.insurerConfigKeys?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div className="admin-table-sub" style={{ marginBottom: 6 }}>
                    Konfiguration (technische Keys, o. h. Diagnose-Felder)
                  </div>
                  <code style={{ fontSize: 12, lineHeight: 1.5 }}>{data.insurer.insurerConfigKeys.join(", ")}</code>
                </div>
              ) : null}
              {data.insurer.sampleBillingReferences?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div className="admin-table-sub" style={{ marginBottom: 6 }}>Beispiel-Referenzen (Abrechnung)</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {data.insurer.sampleBillingReferences.map((s) => (
                      <li key={s} style={{ fontFamily: "ui-monospace, monospace" }}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="admin-section-block">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Dokumente (Zusammenfassung)
              </span>
            </div>
            <ul className="admin-mandate-doclist" style={{ margin: "10px 14px 12px" }}>
              <li>
                <strong>Gewerbenachweis (Unternehmen):</strong>{" "}
                {docs?.gewerbeFilePresent ? "Datei hinterlegt" : NA}
              </li>
              <li>
                <strong>Versicherung (Unternehmen):</strong>{" "}
                {docs?.insuranceFilePresent ? "Datei hinterlegt" : NA}
              </li>
              {data?.taxi &&
              (!docs?.gewerbeFilePresent ||
                !docs?.insuranceFilePresent ||
                (c?.compliance_status && c.compliance_status !== "compliant")) ? (
                <li style={{ listStyle: "none", marginTop: 10, padding: 0 }}>
                  <button
                    type="button"
                    className="admin-mandate-taxi-btn admin-mandate-taxi-btn--secondary"
                    disabled={complianceWaiveBusy}
                    title="Partner-Cockpit: keine Warnungen zu fehlenden Gewerbe-/Versicherungsnachweisen; Nachweise später nachreichen."
                    onClick={() => void waiveCompanyComplianceDespiteMissing()}
                  >
                    {complianceWaiveBusy ? "…" : "Unternehmen: Pflichtnachweise trotz fehlender Dateien freigeben"}
                  </button>
                </li>
              ) : null}
              <li>
                <strong>Konzession / Nummer in Stammdaten:</strong>{" "}
                {docs?.companyConcessionTextPresent ? s(c.concession_number) : NA}
              </li>
              {data.taxi ? (
                <>
                  <li>
                    <strong>P-Schein (Fahrer):</strong> {docs.pScheinDriversWithDocument ?? 0} mit hochgeladenem
                    Nachweis, {docs.pScheinDriversWithIssue ?? 0} mit offenem Ablauf/Nachweis-Problem
                  </li>
                  <li>
                    <strong>Fahrzeugnachweise:</strong> {docs.vehiclesWithUploadedDocs ?? 0} von{" "}
                    {docs.vehiclesTotalForDocs ?? 0} Fahrzeugen mindestens ein Dokument
                  </li>
                </>
              ) : null}
            </ul>
            <p className="admin-table-sub" style={{ fontSize: 12 }}>
              Fahrer: P-Schein-Logik wie Einsatzbereitschaft; Fahrzeuge: JSON-Upload-Liste in der Flotte.
            </p>
          </section>

          <AdminCollapsibleSection
            title="Letzte Fahrten (max. 20, jüngste zuerst)"
            subtitle={
              data.recentRides?.length ? `${data.recentRides.length} Einträge` : "Keine Fahrten in der Liste"
            }
            defaultOpen={false}
          >
            {isInsurerLike ? (
              <p className="admin-table-sub" style={{ marginBottom: 8 }}>
                Krankenkasse: sichtbar sind Fahrt, Kostenstelle, Referenz, Status und Betrag – keine medizinischen
                Befunde.
              </p>
            ) : null}
            {!(data.recentRides && data.recentRides.length) ? (
              <p className="admin-table-sub">Keine Fahrten.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 880, width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th className="admin-mandate-th">Status</th>
                      <th className="admin-mandate-th">Anlage / Datum</th>
                      <th className="admin-mandate-th">Start</th>
                      <th className="admin-mandate-th">Ziel</th>
                      <th className="admin-mandate-th">Betrag</th>
                      <th className="admin-mandate-th">Zahlungsart</th>
                      <th className="admin-mandate-th">Fahrer</th>
                      <th className="admin-mandate-th">Kostenstelle / Ref.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentRides.map((r) => (
                      <tr key={r.id}>
                        <td className="admin-mandate-td">{r.status}</td>
                        <td className="admin-mandate-td">{fmtDateDay(r.createdAt)}</td>
                        <td className="admin-mandate-tdMono">{r.fromLabel}</td>
                        <td className="admin-mandate-tdMono">{r.toLabel}</td>
                        <td className="admin-mandate-td">{eur(r.amountEur)}</td>
                        <td className="admin-mandate-td">{r.paymentMethod || NA}</td>
                        <td className="admin-mandate-td">{r.driverLabel || NA}</td>
                        <td className="admin-mandate-td">
                          {r.costCenterId || "—"} / {r.billingReference || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCollapsibleSection>

          <section className="admin-section-block">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Verlauf / Audit (Panel)
              </span>
            </div>
            {!data.panelAudit?.length ? (
              <p className="admin-table-sub">Keine protokollierten Einträge.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                {data.panelAudit.map((a) => (
                  <li
                    key={a.id}
                    style={{ padding: "8px 0", borderBottom: "1px solid #eee", fontSize: 13, lineHeight: 1.45 }}
                  >
                    <strong>{fmtDate(a.createdAt)}</strong> — {a.action}
                    {a.subjectType ? (
                      <span className="admin-table-sub" style={{ marginLeft: 8 }}>
                        ({a.subjectType}
                        {a.subjectId ? `: ${a.subjectId}` : ""})
                      </span>
                    ) : null}
                    {fmtAuditMeta(a.meta) ? (
                      <div
                        className="admin-mandate-audit-meta"
                        style={{ marginTop: 4, fontSize: 11, fontFamily: "ui-monospace, monospace" }}
                      >
                        {fmtAuditMeta(a.meta)}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="admin-table-sub" style={{ marginTop: 10, fontSize: 12 }}>
              Umfasst sichtbare Panel-Metadaten (Aktion, Betroffener, ggf. Meta). Eigene Onroda-Plattform-Log-Ausbauten
              können ergänzen.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
