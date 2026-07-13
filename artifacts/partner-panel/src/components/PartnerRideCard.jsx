import { useState } from "react";
import {
  billingSummary,
  dispatchHeadline,
  dispatchProgressPercent,
  dispatchSteps,
  payerKindLabel,
  partnerRideShowsFare,
  rejectionCount,
  rideCardPhase,
  statusLabel,
  statusTone,
  TERMINAL_STATUSES,
} from "../lib/partnerRideOps.js";
import { formatRideFinalFare } from "../pages/finance/financeHelpers.js";

const ICON = {
  passenger: "👤",
  distance: "📍",
  schedule: "📅",
  chat: "💬",
  payment: "💳",
  dispatch: "🚖",
  fare: "💶",
  duration: "⏱",
  driver: "🚖",
};

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

function isLiveRide(ride) {
  return ride?.id && !TERMINAL_STATUSES.has(String(ride.status ?? ""));
}

function staticMapUrl(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const m = `${lat},${lon}`;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${m}&zoom=14&size=280x140&markers=${m},red`;
}

function DispatchTimeline({ ride }) {
  const steps = dispatchSteps(ride);
  const pct = dispatchProgressPercent(ride);
  return (
    <div className="partner-dispatch-timeline">
      <div className="partner-dispatch-timeline__progress" aria-hidden>
        <div className="partner-dispatch-timeline__progress-track">
          <div className="partner-dispatch-timeline__progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="partner-dispatch-timeline__progress-label">{pct}%</span>
      </div>
      <ol className="partner-dispatch-timeline__steps">
        {steps.map((step, idx) => (
          <li
            key={step.key}
            className={`partner-dispatch-timeline__item partner-dispatch-timeline__item--${step.state}${idx < steps.length - 1 ? " partner-dispatch-timeline__item--has-line" : ""}`}
          >
            <span className="partner-dispatch-timeline__dot" aria-hidden />
            <div className="partner-dispatch-timeline__copy">
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SummaryChip({ icon, label, value }) {
  return (
    <div className="partner-ride-summary-chip">
      <span className="partner-ride-summary-chip__icon" aria-hidden>
        {icon}
      </span>
      <div className="partner-ride-summary-chip__body">
        <span className="partner-ride-summary-chip__label">{label}</span>
        <span className="partner-ride-summary-chip__value">{value}</span>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   ride: Record<string, unknown>;
 *   open: boolean;
 *   onToggle: () => void;
 *   tracking: Record<string, unknown> | null | undefined;
 *   note: string;
 *   chatUnread: number;
 *   showLivePill: boolean;
 *   canCreate: boolean;
 *   actionBusy: string;
 *   onOpenChat: () => void;
 *   onOpenNote: () => void;
 *   onCancel: () => void;
 *   onRetrySearch: () => void;
 *   onRefreshTracking: () => void;
 *   onCreateInvoice: () => void;
 *   onDownloadPdf: () => void;
 *   canRetrySearch: boolean;
 *   canCancel: boolean;
 *   canArchive?: boolean;
 *   onArchive?: () => void;
 *   invoiceId: string | null;
 *   bill: ReturnType<typeof billingSummary>;
 * }} props
 */
export default function PartnerRideCard({
  ride,
  open,
  onToggle,
  tracking,
  note,
  chatUnread,
  showLivePill,
  canCreate,
  actionBusy,
  onOpenChat,
  onOpenNote,
  onCancel,
  onRetrySearch,
  onRefreshTracking,
  onCreateInvoice,
  onDownloadPdf,
  canRetrySearch,
  canCancel,
  canArchive = false,
  onArchive,
  invoiceId,
  bill,
}) {
  const tone = statusTone(ride.status);
  const phase = rideCardPhase(ride);
  const driverName = tracking?.driver?.name;
  const driverPlate = tracking?.driver?.plate;
  const driverLoc = tracking?.driver?.location;
  const rej = rejectionCount(ride);
  const dist =
    ride.distanceKm != null ? `${Number(ride.distanceKm).toFixed(1)} km` : "—";
  const dur = ride.durationMinutes != null ? `${ride.durationMinutes} Min.` : "—";

  const mapUrl =
    driverLoc && typeof driverLoc.lat === "number" && typeof driverLoc.lon === "number"
      ? staticMapUrl(driverLoc.lat, driverLoc.lon)
      : null;
  const [idCopied, setIdCopied] = useState(false);

  const copyRideId = () => {
    const id = String(ride.id ?? "").trim();
    if (!id || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(id).then(() => {
      setIdCopied(true);
      window.setTimeout(() => setIdCopied(false), 2000);
    });
  };

  return (
    <article
      className={`partner-ride-card partner-ride-card--modern partner-ride-card--glass partner-ride-card--phase-${phase} partner-ride-card--${tone}`}
    >
      <div className={`partner-ride-card__phase-bar partner-ride-card__phase-bar--${phase}`} aria-hidden />

      {showLivePill && isLiveRide(ride) ? (
        <span className="partner-ride-card__live-pill" title="Live-Aktualisierung aktiv">
          Live
        </span>
      ) : null}

      <button type="button" className="partner-ride-card__head" onClick={onToggle} aria-expanded={open}>
        <div className="partner-ride-card__head-main">
          <div className="partner-ride-card__icon-row">
            <span className="partner-ride-meta-icon">
              {ICON.passenger} {ride.customerName || "—"}
            </span>
            <span className="partner-ride-meta-icon">
              {ICON.schedule} {ride.scheduledAt ? fmtDateTime(ride.scheduledAt) : fmtDateTime(ride.createdAt)}
            </span>
            {ride.distanceKm != null ? (
              <span className="partner-ride-meta-icon">
                {ICON.distance} {dist}
              </span>
            ) : null}
          </div>
          <strong className="partner-ride-card__route">
            {ride.fromFull || ride.from || "—"} → {ride.toFull || ride.to || "—"}
          </strong>
          <span className="partner-ride-card__dispatch">
            {ICON.dispatch} {dispatchHeadline(ride)}
          </span>
          <div className="partner-ride-card__badges">
            <span className={`partner-ride-card__status partner-ride-card__status--${tone}`}>
              {statusLabel(ride.status)}
            </span>
            {ride.chatEnabled ? (
              <span className="partner-ride-card__pill partner-ride-card__pill--chat">
                {ICON.chat} Chat aktiv
                {chatUnread > 0 ? (
                  <span className="partner-ride-card__chat-badge partner-ride-card__chat-badge--inline">{chatUnread}</span>
                ) : null}
              </span>
            ) : !TERMINAL_STATUSES.has(ride.status) ? (
              <span className="partner-ride-card__pill partner-ride-card__pill--chat">{ICON.chat} Chat</span>
            ) : null}
            {!ride.driverId && ride.status === "searching_driver" ? (
              <span className="partner-ride-card__pill partner-ride-card__pill--search">Suche aktiv</span>
            ) : null}
            {rej > 0 && !ride.driverId ? (
              <span className="partner-ride-card__pill partner-ride-card__pill--warn">
                {rej} Ablehnung{rej > 1 ? "en" : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="partner-ride-card__head-side">
          {partnerRideShowsFare(ride) ? (
            <span className="partner-ride-card__fare">{formatRideFinalFare(ride)}</span>
          ) : null}
          <span className="partner-ride-card__chevron">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open ? (
        <div className="partner-ride-card__body">
          <div className="partner-ride-summary-strip">
            <SummaryChip
              icon={ICON.fare}
              label="Preis"
              value={partnerRideShowsFare(ride) ? formatRideFinalFare(ride) : "nach Abschluss"}
            />
            <SummaryChip icon={ICON.distance} label="Strecke" value={`${dist} · ${dur}`} />
            <SummaryChip
              icon={ICON.passenger}
              label="Fahrgast"
              value={ride.customerName || "—"}
            />
            <SummaryChip
              icon={ICON.driver}
              label="Fahrer"
              value={driverName ? `${driverName}${driverPlate ? ` · ${driverPlate}` : ""}` : ride.driverId ? "zugewiesen" : "offen"}
            />
            <SummaryChip
              icon={ICON.payment}
              label="Zahlung"
              value={`${payerKindLabel(ride.payerKind)} · ${ride.paymentMethod || "—"}`}
            />
          </div>

          <div className="partner-ride-ops-grid partner-ride-ops-grid--timeline">
            <section className="partner-ride-ops-panel partner-ride-ops-panel--glass">
              <h4 className="partner-ride-ops-panel__title">
                {ICON.dispatch} Disposition
              </h4>
              <DispatchTimeline ride={ride} />
            </section>
            <section className="partner-ride-ops-panel partner-ride-ops-panel--glass">
              <h4 className="partner-ride-ops-panel__title">
                {ICON.payment} Abrechnung
              </h4>
              <p className="partner-ride-billing-headline">{bill.headline}</p>
              <p className="partner-muted">{bill.detail}</p>
              {mapUrl ? (
                <div className="partner-ride-mini-map">
                  <img src={mapUrl} alt="Fahrzeugposition" loading="lazy" />
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${driverLoc.lat}&mlon=${driverLoc.lon}#map=15/${driverLoc.lat}/${driverLoc.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="partner-ride-mini-map__link"
                  >
                    Karte öffnen
                  </a>
                </div>
              ) : ride.driverId ? (
                <p className="partner-muted partner-ride-mini-map__pending">Fahrerposition wird geladen …</p>
              ) : null}
            </section>
          </div>

          <div className="partner-ride-driver-note-box">
            <p className="partner-ride-driver-note-box__title">Notiz für Fahrer</p>
            <p className="partner-ride-driver-note-box__text">{note || "—"}</p>
            {ride.chatEnabled ? (
              <p className="partner-ride-driver-note-box__hint">Chat aktiv — Notiz ist schreibgeschützt.</p>
            ) : null}
          </div>

          <div className="partner-ride-floating-actions" role="toolbar" aria-label="Fahrt-Aktionen">
            {!TERMINAL_STATUSES.has(ride.status) ? (
              <button
                type="button"
                className="partner-ride-fab partner-ride-fab--chat"
                onClick={onOpenChat}
              >
                <span aria-hidden>{ICON.chat}</span>
                Chat
                {chatUnread > 0 ? (
                  <span className="partner-ride-card__chat-badge partner-ride-card__chat-badge--inline">{chatUnread}</span>
                ) : null}
              </button>
            ) : null}
            {canCreate && !ride.chatEnabled ? (
              <button type="button" className="partner-ride-fab" onClick={onOpenNote}>
                <span aria-hidden>✏️</span>
                {note ? "Notiz" : "Notiz"}
              </button>
            ) : null}
            {canCreate && canCancel ? (
              <button
                type="button"
                className="partner-ride-fab partner-ride-fab--danger"
                disabled={Boolean(actionBusy)}
                onClick={onCancel}
              >
                <span aria-hidden>❌</span>
                Stornieren
              </button>
            ) : null}
            {canCreate && bill.canCreateInvoice ? (
              <button
                type="button"
                className="partner-ride-fab partner-ride-fab--primary"
                disabled={actionBusy === `invoice-${ride.id}`}
                onClick={onCreateInvoice}
              >
                Rechnung
              </button>
            ) : null}
            {invoiceId ? (
              <button
                type="button"
                className="partner-ride-fab"
                disabled={actionBusy === `pdf-${invoiceId}`}
                onClick={onDownloadPdf}
              >
                PDF
              </button>
            ) : null}
            {canCreate && canRetrySearch ? (
              <button
                type="button"
                className="partner-ride-fab"
                disabled={actionBusy === `retry-${ride.id}`}
                onClick={onRetrySearch}
              >
                Suche
              </button>
            ) : null}
            {canCreate && canArchive && onArchive ? (
              <button
                type="button"
                className="partner-ride-fab"
                disabled={actionBusy === `archive-${ride.id}`}
                onClick={onArchive}
              >
                <span aria-hidden>🗄</span>
                Archivieren
              </button>
            ) : null}
            <button type="button" className="partner-ride-fab partner-ride-fab--refresh" onClick={onRefreshTracking}>
              <span aria-hidden>↻</span>
              Status
            </button>
          </div>

          <div className="partner-ride-card__id-row">
            <span className="partner-ride-card__id">ID: {ride.id}</span>
            <button
              type="button"
              className={`partner-ride-card__id-copy${idCopied ? " partner-ride-card__id-copy--done" : ""}`}
              onClick={copyRideId}
              aria-label="Fahrt-ID kopieren"
              title={idCopied ? "Kopiert" : "ID kopieren"}
            >
              {idCopied ? (
                <span aria-hidden>✓</span>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden focusable="false">
                  <path
                    fill="currentColor"
                    d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
