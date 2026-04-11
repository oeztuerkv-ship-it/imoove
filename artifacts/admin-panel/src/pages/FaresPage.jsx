import { useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";

const API_URL = `${API_BASE}/admin/fare-areas`;

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

      const res = await fetch(API_URL);
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
      setError("Gebietsname fehlt");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          ruleType: form.ruleType,
          isRequiredArea: form.isRequiredArea,
          fixedPriceAllowed: form.fixedPriceAllowed,
          status: form.status,
        }),
      });

      if (!res.ok) {
        throw new Error("Gebiet konnte nicht gespeichert werden");
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

  const officialCount = areas.filter(
    (a) => a.ruleType === "official_metered_tariff"
  ).length;

  const contractCount = areas.filter(
    (a) =>
      a.ruleType === "health_contract_rate" ||
      a.ruleType === "partner_contract_rate"
  ).length;

  const specialCount = areas.filter(
    (a) =>
      a.ruleType === "free_price_outside_area" ||
      a.ruleType === "special_manual_rule" ||
      a.ruleType === "official_fixed_price" ||
      a.ruleType === "tariff_corridor"
  ).length;

  return (
    <div className="admin-page admin-page--loose">
      <header>
        <h2 className="admin-page-section-title">Tarifregeln & Gebiete</h2>
        <p className="admin-page-section-sub">
          Verwaltung von Pflichtfahrgebieten, Preisregel-Typen und Vertragstarifen.
        </p>
      </header>

      {error ? <div className="admin-error-banner">Fehler: {error}</div> : null}

      <div className="admin-stat-grid admin-stat-grid--wide">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Aktive Gebiete</div>
          <div className="admin-stat-value">{areas.length}</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-label">Offizielle Tarife</div>
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
        <div className="admin-panel-card__title">Neues Gebiet hinzufügen</div>

        <form onSubmit={handleAddArea} className="admin-form-grid">
          <input
            className="admin-input"
            placeholder="Gebiet (z. B. Stuttgart)"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
          />

          <select
            className="admin-select"
            value={form.ruleType}
            onChange={(e) => handleChange("ruleType", e.target.value)}
          >
            <option value="official_metered_tariff">official_metered_tariff</option>
            <option value="official_fixed_price">official_fixed_price</option>
            <option value="tariff_corridor">tariff_corridor</option>
            <option value="free_price_outside_area">free_price_outside_area</option>
            <option value="health_contract_rate">health_contract_rate</option>
            <option value="partner_contract_rate">partner_contract_rate</option>
            <option value="special_manual_rule">special_manual_rule</option>
          </select>

          <select
            className="admin-select"
            value={form.isRequiredArea}
            onChange={(e) => handleChange("isRequiredArea", e.target.value)}
          >
            <option value="Ja">Pflichtgebiet: Ja</option>
            <option value="Nein">Pflichtgebiet: Nein</option>
            <option value="Prüfen">Pflichtgebiet: Prüfen</option>
          </select>

          <select
            className="admin-select"
            value={form.fixedPriceAllowed}
            onChange={(e) => handleChange("fixedPriceAllowed", e.target.value)}
          >
            <option value="Ja">Festpreis: Ja</option>
            <option value="Nein">Festpreis: Nein</option>
            <option value="Prüfen">Festpreis: Prüfen</option>
          </select>

          <select
            className="admin-select"
            value={form.status}
            onChange={(e) => handleChange("status", e.target.value)}
          >
            <option value="aktiv">aktiv</option>
            <option value="inaktiv">inaktiv</option>
            <option value="regelbasiert">regelbasiert</option>
          </select>

          <button type="submit" className="admin-btn-primary" disabled={saving}>
            {saving ? "Speichert..." : "+ Hinzufügen"}
          </button>
        </form>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Aktuelle Regeln</div>

        {loading ? (
          <div className="admin-muted">Lade Gebiete...</div>
        ) : (
          <div className="admin-data-table">
            <div className="admin-data-table__head admin-cs-grid admin-cs-grid--fare-areas">
              <div>Gebiet</div>
              <div>Regeltyp</div>
              <div>Pflicht</div>
              <div>Festpreis</div>
              <div>Status</div>
            </div>

            {areas.map((a) => (
              <div
                key={a.id}
                className="admin-data-table__row admin-cs-grid admin-cs-grid--fare-areas"
              >
                <div>{a.name}</div>
                <div>{a.ruleType}</div>
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
