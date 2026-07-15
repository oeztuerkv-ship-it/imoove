import { useCallback, useEffect, useMemo, useState } from "react";
import AdminOnboardingBlockFooter from "./AdminOnboardingBlockFooter";
import CompanyPanelModulesSection from "./CompanyPanelModulesSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminFetch, getAdminSessionToken, isAdminSessionConfigured } from "../lib/adminApiHeaders.js";
import {
  commissionPercentFromRate,
  commissionRateFromPercent,
  isValidEmailOptional,
  isValidIbanOptional,
} from "../lib/adminCompanyFieldValidate";

const FP_BLOCK = "admin_platform_block_reason";

const ADMIN_COMPANY_KIND_OPTIONS = [
  { value: "taxi", label: "Taxi" },
  { value: "hotel", label: "Hotel" },
  { value: "corporate", label: "Corporate / Unternehmen" },
  { value: "voucher_client", label: "Gutschein" },
  { value: "insurer", label: "Versicherung / Krankenkasse" },
  { value: "medical", label: "Krankenfahrt" },
  { value: "general", label: "Sonstige" },
];

function ampelMeta(status) {
  if (status === "approved") return { emoji: "🟢", label: "Freigegeben", cls: "admin-onb-ampel--ok" };
  if (status === "pending") return { emoji: "🟡", label: "Ausstehend", cls: "admin-onb-ampel--pending" };
  return { emoji: "🔴", label: "Unvollständig", cls: "admin-onb-ampel--bad" };
}

function asObj(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return { ...v };
}

function strFromFp(fp, k) {
  const v = fp[k];
  return typeof v === "string" ? v : "";
}

function Field({ label, required, error, children }) {
  return (
    <label className="admin-m-field">
      <span className="admin-m-field__label">
        {label}
        {required ? <span className="admin-m-field__req"> *</span> : null}
      </span>
      {children}
      {error ? <span className="admin-m-field__err">{error}</span> : null}
    </label>
  );
}

function formatPatchError(res, json) {
  const code = String(json?.error ?? "").trim();
  if (res.status === 401 || code === "unauthorized" || code === "session_required") {
    return "Nicht angemeldet — bitte im Admin-Panel einloggen (Plattform-Login, kein Partner-Token).";
  }
  if (res.status === 403 || code === "forbidden") {
    return "Keine Berechtigung: Rolle „admin“ oder „service“ (oder Taxi-Admin für diesen Mandanten).";
  }
  if (res.status === 404) {
    return "API-Route nicht gefunden — Server-Deploy prüfen (Section-PATCH / admin-panel Build).";
  }
  if (code === "db_schema_admin_company_091" || json?.hint) {
    return String(json.hint || "Migration 091 auf der Datenbank einspielen, dann API neu starten.");
  }
  if (code === "database_not_configured") {
    return "Datenbank nicht erreichbar (DATABASE_URL / Deploy).";
  }
  if (code === "validation_failed") return "Validierung fehlgeschlagen — markierte Felder prüfen.";
  if (code === "empty_patch") return "Keine speicherbaren Felder — bitte einen Wert ändern.";
  if (code === "company_code_duplicate") return "Mandanten-Code ist bereits vergeben.";
  if (code === "company_code_too_short") {
    return "Mandanten-Code: mindestens 2 Zeichen (A–Z, 0–9, Bindestrich) — Feld leer lassen, wenn unverändert.";
  }
  if (code === "company_code_too_long") return "Mandanten-Code: maximal 16 Zeichen.";
  if (code === "company_code_invalid") {
    return "Mandanten-Code: nur Großbuchstaben, Ziffern und Bindestriche (nicht am Anfang/Ende).";
  }
  if (code === "invoice_prefix_too_short") {
    return "Rechnungs-Prefix: mindestens 2 Zeichen — leer lassen, wenn unverändert.";
  }
  if (code === "invoice_prefix_too_long") return "Rechnungs-Prefix: maximal 8 Zeichen.";
  if (code === "panel_modules_forbidden_for_company_kind") {
    return String(json?.fieldErrors?.panel_modules || json?.hint || "Modul-Auswahl passt nicht zum Mandantentyp.");
  }
  return code || `Speichern fehlgeschlagen (HTTP ${res.status})`;
}

