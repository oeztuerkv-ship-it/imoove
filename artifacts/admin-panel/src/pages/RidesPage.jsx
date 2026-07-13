import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import {
  rideCodeChipClass,
  rideStatusLabelDe,
  RideStatusPill,
} from "../lib/adminRideStatusUi.jsx";

const RIDES_URL = `${API_BASE}/admin/rides`;
const STATS_URL = `${API_BASE}/admin/stats`;
const COMPANIES_URL = `${API_BASE}/admin/companies`;
const PAGE_SIZE = 20;

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
    insurance: "KV",
    voucher: "Gutschein",
    third_party: "Dritt",
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
  if (ride.authorizationSource === "access_code") return "Zugangscode";
  return "Direktbuchung";
}

function billingStatusDe(status) {
  const m = {
    unbilled: "Nicht abgerechnet",
    queued: "In Warteschlange",
    invoiced: "Fakturiert",
    partially_paid: "Teilweise bezahlt",
    paid: "Bezahlt",
    cancelled: "Abgerechnung storniert",
    written_off: "Abgeschrieben",
  };
  return m[String(status || "")] || (status ? String(status) : "—");
}

function billingStatusToneClass(status) {
  const s = String(status || "");
  if (s === "paid") return "admin-status-pill admin-status-pill--ok";
  if (s === "cancelled" || s === "written_off") return "admin-status-pill admin-status-pill--bad";
  if (s === "queued" || s === "invoiced" || s === "partially_paid") return "admin-status-pill admin-status-pill--active";
  return "admin-status-pill admin-status-pill--pending";
}

/** Status-Filter: „Alle“ zuerst, danach A–Z nach deutscher Bezeichnung. */
const RIDE_STATUS_FILTER_OPTIONS = (() => {
  const ids = ["pending", "accepted", "arrived", "in_progress", "completed", "cancelled", "rejected"];
  const rest = ids.map((value) => ({ value, label: rideStatusLabelDe(value) }));
  rest.sort((a, b) => a.label.localeCompare(b.label, "de", { sensitivity: "base" }));
  return [{ value: "all", label: "Alle" }, ...rest];
})();

function rideTripType(ride) {
  return ride.scheduledAt ? "Termin" : "Sofort";
}

function rideStatusDe(status) {
  return rideStatusLabelDe(status);
}

