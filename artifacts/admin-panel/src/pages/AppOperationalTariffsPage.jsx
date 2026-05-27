import TarifBlock from "../components/TarifBlock.jsx";
import CollapsibleCard from "../components/CollapsibleCard.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import {
  buildRegionPayloadFromEditor,
  buildTariffTemplateRecord,
  emptySurcharge,
  getTariffCatalog,
  loadEditorFromTariff,
  n,
  tierDefaults,
} from "../lib/appOperationalTariffUtils.js";

const URL = `${API_BASE}/admin/app-operational`;
const PREVIEW = `${URL}/preview-tariff-estimate`;

/**
 * Tarife — nur Preislogik (Katalog). Gebiete und Zuordnung: Seite „Gebiete“.
 */
export default function AppOperationalTariffsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [config, setConfig] = useState(null);
  const [tariffs, setTariffs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [tariffsActive, setTariffsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [stdForm, setStdForm] = useState(() => tierDefaults());
  const [xlSurchargeEur, setXlSurchargeEur] = useState("7");
  const [wcSurchargeEur, setWcSurchargeEur] = useState("0");
  const [surchargeForms, setSurchargeForms] = useState({
    night: { ...emptySurcharge },
    weekend: { ...emptySurcharge },
    holiday: { ...emptySurcharge },
  });

  const [preview, setPreview] = useState(null);
  const [prevBusy, setPrevBusy] = useState(false);
  const [pvVehicle, setPvVehicle] = useState("standard");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      setConfig(data.config);
      const catalog = getTariffCatalog(data.config);
      setTariffs(catalog);
      if (data.config?.tariffs?.active !== undefined) {
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
    if (!tariffs.length) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!selectedId || !tariffs.some((t) => t.id === selectedId)) {
      setSelectedId(tariffs[0].id);
    }
  }, [tariffs, selectedId]);

  const selectedTariff = useMemo(() => tariffs.find((t) => t.id === selectedId) ?? null, [tariffs, selectedId]);

  useEffect(() => {
    if (!selectedTariff) {
      setName("");
      setDescription("");
      setValidFrom("");
      setStdForm(tierDefaults());
      setXlSurchargeEur("7");
      setWcSurchargeEur("0");
      setSurchargeForms({
        night: { ...emptySurcharge },
        weekend: { ...emptySurcharge },
        holiday: { ...emptySurcharge },
      });
      return;
    }
    const ed = loadEditorFromTariff(selectedTariff);
    setName(selectedTariff.name || "");
    setDescription(ed.description);
    setValidFrom(ed.validFrom);
    setStdForm(ed.stdForm);
    setXlSurchargeEur(ed.xlSurchargeEur);
    setWcSurchargeEur(ed.wcSurchargeEur);
    setSurchargeForms(ed.surchargeForms);
  }, [selectedTariff]);

  const editorState = useMemo(
    () => ({
      stdForm,
      xlSurchargeEur,
      wcSurchargeEur,
      surchargeForms,
      validFrom,
    }),
    [stdForm, xlSurchargeEur, wcSurchargeEur, surchargeForms, validFrom],
  );

  const patchOperational = async (body) => {
    const res = await fetch(URL, {
      method: "PATCH",
      headers: adminApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Speichern fehlgeschlagen");
    setConfig(data.config);
    setTariffs(getTariffCatalog(data.config));
    return data;
  };

  const saveTariffCatalog = async (nextCatalog) => {
    setBusy(true);
    setError("");
    try {
      await patchOperational({ tariffTemplates: nextCatalog });
      setOk("Tarif gespeichert.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  };

  const saveCurrentTariff = async () => {
    if (!name.trim()) {
      setError("Bitte einen Tarifnamen eingeben.");
      return;
    }
    const id = selectedId || Date.now().toString(36);
    const record = buildTariffTemplateRecord(
      id,
      { name, description, validFrom },
      editorState,
    );
    const exists = tariffs.some((t) => t.id === id);
    const next = exists ? tariffs.map((t) => (t.id === id ? record : t)) : [...tariffs, record];
    await saveTariffCatalog(next);
    if (!selectedId) setSelectedId(id);
  };

  const createNewTariff = () => {
    setSelectedId("");
    setName("");
    setDescription("");
    setValidFrom("");
    setStdForm(tierDefaults());
    setXlSurchargeEur("7");
    setWcSurchargeEur("0");
    setSurchargeForms({
      night: { ...emptySurcharge },
      weekend: { ...emptySurcharge },
      holiday: { ...emptySurcharge },
    });
    setOk("");
    setError("");
  };

  const deleteTariff = async (id) => {
    const t = tariffs.find((x) => x.id === id);
    if (!window.confirm(`Tarif „${t?.name || id}“ wirklich löschen? Zuordnungen in Gebieten werden entfernt.`)) return;
    setBusy(true);
    try {
      const assignments = { ...(config?.regionTariffTemplateIds || {}) };
      for (const [rid, tid] of Object.entries(assignments)) {
        if (tid === id) delete assignments[rid];
      }
      const prevTar = config?.tariffs && typeof config.tariffs === "object" ? { ...config.tariffs } : {};
      const prevBsr =
        prevTar.byServiceRegion && typeof prevTar.byServiceRegion === "object" ? { ...prevTar.byServiceRegion } : {};
      for (const [rid, row] of Object.entries(prevBsr)) {
        if (row?.tariffTemplateId === id) delete prevBsr[rid];
      }
      await patchOperational({
        tariffTemplates: tariffs.filter((x) => x.id !== id),
        regionTariffTemplateIds: assignments,
        tariffs: { ...prevTar, byServiceRegion: prevBsr },
      });
      if (selectedId === id) setSelectedId("");
      setOk("Tarif gelöscht.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  };

  const saveTariffsActive = async () => {
    setBusy(true);
    try {
      const prevTar = config?.tariffs && typeof config.tariffs === "object" ? { ...config.tariffs } : {};
      await patchOperational({ tariffs: { ...prevTar, active: tariffsActive, pricingMode: "taxi_tariff" } });
      setOk("Einstellung gespeichert.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setPreview(null);
    setPrevBusy(true);
    setError("");
    try {
      const regionTariff = buildRegionPayloadFromEditor(editorState);
      const res = await fetch(PREVIEW, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          serviceRegionId: null,
          regionTariff,
          distanceKm: 10,
          tripMinutes: 20,
          waitingMinutes: 0,
          vehicle: pvVehicle,
          at: new Date().toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Vorschau fehlgeschlagen");
      setPreview(data);
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

  const bd =
    preview?.estimate && typeof preview.estimate === "object" ? preview.estimate.breakdown : null;

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {ok ? <div className="admin-info-banner admin-info-banner--ok">{ok}</div> : null}

      <CollapsibleCard title="Tarife" defaultOpen>
        <p className="admin-table-sub" style={{ lineHeight: 1.55, maxWidth: 720 }}>
          Hier legen Sie <strong>Preislogik</strong> an (Taxameter, Zuschläge). <strong>Gebiete</strong> legen fest,{" "}
          <em>wo</em> gefahren wird — unter „Gebiete“ wählen Sie pro Region, <strong>welcher Tarif gilt</strong>.
          Ohne Zuordnung gilt der Plattform-Standard.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <input type="checkbox" checked={tariffsActive} onChange={(e) => setTariffsActive(e.target.checked)} />
          <span>Preise sind buchbar (App-Schätzung und neue Fahrten)</span>
        </label>
        <button type="button" className="admin-c-btn-sec" style={{ marginTop: 8 }} disabled={busy} onClick={() => void saveTariffsActive()}>
          Einstellung speichern
        </button>
      </CollapsibleCard>

      <div className="admin-panel-card admin-m-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div className="admin-panel-card__title" style={{ margin: 0 }}>
            Tarif-Katalog
          </div>
          <button type="button" className="admin-m-btn-pri" style={{ marginLeft: "auto" }} onClick={createNewTariff}>
            + Neuer Tarif
          </button>
        </div>

        {tariffs.length > 0 ? (
          <div className="admin-table-card" style={{ marginTop: 14 }}>
            <div className="admin-table-scroll">
              <div className="admin-table-row admin-table-row--head" style={{ gridTemplateColumns: "1.4fr 0.9fr 0.7fr 0.5fr" }}>
                <span>Name</span>
                <span>gültig ab</span>
                <span>XL +</span>
                <span />
              </div>
              {tariffs.map((t) => (
                <div
                  key={t.id}
                  className="admin-table-row"
                  style={{
                    gridTemplateColumns: "1.4fr 0.9fr 0.7fr 0.5fr",
                    cursor: "pointer",
                    background: t.id === selectedId ? "rgba(239,29,38,0.06)" : undefined,
                  }}
                  onClick={() => setSelectedId(t.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelectedId(t.id);
                  }}
                >
                  <span style={{ fontWeight: t.id === selectedId ? 600 : 400 }}>{t.name}</span>
                  <span style={{ fontSize: 12 }}>{t.validFrom || t.regionPayload?.validFrom || "—"}</span>
                  <span style={{ fontSize: 12 }}>{t.regionPayload?.xlFixedSurchargeEur ?? t.xlSurchargeEur ?? "—"} €</span>
                  <button
                    type="button"
                    style={{ border: "none", background: "none", cursor: "pointer", color: "rgba(200,0,0,0.5)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteTariff(t.id);
                    }}
                  >
                    Löschen
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="admin-table-sub" style={{ marginTop: 12 }}>
            Noch keine Tarife — „Neuer Tarif“ und Felder unten ausfüllen.
          </p>
        )}
      </div>

      <CollapsibleCard title={selectedId ? "Tarif bearbeiten" : "Neuer Tarif"} defaultOpen>
        <div style={{ display: "grid", gap: 12, marginTop: 12, maxWidth: 560 }}>
          <label className="admin-form-label">
            Name
            <input
              className="admin-input"
              style={{ display: "block", marginTop: 4 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Stuttgart Taxi 2026"
            />
          </label>
          <label className="admin-form-label">
            Beschreibung
            <input
              className="admin-input"
              style={{ display: "block", marginTop: 4 }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="z. B. TTO 2026, Landkreis"
            />
          </label>
          <label className="admin-form-label">
            Gültig ab
            <input
              className="admin-input"
              style={{ display: "block", marginTop: 4 }}
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </label>
        </div>
      </CollapsibleCard>

      <TarifBlock
        title="Taxameter"
        hint="Grundgebühr, km-Preise und Fahrtminute — gilt für Standard; XL und Rollstuhl nutzen dieselbe Basis plus Aufschlag."
        value={stdForm}
        onChange={setStdForm}
      />

      <CollapsibleCard title="Fahrzeug-Aufschläge">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12, maxWidth: 400 }}>
          <label className="admin-form-label">
            XL-Aufschlag
            <input
              className="admin-input"
              style={{ display: "block", marginTop: 4 }}
              value={xlSurchargeEur}
              onChange={(e) => setXlSurchargeEur(e.target.value)}
              inputMode="decimal"
            />
            <span className="admin-table-sub">€ zum Standard-Schätzpreis</span>
          </label>
          <label className="admin-form-label">
            Rollstuhl-Aufschlag
            <input
              className="admin-input"
              style={{ display: "block", marginTop: 4 }}
              value={wcSurchargeEur}
              onChange={(e) => setWcSurchargeEur(e.target.value)}
              inputMode="decimal"
            />
            <span className="admin-table-sub">€ zum Standard-Schätzpreis</span>
          </label>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Nacht / Wochenende / Feiertag">
        <div style={{ marginTop: 12, maxWidth: 420 }}>
          {[
            ["night", "Nacht"],
            ["weekend", "Wochenende"],
            ["holiday", "Feiertag"],
          ].map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={surchargeForms[key].enabled}
                onChange={(e) =>
                  setSurchargeForms((s) => ({ ...s, [key]: { ...s[key], enabled: e.target.checked } }))
                }
              />
              <span style={{ minWidth: 100, fontSize: 13 }}>{label}</span>
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

      <div style={{ marginBottom: 20 }}>
        <button type="button" className="admin-m-btn-pri" disabled={busy} onClick={() => void saveCurrentTariff()}>
          {busy ? "…" : selectedId ? "Tarif speichern" : "Tarif anlegen"}
        </button>
      </div>

      <CollapsibleCard title="Beispielrechnung (10 km, 20 Min)">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10, alignItems: "center" }}>
          <label className="admin-form-label">
            Fahrzeug
            <select className="admin-input" style={{ display: "block", marginTop: 4 }} value={pvVehicle} onChange={(e) => setPvVehicle(e.target.value)}>
              <option value="standard">Standard</option>
              <option value="xl">XL</option>
              <option value="wheelchair">Rollstuhl</option>
            </select>
          </label>
          <button type="button" className="admin-c-btn-sec" onClick={() => void runPreview()} disabled={prevBusy}>
            {prevBusy ? "…" : "Beispiel anzeigen"}
          </button>
        </div>
        {preview?.estimate ? (
          <div className="admin-m-sec" style={{ marginTop: 12, padding: 12, background: "rgba(0,50,60,0.08)", borderRadius: 8, maxWidth: 480 }}>
            <p style={{ fontWeight: 600 }}>
              Ungefähr: {String(preview.estimate.taxiTotal ?? preview.estimate.total)} €
            </p>
            {bd && typeof bd === "object" ? (
              <ul className="admin-table-sub" style={{ margin: "6px 0 0 18px" }}>
                <li>Grund: {String(bd.baseFare)} €</li>
                <li>Strecke: {String(bd.distanceCharge)} €</li>
                <li>Fahrtzeit: {String(bd.tripMinutesCharge)} €</li>
              </ul>
            ) : null}
          </div>
        ) : null}
      </CollapsibleCard>
    </div>
  );
}
