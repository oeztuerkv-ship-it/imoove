import { useCallback, useEffect, useState, useMemo } from "react";
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

function formFromCompany(c, billingAccountEmail) {
  return {
    name: c.name ?? "",
    contact_name: c.contact_name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    address_line1: c.address_line1 ?? "",
    address_line2: c.address_line2 ?? "",
    postal_code: c.postal_code ?? "",
    city: c.city ?? "",
    country: c.country ?? "",
    vat_id: c.vat_id ?? "",
    tax_id: c.tax_id ?? "",
    concession_number: c.concession_number ?? "",
    legal_form: c.legal_form ?? "",
    owner_name: c.owner_name ?? "",
    billing_name: c.billing_name ?? "",
    billing_address_line1: c.billing_address_line1 ?? "",
    billing_address_line2: c.billing_address_line2 ?? "",
    billing_postal_code: c.billing_postal_code ?? "",
    billing_city: c.billing_city ?? "",
    billing_country: c.billing_country ?? "",
    bank_iban: c.bank_iban ?? "",
    bank_bic: c.bank_bic ?? "",
    support_email: c.support_email ?? "",
    dispo_phone: c.dispo_phone ?? "",
    concession_number: c.concession_number ?? "",
    legal_form: c.legal_form ?? "",
    owner_name: c.owner_name ?? "",
    billing_account_email: billingAccountEmail ?? "",
    verification_status: c.verification_status ?? "pending",
    compliance_status: c.compliance_status ?? "pending",
    contract_status: c.contract_status ?? "inactive",
    is_active: Boolean(c.is_active),
    is_blocked: Boolean(c.is_blocked),
    business_notes: c.business_notes ?? "",
  };
}

/**
 * Mandantenzentrale: Lesen + Stammdaten per `PATCH /admin/companies/:id`
 */
