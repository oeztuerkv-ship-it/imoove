import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/analytics`;

function formatDeInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return new Intl.NumberFormat("de-DE").format(v);
}

function formatDeDay(iso) {
  if (!iso) return "—";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}.`;
}

function SimpleBarChart({ daily, valueKey = "visitors" }) {
  const max = useMemo(() => {
    let m = 1;
    for (const row of daily || []) {
      m = Math.max(m, Number(row[valueKey] ?? 0));
    }
    return m;
  }, [daily, valueKey]);

  if (!daily?.length) {
    return <p className="admin-m-muted">Noch keine Tageswerte im gewählten Zeitraum.</p>;
  }

  return (
    <div className="hp-analytics-chart" role="img" aria-label="Besucher pro Tag">
      <div className="hp-analytics-chart__bars">
        {daily.map((row) => {
          const val = Number(row[valueKey] ?? 0);
          const h = Math.max(4, Math.round((val / max) * 100));
          return (
            <div key={row.date} className="hp-analytics-chart__col" title={`${row.date}: ${val}`}>
              <div className="hp-analytics-chart__bar" style={{ height: `${h}%` }} />
              <span className="hp-analytics-chart__label">{formatDeDay(row.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankTable({ title, items, emptyHint }) {
  return (
    <section className="admin-m-card admin-m-card--unified">
      <h3 className="admin-m-card__title">{title}</h3>
      {!items?.length ? (
        <p className="admin-m-muted">{emptyHint}</p>
      ) : (
        <table className="admin-c-table admin-c-table--compact">
          <thead>
            <tr>
              <th>Eintrag</th>
              <th className="admin-c-table__num">Anzahl</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="admin-c-table__num">{formatDeInt(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function VisitorAnalyticsPage() {
  const [range, setRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [pages, setPages] = useState([]);
  const [sources, setSources] = useState([]);
  const [devices, setDevices] = useState([]);
  const [browsers, setBrowsers] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = `range=${encodeURIComponent(range)}`;
      const [sRes, pRes, srcRes, dRes] = await Promise.all([
        adminFetch(`${BASE}/summary?${q}`),
        adminFetch(`${BASE}/pages?${q}`),
        adminFetch(`${BASE}/sources?${q}`),
        adminFetch(`${BASE}/devices?${q}`),
      ]);
      const [sJson, pJson, srcJson, dJson] = await Promise.all([
        sRes.json().catch(() => ({})),
        pRes.json().catch(() => ({})),
        srcRes.json().catch(() => ({})),
        dRes.json().catch(() => ({})),
      ]);
      if (!sRes.ok) throw new Error(sJson.error || `HTTP ${sRes.status}`);
      setSummary(sJson.summary ?? null);
      setPages(Array.isArray(pJson.items) ? pJson.items : []);
      setSources(Array.isArray(srcJson.items) ? srcJson.items : []);
      setDevices(Array.isArray(dJson.devices) ? dJson.devices : []);
      setBrowsers(Array.isArray(dJson.browsers) ? dJson.browsers : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
      setSummary(null);
      setPages([]);
      setSources([]);
      setDevices([]);
      setBrowsers([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="admin-page-stack">
      <div className="admin-section-block">
        <div className="admin-m-page-head">
          <div>
            <p className="admin-m-kicker">Plattform · Marketing</p>
            <h2 className="admin-m-page-title">Besucherstatistik</h2>
            <p className="admin-m-page-lead">
              Anonyme Nutzung der ONRODA-Homepage (onroda.de). Keine IP-Speicherung, keine personenbezogenen
              Daten — technische Visitor-ID nur im Browser des Besuchers.
            </p>
          </div>
          <div className="admin-m-inline-actions">
            <label className="admin-m-field admin-m-field--inline">
              <span className="admin-m-field__label">Zeitraum Kurve</span>
              <select
                className="admin-m-input"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                disabled={loading}
              >
                <option value="7d">Letzte 7 Tage</option>
                <option value="30d">Letzte 30 Tage</option>
              </select>
            </label>
            <button type="button" className="admin-c-btn-sec" onClick={() => void load()} disabled={loading}>
              Aktualisieren
            </button>
          </div>
        </div>

        {error ? <div className="admin-c-alert admin-c-alert--err">{error}</div> : null}

        <div className="admin-m-kpi-grid">
          <article className="admin-m-card admin-m-card--kpi">
            <div className="admin-m-kpi__label">Besucher heute</div>
            <div className="admin-m-kpi__value">{loading ? "…" : formatDeInt(summary?.visitorsToday)}</div>
            <div className="admin-m-kpi__hint">Eindeutige anonyme IDs (Seitenaufruf)</div>
          </article>
          <article className="admin-m-card admin-m-card--kpi">
            <div className="admin-m-kpi__label">Besucher 7 Tage</div>
            <div className="admin-m-kpi__value">{loading ? "…" : formatDeInt(summary?.visitors7d)}</div>
          </article>
          <article className="admin-m-card admin-m-card--kpi">
            <div className="admin-m-kpi__label">Besucher 30 Tage</div>
            <div className="admin-m-kpi__value">{loading ? "…" : formatDeInt(summary?.visitors30d)}</div>
          </article>
          <article className="admin-m-card admin-m-card--kpi">
            <div className="admin-m-kpi__label">Seitenaufrufe heute</div>
            <div className="admin-m-kpi__value">{loading ? "…" : formatDeInt(summary?.pageViewsToday)}</div>
          </article>
        </div>
      </div>

      <div className="admin-section-block">
        <section className="admin-m-card admin-m-card--unified">
          <h3 className="admin-m-card__title">
            Besucher pro Tag ({range === "30d" ? "30 Tage" : "7 Tage"})
          </h3>
          {loading ? <p className="admin-m-muted">Lade…</p> : <SimpleBarChart daily={summary?.daily ?? []} valueKey="visitors" />}
        </section>
      </div>

      <div className="admin-m-two-col">
        <RankTable title="Top-Seiten" items={pages} emptyHint="Noch keine Seitenaufrufe erfasst." />
        <RankTable title="Quellen (Referrer)" items={sources} emptyHint="Noch keine Referrer erfasst." />
      </div>

      <div className="admin-m-two-col">
        <RankTable title="Geräte" items={devices} emptyHint="Noch keine Gerätedaten." />
        <RankTable title="Browser (grob)" items={browsers} emptyHint="Noch keine Browser-Daten." />
      </div>

      <div className="admin-section-block">
        <section className="admin-m-card admin-m-card--unified">
          <h3 className="admin-m-card__title">Datenschutz-Hinweis (Betrieb)</h3>
          <ul className="admin-m-list admin-m-list--compact">
            <li>Es werden keine vollständigen IP-Adressen gespeichert.</li>
            <li>Die Visitor-ID ist ein zufälliger technischer Wert im localStorage des Besuchers.</li>
            <li>Tracking gilt derzeit nur für die Marketing-Homepage — Partner-Portal und App separat erweiterbar.</li>
            <li>Respektiert Do-Not-Track im Browser (kein Tracking bei aktivem DNT).</li>
          </ul>
        </section>
      </div>

      <style>{`
        .hp-analytics-chart { margin-top: 12px; }
        .hp-analytics-chart__bars {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          min-height: 160px;
          padding: 8px 4px 0;
          border-bottom: 1px solid var(--onroda-border, #e2e8f0);
        }
        .hp-analytics-chart__col {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          height: 160px;
        }
        .hp-analytics-chart__bar {
          width: 100%;
          max-width: 28px;
          background: linear-gradient(180deg, #38bdf8 0%, #0ea5e9 100%);
          border-radius: 6px 6px 2px 2px;
        }
        .hp-analytics-chart__label {
          margin-top: 6px;
          font-size: var(--admin-type-caption, 13px);
          color: var(--onroda-text-muted, #64748b);
        }
      `}</style>
    </div>
  );
}
