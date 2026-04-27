import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;
const PREVIEW = `${URL}/preview-tariff-estimate`;

const emptySurcharge = { enabled: false, percent: 0 };

function n(v) {
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

/** Wie `resolveTripEurPerRouteMinute` serverseitig: kein 0-`perMin`, das 0,63 `pricePerMinute` überschreibt. */
function tripEurFromMergedLike(m) {
  if (!m || typeof m !== "object") return 0;
  const a = n(m.perMin, 0);
  const b = n(m.pricePerMinute, 0);
  if (a > 0) return a;
  if (b > 0) return b;
  return 0;
}

function pickKmMode(merged) {
  const isTwo = merged.kmPricingModel === "two_tier";
  const hasSingle = n(merged.perKm) > 0;
  if (isTwo) return "two_tier";
  if (hasSingle) return "single";
  return "two_tier";
}

function formDefaults() {
  return {
    active: true,
    kmMode: "two_tier" /** @type { "single" | "two_tier" } */,
    baseFare: 4.3,
    perKm: 0,
    rateFirstPerKm: 3.0,
    rateAfterPerKm: 2.5,
    thresholdKm: 4,
    pricePerMinute: 0.63,
    waitingPerHour: 38,
    minFare: 0,
    cancellationFeeEur: 0,
    airportFlatEur: 0,
    taxiMandatoryArea: false,
    forbidUnlawfulFixedPrice: true,
    surcharges: {
      night: { ...emptySurcharge },
      weekend: { ...emptySurcharge },
      holiday: { ...emptySurcharge },
    },
  };
}

export default function AppOperationalTariffsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [config, setConfig] = useState(/** @type {Record<string, unknown> | null} */ (null));
  const [serviceRegions, setServiceRegions] = useState(
    /** @type {Array<{ id: string; label: string; isActive: boolean; matchTerms?: string[]; sortOrder?: number }>} */ (
      []
    ),
  );
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [tariffsActive, setTariffsActive] = useState(true);
  const [form, setForm] = useState(() => formDefaults());
  const [edLabel, setEdLabel] = useState("");
  const [edTerms, setEdTerms] = useState("");
  const [edActive, setEdActive] = useState(true);
  const [edSort, setEdSort] = useState("1");
  const [newLabel, setNewLabel] = useState("");
  const [newTerms, setNewTerms] = useState("");
  const [newRegActive, setNewRegActive] = useState(true);
  const [addBusy, setAddBusy] = useState(false);
  const [preview, setPreview] = useState(/** @type {Record<string, unknown> | null} */ (null));
  const [prevBusy, setPrevBusy] = useState(false);
  const [pvTestWait, setPvTestWait] = useState(0);
  const [pvHoliday, setPvHoliday] = useState(false);
  const [pvAirport, setPvAirport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      setConfig(data.config);
      setServiceRegions(Array.isArray(data.serviceRegions) ? data.serviceRegions : []);
      if (data.config?.tariffs && typeof data.config.tariffs === "object" && "active" in data.config.tariffs) {
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

  const mergeTariffView = (globalT, regOverride) => {
    const g = globalT && typeof globalT === "object" ? { .../** @type {object} */ (globalT) } : {};
    delete g.byServiceRegion;
    if (!regOverride || typeof regOverride !== "object") {
      return { ...g };
    }
    const r = { ...regOverride };
    delete r.byServiceRegion;
    return { ...g, ...r };
  };

  useEffect(() => {
    if (!config || !selectedRegionId) {
      setForm(formDefaults());
      return;
    }
    const tr = config.tariffs && typeof config.tariffs === "object" ? config.tariffs : {};
    const bsr = tr && typeof tr.byServiceRegion === "object" ? tr.byServiceRegion : {};
    const existing = bsr[selectedRegionId] && typeof bsr[selectedRegionId] === "object" ? bsr[selectedRegionId] : {};
    const merged = mergeTariffView(tr, existing);
    const sr = serviceRegions.find((r) => r.id === selectedRegionId);
    if (sr) {
      setEdLabel(sr.label ?? "");
      setEdTerms((sr.matchTerms || []).join(", "));
      setEdActive(!!sr.isActive);
      setEdSort(String(sr.sortOrder != null ? sr.sortOrder : 1));
    }
    setForm({
      ...formDefaults(),
      active: (existing).active !== false,
      baseFare: merged.baseFare != null ? n(merged.baseFare) : 4.3,
      kmMode: pickKmMode(merged),
      perKm: merged.perKm != null ? n(merged.perKm) : 0,
      rateFirstPerKm: merged.rateFirstPerKm != null ? n(merged.rateFirstPerKm) : 3.0,
      rateAfterPerKm: merged.rateAfterPerKm != null ? n(merged.rateAfterPerKm) : 2.5,
      thresholdKm: merged.thresholdKm != null ? n(merged.thresholdKm) : 4,
      pricePerMinute: tripEurFromMergedLike(merged) || 0.63,
      waitingPerHour: merged.waitingPerHour != null ? n(merged.waitingPerHour) : 38,
      minFare: merged.minFare != null ? n(merged.minFare) : merged.minPrice != null ? n(merged.minPrice) : 0,
      cancellationFeeEur: merged.cancellationFeeEur != null ? n(merged.cancellationFeeEur) : 0,
      airportFlatEur: merged.airportFlatEur != null ? n(merged.airportFlatEur) : 0,
      taxiMandatoryArea: !!merged.taxiMandatoryArea,
      forbidUnlawfulFixedPrice: merged.forbidUnlawfulFixedPriceInMandatoryArea !== false,
      surcharges: {
        night: { ...emptySurcharge, ...((merged.surcharges && merged.surcharges.night) || {}) },
        weekend: { ...emptySurcharge, ...((merged.surcharges && merged.surcharges.weekend) || {}) },
        holiday: { ...emptySurcharge, ...((merged.surcharges && merged.surcharges.holiday) || {}) },
      },
    });
  }, [config, selectedRegionId, serviceRegions]);

  const onNum = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const onBool = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.checked }));
  const onSurch = (k, part) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : n(e.target.value);
    setForm((p) => {
      const sur = p.surcharges && typeof p.surcharges === "object" ? p.surcharges : {};
      const b = (sur[k] && typeof sur[k] === "object" ? sur[k] : {}) || {};
      return {
        ...p,
        surcharges: { ...sur, [k]: { ...b, [part]: v } },
      };
    });
  };

  const buildRegionTariffPayload = () => {
    const f = form;
    const isTwo = f.kmMode === "two_tier";
    const sur = f.surcharges;
    const ppm = n(f.pricePerMinute);
    const out = {
      active: f.active !== false,
      baseFare: n(f.baseFare),
      kmPricingModel: isTwo ? "two_tier" : "single",
      perKm: isTwo ? 0 : n(f.perKm),
      rateFirstPerKm: isTwo ? n(f.rateFirstPerKm) : n(f.perKm),
      rateAfterPerKm: isTwo ? n(f.rateAfterPerKm) : n(f.perKm),
      thresholdKm: isTwo ? n(f.thresholdKm) : n(f.thresholdKm),
      waitingPerHour: n(f.waitingPerHour),
      minFare: n(f.minFare),
      cancellationFeeEur: n(f.cancellationFeeEur),
      airportFlatEur: n(f.airportFlatEur),
      taxiMandatoryArea: !!f.taxiMandatoryArea,
      forbidUnlawfulFixedPriceInMandatoryArea: !!f.forbidUnlawfulFixedPrice,
      surcharges: {
        night: { enabled: !!sur.night?.enabled, percent: n(sur.night?.percent) },
        weekend: { enabled: !!sur.weekend?.enabled, percent: n(sur.weekend?.percent) },
        holiday: { enabled: !!sur.holiday?.enabled, percent: n(sur.holiday?.percent) },
      },
      nightSurchargePercent: sur.night?.enabled ? n(sur.night?.percent) : 0,
      weekendSurchargePercent: sur.weekend?.enabled ? n(sur.weekend?.percent) : 0,
      holidaySurchargePercent: sur.holiday?.enabled ? n(sur.holiday?.percent) : 0,
      rounding: "ceil_tenth",
    };
    if (ppm > 0) (out).pricePerMinute = ppm;
    return out;
  };

  const save = async () => {
    setError("");
    setOk("");
    if (!selectedRegionId) {
      setError("Kein Gebiet wählbar — zuerst ein Stadt/Gebiet anlegen.");
      return;
    }
    if (!config || typeof config !== "object") {
      setError("Konfiguration fehlt — bitte neu laden.");
      return;
    }
    const prevTar = config.tariffs && typeof config.tariffs === "object" ? { ...config.tariffs } : {};
    const prevBsr = prevTar.byServiceRegion && typeof prevTar.byServiceRegion === "object" ? { ...prevTar.byServiceRegion } : {};
    const newTariffs = {
      ...prevTar,
      active: tariffsActive,
      byServiceRegion: { ...prevBsr, [selectedRegionId]: { ...buildRegionTariffPayload() } },
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
      setOk("Gespeichert. Sichtbar per GET /api/app/config; Schätzung per GET /api/fare-estimate (gleiche Engine).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  const runPreview = async () => {
    if (!config) return;
    setPreview(null);
    setPrevBusy(true);
    setError("");
    try {
      const body = {
        serviceRegionId: selectedRegionId || null,
        regionTariff: buildRegionTariffPayload(),
        distanceKm: 10,
        tripMinutes: 20,
        waitingMinutes: pvTestWait,
        vehicle: "standard",
        at: new Date().toISOString(),
        applyHolidaySurcharge: !!pvHoliday,
        applyAirportFlat: !!pvAirport,
      };
      const res = await fetch(PREVIEW, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Vorschau fehlgeschlagen");
      setPreview(/** @type {Record<string, unknown>} */ (data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setPrevBusy(false);
    }
  };

  const addRegion = async () => {
    setAddBusy(true);
    setError("");
    setOk("");
    const label = newLabel.trim();
    const matchTerms = newTerms
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!label || !matchTerms.length) {
      setError("Für neues Gebiet: Bezeichnung und mindestens einen Suchbegriff ausfüllen.");
      setAddBusy(false);
      return;
    }
    try {
      const res = await fetch(`${URL}/service-regions`, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ label, matchTerms, isActive: newRegActive !== false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Anlegen fehlgeschlagen");
      setNewLabel("");
      setNewTerms("");
      setNewRegActive(true);
      if (data.id) setSelectedRegionId(String(data.id));
      setOk(`Gebiet „${label}“ angelegt — Tarif unten eintragen und speichern.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setAddBusy(false);
    }
  };

  const saveRegionMeta = async () => {
    if (!selectedRegionId) return;
    setError("");
    setOk("");
    const matchTerms = edTerms
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!edLabel.trim() || !matchTerms.length) {
      setError("Bezeichnung und mindestens ein Suchbegriff für das Gebiet.");
      return;
    }
    try {
      const res = await fetch(`${URL}/service-regions/${encodeURIComponent(selectedRegionId)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          label: edLabel.trim(),
          matchTerms,
          isActive: edActive,
          sortOrder: n(edSort) || 1,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Speichern fehlgeschlagen");
      setOk("Gebiets-Metadaten gespeichert (Namen, Suchbegriffe, aktiv).");
      await load();
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
  const bd = preview?.estimate && typeof preview.estimate === "object" ? /** @type {{ breakdown?: object }} */ (preview.estimate).breakdown : null;

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {ok ? <div className="admin-info-banner admin-info-banner--ok">{ok}</div> : null}
      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Tarife &amp; Preise (nach Stadt / Einfahrt-Region)</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.55, maxWidth: 720 }}>
          Speichert in <code>app_operational_config</code> → <code>tariffs.byServiceRegion[regionId]</code>. Kunden-App:{" "}
          <code>GET /api/app/config</code> (inkl. <code>tariffsPerServiceRegion</code>). Rechnen: <code>GET /api/fare-estimate?fromFull=…</code>{" "}
          — dieselbe Logik serverseitig, keine harten Werte in der App.
        </p>
        <p className="admin-table-sub" style={{ lineHeight: 1.5, maxWidth: 720 }}>
          <strong>Trennung:</strong> „Fahrtminuten” = Zeitkomponente im Tarif (€/min) für die angegebene Fahrt- bzw. Routenzeit, nicht
          Warten. Wartezeit wird aus €/Stunde auf Minuten heruntergerechnet (Query <code>waitingMinutes</code>). Endergebnis: Schätzung, kein
          Ersatz fürs Taxameter, sofern lokal ein Pflichtfahr- oder Pauschalenregelwerk gilt.
        </p>
        <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
          Tarifmodul plattformweit
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={!!tariffsActive}
              onChange={(e) => setTariffsActive(e.target.checked)}
            />
            <span>aktiv (wenn inaktiv: 400 <code>tariffs_inactive</code> — keine passende Buchung per Preislogik)</span>
          </label>
        </label>
      </div>

      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">1. Stadt / Einfahrt-Region anlegen</div>
        <p className="admin-table-sub">Suchbegriffe: kommagetrennt, Treffer in der vollständigen Adresse (Ort, Flughafen, Stadtteil).</p>
        <div className="admin-form-vertical" style={{ maxWidth: 480, marginTop: 8 }}>
          <input
            className="admin-input"
            placeholder="Z. B. Stuttgart"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <input
            className="admin-input"
            style={{ marginTop: 8 }}
            placeholder="stuttgart, flughafen stuttgart, weilimdorf, …"
            value={newTerms}
            onChange={(e) => setNewTerms(e.target.value)}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input type="checkbox" checked={newRegActive} onChange={(e) => setNewRegActive(e.target.checked)} />
            <span>Gebiet ist aktiv (inaktiv: Einfahrt-Regel greift nicht, Kundentext: „nicht verfügbar”)</span>
          </label>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            style={{ marginTop: 8, alignSelf: "flex-start" }}
            onClick={addRegion}
            disabled={addBusy}
          >
            {addBusy ? "Wird angelegt …" : "Gebiet hinzufügen"}
          </button>
        </div>
      </div>

      {hasRegions ? (
        <div className="admin-panel-card" style={{ marginBottom: 16 }}>
          <div className="admin-panel-card__title">2. Gebiet wählen &amp; Ort bearbeiten</div>
          <label className="admin-form-label" style={{ display: "block" }}>
            Gebiet
            <select
              className="admin-input"
              style={{ display: "block", marginTop: 4, maxWidth: 400 }}
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
          <p className="admin-table-sub" style={{ marginTop: 12 }}>
            Bezeichnung / Suchworte für: <strong>{regionLabel || selectedRegionId}</strong>
          </p>
          <div className="admin-form-vertical" style={{ maxWidth: 560, marginTop: 6 }}>
            <input className="admin-input" value={edLabel} onChange={(e) => setEdLabel(e.target.value)} />
            <input
              className="admin-input"
              style={{ marginTop: 8 }}
              value={edTerms}
              onChange={(e) => setEdTerms(e.target.value)}
              placeholder="suchbegriffe, …"
            />
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={edActive} onChange={(e) => setEdActive(e.target.checked)} />
                aktiv
              </label>
              <label>
                Sortierung{" "}
                <input
                  className="admin-input"
                  style={{ width: 64, display: "inline-block", marginLeft: 4 }}
                  value={edSort}
                  onChange={(e) => setEdSort(e.target.value)}
                />
              </label>
              <button type="button" className="admin-btn admin-btn--small" onClick={saveRegionMeta}>
                Gebiets-Metadaten speichern
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="admin-info-banner" style={{ marginBottom: 16 }}>
          Noch kein Gebiet. Oben zuerst mindestens eine Region anlegen.
        </div>
      )}

      {hasRegions && selectedRegionId ? (
        <div className="admin-panel-card" style={{ marginBottom: 16 }}>
          <div className="admin-panel-card__title">3. Tarif für dieses Gebiet</div>
          <p className="admin-table-sub" style={{ marginTop: 6 }}>
            Region-Tarif: überschreibt nur die hier gesetzten Felder; alles Übrige kommt aus dem globalen Tarif-Muster in der
            Plattform-Konfiguration. Ohne <code>perMin</code>-0-Fallen: Fahrtminuten-Preis nur in „Fahrt / Minute (Routenzeit)“
            führen.
          </p>
          <div style={{ marginTop: 16, maxWidth: 560 }} className="admin-form-vertical">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.active !== false}
                onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
              />
              <span>Tarif-Override für dieses Gebiet ist aktiv (aus: nur globaler Tarif, wenn vorhanden)</span>
            </label>
            {[
              ["Grundpreis (€)", "baseFare", "Einstieg/Grundgebühr"],
            ].map(([t, k, h]) => (
              <div key={k} style={{ marginTop: 10 }}>
                <label className="admin-form-label" style={{ display: "block" }}>
                  {t}
                  <input
                    className="admin-input"
                    style={{ display: "block", marginTop: 4 }}
                    value={form[k] == null ? "" : String(form[k])}
                    onChange={onNum(k)}
                    inputMode="decimal"
                  />
                </label>
                <span className="admin-table-sub">{h}</span>
              </div>
            ))}
            <p className="admin-table-sub" style={{ fontWeight: 600, marginTop: 12 }}>
              Tarifmodus (Kilometer)
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="radio"
                  name="km"
                  checked={form.kmMode === "single"}
                  onChange={() => setForm((p) => ({ ...p, kmMode: "single" }))}
                />
                Einheitlicher km-Preis
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="radio"
                  name="km"
                  checked={form.kmMode === "two_tier"}
                  onChange={() => setForm((p) => ({ ...p, kmMode: "two_tier" }))}
                />
                Staffel / zwei Kilometer-Preise
              </label>
            </div>
            {form.kmMode === "single" ? (
              <div style={{ marginTop: 8 }}>
                <label className="admin-form-label">
                  Preis pro km (€/km, alle Strecke)
                  <input className="admin-input" value={form.perKm == null ? "" : String(form.perKm)} onChange={onNum("perKm")} />
                </label>
              </div>
            ) : (
              <div className="admin-form-vertical" style={{ marginTop: 8, gap: 6 }}>
                <label className="admin-form-label">
                  Preis erste km (€/km, bis einschließlich Schwelle)
                  <input
                    className="admin-input"
                    value={form.rateFirstPerKm == null ? "" : String(form.rateFirstPerKm)}
                    onChange={onNum("rateFirstPerKm")}
                  />
                </label>
                <label className="admin-form-label">
                  Ab Kilometer (ab hier zweiter Preis, z. B. 4)
                  <input
                    className="admin-input"
                    value={form.thresholdKm == null ? "" : String(form.thresholdKm)}
                    onChange={onNum("thresholdKm")}
                  />
                </label>
                <label className="admin-form-label">
                  Preis ab Schwelle (€/km)
                  <input
                    className="admin-input"
                    value={form.rateAfterPerKm == null ? "" : String(form.rateAfterPerKm)}
                    onChange={onNum("rateAfterPerKm")}
                  />
                </label>
              </div>
            )}
            <div style={{ marginTop: 12 }} />
            {[
              [
                "Fahrt / Minute (Routenzeit) (€/min)",
                "pricePerMinute",
                "Für Fahrtzeit-Komponente, nicht Wartezeit. Schätz-API-Parameter: tripMinutes.",
              ],
              ["Wartezeit (€ / Stunde, auf Minuten umgerechnet)", "waitingPerHour", "Nur reine Warte-Minuten, Parameter waitingMinutes."],
              ["Mindestfahrpreis (€, optional)", "minFare", "Gilt auf Zwischensumme vor Nacht/WE/FE-%."],
              ["Kunden-Storno (€)", "cancellationFeeEur", "Ggf. an bookingRules-Maximum koppeln."],
              [
                "Flughafenpauschale (€, optional)",
                "airportFlatEur",
                "Gilt nur in Vorschau/Live, wenn ?airport=1 bzw. Option unten: Test-Flughafen-Stop.",
              ],
            ].map(([t, k, h]) => (
              <div key={k} style={{ marginTop: 10 }}>
                <label className="admin-form-label" style={{ display: "block" }}>
                  {t}
                  <input
                    className="admin-input"
                    style={{ display: "block", marginTop: 4 }}
                    value={form[k] == null ? "" : String(form[k])}
                    onChange={onNum(k)}
                    inputMode="decimal"
                  />
                </label>
                <span className="admin-table-sub">{h}</span>
              </div>
            ))}
            <p className="admin-table-sub" style={{ fontWeight: 600, marginTop: 14 }}>
              Zuschläge (Prozent, auf Fahrpreis nach Mindestpreis)
            </p>
            {["night", "weekend", "holiday"].map((k) => {
              const lab = k === "night" ? "Nacht" : k === "weekend" ? "Wochenende" : "Feiertag (Test/Preview: Option unten „Feiertag“)";
              return (
                <div
                  key={k}
                  style={{ marginTop: 8, padding: 8, background: "rgba(0,0,0,0.05)", borderRadius: 4, maxWidth: 420 }}
                >
                  <span style={{ fontWeight: 600 }}>{lab}</span>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!(form.surcharges && form.surcharges[k] && form.surcharges[k].enabled)}
                      onChange={onSurch(k, "enabled")}
                    />
                    <span>berücksichtigen</span>
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
                </div>
              );
            })}
            <p className="admin-table-sub" style={{ fontWeight: 600, marginTop: 14 }}>
              Maut- / Sicherheitsregel (Sichtbarkeit)
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <input type="checkbox" checked={!!form.taxiMandatoryArea} onChange={onBool("taxiMandatoryArea")} />
              <span>Start wird als relevantes Pflichtfahr-/Kontrollgebiet markiert (Hinweis, keine Automatik für Festpreisverbot — nur Flag)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <input
                type="checkbox"
                checked={!!form.forbidUnlawfulFixedPrice}
                onChange={onBool("forbidUnlawfulFixedPrice")}
              />
              <span>unzulässige Pauschalen / Festpreis im Sicherheitsgebiet verbieten (Richtwert für Downstream, Policy)</span>
            </label>
            <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button type="button" className="admin-btn admin-btn--primary" onClick={save}>
                Tarif speichern
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hasRegions && selectedRegionId ? (
        <div className="admin-panel-card" style={{ marginBottom: 16 }}>
          <div className="admin-panel-card__title">4. Testrechnung (Vorschau)</div>
          <p className="admin-table-sub">
            Fixe Szenen: <strong>10 km</strong>, <strong>20</strong> Fahrtminuten (<code>tripMinutes</code>), wählbare Warte-Minuten. Nutzt{" "}
            <code>POST /api/admin/app-operational/preview-tariff-estimate</code> (gleiche Engine wie Live).
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
            <label>
              Warte-Min. (0 = keine Wartezeit){" "}
              <input
                className="admin-input"
                style={{ width: 72, marginLeft: 4 }}
                value={pvTestWait}
                onChange={(e) => setPvTestWait(n(e.target.value))}
                inputMode="numeric"
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={pvHoliday} onChange={(e) => setPvHoliday(e.target.checked)} />
              Feiertag-Zuschlag in Vorschau
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={pvAirport} onChange={(e) => setPvAirport(e.target.checked)} />
              Flughafen-Pauschale
            </label>
            <button type="button" className="admin-btn" onClick={runPreview} disabled={prevBusy}>
              {prevBusy ? "Rechnet …" : "Vorschau aktualisieren"}
            </button>
          </div>
          {preview && preview.estimate && typeof preview.estimate === "object" ? (
            <div
              className="admin-form-vertical"
              style={{ marginTop: 12, maxWidth: 480, lineHeight: 1.5, background: "rgba(0,50,60,0.12)", padding: 12, borderRadius: 6 }}
            >
              {(() => {
                const est = /** @type {{ total?: number; taxiTotal?: number; breakdown?: Record<string, unknown> }} */ (preview.estimate);
                return (
                  <>
                    <p style={{ fontWeight: 600 }}>Gesamtschätzung (gerundet): {String(est.taxiTotal != null ? est.taxiTotal : est.total)} €</p>
                    {bd && typeof bd === "object" ? (
                      <ul className="admin-table-sub" style={{ margin: "6px 0 0 18px", listStyle: "disc" }}>
                        <li>Grundpreis: {String(/** @type {number} */(bd).baseFare)} €</li>
                        <li>Strecke: {String(/** @type {number} */(bd).distanceCharge)} €</li>
                        <li>Zeit (Fahrt/Route): {String(/** @type {number} */(bd).tripMinutesCharge)} € (20 min × Fahrtminutensatz)</li>
                        <li>Wartezeit: {String(/** @type {number} */(bd).waitingCharge)} €</li>
                        <li>Flughafen-Pauschale: {String(/** @type {number} */(bd).airportFlatEur != null ? bd.airportFlatEur : 0)} €</li>
                        {Array.isArray(/** @type {unknown[]} */(bd).surcharges) && (/** @type {unknown[]} */(bd).surcharges).length
                          ? (/** @type {unknown[]} */(bd).surcharges).map((s, i) => (
                                <li key={i}>
                                  Zuschlag {s && /** @type {{ type: string, amount: number}} */(s).type}:{" "}
                                  {s && String(/** @type {{ type: string, amount: number}} */(s).amount)} €
                                </li>
                            ))
                          : null}
                        <li>Fahrzeugklasse-Faktor: {String(/** @type {number} */(bd).vehicleClassMultiplier)}</li>
                      </ul>
                    ) : null}
                    {/** @type {{ profile?: { pricePerMinute?: number } }} */ (preview).profile &&
                    (/** @type {{ profile?: { pricePerMinute?: number } }} */(preview).profile).pricePerMinute != null ? (
                      <p className="admin-table-sub" style={{ marginTop: 6 }}>
                        Ausgespielter Fahrt-Minutensatz (API-Profil): {String(preview.profile.pricePerMinute)} €/min
                      </p>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
