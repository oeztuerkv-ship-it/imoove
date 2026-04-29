import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";

function defaultDateTo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultDateFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 89);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function payerKindLabel(k) {
  const m = {
    passenger: "Fahrgast",
    company: "Firma",
    insurance: "Kostenträger",
    voucher: "Gutschein",
    third_party: "Dritter",
  };
  return m[k] ?? k ?? "—";
}

function statusLabel(st) {
  const m = {
    pending: "Offen",
    accepted: "Angenommen",
    arrived: "Vor Ort",
    in_progress: "Unterwegs",
    rejected: "Abgelehnt",
    cancelled: "Storniert",
    completed: "Abgeschlossen",
  };
  return m[st] ?? st ?? "—";
}

function rideDateDisplay(ride) {
  if (ride.scheduledAt) {
    try {
      return new Date(ride.scheduledAt).toLocaleString("de-DE");
    } catch {
      return ride.scheduledAt;
    }
  }
  try {
    return new Date(ride.createdAt).toLocaleString("de-DE");
  } catch {
    return ride.createdAt ?? "—";
  }
}

function payerDisplay(ride) {
  const base = payerKindLabel(ride.payerKind);
  const flow = ride.partnerBookingMeta?.flow;
  const billedTo = ride.partnerBookingMeta?.hotel?.billedTo;
  if (flow === "hotel_guest" && billedTo === "company") {
    return `${base} · Hotel auf Firma`;
  }
  if (flow === "hotel_guest" && billedTo === "room_ledger") {
    return `${base} · Hotel Zimmer`;
  }
  if (flow === "hotel_guest" && billedTo === "guest") {
    return `${base} · Hotel Gast`;
  }
  return base;
}

function seriesHint(ride) {
  const m = ride.partnerBookingMeta?.medical;
  if (!m?.seriesId) return "—";
  const seq = m.seriesSequence != null ? m.seriesSequence : "?";
  const tot = m.seriesTotal != null ? m.seriesTotal : "?";
  return `Serie ${String(m.seriesId).slice(0, 12)}… (${seq}/${tot})`;
}

function signaturePartnerStatus(ride) {
  const meta = ride?.partnerBookingMeta;
  if (!meta || typeof meta !== "object") return "—";
  if (meta.medical_ride !== true) return "—";
  return meta.signature_done === true ? "Unterschrift vorhanden" : "Unterschrift offen";
}

