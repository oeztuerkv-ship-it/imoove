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

/** @returns {{ baseFare: string; bisKm: string; preisBis: string; danach: string; tripMin: string; waitH: string; minFare: string }} */
function tierDefaults() {
  return {
    baseFare: "4,30",
    bisKm: "4",
    preisBis: "3,00",
    danach: "2,50",
    tripMin: "0,63",
    waitH: "38",
    minFare: "0",
  };
}

function mergedFromTariffRow(tr, rowSansOverrides) {
  const g = tr && typeof tr === "object" ? { ...tr } : {};
  delete g.byServiceRegion;
  const r = rowSansOverrides && typeof rowSansOverrides === "object" ? { ...rowSansOverrides } : {};
  delete r.byServiceRegion;
  delete r.vehicleTariffOverrides;
  return { ...g, ...r };
}

function sliceToTierForm(slice) {
  const d = tierDefaults();
  if (!slice || typeof slice !== "object") return d;
  return {
    baseFare: slice.baseFare != null ? String(slice.baseFare).replace(".", ",") : d.baseFare,
    bisKm: slice.thresholdKm != null ? String(slice.thresholdKm).replace(".", ",") : d.bisKm,
    preisBis: slice.rateFirstPerKm != null ? String(slice.rateFirstPerKm).replace(".", ",") : d.preisBis,
    danach: slice.rateAfterPerKm != null ? String(slice.rateAfterPerKm).replace(".", ",") : d.danach,
    tripMin: String(tripEurFromMergedLike(slice) || 0.63).replace(".", ","),
    waitH: slice.waitingPerHour != null ? String(slice.waitingPerHour).replace(".", ",") : d.waitH,
    minFare:
      slice.minFare != null
        ? String(slice.minFare).replace(".", ",")
        : slice.minPrice != null
          ? String(slice.minPrice).replace(".", ",")
          : d.minFare,
  };
}

function buildTwoTierPayload(f) {
  const trip = n(f.tripMin);
  const o = {
    active: true,
    baseFare: n(f.baseFare),
    kmPricingModel: "two_tier",
    perKm: 0,
    rateFirstPerKm: n(f.preisBis),
    rateAfterPerKm: n(f.danach),
    thresholdKm: n(f.bisKm),
    waitingPerHour: n(f.waitH),
    minFare: n(f.minFare),
    rounding: "ceil_tenth",
  };
  if (trip > 0) {
    o.perMin = trip;
    o.pricePerMinute = trip;
  }
  return o;
}

function parseOrtListe(s) {
  return String(s || "")
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
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

function TarifBlock({ title, hint, value, onChange }) {
  const ch = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
      <div className="admin-panel-card__title">{title}</div>
      {hint ? (
        <p className="admin-table-sub" style={{ marginTop: 4 }}>
          {hint}
        </p>
      ) : null}
      <div className="admin-form-vertical" style={{ maxWidth: 420, marginTop: 10 }}>
        <label className="admin-form-label">
          Grundgebühr
          <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={value.baseFare} onChange={ch("baseFare")} inputMode="decimal" />
        </label>
        <label className="admin-form-label">
          Bis km
          <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={value.bisKm} onChange={ch("bisKm")} inputMode="decimal" />
        </label>
        <label className="admin-form-label">
          Preis bis dahin (€ je km)
          <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={value.preisBis} onChange={ch("preisBis")} inputMode="decimal" />
        </label>
        <label className="admin-form-label">
          Danach (€ je km)
          <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={value.danach} onChange={ch("danach")} inputMode="decimal" />
        </label>
        <label className="admin-form-label" style={{ marginTop: 8 }}>
          Fahrtminute (€ je Minute Fahrt)
          <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={value.tripMin} onChange={ch("tripMin")} inputMode="decimal" />
        </label>
        <label className="admin-form-label">
          Wartezeit (€ je Stunde)
          <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={value.waitH} onChange={ch("waitH")} inputMode="decimal" />
        </label>
        <label className="admin-form-label">
          Mindestpreis (€ je Fahrt)
          <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={value.minFare} onChange={ch("minFare")} inputMode="decimal" />
        </label>
      </div>
    </div>
  );
}