export default function CompanyMandateDetailPage({ companyId, onBack, onRequestFullWorkspace }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [form, setForm] = useState(null);

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

  const c = data?.company;
  const f = data?.financials;
  const isInsurerLike = c && (c.company_kind === "insurer" || c.company_kind === "medical");
  const docs = data?.documents;

  useEffect(() => {
    if (!c || !data) return;
    if (showEdit) return;
    setForm(formFromCompany(c, data.billingAccountEmail));
  }, [c, data, showEdit]);

  const fVal = (k) => (form ? form[k] : "");

  const onField = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  };

  const onSave = useCallback(() => {
    if (!form || !companyId) return;
    setSaveErr("");
    setSaving(true);
    fetch(`${API_BASE}/admin/companies/${encodeURIComponent(companyId)}`, {
      method: "PATCH",
      headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        contact_name: form.contact_name,
        email: form.email,
        phone: form.phone,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        postal_code: form.postal_code,
        city: form.city,
        country: form.country,
        vat_id: form.vat_id,
        tax_id: form.tax_id,
        concession_number: form.concession_number,
        legal_form: form.legal_form,
        owner_name: form.owner_name,
        billing_name: form.billing_name,
        billing_address_line1: form.billing_address_line1,
        billing_address_line2: form.billing_address_line2,
        billing_postal_code: form.billing_postal_code,
        billing_city: form.billing_city,
        billing_country: form.billing_country,
        bank_iban: form.bank_iban,
        bank_bic: form.bank_bic,
        support_email: form.support_email,
        dispo_phone: form.dispo_phone,
        concession_number: form.concession_number,
        legal_form: form.legal_form,
        owner_name: form.owner_name,
        billing_account_email: form.billing_account_email,
        verification_status: form.verification_status,
        compliance_status: form.compliance_status,
        contract_status: form.contract_status,
        is_active: form.is_active,
        is_blocked: form.is_blocked,
        business_notes: form.business_notes,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text();
          setSaveErr(t || `HTTP ${res.status}`);
          return;
        }
        setShowEdit(false);
        loadMandate();
      })
      .catch(() => setSaveErr("Netzwerkfehler."))
      .finally(() => setSaving(false));
  }, [form, companyId, loadMandate]);

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
    <div className="admin-page admin-m-page">
      {err ? <div className="admin-error-banner" style={{ marginBottom: 16 }}>{err}</div> : null}
      {loading && !c ? <p className="admin-table-sub">Lade Mandantendaten …</p> : null}

      {c && data ? (
        <>
          <header className="admin-m-hero">
            <div className="admin-m-hero__bar">
              <div className="admin-m-hero__left">
                <button type="button" className="admin-m-back" onClick={onBack}>
                  ← Mandantenliste
                </button>
                <h1 className="admin-m-hero__title">{c.name || "Mandantenzentrale"}</h1>
                {headBadges}
                <p className="admin-m-hero__hint">
                  Zentrale für Kennzahlen und Fahrten; Plattform-Perspektive (keine klinischen Inhalte). Unternehmensart:{" "}
                  <code>{c.company_kind}</code>
                </p>
              </div>
              <div className="admin-m-hero__actions">
                {typeof onRequestFullWorkspace === "function" ? (
                  <button
                    type="button"
                    className="admin-c-btn-sec"
                    onClick={() => onRequestFullWorkspace()}
                    title="Erweiterte Werkstatt-Formulare (Flotte, Kasse) in der Mandantenliste"
                  >
                    Werkstatt in Liste öffnen
                  </button>
                ) : null}
                <button
                  type="button"
                  className={showEdit ? "admin-c-btn-sec" : "admin-m-btn-pri"}
                  onClick={() => {
                    setSaveErr("");
                    setShowEdit((v) => !v);
                  }}
                >
                  {showEdit ? "Ansicht" : "Stammdaten bearbeiten"}
                </button>
                <button
                  type="button"
                  className="admin-m-btn-gh"
                  onClick={() => loadMandate()}
                  disabled={loading}
                >
                  ⟳
                </button>
              </div>
            </div>
          </header>

          {saveErr ? <div className="admin-error-banner" style={{ marginBottom: 12 }}>{saveErr}</div> : null}

          {showEdit && form ? (
            <section className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
              <div className="admin-m-card__h">
                <span className="admin-panel-card__title" style={{ margin: 0 }}>
                  Stammdaten, Status & Notizen
                </span>
                <span className="admin-table-sub" style={{ margin: 0 }}>
                  Speichern über <code>PATCH /admin/companies/:id</code> (kein Wechsel der Unternehmensart)
                </span>
              </div>
              <div className="admin-m-form">
                <label className="admin-m-lbl">
                  Firmenname
                  <input className="admin-m-inp" value={fVal("name")} onChange={onField("name")} />
                </label>
                <label className="admin-m-lbl">
                  Ansprechpartner
                  <input className="admin-m-inp" value={fVal("contact_name")} onChange={onField("contact_name")} />
                </label>
                <label className="admin-m-lbl">
                  E-Mail
                  <input className="admin-m-inp" type="email" value={fVal("email")} onChange={onField("email")} />
                </label>
                <label className="admin-m-lbl">
                  Telefon
                  <input className="admin-m-inp" value={fVal("phone")} onChange={onField("phone")} />
                </label>
                <label className="admin-m-lbl">
                  Disponent (Telefon)
                  <input className="admin-m-inp" value={fVal("dispo_phone")} onChange={onField("dispo_phone")} />
                </label>
                <label className="admin-m-lbl">
                  Konzession / Ordnungsnr.
                  <input
                    className="admin-m-inp"
                    value={fVal("concession_number")}
                    onChange={onField("concession_number")}
                  />
                </label>
                <label className="admin-m-lbl">
                  Rechtsform
                  <input className="admin-m-inp" value={fVal("legal_form")} onChange={onField("legal_form")} />
                </label>
                <label className="admin-m-lbl">
                  Inhaber / Ansprechrecht
                  <input className="admin-m-inp" value={fVal("owner_name")} onChange={onField("owner_name")} />
                </label>
                <label className="admin-m-lbl" style={{ gridColumn: "1 / -1" }}>
                  Adresse: Zeile 1
                  <input className="admin-m-inp" value={fVal("address_line1")} onChange={onField("address_line1")} />
                </label>
                <label className="admin-m-lbl" style={{ gridColumn: "1 / -1" }}>
                  Adresse: Zeile 2
                  <input className="admin-m-inp" value={fVal("address_line2")} onChange={onField("address_line2")} />
                </label>
                <label className="admin-m-lbl">
                  PLZ
                  <input className="admin-m-inp" value={fVal("postal_code")} onChange={onField("postal_code")} />
                </label>
                <label className="admin-m-lbl">
                  Ort
                  <input className="admin-m-inp" value={fVal("city")} onChange={onField("city")} />
                </label>
                <label className="admin-m-lbl">
                  Land
                  <input className="admin-m-inp" value={fVal("country")} onChange={onField("country")} />
                </label>
                <label className="admin-m-lbl">
                  USt-Id
                  <input className="admin-m-inp" value={fVal("vat_id")} onChange={onField("vat_id")} />
                </label>
                <label className="admin-m-lbl">
                  Steuer-Nr.
                  <input className="admin-m-inp" value={fVal("tax_id")} onChange={onField("tax_id")} />
                </label>
                <label className="admin-m-lbl" style={{ gridColumn: "1 / -1" }}>
                  Rechnungsempfänger / Rechnungsname
                  <input className="admin-m-inp" value={fVal("billing_name")} onChange={onField("billing_name")} />
                </label>
                <label className="admin-m-lbl" style={{ gridColumn: "1 / -1" }}>
                  Rechnungsadresse Zeile 1
                  <input
                    className="admin-m-inp"
                    value={fVal("billing_address_line1")}
                    onChange={onField("billing_address_line1")}
                  />
                </label>
                <label className="admin-m-lbl" style={{ gridColumn: "1 / -1" }}>
                  Rechnungsadresse Zeile 2
                  <input
                    className="admin-m-inp"
                    value={fVal("billing_address_line2")}
                    onChange={onField("billing_address_line2")}
                  />
                </label>
                <label className="admin-m-lbl">
                  Rechnung PLZ
                  <input
                    className="admin-m-inp"
                    value={fVal("billing_postal_code")}
                    onChange={onField("billing_postal_code")}
                  />
                </label>
                <label className="admin-m-lbl">
                  Rechnung Ort
                  <input className="admin-m-inp" value={fVal("billing_city")} onChange={onField("billing_city")} />
                </label>
                <label className="admin-m-lbl">
                  Rechnung Land
                  <input
                    className="admin-m-inp"
                    value={fVal("billing_country")}
                    onChange={onField("billing_country")}
                  />
                </label>
                <label className="admin-m-lbl">
                  IBAN
                  <input className="admin-m-inp" value={fVal("bank_iban")} onChange={onField("bank_iban")} />
                </label>
                <label className="admin-m-lbl">
                  BIC
                  <input className="admin-m-inp" value={fVal("bank_bic")} onChange={onField("bank_bic")} />
                </label>
                <label className="admin-m-lbl">
                  Support-/Buchungs-E-Mail (Stamm)
                  <input
                    className="admin-m-inp"
                    type="email"
                    value={fVal("support_email")}
                    onChange={onField("support_email")}
                  />
                </label>
                <label className="admin-m-lbl">
                  Rechnungs-E-Mail (Abrechnungskonto)
                  <input
                    className="admin-m-inp"
                    type="email"
                    value={fVal("billing_account_email")}
                    onChange={onField("billing_account_email")}
                  />
                </label>
                <label className="admin-m-lbl">
                  Verifizierungsstatus
                  <select
                    className="admin-m-inp"
                    value={fVal("verification_status")}
                    onChange={onField("verification_status")}
                  >
                    <option value="pending">pending</option>
                    <option value="in_review">in_review</option>
                    <option value="verified">verified</option>
                    <option value="rejected">rejected</option>
                  </select>
                </label>
                <label className="admin-m-lbl">
                  Compliance-Status
                  <select
                    className="admin-m-inp"
                    value={fVal("compliance_status")}
                    onChange={onField("compliance_status")}
                  >
                    <option value="pending">pending</option>
                    <option value="in_review">in_review</option>
                    <option value="compliant">compliant</option>
                    <option value="non_compliant">non_compliant</option>
                  </select>
                </label>
                <label className="admin-m-lbl">
                  Vertragsstatus
                  <select className="admin-m-inp" value={fVal("contract_status")} onChange={onField("contract_status")}>
                    <option value="inactive">inactive</option>
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="terminated">terminated</option>
                  </select>
                </label>
                <label className="admin-m-lbl admin-m-lbl--check">
                  <input type="checkbox" checked={!!form.is_active} onChange={onField("is_active")} /> Mandant aktiv
                </label>
                <label className="admin-m-lbl admin-m-lbl--check">
                  <input type="checkbox" checked={!!form.is_blocked} onChange={onField("is_blocked")} /> Plattform-Sperre
                </label>
                <label className="admin-m-lbl" style={{ gridColumn: "1 / -1" }}>
                  Admin-Notiz / Sperrgrund-Referenz (`business_notes`, intern)
                  <textarea
                    className="admin-m-ta"
                    rows={4}
                    value={fVal("business_notes")}
                    onChange={onField("business_notes")}
                  />
                </label>
              </div>
              <div className="admin-m-form__foot">
                <button type="button" className="admin-m-btn-pri" onClick={onSave} disabled={saving}>
                  {saving ? "Speichern …" : "Speichern"}
                </button>
                <button
                  type="button"
                  className="admin-c-btn-sec"
                  onClick={() => {
                    setForm(formFromCompany(c, data.billingAccountEmail));
                    setShowEdit(false);
                    setSaveErr("");
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </section>
          ) : null}

          {!showEdit ? (
            <section className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
              <div className="admin-m-card__h">
                <span className="admin-panel-card__title" style={{ margin: 0 }}>
                  Stammdaten
                </span>
              </div>
            <div className="admin-mandate-grid admin-mandate-grid--dense">
              <div>
                <div className="admin-table-sub">Firmenname</div>
                <div style={{ fontWeight: 600 }}>{fmtText(c.name)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Unternehmensart (company_kind)</div>
                <div>{KIND_LABEL[c.company_kind] || fmtText(c.company_kind)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Vertragsstatus</div>
                <div>{fmtText(c.contract_status)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Verifizierungsstatus</div>
                <div>{fmtText(c.verification_status)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Compliance-Status</div>
                <div>{fmtText(c.compliance_status)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Aktiv / Plattform-Sperre</div>
                <div>
                  {boolJaNein(c.is_active)} / <span style={{ color: c.is_blocked ? "#b91c1c" : "inherit" }}>{c.is_blocked ? "Gesperrt" : "Nicht gesperrt"}</span>
                </div>
              </div>
              <div>
                <div className="admin-table-sub">Ansprechpartner</div>
                <div>{fmtText(c.contact_name)}</div>
              </div>
              <div>
                <div className="admin-table-sub">E-Mail (Stamm)</div>
                <div>{fmtText(c.email)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Support-/Buchungs-E-Mail</div>
                <div>{fmtText(c.support_email)}</div>
              </div>
              <div>
                <div className="admin-table-sub">E-Mail (Abrechnungskonto, falls gepflegt)</div>
                <div>{data.billingAccountEmail ? data.billingAccountEmail : NA}</div>
              </div>
              <div>
                <div className="admin-table-sub">Telefon (Stamm)</div>
                <div>{fmtText(c.phone)}</div>
              </div>
              <div>
                <div className="admin-table-sub">Disponent (Telefon)</div>
                <div>{fmtText(c.dispo_phone)}</div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="admin-table-sub">Adresse</div>
                <div>
                  {(() => {
                    const parts = [c.address_line1, c.address_line2, c.postal_code, c.city, c.country]
                      .map(s)
                      .filter(Boolean);
                    if (!parts.length) return NA;
                    return parts.join(", ");
                  })()}
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="admin-table-sub">Rechnungsadresse</div>
                <div>
                  {(() => {
                    const name = s(c.billing_name);
                    const a1 = s(c.billing_address_line1);
                    const a2 = s(c.billing_address_line2);
                    const pc = s(c.billing_postal_code);
                    const city = s(c.billing_city);
                    const ctry = s(c.billing_country);
                    const line = [name, a1, a2, [pc, city].filter(Boolean).join(" "), ctry]
                      .filter(Boolean)
                      .join(", ");
                    return line || NA;
                  })()}
                </div>
              </div>
              <div>
                <div className="admin-table-sub">USt-Id / Steuer-ID</div>
                <div>
                  {s(c.vat_id) || NA}
                  {s(c.tax_id) ? (
                    <span>
                      {s(c.vat_id) ? " · " : ""}
                      St.-Nr.: {c.tax_id}
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="admin-table-sub">Konzessions-/Ordnungsnr. (Stamm)</div>
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
                <div className="admin-table-sub">IBAN (Auszahlung)</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{fmtText(c.bank_iban)}</div>
              </div>
              <div>
                <div className="admin-table-sub">BIC</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{fmtText(c.bank_bic)}</div>
              </div>
            </div>
            {c.business_notes ? (
              <div style={{ marginTop: 16, padding: 12, background: "#f8fafc", borderRadius: 8 }}>
                <div className="admin-table-sub" style={{ marginBottom: 6 }}>
                  Betriebsnotiz
                </div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.business_notes}</div>
              </div>
            ) : null}
            </section>
          ) : null}

          <section className="admin-panel-card admin-m-card admin-m-card--kpi" style={{ marginBottom: 16 }}>
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Abrechnung / Einnahmen
              </span>
            </div>
            <div className="admin-mandate-kpi" style={{ marginBottom: 12, padding: "0 8px 10px" }}>
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

          <section className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Fahrten im Überblick (Status)
              </span>
            </div>
            <div className="admin-mandate-kpi" style={{ padding: "8px 12px 12px" }}>
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
            <section
              className="admin-panel-card admin-m-card admin-m-silo admin-m-silo--taxi"
              style={{ marginBottom: 16 }}
            >
              <div className="admin-m-card__h">
                <span className="admin-panel-card__title" style={{ margin: 0 }}>
                  Taxi · Flotte
                </span>
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
            </section>
          ) : null}

          {data.hotel ? (
            <section
              className="admin-panel-card admin-m-card admin-m-silo admin-m-silo--hotel"
              style={{ marginBottom: 16 }}
            >
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
            <section
              className="admin-panel-card admin-m-card admin-m-silo admin-m-silo--kasse"
              style={{ marginBottom: 16 }}
            >
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

          <section className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
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

          <section className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Letzte Fahrten (max. 20, jüngste zuerst)
              </span>
            </div>
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
          </section>

          <section className="admin-panel-card admin-m-card">
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
