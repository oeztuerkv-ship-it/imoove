import { useCallback, useEffect, useState } from "react";
import {
  fetchPartnerRideChatMessages,
  formatPartnerChatTime,
  partnerChatBubbleClass,
  partnerChatSenderLabel,
  sendPartnerRideChatMessage,
} from "../lib/partnerRideChat.js";

const QUICK_REPLIES = [
  "Wir sind informiert",
  "Fahrer ist unterwegs",
  "Bitte kurz warten",
  "Kunde wurde informiert",
  "Rückfrage an die Rezeption",
];

function isRideChatWritable(ride) {
  if (!ride) return false;
  return !["completed", "cancelled", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system", "rejected", "expired"].includes(
    String(ride.status ?? ""),
  );
}

export default function PartnerRideChatModal({ token, ride, open, onClose, onRidePatch, onMarkRead }) {
  const rideId = ride?.id ?? "";
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [chatEnabled, setChatEnabled] = useState(Boolean(ride?.chatEnabled));

  const markLatestRead = useCallback(
    (messages) => {
      if (!messages?.length) return;
      const latest = messages[messages.length - 1];
      if (latest?.createdAt) onMarkRead?.(rideId, latest.createdAt);
    },
    [onMarkRead, rideId],
  );

  const loadMessages = useCallback(async () => {
    if (!token || !rideId) return;
    setErr("");
    const result = await fetchPartnerRideChatMessages(token, rideId);
    if (!result.ok) {
      setErr("Chat konnte nicht geladen werden.");
      return;
    }
    setItems(result.items);
    setChatEnabled(result.chatEnabled);
    if (open) markLatestRead(result.items);
  }, [markLatestRead, open, rideId, token]);

  useEffect(() => {
    if (!open) return;
    setDraft("");
    void loadMessages();
    const timer = setInterval(() => void loadMessages(), 10_000);
    return () => clearInterval(timer);
  }, [loadMessages, open]);

  useEffect(() => {
    setChatEnabled(Boolean(ride?.chatEnabled));
  }, [ride?.chatEnabled, rideId]);

  const canWrite = isRideChatWritable(ride);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || !token || !rideId || busy || !canWrite) return;
    setBusy(true);
    setErr("");
    const result = await sendPartnerRideChatMessage(token, rideId, text);
    if (!result.ok) {
      setErr(
        result.error === "chat_not_enabled"
          ? "Chat konnte nicht gestartet werden — bitte Seite aktualisieren."
          : "Nachricht konnte nicht gesendet werden.",
      );
      setBusy(false);
      return;
    }
    setItems((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const merged = seen.has(result.message.id) ? prev : [...prev, result.message];
      markLatestRead(merged);
      return merged;
    });
    setDraft("");
    onRidePatch?.({ ...ride, chatEnabled: true });
    setBusy(false);
  };

  if (!open || !rideId) return null;

  return (
    <div
      className="partner-ride-note-modal partner-ride-chat-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-ride-chat-title"
      onClick={onClose}
    >
      <div className="panel-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="panel-dialog__header">
          <div>
            <p className="panel-dialog__eyebrow">Fahrt-Chat</p>
            <h3 id="partner-ride-chat-title" className="panel-dialog__title panel-inline-code">
              {rideId}
            </h3>
            <p className="panel-dialog__lead">
              {chatEnabled
                ? "Live-Fahrt-Chat mit Fahrer und Kunde — Schnellantworten wie im Messenger."
                : canWrite
                  ? "Schreiben Sie die erste Nachricht — der Chat startet für diese Fahrt."
                  : "Chat ist für diese Fahrt beendet."}
            </p>
          </div>
          <button type="button" className="panel-dialog__close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>

        <div className="panel-dialog__body">
          {err ? <p className="panel-page__warn">{err}</p> : null}

          <div className="partner-ride-chat-thread" aria-live="polite">
            {items.length === 0 ? (
              <p className="partner-ride-chat-empty">Noch keine Nachrichten.</p>
            ) : (
              items.map((m) => (
                <div key={m.id} className={`partner-ride-chat-bubble ${partnerChatBubbleClass(m.senderKind)}`}>
                  {m.senderKind !== "partner" ? (
                    <span className="partner-ride-chat-bubble__meta">{partnerChatSenderLabel(m.senderKind)}</span>
                  ) : null}
                  <div className="partner-ride-chat-bubble__body-row">
                    <p className="partner-ride-chat-bubble__text">{m.body}</p>
                    <span className="partner-ride-chat-bubble__time">{formatPartnerChatTime(m.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="partner-ride-chat-quick">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                type="button"
                className="panel-btn-secondary partner-ride-chat-quick__chip"
                disabled={!canWrite || busy}
                onClick={() => setDraft(q)}
              >
                {q}
              </button>
            ))}
          </div>

          <textarea
            className="partner-booking-note partner-ride-chat-input"
            value={draft}
            rows={3}
            maxLength={1000}
            disabled={!canWrite || busy}
            placeholder={canWrite ? "Nachricht an Fahrer und Kunde …" : "Chat beendet"}
            onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
          />
        </div>

        <div className="panel-dialog__footer">
          <button type="button" className="panel-btn-secondary" onClick={onClose}>
            Schließen
          </button>
          <button
            type="button"
            className="panel-btn-primary"
            disabled={!canWrite || busy || !draft.trim()}
            onClick={() => void onSend()}
          >
            Senden
          </button>
        </div>
      </div>
    </div>
  );
}
