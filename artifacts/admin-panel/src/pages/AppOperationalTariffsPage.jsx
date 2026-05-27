import CollapsibleCard from "../components/CollapsibleCard.jsx";
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
    tripMin: String(Math.round((tripEurFromMergedLike(slice) || 0.63) * 10000) / 10000).replace(".", ","),
    waitH: slice.waitingPerHour != null ? String(Math.round(Number(slice.waitingPerHour) * 100) / 100).replace(".", ",") : d.waitH,
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
    "tariffTemplateId",
    "tariffTemplateName",
  ];
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(prev, k)) out[k] = /** @type {Record<string, unknown>} */ (prev)[k];
  }
  return out;
}

function getByServiceRegion(config) {
  const tr = config?.tariffs && typeof config.tariffs === "object" ? config.tariffs : {};
  const bsr = tr.byServiceRegion && typeof tr.byServiceRegion === "object" ? tr.byServiceRegion : {};
  return /** @type {Record<string, Record<string, unknown>>} */ (bsr);
}

function getRegionTariffTemplateIds(config) {
  const raw = config?.regionTariffTemplateIds;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return /** @type {Record<string, string>} */ (raw);
}

function hasOwnRegionalTariff(bsr, regionId) {
  return !!(regionId && bsr[regionId] && typeof bsr[regionId] === "object");
}

/** @returns {{ mode: 'global'|'regional'|'template'; label: string; warning: string|null; templateId: string|null; templateName: string|null }} */
function resolveRegionPricingStatus(config, region, templates) {
  const bsr = getByServiceRegion(config);
  const assignments = getRegionTariffTemplateIds(config);
  const regionId = region?.id ?? "";
  const row = hasOwnRegionalTariff(bsr, regionId) ? bsr[regionId] : null;
  const assignedId = assignments[regionId] || (row?.tariffTemplateId ? String(row.tariffTemplateId) : "");
  const tpl = assignedId ? templates.find((t) => t.id === assignedId) : null;
  const templateName =
    (row?.tariffTemplateName && String(row.tariffTemplateName)) || tpl?.name || (assignedId ? assignedId : null);

  if (row && assignedId && templateName) {
    return {
      mode: "template",
      label: `Vorlage: ${templateName}`,
      warning: null,
      templateId: assignedId,
      templateName,
    };
  }
  if (row) {
    return {
      mode: "regional",
      label: "Eigener Regional-Tarif (manuell)",
      warning: null,
      templateId: assignedId || null,
      templateName: templateName,
    };
  }
  if (assignedId && !row) {
    return {
      mode: "template",
      label: `Vorlage zugeordnet: ${templateName || assignedId}`,
      warning: "Vorlage ist zugeordnet, aber noch nicht auf dieses Gebiet angewendet — bitte „Vorlage zuweisen & speichern“.",
      templateId: assignedId,
      templateName,
    };
  }
  return {
    mode: "global",
    label: "Global-Tarif (Plattform-Standard)",
    warning:
      region?.isActive && !row
        ? "Aktives Gebiet ohne eigenen Tarif — Schätzpreise nutzen den globalen Tarif aus der Plattform-Konfiguration."
        : null,
    templateId: null,
    templateName: null,
  };
}

function surchargeBlockFromRow(row) {
  const sur =
    row?.surcharges && typeof row.surcharges === "object"
      ? row.surcharges
      : { night: { ...emptySurcharge }, weekend: { ...emptySurcharge }, holiday: { ...emptySurcharge } };
  const pick = (key) => {
    const b = sur[key] && typeof sur[key] === "object" ? sur[key] : {};
    return { enabled: !!b.enabled, percent: b.percent != null ? String(b.percent).replace(".", ",") : "0" };
  };
  return { night: pick("night"), weekend: pick("weekend"), holiday: pick("holiday") };
}

