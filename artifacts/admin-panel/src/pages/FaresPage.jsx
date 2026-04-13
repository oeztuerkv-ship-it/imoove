import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const API_URL = `${API_BASE}/admin/fare-areas`;

const RULE_TYPE_LABELS = {
  official_metered_tariff: "Amtliches Taxameter-Tarif",
  official_fixed_price: "Amtlicher Festpreis",
  tariff_corridor: "Preiskorridor",
  free_price_outside_area: "Freie Preiswahl außerhalb",
  health_contract_rate: "Vertragstarif (Gesundheit)",
  partner_contract_rate: "Vertragstarif (Partner)",
  special_manual_rule: "Sonderregel (manuell)",
};

const emptyForm = () => ({
  name: "",
  ruleType: "official_metered_tariff",
  isRequiredArea: "Ja",
  fixedPriceAllowed: "Prüfen",
  status: "aktiv",
  isDefault: false,
  baseFareEur: "4.30",
  rateFirstKmEur: "3.00",
  rateAfterKmEur: "2.50",
  thresholdKm: "4",
  waitingPerHourEur: "38",
  serviceFeeEur: "0",
  onrodaBaseFareEur: "3.50",
  onrodaPerKmEur: "2.20",
  onrodaMinFareEur: "0",
  manualFixedPriceEur: "",
});

function ruleTypeLabel(value) {
  return RULE_TYPE_LABELS[value] ?? value ?? "—";
}

