import { useEffect, useState } from "react";

const CATEGORIES = [
  { id: "stammdaten", label: "Stammdaten" },
  { id: "documents", label: "Dokumente" },
  { id: "billing", label: "Abrechnung" },
  { id: "technical", label: "Technisch" },
  { id: "other", label: "Sonstiges" },
];

export default function SupportNewThreadModal({
  open,
  onClose,
  onSubmit,
  busy,
  error,
  initialCategory,
  initialTitle,
  initialBody,
}) {
  const [category, setCategory] = useState(initialCategory || "other");
  const [title, setTitle] = useState(initialTitle || "");
  const [body, setBody] = useState(initialBody || "");

  useEffect(() => {
    if (!open) return;
    setCategory(initialCategory || "other");
    setTitle(initialTitle || "");
    setBody(initialBody || "");
  }, [open, initialCategory, initialTitle, initialBody]);

  if (!open) return null;

  return (
    <div className="partner-support-modal-root" role="dialog" aria-modal="true" aria-labelledby="support-new-title">
      <button type="button" className="partner-support-modal-backdrop" onClick={onClose} aria-label="Schließen" />
      <div className="partner-support-modal">
        <h2 id="support-new-title" className="partner-support-modal__h">
          Neue Anfrage
        </h2>
        <p className="partner-muted">Ihre Nachricht geht an die Plattform. Bitte halten Sie den Text sachlich und knapp.</p>
        {error ? <p className="partner-support-modal__err">{error}</p> : null}
        <label className="partner-support-field">
          <span>Kategorie</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="partner-support-field">
          <span>Betreff</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={busy} />
        </label>
        <label className="partner-support-field">
          <span>Nachricht</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={10000} disabled={busy} />
        </label>
        <div className="partner-support-modal__actions">
          <button type="button" className="partner-shell__nav-btn" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button
            type="button"
            className="partner-shell__nav-btn partner-shell__nav-btn--active"
            disabled={busy || !title.trim() || !body.trim()}
            onClick={() => onSubmit({ category, title: title.trim(), body: body.trim() })}
          >
            {busy ? "Senden…" : "Absenden"}
          </button>
        </div>
      </div>
    </div>
  );
}
