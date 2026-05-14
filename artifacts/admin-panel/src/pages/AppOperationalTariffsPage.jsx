import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;
const PREVIEW = `${URL}/preview-tariff-estimate`;

const emptySurcharge = { enabled: false, percent: 0 };

function n(v) {
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function tripEurFromMergedLike(m) {
  if (!m || typeof m !== "object") return 0;
  const a = n(m.perMin);
  const b = n(m.pricePerMinute);
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

function taxiFormDefaults() {
  return {
    active: true,
    kmMode: "two_tier",
    baseFare: 4.3,
    perKm: 0,
    rateFirstPerKm: 3.0,
    rateAfterPerKm: 2.5,
    thresholdKm: 4,
    tripMinEur: 0.63,
    waitingPerHour: 38,
    minFare: 0,
    largeVehicleMinPassengers: 5,
    largeVehicleAmountEur: 7,
  };
}

function mergeTariffView(globalT, regOverride) {
  const g = globalT && typeof globalT === "object" ? { .../** @type {object} */ (globalT) } : {};
  delete g.byServiceRegion;
  if (!regOverride || typeof regOverride !== "object") {
    return { ...g };
  }
  const r = { ...regOverride };
  delete r.byServiceRegion;
  delete r.vehicleTariffOverrides;
  return { ...g, ...r };
}

function preservedAdvancedTariffKeys(prev) {
  if (!prev || typeof prev !== "object") return {};
  const keys = [
    "cancellationFeeEur",
    "airportFlatEur",
    "taxiMandatoryArea",
    "forbidUnlawfulFixedPriceInMandatoryArea",
    "nightSurchargePercent",
    "weekendSurchargePercent",
    "holidaySurchargePercent",
    "rounding",
    "tariffVersion",
    "validFrom",
    "timeTariffAmount",
    "timeTariffPerSeconds",
    "largeVehicleSurcharge",
  ];
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(prev, k)) out[k] = /** @type {Record<string, unknown>} */ (prev)[k];
  }
  return out;
}

/**
 * Betrieb & Preise — ein Screen: Gebiet (serviceRegions + Synonyme), Standard-Taxi-Tarif,
 * Fahrzeug-Sondertarife (XL-Modus, Rollstuhl-Override). Persistenz: `app_operational_config` wie zuvor.
 */