async function patchCompanySection(companyId, section, body) {
  const res = await adminFetch(
    `${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/sections/${section}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(formatPatchError(res, json));
    err.fieldErrors = json.fieldErrors;
    throw err;
  }
  return json;
}

export default function CompanyMandateEditBlocks({
  companyId,
  company,
  billingAccount,
  billingAccountEmail,
  panelModuleCatalog,
  onSaved,
}) {
  const c = company;

  const [stammdaten, setStammdaten] = useState({});
  const [kontakt, setKontakt] = useState({});
  const [status, setStatus] = useState({});
  const [billing, setBilling] = useState({});
  const [bank, setBank] = useState({});
  const [notes, setNotes] = useState({});

  const [busy, setBusy] = useState("");
  const [sectionErr, setSectionErr] = useState("");
  const [sectionOk, setSectionOk] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const sessionOk = isAdminSessionConfigured();

  /** Nur bei neuen Server-Daten zurücksetzen — nicht bei jedem Tastendruck. */
  const serverFormRevision = useMemo(() => {
    const updated = c?.updated_at ?? c?.updatedAt ?? "";
    const ba = billingAccountEmail ?? billingAccount?.billingEmail ?? "";
    return `${companyId}|${updated}|${ba}`;
  }, [companyId, c, billingAccountEmail, billingAccount?.billingEmail]);

  const resetForms = useCallback(() => {
    const fp = asObj(c.fare_permissions);
    setStammdaten({
      name: c.name ?? "",
      company_kind: c.company_kind ?? "general",
      legal_form: c.legal_form ?? "",
      owner_name: c.owner_name ?? "",
      tax_id: c.tax_id ?? "",
      vat_id: c.vat_id ?? "",
      concession_number: c.concession_number ?? "",
      trade_license_number: c.trade_license_number ?? "",
      company_code: c.company_code ?? "",
      invoice_prefix: c.invoice_prefix ?? "",
    });
    setKontakt({
      contact_name: c.contact_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      support_email: c.support_email ?? "",
      dispo_phone: c.dispo_phone ?? "",
      address_line1: c.address_line1 ?? "",
      address_line2: c.address_line2 ?? "",
      postal_code: c.postal_code ?? "",
      city: c.city ?? "",
      country: c.country ?? "",
      opening_hours: c.opening_hours ?? "",
    });
    setStatus({
      is_active: Boolean(c.is_active),
      is_blocked: Boolean(c.is_blocked),
      verification_status: c.verification_status ?? "pending",
      compliance_status: c.compliance_status ?? "pending",
      contract_status: c.contract_status ?? "inactive",
      onboarding_status: c.onboarding_status ?? "incomplete",
      panel_access_enabled: c.panel_access_enabled !== false,
      medical_transport_enabled: Boolean(c.medical_transport_enabled),
      feature_kk_module: Boolean(c.feature_kk_module),
      block_platform_reason: strFromFp(fp, FP_BLOCK),
    });
    setBilling({
      billing_name: c.billing_name ?? "",
      billing_address_line1: c.billing_address_line1 ?? "",
      billing_address_line2: c.billing_address_line2 ?? "",
      billing_postal_code: c.billing_postal_code ?? "",
      billing_city: c.billing_city ?? "",
      billing_country: c.billing_country ?? "",
      commission_type: c.commission_type ?? "percentage",
      commission_rate_percent: commissionPercentFromRate(c.commission_rate),
      commission_fixed_eur: c.commission_fixed_eur ?? 0,
      min_commission_eur: c.min_commission_eur ?? "",
      payout_allowed: c.payout_allowed !== false,
      billing_account_email: billingAccountEmail ?? billingAccount?.billingEmail ?? "",
      billing_settlement_interval: billingAccount?.settlementInterval ?? "monthly",
      billing_payment_terms_days: billingAccount?.paymentTermsDays ?? 14,
      partner_ik_number: c.partner_ik_number ?? "",
    });
    setBank({
      bank_iban: c.bank_iban ?? "",
      bank_bic: c.bank_bic ?? "",
    });
    setNotes({
      business_notes: c.business_notes ?? "",
    });
    setFieldErrors({});
    setSectionErr("");
  }, [c, billingAccount, billingAccountEmail]);

  useEffect(() => {
    resetForms();
  }, [serverFormRevision, resetForms]);

  const saveSection = async (section, body, localValidate, busyKey = section) => {
    if (!sessionOk) {
      setSectionErr("Keine Admin-Sitzung — bitte unter admin.onroda.de/partners/ anmelden.");
      return;
    }
    setBusy(busyKey);
    setSectionErr("");
    setSectionOk("");
    setFieldErrors({});
    const localErr = localValidate ? localValidate() : {};
    if (Object.keys(localErr).length) {
      setFieldErrors(localErr);
      setBusy("");
      return;
    }
    try {
      await patchCompanySection(companyId, section, body);
      if (section === "status") {
        setStatus((prev) => ({ ...prev, ...body }));
      }
      setSectionOk("Gespeichert.");
      onSaved?.();
    } catch (e) {
      setSectionErr(e.message || "Speichern fehlgeschlagen");
      if (e.fieldErrors) setFieldErrors(e.fieldErrors);
    } finally {
      setBusy("");
    }
  };

  const fe = (k) => fieldErrors[k] || "";
  const amp = ampelMeta(status.onboarding_status);
  const statusBusy = busy === "status" || busy === "status-activate" || busy === "status-deactivate";
  const fullyActive =
    status.is_active &&
    !status.is_blocked &&
    status.panel_access_enabled &&
    status.onboarding_status === "approved" &&
    status.contract_status === "active";
  const fullyInactive = !status.is_active && !status.panel_access_enabled;

  const quickActivate = () => {
    const body = {
      is_active: true,
      is_blocked: false,
      panel_access_enabled: true,
      onboarding_status: "approved",
      contract_status: "active",
    };
    return saveSection("status", body, undefined, "status-activate");
  };

  const quickDeactivate = () =>
    saveSection(
      "status",
      {
        is_active: false,
        panel_access_enabled: false,
        contract_status: "inactive",
      },
      undefined,
      "status-deactivate",
    );

  return (
    <>
      {!sessionOk ? (
        <div className="admin-error-banner" role="alert">
          Bearbeiten/Speichern ist ohne <strong>Admin-Login</strong> gesperrt. Bitte anmelden (nicht Partner-Panel).
          {getAdminSessionToken() ? " (Token ungültig — neu einloggen.)" : null}
        </div>
      ) : null}
      {sectionErr ? (
        <div className="admin-error-banner" role="alert">
          {sectionErr}
        </div>
      ) : null}
      {sectionOk && !sectionErr ? (
        <div className="admin-success-banner" role="status">
          {sectionOk}
        </div>
      ) : null}
      <section className="admin-section-block admin-onb-block">
        <div className="admin-m-card__h">
          <span className="admin-panel-card__title" style={{ margin: 0 }}>
            1. Stammdaten
          </span>
        </div>
        <div className="admin-mandate-grid admin-mandate-grid--dense">
          <Field label="Firmenname" required error={fe("name")}>
            <input
              className="admin-m-inp"
              value={stammdaten.name}
              onChange={(e) => setStammdaten((s) => ({ ...s, name: e.target.value }))}
            />
          </Field>
          <Field label="Unternehmensart" error={fe("company_kind")}>
            <select
              className="admin-m-inp"
              value={stammdaten.company_kind}
              onChange={(e) => setStammdaten((s) => ({ ...s, company_kind: e.target.value }))}
            >
              {ADMIN_COMPANY_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rechtsform" error={fe("legal_form")}>
            <input
              className="admin-m-inp"
              value={stammdaten.legal_form}
              onChange={(e) => setStammdaten((s) => ({ ...s, legal_form: e.target.value }))}
            />
          </Field>
          <Field label="Inhaber / Ansprechpartner (Stamm)" error={fe("owner_name")}>
            <input
              className="admin-m-inp"
              value={stammdaten.owner_name}
              onChange={(e) => setStammdaten((s) => ({ ...s, owner_name: e.target.value }))}
            />
          </Field>
          <Field label="Steuernummer" error={fe("tax_id")}>
            <input
              className="admin-m-inp"
              value={stammdaten.tax_id}
              onChange={(e) => setStammdaten((s) => ({ ...s, tax_id: e.target.value }))}
            />
          </Field>
          <Field label="USt-ID" error={fe("vat_id")}>
            <input
              className="admin-m-inp"
              value={stammdaten.vat_id}
              onChange={(e) => setStammdaten((s) => ({ ...s, vat_id: e.target.value }))}
            />
          </Field>
          <Field label="Konzessionsnummer" error={fe("concession_number")}>
            <input
              className="admin-m-inp"
              value={stammdaten.concession_number}
              onChange={(e) => setStammdaten((s) => ({ ...s, concession_number: e.target.value }))}
            />
          </Field>
          <Field label="Gewerbeschein-Nr. / Betriebsnummer" error={fe("trade_license_number")}>
            <input
              className="admin-m-inp"
              value={stammdaten.trade_license_number}
              onChange={(e) => setStammdaten((s) => ({ ...s, trade_license_number: e.target.value }))}
            />
          </Field>
          <Field label="Mandanten-Code (optional, min. 2 Zeichen)" error={fe("company_code")}>
            <input
              className="admin-m-inp"
              value={stammdaten.company_code}
              onChange={(e) => setStammdaten((s) => ({ ...s, company_code: e.target.value }))}
              placeholder="Leer = unverändert"
            />
          </Field>
          <Field label="Rechnungs-Prefix (optional, min. 2 Zeichen)" error={fe("invoice_prefix")}>
            <input
              className="admin-m-inp"
              value={stammdaten.invoice_prefix}
              onChange={(e) => setStammdaten((s) => ({ ...s, invoice_prefix: e.target.value }))}
              placeholder="Leer = unverändert"
            />
          </Field>
        </div>
        <AdminOnboardingBlockFooter
          type="button"
          label="Stammdaten speichern"
          busy={busy === "stammdaten"}
          onClick={() => {
            const body = { ...stammdaten };
            if (!String(body.company_code ?? "").trim()) delete body.company_code;
            if (!String(body.invoice_prefix ?? "").trim()) delete body.invoice_prefix;
            return saveSection("stammdaten", body, () => {
            const err = {};
            if (!String(stammdaten.name || "").trim()) err.name = "Pflichtfeld";
            const cc = String(stammdaten.company_code ?? "").trim();
            if (cc && cc.length < 2) err.company_code = "Mindestens 2 Zeichen";
            const ip = String(stammdaten.invoice_prefix ?? "").trim();
            if (ip && ip.length < 2) err.invoice_prefix = "Mindestens 2 Zeichen";
            return err;
          });
          }}
        />
      </section>

      <section className="admin-section-block admin-onb-block">
        <div className="admin-m-card__h">
          <span className="admin-panel-card__title" style={{ margin: 0 }}>
            2. Kontakt &amp; Adresse
          </span>
        </div>
        <div className="admin-mandate-grid admin-mandate-grid--dense">
          <Field label="Ansprechpartner" error={fe("contact_name")}>
            <input
              className="admin-m-inp"
              value={kontakt.contact_name}
              onChange={(e) => setKontakt((s) => ({ ...s, contact_name: e.target.value }))}
            />
          </Field>
          <Field label="E-Mail" error={fe("email")}>
            <input
              className="admin-m-inp"
              type="email"
              value={kontakt.email}
              onChange={(e) => setKontakt((s) => ({ ...s, email: e.target.value }))}
            />
          </Field>
          <Field label="Telefon" error={fe("phone")}>
            <input
              className="admin-m-inp"
              value={kontakt.phone}
              onChange={(e) => setKontakt((s) => ({ ...s, phone: e.target.value }))}
            />
          </Field>
          <Field label="Support-E-Mail" error={fe("support_email")}>
            <input
              className="admin-m-inp"
              type="email"
              value={kontakt.support_email}
              onChange={(e) => setKontakt((s) => ({ ...s, support_email: e.target.value }))}
            />
          </Field>
          <Field label="Disponent (Telefon)" error={fe("dispo_phone")}>
            <input
              className="admin-m-inp"
              value={kontakt.dispo_phone}
              onChange={(e) => setKontakt((s) => ({ ...s, dispo_phone: e.target.value }))}
            />
          </Field>
          <Field label="Adresse Zeile 1" error={fe("address_line1")}>
            <input
              className="admin-m-inp"
              value={kontakt.address_line1}
              onChange={(e) => setKontakt((s) => ({ ...s, address_line1: e.target.value }))}
            />
          </Field>
          <Field label="Adresse Zeile 2" error={fe("address_line2")}>
            <input
              className="admin-m-inp"
              value={kontakt.address_line2}
              onChange={(e) => setKontakt((s) => ({ ...s, address_line2: e.target.value }))}
            />
          </Field>
          <Field label="PLZ" error={fe("postal_code")}>
            <input
              className="admin-m-inp"
              value={kontakt.postal_code}
              onChange={(e) => setKontakt((s) => ({ ...s, postal_code: e.target.value }))}
            />
          </Field>
          <Field label="Ort" error={fe("city")}>
            <input
              className="admin-m-inp"
              value={kontakt.city}
              onChange={(e) => setKontakt((s) => ({ ...s, city: e.target.value }))}
            />
          </Field>
          <Field label="Land" error={fe("country")}>
            <input
              className="admin-m-inp"
              value={kontakt.country}
              onChange={(e) => setKontakt((s) => ({ ...s, country: e.target.value }))}
            />
          </Field>
          <Field label="Erreichbarkeit / Öffnungszeiten" error={fe("opening_hours")}>
            <textarea
              className="admin-m-inp"
              rows={2}
              value={kontakt.opening_hours}
              onChange={(e) => setKontakt((s) => ({ ...s, opening_hours: e.target.value }))}
            />
          </Field>
        </div>
        <AdminOnboardingBlockFooter
          type="button"
          label="Kontakt speichern"
          busy={busy === "kontakt"}
          onClick={() =>
            saveSection("kontakt", kontakt, () => {
              const err = {};
              if (!isValidEmailOptional(kontakt.email)) err.email = "Ungültige E-Mail";
              if (!isValidEmailOptional(kontakt.support_email)) err.support_email = "Ungültige E-Mail";
              return err;
            })
          }
        />
      </section>

      <section className="admin-section-block admin-onb-block">
        <div className="admin-m-card__h">
          <span className="admin-panel-card__title" style={{ margin: 0 }}>
            3. Betrieb &amp; Status
          </span>
        </div>
        <div className="admin-mandate-grid admin-mandate-grid--dense">
          <Field label="Mandant aktiv">
            <select
              className="admin-m-inp"
              value={status.is_active ? "1" : "0"}
              onChange={(e) => setStatus((s) => ({ ...s, is_active: e.target.value === "1" }))}
            >
              <option value="1">Ja</option>
              <option value="0">Nein</option>
            </select>
          </Field>
          <Field label="Plattform-Sperre">
            <select
              className="admin-m-inp"
              value={status.is_blocked ? "1" : "0"}
              onChange={(e) => setStatus((s) => ({ ...s, is_blocked: e.target.value === "1" }))}
            >
              <option value="0">Nicht gesperrt</option>
              <option value="1">Gesperrt</option>
            </select>
          </Field>
          <Field label="Verifizierung">
            <select
              className="admin-m-inp"
              value={status.verification_status}
              onChange={(e) => setStatus((s) => ({ ...s, verification_status: e.target.value }))}
            >
              <option value="pending">In Prüfung / ausstehend</option>
              <option value="in_review">In Review</option>
              <option value="verified">Freigegeben</option>
              <option value="rejected">Abgelehnt</option>
            </select>
          </Field>
          <Field label="Compliance">
            <select
              className="admin-m-inp"
              value={status.compliance_status}
              onChange={(e) => setStatus((s) => ({ ...s, compliance_status: e.target.value }))}
            >
              <option value="pending">Ausstehend</option>
              <option value="in_review">In Prüfung</option>
              <option value="compliant">Konform</option>
              <option value="non_compliant">Nicht konform</option>
            </select>
          </Field>
          <Field label="Vertrag">
            <select
              className="admin-m-inp"
              value={status.contract_status}
              onChange={(e) => setStatus((s) => ({ ...s, contract_status: e.target.value }))}
            >
              <option value="inactive">Inaktiv</option>
              <option value="active">Aktiv</option>
              <option value="suspended">Ausgesetzt</option>
              <option value="terminated">Beendet</option>
            </select>
          </Field>
          <Field label="Taxi-Onboarding (Ampel)">
            <select
              className="admin-m-inp"
              value={status.onboarding_status}
              onChange={(e) => setStatus((s) => ({ ...s, onboarding_status: e.target.value }))}
            >
              <option value="incomplete">Unvollständig</option>
              <option value="pending">In Prüfung</option>
              <option value="approved">Freigegeben</option>
            </select>
          </Field>
          <Field label="Partner-Panel-Zugang">
            <select
              className="admin-m-inp"
              value={status.panel_access_enabled ? "1" : "0"}
              onChange={(e) => setStatus((s) => ({ ...s, panel_access_enabled: e.target.value === "1" }))}
            >
              <option value="1">Erlaubt</option>
              <option value="0">Gesperrt</option>
            </select>
          </Field>
          {c.company_kind === "taxi" ? (
            <>
              <Field label="Krankenfahrten">
                <select
                  className="admin-m-inp"
                  value={status.medical_transport_enabled ? "1" : "0"}
                  onChange={(e) =>
                    setStatus((s) => ({ ...s, medical_transport_enabled: e.target.value === "1" }))
                  }
                >
                  <option value="0">Nein</option>
                  <option value="1">Ja</option>
                </select>
              </Field>
              <Field label="KK-Modul (SaaS)">
                <select
                  className="admin-m-inp"
                  value={status.feature_kk_module ? "1" : "0"}
                  onChange={(e) => setStatus((s) => ({ ...s, feature_kk_module: e.target.value === "1" }))}
                >
                  <option value="0">Nein</option>
                  <option value="1">Ja</option>
                </select>
              </Field>
            </>
          ) : null}
          <Field label="Sperrgrund (intern)" error={fe("block_platform_reason")}>
            <textarea
              className="admin-m-inp"
              rows={3}
              value={status.block_platform_reason}
              onChange={(e) => setStatus((s) => ({ ...s, block_platform_reason: e.target.value }))}
            />
          </Field>
        </div>
        <div className="admin-action-row" style={{ marginTop: 8, marginBottom: 4 }}>
          {!fullyInactive ? (
            <button
              type="button"
              className="admin-btn-secondary admin-btn-primary--sm"
              disabled={statusBusy}
              onClick={() => {
                if (!window.confirm("Mandant archivieren? Partner-Login und Vertrag werden deaktiviert.")) return;
                void quickDeactivate();
              }}
            >
              Archivieren
            </button>
          ) : (
            <button
              type="button"
              className="admin-btn-primary admin-btn-primary--sm"
              disabled={statusBusy}
              onClick={() => void quickActivate()}
            >
              Reaktivieren
            </button>
          )}
        </div>
        <AdminOnboardingBlockFooter
          type="button"
          label="Betrieb/Status speichern"
          busy={statusBusy}
          onClick={() => {
            const body = { ...status };
            if (c.company_kind !== "taxi") {
              delete body.medical_transport_enabled;
              delete body.feature_kk_module;
            }
            return saveSection("status", body);
          }}
        />
      </section>

      <CompanyPanelModulesSection
        companyKind={c.company_kind}
        storedModules={c.panel_modules}
        moduleCatalog={panelModuleCatalog}
        busy={busy === "panel_modules"}
        fieldError={fieldErrors.panel_modules}
        onSave={(panel_modules) =>
          saveSection("status", { panel_modules }, null, "panel_modules")
        }
      />

      <section className="admin-section-block admin-onb-block">
        <div className="admin-m-card__h">
          <span className="admin-panel-card__title" style={{ margin: 0 }}>
            4. Provision &amp; Abrechnung
          </span>
        </div>
        <div className="admin-mandate-grid admin-mandate-grid--dense">
          <Field label="Provisionsmodell">
            <select
              className="admin-m-inp"
              value={billing.commission_type}
              onChange={(e) => setBilling((s) => ({ ...s, commission_type: e.target.value }))}
            >
              <option value="percentage">Prozent</option>
              <option value="fixed">Fixbetrag</option>
              <option value="hybrid">Hybrid (Prozent + Mindestprovision)</option>
              <option value="none">Keine Provision</option>
            </select>
          </Field>
          {billing.commission_type === "percentage" || billing.commission_type === "hybrid" ? (
            <Field label="Provision (%)" error={fe("commission_rate")}>
              <input
                className="admin-m-inp"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={billing.commission_rate_percent}
                onChange={(e) =>
                  setBilling((s) => ({ ...s, commission_rate_percent: e.target.value }))
                }
              />
            </Field>
          ) : null}
          {billing.commission_type === "fixed" ? (
            <Field label="Fixbetrag (EUR)" error={fe("commission_fixed_eur")}>
              <input
                className="admin-m-inp"
                type="number"
                min={0}
                step={0.01}
                value={billing.commission_fixed_eur}
                onChange={(e) => setBilling((s) => ({ ...s, commission_fixed_eur: e.target.value }))}
              />
            </Field>
          ) : null}
          {billing.commission_type === "hybrid" ? (
            <Field label="Mindestprovision (EUR)" error={fe("min_commission_eur")}>
              <input
                className="admin-m-inp"
                type="number"
                min={0}
                step={0.01}
                value={billing.min_commission_eur}
                onChange={(e) => setBilling((s) => ({ ...s, min_commission_eur: e.target.value }))}
              />
            </Field>
          ) : null}
          <Field label="Auszahlung erlaubt">
            <select
              className="admin-m-inp"
              value={billing.payout_allowed ? "1" : "0"}
              onChange={(e) => setBilling((s) => ({ ...s, payout_allowed: e.target.value === "1" }))}
            >
              <option value="1">Ja</option>
              <option value="0">Nein</option>
            </select>
          </Field>
          <Field label="Rechnungsempfänger (Name)" error={fe("billing_name")}>
            <input
              className="admin-m-inp"
              value={billing.billing_name}
              onChange={(e) => setBilling((s) => ({ ...s, billing_name: e.target.value }))}
            />
          </Field>
          <Field label="Rechnungsadresse Zeile 1" error={fe("billing_address_line1")}>
            <input
              className="admin-m-inp"
              value={billing.billing_address_line1}
              onChange={(e) => setBilling((s) => ({ ...s, billing_address_line1: e.target.value }))}
            />
          </Field>
          <Field label="PLZ / Ort" error={fe("billing_postal_code")}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="admin-m-inp"
                style={{ maxWidth: 100 }}
                value={billing.billing_postal_code}
                onChange={(e) => setBilling((s) => ({ ...s, billing_postal_code: e.target.value }))}
              />
              <input
                className="admin-m-inp"
                value={billing.billing_city}
                onChange={(e) => setBilling((s) => ({ ...s, billing_city: e.target.value }))}
              />
            </div>
          </Field>
          <Field label="Abrechnungs-E-Mail" error={fe("billing_account_email")}>
            <input
              className="admin-m-inp"
              type="email"
              value={billing.billing_account_email}
              onChange={(e) => setBilling((s) => ({ ...s, billing_account_email: e.target.value }))}
            />
          </Field>
          <Field label="Abrechnungsintervall" error={fe("billing_settlement_interval")}>
            <select
              className="admin-m-inp"
              value={billing.billing_settlement_interval}
              onChange={(e) => setBilling((s) => ({ ...s, billing_settlement_interval: e.target.value }))}
            >
              <option value="weekly">Wöchentlich</option>
              <option value="biweekly">Zweiwöchentlich</option>
              <option value="monthly">Monatlich</option>
              <option value="custom">Individuell</option>
            </select>
          </Field>
          <Field label="Zahlungsziel (Tage)" error={fe("billing_payment_terms_days")}>
            <input
              className="admin-m-inp"
              type="number"
              min={0}
              value={billing.billing_payment_terms_days}
              onChange={(e) =>
                setBilling((s) => ({ ...s, billing_payment_terms_days: e.target.value }))
              }
            />
          </Field>
          {c.company_kind === "taxi" ? (
            <Field label="Partner-IK" error={fe("partner_ik_number")}>
              <input
                className="admin-m-inp"
                value={billing.partner_ik_number}
                onChange={(e) => setBilling((s) => ({ ...s, partner_ik_number: e.target.value }))}
              />
            </Field>
          ) : null}
        </div>
        <AdminOnboardingBlockFooter
          type="button"
          label="Provision/Abrechnung speichern"
          busy={busy === "billing"}
          onClick={() => {
            const body = {
              billing_name: billing.billing_name,
              billing_address_line1: billing.billing_address_line1,
              billing_address_line2: billing.billing_address_line2,
              billing_postal_code: billing.billing_postal_code,
              billing_city: billing.billing_city,
              billing_country: billing.billing_country,
              commission_type: billing.commission_type,
              commission_rate: commissionRateFromPercent(billing.commission_rate_percent),
              commission_fixed_eur: Number(billing.commission_fixed_eur) || 0,
              min_commission_eur:
                billing.min_commission_eur === "" || billing.min_commission_eur == null
                  ? null
                  : Number(billing.min_commission_eur),
              payout_allowed: billing.payout_allowed,
              billing_account_email: billing.billing_account_email,
              billing_settlement_interval: billing.billing_settlement_interval,
              billing_payment_terms_days: Number(billing.billing_payment_terms_days) || 0,
              partner_ik_number: billing.partner_ik_number,
            };
            return saveSection("billing", body, () => {
              const err = {};
              const pct = Number(billing.commission_rate_percent);
              if (
                (billing.commission_type === "percentage" || billing.commission_type === "hybrid") &&
                (pct < 0 || pct > 100)
              ) {
                err.commission_rate = "0–100 %";
              }
              if (!isValidEmailOptional(billing.billing_account_email)) {
                err.billing_account_email = "Ungültige E-Mail";
              }
              return err;
            });
          }}
        />
      </section>

      <section className="admin-section-block admin-onb-block">
        <div className="admin-m-card__h">
          <span className="admin-panel-card__title" style={{ margin: 0 }}>
            5. Bankdaten
          </span>
        </div>
        <div className="admin-mandate-grid admin-mandate-grid--dense">
          <Field label="IBAN" error={fe("bank_iban")}>
            <input
              className="admin-m-inp"
              value={bank.bank_iban}
              onChange={(e) => setBank((s) => ({ ...s, bank_iban: e.target.value }))}
              autoComplete="off"
            />
          </Field>
          <Field label="BIC" error={fe("bank_bic")}>
            <input
              className="admin-m-inp"
              value={bank.bank_bic}
              onChange={(e) => setBank((s) => ({ ...s, bank_bic: e.target.value }))}
            />
          </Field>
        </div>
        <AdminOnboardingBlockFooter
          type="button"
          label="Bankdaten speichern"
          busy={busy === "bank"}
          onClick={() =>
            saveSection("bank", bank, () => {
              const err = {};
              if (!isValidIbanOptional(bank.bank_iban)) err.bank_iban = "Ungültige IBAN";
              return err;
            })
          }
        />
      </section>

      <section className="admin-section-block admin-onb-block">
        <div className="admin-m-card__h">
          <span className="admin-panel-card__title" style={{ margin: 0 }}>
            6. Admin-Notiz
          </span>
        </div>
        <Field label="Interne Notiz (Plattform)" error={fe("business_notes")}>
          <textarea
            className="admin-m-inp"
            rows={4}
            value={notes.business_notes}
            onChange={(e) => setNotes((s) => ({ ...s, business_notes: e.target.value }))}
          />
        </Field>
        <AdminOnboardingBlockFooter
          type="button"
          label="Admin-Notiz speichern"
          busy={busy === "notes"}
          onClick={() => saveSection("notes", notes)}
        />
      </section>
    </>
  );
}
