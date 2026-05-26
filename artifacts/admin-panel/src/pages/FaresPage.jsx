import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const API_URL = `${API_BASE}/admin/fare-areas`;

const RULE_TYPE_LABELS = {
  official_metered_tariff: "Amtliches Taxameter-Tarif",
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

/** Deutsche Kommas und Leerzeichen; leere Pflichtfelder sind ungültig. */
function parseFareNumber(raw, label) {
  const s = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") {
    throw new Error(`Bitte bei „${label}“ eine Zahl eingeben.`);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new Error(`„${label}“ ist keine gültige Zahl (Beispiel: 1 oder 1.5).`);
  }
  return n;
}

function buildFareAreaNumericBody(form) {
  return {
    baseFareEur: parseFareNumber(form.baseFareEur, "Grundpreis (Taxameter)"),
    rateFirstKmEur: parseFareNumber(form.rateFirstKmEur, "Preis / km bis Schwelle"),
    rateAfterKmEur: parseFareNumber(form.rateAfterKmEur, "Preis / km ab Schwelle"),
    thresholdKm: parseFareNumber(form.thresholdKm, "Schwelle (km)"),
    waitingPerHourEur: parseFareNumber(form.waitingPerHourEur, "Wartezeit (€ / h)"),
    serviceFeeEur: parseFareNumber(form.serviceFeeEur, "Servicegebühr"),
    onrodaBaseFareEur: parseFareNumber(form.onrodaBaseFareEur, "Basispreis Onroda-App"),
    onrodaPerKmEur: parseFareNumber(form.onrodaPerKmEur, "Preis / km Onroda-App"),
    onrodaMinFareEur: parseFareNumber(form.onrodaMinFareEur, "Mindestpreis Onroda"),
    manualFixedPriceEur: (() => {
      const t = String(form.manualFixedPriceEur ?? "").trim();
      if (!t) return null;
      return parseFareNumber(t, "Optionaler Zusatzpreis (manuell)");
    })(),
  };
}

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

  async function refreshFareData() {
    const res = await fetch(API_URL, { headers: adminApiHeaders() });
    if (!res.ok) {
      throw new Error("Gebiete konnten nicht geladen werden");
    }
    const data = await res.json();
    setAreas(Array.isArray(data.items) ? data.items : []);
    setActiveProfile(data?.activeProfile ?? null);
  }

  async function loadAreas() {
    try {
      setLoading(true);
      setError("");
      await refreshFareData();
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
      try {
        await refreshFareData();
      } catch {
        /* Liste aus PATCH ist gültig; Banner ggf. nach manuellem Neuladen */
      }
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

    let nums;
    try {
      nums = buildFareAreaNumericBody(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ungültige Eingabe");
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
            ...nums,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "Das Gebiet konnte nicht gespeichert werden.");
        }
        await refreshFareData();
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
          ...nums,
        }),
      });

      if (!res.ok) {
        throw new Error("Das Gebiet konnte nicht gespeichert werden.");
      }

      const data = await res.json();
      setAreas(Array.isArray(data.items) ? data.items : []);
      await refreshFareData();
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
      try {
        await refreshFareData();
      } catch {
        /* ignore */
      }
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
            <p style={{ margin: "0 0 8px" }}>
              Aktiver App-Tarif (Kundenschätzung, öffentlich <code style={{ fontSize: "0.9em" }}>/fare-estimate</code>):{" "}
              <strong>{activeProfile.areaName}</strong>
            </p>
            <p className="admin-fares-hint admin-fares-hint--tight" style={{ margin: "0 0 8px" }}>
              Taxameter: Grund {Number(activeProfile.baseFareEur).toFixed(2)} € +{" "}
              {Number(activeProfile.rateFirstKmEur).toFixed(2)} €/km bis {Number(activeProfile.thresholdKm).toFixed(1)} km,
              danach {Number(activeProfile.rateAfterKmEur).toFixed(2)} €/km (plus Wartezeit/Service aus diesem Gebiet).
            </p>
            <p className="admin-fares-hint admin-fares-hint--tight" style={{ margin: 0 }}>
              Onroda-Fix (nur wenn die App die Fahrt außerhalb des Stuttgart–Esslingen-Korridors wertet): Basis{" "}
              {Number(activeProfile.onrodaBaseFareEur).toFixed(2)} € + {Number(activeProfile.onrodaPerKmEur).toFixed(2)} €/km.
            </p>
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
                <label className="admin-field-label">Zusatzpreis-Regel im Gebiet</label>
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
            <p className="admin-fares-hint admin-fares-hint--tight" style={{ marginTop: 10 }}>
              Genau ein aktives Gebiet sollte als Standard markiert sein: Die Kunden-App bezieht die Schätzung von diesem
              Datensatz. Änderungen an einem anderen Gebiet ohne Standard-Häkchen wirken in der App nicht, solange es
              nicht aktiv der Standardtarif ist.
            </p>
          </fieldset>

          <fieldset className="admin-fares-fieldset">
            <legend className="admin-fares-legend">Amtlicher Taxameter — Berechnung</legend>
            <div className="admin-fares-subhead">Grundpreis &amp; Kilometer</div>
            <p className="admin-fares-hint admin-fares-hint--tight">
              Einstiegspreis, dann Staffelung ab Erreichen der Kilometer-Schwelle. Für Test mit „1 € pro km überall“:
              Schwelle auf 0 setzen und beide Kilometerpreise (bis/ab Schwelle) auf 1 €.
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
            <p className="admin-fares-hint admin-fares-hint--tight">
              Gilt in der Kunden-App nur für Fahrten, die die App als außerhalb des Stuttgart–Esslingen-Tarifkorridors
              einstuft (Taxischätzung). Liegen Start und Ziel im Korridor, nutzt die Schätzung regulär den Taxitarif
              die Taxameter-Felder oben — dann greifen diese Basis-/km-Werte hier nicht.
            </p>
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
            <legend className="admin-fares-legend">Optionaler Zusatzpreis (manuell)</legend>
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
                <div>Zusatzpreis</div>
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
