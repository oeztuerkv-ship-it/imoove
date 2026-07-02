import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { formatRideEstimatedFare, formatRideFinalFare, getPartnerMeta } from "./finance/financeHelpers.js";

const NOTE_MAX = 200;
const RETRY_SEARCH_MS = 60_000;

function rideKindLabel(k) {
  const m = { standard: "Normal", medical: "Krankenfahrt", voucher: "Gutschein", company: "Firmenfahrt" };
  return m[k] ?? k ?? "—";
}

function payerKindLabel(k) {
  const m = {
    passenger: "Fahrgast",
    company: "Firma (Rechnung)",
    insurance: "Kostenträger",
    voucher: "Gutschein",
    third_party: "Dritter",
  };
  return m[k] ?? k ?? "—";
}

function statusLabel(status) {
  const m = {
    pending: "Sucht Fahrer",
    requested: "Angefragt",
    searching_driver: "Sucht Fahrer",
    offered: "Angeboten",
    scheduled: "Reservierung",
    scheduled_assigned: "Reservierung (zugewiesen)",
    ready_for_dispatch: "Bereit",
    accepted: "Angenommen",
    driver_arriving: "Fahrer unterwegs",
    driver_waiting: "Fahrer wartet",
    passenger_onboard: "Fahrgast an Bord",
    arrived: "Vor Ort",
    in_progress: "Unterwegs",
    rejected: "Abgelehnt",
    cancelled: "Storniert",
    cancelled_by_customer: "Storniert (Kunde)",
    cancelled_by_driver: "Storniert (Fahrer)",
    cancelled_by_system: "Storniert (System)",
    completed: "Abgeschlossen",
    no_driver: "Kein Fahrer",
    expired: "Abgelaufen",
  };
  return m[status] ?? status ?? "—";
}

function statusTone(status) {
  if (status === "completed") return "ok";
  if (String(status ?? "").startsWith("cancelled") || status === "rejected" || status === "no_driver") return "err";
  if (status === "scheduled" || status === "scheduled_assigned") return "scheduled";
  if (status === "accepted" || status === "in_progress" || status === "driver_arriving") return "live";
  return "pending";
}

function getDriverNote(ride) {
  const meta = getPartnerMeta(ride);
  const raw = meta?.customer_driver_note;
  return typeof raw === "string" ? raw.trim() : "";
}

