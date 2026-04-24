import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const PENDING_LIST = `${API_BASE}/admin/company-registration-requests?pending=1`;
const ALL_LIST = `${API_BASE}/admin/company-registration-requests`;

function detailUrl(id) {
  return `${API_BASE}/admin/company-registration-requests/${encodeURIComponent(id)}`;
}

function messagesUrl(id) {
  return `${API_BASE}/admin/company-registration-requests/${encodeURIComponent(id)}/messages`;
}

function approveUrl(id) {
  return `${API_BASE}/admin/company-registration-requests/${encodeURIComponent(id)}/approve`;
}

function downloadDocUrl(requestId, docId, opts = {}) {
  const base = `${API_BASE}/admin/company-registration-requests/${encodeURIComponent(requestId)}/documents/${encodeURIComponent(docId)}/download`;
  if (opts?.inline) return `${base}?inline=1`;
  return base;
}

const PARTNER_TYPE_DE = {
  taxi: "Taxi / Mietwagen",
  hotel: "Hotel",
  insurance: "Krankenkasse / Versicherung",
  medical: "Medizinische Fahrt",
  care: "Pflege / Betreuung",
  business: "Unternehmen",
  voucher_partner: "Gutscheinpartner",
  other: "Sonstiges",
};

const DOC_CAT_DE = {
  general: "Allgemein",
  gewerbe: "Gewerbenachweis",
  insurance: "Versicherung",
  concession: "Konzession",
  identity: "Identität / Ausweis",
  other: "Sonstiges",
};

const REG_STATUS = [
  { value: "open", label: "Eingereicht" },
  { value: "in_review", label: "In Prüfung" },
  { value: "documents_required", label: "Dokumente erforderlich" },
  { value: "approved", label: "Freigegeben" },
  { value: "rejected", label: "Abgelehnt" },
  { value: "blocked", label: "Gesperrt" },
];

const REG_STATUS_DE = Object.fromEntries(REG_STATUS.map((o) => [o.value, o.label]));

const REQUEST_VER_DE = {
  pending: "Ausstehend",
  in_review: "In Prüfung",
  verified: "Verifiziert",
  rejected: "Abgelehnt",
};

const REQUEST_COMP_DE = {
  pending: "Ausstehend",
  complete: "Vollständig",
  missing_documents: "Dokumente fehlen",
  rejected: "Abgelehnt",
};

const REQUEST_CONT_DE = {
  inactive: "Inaktiv",
  pending: "Ausstehend",
  active: "Aktiv",
  suspended: "Ausgesetzt",
  terminated: "Beendet",
};

const COMPANY_VER_DE = {
  pending: "Ausstehend",
  in_review: "In Prüfung",
  verified: "Verifiziert",
  rejected: "Abgelehnt",
};

const COMPANY_COMP_DE = {
  pending: "Ausstehend",
  in_review: "In Prüfung",
  compliant: "Konform",
  non_compliant: "Nicht konform",
  complete: "Vollständig",
};

const COMPANY_CONT_DE = {
  inactive: "Inaktiv",
  pending: "Ausstehend",
  active: "Aktiv",
  suspended: "Ausgesetzt",
  terminated: "Beendet",
};

function requestVerDe(v) {
  return REQUEST_VER_DE[v] || v || "—";
}
function requestCompDe(v) {
  return REQUEST_COMP_DE[v] || v || "—";
}
function requestContDe(v) {
  return REQUEST_CONT_DE[v] || v || "—";
}
function companyVerDe(v) {
  return COMPANY_VER_DE[v] || v || "—";
}
function companyCompDe(v) {
  return COMPANY_COMP_DE[v] || v || "—";
}
function companyContDe(v) {
  return COMPANY_CONT_DE[v] || v || "—";
}

/** Lesbare Kurz-Zusammenfassung des Bearbeitungsstands (nur Copy). */
function registrationStatusHeadline(req) {
  const s = req?.registrationStatus;
  if (s === "open") return "Die Bewerbung ist eingegangen — bitte Unterlagen sichten und den Bearbeitungsstand setzen.";
  if (s === "in_review") return "Die Bewerbung wird aktuell von der Plattform geprüft.";
  if (s === "documents_required") return "Es werden noch Unterlagen oder eine Rückmeldung vom Bewerber erwartet.";
  if (s === "approved") {
    return req?.linkedCompanyId
      ? "Die Bewerbung ist freigegeben; der Mandant ist angelegt."
      : "Als freigegeben markiert — Mandanten-Anlage prüfen.";
  }
  if (s === "rejected") return "Die Bewerbung wurde abgelehnt.";
  if (s === "blocked") return "Die Bewerbung ist gesperrt — Bitte intern klären.";
  return "";
}

/** Typische Nachweis-Kategorien nur zur Orientierung (UX-Checkliste, keine neue Logik). */
const EXPECTED_DOC_ROWS_DEFAULT = [
  { category: "general", hint: "Allgemeine Nachweise" },
  { category: "identity", hint: "Identität / Legitimation" },
  { category: "gewerbe", hint: "Gewerbenachweis" },
];