function applySurchargesToPayload(out, surchargeForms) {
  const surcharges = {
    night: { enabled: surchargeForms.night.enabled, percent: n(surchargeForms.night.percent) },
    weekend: { enabled: surchargeForms.weekend.enabled, percent: n(surchargeForms.weekend.percent) },
    holiday: { enabled: surchargeForms.holiday.enabled, percent: n(surchargeForms.holiday.percent) },
  };
  out.surcharges = surcharges;
  out.nightSurchargePercent = surcharges.night.enabled ? surcharges.night.percent : 0;
  out.weekendSurchargePercent = surcharges.weekend.enabled ? surcharges.weekend.percent : 0;
  out.holidaySurchargePercent = surcharges.holiday.enabled ? surcharges.holiday.percent : 0;
  if (surchargeForms.validFrom?.trim()) out.validFrom = surchargeForms.validFrom.trim();
  return out;
}

function loadTemplateIntoEditor(tpl, setters) {
  if (!tpl) return;
  const {
    setStdForm,
    setXlForm,
    setWcForm,
    setXlSurchargeEur,
    setWcSurchargeEur,
    setTplNote,
    setTplValidFrom,
    setSurchargeForms,
  } = setters;
  const rp = tpl.regionPayload && typeof tpl.regionPayload === "object" ? tpl.regionPayload : null;
  if (rp) {
    const tr = {};
    const { vehicleTariffOverrides: vtoRaw, ...sans } = rp;
    const merged = mergedFromTariffRow(tr, sans);
    setStdForm(sliceToTierForm(merged));
    const vto = vtoRaw && typeof vtoRaw === "object" ? vtoRaw : {};
    setXlForm(sliceToTierForm(vto.xl || merged));
    setWcForm(sliceToTierForm(vto.wheelchair || merged));
    if (rp.xlFixedSurchargeEur != null) setXlSurchargeEur(String(rp.xlFixedSurchargeEur).replace(".", ","));
    if (vto.wheelchair?.surchargeEur != null) setWcSurchargeEur(String(vto.wheelchair.surchargeEur));
    setTplNote(tpl.note ? String(tpl.note) : "");
    setTplValidFrom(tpl.validFrom ? String(tpl.validFrom) : rp.validFrom ? String(rp.validFrom) : "");
    setSurchargeForms(surchargeBlockFromRow(rp));
    return;
  }
  setStdForm({ ...tpl.std });
  setXlForm({ ...tpl.xl });
  setWcForm({ ...tpl.wc });
  setXlSurchargeEur(tpl.xlSurchargeEur ?? "7");
  setWcSurchargeEur(tpl.wcSurchargeEur ?? "0");
  setTplNote(tpl.note ? String(tpl.note) : "");
  setTplValidFrom(tpl.validFrom ? String(tpl.validFrom) : "");
  setSurchargeForms(
    tpl.surchargeForms || {
      night: { ...emptySurcharge },
      weekend: { ...emptySurcharge },
      holiday: { ...emptySurcharge },
    },
  );
}

