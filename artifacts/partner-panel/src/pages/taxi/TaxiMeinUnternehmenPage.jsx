import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";
import PartnerCollapsibleSection from "../../components/PartnerCollapsibleSection.jsx";

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
  const [upload, setUpload] = useState({ docType: "gewerbeschein", vehicleId: "", file: null });

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

      <div className={`partner-onb-status partner-onb-status--${ban.tone}`}>
        <strong>{ban.title}</strong>
        <p>{ban.text}</p>
        {profile.onboardingStatus !== "approved" && profile.onboardingStatus !== "pending" ? (
          <button
            type="button"
            className="partner-btn-primary"
            style={{ marginTop: 10 }}
            disabled={!!busy}
            onClick={() => void submitReview()}
          >
            {busy === "submit" ? "…" : "Zur Prüfung einreichen"}
          </button>
        ) : null}
      </div>

      <PartnerCollapsibleSection title="Stammdaten" subtitle="Ihr Unternehmen" defaultOpen>
        <form className="partner-form-grid" onSubmit={(e) => void saveProfile(e)}>
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
          <div className="partner-form-toolbar">
            <button type="submit" className="partner-btn-primary" disabled={busy === "save"}>
              {busy === "save" ? "Speichert …" : "Speichern"}
            </button>
          </div>
        </form>
      </PartnerCollapsibleSection>

      <PartnerCollapsibleSection title="Fahrzeuge" subtitle={`${vehicles.length} Fahrzeug(e)`} defaultOpen={false}>
        <form className="partner-form-grid" onSubmit={(e) => void addVehicle(e)}>
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
          <button type="submit" className="partner-btn-secondary" disabled={busy === "veh"}>
            Fahrzeug hinzufügen
          </button>
        </form>
        <ul className="partner-simple-list">
          {vehicles.map((v) => (
            <li key={v.id}>
              <strong>{v.licensePlate}</strong> · {v.vehicleType}
              {v.tuevDate ? ` · TÜV ${v.tuevDate}` : ""}
              {!v.isActive ? " (inaktiv)" : ""}
            </li>
          ))}
        </ul>
      </PartnerCollapsibleSection>

      <PartnerCollapsibleSection title="Dokumente" subtitle="PDF, JPG oder PNG" defaultOpen={false}>
        <form className="partner-form-grid" onSubmit={(e) => void uploadDoc(e)}>
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
            <span className="partner-field__label">Datei</span>
            <input
              className="partner-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setUpload((u) => ({ ...u, file: e.target.files?.[0] ?? null }))}
            />
          </label>
          <button type="submit" className="partner-btn-secondary" disabled={busy === "doc"}>
            Hochladen
          </button>
        </form>
        <ul className="partner-simple-list">
          {documents.map((d) => (
            <li key={d.id}>
              {d.fileName}{" "}
              <button type="button" className="partner-link-btn" onClick={() => openDoc(d.id)}>
                Ansehen
              </button>
            </li>
          ))}
        </ul>
      </PartnerCollapsibleSection>
    </div>
  );
}
