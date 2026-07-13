import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { getPartnerMeta } from "./finance/financeHelpers.js";
import PartnerRideChatModal from "../components/PartnerRideChatModal.jsx";
import PartnerRideCard from "../components/PartnerRideCard.jsx";
import { usePartnerChatUnread } from "../context/PartnerChatUnreadContext.jsx";
import {
  billingSummary,
  isPartnerRidePast,
  partnerRideListDateKey,
  partnerRideMatchesSearch,
  partnerRideSegmentOf,
  TERMINAL_STATUSES,
} from "../lib/partnerRideOps.js";
import { clearPartnerOpenChatRideIntent, peekPartnerOpenChatRideIntent } from "../lib/partnerOpenChatIntent.js";

const NOTE_MAX = 200;
const RETRY_SEARCH_MS = 60_000;
const POLL_MS = 10_000;

function getDriverNote(ride) {
  const meta = getPartnerMeta(ride);
  const raw = meta?.customer_driver_note;
  return typeof raw === "string" ? raw.trim() : "";
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

const RIDE_SEGMENTS = [
  { id: "aktuell", label: "Aktuell / Online" },
  { id: "zukunft", label: "Offene" },
  { id: "abgelaufen", label: "Abgelaufen" },
];

function sortRidesForSegment(rides, segment) {
  const copy = [...rides];
  if (segment === "zukunft") {
    return copy.sort((a, b) => {
      const ta = Date.parse(String(a.scheduledAt ?? a.createdAt ?? "")) || 0;
      const tb = Date.parse(String(b.scheduledAt ?? b.createdAt ?? "")) || 0;
      return ta - tb;
    });
  }
  return copy.sort((a, b) => {
    const ta = Date.parse(String(a.scheduledAt ?? a.createdAt ?? "")) || 0;
    const tb = Date.parse(String(b.scheduledAt ?? b.createdAt ?? "")) || 0;
    return tb - ta;
  });
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
  const [segment, setSegment] = useState(variant === "history" ? "abgelaufen" : "aktuell");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const { chatUnreadByRide, totalChatUnread, markChatRead, clearRideUnread } = usePartnerChatUnread();

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

  const filteredRides = useMemo(() => {
    const q = searchQuery.trim();
    const activeSegment = variant === "history" ? "abgelaufen" : segment;
    let list = displayedRides.filter((ride) => partnerRideSegmentOf(ride) === activeSegment);
    if (q) {
      list = list.filter((ride) => partnerRideMatchesSearch(ride, q));
    }
    if (dateFilter) {
      list = list.filter((ride) => partnerRideListDateKey(ride) === dateFilter);
    }
    return sortRidesForSegment(list, activeSegment);
  }, [displayedRides, segment, variant, searchQuery, dateFilter]);

  const segmentCounts = useMemo(() => {
    const counts = { aktuell: 0, zukunft: 0, abgelaufen: 0 };
    for (const ride of displayedRides) {
      const seg = partnerRideSegmentOf(ride);
      if (seg in counts) counts[seg] += 1;
    }
    return counts;
  }, [displayedRides]);

  const openChat = useCallback(
    (ride) => {
      setChatRide(ride);
      if (ride?.id) {
        clearRideUnread(ride.id);
        setExpandedId(ride.id);
      }
    },
    [clearRideUnread],
  );

  useEffect(() => {
    if (loading) return;
    const rideId = peekPartnerOpenChatRideIntent();
    if (!rideId) return;
    const ride = rides.find((r) => r.id === rideId);
    if (!ride) return;
    clearPartnerOpenChatRideIntent();
    openChat(ride);
  }, [loading, rides, openChat]);

  useEffect(() => {
    if (!token || variant === "history") return;
    void loadRides(true);
    const id = setInterval(() => void loadRides(true), POLL_MS);
    return () => clearInterval(id);
  }, [loadRides, token, variant]);

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

  const onArchive = useCallback(
    async (rideId) => {
      if (!token) return;
      if (
        !window.confirm(
          "Fahrt archivieren? Sie verschwindet aus Ihrer Liste — Details bleiben in der Abrechnung erhalten.",
        )
      ) {
        return;
      }
      setActionBusy(`archive-${rideId}`);
      setActionMsg("");
      try {
        const res = await fetch(`${API_BASE}/panel/v1/rides/${encodeURIComponent(rideId)}/hide`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          setActionMsg("Archivieren fehlgeschlagen.");
          return;
        }
        setRides((prev) => prev.filter((r) => r.id !== rideId));
        if (expandedId === rideId) setExpandedId(null);
        setActionMsg("Fahrt archiviert.");
      } catch {
        setActionMsg("Archivieren fehlgeschlagen.");
      } finally {
        setActionBusy("");
      }
    },
    [token, expandedId],
  );

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
  }, [filteredRides, variant]);

  const activeSegment = variant === "history" ? "abgelaufen" : segment;

  const lead =
    variant === "history"
      ? "Abgeschlossene, stornierte und abgelehnte Fahrten."
      : "Aktuelle Disposition, geplante Termine und abgelaufene Fahrten — mit Suche und Datum.";

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
        <button type="button" className="panel-btn-primary partner-rides-toolbar__refresh" disabled={loading} onClick={() => void loadRides()}>
          ↻ Aktualisieren
        </button>
        <button
          type="button"
          className="panel-btn-secondary"
          disabled={filteredRides.length === 0}
          onClick={onExportCsv}
        >
          CSV exportieren
        </button>
        {totalChatUnread > 0 ? (
          <span className="partner-rides-live-hint partner-ride-card__chat-pill">
            <span className="partner-ride-card__chat-badge" aria-hidden>
              {totalChatUnread}
            </span>
            ungelesene Chat-Nachricht{totalChatUnread === 1 ? "" : "en"}
          </span>
        ) : null}
        {variant !== "history" && activeSegment === "aktuell" ? (
          <span className="partner-rides-live-hint">Live · alle {POLL_MS / 1000} s</span>
        ) : null}
      </div>

      {variant !== "history" ? (
        <div className="partner-rides-filters" role="search">
          <div className="partner-rides-segments" role="tablist" aria-label="Fahrten-Bereiche">
            {RIDE_SEGMENTS.map((tab) => {
              const active = segment === tab.id;
              const count = segmentCounts[tab.id] ?? 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`partner-rides-segment${active ? " partner-rides-segment--active" : ""}`}
                  onClick={() => setSegment(tab.id)}
                >
                  {tab.label}
                  {count > 0 ? <span className="partner-rides-segment__count">{count}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="partner-rides-search-row">
            <label className="partner-rides-search-field">
              <span className="partner-rides-search-field__label">Suche</span>
              <input
                type="search"
                className="partner-rides-search-field__input"
                placeholder="Route, Referenz, Zimmer, ID …"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
            <label className="partner-rides-search-field partner-rides-search-field--date">
              <span className="partner-rides-search-field__label">Datum</span>
              <input
                type="date"
                className="partner-rides-search-field__input"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </label>
            {dateFilter ? (
              <button type="button" className="panel-btn-secondary partner-rides-date-clear" onClick={() => setDateFilter("")}>
                Datum löschen
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="partner-rides-filters partner-rides-filters--history">
          <div className="partner-rides-search-row">
            <label className="partner-rides-search-field">
              <span className="partner-rides-search-field__label">Suche</span>
              <input
                type="search"
                className="partner-rides-search-field__input"
                placeholder="Route, Referenz, ID …"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
            <label className="partner-rides-search-field partner-rides-search-field--date">
              <span className="partner-rides-search-field__label">Datum</span>
              <input
                type="date"
                className="partner-rides-search-field__input"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </label>
            {dateFilter ? (
              <button type="button" className="panel-btn-secondary partner-rides-date-clear" onClick={() => setDateFilter("")}>
                Datum löschen
              </button>
            ) : null}
          </div>
        </div>
      )}

      {loading ? <p className="panel-page__lead">Lade …</p> : null}
      {!loading && filteredRides.length === 0 && !err ? (
        <p className="panel-page__lead">
          {displayedRides.length === 0
            ? "Noch keine Fahrten in dieser Ansicht."
            : searchQuery.trim() || dateFilter
              ? "Keine Fahrten für Suche oder Datum."
              : activeSegment === "aktuell"
                ? "Keine laufenden Fahrten — geplante Termine unter „Offene“."
                : activeSegment === "zukunft"
                  ? "Keine geplanten Fahrten."
                  : "Keine abgelaufenen Fahrten in dieser Ansicht."}
        </p>
      ) : null}

      <div className="partner-rides-list partner-rides-list--modern">
        {filteredRides.map((ride) => {
          const open = expandedId === ride.id;
          const note = getDriverNote(ride);
          const bill = billingSummary(ride);
          const tracking = trackingByRide[ride.id];
          const invoiceId = bill.invoiceId || ride.companyInvoice?.invoiceId || null;
          const invoiceNumber = ride.companyInvoice?.invoiceNumber || null;
          const chatUnread = chatUnreadByRide[ride.id] ?? 0;

          return (
            <PartnerRideCard
              key={ride.id}
              ride={ride}
              open={open}
              onToggle={() => setExpandedId(open ? null : ride.id)}
              tracking={tracking}
              note={note}
              chatUnread={chatUnread}
              showLivePill={variant !== "history"}
              canCreate={canCreate}
              actionBusy={actionBusy}
              bill={bill}
              invoiceId={invoiceId}
              canRetrySearch={canRetrySearch(ride)}
              canCancel={canCancelRide(ride)}
              canArchive={isPartnerRidePast(ride)}
              onArchive={() => void onArchive(ride.id)}
              onOpenChat={() => openChat(ride)}
              onOpenNote={() => openNoteEditor(ride)}
              onCancel={() => void onCancel(ride.id)}
              onRetrySearch={() => void onRetrySearch(ride.id)}
              onRefreshTracking={() => void fetchTracking(ride.id)}
              onCreateInvoice={() => void onCreateInvoice(ride.id)}
              onDownloadPdf={() => void downloadInvoicePdf(invoiceId, invoiceNumber)}
            />
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