export default function FaresPage() {
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);

  const ruleTypeOptionsSorted = useMemo(
    () =>
      Object.entries(RULE_TYPE_LABELS).sort((a, b) =>
        a[1].localeCompare(b[1], "de", { sensitivity: "base" }),
      ),
    [],
  );

  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeProfile, setActiveProfile] = useState(null);

  useEffect(() => {
    loadAreas();
  }, []);

  async function loadAreas() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(API_URL, { headers: adminApiHeaders() });
      if (!res.ok) {
        throw new Error("Gebiete konnten nicht geladen werden");
      }

      const data = await res.json();
      setAreas(Array.isArray(data.items) ? data.items : []);
      setActiveProfile(data?.activeProfile ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startEdit(area) {
    setEditingId(area.id);
    setForm({
      name: area.name ?? "",
      ruleType: area.ruleType ?? "official_metered_tariff",
      isRequiredArea: area.isRequiredArea ?? "Ja",
      fixedPriceAllowed: area.fixedPriceAllowed ?? "Prüfen",
      status: area.status ?? "aktiv",
      isDefault: !!area.isDefault,
      baseFareEur: String(area.baseFareEur ?? 4.3),
      rateFirstKmEur: String(area.rateFirstKmEur ?? 3),
      rateAfterKmEur: String(area.rateAfterKmEur ?? 2.5),
      thresholdKm: String(area.thresholdKm ?? 4),
      waitingPerHourEur: String(area.waitingPerHourEur ?? 38),
      serviceFeeEur: String(area.serviceFeeEur ?? 0),
      onrodaBaseFareEur: String(area.onrodaBaseFareEur ?? 3.5),
      onrodaPerKmEur: String(area.onrodaPerKmEur ?? 2.2),
      onrodaMinFareEur: String(area.onrodaMinFareEur ?? 0),
      manualFixedPriceEur: area.manualFixedPriceEur == null ? "" : String(area.manualFixedPriceEur),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function patchArea(id, partial) {
    setError("");
    try {
      const res = await fetch(`${API_URL}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(partial),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Aktualisierung fehlgeschlagen (${res.status}).`);
      }
      if (Array.isArray(data.items)) setAreas(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
  }

  async function handleSaveArea(e) {
    e.preventDefault();

    if (!form.name.trim()) {
      setError("Bitte einen Gebietsnamen eingeben.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      if (editingId) {
        const res = await fetch(`${API_URL}/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: adminApiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            name: form.name.trim(),
            ruleType: form.ruleType,
            isRequiredArea: form.isRequiredArea,
            fixedPriceAllowed: form.fixedPriceAllowed,
            status: form.status,
            isDefault: !!form.isDefault,
            baseFareEur: Number(form.baseFareEur),
            rateFirstKmEur: Number(form.rateFirstKmEur),
            rateAfterKmEur: Number(form.rateAfterKmEur),
            thresholdKm: Number(form.thresholdKm),
            waitingPerHourEur: Number(form.waitingPerHourEur),
            serviceFeeEur: Number(form.serviceFeeEur),
            onrodaBaseFareEur: Number(form.onrodaBaseFareEur),
            onrodaPerKmEur: Number(form.onrodaPerKmEur),
            onrodaMinFareEur: Number(form.onrodaMinFareEur),
            manualFixedPriceEur: form.manualFixedPriceEur.trim() ? Number(form.manualFixedPriceEur) : null,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "Das Gebiet konnte nicht gespeichert werden.");
        }
        if (Array.isArray(data.items)) setAreas(data.items);
        cancelEdit();
        return;
      }

      const res = await fetch(API_URL, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: form.name.trim(),
          ruleType: form.ruleType,
          isRequiredArea: form.isRequiredArea,
          fixedPriceAllowed: form.fixedPriceAllowed,
          status: form.status,
          isDefault: !!form.isDefault,
          baseFareEur: Number(form.baseFareEur),
          rateFirstKmEur: Number(form.rateFirstKmEur),
          rateAfterKmEur: Number(form.rateAfterKmEur),
          thresholdKm: Number(form.thresholdKm),
          waitingPerHourEur: Number(form.waitingPerHourEur),
          serviceFeeEur: Number(form.serviceFeeEur),
          onrodaBaseFareEur: Number(form.onrodaBaseFareEur),
          onrodaPerKmEur: Number(form.onrodaPerKmEur),
          onrodaMinFareEur: Number(form.onrodaMinFareEur),
          manualFixedPriceEur: form.manualFixedPriceEur.trim() ? Number(form.manualFixedPriceEur) : null,
        }),
      });

      if (!res.ok) {
        throw new Error("Das Gebiet konnte nicht gespeichert werden.");
      }

      const data = await res.json();
      setAreas(Array.isArray(data.items) ? data.items : []);
      setForm(emptyForm());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteArea(area) {
    const ok = window.confirm(
      `Gebiet „${area.name}“ wirklich löschen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden.`,
    );
    if (!ok) return;
    setError("");
    try {
      const res = await fetch(`${API_URL}/${encodeURIComponent(area.id)}`, {
        method: "DELETE",
        headers: adminApiHeaders(),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409) {
        setError(
          data?.message ||
            "Löschen nicht möglich: Das Gebiet ist noch Fahrten zugeordnet (internes Feld fareAreaId).",
        );
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error || `Löschen fehlgeschlagen (${res.status}).`);
      }
      if (Array.isArray(data.items)) setAreas(data.items);
      if (editingId === area.id) cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  async function toggleStatus(area, nextChecked) {
    await patchArea(area.id, { status: nextChecked ? "aktiv" : "inaktiv" });
  }

  const officialCount = areas.filter((a) => a.ruleType === "official_metered_tariff").length;

  const contractCount = areas.filter(
    (a) => a.ruleType === "health_contract_rate" || a.ruleType === "partner_contract_rate",
  ).length;

  const specialCount = areas.filter(
    (a) =>
      a.ruleType === "free_price_outside_area" ||
      a.ruleType === "special_manual_rule" ||
      a.ruleType === "official_fixed_price" ||
      a.ruleType === "tariff_corridor",
  ).length;

  return (
    <div className="admin-page admin-page--loose">
      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-stat-grid admin-stat-grid--wide">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Gebiete gesamt</div>
          <div className="admin-stat-value admin-crisp-numeric">{areas.length}</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-label">Amtliche Tarife</div>
          <div className="admin-stat-value admin-crisp-numeric">{officialCount}</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-label">Vertragstarife</div>
          <div className="admin-stat-value admin-crisp-numeric">{contractCount}</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-label">Sonderregeln</div>
          <div className="admin-stat-value admin-crisp-numeric">{specialCount}</div>
        </div>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">{editingId ? "Gebiet bearbeiten" : "Gebiet hinzufügen"}</div>
        {activeProfile ? (
          <div className="admin-info-banner" style={{ marginBottom: 12 }}>
            Aktiver App-Tarif: <strong>{activeProfile.areaName}</strong>
          </div>
        ) : null}

        <form onSubmit={handleSaveArea} className="admin-fares-form">
          <div className="admin-fares-hero">
            <label className="admin-field-label" htmlFor="fare-area-name">
              Gebiet / Stadt / Region
            </label>
            <input
              id="fare-area-name"
              className="admin-input admin-fares-hero-input"
              placeholder="z. B. Hannover, Region Süd, Flughafen …"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            <p className="admin-fares-hint">
              Hauptobjekt des Tarifs — Name und Einordnung stehen über allen Preisfeldern.
            </p>
          </div>

          <fieldset className="admin-fares-fieldset">
            <legend className="admin-fares-legend">Regeltyp &amp; Rahmen</legend>
            <div className="admin-fares-grid-2">
              <div>
                <label className="admin-field-label">Regeltyp</label>
                <select
                  className="admin-select"
                  value={form.ruleType}
                  onChange={(e) => handleChange("ruleType", e.target.value)}
                >
                  {ruleTypeOptionsSorted.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="admin-field-label">Status</label>
                <select className="admin-select" value={form.status} onChange={(e) => handleChange("status", e.target.value)}>
                  <option value="aktiv">Aktiv</option>
                  <option value="inaktiv">Inaktiv</option>
                  <option value="regelbasiert">Regelbasiert</option>
                </select>
              </div>
              <div>
                <label className="admin-field-label">Pflichtfahrgebiet</label>
                <select
                  className="admin-select"
                  value={form.isRequiredArea}
                  onChange={(e) => handleChange("isRequiredArea", e.target.value)}
                >
                  <option value="Ja">Ja</option>
                  <option value="Nein">Nein</option>
                  <option value="Prüfen">Prüfen</option>
                </select>
              </div>
              <div>
                <label className="admin-field-label">Festpreis im Gebiet</label>
                <select
                  className="admin-select"
                  value={form.fixedPriceAllowed}
                  onChange={(e) => handleChange("fixedPriceAllowed", e.target.value)}
                >
                  <option value="Ja">Erlaubt</option>
                  <option value="Nein">Nicht erlaubt</option>
                  <option value="Prüfen">Fall prüfen</option>
                </select>
              </div>
            </div>
            <label className="admin-inline-check admin-fares-inline-check">
              <input
                type="checkbox"
                checked={!!form.isDefault}
                onChange={(e) => handleChange("isDefault", e.target.checked)}
              />
              <span>Standardtarif für die Onroda-App</span>
            </label>
          </fieldset>

          <fieldset className="admin-fares-fieldset">
            <legend className="admin-fares-legend">Amtlicher Taxameter — Berechnung</legend>
            <div className="admin-fares-subhead">Grundpreis &amp; Kilometer</div>
            <p className="admin-fares-hint admin-fares-hint--tight">
              Einstiegspreis, dann Staffelung ab Erreichen der Kilometer-Schwelle.
            </p>
            <div className="admin-fares-grid-num admin-fares-grid-num--2">
              <div>
                <label className="admin-field-label">Grundpreis (€)</label>
                <input className="admin-input" type="number" step="0.01" value={form.baseFareEur} onChange={(e) => handleChange("baseFareEur", e.target.value)} />
              </div>
              <div>
                <label className="admin-field-label">Schwelle (km)</label>
                <input className="admin-input" type="number" step="0.1" value={form.thresholdKm} onChange={(e) => handleChange("thresholdKm", e.target.value)} />
              </div>
              <div>
                <label className="admin-field-label">Preis / km bis Schwelle (€)</label>
                <input className="admin-input" type="number" step="0.01" value={form.rateFirstKmEur} onChange={(e) => handleChange("rateFirstKmEur", e.target.value)} />
              </div>
              <div>
                <label className="admin-field-label">Preis / km ab Schwelle (€)</label>
                <input className="admin-input" type="number" step="0.01" value={form.rateAfterKmEur} onChange={(e) => handleChange("rateAfterKmEur", e.target.value)} />
              </div>
            </div>
            <div className="admin-fares-subhead">Wartezeit &amp; Zuschläge</div>
            <p className="admin-fares-hint admin-fares-hint--tight">Wartezeit pro Stunde und optionale Servicegebühr.</p>
            <div className="admin-fares-grid-num admin-fares-grid-num--2">
              <div>
                <label className="admin-field-label">Wartezeit (€ / h)</label>
                <input className="admin-input" type="number" step="0.01" value={form.waitingPerHourEur} onChange={(e) => handleChange("waitingPerHourEur", e.target.value)} />
              </div>
              <div>
                <label className="admin-field-label">Servicegebühr (€)</label>
                <input className="admin-input" type="number" step="0.01" value={form.serviceFeeEur} onChange={(e) => handleChange("serviceFeeEur", e.target.value)} />
              </div>
            </div>
          </fieldset>

          <fieldset className="admin-fares-fieldset">
            <legend className="admin-fares-legend">Onroda-App Tarif</legend>
            <div className="admin-fares-subhead">Basis &amp; Preis pro km</div>
            <div className="admin-fares-grid-num admin-fares-grid-num--2">
              <div>
                <label className="admin-field-label">Basispreis App (€)</label>
                <input className="admin-input" type="number" step="0.01" value={form.onrodaBaseFareEur} onChange={(e) => handleChange("onrodaBaseFareEur", e.target.value)} />
              </div>
              <div>
                <label className="admin-field-label">Preis / km App (€)</label>
                <input className="admin-input" type="number" step="0.01" value={form.onrodaPerKmEur} onChange={(e) => handleChange("onrodaPerKmEur", e.target.value)} />
              </div>
            </div>
            <div className="admin-fares-subhead">Mindestpreis</div>
            <p className="admin-fares-hint admin-fares-hint--tight">Untergrenze für die App-Berechnung (0 = keine Mindestgrenze).</p>
            <div className="admin-fares-fix-row">
              <input className="admin-input" type="number" step="0.01" value={form.onrodaMinFareEur} onChange={(e) => handleChange("onrodaMinFareEur", e.target.value)} />
            </div>
          </fieldset>

          <fieldset className="admin-fares-fieldset admin-fares-fieldset--fix">
            <legend className="admin-fares-legend">Fixpreis (manuell)</legend>
            <p className="admin-fares-hint">
              Optionaler fester Betrag — eigenständig zur Kilometer-Staffel; leer lassen, wenn nicht genutzt.
            </p>
            <div className="admin-fares-fix-row">
              <input
                className="admin-input"
                type="number"
                step="0.01"
                placeholder="z. B. 45,00"
                value={form.manualFixedPriceEur}
                onChange={(e) => handleChange("manualFixedPriceEur", e.target.value)}
              />
            </div>
          </fieldset>

          <div className="admin-toolbar-row admin-toolbar-row--form-span">
            <button type="submit" className="admin-btn-primary" disabled={saving}>
              {saving ? "Wird gespeichert …" : editingId ? "Änderungen speichern" : "Hinzufügen"}
            </button>
            {editingId ? (
              <button type="button" className="admin-btn-refresh" onClick={cancelEdit}>
                Bearbeiten abbrechen
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Aktuelle Gebiete</div>

        {loading ? (
          <div className="admin-muted">Gebiete werden geladen …</div>
        ) : (
          <div className="admin-table-scroll">
            <div className="admin-data-table">
              <div className="admin-data-table__head admin-cs-grid admin-cs-grid--fare-areas-managed">
                <div>Gebiet</div>
                <div>Regeltyp</div>
                <div>Tarif</div>
                <div>Fixpreis</div>
                <div>Status</div>
                <div>Aktionen</div>
              </div>

              {areas.map((a) => (
                <div key={a.id} className="admin-data-table__row admin-cs-grid admin-cs-grid--fare-areas-managed">
                  <div className="admin-ellipsis" title={a.name}>
                    {a.name}
                  </div>
                  <div className="admin-ellipsis" title={ruleTypeLabel(a.ruleType)}>
                    {ruleTypeLabel(a.ruleType)}
                  </div>
                  <div>
                    {Number(a.baseFareEur ?? 0).toFixed(2)} + {Number(a.rateFirstKmEur ?? 0).toFixed(2)} /km
                  </div>
                  <div>{a.manualFixedPriceEur != null ? `${Number(a.manualFixedPriceEur).toFixed(2)} €` : "—"}</div>
                  <div>
                    {a.status === "regelbasiert" ? (
                      <span className="admin-muted" title="Status nur über Bearbeiten ändern">
                        regelbasiert
                      </span>
                    ) : (
                      <label className="admin-switch" title={a.status === "aktiv" ? "Aktiv" : "Inaktiv"}>
                        <input
                          type="checkbox"
                          checked={a.status === "aktiv"}
                          onChange={(e) => void toggleStatus(a, e.target.checked)}
                        />
                        <span className="admin-switch__slider" aria-hidden />
                      </label>
                    )}
                    {a.isDefault ? <span className="admin-table-sub"> Standard</span> : null}
                  </div>
                  <div className="admin-toolbar-row">
                    <button type="button" className="admin-btn-refresh" onClick={() => startEdit(a)}>
                      Bearbeiten
                    </button>
                    <button type="button" className="admin-btn-danger" onClick={() => void handleDeleteArea(a)}>
                      Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
