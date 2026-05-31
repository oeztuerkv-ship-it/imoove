import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";
import PartnerCollapsibleSection from "../../components/PartnerCollapsibleSection.jsx";
import PartnerOnboardingBlockFooter from "../../components/PartnerOnboardingBlockFooter.jsx";

const DOC_TYPES = [
  ["gewerbeschein", "Gewerbeschein"],
  ["konzession", "Konzession"],
  ["fahrzeugschein", "Fahrzeugschein"],
  ["versicherung", "Versicherung"],
  ["ik_nachweis", "IK-Nachweis"],
  ["personalausweis", "Personalausweis"],
  ["sepa", "SEPA"],
  ["kk_vertrag", "KK-Vertrag"],
  ["sonstige", "Sonstige"],
];

const VEHICLE_TYPES = [
  ["limousine", "Limousine"],
  ["kombi", "Kombi"],
  ["van", "Van"],
  ["wheelchair", "Rollstuhl"],
];

const VEHICLE_REVIEW_DE = {
  draft: "Entwurf",
  pending: "In Prüfung bei Onroda",
  active: "Freigegeben (aktiv)",
  inactive: "Deaktiviert",
  rejected: "Abgelehnt",
};

function statusBanner(status) {
  if (status === "approved") {
    return { tone: "ok", title: "Freigegeben", text: "Ihr Unternehmen ist freigeschaltet. Sie können den Betrieb starten." };
  }
  if (status === "pending") {
    return {
      tone: "pending",
      title: "In Prüfung",
      text: "Ihre Unterlagen wurden eingereicht. Onroda prüft Ihr Konto — Sie erhalten keine weiteren Aufforderungen, bis die Prüfung abgeschlossen ist.",
    };
  }
  return {
    tone: "warn",
    title: "Unvollständig",
    text: "Bitte Stammdaten, Fahrzeuge und Dokumente vervollständigen und zur Prüfung einreichen.",
  };
}

