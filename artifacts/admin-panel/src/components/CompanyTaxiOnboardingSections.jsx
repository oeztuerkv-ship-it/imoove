import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "./AdminCollapsibleSection.jsx";
import AdminOnboardingBlockFooter from "./AdminOnboardingBlockFooter.jsx";
import CompanyDocumentInventoryBlock from "./CompanyDocumentInventoryBlock.jsx";
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
  const [inventoryRev, setInventoryRev] = useState(0);
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

  async function patchOnboarding(payload, busyKey) {
    setBusy(busyKey);
    try {
      const r = await fetch(
        `${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/onboarding-status`,
        {
          method: "PATCH",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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

  function patchStatus(status) {
    return patchOnboarding({ status, notes }, `status-${status}`);
  }

  function saveNotesOnly() {
    if (!profile) return Promise.resolve();
    return patchOnboarding({ status: profile.onboardingStatus, notes }, "notes");
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
      setInventoryRev((n) => n + 1);
      await load();
      onChanged?.();
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

  if (loading) return <p className="admin-table-sub">Onboarding-Daten werden geladen …</p>;
  if (err) return <p className="admin-table-sub" style={{ color: "#b91c1c" }}>{err}</p>;
  if (!profile) return null;

  const amp = ampelMeta(profile.onboardingStatus);

  return (
    <div className="admin-taxi-onboarding">
      <AdminCollapsibleSection
        className="admin-onb-section"
        title="Onboarding · Ampel-Status"
        subtitle="Taxi-Freischaltung"
        collapsible={false}
      >
        <div className="admin-onb-block">
          <div className="admin-onb-block__content">
            <div className={`admin-onb-ampel ${amp.cls}`}>
              <span className="admin-onb-ampel__emoji" aria-hidden>
                {amp.emoji}
              </span>
              <div>
                <strong className="admin-onb-ampel__label">{amp.label}</strong>
                <div className="admin-table-sub admin-onb-ampel__meta">
                  Zuletzt freigegeben: {fmtDe(profile.onboardingApprovedAt)}
                  {profile.onboardingApprovedBy ? ` · durch ${profile.onboardingApprovedBy}` : ""}
                </div>
              </div>
            </div>
            <label className="admin-m-lbl admin-onb-field--full">
              Interne Anmerkung (KK / Onboarding)
              <textarea
                className="admin-m-ta"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="admin-onb-status-actions">
              <button
                type="button"
                className="admin-onb-btn-outline admin-onb-btn-outline--ok"
                disabled={!!busy || profile.onboardingStatus === "approved"}
                onClick={() => void patchStatus("approved")}
              >
                {busy === "status-approved" ? "…" : "Freischalten"}
              </button>
              <button
                type="button"
                className="admin-onb-btn-outline"
                disabled={!!busy}
                onClick={() => void patchStatus("pending")}
              >
                Ausstehend
              </button>
              <button
                type="button"
                className="admin-onb-btn-outline"
                disabled={!!busy}
                onClick={() => void patchStatus("incomplete")}
              >
                Zurücksetzen
              </button>
            </div>
          </div>
          <AdminOnboardingBlockFooter
            label="Anmerkung speichern"
            type="button"
            busy={busy === "notes"}
            onClick={() => void saveNotesOnly()}
          />
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        className="admin-onb-section"
        title="Stammdaten"
        subtitle="Unternehmen"
        defaultOpen={false}
      >
        <form onSubmit={(e) => void saveStammdaten(e)} className="admin-onb-block">
          <div className="admin-onb-block__content admin-m-form admin-onb-form">
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
          </div>
          <AdminOnboardingBlockFooter busy={busy === "stamm"} />
        </form>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        className="admin-onb-section"
        title="Fahrzeuge (Onboarding)"
        subtitle={`${vehicles.length} Einträge`}
        defaultOpen={false}
      >
        <form onSubmit={(e) => void addVehicle(e)} className="admin-onb-block">
          <div className="admin-onb-block__content">
            <div className="admin-m-form admin-onb-form">
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
            </div>
            {vehicles.length > 0 ? (
              <div className="admin-onb-table-wrap">
                <table className="admin-onb-table">
                  <thead>
                    <tr>
                      <th>Kennzeichen</th>
                      <th>Typ</th>
                      <th>Konzession</th>
                      <th>TÜV</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => (
                      <tr key={v.id}>
                        <td>{v.licensePlate}</td>
                        <td>{v.vehicleType}</td>
                        <td>{v.concessionNumber || "—"}</td>
                        <td>{v.tuevDate || "—"}</td>
                        <td>
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
            ) : (
              <p className="admin-onb-empty">Noch keine Fahrzeuge im Onboarding.</p>
            )}
          </div>
          <AdminOnboardingBlockFooter
            label="Fahrzeug speichern"
            busy={busy === "veh-add"}
            hint="Aktiv/Inaktiv in der Liste wird sofort gespeichert."
          />
        </form>
      </AdminCollapsibleSection>

      <CompanyDocumentInventoryBlock
        key={inventoryRev}
        companyId={companyId}
        title="Dokumente · alle Uploads"
        subtitle="Partner- und Admin-Dateien nachvollziehen"
        footer={
          <form onSubmit={(e) => void uploadDocument(e)} className="admin-onb-block" style={{ marginTop: 16 }}>
            <div className="admin-onb-block__content">
              <p className="admin-table-sub" style={{ margin: "0 0 10px" }}>
                Admin-Upload (Onboarding-Tabelle, max. 10 MB)
              </p>
              <div className="admin-m-form admin-onb-form">
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
                <label className="admin-m-lbl admin-onb-field--full">
                  Datei (PDF/JPG/PNG)
                  <input
                    className="admin-m-inp"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    onChange={(e) =>
                      setUpload((u) => ({ ...u, file: e.target.files?.[0] ?? null }))
                    }
                  />
                </label>
              </div>
            </div>
            <AdminOnboardingBlockFooter label="Dokument speichern" busy={busy === "doc-up"} />
          </form>
        }
      />

      <AdminCollapsibleSection
        className="admin-onb-section"
        title="KK-Modul"
        subtitle="Unabhängig von Onboarding-Ampel"
        defaultOpen={false}
      >
        <form onSubmit={(e) => void saveKk(e)} className="admin-onb-block">
          <div className="admin-onb-block__content admin-m-form admin-onb-form">
            <label className="admin-m-lbl admin-onb-check">
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
            <label className="admin-m-lbl admin-onb-field--full">
              KK-Notizen (intern)
              <textarea
                className="admin-m-ta"
                rows={3}
                value={kk.kkModuleNotes}
                onChange={(e) => setKk((k) => ({ ...k, kkModuleNotes: e.target.value }))}
              />
            </label>
          </div>
          <AdminOnboardingBlockFooter label="KK-Einstellungen speichern" busy={busy === "kk"} />
        </form>
      </AdminCollapsibleSection>
    </div>
  );
}