function dispatchSummary(ride) {
  if (ride.driverId) return "Fahrer zugewiesen";
  const rej = Array.isArray(ride.rejectedBy) ? ride.rejectedBy.filter(Boolean).length : 0;
  if (rej > 0) return `${rej} Fahrer-Ablehnung${rej > 1 ? "en" : ""}`;
  if (ride.status === "scheduled" || ride.status === "scheduled_assigned") return "Reservierung — noch kein Fahrer";
  return "Wartet auf Fahrer-Annahme";
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function canCancelRide(ride) {
  return !["completed", "cancelled", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system", "rejected"].includes(
    ride.status,
  );
}

function canRetrySearch(ride) {
  if (!["pending", "requested", "offered", "ready_for_dispatch", "searching_driver"].includes(ride.status)) return false;
  if (ride.driverId) return false;
  const created = Date.parse(String(ride.createdAt ?? ""));
  return Number.isFinite(created) && Date.now() - created >= RETRY_SEARCH_MS;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const HISTORY_STATUSES = new Set(["completed", "cancelled", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system", "rejected"]);

export default function PartnerRidesListPage({ variant }) {
  const { token, user } = usePanelAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteRideId, setNoteRideId] = useState(null);
  const [actionBusy, setActionBusy] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  const canCreate = Array.isArray(user?.permissions) && user.permissions.includes("rides.create");

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
        setErr("Fahrten konnten nicht geladen werden.");
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

  const replaceRide = useCallback((nextRide) => {
    if (!nextRide?.id) return;
    setRides((prev) => prev.map((r) => (r.id === nextRide.id ? { ...r, ...nextRide } : r)));
  }, []);

  const onCancel = useCallback(
    async (rideId) => {
      if (!token || !window.confirm("Fahrt wirklich stornieren?")) return;
      setActionBusy(`cancel-${rideId}`);
      setActionMsg("");
      try {
        const res = await fetch(`${API_BASE}/panel/v1/rides/${encodeURIComponent(rideId)}/cancel`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          setActionMsg(typeof data?.error === "string" ? `Storno fehlgeschlagen (${data.error}).` : "Storno fehlgeschlagen.");
          return;
        }
        if (data.ride) replaceRide(data.ride);
        setActionMsg("Fahrt storniert.");
      } catch {
        setActionMsg("Storno fehlgeschlagen.");
      } finally {
        setActionBusy("");
      }
    },
    [token, replaceRide],
  );

  const onRetrySearch = useCallback(
    async (rideId) => {
      if (!token) return;
      setActionBusy(`retry-${rideId}`);
      setActionMsg("");
      try {
        const res = await fetch(`${API_BASE}/panel/v1/rides/${encodeURIComponent(rideId)}/retry-search`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          const code = typeof data?.error === "string" ? data.error : "";
          setActionMsg(
            code === "retry_search_too_early"
              ? "Erneut suchen erst 60 Sekunden nach Anlage möglich."
              : "Erneut suchen fehlgeschlagen.",
          );
          return;
        }
        if (data.ride) replaceRide(data.ride);
        setActionMsg("Fahrersuche erneut gestartet — Fahrer-App sollte benachrichtigt werden.");
      } catch {
        setActionMsg("Erneut suchen fehlgeschlagen.");
      } finally {
        setActionBusy("");
      }
    },
    [token, replaceRide],
  );

  const openNoteEditor = useCallback((ride) => {
    setNoteRideId(ride.id);
    setNoteDraft(getDriverNote(ride));
    setActionMsg("");
  }, []);

  const saveNote = useCallback(async () => {
    if (!token || !noteRideId) return;
    setActionBusy(`note-${noteRideId}`);
    setActionMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/rides/${encodeURIComponent(noteRideId)}/driver-note`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ driverNote: noteDraft.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setActionMsg("Notiz konnte nicht gespeichert werden.");
        return;
      }
      if (data.ride) replaceRide(data.ride);
      setNoteRideId(null);
      setNoteDraft("");
      setActionMsg("Notiz gespeichert.");
    } catch {
      setActionMsg("Notiz konnte nicht gespeichert werden.");
    } finally {
      setActionBusy("");
    }
  }, [token, noteRideId, noteDraft, replaceRide]);

  const onExportCsv = useCallback(() => {
    const header = [
      "id",
      "status",
      "customerName",
      "fromFull",
      "toFull",
      "estimatedFare",
      "finalFare",
      "paymentMethod",
      "payerKind",
      "scheduledAt",
      "createdAt",
      "driverNote",
    ];
    const lines = [
      header.join(","),
      ...displayedRides.map((r) =>
        [
          csvEscape(r.id),
          csvEscape(r.status),
          csvEscape(r.customerName),
          csvEscape(r.fromFull || r.from),
          csvEscape(r.toFull || r.to),
          csvEscape(r.estimatedFare),
          csvEscape(r.finalFare ?? ""),
          csvEscape(r.paymentMethod),
          csvEscape(r.payerKind),
          csvEscape(r.scheduledAt ?? ""),
          csvEscape(r.createdAt),
          csvEscape(getDriverNote(r)),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `onroda-fahrten-${variant === "history" ? "verlauf" : "alle"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayedRides, variant]);

  const lead =
    variant === "history"
      ? "Abgeschlossene, stornierte und abgelehnte Fahrten."
      : "Alle Fahrten mit Route, Fahrgast, Disposition und Abrechnung.";

  return (
    <div className="panel-page panel-page--rides partner-rides-page">
      <p className="partner-page-eyebrow">Fahrten</p>
      <h2 className="partner-page-title">{variant === "history" ? "Verlauf" : "Meine Fahrten"}</h2>
      <p className="partner-page-lead">{lead}</p>

      {err ? <p className="panel-page__warn">{err}</p> : null}
      {actionMsg ? (
        <p className={actionMsg.includes("fehl") ? "panel-page__warn" : "panel-page__ok"}>{actionMsg}</p>
      ) : null}

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

      {loading ? <p className="panel-page__lead">Lade …</p> : null}
      {!loading && displayedRides.length === 0 && !err ? (
        <p className="panel-page__lead">Noch keine Fahrten in dieser Ansicht.</p>
      ) : null}

      <div className="partner-rides-list">
        {displayedRides.map((ride) => {
          const open = expandedId === ride.id;
          const tone = statusTone(ride.status);
          const note = getDriverNote(ride);
          return (
            <article key={ride.id} className={`partner-ride-card partner-ride-card--${tone}`}>
              <button
                type="button"
                className="partner-ride-card__head"
                onClick={() => setExpandedId(open ? null : ride.id)}
                aria-expanded={open}
              >
                <div className="partner-ride-card__head-main">
                  <span className={`partner-ride-card__status partner-ride-card__status--${tone}`}>
                    {statusLabel(ride.status)}
                  </span>
                  <strong className="partner-ride-card__route">
                    {ride.fromFull || ride.from || "—"} → {ride.toFull || ride.to || "—"}
                  </strong>
                  <span className="partner-ride-card__meta">
                    {ride.customerName || "—"}
                    {ride.scheduledAt ? ` · ${fmtDateTime(ride.scheduledAt)}` : ` · ${fmtDateTime(ride.createdAt)}`}
                  </span>
                </div>
                <div className="partner-ride-card__head-side">
                  <span className="partner-ride-card__fare">{formatRideEstimatedFare(ride)}</span>
                  <span className="partner-ride-card__chevron">{open ? "▲" : "▼"}</span>
                </div>
              </button>

              {open ? (
                <div className="partner-ride-card__body">
                  <dl className="partner-ride-detail-grid">
                    <div>
                      <dt>Abholung</dt>
                      <dd>{ride.fromFull || ride.from || "—"}</dd>
                    </div>
                    <div>
                      <dt>Ziel</dt>
                      <dd>{ride.toFull || ride.to || "—"}</dd>
                    </div>
                    <div>
                      <dt>Fahrgast</dt>
                      <dd>
                        {ride.customerName || "—"}
                        {ride.customerPhone ? ` · ${ride.customerPhone}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Disposition</dt>
                      <dd>{dispatchSummary(ride)}</dd>
                    </div>
                    <div>
                      <dt>Fahrttyp / Zahler</dt>
                      <dd>
                        {rideKindLabel(ride.rideKind)} · {payerKindLabel(ride.payerKind)}
                      </dd>
                    </div>
                    <div>
                      <dt>Abrechnung</dt>
                      <dd>
                        {ride.paymentMethod || "—"}
                        {ride.billingReference ? ` · Ref. ${ride.billingReference}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Geschätzt / Endpreis</dt>
                      <dd>
                        {formatRideEstimatedFare(ride)} / {formatRideFinalFare(ride)}
                      </dd>
                    </div>
                    <div>
                      <dt>Entfernung / Dauer</dt>
                      <dd>
                        {ride.distanceKm != null ? `${Number(ride.distanceKm).toFixed(1)} km` : "—"}
                        {ride.durationMinutes != null ? ` · ${ride.durationMinutes} Min.` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Termin</dt>
                      <dd>{ride.scheduledAt ? fmtDateTime(ride.scheduledAt) : "Sofortfahrt"}</dd>
                    </div>
                    <div>
                      <dt>Angelegt</dt>
                      <dd>{fmtDateTime(ride.createdAt)}</dd>
                    </div>
                    <div className="partner-ride-detail-grid__full">
                      <dt>Notiz für Fahrer</dt>
                      <dd>{note || "—"}</dd>
                    </div>
                  </dl>

                  <div className="partner-ride-card__actions">
                    {canCreate ? (
                      <button
                        type="button"
                        className="panel-btn-secondary"
                        disabled={Boolean(actionBusy)}
                        onClick={() => openNoteEditor(ride)}
                      >
                        {note ? "Notiz bearbeiten" : "Notiz hinzufügen"}
                      </button>
                    ) : null}
                    {canCreate && canRetrySearch(ride) ? (
                      <button
                        type="button"
                        className="panel-btn-secondary"
                        disabled={actionBusy === `retry-${ride.id}`}
                        onClick={() => void onRetrySearch(ride.id)}
                      >
                        Erneut an Fahrer senden
                      </button>
                    ) : null}
                    {canCreate && canCancelRide(ride) ? (
                      <button
                        type="button"
                        className="panel-btn-secondary"
                        disabled={actionBusy === `cancel-${ride.id}`}
                        onClick={() => void onCancel(ride.id)}
                      >
                        Stornieren
                      </button>
                    ) : null}
                    <a
                      className="panel-btn-secondary partner-ride-card__link-btn"
                      href={`${API_BASE}/panel/v1/rides/${encodeURIComponent(ride.id)}/tracking`}
                      onClick={(e) => {
                        e.preventDefault();
                        void fetch(`${API_BASE}/panel/v1/rides/${encodeURIComponent(ride.id)}/tracking`, {
                          headers: { Authorization: `Bearer ${token}` },
                        })
                          .then((r) => r.json())
                          .then((j) => {
                            if (j?.driver?.name) {
                              setActionMsg(`Live: ${j.driver.name}${j.driver.plate ? ` · ${j.driver.plate}` : ""}`);
                            } else {
                              setActionMsg("Noch kein Fahrer zugewiesen.");
                            }
                          })
                          .catch(() => setActionMsg("Tracking nicht verfügbar."));
                      }}
                    >
                      Fahrer-Status
                    </a>
                  </div>
                  <p className="partner-ride-card__id">ID: {ride.id}</p>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {noteRideId ? (
        <div className="partner-ride-note-modal" role="dialog" aria-modal="true">
          <div className="partner-ride-note-modal__panel">
            <h3 className="partner-ride-note-modal__title">Notiz für den Fahrer</h3>
            <textarea
              className="partner-booking-note"
              value={noteDraft}
              maxLength={NOTE_MAX}
              rows={4}
              onChange={(e) => setNoteDraft(e.target.value.slice(0, NOTE_MAX))}
              placeholder="z. B. Eingang Hinterhof"
            />
            <p className="partner-booking-note-count">
              {noteDraft.length}/{NOTE_MAX}
            </p>
            <div className="partner-ride-note-modal__actions">
              <button type="button" className="panel-btn-secondary" onClick={() => setNoteRideId(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="panel-btn-primary"
                disabled={actionBusy === `note-${noteRideId}`}
                onClick={() => void saveNote()}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
