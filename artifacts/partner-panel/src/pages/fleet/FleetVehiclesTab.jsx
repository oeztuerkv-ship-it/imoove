import { useState } from "react";
import {
  VEHICLE_CLASSES,
  VEHICLE_DOCUMENT_KIND_OPTIONS,
  VEHICLE_LEGAL_HINT,
  VEHICLE_TYPES,
  vehicleStatusDe,
  vehicleStatusTone,
} from "./fleetPanelHelpers.js";

function vehicleKonzessionLabel(v) {
  return (v.konzessionNumber ?? v.taxiOrderNumber ?? "").trim() || "—";
}

function vehicleAssignLabel(v) {
  const kz = vehicleKonzessionLabel(v);
  const plate = v.licensePlate || "—";
  const model = v.model ? ` · ${v.model}` : "";
  return kz !== "—" ? `${plate} · Konz. ${kz}${model}` : `${plate}${model}`;
}

/**
 * @param {{
 *   vehicleCreateSectionRef: import("react").RefObject<HTMLDivElement | null>;
 *   canManage: boolean;
 *   vehiclesActiveOnly: boolean;
 *   setVehiclesActiveOnly: (v: boolean | ((p: boolean) => boolean)) => void;
 *   vehicleForm: Record<string, string>;
 *   setVehicleForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
 *   vehicleCreateConcessionPdfRef: import("react").RefObject<HTMLInputElement | null>;
 *   vehicleCreateRegistrationPdfRef: import("react").RefObject<HTMLInputElement | null>;
 *   createVehicle: (e: React.FormEvent) => void | Promise<void>;
 *   assignForm: { driverId: string; vehicleId: string };
 *   setAssignForm: React.Dispatch<React.SetStateAction<{ driverId: string; vehicleId: string }>>;
 *   submitAssignment: (e: React.FormEvent) => void | Promise<void>;
 *   loading: boolean;
 *   drivers: Record<string, unknown>[];
 *   vehicles: Record<string, unknown>[];
 *   assignments: { vehicleId?: string; driverId?: string }[];
 *   uploadVehicleDocument: (vehicleId: string, kind: string, ev: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
 *   submitVehicleApproval: (vehicleId: string) => void | Promise<void>;
 *   setVehicleActive: (vehicleId: string, isActive: boolean) => void | Promise<void>;
 *   patchVehicleStammdaten: (vehicleId: string, body: Record<string, string | null>) => Promise<{ ok: boolean }>;
 *   clearAssignment: (driverId: string) => void | Promise<void>;
 * }} props
 */
