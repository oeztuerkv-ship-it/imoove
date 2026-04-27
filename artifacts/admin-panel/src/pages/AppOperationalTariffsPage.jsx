import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;

const emptySurcharge = { enabled: false, percent: 0 };

function n(v) {
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

const emptyRegionForm = {
  active: true,
  baseFare: 3.5,
  perKm: 2.2,
  perMin: 0.4,
  minFare: 8.0,
  kmPricingModel: "single",
  surcharges: {
    night: { ...emptySurcharge, enabled: true, percent: 20 },
    weekend: { ...emptySurcharge, enabled: true, percent: 10 },
  },
  cancellationFeeEur: 0,
};

export default function AppOperationalTariffsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [config, setConfig] = useState(/** @type {Record<string, unknown> | null} */ (null));
  const [serviceRegions, setServiceRegions] = useState(/** @type {Array<{ id: string; label: string; isActive: boolean }>} */ ([]));
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [tariffsActive, setTariffsActive] = useState(true);
  const [form, setForm] = useState(/** @type {Record<string, unknown>} */ ({}));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      setConfig(data.config);
      setServiceRegions(Array.isArray(data.serviceRegions) ? data.serviceRegions : []);
      if (data.config?.tariffs && typeof data.config.tariffs === "object" && "active" in (data.config.tariffs)) {
        setTariffsActive(data.config.tariffs.active !== false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const first = serviceRegions[0];
    if (first && !selectedRegionId) setSelectedRegionId(first.id);
  }, [serviceRegions, selectedRegionId]);

  useEffect(() => {
    if (!config || !selectedRegionId) {
      setForm({ ...emptyRegionForm });
      return;
    }
    const tr = config.tariffs && typeof config.tariffs === "object" ? config.tariffs : {};
    const bsr = tr && typeof tr.byServiceRegion === "object" ? tr.byServiceRegion : {};
    const existing = bsr[selectedRegionId] && typeof bsr[selectedRegionId] === "object" ? bsr[selectedRegionId] : {};
    const s = /** @type {Record<string, unknown>} */ (existing);
    setForm({
      ...emptyRegionForm,
      baseFare: s.baseFare != null ? s.baseFare : emptyRegionForm.baseFare,
      perKm: s.perKm != null ? s.perKm : s.rateFirstPerKm != null ? s.rateFirstPerKm : emptyRegionForm.perKm,
      perMin: s.perMin != null ? s.perMin : s.pricePerMinute != null ? s.pricePerMinute : emptyRegionForm.perMin,
      minFare: s.minFare != null ? s.minFare : s.minPrice != null ? s.minPrice : emptyRegionForm.minFare,
      active: s.active !== false,
      kmPricingModel: s.kmPricingModel === "two_tier" ? "two_tier" : "single",
      surcharges: {
        night: { ...emptySurcharge, ...((s.surcharges && s.surcharges.night) || {}) },
        weekend: { ...emptySurcharge, ...((s.surcharges && s.surcharges.weekend) || {}) },
      },
      cancellationFeeEur: s.cancellationFeeEur != null ? s.cancellationFeeEur : 0,
    });
  }, [config, selectedRegionId]);

  const onNum = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const onSurch = (k, part) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : n(e.target.value);
    setForm((p) => {
      const sur = p.surcharges && typeof p.surcharges === "object" ? p.surcharges : {};
      const b = (sur[k] && typeof sur[k] === "object" ? sur[k] : {}) || {};
      return {
        ...p,
        surcharges: {
          ...sur,
          [k]: { ...b, [part]: v },
        },
      };
    });
  };

  const save = async () => {
    setError("");
    setOk("");
    if (!selectedRegionId) {
      setError("Keine Einfahrt-Region wählbar — bitte unter „Einfahrt & Gebiete“ mindestens eine Region anlegen.");
      return;
    }
    if (!config || typeof config !== "object") {
      setError("Konfiguration fehlt — bitte neu laden.");
      return;
    }
    const prevTar = config.tariffs && typeof config.tariffs === "object" ? { ...config.tariffs } : {};
    const prevBsr = prevTar.byServiceRegion && typeof prevTar.byServiceRegion === "object" ? { ...prevTar.byServiceRegion } : {};
    const f = form;
    const bySr = f.surcharges;
    const nightO = (bySr && bySr.night) || {};
    const weekendO = (bySr && bySr.weekend) || {};
    const regionEntry = {
      serviceRegionId: selectedRegionId,
      active: f.active !== false,
      baseFare: n(f.baseFare),
      perKm: n(f.perKm),
      perMin: n(f.perMin),
      minFare: n(f.minFare),
      kmPricingModel: f.kmPricingModel === "two_tier" ? "two_tier" : "single",
      surcharges: {
        night: { enabled: !!nightO.enabled, percent: n(nightO.percent) },
        weekend: { enabled: !!weekendO.enabled, percent: n(weekendO.percent) },
      },
      cancellationFeeEur: n(f.cancellationFeeEur),
    };
    const newTariffs = {
      ...prevTar,
      active: tariffsActive,
      byServiceRegion: { ...prevBsr, [selectedRegionId]: { ...prevBsr[selectedRegionId], ...regionEntry } },
    };
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tariffs: newTariffs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Speichern fehlgeschlagen");
      setConfig(data.config || null);
      setOk("Gespeichert. Sichtbar in Kunden-App per GET /api/app/config (inkl. tariffsPerServiceRegion).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <p className="admin-table-sub">Laden …</p>
      </div>
    );
  }

  const hasRegions = serviceRegions.length > 0;
  const regionLabel = serviceRegions.find((r) => r.id === selectedRegionId)?.label || "";

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {ok ? <div className="admin-info-banner admin-info-banner--ok">{ok}</div> : null}
      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Tarife &amp; Preise (pro Einfahrt-Region)</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.5 }}>
          Speichert in <code>app_operational_config</code> → <code>tariffs.byServiceRegion[regionId]</code>.{" "}
          <strong>GET {API_BASE}/app/config</strong> liefert dazu <code>tariffs</code> und vorgemergt{" "}
          <code>tariffsPerServiceRegion</code>. Schätz-API: <code>GET /api/fare-estimate?fromFull=…&amp;distanceKm=…</code>
        </p>
        <p className="admin-table-sub">
          Regionen (Bezeichnungen / Einfahrt-Terms) pflegen: <strong>App / Betrieb → Einfahrt &amp; Gebiete</strong>
        </p>
        <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
          Tarifmodul plattformweit
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={!!tariffsActive}
              onChange={(e) => setTariffsActive(e.target.checked)}
            />
            <span>aktiv (deaktiviert: keine neuen Buchungen nach Preis, serverseitig 400 <code>tariffs_inactive</code>)</span>
          </label>
        </label>
        {hasRegions ? (
          <label className="admin-form-label" style={{ display: "block", marginTop: 12 }}>
            Stadt / Einfahrt-Region
            <select
              className="admin-input"
              style={{ display: "block", marginTop: 4, maxWidth: 360 }}
              value={selectedRegionId}
              onChange={(e) => setSelectedRegionId(e.target.value)}
            >
              {serviceRegions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} {!r.isActive ? "(inaktiv)" : ""} — {r.id}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="admin-info-banner" style={{ marginTop: 12 }}>
            Noch keine Service-Region. Bitte zuerst im Menü <strong>App / Betrieb</strong> eine Region anlegen.
          </p>
        )}

        {hasRegions && selectedRegionId ? (
          <div style={{ marginTop: 20, maxWidth: 480 }} className="admin-form-vertical">
            <p className="admin-table-sub">
              <strong>Region: {regionLabel || selectedRegionId}</strong>
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={form.active !== false}
                onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
              />
              <span>Region-Tarif aktiv (außer Kraft: fällt auf globalen Vorgabentarif zurück)</span>
            </label>
            {[
              ["baseFare", "Grundpreis (€)"],
              ["perKm", "Preis pro km (€/km) — einheitliche km-Logik (single)"],
              ["perMin", "Preis pro Fahrtminute (€/min)"],
              ["minFare", "Mindestfahrpreis (€) nach Strecken- und Fahrtkosten, vor %-Zuschlägen"],
              ["cancellationFeeEur", "Kunden-Storno (€, mit Buchungsregel-Maximum)"],
            ].map(([k, h]) => (
              <div key={k} style={{ marginTop: 8 }}>
                <label className="admin-form-label" style={{ display: "block" }}>
                  {k}
                  <input
                    className="admin-input"
                    style={{ display: "block", marginTop: 4, maxWidth: 320 }}
                    value={form[k] == null ? "" : String(form[k])}
                    onChange={onNum(k)}
                    inputMode="decimal"
                  />
                </label>
                <span className="admin-table-sub">{h}</span>
              </div>
            ))}
            <p className="admin-table-sub" style={{ marginTop: 16, fontWeight: 600 }}>
              Zuschläge (Nacht, Wochenende)
            </p>
            {["night", "weekend"].map((k) => (
              <div key={k} style={{ marginTop: 8, padding: 8, background: "rgba(0,0,0,0.05)", borderRadius: 4 }}>
                <span style={{ fontWeight: 600 }}>{k === "night" ? "Nacht" : "Wochenende"}</span>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!(form.surcharges && form.surcharges[k] && form.surcharges[k].enabled)}
                    onChange={onSurch(k, "enabled")}
                  />
                  <span>aktiv</span>
                </label>
                <input
                  className="admin-input"
                  style={{ maxWidth: 200, marginTop: 4 }}
                  value={
                    form.surcharges && form.surcharges[k] && form.surcharges[k].percent != null
                      ? String(form.surcharges[k].percent)
                      : ""
                  }
                  onChange={onSurch(k, "percent")}
                  inputMode="numeric"
                />
                <span className="admin-table-sub"> Prozent (auf Fahrpreis nach minFare)</span>
              </div>
            ))}
            <div style={{ marginTop: 20 }}>
              <button type="button" className="admin-btn admin-btn--primary" onClick={save}>
                Speichern
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
