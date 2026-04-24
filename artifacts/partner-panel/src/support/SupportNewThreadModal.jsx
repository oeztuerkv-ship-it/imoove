import { useEffect, useState } from "react";

const CATEGORIES = [
  { id: "stammdaten", label: "Stammdaten" },
  { id: "documents", label: "Dokumente" },
  { id: "billing", label: "Abrechnung" },
  { id: "technical", label: "Technisch" },
  { id: "help", label: "Hilfe" },
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
        <h2 id="support-new-title" className="partner-support-modal__title">
          Nachricht an die Plattform
        </h2>
        <p className="partner-support-modal__intro">
          Kurz schildern, worum es geht. Unser Team antwortet im Verlauf — Sie sehen alles in diesem Bereich.
        </p>
        {error ? <p className="partner-support-modal__err">{error}</p> : null}
        <div className="partner-support-form">
          <div className="partner-support-form__field">
            <label className="partner-support-form__label" htmlFor="support-new-cat">
              Kategorie
            </label>
            <select
              id="support-new-cat"
              className="partner-support-form__input partner-support-form__input--select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={busy}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="partner-support-form__field">
            <label className="partner-support-form__label" htmlFor="support-new-subj">
              Betreff
            </label>
            <input
              id="support-new-subj"
              className="partner-support-form__input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={busy}
              placeholder="Kurzer Betreff (max. 200 Zeichen)"
            />
          </div>
          <div className="partner-support-form__field">
            <label className="partner-support-form__label" htmlFor="support-new-body">
              Ihre Nachricht
            </label>
            <textarea
              id="support-new-body"
              className="partner-support-form__input partner-support-form__textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              maxLength={10000}
              disabled={busy}
              placeholder="Beschreiben Sie Ihr Anliegen …"
            />
          </div>
        </div>
        <div className="partner-support-modal__actions">
          <button type="button" className="partner-btn-secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button
            type="button"
            className="partner-btn-primary"
            disabled={busy || !title.trim() || !body.trim()}
            onClick={() => onSubmit({ category, title: title.trim(), body: body.trim() })}
          >
            {busy ? "Wird gesendet…" : "An die Plattform senden"}
          </button>
        </div>
      </div>
    </div>
  );
}
