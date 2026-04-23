import { useState } from "react";

const STATUS_DE = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  answered: "Beantwortet",
  closed: "Geschlossen",
};

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function SupportThread({ thread, messages, onSend, sendBusy, sendError, threadStatus }) {
  const [draft, setDraft] = useState("");
  const st = threadStatus || thread?.status;
  const closed = st === "closed";

  if (!thread) {
    return null;
  }

  return (
    <div className="partner-support-thread">
      <header className="partner-support-thread__head">
        <div>
          <h2 className="partner-support-thread__title">{thread.title}</h2>
          <p className="partner-support-thread__status">
            Status: <span>{STATUS_DE[st] || st}</span>
          </p>
        </div>
      </header>

      <div className="partner-support-thread__scroll" role="log" aria-label="Nachrichtenverlauf">
        <div className="partner-support-chat">
          {(messages || []).map((m) => {
            const isPartner = m.senderType === "partner";
            return (
              <div
                key={m.id}
                className={`partner-support-msg-row${isPartner ? " partner-support-msg-row--partner" : " partner-support-msg-row--platform"}`}
              >
                <div className={`partner-support-bubble${isPartner ? " partner-support-bubble--partner" : " partner-support-bubble--platform"}`}>
                  <div className="partner-support-bubble__label">{isPartner ? "Sie" : "Plattform"}</div>
                  <div className="partner-support-bubble__body">{m.body}</div>
                  <div className="partner-support-bubble__time">{formatTime(m.createdAt)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {closed ? (
        <p className="partner-support-thread__closed">Dieses Gespräch ist beendet. Bei neuem Thema: „Neue Anfrage“.</p>
      ) : (
        <div className="partner-support-composer">
          {sendError ? <p className="partner-support-composer__err" role="alert">{sendError}</p> : null}
          <label className="partner-support-composer__label" htmlFor="support-reply-text">
            Nachricht an die Plattform
          </label>
          <textarea
            id="support-reply-text"
            className="partner-support-composer__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={10000}
            disabled={sendBusy}
            placeholder="Nachricht schreiben …"
          />
          <div className="partner-support-composer__actions">
            <button
              type="button"
              className="partner-btn-primary partner-btn-primary--sm"
              disabled={sendBusy || !draft.trim()}
              onClick={() => {
                const t = draft.trim();
                if (!t) return;
                onSend(t);
                setDraft("");
              }}
            >
              {sendBusy ? "Wird gesendet…" : "Senden"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