export default function TaxiMeinUnternehmenPage() {
  const { token } = usePanelAuth();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [profile, setProfile] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [form, setForm] = useState({});
  const [newVehicle, setNewVehicle] = useState({
    licensePlate: "",
    vehicleType: "limousine",
    concessionNumber: "",
    tuevDate: "",
  });
  const [upload, setUpload] = useState({ docType: "fahrzeugschein", vehicleId: "", file: null });
  const [operatorMessages, setOperatorMessages] = useState([]);

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token],
  );

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setErr("Nicht angemeldet.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/panel/v1/company-profile`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setErr(j?.error ? String(j.error) : "Daten konnten nicht geladen werden.");
        return;
      }
      setProfile(j.profile);
      setVehicles(j.vehicles ?? []);
      setDocuments(j.documents ?? []);
      try {
        const mr = await fetch(`${API_BASE}/panel/v1/company-operator-messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const mj = await mr.json().catch(() => ({}));
        setOperatorMessages(mr.ok && mj?.ok && Array.isArray(mj.messages) ? mj.messages : []);
      } catch {
        setOperatorMessages([]);
      }
      setForm({
        name: j.profile?.name ?? "",
        contactName: j.profile?.contactName ?? "",
        email: j.profile?.email ?? "",
        phone: j.profile?.phone ?? "",
        addressLine1: j.profile?.addressLine1 ?? "",
        addressLine2: j.profile?.addressLine2 ?? "",
        postalCode: j.profile?.postalCode ?? "",
        city: j.profile?.city ?? "",
        country: j.profile?.country ?? "",
        iban: j.profile?.iban ?? "",
        taxNumber: j.profile?.taxNumber ?? "",
        tradeLicenseNumber: j.profile?.tradeLicenseNumber ?? "",
        concessionNumber: j.profile?.concessionNumber ?? "",
      });
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(e) {
    e.preventDefault();
    setBusy("save");
    try {
      const r = await fetch(`${API_BASE}/panel/v1/company-profile`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j?.error ?? r.status);
        return;
      }
      await load();
    } finally {
      setBusy("");
    }
  }

  async function submitReview() {
    setBusy("submit");
    try {
      const r = await fetch(`${API_BASE}/panel/v1/company-profile/submit`, {
        method: "POST",
        headers: headers(),
        body: "{}",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j?.error ?? r.status);
        return;
      }
      await load();
    } finally {
      setBusy("");
    }
  }

  async function addVehicle(e) {
    e.preventDefault();
    setBusy("veh");
    try {
      const r = await fetch(`${API_BASE}/panel/v1/vehicles`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(newVehicle),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j?.error ?? r.status);
        return;
      }
      setNewVehicle({ licensePlate: "", vehicleType: "limousine", concessionNumber: "", tuevDate: "" });
      await load();
    } finally {
      setBusy("");
    }
  }

  async function uploadDoc(e) {
    e.preventDefault();
    if (!upload.file) {
      window.alert("Bitte Datei wählen.");
      return;
    }
    setBusy("doc");
    try {
      const fd = new FormData();
      fd.append("docType", upload.docType);
      if (upload.vehicleId) fd.append("vehicleId", upload.vehicleId);
      fd.append("file", upload.file);
      const r = await fetch(`${API_BASE}/panel/v1/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j?.error ?? r.status);
        return;
      }
      setUpload((u) => ({ ...u, file: null }));
      await load();
    } finally {
      setBusy("");
    }
  }

  function openDoc(id) {
    fetch(`${API_BASE}/panel/v1/documents/${encodeURIComponent(id)}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        const u = URL.createObjectURL(blob);
        window.open(u, "_blank", "noopener,noreferrer");
      })
      .catch(() => window.alert("Datei konnte nicht geöffnet werden."));
  }

  if (loading) return <p className="partner-muted">Wird geladen …</p>;
  if (err) return <p className="partner-error">{err}</p>;
  if (!profile) return null;

  const ban = statusBanner(profile.onboardingStatus);

  return (
    <div className="partner-page partner-page--mein-unternehmen">
      <header className="partner-page__head">
        <h1 className="partner-page__title">Mein Unternehmen</h1>
        <p className="partner-page__lead">Stammdaten, Fahrzeuge und Nachweise für die Freischaltung durch Onroda.</p>
      </header>

      <section className={`partner-onb-status partner-onb-status--${ban.tone}`}>
        <div className="partner-onb-status__text">
          <strong>{ban.title}</strong>
          <p>{ban.text}</p>
        </div>
        {profile.onboardingStatus !== "approved" && profile.onboardingStatus !== "pending" ? (
          <PartnerOnboardingBlockFooter
            label="Zur Prüfung einreichen"
            type="button"
            busy={busy === "submit"}
            onClick={() => void submitReview()}
          />
        ) : null}
      </section>

      {operatorMessages.length > 0 ? (
        <PartnerCollapsibleSection title="Rückmeldung von Onroda" subtitle="Nachrichten der Plattform" defaultOpen>
          <ul className="partner-onb-list">
            {operatorMessages.map((m) => (
              <li key={m.id} className="partner-onb-list__item">
                <span className="partner-onb-list__meta">
                  {m.senderType === "admin" ? "Onroda" : "Sie"} ·{" "}
                  {new Date(m.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{m.body}</p>
              </li>
            ))}
          </ul>
        </PartnerCollapsibleSection>
      ) : null}

      <PartnerCollapsibleSection title="Stammdaten" subtitle="Ihr Unternehmen" defaultOpen>
        <form className="partner-onb-block" onSubmit={(e) => void saveProfile(e)}>
          <div className="partner-onb-block__content partner-form-grid">
            {[
              ["name", "Firmenname"],
              ["contactName", "Ansprechpartner"],
              ["email", "E-Mail"],
              ["phone", "Telefon"],
              ["addressLine1", "Straße"],
              ["postalCode", "PLZ"],
              ["city", "Ort"],
              ["iban", "IBAN"],
              ["taxNumber", "Steuernummer"],
              ["tradeLicenseNumber", "Gewerbeschein-Nr."],
              ["concessionNumber", "Konzession"],
            ].map(([key, label]) => (
              <label key={key} className="partner-field">
                <span className="partner-field__label">{label}</span>
                <input
                  className="partner-input"
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <PartnerOnboardingBlockFooter busy={busy === "save"} />
        </form>
      </PartnerCollapsibleSection>

      <PartnerCollapsibleSection title="Fahrzeuge" subtitle={`${vehicles.length} Fahrzeug(e)`} defaultOpen={false}>
        <form className="partner-onb-block" onSubmit={(e) => void addVehicle(e)}>
          <div className="partner-onb-block__content">
            <div className="partner-form-grid">
              <label className="partner-field">
                <span className="partner-field__label">Kennzeichen</span>
                <input
                  className="partner-input"
                  required
                  value={newVehicle.licensePlate}
                  onChange={(e) => setNewVehicle((v) => ({ ...v, licensePlate: e.target.value }))}
                />
              </label>
              <label className="partner-field">
                <span className="partner-field__label">Typ</span>
                <select
                  className="partner-input"
                  value={newVehicle.vehicleType}
                  onChange={(e) => setNewVehicle((v) => ({ ...v, vehicleType: e.target.value }))}
                >
                  {VEHICLE_TYPES.map(([val, lab]) => (
                    <option key={val} value={val}>
                      {lab}
                    </option>
                  ))}
                </select>
              </label>
              <label className="partner-field">
                <span className="partner-field__label">Konzessionsnummer (Fahrzeug)</span>
                <input
                  className="partner-input"
                  value={newVehicle.concessionNumber}
                  onChange={(e) => setNewVehicle((v) => ({ ...v, concessionNumber: e.target.value }))}
                />
              </label>
              <label className="partner-field">
                <span className="partner-field__label">TÜV (optional)</span>
                <input
                  className="partner-input"
                  type="date"
                  value={newVehicle.tuevDate}
                  onChange={(e) => setNewVehicle((v) => ({ ...v, tuevDate: e.target.value }))}
                />
              </label>
            </div>
            {vehicles.length > 0 ? (
              <ul className="partner-onb-list">
                {vehicles.map((v) => (
                  <li key={v.id} className="partner-onb-list__item">
                    <strong>{v.licensePlate}</strong>
                    <span className="partner-onb-list__meta">
                      {v.vehicleType}
                      {v.concessionNumber ? ` · Konz. ${v.concessionNumber}` : ""}
                      {v.tuevDate ? ` · TÜV ${v.tuevDate}` : ""}
                      {" · "}
                      {VEHICLE_REVIEW_DE[v.reviewStatus] || v.reviewStatus || "—"}
                    </span>
                    {v.operatorMessage ? (
                      <p className="partner-onb-list__hint" style={{ marginTop: 6 }}>
                        Onroda: {v.operatorMessage}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="partner-onb-empty">Noch keine Fahrzeuge — unten speichern, um eines anzulegen.</p>
            )}
          </div>
          <PartnerOnboardingBlockFooter label="Fahrzeug speichern" busy={busy === "veh"} />
        </form>
      </PartnerCollapsibleSection>

      <PartnerCollapsibleSection title="Dokumente" subtitle="PDF, JPG oder PNG" defaultOpen={false}>
        <form className="partner-onb-block" onSubmit={(e) => void uploadDoc(e)}>
          <div className="partner-onb-block__content">
            <div className="partner-form-grid">
              <label className="partner-field">
                <span className="partner-field__label">Typ</span>
                <select
                  className="partner-input"
                  value={upload.docType}
                  onChange={(e) => setUpload((u) => ({ ...u, docType: e.target.value }))}
                >
                  {DOC_TYPES.map(([val, lab]) => (
                    <option key={val} value={val}>
                      {lab}
                    </option>
                  ))}
                </select>
              </label>
              <label className="partner-field">
                <span className="partner-field__label">Fahrzeug (für Konzession / Fahrzeugschein)</span>
                <select
                  className="partner-input"
                  value={upload.vehicleId}
                  onChange={(e) => setUpload((u) => ({ ...u, vehicleId: e.target.value }))}
                >
                  <option value="">— Mandant allgemein —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.licensePlate}
                    </option>
                  ))}
                </select>
              </label>
              <label className="partner-field partner-field--file">
                <span className="partner-field__label">Datei</span>
                <input
                  className="partner-input partner-input--file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setUpload((u) => ({ ...u, file: e.target.files?.[0] ?? null }))}
                />
              </label>
            </div>
            {documents.length > 0 ? (
              <ul className="partner-onb-list">
                {documents.map((d) => (
                  <li key={d.id} className="partner-onb-list__item partner-onb-list__item--doc">
                    <span>{d.fileName}</span>
                    <button type="button" className="partner-link-btn" onClick={() => openDoc(d.id)}>
                      Ansehen
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="partner-onb-empty">Noch keine Dokumente hochgeladen.</p>
            )}
          </div>
          <PartnerOnboardingBlockFooter label="Dokument speichern" busy={busy === "doc"} />
        </form>
      </PartnerCollapsibleSection>
    </div>
  );
}
