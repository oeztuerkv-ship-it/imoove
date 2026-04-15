import { useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

const PARTNER_TYPES = [
  { value: "taxi", label: "Taxiunternehmen" },
  { value: "hotel", label: "Hotel" },
  { value: "insurance", label: "Krankenkasse" },
  { value: "medical", label: "Arztpraxis / Klinik" },
  { value: "care", label: "Pflegeheim / soziale Einrichtung" },
  { value: "business", label: "Firmenkunde / Geschäftskunde" },
  { value: "voucher_partner", label: "Gutscheinpartner" },
  { value: "other", label: "Sonstiger Partner" },
];

export default function LoginPage() {
  const { login, error } = usePanelAuth();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestOk, setRequestOk] = useState("");
  const [statusLookupEmail, setStatusLookupEmail] = useState("");
  const [statusLookupBusy, setStatusLookupBusy] = useState(false);
  const [statusLookupText, setStatusLookupText] = useState("");
  const [statusRequest, setStatusRequest] = useState(null);
  const [partnerMessage, setPartnerMessage] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [requestForm, setRequestForm] = useState({
    companyName: "",
    legalForm: "",
    partnerType: "taxi",
    usesVouchers: false,
    contactFirstName: "",
    contactLastName: "",
    email: "",
    phone: "",
    addressLine1: "",
    postalCode: "",
    city: "",
    country: "Deutschland",
    taxId: "",
    vatId: "",
    concessionNumber: "",
    desiredRegion: "",
    notes: "",
  });

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitRequest(e) {
    e.preventDefault();
    setRequestError("");
    setRequestOk("");
    setRequestSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/panel-auth/registration-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setRequestError(
          data?.error === "required_fields_missing"
            ? "Bitte alle Pflichtfelder ausfüllen."
            : data?.error === "partner_type_invalid"
              ? "Unternehmensart ist ungültig."
              : `Anfrage konnte nicht gesendet werden (HTTP ${res.status}).`,
        );
        return;
      }
      setRequestOk(
        `Anfrage eingegangen (ID: ${data.request?.id ?? "n/a"}). Status: ${data.request?.registrationStatus ?? "open"}.`,
      );
      setRequestForm((prev) => ({
        ...prev,
        notes: "",
      }));
    } finally {
      setRequestSubmitting(false);
    }
  }

  async function onLookupStatus(e) {
    e.preventDefault();
    setStatusLookupBusy(true);
    setStatusLookupText("");
    try {
      const res = await fetch(
        `${API_BASE}/panel-auth/registration-request-status?email=${encodeURIComponent(statusLookupEmail.trim())}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.request) {
        setStatusLookupText(
          data?.error === "not_found"
            ? "Keine Anfrage zu dieser E-Mail gefunden."
            : "Status konnte nicht geladen werden.",
        );
        return;
      }
      const req = data.request;
      setStatusRequest(req);
      setStatusLookupText(
        `Status: ${req.registrationStatus} · Verifizierung: ${req.verificationStatus} · Compliance: ${req.complianceStatus} · Vertrag: ${req.contractStatus}${req.missingDocumentsNote ? ` · Fehlende Unterlagen: ${req.missingDocumentsNote}` : ""}`,
      );
      await loadRequestDetail(statusLookupEmail.trim(), req.id);
    } finally {
      setStatusLookupBusy(false);
    }
  }

  async function loadRequestDetail(email, id) {
    const res = await fetch(
      `${API_BASE}/panel-auth/registration-request/${encodeURIComponent(id)}?email=${encodeURIComponent(email)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) {
      setStatusRequest(data.request);
    }
  }

  async function sendPartnerMessage() {
    if (!statusRequest?.id || !statusLookupEmail.trim() || !partnerMessage.trim()) return;
    const res = await fetch(`${API_BASE}/panel-auth/registration-request/${encodeURIComponent(statusRequest.id)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: statusLookupEmail.trim(), message: partnerMessage.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) {
      setPartnerMessage("");
      await loadRequestDetail(statusLookupEmail.trim(), statusRequest.id);
      setStatusLookupText("Nachricht gesendet.");
    } else {
      setStatusLookupText("Nachricht konnte nicht gesendet werden.");
    }
  }

  async function sendChangeRequest() {
    if (!statusRequest?.id || !statusLookupEmail.trim() || !changeReason.trim()) return;
    const res = await fetch(
      `${API_BASE}/panel-auth/registration-request/${encodeURIComponent(statusRequest.id)}/change-request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: statusLookupEmail.trim(), reason: changeReason.trim(), payload: {} }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) {
      setChangeReason("");
      await loadRequestDetail(statusLookupEmail.trim(), statusRequest.id);
      setStatusLookupText("Änderungsanfrage gesendet.");
    } else {
      setStatusLookupText("Änderungsanfrage fehlgeschlagen.");
    }
  }

  async function uploadPartnerDocument() {
    if (!statusRequest?.id || !statusLookupEmail.trim() || !uploadFile) return;
    const toBase64 = (file) =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = () => reject(new Error("file_read_failed"));
        r.readAsDataURL(file);
      });
    try {
      const contentBase64 = await toBase64(uploadFile);
      const res = await fetch(
        `${API_BASE}/panel-auth/registration-request/${encodeURIComponent(statusRequest.id)}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: statusLookupEmail.trim(),
            category: "partner_upload",
            fileName: uploadFile.name,
            mimeType: uploadFile.type || "application/octet-stream",
            contentBase64,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setUploadFile(null);
        await loadRequestDetail(statusLookupEmail.trim(), statusRequest.id);
        setStatusLookupText("Dokument hochgeladen.");
      } else {
        setStatusLookupText("Dokument-Upload fehlgeschlagen.");
      }
    } catch {
      setStatusLookupText("Datei konnte nicht gelesen werden.");
    }
  }

  return (
    <div className="partner-login">
      <div className="partner-login__card">
        <h1 className="partner-login__title">Unternehmerportal</h1>
        <div className="partner-login__switch">
          <button
            type="button"
            className={`partner-login__switch-btn ${mode === "login" ? "partner-login__switch-btn--on" : ""}`}
            onClick={() => setMode("login")}
          >
            Anmelden
          </button>
          <button
            type="button"
            className={`partner-login__switch-btn ${mode === "request" ? "partner-login__switch-btn--on" : ""}`}
            onClick={() => setMode("request")}
          >
            Unternehmensanfrage
          </button>
        </div>

        {mode === "login" ? (
          <>
            <p className="partner-login__lead">
              Melde dich mit deinem Unternehmenszugang an (Benutzername <strong>oder</strong> die hinterlegte
              geschäftliche E-Mail). Passwort mindestens 10 Zeichen — bei Erstanlage oft ein temporäres Passwort vom
              Betreiber.
            </p>
            <form className="partner-login__form" onSubmit={onSubmit}>
              <label className="partner-login__label">
                Benutzername oder E-Mail
                <input
                  className="partner-login__input"
                  name="username"
                  autoComplete="username"
                  placeholder="z. B. max oder name@firma.de"
                  value={username}
                  onChange={(ev) => setUsername(ev.target.value)}
                  required
                />
              </label>
              <label className="partner-login__label">
                Passwort
                <input
                  className="partner-login__input"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  required
                />
              </label>
              {error ? <p className="partner-login__error">{error}</p> : null}
              <button type="submit" className="panel-btn-primary partner-login__submit" disabled={submitting}>
                {submitting ? "Anmeldung …" : "Anmelden"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="partner-login__lead">
              Keine Direktfreischaltung: Dein Unternehmen sendet eine Anfrage und wird im Admin-Bereich geprüft.
              Stammdaten bleiben nach dem Senden gesperrt.
            </p>
            <form className="partner-login__form" onSubmit={onSubmitRequest}>
              <label className="partner-login__label">
                Art des Unternehmens / Partners
                <select
                  className="partner-login__input"
                  value={requestForm.partnerType}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, partnerType: ev.target.value }))}
                  required
                >
                  {PARTNER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="partner-login__label">
                Firmenname
                <input
                  className="partner-login__input"
                  value={requestForm.companyName}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, companyName: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-login__label">
                Rechtsform
                <input
                  className="partner-login__input"
                  value={requestForm.legalForm}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, legalForm: ev.target.value }))}
                />
              </label>
              <label className="partner-login__label">
                Ansprechpartner Vorname
                <input
                  className="partner-login__input"
                  value={requestForm.contactFirstName}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, contactFirstName: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-login__label">
                Ansprechpartner Nachname
                <input
                  className="partner-login__input"
                  value={requestForm.contactLastName}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, contactLastName: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-login__label">
                Geschäftliche E-Mail
                <input
                  className="partner-login__input"
                  type="email"
                  value={requestForm.email}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, email: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-login__label">
                Geschäftliche Telefonnummer
                <input
                  className="partner-login__input"
                  value={requestForm.phone}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, phone: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-login__label">
                Offizielle Adresse
                <input
                  className="partner-login__input"
                  value={requestForm.addressLine1}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, addressLine1: ev.target.value }))}
                  required
                />
              </label>
              <div className="partner-login__grid2">
                <label className="partner-login__label">
                  PLZ
                  <input
                    className="partner-login__input"
                    value={requestForm.postalCode}
                    onChange={(ev) => setRequestForm((p) => ({ ...p, postalCode: ev.target.value }))}
                    required
                  />
                </label>
                <label className="partner-login__label">
                  Stadt
                  <input
                    className="partner-login__input"
                    value={requestForm.city}
                    onChange={(ev) => setRequestForm((p) => ({ ...p, city: ev.target.value }))}
                    required
                  />
                </label>
              </div>
              <label className="partner-login__label">
                Land
                <input
                  className="partner-login__input"
                  value={requestForm.country}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, country: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-login__label">
                Steuer-ID
                <input
                  className="partner-login__input"
                  value={requestForm.taxId}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, taxId: ev.target.value }))}
                />
              </label>
              <label className="partner-login__label">
                USt-IdNr.
                <input
                  className="partner-login__input"
                  value={requestForm.vatId}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, vatId: ev.target.value }))}
                />
              </label>
              <label className="partner-login__label">
                Konzessionsnummer (Taxi)
                <input
                  className="partner-login__input"
                  value={requestForm.concessionNumber}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, concessionNumber: ev.target.value }))}
                />
              </label>
              <label className="partner-login__label">
                Gewünschter Einsatzbereich / Region
                <input
                  className="partner-login__input"
                  value={requestForm.desiredRegion}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, desiredRegion: ev.target.value }))}
                />
              </label>
              <label className="partner-login__label partner-login__check">
                <input
                  type="checkbox"
                  checked={requestForm.usesVouchers}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, usesVouchers: ev.target.checked }))}
                />
                Nutzt Gutscheine / Kostenübernahmen
              </label>
              <label className="partner-login__label">
                Zusatzhinweise
                <textarea
                  className="partner-login__textarea"
                  value={requestForm.notes}
                  onChange={(ev) => setRequestForm((p) => ({ ...p, notes: ev.target.value }))}
                  rows={3}
                />
              </label>
              {requestError ? <p className="partner-login__error">{requestError}</p> : null}
              {requestOk ? <p className="partner-login__ok">{requestOk}</p> : null}
              <button type="submit" className="panel-btn-primary partner-login__submit" disabled={requestSubmitting}>
                {requestSubmitting ? "Sende Anfrage …" : "Registrierungsanfrage senden"}
              </button>
            </form>
            <form className="partner-login__form partner-login__status-form" onSubmit={onLookupStatus}>
              <label className="partner-login__label">
                Anfrage-Status prüfen (E-Mail)
                <input
                  className="partner-login__input"
                  type="email"
                  value={statusLookupEmail}
                  onChange={(ev) => setStatusLookupEmail(ev.target.value)}
                  required
                />
              </label>
              <button type="submit" className="panel-btn-primary" disabled={statusLookupBusy}>
                {statusLookupBusy ? "Prüfe …" : "Status abrufen"}
              </button>
              {statusLookupText ? <p className="partner-login__lead">{statusLookupText}</p> : null}
            </form>
            {statusRequest ? (
              <div className="partner-login__status-form">
                <p className="partner-login__lead">
                  Anfrage-ID: <strong>{statusRequest.id}</strong>
                </p>
                <label className="partner-login__label">
                  Rückfrage / Nachricht an Admin
                  <textarea
                    className="partner-login__textarea"
                    value={partnerMessage}
                    onChange={(ev) => setPartnerMessage(ev.target.value)}
                    rows={3}
                  />
                </label>
                <button type="button" className="panel-btn-primary" onClick={sendPartnerMessage}>
                  Nachricht senden
                </button>
                <label className="partner-login__label">
                  Stammdaten-Änderung beantragen
                  <textarea
                    className="partner-login__textarea"
                    value={changeReason}
                    onChange={(ev) => setChangeReason(ev.target.value)}
                    rows={3}
                    placeholder="Welche gesperrten Stammdaten sollen angepasst werden?"
                  />
                </label>
                <button type="button" className="panel-btn-primary" onClick={sendChangeRequest}>
                  Änderung beantragen
                </button>
                <label className="partner-login__label">
                  Dokument nachreichen
                  <input
                    className="partner-login__input"
                    type="file"
                    onChange={(ev) => setUploadFile(ev.target.files?.[0] ?? null)}
                  />
                </label>
                <button type="button" className="panel-btn-primary" onClick={uploadPartnerDocument}>
                  Dokument hochladen
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
