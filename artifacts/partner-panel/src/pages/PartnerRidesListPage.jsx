import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import {
  billingSummary,
  dispatchHeadline,
  dispatchSteps,
  needsActivePoll,
  payerKindLabel,
  rejectionCount,
  rideKindLabel,
  statusLabel,
  statusTone,
  TERMINAL_STATUSES,
} from "../lib/partnerRideOps.js";
import { formatRideEstimatedFare, formatRideFinalFare, getPartnerMeta } from "./finance/financeHelpers.js";
import PartnerRideChatModal from "../components/PartnerRideChatModal.jsx";
import {
  buildPartnerChatReadCursors,
  fetchPartnerChatUnreadSummary,
  setPartnerChatReadCursor,
} from "../lib/partnerRideChat.js";

const NOTE_MAX = 200;
const RETRY_SEARCH_MS = 60_000;
const POLL_MS = 20_000;
const CHAT_UNREAD_POLL_MS = 8_000;

function getDriverNote(ride) {
  const meta = getPartnerMeta(ride);
  const raw = meta?.customer_driver_note;
  return typeof raw === "string" ? raw.trim() : "";
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
  return !TERMINAL_STATUSES.has(ride.status);
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

const HISTORY_STATUSES = TERMINAL_STATUSES;

function DispatchStepper({ ride }) {
  const steps = dispatchSteps(ride);
  return (
    <ol className="partner-dispatch-steps">
      {steps.map((step) => (
        <li key={step.key} className={`partner-dispatch-steps__item partner-dispatch-steps__item--${step.state}`}>
          <span className="partner-dispatch-steps__dot" aria-hidden />
          <div>
            <strong>{step.label}</strong>
            <span>{step.detail}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

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
  const [trackingByRide, setTrackingByRide] = useState({});
  const [chatRide, setChatRide] = useState(null);
  const [chatUnreadByRide, setChatUnreadByRide] = useState({});

  const canCreate = Array.isArray(user?.permissions) && user.permissions.includes("rides.create");

  const loadRides = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setErr("");
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/rides`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (!silent) {
          setErr("Fahrten konnten nicht geladen werden.");
          setRides([]);
        }
        return;
      }
      setRides(Array.isArray(data.rides) ? data.rides : []);
    } catch {
      if (!silent) {
        setErr("Fahrten konnten nicht geladen werden.");
        setRides([]);
      }
    } finally {
      if (!silent) setLoading(false);
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

  const chatEnabledRideIds = useMemo(
    () => rides.filter((r) => r.chatEnabled && !TERMINAL_STATUSES.has(r.status)).map((r) => r.id),
    [rides],
  );

  const refreshChatUnread = useCallback(async () => {
    if (!token || !user?.id || chatEnabledRideIds.length === 0) {
      setChatUnreadByRide({});
      return;
    }
    const cursors = buildPartnerChatReadCursors(user.id, chatEnabledRideIds);
    const result = await fetchPartnerChatUnreadSummary(token, cursors);
    if (!result.ok) return;
    const next = {};
    for (const row of result.rides) {
      if (row?.rideId && row.unreadCount > 0) next[row.rideId] = row.unreadCount;
    }
    setChatUnreadByRide(next);
  }, [chatEnabledRideIds, token, user?.id]);

  useEffect(() => {
    void refreshChatUnread();
  }, [refreshChatUnread]);

  useEffect(() => {
    if (!token || chatEnabledRideIds.length === 0) return;
    const id = setInterval(() => void refreshChatUnread(), CHAT_UNREAD_POLL_MS);
    return () => clearInterval(id);
  }, [chatEnabledRideIds.length, refreshChatUnread, token]);

  const markChatRead = useCallback(
    (rideId, isoTimestamp) => {
      if (!user?.id || !rideId || !isoTimestamp) return;
      setPartnerChatReadCursor(user.id, rideId, isoTimestamp);
      setChatUnreadByRide((prev) => {
        if (!prev[rideId]) return prev;
        const next = { ...prev };
        delete next[rideId];
        return next;
      });
      void refreshChatUnread();
    },
    [refreshChatUnread, user?.id],
  );

  const openChat = useCallback(
    (ride) => {
      setChatRide(ride);
      if (user?.id && ride?.id) {
        setChatUnreadByRide((prev) => {
          if (!prev[ride.id]) return prev;
          const next = { ...prev };
          delete next[ride.id];
          return next;
        });
      }
    },
    [user?.id],
  );

  const hasActiveRides = useMemo(
    () => variant !== "history" && rides.some((r) => needsActivePoll(r)),
    [rides, variant],
  );

  const totalChatUnread = useMemo(
    () => Object.values(chatUnreadByRide).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [chatUnreadByRide],
  );

  useEffect(() => {
    if (!hasActiveRides || !token) return;
    const id = setInterval(() => void loadRides(true), POLL_MS);
    return () => clearInterval(id);
  }, [hasActiveRides, token, loadRides]);

  const fetchTracking = useCallback(
    async (rideId) => {
      if (!token || !rideId) return;
      try {
        const res = await fetch(`${API_BASE}/panel/v1/rides/${encodeURIComponent(rideId)}/tracking`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok) {
          setTrackingByRide((prev) => ({ ...prev, [rideId]: data }));
        }
      } catch {
        /* ignore */
      }
    },
    [token],
  );

  useEffect(() => {
    if (!expandedId) return;
    void fetchTracking(expandedId);
  }, [expandedId, fetchTracking]);

  const replaceRide = useCallback((nextRide) => {
    if (!nextRide?.id) return;
    setRides((prev) => prev.map((r) => (r.id === nextRide.id ? { ...r, ...nextRide } : r)));
  }, []);

  const patchRideCompanyInvoice = useCallback((rideId, companyInvoice) => {
    setRides((prev) =>
      prev.map((r) => (r.id === rideId ? { ...r, companyInvoice: { ...companyInvoice } } : r)),
    );
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
        setActionMsg("Fahrersuche erneut gestartet.");
        void fetchTracking(rideId);
      } catch {
        setActionMsg("Erneut suchen fehlgeschlagen.");
      } finally {
        setActionBusy("");
      }
    },
    [token, replaceRide, fetchTracking],
  );

  const onCreateInvoice = useCallback(
    async (rideId) => {
      if (!token) return;
      setActionBusy(`invoice-${rideId}`);
      setActionMsg("");
      try {
        const res = await fetch(`${API_BASE}/panel/v1/rides/${encodeURIComponent(rideId)}/create-invoice`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          const msg =
            typeof data?.message === "string" && data.message.trim()
              ? data.message.trim()
              : typeof data?.error === "string"
                ? `Rechnung fehlgeschlagen (${data.error}).`
                : "Rechnung konnte nicht erstellt werden.";
          setActionMsg(msg);
          return;
        }
        const inv = data.invoice ?? {};
        if (data.flow === "company" && inv.id) {
          patchRideCompanyInvoice(rideId, {
            eligible: false,
            blockers: ["invoice_already_created"],
            invoiceId: inv.id,
            invoiceNumber: inv.number ?? null,
            billingStatus: "invoiced",
          });
          setActionMsg(`Rechnung ${inv.number ?? ""} erstellt.`);
        } else if (inv.number) {
          setActionMsg(`Rechnung ${inv.number} erstellt.`);
          void loadRides(true);
        } else {
          setActionMsg("Rechnung erstellt.");
          void loadRides(true);
        }
      } catch {
        setActionMsg("Rechnung konnte nicht erstellt werden.");
      } finally {
        setActionBusy("");
      }
    },
    [token, patchRideCompanyInvoice, loadRides],
  );

  const downloadInvoicePdf = useCallback(
    async (invoiceId, invoiceNumber) => {
      if (!token || !invoiceId) return;
      setActionBusy(`pdf-${invoiceId}`);
      try {
        const res = await fetch(`${API_BASE}/panel/v1/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setActionMsg("PDF konnte nicht geladen werden.");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ONRODA-Rechnung-${invoiceNumber || invoiceId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        setActionMsg("PDF konnte nicht geladen werden.");
      } finally {
        setActionBusy("");
      }
    },
    [token],
  );

  const openNoteEditor = useCallback((ride) => {
    if (ride.chatEnabled) {
      setActionMsg("Notiz ist gesperrt — bitte den Fahrt-Chat nutzen.");
      return;
    }
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
      : "Live-Disposition, Zahler und Abrechnung — aktualisiert sich automatisch bei laufenden Fahrten.";

  return (
    <div className="panel-page panel-page--rides partner-rides-page partner-rides-page--modern">
      <header className="partner-rides-hero">
        <p className="partner-page-eyebrow">Fahrten</p>
        <h2 className="partner-page-title">{variant === "history" ? "Verlauf" : "Meine Fahrten"}</h2>
        <p className="partner-page-lead">{lead}</p>
      </header>

      {err ? <p className="panel-page__warn">{err}</p> : null}
      {actionMsg ? (
        <p className={actionMsg.includes("fehl") ? "panel-page__warn" : "panel-page__ok"}>{actionMsg}</p>
      ) : null}

      <div className="panel-rides-toolbar partner-rides-toolbar">
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
        {totalChatUnread > 0 ? (
          <span className="partner-rides-live-hint partner-ride-card__chat-pill">
            <span className="partner-ride-card__chat-dot" aria-hidden />
            {totalChatUnread} ungelesene Chat-Nachricht{totalChatUnread === 1 ? "" : "en"}
          </span>
        ) : null}
        {hasActiveRides ? (
          <span className="partner-rides-live-hint">Live · alle {POLL_MS / 1000} s</span>
        ) : null}
      </div>

      {loading ? <p className="panel-page__lead">Lade …</p> : null}
      {!loading && displayedRides.length === 0 && !err ? (
        <p className="panel-page__lead">Noch keine Fahrten in dieser Ansicht.</p>
      ) : null}

      <div className="partner-rides-list partner-rides-list--modern">
        {displayedRides.map((ride) => {
          const open = expandedId === ride.id;
          const tone = statusTone(ride.status);
          const note = getDriverNote(ride);
          const bill = billingSummary(ride);
          const tracking = trackingByRide[ride.id];
          const driverName = tracking?.driver?.name;
          const driverPlate = tracking?.driver?.plate;
          const rej = rejectionCount(ride);
          const invoiceId = bill.invoiceId || ride.companyInvoice?.invoiceId || null;
          const invoiceNumber = ride.companyInvoice?.invoiceNumber || null;

          const chatUnread = chatUnreadByRide[ride.id] ?? 0;

          return (
            <article key={ride.id} className={`partner-ride-card partner-ride-card--modern partner-ride-card--${tone}`}>
              <button
                type="button"
                className="partner-ride-card__head"
                onClick={() => setExpandedId(open ? null : ride.id)}
                aria-expanded={open}
              >
                <div className="partner-ride-card__head-main">
                  <div className="partner-ride-card__badges">
                    <span className={`partner-ride-card__status partner-ride-card__status--${tone}`}>
                      {statusLabel(ride.status)}
                    </span>
                    <span className={`partner-ride-card__pill partner-ride-card__pill--${bill.tone}`}>
                      {bill.headline}
                    </span>
                    {!ride.driverId && ride.status === "searching_driver" ? (
                      <span className="partner-ride-card__pill partner-ride-card__pill--search">Suche aktiv</span>
                    ) : null}
                    {ride.driverId ? (
                      <span className="partner-ride-card__pill partner-ride-card__pill--live">Angenommen</span>
                    ) : null}
                    {rej > 0 && !ride.driverId ? (
                      <span className="partner-ride-card__pill partner-ride-card__pill--warn">
                        {rej} Ablehnung{rej > 1 ? "en" : ""}
                      </span>
                    ) : null}
                    {chatUnread > 0 ? (
                      <span className="partner-ride-card__pill partner-ride-card__pill--warn partner-ride-card__chat-pill">
                        <span className="partner-ride-card__chat-dot" aria-hidden />
                        Chat ({chatUnread})
                      </span>
                    ) : null}
                  </div>
                  <strong className="partner-ride-card__route">
                    {ride.fromFull || ride.from || "—"} → {ride.toFull || ride.to || "—"}
                  </strong>
                  <span className="partner-ride-card__meta">
                    {ride.customerName || "—"}
                    {ride.scheduledAt ? ` · ${fmtDateTime(ride.scheduledAt)}` : ` · ${fmtDateTime(ride.createdAt)}`}
                  </span>
                  <span className="partner-ride-card__dispatch">{dispatchHeadline(ride)}</span>
                </div>
                <div className="partner-ride-card__head-side">
                  {chatUnread > 0 ? <span className="partner-ride-card__chat-badge">{chatUnread}</span> : null}
                  <span className="partner-ride-card__fare">{formatRideEstimatedFare(ride)}</span>
                  <span className="partner-ride-card__chevron">{open ? "▲" : "▼"}</span>
                </div>
              </button>

              {open ? (
                <div className="partner-ride-card__body">
                  <div className="partner-ride-ops-grid">
                    <section className="partner-ride-ops-panel">
                      <h4 className="partner-ride-ops-panel__title">Disposition</h4>
                      <DispatchStepper ride={ride} />
                      {driverName ? (
                        <p className="partner-ride-driver-line">
                          <strong>Fahrer:</strong> {driverName}
                          {driverPlate ? ` · ${driverPlate}` : ""}
                        </p>
                      ) : ride.driverId ? (
                        <p className="partner-ride-driver-line partner-muted">Fahrer zugewiesen — Details werden geladen …</p>
                      ) : (
                        <p className="partner-ride-driver-line partner-muted">Noch kein Fahrer angenommen.</p>
                      )}
                    </section>
                    <section className="partner-ride-ops-panel">
                      <h4 className="partner-ride-ops-panel__title">Abrechnung</h4>
                      <p className="partner-ride-billing-headline">{bill.headline}</p>
                      <p className="partner-muted">{bill.detail}</p>
                      <dl className="partner-ride-mini-dl">
                        <div>
                          <dt>Zahler</dt>
                          <dd>{payerKindLabel(ride.payerKind)}</dd>
                        </div>
                        <div>
                          <dt>Zahlungsart</dt>
                          <dd>{ride.paymentMethod || "—"}</dd>
                        </div>
                        {ride.billingReference ? (
                          <div>
                            <dt>Referenz</dt>
                            <dd>{ride.billingReference}</dd>
                          </div>
                        ) : null}
                        <div>
                          <dt>Preis</dt>
                          <dd>
                            {formatRideEstimatedFare(ride)} / {formatRideFinalFare(ride)}
                          </dd>
                        </div>
                      </dl>
                    </section>
                  </div>

                  <dl className="partner-ride-detail-grid">
                    <div>
                      <dt>Fahrgast</dt>
                      <dd>
                        {ride.customerName || "—"}
                        {ride.customerPhone ? ` · ${ride.customerPhone}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Fahrttyp</dt>
                      <dd>{rideKindLabel(ride.rideKind)}</dd>
                    </div>
                    <div>
                      <dt>Entfernung</dt>
                      <dd>
                        {ride.distanceKm != null ? `${Number(ride.distanceKm).toFixed(1)} km` : "—"}
                        {ride.durationMinutes != null ? ` · ${ride.durationMinutes} Min.` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Termin</dt>
                      <dd>{ride.scheduledAt ? fmtDateTime(ride.scheduledAt) : "Sofortfahrt"}</dd>
                    </div>
                    <div className="partner-ride-detail-grid__full">
                      <dt>Notiz für Fahrer</dt>
                      <dd>
                        {note || "—"}
                        {ride.chatEnabled ? (
                          <span className="partner-muted"> · Chat aktiv — Notiz ist schreibgeschützt.</span>
                        ) : null}
                      </dd>
                    </div>
                  </dl>

                  <div className="partner-ride-card__actions">
                    {canCreate && bill.canCreateInvoice ? (
                      <button
                        type="button"
                        className="panel-btn-primary"
                        disabled={actionBusy === `invoice-${ride.id}`}
                        onClick={() => void onCreateInvoice(ride.id)}
                      >
                        Rechnung erstellen
                      </button>
                    ) : null}
                    {invoiceId ? (
                      <button
                        type="button"
                        className="panel-btn-secondary"
                        disabled={actionBusy === `pdf-${invoiceId}`}
                        onClick={() => void downloadInvoicePdf(invoiceId, invoiceNumber)}
                      >
                        Rechnung PDF
                      </button>
                    ) : null}
                    {ride.chatEnabled ? (
                      <button
                        type="button"
                        className="panel-btn-primary partner-ride-card__chat-pill"
                        onClick={() => openChat(ride)}
                      >
                        {chatUnread > 0 ? (
                          <span className="partner-ride-card__chat-badge">{chatUnread}</span>
                        ) : null}
                        Chat öffnen
                      </button>
                    ) : null}
                    {canCreate ? (
                      <button
                        type="button"
                        className="panel-btn-secondary"
                        disabled={Boolean(actionBusy) || Boolean(ride.chatEnabled)}
                        onClick={() => openNoteEditor(ride)}
                      >
                        {ride.chatEnabled ? "Notiz (Chat aktiv)" : note ? "Notiz bearbeiten" : "Notiz hinzufügen"}
                      </button>
                    ) : null}
                    {canCreate && canRetrySearch(ride) ? (
                      <button
                        type="button"
                        className="panel-btn-secondary"
                        disabled={actionBusy === `retry-${ride.id}`}
                        onClick={() => void onRetrySearch(ride.id)}
                      >
                        Fahrersuche erneut starten
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
                    <button
                      type="button"
                      className="panel-btn-secondary"
                      onClick={() => void fetchTracking(ride.id)}
                    >
                      Status aktualisieren
                    </button>
                  </div>
                  <p className="partner-ride-card__id">ID: {ride.id}</p>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {chatRide ? (
        <PartnerRideChatModal
          token={token}
          ride={chatRide}
          open={Boolean(chatRide)}
          onClose={() => setChatRide(null)}
          onRidePatch={replaceRide}
          onMarkRead={markChatRead}
        />
      ) : null}

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