export default function AppOperationalTariffsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [config, setConfig] = useState(/** @type {Record<string, unknown> | null} */ (null));
  const [serviceRegions, setServiceRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [tariffsActive, setTariffsActive] = useState(true);
  const [form, setForm] = useState(() => taxiFormDefaults());
  const [edLabel, setEdLabel] = useState("");
  const [edTerms, setEdTerms] = useState("");
  const [edActive, setEdActive] = useState(true);
  const [edSort, setEdSort] = useState("1");
  const [newLabel, setNewLabel] = useState("");
  const [newTerms, setNewTerms] = useState("");
  const [newRegActive, setNewRegActive] = useState(true);
  const [addBusy, setAddBusy] = useState(false);
  const [xlPricingMode, setXlPricingMode] = useState("multiplier");
  const [xlMult, setXlMult] = useState("1.2");
  const [xlFixedEur, setXlFixedEur] = useState("0");
  const [wcMult, setWcMult] = useState("1");
  const [wcEnabled, setWcEnabled] = useState(false);
  const [wcForm, setWcForm] = useState(() => taxiFormDefaults());
  const [wheelchairFixedEur, setWheelchairFixedEur] = useState("0");
  const [preview, setPreview] = useState(/** @type {Record<string, unknown> | null} */ (null));
  const [prevBusy, setPrevBusy] = useState(false);
  const [pvTestWait, setPvTestWait] = useState(0);
  const [pvHoliday, setPvHoliday] = useState(false);
  const [pvAirport, setPvAirport] = useState(false);
  const [pvVehicle, setPvVehicle] = useState("standard");

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

  const rawRegionTariff = useMemo(() => {
    if (!config?.tariffs || typeof config.tariffs !== "object" || !selectedRegionId) return {};
    const bsr = /** @type {Record<string, unknown>} */ (config.tariffs).byServiceRegion;
    if (!bsr || typeof bsr !== "object") return {};
    const row = bsr[selectedRegionId];
    return row && typeof row === "object" ? /** @type {Record<string, unknown>} */ (row) : {};
  }, [config, selectedRegionId]);

  useEffect(() => {
    if (!config || !selectedRegionId) {
      setForm(taxiFormDefaults());
      return;
    }
    const tr = config.tariffs && typeof config.tariffs === "object" ? config.tariffs : {};
    const bsr = tr && typeof tr.byServiceRegion === "object" ? tr.byServiceRegion : {};
    const existingFull = bsr[selectedRegionId] && typeof bsr[selectedRegionId] === "object" ? bsr[selectedRegionId] : {};
    const { vehicleTariffOverrides: vtoRaw, ...existingSansVto } = /** @type {Record<string, unknown>} */ (existingFull);
    const existing = /** @type {Record<string, unknown>} */ (existingSansVto);
    const merged = mergeTariffView(tr, existing);
    const sr = serviceRegions.find((r) => r.id === selectedRegionId);
    if (sr) {
      setEdLabel(sr.label ?? "");
      setEdTerms((sr.matchTerms || []).join(", "));
      setEdActive(!!sr.isActive);
      setEdSort(String(sr.sortOrder != null ? sr.sortOrder : 1));
    }
    setForm({
      ...taxiFormDefaults(),
      active: existing.active !== false,
      baseFare: merged.baseFare != null ? n(merged.baseFare) : 4.3,
      kmMode: pickKmMode(merged),
      perKm: merged.perKm != null ? n(merged.perKm) : 0,
      rateFirstPerKm: merged.rateFirstPerKm != null ? n(merged.rateFirstPerKm) : 3.0,
      rateAfterPerKm: merged.rateAfterPerKm != null ? n(merged.rateAfterPerKm) : 2.5,
      thresholdKm: merged.thresholdKm != null ? n(merged.thresholdKm) : 4,
      tripMinEur: tripEurFromMergedLike(merged) || 0.63,
      waitingPerHour: merged.waitingPerHour != null ? n(merged.waitingPerHour) : 38,
      minFare: merged.minFare != null ? n(merged.minFare) : merged.minPrice != null ? n(merged.minPrice) : 0,
      largeVehicleMinPassengers:
        merged.largeVehicleSurcharge && typeof merged.largeVehicleSurcharge === "object"
          ? Math.max(1, Math.round(n(merged.largeVehicleSurcharge.minPassengers)))
          : 5,
      largeVehicleAmountEur:
        merged.largeVehicleSurcharge && typeof merged.largeVehicleSurcharge === "object"
          ? n(merged.largeVehicleSurcharge.amountEur)
          : 7,
    });

    const mult =
      merged.vehicleClassMultipliers && typeof merged.vehicleClassMultipliers === "object"
        ? /** @type {Record<string, unknown>} */ (merged.vehicleClassMultipliers)
        : {};
    setXlMult(String(mult.xl != null ? n(mult.xl) : 1.2));
    setWcMult(String(mult.wheelchair != null ? n(mult.wheelchair) : 1));

    const mode = typeof merged.xlPricingMode === "string" ? merged.xlPricingMode.trim().toLowerCase() : "multiplier";
    setXlPricingMode(mode === "fixed" || mode === "both" ? mode : "multiplier");
    setXlFixedEur(String(merged.xlFixedSurchargeEur != null ? n(merged.xlFixedSurchargeEur) : 0));
    setWheelchairFixedEur(String(merged.wheelchairFixedSurchargeEur != null ? n(merged.wheelchairFixedSurchargeEur) : 0));

    const vto = vtoRaw && typeof vtoRaw === "object" && !Array.isArray(vtoRaw) ? /** @type {Record<string, unknown>} */ (vtoRaw) : {};
    const wOv = vto.wheelchair && typeof vto.wheelchair === "object" ? /** @type {Record<string, unknown>} */ (vto.wheelchair) : null;
    setWcEnabled(!!wOv);
    if (wOv) {
      setWcForm({
        ...taxiFormDefaults(),
        active: wOv.active !== false,
        baseFare: wOv.baseFare != null ? n(wOv.baseFare) : 4.3,
        kmMode: pickKmMode(wOv),
        perKm: wOv.perKm != null ? n(wOv.perKm) : 0,
        rateFirstPerKm: wOv.rateFirstPerKm != null ? n(wOv.rateFirstPerKm) : 3.0,
        rateAfterPerKm: wOv.rateAfterPerKm != null ? n(wOv.rateAfterPerKm) : 2.5,
        thresholdKm: wOv.thresholdKm != null ? n(wOv.thresholdKm) : 4,
        tripMinEur: tripEurFromMergedLike(wOv) || 0.63,
        waitingPerHour: wOv.waitingPerHour != null ? n(wOv.waitingPerHour) : 38,
        minFare: wOv.minFare != null ? n(wOv.minFare) : wOv.minPrice != null ? n(wOv.minPrice) : 0,
        largeVehicleMinPassengers: 5,
        largeVehicleAmountEur: 0,
      });
    } else {
      setWcForm(taxiFormDefaults());
    }
  }, [config, selectedRegionId, serviceRegions]);

  const onNum = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const onWcNum = (key) => (e) => setWcForm((p) => ({ ...p, [key]: e.target.value }));

  const buildWheelchairOverride = () => {
    if (!wcEnabled) return null;
    const wf = wcForm;
    const isTwo = wf.kmMode === "two_tier";
    const tripEur = n(wf.tripMinEur);
    const o = {
      active: wf.active !== false,
      baseFare: n(wf.baseFare),
      kmPricingModel: isTwo ? "two_tier" : "single",
      perKm: isTwo ? 0 : n(wf.perKm),
      rateFirstPerKm: isTwo ? n(wf.rateFirstPerKm) : n(wf.perKm),
      rateAfterPerKm: isTwo ? n(wf.rateAfterPerKm) : n(wf.perKm),
      thresholdKm: n(wf.thresholdKm),
      waitingPerHour: n(wf.waitingPerHour),
      minFare: n(wf.minFare),
      rounding: "ceil_tenth",
    };
    if (tripEur > 0) {
      o.perMin = tripEur;
      o.pricePerMinute = tripEur;
    }
    return o;
  };

  const buildRegionTariffPayload = () => {
    const f = form;
    const isTwo = f.kmMode === "two_tier";
    const tripEur = n(f.tripMinEur);
    const prev = rawRegionTariff;
    const preserved = preservedAdvancedTariffKeys(prev);
    const surcharges =
      prev.surcharges && typeof prev.surcharges === "object"
        ? prev.surcharges
        : {
            night: { ...emptySurcharge },
            weekend: { ...emptySurcharge },
            holiday: { ...emptySurcharge },
          };
    const sn = surcharges.night && typeof surcharges.night === "object" ? surcharges.night : {};
    const swe = surcharges.weekend && typeof surcharges.weekend === "object" ? surcharges.weekend : {};
    const sh = surcharges.holiday && typeof surcharges.holiday === "object" ? surcharges.holiday : {};
    const out = {
      ...preserved,
      surcharges,
      nightSurchargePercent: sn.enabled ? n(sn.percent) : 0,
      weekendSurchargePercent: swe.enabled ? n(swe.percent) : 0,
      holidaySurchargePercent: sh.enabled ? n(sh.percent) : 0,
      active: f.active !== false,
      baseFare: n(f.baseFare),
      kmPricingModel: isTwo ? "two_tier" : "single",
      perKm: isTwo ? 0 : n(f.perKm),
      rateFirstPerKm: isTwo ? n(f.rateFirstPerKm) : n(f.perKm),
      rateAfterPerKm: isTwo ? n(f.rateAfterPerKm) : n(f.perKm),
      thresholdKm: n(f.thresholdKm),
      waitingPerHour: n(f.waitingPerHour),
      minFare: n(f.minFare),
      vehicleClassMultipliers: {
        standard: 1,
        xl: Math.max(0.01, n(xlMult) || 1.2),
        wheelchair: Math.max(0.01, n(wcMult) || 1),
      },
      xlPricingMode: xlPricingMode,
      xlFixedSurchargeEur: Math.max(0, n(xlFixedEur)),
      wheelchairFixedSurchargeEur: Math.max(0, n(wheelchairFixedEur)),
      largeVehicleSurcharge: {
        minPassengers: Math.max(1, Math.round(n(f.largeVehicleMinPassengers))),
        amountEur: Math.max(0, n(f.largeVehicleAmountEur)),
      },
      rounding: typeof preserved.rounding === "string" ? preserved.rounding : "ceil_tenth",
    };
    if (tripEur > 0) {
      out.perMin = tripEur;
      out.pricePerMinute = tripEur;
    }
    const wco = buildWheelchairOverride();
    const prevVto =
      prev.vehicleTariffOverrides && typeof prev.vehicleTariffOverrides === "object" && !Array.isArray(prev.vehicleTariffOverrides)
        ? { .../** @type {object} */ (prev.vehicleTariffOverrides) }
        : {};
    if (wco) prevVto.wheelchair = wco;
    else delete prevVto.wheelchair;
    if (Object.keys(prevVto).length) out.vehicleTariffOverrides = prevVto;
    return out;
  };

  const saveTariffs = async () => {
    setError("");
    setOk("");
    if (!selectedRegionId) {
      setError("Kein Gebiet gewählt.");
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
      pricingMode: "taxi_tariff",
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
      setOk("Tarife gespeichert. Öffentlich: GET /api/app/config, Schätzung GET /api/fare-estimate, Buchung POST /api/rides (tariff_snapshot_json unverändert).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
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
      setError("Gebiet: Name und mindestens einen Ort/Suchbegriff.");
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
      setOk("Gebiet gespeichert.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
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
      setError("Neues Gebiet: Name und mindestens einen Suchbegriff (Orte, Synonyme).");
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
      setOk(`Gebiet „${label}“ angelegt — Tarif speichern nicht vergessen.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setAddBusy(false);
    }
  };

  const runPreview = async () => {
    if (!selectedRegionId) return;
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
        vehicle: pvVehicle,
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

  if (loading) {
    return (
      <div className="admin-page">
        <p className="admin-table-sub">Laden …</p>
      </div>
    );
  }

  const hasRegions = serviceRegions.length > 0;
  const bd =
    preview?.estimate && typeof preview.estimate === "object"
      ? /** @type {{ breakdown?: object }} */ (preview.estimate).breakdown
      : null;

  const kmFields = (prefix, f, onN, setMode) => (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="radio" name={`${prefix}-km`} checked={f.kmMode === "single"} onChange={() => setMode("single")} />
          Einheitlicher km-Preis
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="radio" name={`${prefix}-km`} checked={f.kmMode === "two_tier"} onChange={() => setMode("two_tier")} />
          Zwei Kilometer-Staffeln (Schwelle)
        </label>
      </div>
      {f.kmMode === "single" ? (
        <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
          Preis pro km (€/km)
          <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(f.perKm)} onChange={onN("perKm")} />
        </label>
      ) : (
        <div className="admin-form-vertical" style={{ marginTop: 8, gap: 8 }}>
          <label className="admin-form-label">
            Preis pro km bis Schwelle (€/km)
            <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(f.rateFirstPerKm)} onChange={onN("rateFirstPerKm")} />
          </label>
          <label className="admin-form-label">
            Schwelle erste Kilometer (km)
            <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(f.thresholdKm)} onChange={onN("thresholdKm")} />
          </label>
          <label className="admin-form-label">
            Preis pro km ab Schwelle (€/km)
            <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(f.rateAfterPerKm)} onChange={onN("rateAfterPerKm")} />
          </label>
        </div>
      )}
    </>
  );

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {ok ? <div className="admin-info-banner admin-info-banner--ok">{ok}</div> : null}

      <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Betrieb &amp; Preise</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.55, maxWidth: 720 }}>
          Eine Oberfläche für Einfahrt-Gebiete und Taxitarif. Daten in <code>app_operational_config</code> /{" "}
          <code>serviceRegions</code> — Preisberechnung ausschließlich serverseitig (<code>/fare-estimate</code>,{" "}
          <code>POST /rides</code>, <code>tariff_snapshot_json</code> bei Buchung).
        </p>
      </div>

      <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">1) Gebiet</div>
        <p className="admin-table-sub">
          Orte und Synonyme als kommagetrennte Liste — die App prüft die <strong>Abholadresse</strong> gegen aktive Gebiete (Substring im
          vollständigen Adresstext; optional Radius-Modus weiterhin über die Detailseite „Gebiete &amp; Zonen“).
        </p>
        <div className="admin-form-vertical" style={{ maxWidth: 520, marginTop: 10 }}>
          <label className="admin-form-label">
            Neues Gebiet — Anzeigename
            <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="z. B. Landkreis Esslingen" />
          </label>
          <label className="admin-form-label">
            Orte / Synonyme
            <input
              className="admin-input"
              style={{ display: "block", marginTop: 4 }}
              value={newTerms}
              onChange={(e) => setNewTerms(e.target.value)}
              placeholder="Esslingen, Nürtingen, Wendlingen, …"
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input type="checkbox" checked={newRegActive} onChange={(e) => setNewRegActive(e.target.checked)} />
            <span>Gebiet aktiv</span>
          </label>
          <button type="button" className="admin-m-btn-pri" style={{ marginTop: 10, alignSelf: "flex-start" }} onClick={addRegion} disabled={addBusy}>
            {addBusy ? "…" : "Gebiet hinzufügen"}
          </button>
        </div>

        {hasRegions ? (
          <div style={{ marginTop: 20, maxWidth: 640 }} className="admin-form-vertical">
            <label className="admin-form-label">
              Gebiet bearbeiten
              <select className="admin-input" style={{ display: "block", marginTop: 4, maxWidth: 400 }} value={selectedRegionId} onChange={(e) => setSelectedRegionId(e.target.value)}>
                {serviceRegions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} {!r.isActive ? "(inaktiv)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-form-label">
              Name
              <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={edLabel} onChange={(e) => setEdLabel(e.target.value)} />
            </label>
            <label className="admin-form-label">
              Orte / Synonyme
              <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={edTerms} onChange={(e) => setEdTerms(e.target.value)} />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={edActive} onChange={(e) => setEdActive(e.target.checked)} />
                aktiv
              </label>
              <label>
                Sortierung{" "}
                <input className="admin-input" style={{ width: 64, display: "inline-block", marginLeft: 4 }} value={edSort} onChange={(e) => setEdSort(e.target.value)} />
              </label>
              <button type="button" className="admin-c-btn-sec" onClick={saveRegionMeta}>
                Gebiet speichern
              </button>
            </div>
          </div>
        ) : (
          <p className="admin-table-sub" style={{ marginTop: 12 }}>
            Noch kein Gebiet — oben anlegen.
          </p>
        )}
      </div>

      {hasRegions && selectedRegionId ? (
        <>
          <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">2) Standard-Taxi-Tarif (dieses Gebiet)</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input type="checkbox" checked={!!tariffsActive} onChange={(e) => setTariffsActive(e.target.checked)} />
              <span>Tarifmodul plattformweit aktiv (aus: Buchungen mit 400 „tariffs_inactive“)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} />
              <span>Tarif-Override für dieses Gebiet aktiv</span>
            </label>
            <div className="admin-form-vertical" style={{ maxWidth: 560, marginTop: 12 }}>
              <label className="admin-form-label">
                Grundgebühr (€)
                <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(form.baseFare)} onChange={onNum("baseFare")} />
              </label>
              {kmFields("std", form, onNum, (mode) => setForm((p) => ({ ...p, kmMode: mode })))}
              <label className="admin-form-label" style={{ marginTop: 10 }}>
                Fahrtminute (€/min, Routenzeit)
                <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(form.tripMinEur)} onChange={onNum("tripMinEur")} />
              </label>
              <label className="admin-form-label">
                Wartezeit (€/Stunde)
                <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(form.waitingPerHour)} onChange={onNum("waitingPerHour")} />
              </label>
              <label className="admin-form-label">
                Mindestpreis (€)
                <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(form.minFare)} onChange={onNum("minFare")} />
              </label>
              <p className="admin-table-sub" style={{ fontWeight: 600, marginTop: 14 }}>
                Großraum-Zuschlag (ab Personenzahl, Standard/XL-Logik)
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label className="admin-form-label" style={{ flex: "1 1 160px" }}>
                  ab Personen
                  <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(form.largeVehicleMinPassengers)} onChange={onNum("largeVehicleMinPassengers")} />
                </label>
                <label className="admin-form-label" style={{ flex: "1 1 160px" }}>
                  Betrag (€)
                  <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(form.largeVehicleAmountEur)} onChange={onNum("largeVehicleAmountEur")} />
                </label>
              </div>
            </div>
          </div>

          <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">3) Fahrzeug- und Sondertarife</div>
            <p className="admin-table-sub">XL: Multiplikator auf den Fahrpreis, fester Zuschlag oder beides. Rollstuhl: optional kompletter Ersatz-Tarif + optionaler Fixzuschlag.</p>

            <div className="admin-form-vertical" style={{ maxWidth: 560, marginTop: 12 }}>
              <p className="admin-table-sub" style={{ fontWeight: 600 }}>
                XL
              </p>
              <label className="admin-form-label">
                Art
                <select className="admin-input" style={{ display: "block", marginTop: 4, maxWidth: 320 }} value={xlPricingMode} onChange={(e) => setXlPricingMode(e.target.value)}>
                  <option value="multiplier">Multiplikator auf Fahrpreis</option>
                  <option value="fixed">Nur fixer Zuschlag (€)</option>
                  <option value="both">Multiplikator + fixer Zuschlag</option>
                </select>
              </label>
              {(xlPricingMode === "multiplier" || xlPricingMode === "both") && (
                <label className="admin-form-label">
                  XL-Multiplikator (z. B. 1,2)
                  <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={xlMult} onChange={(e) => setXlMult(e.target.value)} />
                </label>
              )}
              {(xlPricingMode === "fixed" || xlPricingMode === "both") && (
                <label className="admin-form-label">
                  XL fester Zuschlag (€)
                  <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={xlFixedEur} onChange={(e) => setXlFixedEur(e.target.value)} />
                </label>
              )}

              <p className="admin-table-sub" style={{ fontWeight: 600, marginTop: 16 }}>
                Rollstuhl — Multiplikator (wenn kein eigener Tarif)
              </p>
              <label className="admin-form-label">
                Faktor (1 = aus)
                <input className="admin-input" style={{ display: "block", marginTop: 4, maxWidth: 200 }} value={wcMult} onChange={(e) => setWcMult(e.target.value)} />
              </label>
              <label className="admin-form-label">
                Optional: fixer Zuschlag (€), zusätzlich nach Multiplikator
                <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={wheelchairFixedEur} onChange={(e) => setWheelchairFixedEur(e.target.value)} />
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
                <input type="checkbox" checked={wcEnabled} onChange={(e) => setWcEnabled(e.target.checked)} />
                <span>Eigenen Rollstuhl-Tarif verwenden (Grundgebühr, km-Staffeln, Minuten, Mindestpreis)</span>
              </label>
              {wcEnabled ? (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.08)" }} className="admin-form-vertical">
                  <label className="admin-form-label">
                    Grundgebühr (€)
                    <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(wcForm.baseFare)} onChange={onWcNum("baseFare")} />
                  </label>
                  {kmFields("wc", wcForm, onWcNum, (mode) => setWcForm((p) => ({ ...p, kmMode: mode })))}
                  <label className="admin-form-label" style={{ marginTop: 10 }}>
                    Fahrtminute (€/min)
                    <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(wcForm.tripMinEur)} onChange={onWcNum("tripMinEur")} />
                  </label>
                  <label className="admin-form-label">
                    Wartezeit (€/Stunde)
                    <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(wcForm.waitingPerHour)} onChange={onWcNum("waitingPerHour")} />
                  </label>
                  <label className="admin-form-label">
                    Mindestpreis (€)
                    <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={String(wcForm.minFare)} onChange={onWcNum("minFare")} />
                  </label>
                </div>
              ) : null}

              <button type="button" className="admin-m-btn-pri" style={{ marginTop: 16 }} onClick={saveTariffs}>
                Tarif &amp; Fahrzeuge speichern
              </button>
            </div>
          </div>

          <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Testrechnung (Vorschau)</div>
            <p className="admin-table-sub">10 km, 20 Fahrtminuten — gleiche Engine wie Live.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, alignItems: "center" }}>
              <label>
                Warte-Min.{" "}
                <input className="admin-input" style={{ width: 72 }} value={String(pvTestWait)} onChange={(e) => setPvTestWait(n(e.target.value))} />
              </label>
              <label className="admin-form-label">
                Fahrzeug
                <select className="admin-input" style={{ display: "block", marginTop: 4 }} value={pvVehicle} onChange={(e) => setPvVehicle(e.target.value)}>
                  <option value="standard">Standard</option>
                  <option value="xl">XL</option>
                  <option value="wheelchair">Rollstuhl</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={pvHoliday} onChange={(e) => setPvHoliday(e.target.checked)} />
                Feiertag
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={pvAirport} onChange={(e) => setPvAirport(e.target.checked)} />
                Flughafen-Pauschale
              </label>
              <button type="button" className="admin-c-btn-sec" onClick={runPreview} disabled={prevBusy}>
                {prevBusy ? "…" : "Vorschau"}
              </button>
            </div>
            {preview && preview.estimate && typeof preview.estimate === "object" ? (
              <div className="admin-m-sec" style={{ marginTop: 12, padding: 12, background: "rgba(0,50,60,0.08)", borderRadius: 8, maxWidth: 480 }}>
                <p style={{ fontWeight: 600 }}>
                  Gesamt: {String(/** @type {{ taxiTotal?: number; total?: number }} */ (preview.estimate).taxiTotal ?? preview.estimate.total)} €
                </p>
                {bd && typeof bd === "object" ? (
                  <ul className="admin-table-sub" style={{ margin: "6px 0 0 18px" }}>
                    <li>Grund: {String(/** @type {Record<string, unknown>} */ (bd).baseFare)} €</li>
                    <li>Strecke: {String(/** @type {Record<string, unknown>} */ (bd).distanceCharge)} €</li>
                    <li>Fahrtzeit: {String(/** @type {Record<string, unknown>} */ (bd).tripMinutesCharge)} €</li>
                    <li>Wartezeit: {String(/** @type {Record<string, unknown>} */ (bd).waitingCharge)} €</li>
                    <li>Faktor Fahrzeugklasse: {String(/** @type {Record<string, unknown>} */ (bd).vehicleClassMultiplier)}</li>
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <details className="admin-m-sec" style={{ marginTop: 8 }}>
            <summary className="admin-table-sub" style={{ cursor: "pointer", fontWeight: 600 }}>
              Erweitert: Nacht-/Wochenend-Zuschläge und Radius-Gebiete
            </summary>
            <p className="admin-table-sub" style={{ marginTop: 8, maxWidth: 720 }}>
              Prozent-Zuschläge und weitere Felder bleiben in der Konfiguration erhalten (werden hier nicht geändert). Für{" "}
              <strong>Radius-Einfahrt</strong> (Koordinaten statt Text) weiter die Seite{" "}
              <strong>Gebiete &amp; Zonen</strong> in der Navigation nutzen.
            </p>
          </details>
        </>
      ) : null}
    </div>
  );
}