export default function FleetVehiclesTab({
  vehicleCreateSectionRef,
  canManage,
  vehiclesActiveOnly,
  setVehiclesActiveOnly,
  vehicleForm,
  setVehicleForm,
  vehicleCreateConcessionPdfRef,
  vehicleCreateRegistrationPdfRef,
  createVehicle,
  assignForm,
  setAssignForm,
  submitAssignment,
  loading,
  drivers,
  vehicles,
  assignments,
  uploadVehicleDocument,
  submitVehicleApproval,
  setVehicleActive,
  patchVehicleStammdaten,
  clearAssignment,
}) {
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [editForm, setEditForm] = useState({ model: "", color: "", nextInspectionDate: "" });
  const [editBusy, setEditBusy] = useState(false);

  function openVehicleEdit(v) {
    setEditingVehicleId(v.id);
    setEditForm({
      model: v.model || "",
      color: v.color || "",
      nextInspectionDate: v.nextInspectionDate ? String(v.nextInspectionDate).slice(0, 10) : "",
    });
  }

  async function saveVehicleEdit(vehicleId) {
    setEditBusy(true);
    try {
      const r = await patchVehicleStammdaten(vehicleId, {
        model: editForm.model.trim(),
        color: editForm.color.trim(),
        nextInspectionDate: editForm.nextInspectionDate.trim() || null,
      });
      if (r.ok) setEditingVehicleId(null);
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div className="partner-card partner-card--section">
      <div style={{ marginBottom: 12 }}>
        <label className="partner-fleet-filter">
          <input type="checkbox" checked={vehiclesActiveOnly} onChange={(ev) => setVehiclesActiveOnly(ev.target.checked)} />
          Nur freigegebene Fahrzeuge
        </label>
      </div>
      {canManage ? (
        <div ref={vehicleCreateSectionRef}>
          <form className="partner-form" onSubmit={createVehicle} style={{ marginBottom: 20 }}>
            <h3 className="partner-card__title" style={{ marginTop: 0 }}>
              Neues Fahrzeug
            </h3>
            <div className="partner-form-grid">
              <label className="partner-form-field">
                <span>Kennzeichen</span>
                <input
                  className="partner-input"
                  value={vehicleForm.licensePlate}
                  onChange={(ev) => setVehicleForm((f) => ({ ...f, licensePlate: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-form-field">
                <span>Hersteller / Modell</span>
                <input className="partner-input" value={vehicleForm.model} onChange={(ev) => setVehicleForm((f) => ({ ...f, model: ev.target.value }))} />
              </label>
              <label className="partner-form-field">
                <span>Farbe</span>
                <input className="partner-input" value={vehicleForm.color} onChange={(ev) => setVehicleForm((f) => ({ ...f, color: ev.target.value }))} />
              </label>
              <label className="partner-form-field">
                <span>Typ</span>
                <select
                  className="partner-input"
                  value={vehicleForm.vehicleType}
                  onChange={(ev) => setVehicleForm((f) => ({ ...f, vehicleType: ev.target.value }))}
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="partner-form-field">
                <span>Fahrzeugklasse</span>
                <select
                  className="partner-input"
                  value={vehicleForm.vehicleClass}
                  onChange={(ev) => setVehicleForm((f) => ({ ...f, vehicleClass: ev.target.value }))}
                >
                  {VEHICLE_CLASSES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="partner-form-field">
                <span>Konzessionsnummer (Pflicht)</span>
                <input
                  className="partner-input"
                  value={vehicleForm.konzessionNumber}
                  onChange={(ev) => setVehicleForm((f) => ({ ...f, konzessionNumber: ev.target.value }))}
                  required
                />
              </label>
              <label className="partner-form-field partner-form-field--span2">
                <span>Konzession / Konzessionsnachweis (PDF, Pflicht)</span>
                <input ref={vehicleCreateConcessionPdfRef} className="partner-input" type="file" accept="application/pdf" />
              </label>
              <label className="partner-form-field partner-form-field--span2">
                <span>Fahrzeugschein / Zulassungsbescheinigung (PDF, Pflicht)</span>
                <input ref={vehicleCreateRegistrationPdfRef} className="partner-input" type="file" accept="application/pdf" />
              </label>
              <label className="partner-form-field">
                <span>Nächste HU (TÜV)</span>
                <input
                  className="partner-input"
                  type="date"
                  value={vehicleForm.nextInspectionDate}
                  onChange={(ev) => setVehicleForm((f) => ({ ...f, nextInspectionDate: ev.target.value }))}
                />
              </label>
            </div>
            <p className="partner-muted" style={{ margin: "4px 0 8px", maxWidth: 720, lineHeight: 1.45, fontSize: 13 }}>
              {VEHICLE_LEGAL_HINT}
            </p>
            <p className="partner-muted" style={{ margin: "4px 0 8px", maxWidth: 720, lineHeight: 1.45, fontSize: 13 }}>
              Nach dem Speichern wird das Fahrzeug bei Onroda zur Prüfung eingereicht. Sie können Fahrzeuge nicht selbst freischalten — die Freigabe erfolgt
              nur durch Onroda.
            </p>
            <p className="partner-muted" style={{ margin: "4px 0 8px", maxWidth: 720, lineHeight: 1.45, fontSize: 13 }}>
              Hochgeladene Unterlagen können Sie durch eine neue Version ersetzen; Onroda behält ältere Versionen zur Nachvollziehbarkeit. Eine Löschung von
              Nachweisen durch Partner ist nicht vorgesehen.
            </p>
            <p className="partner-muted" style={{ margin: "4px 0 8px", maxWidth: 720, lineHeight: 1.45, fontSize: 13 }}>
              Die Konzessionsnummer wird beim Anlegen festgelegt und kann danach nur von Onroda geändert werden.
            </p>
            <button type="submit" className="partner-btn-primary" style={{ marginTop: 8 }}>
              Fahrzeug anlegen &amp; einreichen
            </button>
          </form>
        </div>
      ) : null}

      {canManage ? (
        <form className="partner-form partner-assign-card" onSubmit={submitAssignment}>
          <h3 className="partner-assign-card__title">Fahrer zu Fahrzeug zuweisen</h3>
          <div className="partner-form-grid partner-assign-card__grid">
            <label className="partner-form-field">
              <span>Fahrer</span>
              <select
                className="partner-input"
                value={assignForm.driverId}
                onChange={(ev) => setAssignForm((f) => ({ ...f, driverId: ev.target.value }))}
                required
              >
                <option value="">— wählen —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.firstName} {d.lastName} ({d.email})
                  </option>
                ))}
              </select>
            </label>
            <label className="partner-form-field">
              <span>Fahrzeug</span>
              <select
                className="partner-input"
                value={assignForm.vehicleId}
                onChange={(ev) => setAssignForm((f) => ({ ...f, vehicleId: ev.target.value }))}
                required
              >
                <option value="">— wählen —</option>
                {vehicles
                  .filter((v) => v.approvalStatus === "approved")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleAssignLabel(v)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <p className="partner-assign-card__hint">Nur freigegebene Fahrzeuge auswählbar</p>
          <button type="submit" className="partner-btn-primary partner-assign-card__submit">
            Zuweisen
          </button>
        </form>
      ) : null}

      <h3 className="partner-section-h" style={{ margin: "0 0 8px" }}>
        Fahrzeugliste
      </h3>
      <div className="partner-table-wrap">
        <table className="partner-table">
          <thead>
            <tr>
              <th>Kennzeichen</th>
              <th>Status</th>
              <th>Modell</th>
              <th>Typ</th>
              <th>Klasse</th>
              <th>Konzession</th>
              <th>HU</th>
              <th>Aktueller Fahrer</th>
              {canManage ? <th>Aktionen</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canManage ? 9 : 8}>Laden …</td>
              </tr>
            ) : vehicles.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 9 : 8}>Keine Fahrzeuge.</td>
              </tr>
            ) : (
              vehicles.map((v) => {
                const a = assignments.find((x) => x.vehicleId === v.id);
                const drv = a ? drivers.find((d) => d.id === a.driverId) : null;
                const kz = vehicleKonzessionLabel(v);
                const isEditing = editingVehicleId === v.id;
                return (
                  <tr key={v.id}>
                    <td>{v.licensePlate}</td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span className={`partner-pill partner-pill--${vehicleStatusTone(v)}`} style={{ alignSelf: "flex-start" }}>
                          {vehicleStatusDe(v)}
                        </span>
                        {v.approvalStatus === "pending_approval" ? (
                          <span className="partner-muted" style={{ fontSize: 12, maxWidth: 260, lineHeight: 1.35 }}>
                            Wartet auf Freigabe durch Onroda
                          </span>
                        ) : null}
                        {v.approvalStatus === "missing_documents" ? (
                          <span className="partner-muted" style={{ fontSize: 12, maxWidth: 280, lineHeight: 1.35 }}>
                            Bitte fehlende Unterlagen nachreichen und erneut einreichen.
                          </span>
                        ) : null}
                        {v.approvalStatus === "rejected" && v.rejectionReason ? (
                          <span className="partner-muted" style={{ fontSize: 12, maxWidth: 280, lineHeight: 1.35 }}>
                            {v.rejectionReason}
                          </span>
                        ) : null}
                        {v.approvalStatus === "blocked" && v.blockReason ? (
                          <span className="partner-muted" style={{ fontSize: 12, maxWidth: 280, lineHeight: 1.35 }}>
                            Sperrgrund: {v.blockReason}
                          </span>
                        ) : null}
                        {v.approvalStatus === "approved" ? (
                          <span className="partner-muted" style={{ fontSize: 12, maxWidth: 280, lineHeight: 1.35 }}>
                            {v.isActive ? "Aktiv: in Fahrer-App sichtbar." : "Deaktiviert: nicht in Fahrer-App sichtbar."}
                          </span>
                        ) : null}
                        {canManage &&
                        (v.approvalStatus === "draft" ||
                          v.approvalStatus === "rejected" ||
                          v.approvalStatus === "pending_approval" ||
                          v.approvalStatus === "missing_documents") ? (
                          <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            {VEHICLE_DOCUMENT_KIND_OPTIONS.map((opt) => (
                              <label
                                key={opt.value}
                                className="partner-link-btn partner-link-btn--solid"
                                style={{ cursor: "pointer", fontSize: 12 }}
                                title={opt.label}
                              >
                                {opt.value === "concession"
                                  ? "Konzession"
                                  : opt.value === "registration"
                                    ? "Fahrzeugschein"
                                    : opt.label.replace(/\s*\(optional\)\s*$/i, "")}
                                <input
                                  type="file"
                                  accept="application/pdf"
                                  style={{ display: "none" }}
                                  onChange={(ev) => void uploadVehicleDocument(v.id, opt.value, ev)}
                                />
                              </label>
                            ))}
                            {v.approvalStatus === "draft" || v.approvalStatus === "rejected" || v.approvalStatus === "missing_documents" ? (
                              <button type="button" className="partner-btn-secondary partner-btn-secondary--sm" onClick={() => void submitVehicleApproval(v.id)}>
                                {v.approvalStatus === "missing_documents" ? "Erneut einreichen" : "Einreichen"}
                              </button>
                            ) : null}
                          </span>
                        ) : null}
                        {canManage && v.approvalStatus === "approved" ? (
                          <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            <button
                              type="button"
                              className="partner-btn-secondary partner-btn-secondary--sm"
                              onClick={() => void setVehicleActive(v.id, !v.isActive)}
                            >
                              {v.isActive ? "Deaktivieren" : "Aktivieren"}
                            </button>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <input
                            className="partner-input"
                            value={editForm.model}
                            onChange={(ev) => setEditForm((f) => ({ ...f, model: ev.target.value }))}
                            placeholder="Modell"
                          />
                          <input
                            className="partner-input"
                            value={editForm.color}
                            onChange={(ev) => setEditForm((f) => ({ ...f, color: ev.target.value }))}
                            placeholder="Farbe"
                          />
                        </div>
                      ) : (
                        v.model || "—"
                      )}
                    </td>
                    <td>{VEHICLE_TYPES.find((t) => t.value === v.vehicleType)?.label ?? v.vehicleType}</td>
                    <td>{VEHICLE_CLASSES.find((t) => t.value === v.vehicleClass)?.label ?? v.vehicleClass}</td>
                    <td>
                      <div>{kz}</div>
                      <span className="partner-muted" style={{ fontSize: 11 }}>
                        Nur Onroda änderbar
                      </span>
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          className="partner-input"
                          type="date"
                          value={editForm.nextInspectionDate}
                          onChange={(ev) => setEditForm((f) => ({ ...f, nextInspectionDate: ev.target.value }))}
                        />
                      ) : (
                        v.nextInspectionDate || "—"
                      )}
                    </td>
                    <td>
                      {drv ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span className="partner-pill partner-pill--soft">Fahrer</span>
                            <span>
                              {drv.firstName} {drv.lastName}
                            </span>
                            {canManage ? (
                              <button
                                type="button"
                                className="partner-btn-secondary partner-btn-secondary--sm partner-btn-secondary--muted"
                                onClick={() => clearAssignment(drv.id)}
                              >
                                Zuweisung löschen
                              </button>
                            ) : null}
                          </div>
                          {v.approvalStatus !== "approved" && drv.readiness?.ready === false ? (
                            <span className="partner-muted" style={{ fontSize: 11, maxWidth: 280, lineHeight: 1.35 }}>
                              Zugeordneter Fahrer ist nicht einsatzbereit, solange dieses Fahrzeug nicht freigegeben ist oder gesperrt bleibt (Details siehe
                              Fahrerliste, Spalte „Hinweis“).
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    {canManage ? (
                      <td>
                        {isEditing ? (
                          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            <button
                              type="button"
                              className="partner-btn-primary partner-btn-secondary--sm"
                              disabled={editBusy}
                              onClick={() => void saveVehicleEdit(v.id)}
                            >
                              {editBusy ? "…" : "Speichern"}
                            </button>
                            <button
                              type="button"
                              className="partner-btn-secondary partner-btn-secondary--sm"
                              disabled={editBusy}
                              onClick={() => setEditingVehicleId(null)}
                            >
                              Abbrechen
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="partner-btn-secondary partner-btn-secondary--sm"
                            onClick={() => openVehicleEdit(v)}
                          >
                            Bearbeiten
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
