import { useEffect, useState } from "react";
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

function ruleTypeLabel(value) {
  return RULE_TYPE_LABELS[value] ?? value ?? "—";
}

export default function FaresPage() {
  const [form, setForm] = useState({
    name: "",
    ruleType: "official_metered_tariff",
    isRequiredArea: "Ja",
    fixedPriceAllowed: "Prüfen",
    status: "aktiv",
  });

  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAddArea(e) {
    e.preventDefault();

    if (!form.name.trim()) {
      setError("Bitte einen Gebietsnamen eingeben.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const res = await fetch(API_URL, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: form.name.trim(),
          ruleType: form.ruleType,
          isRequiredArea: form.isRequiredArea,
          fixedPriceAllowed: form.fixedPriceAllowed,
          status: form.status,
        }),
      });

      if (!res.ok) {
        throw new Error("Das Gebiet konnte nicht gespeichert werden.");
      }

      const data = await res.json();
      setAreas(Array.isArray(data.items) ? data.items : []);

      setForm({
        name: "",
        ruleType: "official_metered_tariff",
        isRequiredArea: "Ja",
        fixedPriceAllowed: "Prüfen",
        status: "aktiv",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
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
          <div className="admin-stat-value">{areas.length}</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-label">Amtliche Tarife</div>
          <div className="admin-stat-value">{officialCount}</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-label">Vertragstarife</div>
          <div className="admin-stat-value">{contractCount}</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-label">Sonderregeln</div>
          <div className="admin-stat-value">{specialCount}</div>
        </div>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Gebiet hinzufügen</div>

        <form onSubmit={handleAddArea} className="admin-form-grid">
          <input
            className="admin-input"
            placeholder="z. B. Stadt oder Region"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
          />

          <select
            className="admin-select"
            value={form.ruleType}
            onChange={(e) => handleChange("ruleType", e.target.value)}
          >
            {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            className="admin-select"
            value={form.isRequiredArea}
            onChange={(e) => handleChange("isRequiredArea", e.target.value)}
          >
            <option value="Ja">Pflichtfahrgebiet: Ja</option>
            <option value="Nein">Pflichtfahrgebiet: Nein</option>
            <option value="Prüfen">Pflichtfahrgebiet: Prüfen</option>
          </select>

          <select
            className="admin-select"
            value={form.fixedPriceAllowed}
            onChange={(e) => handleChange("fixedPriceAllowed", e.target.value)}
          >
            <option value="Ja">Festpreis erlaubt</option>
            <option value="Nein">Kein Festpreis</option>
            <option value="Prüfen">Festpreis: Fall prüfen</option>
          </select>

          <select className="admin-select" value={form.status} onChange={(e) => handleChange("status", e.target.value)}>
            <option value="aktiv">Aktiv</option>
            <option value="inaktiv">Inaktiv</option>
            <option value="regelbasiert">Regelbasiert</option>
          </select>

          <button type="submit" className="admin-btn-primary" disabled={saving}>
            {saving ? "Wird gespeichert …" : "Hinzufügen"}
          </button>
        </form>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Aktuelle Gebiete</div>

        {loading ? (
          <div className="admin-muted">Gebiete werden geladen …</div>
        ) : (
          <div className="admin-data-table">
            <div className="admin-data-table__head admin-cs-grid admin-cs-grid--fare-areas">
              <div>Gebiet</div>
              <div>Regeltyp</div>
              <div>Pflichtfahrt</div>
              <div>Festpreis</div>
              <div>Status</div>
            </div>

            {areas.map((a) => (
              <div key={a.id} className="admin-data-table__row admin-cs-grid admin-cs-grid--fare-areas">
                <div>{a.name}</div>
                <div>{ruleTypeLabel(a.ruleType)}</div>
                <div>{a.isRequiredArea}</div>
                <div>{a.fixedPriceAllowed}</div>
                <div>{a.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