function csvEscapeCell(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rideSourceLabel(ride) {
  if (ride?.createdByPanelUserId) return "Partner-Portal";
  return "—";
}

function paymentMethodLabel(method) {
  const m = String(method || "").trim().toLowerCase();
  if (!m) return "—";
  if (m === "bar" || m === "cash") return "Bar";
  if (m === "access_code" || m === "voucher" || m === "gutschein / code") return "Gutschein";
  if (m === "card") return "Karte";
  if (m === "paypal") return "PayPal";
  return method;
}

function driverDisplayName(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return text;
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

function rideInternalNote(ride) {
  const direct = typeof ride?.internalNote === "string" ? ride.internalNote.trim() : "";
  if (direct) return direct;
  const fromMeta = typeof ride?.partnerBookingMeta?.internalNote === "string"
    ? ride.partnerBookingMeta.internalNote.trim()
    : "";
  if (fromMeta) return fromMeta;
  const hotelRef = typeof ride?.partnerBookingMeta?.hotel?.reservationRef === "string"
    ? ride.partnerBookingMeta.hotel.reservationRef.trim()
    : "";
  if (hotelRef) return `Reservierung: ${hotelRef}`;
  return "";
}

function emptyStats() {
  return {
    rides: {
      total: 0,
      pending: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      rejected: 0,
    },
  };
}

export default function RidesPage({ initialDetailRideId, onInitialDetailRideConsumed, onOpenRideRecord, userRole }) {
  const [rides, setRides] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(emptyStats);
  const [statsLoading, setStatsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [ridesSort, setRidesSort] = useState("desc");
  const [exportBusy, setExportBusy] = useState(false);

  const [companies, setCompanies] = useState([]);

  const companiesAz = useMemo(
    () => [...companies].sort((a, b) => (a.name || "").localeCompare(b.name || "", "de", { sensitivity: "base" })),
    [companies],
  );

  const [detailId, setDetailId] = useState(null);
  const [detailRide, setDetailRide] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState(null);
  const [previewIdCopied, setPreviewIdCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(COMPANIES_URL, { headers: adminApiHeaders() });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.ok && Array.isArray(data.items)) {
          setCompanies(data.items);
          if (userRole === "hotel" && data.items.length === 1 && data.items[0]?.id) {
            setCompanyFilter(data.items[0].id);
          }
        }
      } catch {
        /* Firmen-Dropdown optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userRole]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(STATS_URL, { headers: adminApiHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.ok || !data?.stats?.rides) return;
      const s = data.stats.rides;
      setStats({
        rides: {
          total: s.total ?? 0,
          pending: s.pending ?? 0,
          active: s.active ?? 0,
          completed: s.completed ?? 0,
          cancelled: s.cancelled ?? 0,
          rejected: s.rejected ?? 0,
        },
      });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
    const iv = setInterval(() => void loadStats(), 15000);
    return () => clearInterval(iv);
  }, [loadStats]);

  const loadRides = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader) setLoading(true);
        setError("");

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(PAGE_SIZE));
        if (debouncedQ) params.set("q", debouncedQ);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (companyFilter !== "all") params.set("companyId", companyFilter);
        if (createdFrom.trim()) params.set("createdFrom", createdFrom.trim());
        if (createdTo.trim()) params.set("createdTo", createdTo.trim());
        if (driverFilter.trim()) params.set("driverId", driverFilter.trim());
        params.set("sortCreated", ridesSort === "asc" ? "asc" : "desc");

        const res = await fetch(`${RIDES_URL}?${params.toString()}`, {
          headers: adminApiHeaders(),
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 503) {
            throw new Error("Zugriff verweigert. Bitte prüfen Sie die Anmeldung an der Plattform.");
          }
          throw new Error(`Fahrten konnten nicht geladen werden (${res.status}).`);
        }

        const data = await res.json();

        if (!data?.ok || !Array.isArray(data.items)) {
          throw new Error("Ungültige Antwort");
        }

        setRides(data.items);
        setTotal(typeof data.total === "number" ? data.total : data.items.length);
      } catch (err) {
        setError(err.message || "Fahrten konnten nicht geladen werden.");
        setRides([]);
        setTotal(0);
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [page, debouncedQ, statusFilter, companyFilter, createdFrom, createdTo, driverFilter, ridesSort],
  );

  useEffect(() => {
    void loadRides(true);
  }, [loadRides]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadRides(false);
    }, 8000);
    return () => clearInterval(interval);
  }, [loadRides]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, statusFilter, companyFilter, createdFrom, createdTo, driverFilter, ridesSort]);

  async function exportRidesCsv() {
    setExportBusy(true);
    setError("");
    try {
      const collected = [];
      let p = 1;
      const pageSize = 100;
      const maxPages = 50;
      let totalExpected = Infinity;
      while (p <= maxPages && collected.length < totalExpected) {
        const params = new URLSearchParams();
        params.set("page", String(p));
        params.set("pageSize", String(pageSize));
        if (debouncedQ) params.set("q", debouncedQ);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (companyFilter !== "all") params.set("companyId", companyFilter);
        if (createdFrom.trim()) params.set("createdFrom", createdFrom.trim());
        if (createdTo.trim()) params.set("createdTo", createdTo.trim());
        if (driverFilter.trim()) params.set("driverId", driverFilter.trim());
        params.set("sortCreated", ridesSort === "asc" ? "asc" : "desc");
        const res = await fetch(`${RIDES_URL}?${params.toString()}`, { headers: adminApiHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok || !Array.isArray(data.items)) {
          throw new Error("Export: Fahrten konnten nicht geladen werden.");
        }
        totalExpected = typeof data.total === "number" ? data.total : collected.length + data.items.length;
        collected.push(...data.items);
        if (data.items.length < pageSize) break;
        p += 1;
      }
      const header = [
        "Zeitpunkt",
        "Fahrt-Typ",
        "Unternehmen",
        "Fahrzeug",
        "Fahrtart",
        "Fahrt-ID",
        "Kunde",
        "Status",
        "Von",
        "Nach",
      ];
      const lines = [header.map(csvEscapeCell).join(",")];
      for (const ride of collected) {
        const when = ride.scheduledAt || ride.createdAt;
        lines.push(
          [
            formatDate(when),
            rideTripType(ride),
            ride.companyName || ride.companyId || "",
            ride.vehicle || "",
            rideKindLabel(ride.rideKind),
            ride.id || "",
            ride.customerName || "",
            rideStatusDe(ride.status),
            ride.from || "",
            ride.to || "",
          ]
            .map(csvEscapeCell)
            .join(","),
        );
      }
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `onroda-fahrten-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV-Export fehlgeschlagen.");
    } finally {
      setExportBusy(false);
    }
  }

  async function loadDetail(id) {
    setDetailId(id);
    setDetailRide(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const res = await fetch(`${RIDES_URL}/${encodeURIComponent(id)}`, {
        headers: adminApiHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data.ride) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setDetailRide(data.ride);
    } catch (e) {
      setDetailError(e.message || "Detail konnte nicht geladen werden.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!initialDetailRideId) return;
    void loadDetail(initialDetailRideId);
    onInitialDetailRideConsumed?.();
    // Nur Intent aus dem Dashboard; loadDetail absichtlich nicht in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDetailRideId]);

  function closeDetail() {
    setDetailId(null);
    setDetailRide(null);
    setDetailError("");
  }

  async function releaseRide(id) {
    try {
      setBusyId(id);
      setError("");

      const res = await fetch(`${RIDES_URL}/${encodeURIComponent(id)}/release`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `Freigeben fehlgeschlagen (${res.status})`);
      }

      await loadRides(false);
      if (detailId === id && data?.ride) {
        setDetailRide(data.ride);
      }
    } catch (err) {
      setError(err.message || "Fahrt konnte nicht freigegeben werden.");
    } finally {
      setBusyId(null);
    }
  }

  function formatDate(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString("de-DE");
    } catch {
      return String(value);
    }
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "—";
    const num = Number(value);
    if (Number.isNaN(num)) return "—";
    return `${num.toFixed(2)} €`;
  }

  function canRelease(ride) {
    if (ride?.driverId) return true;
    const s = ride?.status;
    return s === "accepted" || s === "arrived" || s === "in_progress";
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function copyRideId(id) {
    if (!id || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(id);
      if (detailId === id) {
        setPreviewIdCopied(true);
        window.setTimeout(() => setPreviewIdCopied(false), 2000);
      }
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function renderPagination() {
    const buttons = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    if (page > 1) {
      buttons.push(
        <button key="prev" type="button" className="admin-page-btn" onClick={() => setPage(page - 1)}>
          Zurück
        </button>,
      );
    }

    if (start > 1) {
      buttons.push(
        <button key={1} type="button" className="admin-page-btn" onClick={() => setPage(1)}>
          1
        </button>,
      );
      if (start > 2) {
        buttons.push(
          <span key="startDots" className="admin-page-dots">
            ...
          </span>,
        );
      }
    }

    for (let i = start; i <= end; i += 1) {
      buttons.push(
        <button
          key={i}
          type="button"
          className={i === page ? "admin-page-btn admin-page-btn--active" : "admin-page-btn"}
          onClick={() => setPage(i)}
        >
          {i}
        </button>,
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        buttons.push(
          <span key="endDots" className="admin-page-dots">
            ...
          </span>,
        );
      }
      buttons.push(
        <button
          key={totalPages}
          type="button"
          className="admin-page-btn"
          onClick={() => setPage(totalPages)}
        >
          {totalPages}
        </button>,
      );
    }

    if (page < totalPages) {
      buttons.push(
        <button key="next" type="button" className="admin-page-btn" onClick={() => setPage(page + 1)}>
          Weiter
        </button>,
      );
    }

    return buttons;
  }

  const s = stats.rides;

  const resultsSubtitle = `${total} Treffer · Seite ${page} von ${totalPages}`;

  if (loading && rides.length === 0) {
    return (
      <div className="admin-page admin-page--loose admin-rides-page">
        <div className="admin-info-banner">Fahrten werden geladen …</div>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--loose admin-rides-page">
      <p className="admin-page-lead">
        <strong>Plattform-Fahrten</strong> — REQ-ID, Kunde oder Route suchen.{" "}
        <strong>Vorschau</strong> für Kurzinfos, <strong>Fahrtakte</strong> für den vollständigen Verlauf.
      </p>

      {userRole === "insurance" ? (
        <div className="admin-info-banner admin-info-banner--inline">
          Ansicht eingeschränkt: nur Fahrten mit Kostenträger <strong>Krankenkasse</strong> (serverseitig).
        </div>
      ) : null}
      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Alle Fahrten</div>
          <div className="admin-stat-value admin-crisp-numeric">{statsLoading ? "…" : s.total}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Offen</div>
          <div className="admin-stat-value admin-crisp-numeric">{statsLoading ? "…" : s.pending}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Aktiv</div>
          <div className="admin-stat-value admin-crisp-numeric">{statsLoading ? "…" : s.active}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Abgeschlossen</div>
          <div className="admin-stat-value admin-crisp-numeric">{statsLoading ? "…" : s.completed}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Storniert</div>
          <div className="admin-stat-value admin-crisp-numeric">{statsLoading ? "…" : s.cancelled}</div>
        </div>
      </div>

      <AdminCollapsibleSection title="Suche & Filter" subtitle="REQ-ID, Kunde, Route, Fahrer, Datum" defaultOpen flushBody>
        <div className="admin-section-block__inset">
          <div className="admin-filter-grid admin-filter-grid--modern admin-filter-grid--rides">
            <div className="admin-filter-item admin-filter-item--wide">
              <label className="admin-field-label">Suche</label>
              <input
                type="search"
                className="admin-input"
                placeholder="REQ-…, Kunde, Route, Fahrer …"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>

            <div className="admin-filter-item">
              <label className="admin-field-label">Status</label>
              <select className="admin-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {RIDE_STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-filter-item">
              <label className="admin-field-label">Unternehmen</label>
              <select
                className="admin-select"
                value={companyFilter}
                disabled={userRole === "hotel"}
                onChange={(e) => setCompanyFilter(e.target.value)}
                title={userRole === "hotel" ? "Mandant ist für Hotel-Zugänge fest verdrahtet." : undefined}
              >
                <option value="all">Alle (A–Z)</option>
                {companiesAz.map((c) => (
                  <option key={c.id} value={c.id} title={c.id}>
                    {c.name}
                    {!c.is_active ? " (inaktiv)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-filter-item">
              <label className="admin-field-label">Sortierung</label>
              <select className="admin-select" value={ridesSort} onChange={(e) => setRidesSort(e.target.value)}>
                <option value="desc">Neueste zuerst</option>
                <option value="asc">Älteste zuerst</option>
              </select>
            </div>

            <div className="admin-filter-item">
              <label className="admin-field-label">Fahrer</label>
              <input
                type="text"
                className="admin-input"
                placeholder="Fahrer-Kennung"
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
              />
            </div>

            <div className="admin-filter-item">
              <label className="admin-field-label">Erstellt von</label>
              <input
                type="date"
                className="admin-input"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
              />
            </div>

            <div className="admin-filter-item">
              <label className="admin-field-label">Erstellt bis</label>
              <input
                type="date"
                className="admin-input"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
              />
            </div>

            <div className="admin-filter-item admin-filter-item--actions">
              <label className="admin-field-label">&nbsp;</label>
              <div className="admin-filter-actions">
                <button type="button" className="admin-btn-primary" onClick={() => void loadRides(true)} disabled={loading}>
                  {loading ? "Lade …" : "Aktualisieren"}
                </button>
                <button type="button" className="admin-c-btn-sec" disabled={exportBusy} onClick={() => void exportRidesCsv()}>
                  {exportBusy ? "Export …" : "CSV"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </AdminCollapsibleSection>

      {error ? <div className="admin-error-banner">{error}</div> : null}

      <AdminCollapsibleSection title="Ergebnisse" subtitle={resultsSubtitle} defaultOpen flushBody>
        <div className="admin-rides-results-toolbar">
          <span className="admin-table-toolbar__info">{PAGE_SIZE} pro Seite · Live-Aktualisierung</span>
          <div className="admin-pagination admin-pagination--inset">{renderPagination()}</div>
        </div>

        {rides.length === 0 ? (
          <div className="admin-section-block__inset">
            <div className="admin-info-banner admin-info-banner--inline">Keine Fahrten für die aktuelle Filterung.</div>
          </div>
        ) : (
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table admin-rides-table--modern">
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Fahrt-Typ</th>
                  <th>Unternehmen</th>
                  <th>Fahrzeug / Kategorie</th>
                  <th>Fahrt-ID</th>
                  <th>Kunde</th>
                  <th>Status</th>
                  <th>Abrechnung</th>
                  <th className="admin-rides-table__col-actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rides.map((ride) => {
                  const releaseAllowed = canRelease(ride);
                  const firmenLabel = ride.companyName || ride.companyId || "—";
                  const noteText = rideInternalNote(ride);
                  const hasNote = noteText.length > 0;
                  const isExpanded = expandedNoteId === ride.id;
                  const driverLabel = driverDisplayName(ride.driverName || ride.driverId);
                  const when = ride.scheduledAt || ride.createdAt;
                  const vehCat = [ride.vehicle || "—", rideKindLabel(ride.rideKind)].join(" · ");

                  return (
                    <Fragment key={ride.id}>
                      <tr className="admin-rides-table__row">
                        <td className="admin-crisp-numeric admin-rides-table__nowrap">{formatDate(when)}</td>
                        <td>{rideTripType(ride)}</td>
                        <td>
                          <div className="admin-ellipsis" title={firmenLabel}>
                            {firmenLabel}
                          </div>
                        </td>
                        <td>
                          <div className="admin-ellipsis" title={vehCat}>
                            {vehCat}
                          </div>
                        </td>
                        <td>
                          <div className="admin-ride-id-row">
                            <button
                              type="button"
                              className="admin-link-mono admin-crisp-numeric"
                              onClick={() => void loadDetail(ride.id)}
                              title="Fahrtvorschau"
                            >
                              {ride.id || "—"}
                            </button>
                            <button
                              type="button"
                              className="admin-ride-id-copy"
                              onClick={() => void copyRideId(ride.id)}
                              aria-label="Fahrt-ID kopieren"
                              title="ID kopieren"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden focusable="false">
                                <path
                                  fill="currentColor"
                                  d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="admin-ellipsis" title={ride.customerName || ""}>
                            {ride.customerName || "—"}
                          </div>
                          {driverLabel ? (
                            <div className="admin-table-sub admin-ellipsis" title={ride.driverId || ""}>
                              Fahrer: {driverLabel}
                            </div>
                          ) : (
                            <div className="admin-driver-searching">Fahrer: Suche…</div>
                          )}
                        </td>
                        <td>
                          <RideStatusPill status={ride.status} />
                          <div className="admin-table-sub">{formatMoney(ride.estimatedFare)}</div>
                        </td>
                        <td>
                          <span className={billingStatusToneClass(ride.billingStatus)}>
                            {billingStatusDe(ride.billingStatus)}
                          </span>
                        </td>
                        <td className="admin-rides-table__actions">
                          <div className="admin-rides-table__action-group">
                            <button
                              type="button"
                              className="admin-c-btn-sec admin-btn-compact"
                              onClick={() => void loadDetail(ride.id)}
                            >
                              Vorschau
                            </button>
                            {typeof onOpenRideRecord === "function" ? (
                              <button
                                type="button"
                                className="admin-c-btn-sec admin-btn-compact"
                                onClick={() => onOpenRideRecord(ride.id)}
                              >
                                Fahrtakte
                              </button>
                            ) : null}
                            {hasNote ? (
                              <button
                                type="button"
                                className="admin-note-icon-btn"
                                title="Interne Notiz"
                                aria-label="Interne Notiz"
                                onClick={() => setExpandedNoteId((prev) => (prev === ride.id ? null : ride.id))}
                              >
                                💬
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={
                                "admin-btn-action admin-btn-action--table admin-btn-compact" +
                                (!releaseAllowed || busyId === ride.id ? " admin-btn-action--disabled" : "")
                              }
                              onClick={() => releaseRide(ride.id)}
                              disabled={!releaseAllowed || busyId === ride.id}
                            >
                              {busyId === ride.id ? "…" : "Zuweisen"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="admin-rides-table__note-row">
                          <td colSpan={9}>
                            <strong>Notiz:</strong> {noteText}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="admin-rides-results-toolbar admin-rides-results-toolbar--bottom">
          <span className="admin-table-toolbar__info" />
          <div className="admin-pagination admin-pagination--inset">{renderPagination()}</div>
        </div>
      </AdminCollapsibleSection>

      {detailId ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeDetail}>
          <div
            className="admin-modal admin-modal--ride-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-ride-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal__header">
              <div className="admin-modal__title-wrap">
                <p className="admin-modal__eyebrow">Fahrtvorschau</p>
                <div className="admin-modal__title-row">
                  <h2 id="admin-ride-detail-title" className="admin-modal__title">
                    <span className="admin-ride-code-chip admin-ride-code-chip--lg">{detailId}</span>
                  </h2>
                  {detailRide ? <RideStatusPill status={detailRide.status} /> : null}
                </div>
                {detailRide ? (
                  <p className="admin-modal__lead admin-ride-preview-route">
                    {(detailRide.from || "—") + " → " + (detailRide.to || "—")}
                  </p>
                ) : null}
              </div>
              <button type="button" className="admin-modal__close" onClick={closeDetail} aria-label="Schließen">
                ×
              </button>
            </div>
            <div className="admin-modal__body">
              {detailLoading ? <p className="admin-table-sub">Lade Detail …</p> : null}
              {detailError ? <div className="admin-error-banner">{detailError}</div> : null}
              {!detailLoading && detailRide ? (
                <div className="admin-ride-preview-stack">
                  <AdminCollapsibleSection
                    title="Überblick"
                    icon="👤"
                    subtitle={`${detailRide.customerName || "—"} · ${detailRide.companyName || detailRide.companyId || "—"}`}
                    defaultOpen
                    flushBody
                    className="admin-section-block--ride"
                  >
                    <div className="admin-ride-rec-kv">
                      <div>
                        <span className="admin-ride-rec-kv__k">Kunde</span>
                        <span className="admin-ride-rec-kv__v">{detailRide.customerName || "—"}</span>
                      </div>
                      <div>
                        <span className="admin-ride-rec-kv__k">Unternehmen</span>
                        <span className={rideCodeChipClass(detailRide.companyId, "admin-ride-rec-kv__v")}>
                          {detailRide.companyName || detailRide.companyId || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="admin-ride-rec-kv__k">Status</span>
                        <span className="admin-ride-rec-kv__v">
                          <RideStatusPill status={detailRide.status} />
                        </span>
                      </div>
                      <div>
                        <span className="admin-ride-rec-kv__k">Fahrtart / Zahlung</span>
                        <span className="admin-ride-rec-kv__v">
                          {rideKindLabel(detailRide.rideKind)} · {payerKindLabel(detailRide.payerKind)}
                        </span>
                      </div>
                      <div>
                        <span className="admin-ride-rec-kv__k">Freigabe</span>
                        <span className="admin-ride-rec-kv__v">{authorizationSummary(detailRide)}</span>
                      </div>
                      <div>
                        <span className="admin-ride-rec-kv__k">Quelle</span>
                        <span className="admin-ride-rec-kv__v">{rideSourceLabel(detailRide)}</span>
                      </div>
                    </div>
                  </AdminCollapsibleSection>

                  <AdminCollapsibleSection
                    title="Route & Termin"
                    icon="📍"
                    defaultOpen={false}
                    flushBody
                    className="admin-section-block--ride"
                  >
                    <div className="admin-ride-rec-kv">
                      <div>
                        <span className="admin-ride-rec-kv__k">Abholung</span>
                        <span className="admin-ride-rec-kv__v">{detailRide.from || "—"}</span>
                      </div>
                      <div>
                        <span className="admin-ride-rec-kv__k">Ziel</span>
                        <span className="admin-ride-rec-kv__v">{detailRide.to || "—"}</span>
                      </div>
                      <div>
                        <span className="admin-ride-rec-kv__k">Erstellt</span>
                        <span className="admin-ride-rec-kv__v">{formatDate(detailRide.createdAt)}</span>
                      </div>
                      <div>
                        <span className="admin-ride-rec-kv__k">Geplant</span>
                        <span className="admin-ride-rec-kv__v">{formatDate(detailRide.scheduledAt)}</span>
                      </div>
                    </div>
                  </AdminCollapsibleSection>

                  <AdminCollapsibleSection
                    title="Fahrer & Preis"
                    icon="🚗"
                    defaultOpen={false}
                    flushBody
                    className="admin-section-block--ride"
                  >
                    <div className="admin-ride-rec-kv">
                      <div>
                        <span className="admin-ride-rec-kv__k">Fahrer</span>
                        <span className={rideCodeChipClass(detailRide.driverId, "admin-ride-rec-kv__v admin-mono")}>
                          {detailRide.driverId || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="admin-ride-rec-kv__k">Preis (geschätzt / final)</span>
                        <span className="admin-ride-rec-kv__v">
                          {formatMoney(detailRide.estimatedFare)}
                          {detailRide.finalFare != null && detailRide.finalFare !== ""
                            ? ` / ${formatMoney(detailRide.finalFare)}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  </AdminCollapsibleSection>
                </div>
              ) : null}
            </div>
            <div className="admin-modal__footer admin-modal__footer--ride">
              <button type="button" className="admin-c-btn-sec admin-btn-ride-secondary" onClick={() => void copyRideId(detailId)}>
                {previewIdCopied ? "Kopiert ✓" : "ID kopieren"}
              </button>
              <button type="button" className="admin-c-btn-sec admin-btn-ride-secondary" onClick={closeDetail}>
                Schließen
              </button>
              {typeof onOpenRideRecord === "function" && detailId ? (
                <button
                  type="button"
                  className="admin-btn-primary admin-btn-ride-primary"
                  onClick={() => {
                    onOpenRideRecord(detailId);
                    closeDetail();
                  }}
                >
                  Fahrtakte öffnen
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
