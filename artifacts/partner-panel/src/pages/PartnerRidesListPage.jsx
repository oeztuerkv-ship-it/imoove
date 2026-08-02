import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { getPartnerMeta } from "./finance/financeHelpers.js";
import PartnerRideChatModal from "../components/PartnerRideChatModal.jsx";
import PartnerRideCard from "../components/PartnerRideCard.jsx";
import PartnerPrivateReminderCard from "../components/PartnerPrivateReminderCard.jsx";
import { usePartnerChatUnread } from "../context/PartnerChatUnreadContext.jsx";
import {
  fromIsoToDatetimeLocal,
  toIsoFromDatetimeLocal,
} from "../lib/smartBooking.js";
import {
  billingSummary,
  isPartnerRidePast,
  LIVE_DRIVER_STATUSES,
  partnerRideListDateKey,
  partnerRideMatchesSearch,
  partnerRideSegmentOf,
  TERMINAL_STATUSES,
} from "../lib/partnerRideOps.js";

const NOTE_MAX = 200;
const RETRY_SEARCH_MS = 60_000;
const POLL_MS = 10_000;
const TRACKING_POLL_MS = 5_000;

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

function memoSegmentOf(reminder, nowMs = Date.now()) {
  const t = Date.parse(String(reminder?.scheduledAt ?? ""));
  if (!Number.isFinite(t)) return "zukunft";
  return t >= nowMs ? "zukunft" : "abgelaufen";
}

function memoDateKey(reminder) {
  const d = new Date(reminder?.scheduledAt ?? "");
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function memoMatchesSearch(reminder, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [reminder.fromFull, reminder.toFull, reminder.note, reminder.id]
    .map((x) => String(x ?? "").toLowerCase())
    .join(" ");
  return hay.includes(needle);
}

function emptyMemoForm() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return {
    id: null,
    scheduledAtLocal: fromIsoToDatetimeLocal(d.toISOString()),
    fromFull: "",
    toFull: "",
    note: "",
  };
}

