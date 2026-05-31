import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "./AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

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

function ampelMeta(status) {
  if (status === "approved") return { emoji: "🟢", label: "Freigegeben", cls: "admin-onb-ampel--ok" };
  if (status === "pending") return { emoji: "🟡", label: "Ausstehend", cls: "admin-onb-ampel--pending" };
  return { emoji: "🔴", label: "Unvollständig", cls: "admin-onb-ampel--bad" };
}

function fmtDe(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function CompanyTaxiOnboardingSections({ companyId, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [profile, setProfile] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [notes, setNotes] = useState("");
  const [stammdaten, setStammdaten] = useState({});
  const [newVehicle, setNewVehicle] = useState({
    licensePlate: "",
    vehicleType: "limousine",
    concessionNumber: "",
    tuevDate: "",
  });
  const [upload, setUpload] = useState({ docType: "gewerbeschein", vehicleId: "", file: null });
  const [kk, setKk] = useState({ featureKkModule: false, partnerIkNumber: "", kkModuleNotes: "" });

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/profile`, {
        headers: adminApiHeaders(),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setErr(j?.error ? String(j.error) : `HTTP ${r.status}`);
        return;
      }
      setProfile(j.profile);
      setVehicles(j.vehicles ?? []);
      setDocuments(j.documents ?? []);
      setNotes(j.profile?.kkModuleNotes ?? "");
      setStammdaten({
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
      setKk({
        featureKkModule: Boolean(j.profile?.featureKkModule),
        partnerIkNumber: j.profile?.partnerIkNumber ?? "",
        kkModuleNotes: j.profile?.kkModuleNotes ?? "",
      });
    } catch {
      setErr("Netzwerkfehler");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchStatus(status) {
    setBusy(`status-${status}`);
    try {
      const r = await fetch(
        `${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/onboarding-status`,
        {
          method: "PATCH",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ status, notes }),
        },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j?.error ?? r.status);
        return;
      }
      await load();
      onChanged?.();
    } finally {
      setBusy("");
    }
  }

  async function saveStammdaten(e) {
    e.preventDefault();
    setBusy("stamm");
    try {
      const r = await fetch(`${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/profile`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(stammdaten),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j?.error ?? r.status);
        return;
      }
      await load();
      onChanged?.();
    } finally {
      setBusy("");
    }
  }

  async function addVehicle(e) {
    e.preventDefault();
    setBusy("veh-add");
    try {
      const r = await fetch(`${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/vehicles`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
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

  async function toggleVehicleActive(v, next) {
    setBusy(`v-${v.id}`);
    try {
      const r = await fetch(
        `${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(v.id)}`,
        {
          method: "PATCH",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: next }),
        },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        window.alert(j?.error ?? r.status);
        return;
      }
      await load();
    } finally {
      setBusy("");
    }
  }

  async function uploadDocument(e) {
    e.preventDefault();
    if (!upload.file) {
      window.alert("Bitte Datei wählen (PDF, JPG, PNG, max. 10 MB).");
      return;
    }
    setBusy("doc-up");
    try {
      const fd = new FormData();
      fd.append("docType", upload.docType);
      if (upload.vehicleId.trim()) fd.append("vehicleId", upload.vehicleId.trim());
      fd.append("file", upload.file);
      const r = await fetch(`${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/documents`, {
        method: "POST",
        headers: adminApiHeaders(),
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

  async function saveKk(e) {
    e.preventDefault();
    setBusy("kk");
    try {
      const r = await fetch(`${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/profile`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(kk),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j?.error ?? r.status);
        return;
      }
      await load();
      onChanged?.();
    } finally {
      setBusy("");
    }
  }

  function openDoc(docId) {
    const url = `${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(docId)}/file`;
    fetch(url, { headers: adminApiHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        const u = URL.createObjectURL(blob);
        window.open(u, "_blank", "noopener,noreferrer");
      })
      .catch(() => window.alert("Dokument konnte nicht geöffnet werden."));
  }

  if (loading) return <p className="admin-table-sub">Onboarding-Daten werden geladen …</p>;
  if (err) return <p className="admin-table-sub" style={{ color: "#b91c1c" }}>{err}</p>;
  if (!profile) return null;

  const amp = ampelMeta(profile.onboardingStatus);

  return (
    <div className="admin-taxi-onboarding">
      <AdminCollapsibleSection title="Onboarding · Ampel-Status" subtitle="Taxi-Freischaltung" collapsible={false}>
        <div className={`admin-onb-ampel ${amp.cls}`}>
          <span className="admin-onb-ampel__emoji" aria-hidden>
            {amp.emoji}
          </span>
          <div>
            <strong>{amp.label}</strong>
            <div className="admin-table-sub" style={{ marginTop: 4 }}>
              Zuletzt freigegeben: {fmtDe(profile.onboardingApprovedAt)}
              {profile.onboardingApprovedBy ? ` · durch ${profile.onboardingApprovedBy}` : ""}
            </div>
          </div>
        </div>
        <label className="admin-m-lbl" style={{ display: "block", marginTop: 12 }}>
          Interne Anmerkung (KK / Onboarding)
          <textarea
            className="admin-m-ta"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className="admin-m-btn-bearb"
            disabled={!!busy || profile.onboardingStatus === "approved"}
            onClick={() => void patchStatus("approved")}
          >
            {busy === "status-approved" ? "…" : "Freischalten"}
          </button>
          <button
            type="button"
            className="admin-c-btn-sec"
            disabled={!!busy}
            onClick={() => void patchStatus("pending")}
          >
            Ausstehend setzen
          </button>
          <button
            type="button"
            className="admin-c-btn-sec"
            disabled={!!busy}
            onClick={() => void patchStatus("incomplete")}
          >
            Zurücksetzen
          </button>
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="Stammdaten" subtitle="Unternehmen" defaultOpen={false}>
        <form onSubmit={(e) => void saveStammdaten(e)} className="admin-m-form">
          {[
            ["name", "Firmenname"],
            ["contactName", "Ansprechpartner"],
            ["email", "E-Mail"],
            ["phone", "Telefon"],
            ["addressLine1", "Adresse"],
            ["addressLine2", "Adresse Zusatz"],
            ["postalCode", "PLZ"],
            ["city", "Ort"],
            ["country", "Land"],
            ["iban", "IBAN"],
            ["taxNumber", "Steuernummer"],
            ["tradeLicenseNumber", "Gewerbeschein-Nr."],
            ["concessionNumber", "Konzession (Haupt)"],
          ].map(([key, label]) => (
            <label key={key} className="admin-m-lbl">
              {label}
              <input
                className="admin-m-inp"
                value={stammdaten[key] ?? ""}
                onChange={(e) => setStammdaten((s) => ({ ...s, [key]: e.target.value }))}
              />
            </label>
          ))}
          <button type="submit" className="admin-m-btn-bearb" disabled={busy === "stamm"}>
            {busy === "stamm" ? "…" : "Stammdaten speichern"}
          </button>
        </form>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Fahrzeuge (Onboarding)"
        subtitle={`${vehicles.length} Einträge`}
        defaultOpen={false}
      >
        <form onSubmit={(e) => void addVehicle(e)} className="admin-m-form" style={{ marginBottom: 16 }}>
          <label className="admin-m-lbl">
            Kennzeichen
            <input
              className="admin-m-inp admin-mono"
              value={newVehicle.licensePlate}
              onChange={(e) => setNewVehicle((v) => ({ ...v, licensePlate: e.target.value }))}
              required
            />
          </label>
          <label className="admin-m-lbl">
            Typ
            <select
              className="admin-m-inp"
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
          <label className="admin-m-lbl">
            Konzession
            <input
              className="admin-m-inp"
              value={newVehicle.concessionNumber}
              onChange={(e) => setNewVehicle((v) => ({ ...v, concessionNumber: e.target.value }))}
            />
          </label>
          <label className="admin-m-lbl">
            TÜV (Datum)
            <input
              className="admin-m-inp"
              type="date"
              value={newVehicle.tuevDate}
              onChange={(e) => setNewVehicle((v) => ({ ...v, tuevDate: e.target.value }))}
            />
          </label>
          <button type="submit" className="admin-c-btn-sec" disabled={busy === "veh-add"}>
            + Fahrzeug hinzufügen
          </button>
        </form>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th className="admin-mandate-th">Kennzeichen</th>
                <th className="admin-mandate-th">Typ</th>
                <th className="admin-mandate-th">Konzession</th>
                <th className="admin-mandate-th">TÜV</th>
                <th className="admin-mandate-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td className="admin-mandate-td">{v.licensePlate}</td>
                  <td className="admin-mandate-td">{v.vehicleType}</td>
                  <td className="admin-mandate-td">{v.concessionNumber || "—"}</td>
                  <td className="admin-mandate-td">{v.tuevDate || "—"}</td>
                  <td className="admin-mandate-td">
                    <button
                      type="button"
                      className="admin-link"
                      disabled={!!busy}
                      onClick={() => void toggleVehicleActive(v, !v.isActive)}
                    >
                      {v.isActive ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Dokumente"
        subtitle={`${documents.length} Dateien`}
        defaultOpen={false}
      >
        <form onSubmit={(e) => void uploadDocument(e)} className="admin-m-form" style={{ marginBottom: 14 }}>
          <label className="admin-m-lbl">
            Dokumenttyp
            <select
              className="admin-m-inp"
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
          <label className="admin-m-lbl">
            Fahrzeug (optional)
            <select
              className="admin-m-inp"
              value={upload.vehicleId}
              onChange={(e) => setUpload((u) => ({ ...u, vehicleId: e.target.value }))}
            >
              <option value="">— Unternehmen —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.licensePlate}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-m-lbl">
            Datei (PDF/JPG/PNG, max. 10 MB)
            <input
              className="admin-m-inp"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(e) =>
                setUpload((u) => ({ ...u, file: e.target.files?.[0] ?? null }))
              }
            />
          </label>
          <button type="submit" className="admin-c-btn-sec" disabled={busy === "doc-up"}>
            Dokument hochladen
          </button>
        </form>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {documents.map((d) => (
            <li
              key={d.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "8px 0",
                borderBottom: "1px solid #e8edf4",
              }}
            >
              <span>
                <strong>{d.fileName}</strong>
                <span className="admin-table-sub" style={{ marginLeft: 8 }}>
                  {d.docType} · {fmtDe(d.uploadedAt)} · {(d.fileSizeBytes / 1024).toFixed(0)} KB
                </span>
              </span>
              <button type="button" className="admin-link" onClick={() => openDoc(d.id)}>
                Öffnen
              </button>
            </li>
          ))}
        </ul>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="KK-Modul" subtitle="Unabhängig von Onboarding-Ampel" defaultOpen={false}>
        <form onSubmit={(e) => void saveKk(e)} className="admin-m-form">
          <label className="admin-m-lbl" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={kk.featureKkModule}
              onChange={(e) => setKk((k) => ({ ...k, featureKkModule: e.target.checked }))}
            />
            KK-Modul aktiv
          </label>
          <label className="admin-m-lbl">
            IK-Nummer
            <input
              className="admin-m-inp admin-mono"
              value={kk.partnerIkNumber}
              onChange={(e) => setKk((k) => ({ ...k, partnerIkNumber: e.target.value }))}
            />
          </label>
          <label className="admin-m-lbl">
            KK-Notizen (intern)
            <textarea
              className="admin-m-ta"
              rows={2}
              value={kk.kkModuleNotes}
              onChange={(e) => setKk((k) => ({ ...k, kkModuleNotes: e.target.value }))}
            />
          </label>
          <button type="submit" className="admin-m-btn-bearb" disabled={busy === "kk"}>
            {busy === "kk" ? "…" : "KK-Einstellungen speichern"}
          </button>
        </form>
      </AdminCollapsibleSection>
    </div>
  );
}