function TarifBlock({ title, hint, value, onChange, surchargeEur, onSurchargeChange, surchargeLabel, surchargeHint }) {
  const ch = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const tripPerHour = (() => {
    const v = parseFloat(String(value.tripMin).replace(",", "."));
    if (!isFinite(v) || v <= 0) return null;
    return (v * 60).toFixed(2).replace(".", ",");
  })();
  const FieldRow = ({ children }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>
  );
  const Field = ({ label, fieldKey, unit, hint: fhint }) => (
    <label className="admin-form-label" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", border: "1px solid rgba(0,0,0,0.18)", borderRadius: 8, overflow: "hidden", background: "var(--admin-input-bg, #fff)" }}>
        <input
          className="admin-input"
          style={{ border: "none", outline: "none", padding: "7px 10px", flex: 1, minWidth: 0, background: "transparent" }}
          value={value[fieldKey]}
          onChange={ch(fieldKey)}
          inputMode="decimal"
        />
        <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", paddingRight: 10, whiteSpace: "nowrap" }}>{unit}</span>
      </div>
      {fhint ? <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 1 }}>{fhint}</span> : null}
    </label>
  );
  return (
    <CollapsibleCard title={title}>
      {hint ? <p className="admin-table-sub" style={{ marginTop: 2 }}>{hint}</p> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 14, maxWidth: 500 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.35)", marginBottom: 8 }}>Grundgebühren</p>
          <FieldRow>
            <Field label="Grundgebühr" fieldKey="baseFare" unit="€" />
            <Field label="Mindestpreis je Fahrt" fieldKey="minFare" unit="€" />
          </FieldRow>
        </div>
        <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", paddingTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.35)", marginBottom: 8 }}>Streckenpreise</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Tarif 1 bis" fieldKey="bisKm" unit="km" />
            <Field label="Preis Tarif 1" fieldKey="preisBis" unit="€/km" />
            <Field label="Preis Tarif 2" fieldKey="danach" unit="€/km" />
          </div>
          <p style={{ fontSize: 11, color: "rgba(0,0,0,0.38)", marginTop: 6 }}>
            Tarif 2 gilt ab {value.bisKm || "?"} km
          </p>
        </div>
        <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", paddingTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.35)", marginBottom: 8 }}>Zeitpreise</p>
          <FieldRow>
            <Field
              label="Fahrtminute"
              fieldKey="tripMin"
              unit="€/Min"
              fhint={tripPerHour ? `= ${tripPerHour} €/Std` : null}
            />
            <Field label="Wartezeit (Stau / Halt)" fieldKey="waitH" unit="€/Std" />
          </FieldRow>
        </div>
        {onSurchargeChange !== undefined && (
          <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", paddingTop: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.35)", marginBottom: 8 }}>Zuschlag</p>
            <div style={{ maxWidth: 220 }}>
              <label className="admin-form-label" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12 }}>{surchargeLabel || "Fahrzeugaufschlag"}</span>
                <div style={{ display: "flex", alignItems: "center", border: "1px solid rgba(0,0,0,0.18)", borderRadius: 8, overflow: "hidden", background: "var(--admin-input-bg, #fff)" }}>
                  <input
                    className="admin-input"
                    style={{ border: "none", outline: "none", padding: "7px 10px", flex: 1, minWidth: 0, background: "transparent" }}
                    value={surchargeEur ?? ""}
                    onChange={(e) => onSurchargeChange(e.target.value)}
                    inputMode="decimal"
                  />
                  <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", paddingRight: 10 }}>€</span>
                </div>
                <span style={{ fontSize: 11, color: "rgba(0,0,0,0.38)" }}>
                  {surchargeHint || "Wird zum Standard-Tarif addiert (kein Multiplikator, sofern nicht separat konfiguriert)."}
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
    </CollapsibleCard>
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
  const [xlSurchargeEur, setXlSurchargeEur] = useState("7");
  const [wcSurchargeEur, setWcSurchargeEur] = useState("0");
  const [templates, setTemplates] = useState([]);
  const [tplName, setTplName] = useState("");
  const [tplBusy, setTplBusy] = useState(false);
  const [activeTplId, setActiveTplId] = useState("");
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
  const [regionTariffTemplateIds, setRegionTariffTemplateIds] = useState(/** @type {Record<string, string>} */ ({}));
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [tplNote, setTplNote] = useState("");
  const [tplValidFrom, setTplValidFrom] = useState("");
  const [editingTplId, setEditingTplId] = useState("");
  const [surchargeForms, setSurchargeForms] = useState(() => ({
    night: { ...emptySurcharge },
    weekend: { ...emptySurcharge },
    holiday: { ...emptySurcharge },
  }));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      setConfig(data.config);
      setServiceRegions(Array.isArray(data.serviceRegions) ? data.serviceRegions : []);
      setTemplates(Array.isArray(data.config?.tariffTemplates) ? data.config.tariffTemplates : []);
      setRegionTariffTemplateIds(getRegionTariffTemplateIds(data.config || {}));
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
    const xlFix = existingFull.xlFixedSurchargeEur;
    if (xlFix != null && xlFix !== "") {
      setXlSurchargeEur(String(xlFix).replace(".", ","));
    } else {
      const lv = existingFull.largeVehicleSurcharge;
      if (lv && typeof lv === "object" && lv.amountEur != null) {
        setXlSurchargeEur(String(lv.amountEur).replace(".", ","));
      }
    }
    if (wcOv && wcOv.surchargeEur != null) {
      setWcSurchargeEur(String(wcOv.surchargeEur));
    }
    setSurchargeForms(surchargeBlockFromRow(existingFull));
    if (existingFull.validFrom) setTplValidFrom(String(existingFull.validFrom));
    const assign = getRegionTariffTemplateIds(config)[selectedRegionId];
    const rowTplId = existingFull.tariffTemplateId ? String(existingFull.tariffTemplateId) : "";
    setSelectedAssignmentId(assign || rowTplId || "");
    setActiveTplId(assign || rowTplId || "");
  }, [config, selectedRegionId, serviceRegions]);

  const selectedRegion = useMemo(
    () => serviceRegions.find((r) => r.id === selectedRegionId) ?? null,
    [serviceRegions, selectedRegionId],
  );

  const regionPricingStatus = useMemo(
    () => resolveRegionPricingStatus(config, selectedRegion, templates),
    [config, selectedRegion, templates],
  );

  const regionOverview = useMemo(() => {
    const bsr = getByServiceRegion(config);
    const assignments = getRegionTariffTemplateIds(config);
    return serviceRegions.map((r) => {
      const st = resolveRegionPricingStatus(config, r, templates);
      return {
        id: r.id,
        label: r.label,
        isActive: !!r.isActive,
        status: st,
        hasRegional: hasOwnRegionalTariff(bsr, r.id),
        assignedTemplateId: assignments[r.id] || null,
      };
    });
  }, [config, serviceRegions, templates]);

  const saveTemplates = async (newTpls) => {
    setTplBusy(true);
    try {
      await patchOperational({ tariffTemplates: newTpls });
      setTemplates(newTpls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setTplBusy(false);
    }
  };

  const editorSetters = useMemo(
    () => ({
      setStdForm,
      setXlForm,
      setWcForm,
      setXlSurchargeEur,
      setWcSurchargeEur,
      setTplNote,
      setTplValidFrom,
      setSurchargeForms,
    }),
    [],
  );

  const buildRegionTariffPayload = (meta = /** @type {{ templateId?: string; templateName?: string }} */ ({})) => {
    const prev = rawRegionTariff;
    const preserved = preservedAdvancedTariffKeys(prev);
    const std = buildTwoTierPayload(stdForm);
    let out = {
      ...preserved,
      active: true,
      ...std,
      largeVehicleSurcharge:
        prev.largeVehicleSurcharge && typeof prev.largeVehicleSurcharge === "object"
          ? prev.largeVehicleSurcharge
          : { minPassengers: 5, amountEur: 0 },
      vehicleClassMultipliers: { standard: 1, xl: 1, wheelchair: 1 },
      xlPricingMode: "fixed",
      xlFixedSurchargeEur: n(xlSurchargeEur),
      wheelchairFixedSurchargeEur: 0,
      rounding: typeof preserved.rounding === "string" ? preserved.rounding : "ceil_tenth",
      vehicleTariffOverrides: {
        xl: buildTwoTierPayload(xlForm),
        wheelchair: { ...buildTwoTierPayload(wcForm), surchargeEur: n(wcSurchargeEur) },
      },
    };
    out = applySurchargesToPayload(out, { ...surchargeForms, validFrom: tplValidFrom });
    if (meta.templateId) {
      out.tariffTemplateId = meta.templateId;
      out.tariffTemplateName = meta.templateName ?? "";
    }
    return out;
  };

  const buildTemplateRecord = (id, name) => {
    const regionPayload = buildRegionTariffPayload();
    return {
      id,
      name: name.trim(),
      note: tplNote.trim(),
      validFrom: tplValidFrom.trim(),
      regionPayload,
      std: { ...stdForm },
      xl: { ...xlForm },
      wc: { ...wcForm },
      xlSurchargeEur,
      wcSurchargeEur,
      surchargeForms: { ...surchargeForms },
      updatedAt: new Date().toISOString(),
    };
  };

  const saveCurrentAsTemplate = async () => {
    if (!tplName.trim()) {
      setError("Vorlagenname eingeben.");
      return;
    }
    const t = buildTemplateRecord(Date.now().toString(36), tplName);
    await saveTemplates([...templates, t]);
    setTplName("");
    setEditingTplId(t.id);
    setActiveTplId(t.id);
    setOk("Tarif-Vorlage gespeichert: " + t.name);
  };

  const updateEditingTemplate = async () => {
    if (!editingTplId) {
      setError("Keine Vorlage zum Aktualisieren — zuerst Vorlage wählen oder neu anlegen.");
      return;
    }
    const name = tplName.trim() || templates.find((t) => t.id === editingTplId)?.name || "Tarif";
    const next = templates.map((t) => (t.id === editingTplId ? buildTemplateRecord(editingTplId, name) : t));
    await saveTemplates(next);
    setOk("Vorlage aktualisiert: " + name);
  };

  const deleteTpl = async (id) => {
    const nextAssign = { ...regionTariffTemplateIds };
    for (const [rid, tid] of Object.entries(nextAssign)) {
      if (tid === id) delete nextAssign[rid];
    }
    await saveTemplates(templates.filter((t) => t.id !== id));
    await patchOperational({ regionTariffTemplateIds: nextAssign });
    setRegionTariffTemplateIds(nextAssign);
    if (editingTplId === id) setEditingTplId("");
    setOk("Vorlage gelöscht.");
  };

  const applyTemplate = (tpl) => {
    if (!tpl) return;
    loadTemplateIntoEditor(tpl, editorSetters);
    setEditingTplId(tpl.id);
    setActiveTplId(tpl.id);
    setTplName(tpl.name || "");
    setOk("Vorlage im Editor: " + tpl.name + " — zuweisen oder „Alle Preise speichern“.");
  };

  const patchOperational = async (body) => {
    const res = await fetch(URL, {
      method: "PATCH",
      headers: adminApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Speichern fehlgeschlagen");
    setConfig(data.config || null);
    if (Array.isArray(data.config?.tariffTemplates)) setTemplates(data.config.tariffTemplates);
    setRegionTariffTemplateIds(getRegionTariffTemplateIds(data.config || {}));
    return data;
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
    const tpl =
      selectedAssignmentId && selectedAssignmentId !== "__global__"
        ? templates.find((t) => t.id === selectedAssignmentId)
        : null;
    const meta = tpl
      ? { templateId: tpl.id, templateName: tpl.name }
      : editingTplId
        ? { templateId: editingTplId, templateName: tplName.trim() || templates.find((t) => t.id === editingTplId)?.name }
        : {};
    const prevTar = config.tariffs && typeof config.tariffs === "object" ? { ...config.tariffs } : {};
    const prevBsr = prevTar.byServiceRegion && typeof prevTar.byServiceRegion === "object" ? { ...prevTar.byServiceRegion } : {};
    const nextAssign = { ...regionTariffTemplateIds };
    if (tpl) nextAssign[selectedRegionId] = tpl.id;
    else if (!editingTplId) delete nextAssign[selectedRegionId];
    const newTariffs = {
      ...prevTar,
      active: tariffsActive,
      pricingMode: "taxi_tariff",
      byServiceRegion: { ...prevBsr, [selectedRegionId]: { ...buildRegionTariffPayload(meta) } },
    };
    try {
      await patchOperational({ tariffs: newTariffs, regionTariffTemplateIds: nextAssign });
      setRegionTariffTemplateIds(nextAssign);
      setOk("Regionaler Tarif gespeichert — Schätzung und Buchung nutzen diese Werte für das Gebiet.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  const assignTemplateAndSaveRegion = async () => {
    if (!selectedRegionId || !selectedAssignmentId || selectedAssignmentId === "__global__") {
      setError("Bitte Gebiet und Tarif-Vorlage wählen.");
      return;
    }
    const tpl = templates.find((t) => t.id === selectedAssignmentId);
    if (!tpl) {
      setError("Tarif-Vorlage nicht gefunden.");
      return;
    }
    loadTemplateIntoEditor(tpl, editorSetters);
    setEditingTplId(tpl.id);
    setActiveTplId(tpl.id);
    setTplName(tpl.name || "");
    const payload =
      tpl.regionPayload && typeof tpl.regionPayload === "object"
        ? {
            ...tpl.regionPayload,
            tariffTemplateId: tpl.id,
            tariffTemplateName: tpl.name,
          }
        : buildRegionTariffPayload({ templateId: tpl.id, templateName: tpl.name });
    const prevTar = config?.tariffs && typeof config.tariffs === "object" ? { ...config.tariffs } : {};
    const prevBsr = prevTar.byServiceRegion && typeof prevTar.byServiceRegion === "object" ? { ...prevTar.byServiceRegion } : {};
    const nextAssign = { ...regionTariffTemplateIds, [selectedRegionId]: tpl.id };
    try {
      await patchOperational({
        tariffs: {
          ...prevTar,
          active: tariffsActive,
          pricingMode: "taxi_tariff",
          byServiceRegion: { ...prevBsr, [selectedRegionId]: payload },
        },
        regionTariffTemplateIds: nextAssign,
      });
      setRegionTariffTemplateIds(nextAssign);
      setOk(`Vorlage „${tpl.name}“ dem Gebiet zugeordnet und gespeichert.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  const clearRegionalTariff = async () => {
    if (!selectedRegionId) return;
    if (!window.confirm("Eigenen Regional-Tarif für dieses Gebiet entfernen? Es gilt dann der Global-Tarif.")) return;
    const prevTar = config?.tariffs && typeof config.tariffs === "object" ? { ...config.tariffs } : {};
    const prevBsr = prevTar.byServiceRegion && typeof prevTar.byServiceRegion === "object" ? { ...prevTar.byServiceRegion } : {};
    const nextBsr = { ...prevBsr };
    delete nextBsr[selectedRegionId];
    const nextAssign = { ...regionTariffTemplateIds };
    delete nextAssign[selectedRegionId];
    try {
      await patchOperational({
        tariffs: { ...prevTar, byServiceRegion: nextBsr },
        regionTariffTemplateIds: nextAssign,
      });
      setRegionTariffTemplateIds(nextAssign);
      setSelectedAssignmentId("");
      setActiveTplId("");
      setOk("Regional-Tarif entfernt — Gebiet nutzt den Global-Tarif.");
      await load();
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

      <CollapsibleCard title="Betrieb &amp; Preise">
        <p className="admin-table-sub" style={{ lineHeight: 1.55, maxWidth: 720 }}>
          <strong>Gebiet</strong> = wo gefahren werden darf. <strong>Tarif-Vorlage</strong> = Preislogik (Taxameter-Schätzung).
          Die API wählt beim Abholort eine Region, dann den Regional-Tarif oder den Global-Tarif.
        </p>
      </CollapsibleCard>

      {hasRegions ? (
        <CollapsibleCard title="Übersicht: Gebiete &amp; Tarife" defaultOpen>
          <p className="admin-table-sub" style={{ marginTop: 4 }}>
            Auf einen Blick: aktiv, Preisquelle, zugeordnete Vorlage. Klick auf eine Zeile wählt das Gebiet unten.
          </p>
          <div className="admin-table-card" style={{ marginTop: 12 }}>
            <div className="admin-table-scroll">
              <div className="admin-table-row admin-table-row--head" style={{ gridTemplateColumns: "1.4fr 0.5fr 1.6fr 0.5fr" }}>
                <span>Gebiet</span>
                <span>Aktiv</span>
                <span>Preisquelle</span>
                <span />
              </div>
              {regionOverview.map((row) => (
                <div
                  key={row.id}
                  className="admin-table-row"
                  style={{
                    gridTemplateColumns: "1.4fr 0.5fr 1.6fr 0.5fr",
                    cursor: "pointer",
                    background: row.id === selectedRegionId ? "rgba(239,29,38,0.06)" : undefined,
                  }}
                  onClick={() => setSelectedRegionId(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelectedRegionId(row.id);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span style={{ fontWeight: 500 }}>{row.label}</span>
                  <span>{row.isActive ? "ja" : "nein"}</span>
                  <span>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background:
                          row.status.mode === "global"
                            ? "rgba(100,116,139,0.15)"
                            : row.status.mode === "template"
                              ? "rgba(22,163,74,0.12)"
                              : "rgba(37,99,235,0.12)",
                        color:
                          row.status.mode === "global" ? "#475569" : row.status.mode === "template" ? "#15803d" : "#1d4ed8",
                      }}
                    >
                      {row.status.mode === "global" ? "Global" : row.status.mode === "template" ? "Vorlage" : "Regional"}
                    </span>{" "}
                    <span style={{ fontSize: 12 }}>{row.status.label}</span>
                  </span>
                  <span style={{ fontSize: 12, color: "#b45309" }}>{row.status.warning ? "!" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleCard>
      ) : null}

      <CollapsibleCard title="Wo darf gefahren werden?">
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
      </CollapsibleCard>

      {hasRegions && selectedRegionId ? (
        <>
          <CollapsibleCard title="Allgemein">
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input type="checkbox" checked={!!tariffsActive} onChange={(e) => setTariffsActive(e.target.checked)} />
              <span>Preise sind buchbar (wenn aus: keine neuen Fahrten über die App)</span>
            </label>
          </CollapsibleCard>

          <CollapsibleCard title="Tarif-Vorlagen" defaultOpen>
            <p className="admin-table-sub" style={{ marginTop: 2 }}>
              Vorlagen zentral pflegen (Stuttgart, Landkreis Esslingen, …) und Gebieten zuordnen. Gespeichert in der Plattform-Konfiguration.
            </p>
            {templates.length > 0 ? (
              <div className="admin-table-card" style={{ marginTop: 12 }}>
                <div className="admin-table-scroll">
                  <div className="admin-table-row admin-table-row--head" style={{ gridTemplateColumns: "1.2fr 0.8fr 0.6fr 1fr" }}>
                    <span>Name</span>
                    <span>gültig ab</span>
                    <span>XL +</span>
                    <span />
                  </div>
                  {templates.map((tpl) => (
                    <div key={tpl.id} className="admin-table-row" style={{ gridTemplateColumns: "1.2fr 0.8fr 0.6fr 1fr" }}>
                      <span style={{ fontWeight: activeTplId === tpl.id ? 600 : 400 }}>{tpl.name}</span>
                      <span style={{ fontSize: 12 }}>{tpl.validFrom || tpl.regionPayload?.validFrom || "—"}</span>
                      <span style={{ fontSize: 12 }}>
                        {tpl.regionPayload?.xlFixedSurchargeEur ?? tpl.xlSurchargeEur ?? "—"} €
                      </span>
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="button" className="admin-c-btn-sec" style={{ fontSize: 12 }} onClick={() => applyTemplate(tpl)}>
                          Bearbeiten
                        </button>
                        <button type="button" className="admin-c-btn-sec" style={{ fontSize: 12 }} onClick={() => { setSelectedAssignmentId(tpl.id); setOk(`Vorlage „${tpl.name}“ für Zuordnung gewählt.`); }}>
                          Zuordnen
                        </button>
                        <button type="button" style={{ border: "none", background: "none", cursor: "pointer", color: "rgba(0,0,0,0.35)" }} onClick={() => void deleteTpl(tpl.id)}>
                          Löschen
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="admin-table-sub" style={{ marginTop: 8, fontStyle: "italic" }}>
                Noch keine Vorlagen — Tarif-Felder unten ausfüllen und als Vorlage speichern.
              </p>
            )}
            <div style={{ display: "grid", gap: 10, marginTop: 16, maxWidth: 560 }}>
              <label className="admin-form-label">
                Vorlagenname
                <input className="admin-input" style={{ display: "block", marginTop: 4 }} placeholder="z. B. Landkreis Esslingen Tarif" value={tplName} onChange={(e) => setTplName(e.target.value)} />
              </label>
              <label className="admin-form-label">
                Interne Notiz
                <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={tplNote} onChange={(e) => setTplNote(e.target.value)} placeholder="z. B. TTO 2022, Stand Verwaltung" />
              </label>
              <label className="admin-form-label">
                Gültig ab (optional)
                <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={tplValidFrom} onChange={(e) => setTplValidFrom(e.target.value)} placeholder="YYYY-MM-DD" />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="admin-m-btn-pri" onClick={() => void saveCurrentAsTemplate()} disabled={tplBusy}>
                {tplBusy ? "…" : "Neue Vorlage aus Editor"}
              </button>
              <button type="button" className="admin-c-btn-sec" onClick={() => void updateEditingTemplate()} disabled={tplBusy || !editingTplId}>
                Vorlage aktualisieren
              </button>
            </div>
            <div style={{ marginTop: 16, padding: 12, background: "rgba(0,0,0,0.03)", borderRadius: 8, maxWidth: 640 }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.4)", marginBottom: 8 }}>
                Zuschläge in der Vorlage
              </p>
              {(["night", "weekend", "holiday"]).map((key) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={surchargeForms[key].enabled}
                    onChange={(e) => setSurchargeForms((s) => ({ ...s, [key]: { ...s[key], enabled: e.target.checked } }))}
                  />
                  <span style={{ minWidth: 88, fontSize: 13 }}>{key === "night" ? "Nacht" : key === "weekend" ? "Wochenende" : "Feiertag"}</span>
                  <input
                    className="admin-input"
                    style={{ width: 72 }}
                    value={surchargeForms[key].percent}
                    onChange={(e) => setSurchargeForms((s) => ({ ...s, [key]: { ...s[key], percent: e.target.value } }))}
                  />
                  <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>%</span>
                </label>
              ))}
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="Tarif für ausgewähltes Gebiet" defaultOpen>
            {selectedRegion ? (
              <div style={{ marginTop: 8, maxWidth: 720 }}>
                <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>{selectedRegion.label}</p>
                <p className="admin-table-sub" style={{ marginBottom: 8 }}>
                  Gebiet {selectedRegion.isActive ? "aktiv" : "inaktiv"} · ID: <code>{selectedRegion.id}</code>
                </p>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    marginBottom: 12,
                    background: regionPricingStatus.warning ? "rgba(245,158,11,0.12)" : "rgba(22,163,74,0.08)",
                    border: `1px solid ${regionPricingStatus.warning ? "rgba(245,158,11,0.35)" : "rgba(22,163,74,0.25)"}`,
                  }}
                >
                  <p style={{ fontWeight: 600, margin: 0 }}>Preisquelle: {regionPricingStatus.label}</p>
                  {regionPricingStatus.warning ? (
                    <p className="admin-table-sub" style={{ margin: "6px 0 0", color: "#b45309" }}>
                      {regionPricingStatus.warning}
                    </p>
                  ) : (
                    <p className="admin-table-sub" style={{ margin: "6px 0 0" }}>
                      Schätzpreise für Abholungen in dieser Region kommen aus diesem Tarif (sonst Global).
                    </p>
                  )}
                </div>
                <label className="admin-form-label">
                  Welcher Tarif gilt hier?
                  <select
                    className="admin-input"
                    style={{ display: "block", marginTop: 4, maxWidth: 440 }}
                    value={selectedAssignmentId || "__none__"}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedAssignmentId(v === "__none__" ? "" : v);
                      if (v && v !== "__none__" && v !== "__global__") {
                        const t = templates.find((x) => x.id === v);
                        if (t) applyTemplate(t);
                      }
                    }}
                  >
                    <option value="__none__">— Vorlage wählen —</option>
                    <option value="__global__">Nur Global-Tarif (kein Regional-Tarif)</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  <button type="button" className="admin-m-btn-pri" onClick={() => void assignTemplateAndSaveRegion()}>
                    Vorlage zuweisen &amp; speichern
                  </button>
                  <button type="button" className="admin-c-btn-sec" onClick={() => void clearRegionalTariff()}>
                    Regional-Tarif entfernen (Global)
                  </button>
                </div>
              </div>
            ) : null}
          </CollapsibleCard>
          <TarifBlock title="STANDARD" hint="Normales Taxi — gilt für die Standard-Fahrzeugklasse." value={stdForm} onChange={setStdForm} />
          <TarifBlock
            title="XL"
            hint="Schätzpreis = Standard-Tarif + XL-Aufschlag (Fahrzeugklasse). Optional eigene km/Minuten in den Feldern oben."
            value={xlForm}
            onChange={setXlForm}
            surchargeEur={xlSurchargeEur}
            onSurchargeChange={setXlSurchargeEur}
            surchargeLabel="XL-Fahrzeugaufschlag"
            surchargeHint="z. B. 7,00 € — wird zum Standard-Schätzpreis addiert (nicht mit 5-Personen-Regel vermischt)."
          />
          <TarifBlock title="ROLLSTUHL" hint="Rollstuhlfahrten — eigene Preise." value={wcForm} onChange={setWcForm} surchargeEur={wcSurchargeEur} onSurchargeChange={setWcSurchargeEur} />

          <div style={{ marginBottom: 20 }}>
            <button type="button" className="admin-m-btn-pri" onClick={saveTariffs}>
              Alle Preise speichern
            </button>
          </div>

          <CollapsibleCard title="Kurz rechnen (Beispiel)">
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
          </CollapsibleCard>

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