export default function PartnerRidesListPage({ variant }) {
  const { token, user } = usePanelAuth();
  const [rides, setRides] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteRideId, setNoteRideId] = useState(null);
  const [memoFormOpen, setMemoFormOpen] = useState(false);
  const [memoForm, setMemoForm] = useState(() => emptyMemoForm());
  const [actionBusy, setActionBusy] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [trackingByRide, setTrackingByRide] = useState({});
  const [chatRide, setChatRide] = useState(null);
  const [segment, setSegment] = useState(variant === "history" ? "abgelaufen" : "aktuell");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const { chatUnreadByRide, totalChatUnread, markChatRead, clearRideUnread, refreshChatUnread } =
    usePartnerChatUnread();

  const canCreate = Array.isArray(user?.permissions) && user.permissions.includes("rides.create");
  const role = String(user?.role ?? "").trim().toLowerCase();
  const canManageMemos =
    variant !== "history" &&
    String(user?.companyKind ?? "").trim().toLowerCase() === "taxi" &&
    (role === "owner" || role === "manager");

  const loadReminders = useCallback(
    async (silent = false) => {
      if (!token || !canManageMemos) {
        setReminders([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/panel/v1/private-reminders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          if (!silent && res.status !== 403) {
            /* Fahrten bleiben nutzbar; Merkliste optional */
          }
          if (res.status === 403) setReminders([]);
          return;
        }
        setReminders(Array.isArray(data.reminders) ? data.reminders : []);
      } catch {
        if (!silent) {
          /* ignore — rides list still works */
        }
      }
    },
    [token, canManageMemos],
  );

  const loadRides = useCallback(
    async (silent = false) => {
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
        void loadReminders(silent);
        if (silent) void refreshChatUnread();
      } catch {
        if (!silent) {
          setErr("Fahrten konnten nicht geladen werden.");
          setRides([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, refreshChatUnread, loadReminders],
  );

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

  useEffect(() => {
    if (canManageMemos) void loadReminders(true);
    else setReminders([]);
  }, [canManageMemos, loadReminders]);

  const displayedRides = useMemo(() => {
    if (variant === "history") {
      return rides.filter((r) => HISTORY_STATUSES.has(r.status));
    }
    return rides;
  }, [rides, variant]);

  const displayedReminders = useMemo(() => {
    if (!canManageMemos || variant === "history") return [];
    return reminders;
  }, [reminders, canManageMemos, variant]);

  const filteredFeed = useMemo(() => {
    const q = searchQuery.trim();
    const activeSeg = variant === "history" ? "abgelaufen" : segment;
    const nowMs = Date.now();

    let rideList = displayedRides.filter((ride) => partnerRideSegmentOf(ride) === activeSeg);
    if (q) rideList = rideList.filter((ride) => partnerRideMatchesSearch(ride, q));
    if (dateFilter) rideList = rideList.filter((ride) => partnerRideListDateKey(ride) === dateFilter);
    rideList = sortRidesForSegment(rideList, activeSeg);

    let memoList = [];
    if (activeSeg === "zukunft" || activeSeg === "abgelaufen") {
      memoList = displayedReminders.filter((m) => memoSegmentOf(m, nowMs) === activeSeg);
      if (q) memoList = memoList.filter((m) => memoMatchesSearch(m, q));
      if (dateFilter) memoList = memoList.filter((m) => memoDateKey(m) === dateFilter);
      memoList = [...memoList].sort((a, b) => {
        const ta = Date.parse(String(a.scheduledAt ?? "")) || 0;
        const tb = Date.parse(String(b.scheduledAt ?? "")) || 0;
        return activeSeg === "zukunft" ? ta - tb : tb - ta;
      });
    }

    /** @type {{ kind: 'ride'; ride: object; sortAt: number } | { kind: 'memo'; reminder: object; sortAt: number }[]} */
    const items = [
      ...rideList.map((ride) => ({
        kind: "ride",
        ride,
        sortAt: Date.parse(String(ride.scheduledAt ?? ride.createdAt ?? "")) || 0,
      })),
      ...memoList.map((reminder) => ({
        kind: "memo",
        reminder,
        sortAt: Date.parse(String(reminder.scheduledAt ?? "")) || 0,
      })),
    ];
    items.sort((a, b) => (activeSeg === "zukunft" ? a.sortAt - b.sortAt : b.sortAt - a.sortAt));
    return items;
  }, [displayedRides, displayedReminders, segment, variant, searchQuery, dateFilter]);

  const filteredRides = useMemo(
    () => filteredFeed.filter((x) => x.kind === "ride").map((x) => x.ride),
    [filteredFeed],
  );

  const segmentCounts = useMemo(() => {
    const counts = { aktuell: 0, zukunft: 0, abgelaufen: 0 };
    const nowMs = Date.now();
    for (const ride of displayedRides) {
      const seg = partnerRideSegmentOf(ride);
      if (seg in counts) counts[seg] += 1;
    }
    for (const memo of displayedReminders) {
      const seg = memoSegmentOf(memo, nowMs);
      if (seg in counts) counts[seg] += 1;
    }
    return counts;
  }, [displayedRides, displayedReminders]);

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

  const liveTrackingRideIds = useMemo(
    () =>
      filteredRides
        .filter((r) => r.driverId && LIVE_DRIVER_STATUSES.has(String(r.status ?? "")))
        .map((r) => r.id),
    [filteredRides],
  );

  useEffect(() => {
    if (!token || variant === "history" || liveTrackingRideIds.length === 0) return;
    for (const rideId of liveTrackingRideIds) void fetchTracking(rideId);
    const id = setInterval(() => {
      for (const rideId of liveTrackingRideIds) void fetchTracking(rideId);
    }, TRACKING_POLL_MS);
    return () => clearInterval(id);
  }, [token, variant, liveTrackingRideIds, fetchTracking]);

  useEffect(() => {
    if (!token || variant === "history") return;
    void refreshChatUnread();
  }, [token, variant, refreshChatUnread]);

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

  const openMemoCreate = useCallback(() => {
    setMemoForm(emptyMemoForm());
    setMemoFormOpen(true);
    setActionMsg("");
  }, []);

  const openMemoEdit = useCallback((reminder) => {
    setMemoForm({
      id: reminder.id,
      scheduledAtLocal: fromIsoToDatetimeLocal(reminder.scheduledAt),
      fromFull: reminder.fromFull ?? "",
      toFull: reminder.toFull ?? "",
      note: reminder.note ?? "",
    });
    setMemoFormOpen(true);
    setActionMsg("");
  }, []);

  const saveMemo = useCallback(async () => {
    if (!token || !canManageMemos) return;
    const scheduledAt = toIsoFromDatetimeLocal(memoForm.scheduledAtLocal);
    if (!scheduledAt) {
      setActionMsg("Bitte Datum und Uhrzeit setzen.");
      return;
    }
    const fromFull = memoForm.fromFull.trim();
    const toFull = memoForm.toFull.trim();
    const note = memoForm.note.trim();
    if (!fromFull && !toFull && !note) {
      setActionMsg("Bitte Start, Ziel oder Notiz ausfüllen.");
      return;
    }
    const busyKey = memoForm.id ? `memo-${memoForm.id}` : "memo-new";
    setActionBusy(busyKey);
    setActionMsg("");
    try {
      const isEdit = Boolean(memoForm.id);
      const url = isEdit
        ? `${API_BASE}/panel/v1/private-reminders/${encodeURIComponent(memoForm.id)}`
        : `${API_BASE}/panel/v1/private-reminders`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt, fromFull, toFull, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setActionMsg(
          typeof data?.error === "string"
            ? `Privatauftrag fehlgeschlagen (${data.error}).`
            : "Privatauftrag konnte nicht gespeichert werden.",
        );
        return;
      }
      const row = data.reminder;
      if (row?.id) {
        setReminders((prev) => {
          const without = prev.filter((r) => r.id !== row.id);
          return [...without, row];
        });
      } else {
        void loadReminders(true);
      }
      setMemoFormOpen(false);
      setMemoForm(emptyMemoForm());
      setActionMsg(isEdit ? "Privatauftrag aktualisiert." : "Privatauftrag angelegt.");
      if (segment === "aktuell") setSegment("zukunft");
    } catch {
      setActionMsg("Privatauftrag konnte nicht gespeichert werden.");
    } finally {
      setActionBusy("");
    }
  }, [token, canManageMemos, memoForm, loadReminders, segment]);

  const deleteMemo = useCallback(
    async (reminderId) => {
      if (!token || !canManageMemos) return;
      if (!window.confirm("Diesen Privatauftrag wirklich löschen?")) return;
      setActionBusy(`memo-${reminderId}`);
      setActionMsg("");
      try {
        const res = await fetch(
          `${API_BASE}/panel/v1/private-reminders/${encodeURIComponent(reminderId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          setActionMsg("Löschen fehlgeschlagen.");
          return;
        }
        setReminders((prev) => prev.filter((r) => r.id !== reminderId));
        if (expandedId === `memo-${reminderId}`) setExpandedId(null);
        setActionMsg("Privatauftrag gelöscht.");
      } catch {
        setActionMsg("Löschen fehlgeschlagen.");
      } finally {
        setActionBusy("");
      }
    },
    [token, canManageMemos, expandedId],
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
      : canManageMemos
        ? "Aktuelle Disposition, geplante Termine und Privataufträge — mit Suche und Datum."
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
        {canManageMemos ? (
          <button type="button" className="panel-btn-secondary" onClick={openMemoCreate}>
            + Privatauftrag
          </button>
        ) : null}
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
      {!loading && filteredFeed.length === 0 && !err ? (
        <p className="panel-page__lead">
          {displayedRides.length === 0 && displayedReminders.length === 0
            ? "Noch keine Fahrten in dieser Ansicht."
            : searchQuery.trim() || dateFilter
              ? "Keine Einträge für Suche oder Datum."
              : activeSegment === "aktuell"
                ? "Keine laufenden Fahrten — geplante Termine unter „Offene“."
                : activeSegment === "zukunft"
                  ? "Keine geplanten Fahrten oder Privataufträge."
                  : "Keine abgelaufenen Fahrten oder Privataufträge in dieser Ansicht."}
        </p>
      ) : null}

      <div className="partner-rides-list partner-rides-list--modern">
        {filteredFeed.map((item) => {
          if (item.kind === "memo") {
            const reminder = item.reminder;
            const memoKey = `memo-${reminder.id}`;
            const open = expandedId === memoKey;
            return (
              <PartnerPrivateReminderCard
                key={memoKey}
                reminder={reminder}
                open={open}
                onToggle={() => setExpandedId(open ? null : memoKey)}
                canEdit={canManageMemos}
                actionBusy={actionBusy}
                onEdit={() => openMemoEdit(reminder)}
                onDelete={() => void deleteMemo(reminder.id)}
              />
            );
          }

          const ride = item.ride;
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
              companyName={user?.companyName ?? ""}
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

      {memoFormOpen ? (
        <div className="partner-memo-modal" role="dialog" aria-modal="true" aria-labelledby="partner-memo-title">
          <div className="partner-memo-modal__panel">
            <h3 id="partner-memo-title" className="partner-memo-modal__title">
              {memoForm.id ? "Privatauftrag bearbeiten" : "Privatauftrag"}
            </h3>
            <p className="partner-muted" style={{ marginTop: 0, marginBottom: 12, fontSize: "0.88rem" }}>
              Nur für Owner/Manager Ihres Unternehmens — kein Fahrer, kein Matching.
            </p>
            <label className="partner-memo-modal__field">
              <span>Wann</span>
              <input
                type="datetime-local"
                value={memoForm.scheduledAtLocal}
                onChange={(e) => setMemoForm((f) => ({ ...f, scheduledAtLocal: e.target.value }))}
              />
            </label>
            <label className="partner-memo-modal__field">
              <span>Von (optional)</span>
              <input
                type="text"
                value={memoForm.fromFull}
                onChange={(e) => setMemoForm((f) => ({ ...f, fromFull: e.target.value }))}
                placeholder="Start / Ort"
              />
            </label>
            <label className="partner-memo-modal__field">
              <span>Nach (optional)</span>
              <input
                type="text"
                value={memoForm.toFull}
                onChange={(e) => setMemoForm((f) => ({ ...f, toFull: e.target.value }))}
                placeholder="Ziel"
              />
            </label>
            <label className="partner-memo-modal__field">
              <span>Notiz</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={memoForm.note}
                onChange={(e) => setMemoForm((f) => ({ ...f, note: e.target.value.slice(0, 2000) }))}
                placeholder="z. B. Rückruf Hotel, Stammtisch 20 Uhr …"
              />
            </label>
            <div className="partner-memo-modal__actions">
              <button
                type="button"
                className="panel-btn-secondary"
                onClick={() => {
                  setMemoFormOpen(false);
                  setMemoForm(emptyMemoForm());
                }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="panel-btn-primary"
                disabled={actionBusy === "memo-new" || (memoForm.id && actionBusy === `memo-${memoForm.id}`)}
                onClick={() => void saveMemo()}
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