const EXPECTED_DOC_ROWS_BY_PARTNER = {
  taxi: [
    { category: "gewerbe", hint: "Gewerbeanmeldung / Gewerbenachweis" },
    { category: "concession", hint: "Konzession / Taxenzulassung" },
    { category: "insurance", hint: "Betriebs- bzw. Kfz-Versicherung (falls erforderlich)" },
    { category: "identity", hint: "Identität / Leitung (falls angefordert)" },
  ],
  hotel: EXPECTED_DOC_ROWS_DEFAULT,
  insurance: [
    { category: "general", hint: "Träger-Nachweise" },
    { category: "insurance", hint: "Versicherungsbestätigungen" },
    { category: "identity", hint: "Identität / Vertretung" },
  ],
  medical: EXPECTED_DOC_ROWS_DEFAULT,
  care: EXPECTED_DOC_ROWS_DEFAULT,
  business: EXPECTED_DOC_ROWS_DEFAULT,
  voucher_partner: EXPECTED_DOC_ROWS_DEFAULT,
  other: EXPECTED_DOC_ROWS_DEFAULT,
};

function expectedDocRowsForPartnerType(partnerType) {
  return EXPECTED_DOC_ROWS_BY_PARTNER[partnerType] || EXPECTED_DOC_ROWS_DEFAULT;
}

function hasUploadedCategory(documents, category) {
  return documents.some((d) => String(d.category || "") === category);
}

function docUploaderLabel(d) {
  const t = String(d.uploadedByActorType || "").toLowerCase();
  if (t === "admin") return "Plattform (Admin)";
  if (t === "partner") return "Bewerber (Status-Link)";
  return String(d.uploadedByActorLabel || "").trim() || "Unbekannt";
}

function missingExpectedCategories(partnerType, documents) {
  return expectedDocRowsForPartnerType(partnerType).filter((row) => !hasUploadedCategory(documents, row.category));
}

function timelineActorLane(ev) {
  const t = String(ev.actorType || "").toLowerCase();
  if (t === "admin") return "admin";
  if (t === "partner") return "applicant";
  return "other";
}