function formatMoney(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)} €`;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function CompanyRidesPage() {
  const { token, user } = usePanelAuth();
  const showSeries = hasPanelModule(user?.panelModules, "recurring_rides");

  const [rides, setRides] = useState([]);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [createdFrom, setCreatedFrom] = useState(defaultDateFrom);
  const [createdTo, setCreatedTo] = useState(defaultDateTo);
  const [status, setStatus] = useState("");
  const [payerKind, setPayerKind] = useState("company");
  const [q, setQ] = useState("");
  const [billingReference, setBillingReference] = useState("");

  const filtersRef = useRef({
    createdFrom,
    createdTo,
    status,
    payerKind,
    q,
    billingReference,
  });
  filtersRef.current = { createdFrom, createdTo, status, payerKind, q, billingReference };

  const buildQueryString = useCallback((f) => {
    const p = new URLSearchParams();
    p.set("createdFrom", f.createdFrom);
    p.set("createdTo", f.createdTo);
    if (f.status) p.set("status", f.status);
    if (f.payerKind && f.payerKind !== "all") p.set("payerKind", f.payerKind);
    if (f.q.trim()) p.set("q", f.q.trim());
    if (f.billingReference.trim()) p.set("billingReference", f.billingReference.trim());
    return p.toString();
  }, []);

  const loadSeries = useCallback(async () => {
    if (!token || !showSeries) {
      setSeries([]);
      return;
    }
    setSeriesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/partner-ride-series`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setSeries([]);
        return;
      }
      setSeries(Array.isArray(data.items) ? data.items : []);
    } catch {
      setSeries([]);
    } finally {
      setSeriesLoading(false);
    }
  }, [token, showSeries]);

  const loadRides = useCallback(async () => {
    if (!token) return;
    setErr("");
    setInfo("");
    setLoading(true);
    try {
      const qs = buildQueryString(filtersRef.current);
      const res = await fetch(`${API_BASE}/panel/v1/company-rides?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = typeof data?.error === "string" ? data.error : "";
        if (res.status === 403) {
          setErr("Keine Berechtigung für Firmenfahrten.");
        } else if (res.status === 400 && code) {
          setErr(`Ungültige Filter: ${code}`);
        } else {
          setErr(`Fahrten konnten nicht geladen werden (HTTP ${res.status}).`);
        }
        setRides([]);
        return;
      }
      const list = Array.isArray(data.rides) ? data.rides : [];
      setRides(list);
      setInfo(`${list.length} Fahrten im gewählten Zeitraum.`);
    } catch {
      setErr("Netzwerkfehler beim Laden.");
      setRides([]);
    } finally {
      setLoading(false);
    }
  }, [token, buildQueryString]);

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

  useEffect(() => {
    void loadSeries();
  }, [loadSeries]);

  const onExportCsv = useCallback(() => {
    const header = [
      "fahrtdatum",
      "status",
      "zahler",
      "serie",
      "kunde",
      "von",
      "nach",
      "preisSchaetz",
      "preisFinal",
      "referenz",
    ];
    const lines = [
      header.join(","),
      ...rides.map((r) =>
        [
          csvEscape(rideDateDisplay(r)),
          csvEscape(r.status),
          csvEscape(payerDisplay(r)),
          csvEscape(seriesHint(r)),
          csvEscape(r.customerName),
          csvEscape(r.from),
          csvEscape(r.to),
          csvEscape(r.estimatedFare),
          csvEscape(r.finalFare ?? ""),
          csvEscape(r.billingReference ?? ""),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `onroda-firmenfahrten-${createdFrom}_${createdTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rides, createdFrom, createdTo]);

  const empty = !loading && rides.length === 0 && !err;

  const companyLine = useMemo(() => user?.companyName || "Ihr Unternehmen", [user?.companyName]);

  return (
    <div className="panel-page panel-page--rides">
      <h2 className="panel-page__title">Firmenfahrten</h2>
      <p className="panel-page__lead">
        Alle Fahrten von <strong>{companyLine}</strong> mit Filter nach Zeitraum, Status und Zahler. Standardmäßig sind
        Fahrten mit Zahler „Firma“ ausgewählt — Sie können auf alle Zahler wechseln.
      </p>

      {err ? <p className="panel-page__warn">{err}</p> : null}
      {info && !err ? <p className="panel-page__ok">{info}</p> : null}

      <form
        className="panel-rides-form"
        onSubmit={(e) => {
          e.preventDefault();
          void loadRides();
        }}
      >
        <div className="panel-rides-form__grid">
          <label className="panel-rides-form__field">
            <span>Von (Datum)</span>
            <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} required />
          </label>
          <label className="panel-rides-form__field">
            <span>Bis (Datum)</span>
            <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} required />
          </label>
          <label className="panel-rides-form__field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Alle</option>
              <option value="pending">Offen</option>
              <option value="accepted">Angenommen</option>
              <option value="arrived">Vor Ort</option>
              <option value="in_progress">Unterwegs</option>
              <option value="completed">Abgeschlossen</option>
              <option value="cancelled">Storniert</option>
              <option value="rejected">Abgelehnt</option>
            </select>
          </label>
          <label className="panel-rides-form__field">
            <span>Zahler</span>
            <select value={payerKind} onChange={(e) => setPayerKind(e.target.value)}>
              <option value="company">Firma</option>
              <option value="all">Alle Zahler</option>
              <option value="passenger">Fahrgast</option>
              <option value="insurance">Kostenträger</option>
              <option value="voucher">Gutschein</option>
              <option value="third_party">Dritter</option>
            </select>
          </label>
          <label className="panel-rides-form__field panel-rides-form__field--2">
            <span>Suche (Kunde, Auftrag, Route)</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="z. B. Name, REQ-…, Stadtteil"
              autoComplete="off"
            />
          </label>
          <label className="panel-rides-form__field">
            <span>Referenz / Kostenstelle</span>
            <input
              type="text"
              value={billingReference}
              onChange={(e) => setBillingReference(e.target.value)}
              placeholder="enthält …"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="panel-rides-toolbar" style={{ marginTop: 12 }}>
          <button type="submit" className="panel-btn-primary" disabled={loading}>
            {loading ? "Lade …" : "Filter anwenden"}
          </button>
          <button type="button" className="panel-btn-secondary" disabled={loading} onClick={() => void loadRides()}>
            Aktualisieren
          </button>
          <button type="button" className="panel-btn-secondary" disabled={rides.length === 0} onClick={onExportCsv}>
            CSV exportieren
          </button>
        </div>
      </form>

      <div className="panel-card panel-card--wide panel-card--table" style={{ marginTop: 20 }}>
        <h3 className="panel-card__title">Fahrten</h3>
        {loading ? <p className="panel-page__lead">Lade …</p> : null}
        {empty ? (
          <p className="panel-page__lead">Keine Fahrten für die gewählten Filter.</p>
        ) : null}
        {!loading && rides.length > 0 ? (
          <div className="panel-table-wrap">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Fahrtdatum</th>
                  <th>Status</th>
                  <th>Zahler</th>
                  <th>Serie</th>
                  <th>Kunde</th>
                  <th>Strecke</th>
                  <th>Preis</th>
                  <th>Final</th>
                  <th>Referenz</th>
                  <th>Nachweis</th>
                </tr>
              </thead>
              <tbody>
                {rides.map((r) => (
                  <tr key={r.id}>
                    <td className="panel-table__muted">{rideDateDisplay(r)}</td>
                    <td>{statusLabel(r.status)}</td>
                    <td className="panel-table__muted">{payerDisplay(r)}</td>
                    <td className="panel-table__muted">{seriesHint(r)}</td>
                    <td>{r.customerName}</td>
                    <td className="panel-table__route">
                      {r.from} → {r.to}
                    </td>
                    <td>{formatMoney(r.estimatedFare)}</td>
                    <td className="panel-table__muted">{formatMoney(r.finalFare)}</td>
                    <td className="panel-table__muted">{r.billingReference || "—"}</td>
                    <td className="panel-table__muted">{signaturePartnerStatus(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {showSeries ? (
        <div className="panel-card panel-card--wide panel-card--table" style={{ marginTop: 20 }}>
          <h3 className="panel-card__title">Serienfahrten (KV / Praxis)</h3>
          <p className="panel-page__lead panel-page__lead--footnote">
            Übersicht angelegter Serien — die zugehörigen Einzelfahrten erscheinen in der Tabelle oben (Spalte „Serie“).
          </p>
          {seriesLoading ? <p className="panel-page__lead">Lade Serien …</p> : null}
          {!seriesLoading && series.length === 0 ? (
            <p className="panel-page__lead">Keine Serienfahrten erfasst.</p>
          ) : null}
          {!seriesLoading && series.length > 0 ? (
            <div className="panel-table-wrap">
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>Serie</th>
                    <th>Patienten-Ref.</th>
                    <th>Fahrten</th>
                    <th>Gültig von</th>
                    <th>Gültig bis</th>
                    <th>Status</th>
                    <th>Referenz</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => (
                    <tr key={s.id}>
                      <td className="panel-table__muted">{s.id}</td>
                      <td>{s.patientReference || "—"}</td>
                      <td>{s.totalRides}</td>
                      <td className="panel-table__muted">
                        {s.validFrom ? new Date(s.validFrom).toLocaleDateString("de-DE") : "—"}
                      </td>
                      <td className="panel-table__muted">
                        {s.validUntil ? new Date(s.validUntil).toLocaleDateString("de-DE") : "—"}
                      </td>
                      <td>{s.status}</td>
                      <td className="panel-table__muted">{s.billingReference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
