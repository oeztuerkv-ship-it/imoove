import { useState } from "react";

const STATUS_DE = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  answered: "Beantwortet",
  closed: "Geschlossen",
};

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function SupportThread({ thread, messages, onSend, sendBusy, sendError, threadStatus }) {
  const [draft, setDraft] = useState("");
  const st = threadStatus || thread?.status;
  const closed = st === "closed";

  if (!thread) {
    return <p className="partner-muted">Wählen Sie links eine Anfrage oder legen Sie eine neue an.</p>;
  }

  return (
    <div className="partner-support-thread">
      <header className="partner-support-thread__head">
        <h2 className="partner-support-thread__title">{thread.title}</h2>
        <p className="partner-muted">
          Status: <strong>{STATUS_DE[st] || st}</strong>
        </p>
      </header>
      <div className="partner-support-thread__messages">
        {(messages || []).map((m) => (
          <div
            key={m.id}
            className={`partner-support-bubble${m.senderType === "admin" ? " partner-support-bubble--admin" : ""}`}
          >
            <div className="partner-support-bubble__meta">
              {m.senderType === "admin" ? "Onroda" : "Ihr Unternehmen"} · {formatWhen(m.createdAt)}
            </div>
            <div className="partner-support-bubble__body">{m.body}</div>
          </div>
        ))}
      </div>
      {closed ? (
        <p className="partner-muted">Diese Anfrage ist geschlossen. Bei Bedarf legen Sie bitte eine neue Anfrage an.</p>
      ) : (
        <form
          className="partner-support-reply"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            onSend(t);
            setDraft("");
          }}
        >
          {sendError ? <p className="partner-support-modal__err">{sendError}</p> : null}
          <label className="partner-support-field">
            <span>Ihre Nachricht</span>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} maxLength={10000} disabled={sendBusy} />
          </label>
          <button type="submit" className="partner-shell__nav-btn partner-shell__nav-btn--active" disabled={sendBusy || !draft.trim()}>
            {sendBusy ? "Senden…" : "Senden"}
          </button>
        </form>
      )}
    </div>
  );
}