/**
 * Betrieb & Preise — Gebiete (ein Name, viele Orte) und drei gleiche Tarifkarten (Standard, XL, Rollstuhl).
 * Speicherung unverändert über `app_operational_config`; Engine /fare-estimate & POST /rides.
 */
export default function AppOperationalTariffsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [config, setConfig] = useState(/** @type {Record<string, unknown> | null} */ (null));
  const [serviceRegions, setServiceRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [tariffsActive, setTariffsActive] = useState(true);
  const [stdForm, setStdForm] = useState(() => tierDefaults());
  const [xlForm, setXlForm] = useState(() => tierDefaults());
  const [wcForm, setWcForm] = useState(() => tierDefaults());
  const [edLabel, setEdLabel] = useState("");
  const [edTerms, setEdTerms] = useState("");
  const [edActive, setEdActive] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newTerms, setNewTerms] = useState("");
  const [newRegActive, setNewRegActive] = useState(true);
  const [addBusy, setAddBusy] = useState(false);
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
      setStdForm(tierDefaults());
      setXlForm(tierDefaults());
      setWcForm(tierDefaults());
      return;
    }
    const tr = config.tariffs && typeof config.tariffs === "object" ? config.tariffs : {};
    const bsr = tr && typeof tr.byServiceRegion === "object" ? tr.byServiceRegion : {};
    const existingFull = bsr[selectedRegionId] && typeof bsr[selectedRegionId] === "object" ? bsr[selectedRegionId] : {};
    const { vehicleTariffOverrides: vtoRaw, ...existingSansVto } = /** @type {Record<string, unknown>} */ (existingFull);
    const existing = /** @type {Record<string, unknown>} */ (existingSansVto);
    const merged = mergedFromTariffRow(tr, existing);
    const sr = serviceRegions.find((r) => r.id === selectedRegionId);
    if (sr) {
      setEdLabel(sr.label ?? "");
      setEdTerms((sr.matchTerms || []).join("\n"));
      setEdActive(!!sr.isActive);
    }
    setStdForm(sliceToTierForm(merged));

    const vto = vtoRaw && typeof vtoRaw === "object" && !Array.isArray(vtoRaw) ? /** @type {Record<string, unknown>} */ (vtoRaw) : {};
    const xlOv = vto.xl && typeof vto.xl === "object" ? /** @type {Record<string, unknown>} */ (vto.xl) : null;
    const wcOv = vto.wheelchair && typeof vto.wheelchair === "object" ? /** @type {Record<string, unknown>} */ (vto.wheelchair) : null;
    setXlForm(sliceToTierForm(xlOv || merged));
    setWcForm(sliceToTierForm(wcOv || merged));
  }, [config, selectedRegionId, serviceRegions]);

  const buildRegionTariffPayload = () => {
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
    const std = buildTwoTierPayload(stdForm);
    const out = {
      ...preserved,
      surcharges,
      nightSurchargePercent: sn.enabled ? n(sn.percent) : 0,
      weekendSurchargePercent: swe.enabled ? n(swe.percent) : 0,
      holidaySurchargePercent: sh.enabled ? n(sh.percent) : 0,
      active: true,
      ...std,
      largeVehicleSurcharge:
        prev.largeVehicleSurcharge && typeof prev.largeVehicleSurcharge === "object"
          ? prev.largeVehicleSurcharge
          : { minPassengers: 5, amountEur: 0 },
      vehicleClassMultipliers: { standard: 1, xl: 1, wheelchair: 1 },
      xlPricingMode: "multiplier",
      xlFixedSurchargeEur: 0,
      wheelchairFixedSurchargeEur: 0,
      rounding: typeof preserved.rounding === "string" ? preserved.rounding : "ceil_tenth",
      vehicleTariffOverrides: {
        xl: buildTwoTierPayload(xlForm),
        wheelchair: buildTwoTierPayload(wcForm),
      },
    };
    return out;
  };

  const saveTariffs = async () => {
    setError("");
    setOk("");
    if (!selectedRegionId) {
      setError("Bitte ein Gebiet wählen.");
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
      setOk("Gespeichert. Die App nutzt weiter die Server-Preise (Schätzung und Buchung).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  const saveRegionMeta = async () => {
    if (!selectedRegionId) return;
    setError("");
    setOk("");
    const matchTerms = parseOrtListe(edTerms);
    if (!edLabel.trim() || !matchTerms.length) {
      setError("Gebiet: Name ausfüllen und darunter mindestens einen Ort eintragen.");
      return;
    }
    const cur = serviceRegions.find((r) => r.id === selectedRegionId);
    const sortOrder = cur && typeof cur.sortOrder === "number" && Number.isFinite(cur.sortOrder) ? cur.sortOrder : 1;
    try {
      const res = await fetch(`${URL}/service-regions/${encodeURIComponent(selectedRegionId)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          label: edLabel.trim(),
          matchTerms,
          isActive: edActive,
          sortOrder,
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
    const matchTerms = parseOrtListe(newTerms);
    if (!label || !matchTerms.length) {
      setError("Neues Gebiet: Name und darunter Orte eintragen (eine Zeile oder durch Komma getrennt).");
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
      setOk(`Gebiet „${label}“ angelegt.`);
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

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {ok ? <div className="admin-info-banner admin-info-banner--ok">{ok}</div> : null}

      <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Betrieb &amp; Preise</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.55, maxWidth: 720 }}>
          Hier legen Sie fest, wo gefahren werden darf und was eine Fahrt kostet. Die Kunden-App fragt die Preise beim Server ab — nichts wird in der App selbst gerechnet.
        </p>
      </div>

      <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Wo darf gefahren werden?</div>
        <p className="admin-table-sub">Ein Gebiet hat einen Namen und darunter alle Orte, die dazu gehören (eintragen wie auf einem Zettel — Komma oder neue Zeile).</p>

        {!hasRegions ? (
          <div className="admin-form-vertical" style={{ maxWidth: 520, marginTop: 12 }}>
            <label className="admin-form-label">
              Name des Gebiets
              <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="z. B. Landkreis Esslingen" />
            </label>
            <label className="admin-form-label">
              Orte in diesem Gebiet
              <textarea
                className="admin-input"
                rows={5}
                style={{ display: "block", marginTop: 4, minHeight: 100, resize: "vertical" }}
                value={newTerms}
                onChange={(e) => setNewTerms(e.target.value)}
                placeholder={"z. B.\nEsslingen\nNürtingen\nWendlingen\nFrickenhausen\nLeinfelden-Echterdingen\nFilderstadt"}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input type="checkbox" checked={newRegActive} onChange={(e) => setNewRegActive(e.target.checked)} />
              <span>Dieses Gebiet ist aktiv (nur aktive Gebiete zählen für die App)</span>
            </label>
            <button type="button" className="admin-m-btn-pri" style={{ marginTop: 12, alignSelf: "flex-start" }} onClick={addRegion} disabled={addBusy}>
              {addBusy ? "…" : "Gebiet anlegen"}
            </button>
          </div>
        ) : (
          <div className="admin-form-vertical" style={{ maxWidth: 560, marginTop: 12 }}>
            <label className="admin-form-label">
              Gebiet auswählen
              <select className="admin-input" style={{ display: "block", marginTop: 4, maxWidth: 440 }} value={selectedRegionId} onChange={(e) => setSelectedRegionId(e.target.value)}>
                {serviceRegions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                    {!r.isActive ? " — zurzeit aus" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-form-label">
              Name
              <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={edLabel} onChange={(e) => setEdLabel(e.target.value)} />
            </label>
            <label className="admin-form-label">
              Orte in diesem Gebiet
              <textarea
                className="admin-input"
                rows={6}
                style={{ display: "block", marginTop: 4, minHeight: 120, resize: "vertical" }}
                value={edTerms}
                onChange={(e) => setEdTerms(e.target.value)}
                placeholder="Orte durch Komma oder Zeilenumbruch trennen"
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input type="checkbox" checked={edActive} onChange={(e) => setEdActive(e.target.checked)} />
              <span>Dieses Gebiet ist aktiv</span>
            </label>
            <button type="button" className="admin-c-btn-sec" style={{ marginTop: 12, alignSelf: "flex-start" }} onClick={saveRegionMeta}>
              Gebiet speichern
            </button>

            <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
              <p className="admin-table-sub" style={{ fontWeight: 600, marginBottom: 8 }}>
                Weiteres Gebiet
              </p>
              <label className="admin-form-label">
                Name
                <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
              </label>
              <label className="admin-form-label">
                Orte
                <textarea className="admin-input" rows={3} style={{ display: "block", marginTop: 4, minHeight: 72 }} value={newTerms} onChange={(e) => setNewTerms(e.target.value)} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <input type="checkbox" checked={newRegActive} onChange={(e) => setNewRegActive(e.target.checked)} />
                <span>aktiv</span>
              </label>
              <button type="button" className="admin-m-btn-pri" style={{ marginTop: 10 }} onClick={addRegion} disabled={addBusy}>
                {addBusy ? "…" : "Weiteres Gebiet anlegen"}
              </button>
            </div>
          </div>
        )}
      </div>

      {hasRegions && selectedRegionId ? (
        <>
          <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Allgemein</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input type="checkbox" checked={!!tariffsActive} onChange={(e) => setTariffsActive(e.target.checked)} />
              <span>Preise sind buchbar (wenn aus: keine neuen Fahrten über die App)</span>
            </label>
          </div>

          <TarifBlock title="STANDARD" hint="Normales Taxi — gilt für die Standard-Fahrzeugklasse." value={stdForm} onChange={setStdForm} />
          <TarifBlock title="XL" hint="Größeres Fahrzeug — eigene Preise." value={xlForm} onChange={setXlForm} />
          <TarifBlock title="ROLLSTUHL" hint="Rollstuhlfahrten — eigene Preise." value={wcForm} onChange={setWcForm} />

          <div style={{ marginBottom: 20 }}>
            <button type="button" className="admin-m-btn-pri" onClick={saveTariffs}>
              Alle Preise speichern
            </button>
          </div>

          <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
            <div className="admin-panel-card__title">Kurz rechnen (Beispiel)</div>
            <p className="admin-table-sub">10 km, 20 Minuten Fahrt — nur zum Prüfen, nicht für Gäste sichtbar.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, alignItems: "center" }}>
              <label>
                Warten (Minuten){" "}
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
                Feiertag (falls eingestellt)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={pvAirport} onChange={(e) => setPvAirport(e.target.checked)} />
                Flughafen (falls eingestellt)
              </label>
              <button type="button" className="admin-c-btn-sec" onClick={runPreview} disabled={prevBusy}>
                {prevBusy ? "…" : "Beispiel anzeigen"}
              </button>
            </div>
            {preview && preview.estimate && typeof preview.estimate === "object" ? (
              <div className="admin-m-sec" style={{ marginTop: 12, padding: 12, background: "rgba(0,50,60,0.08)", borderRadius: 8, maxWidth: 480 }}>
                <p style={{ fontWeight: 600 }}>
                  Ungefährer Gesamtpreis:{" "}
                  {String(/** @type {{ taxiTotal?: number; total?: number }} */ (preview.estimate).taxiTotal ?? preview.estimate.total)} €
                </p>
                {bd && typeof bd === "object" ? (
                  <ul className="admin-table-sub" style={{ margin: "6px 0 0 18px" }}>
                    <li>Grund: {String(/** @type {Record<string, unknown>} */ (bd).baseFare)} €</li>
                    <li>Strecke: {String(/** @type {Record<string, unknown>} */ (bd).distanceCharge)} €</li>
                    <li>Fahrtzeit: {String(/** @type {Record<string, unknown>} */ (bd).tripMinutesCharge)} €</li>
                    <li>Wartezeit: {String(/** @type {Record<string, unknown>} */ (bd).waitingCharge)} €</li>
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <details className="admin-m-sec" style={{ marginTop: 8 }}>
            <summary className="admin-table-sub" style={{ cursor: "pointer", fontWeight: 600 }}>
              Mehr Optionen (Nachtzuschläge, Karte mit Kreis statt Ortsliste)
            </summary>
            <p className="admin-table-sub" style={{ marginTop: 8, maxWidth: 720 }}>
              Zuschläge für Nacht und Wochenende bleiben gespeichert, werden hier aber nicht geändert. Wenn Sie ein Gebiet per Karte und Kreis
              (Radius) statt Ortsnamen brauchen, nutzen Sie die Seite <strong>Gebiete (Radius, Erweitert)</strong> in der Navigation.
            </p>
          </details>
        </>
      ) : null}
    </div>
  );
}
