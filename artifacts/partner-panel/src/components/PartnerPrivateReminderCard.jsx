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

/**
 * Private Merkliste — kein Dispatch. Optisch von echten Fahrten getrennt.
 * @param {{
 *   reminder: { id: string; scheduledAt: string; fromFull: string; toFull: string; note: string };
 *   open: boolean;
 *   onToggle: () => void;
 *   canEdit: boolean;
 *   actionBusy: string;
 *   onEdit: () => void;
 *   onDelete: () => void;
 * }} props
 */
export default function PartnerPrivateReminderCard({
  reminder,
  open,
  onToggle,
  canEdit,
  actionBusy,
  onEdit,
  onDelete,
}) {
  const busy = actionBusy === `memo-${reminder.id}`;
  return (
    <article
      className={`partner-ride-card partner-memo-card${open ? " partner-ride-card--open" : ""}`}
    >
      <button type="button" className="partner-ride-card__head" onClick={onToggle}>
        <div className="partner-ride-card__phase partner-memo-card__phase" aria-hidden />
        <div className="partner-ride-card__head-main">
          <div className="partner-ride-card__title-row">
            <span className="partner-pill partner-pill--memo">Notiz</span>
            <span className="partner-ride-card__time">{fmtDateTime(reminder.scheduledAt)}</span>
          </div>
          <p className="partner-ride-card__route">
            {(reminder.fromFull || "—").trim()} → {(reminder.toFull || "—").trim()}
          </p>
          {reminder.note?.trim() ? (
            <p className="partner-memo-card__preview partner-muted">{reminder.note.trim()}</p>
          ) : (
            <p className="partner-muted partner-memo-card__preview">Private Merknotiz (kein Auftrag)</p>
          )}
        </div>
        <span className="partner-ride-card__chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="partner-ride-card__body">
          <p className="partner-memo-card__hint">
            Nur für Ihr Unternehmen sichtbar — kein Fahrer, kein Matching, keine Abrechnung.
          </p>
          {reminder.note?.trim() ? (
            <p className="partner-memo-card__note">{reminder.note.trim()}</p>
          ) : null}
          {canEdit ? (
            <div className="partner-ride-card__actions">
              <button type="button" className="panel-btn-secondary" disabled={busy} onClick={onEdit}>
                Bearbeiten
              </button>
              <button type="button" className="panel-btn-secondary" disabled={busy} onClick={onDelete}>
                Löschen
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
