import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

function rideKindLabel(k) {
  const m = {
    standard: "Normal",
    medical: "Krankenfahrt",
    voucher: "Gutschein",
    company: "Firma",
  };
  return m[k] ?? k ?? "—";
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

function accessCodeTypeDe(t) {
  const m = { voucher: "Gutschein", hotel: "Hotel", company: "Firma", general: "Fahrcode" };
  return m[t] ?? t ?? "—";
}

function authorizationSummary(ride) {
  if (ride.authorizationSource === "access_code" && ride.accessCodeSummary?.label) {
    return `${ride.accessCodeSummary.label} (${accessCodeTypeDe(ride.accessCodeSummary.codeType)})`;
  }
  if (ride.authorizationSource === "access_code") return "Zugangscode (gültig)";
  return "Direkt";
}

/** API: accessCodeTripOutcome */
function tripOutcomeDe(o) {
  const m = {
    no_code: "—",
    open: "Eingelöst / Fahrt offen",
    completed: "Code genutzt · Fahrt abgeschlossen",
    cancelled: "Storniert",
    rejected: "Abgelehnt",
  };
  return m[o] ?? o ?? "—";
}

/** API: accessCodeDefinitionState (Stand des Code-Datensatzes jetzt) */
function codeDefinitionDe(s) {
  if (s == null || s === "") return "—";
  const m = {
    valid: "Regel aktiv",
    inactive: "Code deaktiviert",
    not_yet_valid: "Noch nicht gültig",
    expired_window: "Zeitfenster abgelaufen",
    exhausted: "Kontingent aufgebraucht",
  };
  return m[s] ?? s;
}

function statusLabel(de) {
  const m = {
    pending: "Offen",
    accepted: "Angenommen",
    arrived: "Vor Ort",
    in_progress: "Unterwegs",
    rejected: "Abgelehnt",
    cancelled: "Storniert",
    completed: "Abgeschlossen",
  };
  return m[de] ?? de;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const HISTORY_STATUSES = new Set(["completed", "cancelled", "rejected"]);

/**
 * @param {{ variant: "all" | "history" }} props
 */
export default function PartnerRidesListPage({ variant }) {
  const { token, user } = usePanelAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const loadRides = useCallback(async () => {
    if (!token) return;
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/rides`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = typeof data?.error === "string" ? data.error : "";
        const hint = typeof data?.hint === "string" ? data.hint : "";
        const tail = [code && `Fehler: ${code}`, hint && `Hinweis: ${hint}`].filter(Boolean).join(" · ");
        if (res.status === 403) {
          setErr(tail ? `Keine Berechtigung, Fahrten zu sehen. ${tail}` : "Keine Berechtigung, Fahrten zu sehen.");
        } else if (res.status === 404) {
          setErr(
            "Die Fahrten-API wurde nicht gefunden (HTTP 404). Bitte API-Deploy prüfen (/api/panel/v1/rides).",
          );
        } else if (res.status === 503 && code === "database_not_configured") {
          setErr("API: Datenbank nicht konfiguriert (503).");
        } else {
          setErr(
            tail
              ? `Fahrten konnten nicht geladen werden (HTTP ${res.status}). ${tail}`
              : `Fahrten konnten nicht geladen werden (HTTP ${res.status}).`,
          );
        }
        setRides([]);
        return;
      }
      setRides(Array.isArray(data.rides) ? data.rides : []);
    } catch {
      setErr("Fahrten konnten nicht geladen werden.");
      setRides([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

  const displayedRides = useMemo(() => {
    if (variant === "history") {
      return rides.filter((r) => HISTORY_STATUSES.has(r.status));
    }
    return rides;
  }, [rides, variant]);

  const onExportCsv = useCallback(() => {
    const header = [
      "id",
      "status",
      "rideKind",
      "payerKind",
      "authorizationSummary",
      "accessCodeNormalizedSnapshot",
      "accessCodeTripOutcome",
      "accessCodeDefinitionState",
      "voucherCode",
      "billingReference",
      "customerName",
      "from",
      "to",
      "estimatedFare",
      "finalFare",
      "createdAt",
      "createdByPanelUserId",
      "createdByUsername",
    ];
    const lines = [
      header.join(","),
      ...displayedRides.map((r) =>
        [
          csvEscape(r.id),
          csvEscape(r.status),
          csvEscape(r.rideKind ?? "standard"),
          csvEscape(r.payerKind ?? "passenger"),
          csvEscape(authorizationSummary(r)),
          csvEscape(r.accessCodeNormalizedSnapshot ?? ""),
          csvEscape(r.accessCodeTripOutcome ?? ""),
          csvEscape(r.accessCodeDefinitionState ?? ""),
          csvEscape(r.voucherCode ?? ""),
          csvEscape(r.billingReference ?? ""),
          csvEscape(r.customerName),
          csvEscape(r.from),
          csvEscape(r.to),
          csvEscape(r.estimatedFare),
          csvEscape(r.finalFare ?? ""),
          csvEscape(r.createdAt),
          csvEscape(r.createdByPanelUserId ?? ""),
          csvEscape(r.createdByUsername ?? ""),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = variant === "history" ? "verlauf" : "alle";
    a.download = `onroda-fahrten-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayedRides, variant]);

  const empty = !loading && displayedRides.length === 0 && !err;

  const creatorHint = useMemo(
    () => (id) => {
      if (!id) return "—";
      if (user?.id && id === user.id) return "Sie";
      return id.slice(0, 8) + "…";
    },
    [user?.id],
  );

  const lead =
    variant === "history"
      ? "Abgeschlossene, stornierte und abgelehnte Fahrten."
      : "Aktuelle und geplante Fahrten Ihres Unternehmens.";

  return (
    <div className="panel-page panel-page--rides">
      <h2 className="panel-page__title">{variant === "history" ? "Verlauf" : "Meine Fahrten"}</h2>
      <p className="panel-page__lead">{lead}</p>

      {err ? <p className="panel-page__warn">{err}</p> : null}

      <div className="panel-rides-toolbar">
        <button type="button" className="panel-btn-secondary" disabled={loading} onClick={() => void loadRides()}>
          Aktualisieren
        </button>
        <button
          type="button"
          className="panel-btn-secondary"
          disabled={displayedRides.length === 0}
          onClick={onExportCsv}
        >
          CSV exportieren
        </button>
      </div>

      <div className="panel-card panel-card--wide panel-card--table">
        <h3 className="panel-card__title">{variant === "history" ? "Historie" : "Alle Fahrten"}</h3>
        {loading ? <p className="panel-page__lead">Lade …</p> : null}
        {!loading && err ? (
          <p className="panel-page__lead">Tabelle nicht geladen — siehe Hinweis oben, dann „Aktualisieren“.</p>
        ) : null}
        {empty ? (
          <p className="panel-page__lead">
            {variant === "history"
              ? "Noch keine Einträge im Verlauf (abgeschlossen / storniert / abgelehnt)."
              : "Noch keine Fahrten für Ihr Unternehmen erfasst."}
          </p>
        ) : null}
        {!loading && displayedRides.length > 0 ? (
          <div className="panel-table-wrap">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Typ</th>
                  <th>Zahler</th>
                  <th>Freigabe</th>
                  <th>Code (Buchung)</th>
                  <th>Fahrt ↔ Code</th>
                  <th>Code-Regel (aktuell)</th>
                  <th>Kunde</th>
                  <th>Route</th>
                  <th>Preis</th>
                  <th>Endpreis</th>
                  <th>Angelegt</th>
                  <th>Angelegt von</th>
                </tr>
              </thead>
              <tbody>
                {displayedRides.map((r) => (
                  <tr key={r.id}>
                    <td>{statusLabel(r.status)}</td>
                    <td className="panel-table__muted">{rideKindLabel(r.rideKind)}</td>
                    <td className="panel-table__muted">{payerKindLabel(r.payerKind)}</td>
                    <td className="panel-table__muted" title="Anzeigename / Typ (ohne Fahrer-Code)">
                      {authorizationSummary(r)}
                    </td>
                    <td className="panel-table__muted" title="Normalisierter Code zum Buchungszeitpunkt (Nachverfolgung)">
                      {r.accessCodeNormalizedSnapshot || "—"}
                    </td>
                    <td className="panel-table__muted" title="Ergebnis dieser Fahrt bei Code-Einlösung">
                      {tripOutcomeDe(r.accessCodeTripOutcome)}
                    </td>
                    <td className="panel-table__muted" title="Zustand des Code-Datensatzes in der Zentrale (jetzt)">
                      {codeDefinitionDe(r.accessCodeDefinitionState)}
                    </td>
                    <td>{r.customerName}</td>
                    <td className="panel-table__route">
                      {r.from} → {r.to}
                    </td>
                    <td>{Number(r.estimatedFare).toFixed(2)}</td>
                    <td className="panel-table__muted">
                      {r.finalFare != null && r.finalFare !== "" ? Number(r.finalFare).toFixed(2) : "—"}
                    </td>
                    <td className="panel-table__muted">{new Date(r.createdAt).toLocaleString("de-DE")}</td>
                    <td className="panel-table__muted" title={r.createdByPanelUserId ?? ""}>
                      {r.createdByUsername || creatorHint(r.createdByPanelUserId)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
