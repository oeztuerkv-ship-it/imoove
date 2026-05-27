/** Gemeinsame Tarif-Logik: Admin „Tarife“ + „Gebiete“ (Speicherung: app_operational_config). */

export const emptySurcharge = { enabled: false, percent: 0 };

export function n(v) {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

export function tierDefaults() {
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

export function buildTwoTierPayload(f) {
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

function tripEurFromMergedLike(m) {
  if (!m || typeof m !== "object") return 0;
  const a = n(m.perMin);
  const b = n(m.pricePerMinute);
  if (a > 0) return a;
  if (b > 0) return b;
  return 0;
}

export function sliceToTierForm(slice) {
  const d = tierDefaults();
  if (!slice || typeof slice !== "object") return d;
  return {
    baseFare: slice.baseFare != null ? String(slice.baseFare).replace(".", ",") : d.baseFare,
    bisKm: slice.thresholdKm != null ? String(slice.thresholdKm).replace(".", ",") : d.bisKm,
    preisBis: slice.rateFirstPerKm != null ? String(slice.rateFirstPerKm).replace(".", ",") : d.preisBis,
    danach: slice.rateAfterPerKm != null ? String(slice.rateAfterPerKm).replace(".", ",") : d.danach,
    tripMin: String(Math.round((tripEurFromMergedLike(slice) || 0.63) * 10000) / 10000).replace(".", ","),
    waitH:
      slice.waitingPerHour != null
        ? String(Math.round(Number(slice.waitingPerHour) * 100) / 100).replace(".", ",")
        : d.waitH,
    minFare:
      slice.minFare != null
        ? String(slice.minFare).replace(".", ",")
        : slice.minPrice != null
          ? String(slice.minPrice).replace(".", ",")
          : d.minFare,
  };
}

export function getTariffs(config) {
  return config?.tariffs && typeof config.tariffs === "object" ? config.tariffs : {};
}

export function getByServiceRegion(config) {
  const tr = getTariffs(config);
  const bsr = tr.byServiceRegion && typeof tr.byServiceRegion === "object" ? tr.byServiceRegion : {};
  return /** @type {Record<string, Record<string, unknown>>} */ (bsr);
}

export function getRegionTariffTemplateIds(config) {
  const raw = config?.regionTariffTemplateIds;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return /** @type {Record<string, string>} */ (raw);
}

export function getTariffCatalog(config) {
  return Array.isArray(config?.tariffTemplates) ? config.tariffTemplates : [];
}

export function hasOwnRegionalTariff(bsr, regionId) {
  return !!(regionId && bsr[regionId] && typeof bsr[regionId] === "object");
}

function preservedAdvancedTariffKeys(prev) {
  if (!prev || typeof prev !== "object") return {};
  const keys = [
    "cancellationFeeEur",
    "airportFlatEur",
    "taxiMandatoryArea",
    "forbidUnlawfulFixedPriceInMandatoryArea",
    "rounding",
    "tariffVersion",
    "largeVehicleSurcharge",
  ];
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(prev, k)) out[k] = prev[k];
  }
  return out;
}

export function surchargeBlockFromRow(row) {
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

export function applySurchargesToPayload(out, surchargeForms) {
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

/** Ein Taxameter-Set + XL/Rollstuhl-Aufschläge → regionPayload für byServiceRegion. */
export function buildRegionPayloadFromEditor(editor, prev = {}) {
  const preserved = preservedAdvancedTariffKeys(prev);
  const std = buildTwoTierPayload(editor.stdForm);
  const stdTier = buildTwoTierPayload(editor.stdForm);
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
    xlFixedSurchargeEur: n(editor.xlSurchargeEur),
    wheelchairFixedSurchargeEur: 0,
    vehicleTariffOverrides: {
      xl: stdTier,
      wheelchair: { ...stdTier, surchargeEur: n(editor.wcSurchargeEur) },
    },
  };
  if (editor.tariffTemplateId) {
    out.tariffTemplateId = editor.tariffTemplateId;
    out.tariffTemplateName = editor.tariffTemplateName ?? "";
  }
  out = applySurchargesToPayload(out, {
    ...editor.surchargeForms,
    validFrom: editor.validFrom,
  });
  return out;
}

export function buildTariffTemplateRecord(id, meta, editor) {
  const regionPayload = buildRegionPayloadFromEditor({
    ...editor,
    tariffTemplateId: id,
    tariffTemplateName: meta.name,
  });
  return {
    id,
    name: meta.name.trim(),
    note: meta.description.trim(),
    description: meta.description.trim(),
    validFrom: meta.validFrom.trim(),
    regionPayload,
    std: { ...editor.stdForm },
    xlSurchargeEur: editor.xlSurchargeEur,
    wcSurchargeEur: editor.wcSurchargeEur,
    surchargeForms: { ...editor.surchargeForms },
    updatedAt: new Date().toISOString(),
  };
}

export function loadEditorFromTariff(tpl) {
  const d = tierDefaults();
  if (!tpl) {
    return {
      stdForm: d,
      xlSurchargeEur: "7",
      wcSurchargeEur: "0",
      surchargeForms: {
        night: { ...emptySurcharge },
        weekend: { ...emptySurcharge },
        holiday: { ...emptySurcharge },
      },
      validFrom: "",
      description: "",
    };
  }
  const rp = tpl.regionPayload && typeof tpl.regionPayload === "object" ? tpl.regionPayload : null;
  if (rp) {
    const { vehicleTariffOverrides: vtoRaw, ...sans } = rp;
    const stdForm = sliceToTierForm(sans);
    const vto = vtoRaw && typeof vtoRaw === "object" ? vtoRaw : {};
    const wc = vto.wheelchair && typeof vto.wheelchair === "object" ? vto.wheelchair : {};
    return {
      stdForm,
      xlSurchargeEur:
        rp.xlFixedSurchargeEur != null ? String(rp.xlFixedSurchargeEur).replace(".", ",") : tpl.xlSurchargeEur ?? "7",
      wcSurchargeEur:
        wc.surchargeEur != null ? String(wc.surchargeEur).replace(".", ",") : tpl.wcSurchargeEur ?? "0",
      surchargeForms: surchargeBlockFromRow(rp),
      validFrom: tpl.validFrom || rp.validFrom || "",
      description: tpl.description || tpl.note || "",
    };
  }
  return {
    stdForm: tpl.std ? { ...tpl.std } : d,
    xlSurchargeEur: tpl.xlSurchargeEur ?? "7",
    wcSurchargeEur: tpl.wcSurchargeEur ?? "0",
    surchargeForms: tpl.surchargeForms || {
      night: { ...emptySurcharge },
      weekend: { ...emptySurcharge },
      holiday: { ...emptySurcharge },
    },
    validFrom: tpl.validFrom || "",
    description: tpl.description || tpl.note || "",
  };
}

/** Gespeicherte Tarif-Zuordnung für Anzeige in der Gebiete-Tabelle. */
export function resolveRegionTariffDisplay(config, region, tariffs) {
  const bsr = getByServiceRegion(config);
  const assignments = getRegionTariffTemplateIds(config);
  const regionId = region?.id ?? "";
  const tariffId = assignments[regionId] || String(bsr[regionId]?.tariffTemplateId || "");
  const tpl = tariffId ? tariffs.find((t) => t.id === tariffId) : null;
  const tariffName = tpl?.name || (tariffId ? tariffId : "Plattform-Standard");
  return { tariffId, tariffName };
}

/** Anzahl Gebiete, die diesen Tarif zugeordnet haben (Assignments + byServiceRegion). */
export function countTariffUsageInRegions(config, tariffId) {
  if (!tariffId || !config) return 0;
  const assignments = getRegionTariffTemplateIds(config);
  const bsr = getByServiceRegion(config);
  const ids = new Set();
  for (const [rid, tid] of Object.entries(assignments)) {
    if (tid === tariffId) ids.add(rid);
  }
  for (const [rid, row] of Object.entries(bsr)) {
    if (row && typeof row === "object" && String(row.tariffTemplateId || "") === tariffId) {
      ids.add(rid);
    }
  }
  return ids.size;
}