function eventTypeReadable(eventType) {
  const s = String(eventType || "").trim();
  if (!s) return "";
  return s
    .replace(/^admin\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timelineEventSubtitle(ev) {
  const et = String(ev.eventType || "").toLowerCase();
  if (et === "message") {
    return timelineActorLane(ev) === "applicant"
      ? "Nachricht · Bewerber (Status-Link)"
      : "Nachricht · Plattform";
  }
  return eventTypeReadable(ev.eventType);
}

/**
 * Reine Operatoren-Hinweise (keine neue Geschäftslogik): wo der Admin als Nächstes schauen soll.
 */
function deriveNextAdminStep(request, linked) {
  const rs = request?.registrationStatus;
  if (rs === "rejected") {
    return "Anfrage abgeschlossen (abgelehnt). Kein Mandant — kein weiterer Onboarding-Schritt in dieser Queue.";
  }
  if (rs === "blocked") {
    return "Anfrage gesperrt. Ursache intern klären; Freigabe ist hier nicht vorgesehen.";
  }
  if (!linked?.id) {
    if (rs === "documents_required") {
      return "Auf Nachreichung warten, dann erneut prüfen; ggf. Rückfrage per E‑Mail senden.";
    }
    if (rs === "open") {
      return "Eingang: Unterlagen prüfen, Bearbeitungs-Status anpassen, ggf. Rückfrage.";
    }
    if (rs === "in_review") {
      return "Prüfung: Nachweise bewerten — bei Vollständigkeit freigeben, sonst Dokumente anfordern.";
    }
    if (rs === "approved" && !request?.linkedCompanyId) {
      return "Status „freigegeben“ ohne Mandant — bitte Freigabe erneut anstoßen oder technisch prüfen.";
    }
    return "Anfrage in dieser Queue bearbeiten; Ziel: prüfbare Vollständigkeit, dann Freigabe.";
  }
  if (linked.is_blocked) {
    return "Mandant ist gesperrt — in der Mandantenverwaltung Sperrgrund prüfen und ggf. aufheben.";
  }
  if (!String(linked.bank_iban || "").trim()) {
    return "Mandant existiert: Auszahlungs-IBAN in der Mandantenverwaltung erfassen (Zahlungsverkehr / Abrechnung).";
  }
  if (linked.partner_panel_profile_locked) {
    return "Mandant aktiv: Partner soll Basisangaben im Partner-Panel vervollständigen (Stammdaten noch durch Self-Service).";
  }
  if (linked.is_active === false) {
    return "Mandant ist deaktiviert — bei Bedarf in der Mandantenverwaltung aktiv schalten.";
  }
  if (linked.contract_status && linked.contract_status !== "active") {
    return "Mandant: Vertrags-Status prüfen (nicht „aktiv“) — in der Mandantenverwaltung.";
  }
  return "Aktueller Schritt: laufender Betrieb; Detailpflege in der Mandantenverwaltung bei Bedarf.";
}

const RUECKFRAGE_TEMPLATE = `Guten Tag,

wir prüfen Ihre Partner-Registrierung und benötigen noch folgende Angaben bzw. Unterlagen:

• 

Vielen Dank
`;

const AENDERUNG_TEMPLATE = `Guten Tag,

für Ihre Onroda-Partner-Registrierung benötigen wir bitte folgende Anpassung bzw. nachgereichte Dokumente:

• 

Vielen Dank
`;

function fmt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function fmtFileSize(n) {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".0", "")} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".0", "")} MB`;
}

function fieldLine(label, value) {
  return (
    <div style={{ marginBottom: 8, lineHeight: 1.45 }}>
      <span className="admin-table-sub" style={{ display: "block", fontSize: 11, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ color: "var(--onroda-text-dark, #0f172a)" }}>{value ?? "—"}</span>
    </div>
  );
}

export default function CompanyRegistrationQueuePage({ onOpenCompany }) {
  const [listMode, setListMode] = useState("queue");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState("");
  const [regStatus, setRegStatus] = useState("open");
  const [adminNote, setAdminNote] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [mailHint, setMailHint] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr("");
    const url = listMode === "queue" ? PENDING_LIST : ALL_LIST;
    try {
      const res = await fetch(url, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr(typeof data?.error === "string" ? data.error : "Liste konnte nicht geladen werden.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setErr("Netzwerkfehler.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [listMode]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailErr("");
    setMailHint("");
    try {
      const res = await fetch(detailUrl(id), { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetail(null);
        setDetailErr(typeof data?.error === "string" ? data.error : "Detail nicht verfügbar.");
        return;
      }
      const req = data.request;
      if (!req) {
        setDetail(null);
        setDetailErr("Ungültige API-Antwort.");
        return;
      }
      setDetail({
        request: req,
        documents: Array.isArray(data.documents) ? data.documents : [],
        timeline: Array.isArray(data.timeline) ? data.timeline : [],
        linkedCompany: data.linkedCompany && typeof data.linkedCompany === "object" ? data.linkedCompany : null,
      });
      setRegStatus(String(req.registrationStatus ?? "open"));
      setAdminNote(String(req.adminNote ?? ""));
      setReplyText("");
      setRejectReason("");
    } catch {
      setDetail(null);
      setDetailErr("Netzwerkfehler.");
    }
  }, []);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  function docMimeAllowsPreview(mime) {
    const m = String(mime || "").toLowerCase();
    if (m === "application/pdf") return true;
    return m.startsWith("image/");
  }

  async function openRegistrationDocument(requestId, docId, mode) {
    try {
      const inline = mode === "preview";
      const res = await fetch(downloadDocUrl(requestId, docId, { inline }), { headers: adminApiHeaders() });
      if (!res.ok) {
        window.alert("Datei konnte nicht geladen werden (nur Admin/Service, gültiger Bearer).");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch {
      window.alert("Datei konnte nicht geöffnet werden.");
    }
  }

  async function patchRequest(body) {
    if (!selectedId) return { ok: false };
    setSaveBusy(true);
    setDetailErr("");
    try {
      const res = await fetch(detailUrl(selectedId), {
        method: "PATCH",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const hint = typeof data?.hint === "string" ? ` ${data.hint}` : "";
        setDetailErr(
          (typeof data?.message === "string" && data.message) ||
            (typeof data?.error === "string" && data.error) ||
            "Aktion fehlgeschlagen." + hint,
        );
        return { ok: false, data };
      }
      await loadList();
      await loadDetail(selectedId);
      return { ok: true, data };
    } catch {
      setDetailErr("Netzwerkfehler.");
      return { ok: false };
    } finally {
      setSaveBusy(false);
    }
  }

  async function saveInternalNoteOnly() {
    await patchRequest({ adminNote: adminNote.trim() });
  }

  async function saveStatus() {
    await patchRequest({ status: regStatus, adminNote: adminNote.trim() });
  }

  async function sendApplicantMessage() {
    if (!selectedId || !replyText.trim()) return;
    setReplyBusy(true);
    setDetailErr("");
    setMailHint("");
    try {
      const res = await fetch(messagesUrl(selectedId), {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetailErr(data?.error === "message_required" ? "Nachricht fehlt." : "Senden fehlgeschlagen.");
        return;
      }
      if (data.mail?.sent) {
        setMailHint("E-Mail wurde an die Bewerber-Adresse versendet (sofern SMTP konfiguriert).");
      } else {
        setMailHint(
          "Nachricht im Verlauf gespeichert. E-Mail-Versand: prüfen Sie PARTNER_REGISTRATION_SMTP_URL / MAIL_FROM auf dem API-Server.",
        );
      }
      setReplyText("");
      await loadDetail(selectedId);
      await loadList();
    } catch {
      setDetailErr("Netzwerkfehler.");
    } finally {
      setReplyBusy(false);
    }
  }

  async function requestDocumentsChange() {
    if (!selectedId) return;
    setActionBusy(true);
    setDetailErr("");
    setMailHint("");
    try {
      if (replyText.trim()) {
        setReplyBusy(true);
        const r = await fetch(messagesUrl(selectedId), {
          method: "POST",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ message: replyText.trim() }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d?.ok) {
          setDetailErr("Nachricht konnte nicht gesendet werden.");
          return;
        }
        if (d.mail?.sent) {
          setMailHint("E-Mail an Bewerber versendet (SMTP vorausgesetzt).");
        }
        setReplyText("");
        setReplyBusy(false);
      }
      await patchRequest({ status: "documents_required", adminNote: adminNote.trim() });
    } finally {
      setActionBusy(false);
      setReplyBusy(false);
    }
  }

  async function approveRegistration() {
    if (!selectedId) return;
    setActionBusy(true);
    setDetailErr("");
    try {
      const res = await fetch(approveUrl(selectedId), {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const h = data?.hint ? String(data.hint) : "";
        setDetailErr(
          h || (typeof data?.error === "string" ? data.error : "Freigabe nicht möglich (Voraussetzungen prüfen)."),
        );
        return;
      }
      await loadList();
      await loadDetail(selectedId);
    } catch {
      setDetailErr("Netzwerkfehler.");
    } finally {
      setActionBusy(false);
    }
  }

  async function rejectRegistration() {
    if (!selectedId) return;
    if (!window.confirm("Anfrage wirklich ablehnen? Eine Begründung per E-Mail wird mitgesendet, sofern konfiguriert.")) {
      return;
    }
    const reason = rejectReason.trim() || "Ihre Anfrage entsprach nicht unseren Anforderungen.";
    setActionBusy(true);
    setDetailErr("");
    try {
      const res = await fetch(detailUrl(selectedId), {
        method: "PATCH",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "rejected",
          adminNote: adminNote.trim(),
          rejectionReasonToApplicant: reason,
          notifyApplicantOnReject: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDetailErr(typeof data?.error === "string" ? data.error : "Ablehnen fehlgeschlagen.");
        return;
      }
      await loadList();
      await loadDetail(selectedId);
    } catch {
      setDetailErr("Netzwerkfehler.");
    } finally {
      setActionBusy(false);
    }
  }

  const req = detail?.request;
  const linkedCo = detail?.linkedCompany;
  const locked = Boolean(req?.linkedCompanyId) || String(req?.registrationStatus) === "approved";
  const partnerLabel = PARTNER_TYPE_DE[req?.partnerType] || req?.partnerType || "—";
  const notes = (req?.notes && String(req.notes).trim()) || "";
  const missingDocNote = (req?.missingDocumentsNote && String(req.missingDocumentsNote).trim()) || "";

  return (
    <div className="admin-page" style={{ padding: "20px 24px", maxWidth: 1280 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.35rem" }}>Registrierungsanfragen (Homepage-Onboarding)</h1>
      <p style={{ margin: "0 0 16px", color: "var(--onroda-text-muted, #64748b)", maxWidth: 800, lineHeight: 1.5 }}>
        <strong>Eigener Ablauf</strong> — nicht mit „Partner-Anfragen“ (Support-Threads) oder dem Partner-Panel verwechseln.
        Bewerber:innen kommen von der <strong>öffentlichen Registrierung</strong> (<code>panel-auth/registration-request</code>).
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <label className="admin-table-sub" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Liste
          <select
            className="admin-input"
            value={listMode}
            onChange={(e) => {
              setListMode(e.target.value);
              setSelectedId(null);
            }}
            style={{ minWidth: 220 }}
          >
            <option value="queue">Offene Warteschlange</option>
            <option value="all">Alle Anfragen</option>
          </select>
        </label>
        <button type="button" className="admin-btn-primary" onClick={() => void loadList()} disabled={loading}>
          {loading ? "Lade…" : "Aktualisieren"}
        </button>
      </div>
      {err ? <div className="admin-error-banner">{err}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ border: "1px solid var(--onroda-border-subtle, #e2e8f0)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", background: "var(--onroda-surface-2, #f8fafc)", fontWeight: 600 }}>Anfragen</div>
          <div style={{ maxHeight: 640, overflow: "auto" }}>
            {items.length === 0 && !loading ? (
              <p style={{ padding: 12, margin: 0, color: "#64748b" }}>Keine Einträge.</p>
            ) : (
              items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: "1px solid #eee",
                    background: r.id === selectedId ? "#e0f2fe" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#64748b" }}>Ref. {r.id}</div>
                  <div style={{ fontWeight: 600 }}>{r.companyName || "—"}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    {REG_STATUS_DE[r.registrationStatus] || r.registrationStatus} · {fmt(r.createdAt)}
                  </div>
                  {r.linkedCompanyId ? (
                    <div style={{ fontSize: 11, color: "#0369a1", marginTop: 4 }}>
                      Mandant <code style={{ fontSize: 11 }}>{r.linkedCompanyId}</code>
                    </div>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
        <div
          style={{
            border: "1px solid var(--onroda-border-subtle, #e2e8f0)",
            borderRadius: 8,
            padding: 16,
            minWidth: 0,
          }}
        >
          {!selectedId ? (
            <p style={{ color: "#64748b", margin: 0 }}>Links eine Anfrage wählen.</p>
          ) : detailErr && !req ? (
            <div className="admin-error-banner">{detailErr}</div>
          ) : !req ? (
            <p style={{ color: "#64748b", margin: 0 }}>Lade …</p>
          ) : (
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem" }}>Ticket · {req.companyName}</h2>
              <p className="admin-table-sub" style={{ margin: "0 0 12px" }}>
                Referenz-ID: <code>{req.id}</code>
                {req.linkedCompanyId ? (
                  <>
                    {" "}
                    · Mandant: <code>{req.linkedCompanyId}</code>
                  </>
                ) : null}
              </p>
              {detailErr ? <div className="admin-error-banner" style={{ marginBottom: 10 }}>{detailErr}</div> : null}
              {mailHint ? <div className="admin-info-banner" style={{ marginBottom: 10 }}>{mailHint}</div> : null}

              {registrationStatusHeadline(req) ? (
                <p
                  style={{
                    margin: "0 0 14px",
                    lineHeight: 1.5,
                    color: "var(--onroda-text-dark, #0f172a)",
                    fontSize: 15,
                  }}
                >
                  {registrationStatusHeadline(req)}
                </p>
              ) : null}

              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid #bae6fd",
                  background: "#f0f9ff",
                }}
              >
                <div className="admin-table-sub" style={{ marginBottom: 6, fontWeight: 800 }}>
                  Nächster Schritt
                </div>
                <p style={{ margin: 0, lineHeight: 1.55, color: "var(--onroda-text-dark, #0f172a)" }}>
                  {deriveNextAdminStep(req, linkedCo)}
                </p>
              </div>

              {req.linkedCompanyId ? (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "1px solid #a7f3d0",
                    background: "#ecfdf5",
                  }}
                >
                  <div className="admin-table-sub" style={{ marginBottom: 8, fontWeight: 800 }}>
                    Mandant nach Freigabe
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.45 }}>
                    Mandanten-ID: <code>{req.linkedCompanyId}</code>
                    {linkedCo?.name ? (
                      <>
                        {" "}
                        · <strong>{linkedCo.name}</strong>
                      </>
                    ) : null}
                  </p>
                  {linkedCo?.id ? (
                    <>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                        <span className="admin-dashboard__badge" title="Identität & Daten">
                          Identitätsprüfung: {companyVerDe(linkedCo.verification_status)}
                        </span>
                        <span className="admin-dashboard__badge" title="Nachweise">
                          Nachweise: {companyCompDe(linkedCo.compliance_status)}
                        </span>
                        <span className="admin-dashboard__badge" title="Vertrag">
                          Vertrag: {companyContDe(linkedCo.contract_status)}
                        </span>
                        <span className="admin-dashboard__badge" title="Betrieb">
                          {linkedCo.is_blocked ? "Gesperrt" : linkedCo.is_active ? "Aktiv im System" : "Inaktiv"}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: "var(--onroda-text-dark, #0f172a)",
                          marginBottom: 10,
                        }}
                      >
                        <strong>IBAN für Auszahlungen</strong> —{" "}
                        {String(linkedCo.bank_iban || "").trim() ? (
                          <>
                            <span style={{ color: "#15803d", fontWeight: 600 }}>Status: hinterlegt</span>
                            <br />
                            <code style={{ fontSize: 12, display: "inline-block", marginTop: 4 }}>{linkedCo.bank_iban}</code>
                          </>
                        ) : (
                          <span style={{ color: "#b45309", fontWeight: 600 }}>Status: noch offen — in der Mandantenverwaltung eintragen</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="admin-table-sub" style={{ margin: "0 0 8px" }}>
                      Vollständige Mandantendaten erscheinen, sobald die Seite die Detaildaten geladen hat. Mandanten-ID
                      oben in der Regel ausreichend, um in der Verwaltung zu springen.
                    </p>
                  )}
                  {onOpenCompany ? (
                    <button type="button" className="admin-btn-primary" onClick={() => onOpenCompany(req.linkedCompanyId)}>
                      Firma öffnen
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--onroda-border-subtle, #e2e8f0)",
                  background: "var(--onroda-surface-2, #f8fafc)",
                }}
              >
                <div className="admin-table-sub" style={{ marginBottom: 8, fontWeight: 700 }}>
                  Prüffelder & Stände (nur Anfrage)
                </div>
                <p className="admin-table-sub" style={{ margin: "0 0 8px", lineHeight: 1.45 }}>
                  Kurz: Bearbeitung der <strong>öffentlichen Bewerbung</strong> (nicht der spätere laufende Betrieb im
                  Mandanten).
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  <span className="admin-dashboard__badge" title="Wohin die Bewerbung im Prozess steht">
                    Bearbeitung: {REG_STATUS_DE[req.registrationStatus] || req.registrationStatus}
                  </span>
                  <span className="admin-dashboard__badge" title="Sind die vorgelegten Daten plausibel geprüft?">
                    Identität / Daten: {requestVerDe(req.verificationStatus)}
                  </span>
                  <span className="admin-dashboard__badge" title="Sind die geforderten Nachweise da?">
                    Nachweisprüfung: {requestCompDe(req.complianceStatus)}
                  </span>
                  <span className="admin-dashboard__badge" title="Vertrags-Setup in dieser Phase">
                    Vertrag (Vorphase): {requestContDe(req.contractStatus)}
                  </span>
                </div>
                {!req.linkedCompanyId ? (
                  <p className="admin-table-sub" style={{ margin: 0, lineHeight: 1.45 }}>
                    <strong>Kein Mandant:</strong> nach erfolgreicher Freigabe erscheint oben der grüne Block „Mandant nach
                    Freigabe“ mit Auszahlungs-IBAN.
                  </p>
                ) : null}
              </div>

              <h3 style={{ fontSize: "0.8rem", margin: "16px 0 8px", fontWeight: 800 }}>
                Stammdaten
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "4px 20px",
                  marginBottom: 12,
                }}
              >
                {fieldLine("Ansprechpartner", `${req.contactFirstName || ""} ${req.contactLastName || ""}`.trim())}
                {fieldLine("E-Mail (Antworten)", req.email)}
                {fieldLine("Telefon", req.phone || "—")}
                {fieldLine("Partner-Art", partnerLabel)}
                {fieldLine("Rechtsform", req.legalForm || "—")}
                {fieldLine("Eingereicht am", fmt(req.createdAt))}
                {fieldLine("Wunschregion", req.desiredRegion || "—")}
                {fieldLine("Gutscheine", req.usesVouchers ? "Ja" : "Nein")}
              </div>
              {fieldLine("Adresse", [req.addressLine1, req.addressLine2].filter(Boolean).join(", ") || "—")}
              {fieldLine("Ort", [req.postalCode, req.city, req.country].filter(Boolean).join(" ") || "—")}
              {fieldLine("Steuern", `St-Id: ${req.taxId || "—"} · USt-Id: ${req.vatId || "—"}`)}
              {fieldLine("Konzession / Zulassung", req.concessionNumber || "—")}

              <h3 style={{ fontSize: "0.8rem", margin: "16px 0 8px", fontWeight: 800 }}>
                Nachricht / Bemerkung (Formular)
              </h3>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  padding: 12,
                  background: "var(--onroda-surface-2, #f8fafc)",
                  borderRadius: 8,
                  border: "1px solid var(--onroda-border-subtle, #e2e8f0)",
                  minHeight: 48,
                }}
              >
                {notes || "—"}
              </div>
              {missingDocNote ? (
                <p className="admin-table-sub" style={{ marginTop: 8 }}>
                  Hinweis fehlender Dokumente: {missingDocNote}
                </p>
              ) : null}

              <h3 style={{ fontSize: "0.8rem", margin: "16px 0 8px", fontWeight: 800 }}>
                Status (Verwaltung)
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
                  <span className="admin-table-sub">Bearbeitungs-Status</span>
                  <select
                    className="admin-input"
                    value={regStatus}
                    onChange={(e) => setRegStatus(e.target.value)}
                    disabled={locked}
                  >
                    {REG_STATUS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="admin-btn-primary" onClick={() => void saveStatus()} disabled={saveBusy || locked}>
                  {saveBusy ? "Speichere…" : "Status speichern"}
                </button>
              </div>
              <label style={{ display: "block", marginTop: 10 }}>
                <span className="admin-table-sub">Interne Notiz (nicht an Bewerber)</span>
                <textarea
                  className="admin-input"
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  style={{ width: "100%" }}
                />
              </label>
              <button type="button" className="admin-btn-refresh" onClick={() => void saveInternalNoteOnly()} disabled={saveBusy || locked} style={{ marginTop: 6 }}>
                {saveBusy ? "…" : "Nur interne Notiz speichern"}
              </button>

              <h3 style={{ fontSize: "0.8rem", margin: "20px 0 8px", fontWeight: 800 }}>
                Antwort an Bewerber (E-Mail + Verlauf)
              </h3>
              <p className="admin-table-sub" style={{ marginBottom: 8, lineHeight: 1.45 }}>
                Wird an <strong>{req.email}</strong> gesendet (falls SMTP <code>PARTNER_REGISTRATION_SMTP_URL</code> gesetzt) und
                als Admin-Nachricht im Verlauf abgelegt.
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="admin-btn-refresh"
                  disabled={locked}
                  onClick={() => setReplyText((t) => (t ? t : RUECKFRAGE_TEMPLATE))}
                >
                  Text „Rückfrage“ einfügen
                </button>
                <button
                  type="button"
                  className="admin-btn-refresh"
                  disabled={locked}
                  onClick={() => setReplyText((t) => (t ? t : AENDERUNG_TEMPLATE))}
                >
                  Text „Änderung anfordern“
                </button>
              </div>
              <textarea
                className="admin-input"
                rows={6}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                style={{ width: "100%" }}
                placeholder="Antwort an die E-Mail des Bewerbers…"
                disabled={locked}
              />
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="admin-btn-primary"
                  onClick={() => void sendApplicantMessage()}
                  disabled={replyBusy || locked || !replyText.trim()}
                >
                  {replyBusy ? "Sende…" : "Antwort senden (E-Mail + Verlauf)"}
                </button>
              </div>

              <h3 style={{ fontSize: "0.8rem", margin: "20px 0 8px", fontWeight: 800 }}>
                Schnellaktionen
              </h3>
              <p className="admin-table-sub" style={{ marginBottom: 8 }}>
                Kein Support-Posteingang — nur Registrierungs-Queue.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className="admin-btn-refresh"
                  disabled={actionBusy || locked}
                  onClick={() => {
                    if (!replyText.trim()) {
                      setReplyText(RUECKFRAGE_TEMPLATE);
                    }
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Rückfrage (Text oben)
                </button>
                <button
                  type="button"
                  className="admin-btn-refresh"
                  disabled={actionBusy || locked}
                  onClick={() => void requestDocumentsChange()}
                >
                  Änderung / Dokumente anfordern
                </button>
                <button type="button" className="admin-btn-primary" disabled={actionBusy || locked} onClick={() => void approveRegistration()}>
                  {actionBusy ? "…" : "Freigeben (Mandant anlegen)"}
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <label>
                  <span className="admin-table-sub">Begründung für Absage (E-Mail an Bewerber)</span>
                  <textarea
                    className="admin-input"
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ width: "100%" }}
                    placeholder="Kurz begründen — wird in der Absage-E-Mail genutzt."
                    disabled={locked}
                  />
                </label>
                <button
                  type="button"
                  className="admin-btn-refresh"
                  style={{ color: "var(--onroda-red, #b91c1c)", borderColor: "var(--onroda-red, #b91c1c)" }}
                  disabled={actionBusy || locked}
                  onClick={() => void rejectRegistration()}
                >
                  Ablehnen
                </button>
              </div>

              <h3 style={{ fontSize: "0.8rem", margin: "20px 0 8px", fontWeight: 800 }}>
                Dokumente
              </h3>
              <p className="admin-table-sub" style={{ margin: "0 0 10px", lineHeight: 1.45 }}>
                <strong>Erwartete Nachweise</strong> (Orientierung für {partnerLabel}) — Abgleich mit hochgeladenen Dateien.
                Fehlt eine erwartete Kategorie, ist die Datei unter „Eingereichte Dateien“ noch nicht vorhanden oder anders
                benannt.
              </p>
              <ul
                style={{
                  listStyle: "none",
                  margin: "0 0 16px",
                  padding: 10,
                  border: "1px dashed var(--onroda-border-subtle, #cbd5e1)",
                  borderRadius: 8,
                }}
              >
                {expectedDocRowsForPartnerType(req?.partnerType).map((row) => {
                  const ok = hasUploadedCategory(detail.documents, row.category);
                  return (
                    <li
                      key={row.category + row.hint}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        marginBottom: 6,
                        fontSize: 13,
                        lineHeight: 1.4,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 800,
                          color: ok ? "#15803d" : "#b45309",
                          minWidth: 18,
                        }}
                        aria-hidden
                      >
                        {ok ? "✓" : "○"}
                      </span>
                      <span>
                        <strong>{DOC_CAT_DE[row.category] || row.category}</strong> — {row.hint}
                        {!ok ? <span className="admin-table-sub"> (noch keine Datei in dieser Kategorie)</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="admin-table-sub" style={{ marginBottom: 6, fontWeight: 700 }}>
                Eingereichte Dateien (gesichert über Admin-API)
              </div>
              <p className="admin-table-sub" style={{ margin: "0 0 10px", lineHeight: 1.45 }}>
                Öffnen/Herunterladen nur mit Admin-Bearer — keine öffentliche URL. Dateien vom Bewerber erscheinen nach Upload
                über den Status-Link; der Verlauf unten listet den Vorgang zusätzlich.
              </p>
              {detail.documents.length === 0 ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid #fed7aa",
                    background: "#fffbeb",
                    marginBottom: 8,
                  }}
                >
                  <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#9a3412" }}>Noch keine Datei in dieser Anfrage</p>
                  <p className="admin-table-sub" style={{ margin: 0, lineHeight: 1.5 }}>
                    Typisch noch offen (Orientierung):{" "}
                    <strong>
                      {missingExpectedCategories(req?.partnerType, detail.documents)
                        .map((row) => DOC_CAT_DE[row.category] || row.category)
                        .join(", ") || "—"}
                    </strong>
                    . Sobald der Bewerber im Status-Link nachreicht, erscheinen die Dateien hier — bitte Liste aktualisieren.
                  </p>
                </div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {detail.documents.map((d) => {
                    const canPreview = docMimeAllowsPreview(d.mimeType);
                    return (
                      <li
                        key={d.id}
                        style={{
                          marginBottom: 12,
                          padding: "10px 12px",
                          border: "1px solid var(--onroda-border-subtle, #e2e8f0)",
                          borderRadius: 8,
                          background: "#fff",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "var(--onroda-text-dark, #0f172a)", marginBottom: 4 }}>
                          {d.originalFileName || "—"}
                        </div>
                        <div className="admin-table-sub" style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 8 }}>
                          <strong>Kategorie:</strong> {DOC_CAT_DE[d.category] || d.category}
                          {" · "}
                          <strong>Upload:</strong> {fmt(d.createdAt)}
                          {" · "}
                          <strong>Größe:</strong> {fmtFileSize(d.fileSizeBytes)}
                          {" · "}
                          <strong>Quelle:</strong> {docUploaderLabel(d)}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button
                            type="button"
                            className="admin-btn-primary"
                            onClick={() =>
                              void openRegistrationDocument(
                                d.requestId || selectedId,
                                d.id,
                                canPreview ? "preview" : "download",
                              )
                            }
                          >
                            Öffnen
                          </button>
                          <button
                            type="button"
                            className="admin-btn-refresh"
                            onClick={() => void openRegistrationDocument(d.requestId || selectedId, d.id, "download")}
                          >
                            Herunterladen
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {detail.documents.length > 0 && missingExpectedCategories(req?.partnerType, detail.documents).length > 0 ? (
                <p className="admin-table-sub" style={{ marginTop: 10, lineHeight: 1.45 }}>
                  <strong>Hinweis:</strong> Für diese Partner-Art fehlen in der Checkliste oben noch Kategorien ohne Datei:{" "}
                  {missingExpectedCategories(req?.partnerType, detail.documents)
                    .map((row) => DOC_CAT_DE[row.category] || row.category)
                    .join(", ")}
                  .
                </p>
              ) : null}

              <h3 style={{ fontSize: "0.8rem", margin: "20px 0 8px", fontWeight: 800 }}>
                Verlauf
              </h3>
              <p className="admin-table-sub" style={{ margin: "0 0 8px" }}>
                Chronologisch. <strong>Blau = Plattform/Admin</strong>, <strong>teal = Bewerber</strong> (Self-Service
                EINREICHUNG) — bewusst getrennt vom allgemeinen Partner-Support.
              </p>
              <div style={{ maxHeight: 380, overflow: "auto", paddingLeft: 2 }}>
                {detail.timeline.length === 0 ? (
                  <p className="admin-table-sub">Noch keine Einträge. Sobald E-Mails und Aktionen laufen, erscheinen sie hier.</p>
                ) : (
                  detail.timeline
                    .slice()
                    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                    .map((ev, idx, arr) => {
                      const lane = timelineActorLane(ev);
                      const isAdmin = lane === "admin";
                      const isApplicant = lane === "applicant";
                      const lineColor = isAdmin ? "#7dd3fc" : isApplicant ? "#5eead4" : "#e2e8f0";
                      const borderColor = isAdmin ? "#0ea5e9" : isApplicant ? "#0d9488" : "#94a3b8";
                      const isPartnerMessage = String(ev.eventType || "").toLowerCase() === "message" && isApplicant;
                      const label = isAdmin
                        ? "Plattform (Admin/Operator)"
                        : isApplicant
                          ? isPartnerMessage
                            ? "Bewerber — Antwort (Status-Link)"
                            : "Bewerber (Einreichung)"
                          : (ev.actorLabel || "System") + (ev.actorType ? ` · ${ev.actorType}` : "");
                      return (
                        <div
                          key={ev.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "12px 1fr",
                            gap: 10,
                            marginBottom: 0,
                          }}
                        >
                          <div style={{ position: "relative", width: 12 }}>
                            <div
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: isAdmin ? "#0ea5e9" : isApplicant ? "#0d9488" : "#94a3b8",
                                marginTop: 4,
                                marginLeft: 1,
                              }}
                              aria-hidden
                            />
                            {idx < arr.length - 1 ? (
                              <div
                                style={{
                                  position: "absolute",
                                  left: 4,
                                  top: 16,
                                  bottom: -8,
                                  width: 2,
                                  background: lineColor,
                                }}
                                aria-hidden
                              />
                            ) : null}
                          </div>
                          <div
                            style={{
                              marginBottom: 12,
                              padding: "8px 10px",
                              border: `1px solid var(--onroda-border-subtle, #e2e8f0)`,
                              borderLeft: `4px solid ${borderColor}`,
                              background: isAdmin ? "#f0f9ff" : isApplicant ? "#f0fdfa" : "#fafafa",
                              borderRadius: 6,
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700, color: borderColor, marginBottom: 4 }}>{label}</div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>
                              {fmt(ev.createdAt)}
                              {timelineEventSubtitle(ev) ? ` · ${timelineEventSubtitle(ev)}` : ""}
                            </div>
                            {ev.message ? <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{ev.message}</div> : null}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
