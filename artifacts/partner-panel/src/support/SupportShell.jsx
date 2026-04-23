import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import SupportList from "./SupportList.jsx";
import SupportNewThreadModal from "./SupportNewThreadModal.jsx";
import SupportThread from "./SupportThread.jsx";

const POLL_MS = 22000;

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function SupportShell({ supportPrefill, onClearSupportPrefill }) {
  const { token } = usePanelAuth();
  const [threads, setThreads] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [threadStatus, setThreadStatus] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [modalPrefill, setModalPrefill] = useState(null);

  const loadList = useCallback(async () => {
    if (!token) return;
    setListError("");
    const res = await fetch(`${API_BASE}/panel/v1/support/threads`, { headers: authHeaders(token) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setListError(typeof data?.error === "string" ? data.error : "Liste konnte nicht geladen werden.");
      setLoadingList(false);
      return;
    }
    setThreads(Array.isArray(data.threads) ? data.threads : []);
    setLoadingList(false);
  }, [token]);

  const loadDetail = useCallback(async () => {
    if (!token || !selectedId) return;
    setDetailError("");
    const res = await fetch(`${API_BASE}/panel/v1/support/threads/${encodeURIComponent(selectedId)}`, {
      headers: authHeaders(token),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setDetailError(typeof data?.error === "string" ? data.error : "Detail nicht verfügbar.");
      setThread(null);
      setMessages([]);
      setThreadStatus(null);
      return;
    }
    setThread(data.thread || null);
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setThreadStatus(data.thread?.status ?? null);
  }, [token, selectedId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      setMessages([]);
      setThreadStatus(null);
      return;
    }
    void loadDetail();
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!token) return undefined;
    const t = window.setInterval(() => {
      void loadList();
      if (selectedId) void loadDetail();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [token, loadList, loadDetail, selectedId]);

  useEffect(() => {
    if (!supportPrefill) return;
    setModalPrefill({
      category: supportPrefill.category,
      title: supportPrefill.title ?? "",
      body: supportPrefill.body ?? "",
    });
    setModalOpen(true);
    if (typeof onClearSupportPrefill === "function") onClearSupportPrefill();
  }, [supportPrefill, onClearSupportPrefill]);

  const handleCreate = async ({ category, title, body }) => {
    if (!token) return;
    setModalBusy(true);
    setModalError("");
    const res = await fetch(`${API_BASE}/panel/v1/support/threads`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ category, title, body }),
    });
    const data = await res.json().catch(() => ({}));
    setModalBusy(false);
    if (!res.ok || !data?.ok) {
      setModalError(typeof data?.error === "string" ? data.error : "Anfrage konnte nicht angelegt werden.");
      return;
    }
    setModalOpen(false);
    setModalPrefill(null);
    await loadList();
    if (data.thread?.id) setSelectedId(data.thread.id);
  };

  const handleSend = async (body) => {
    if (!token || !selectedId) return;
    setSendBusy(true);
    setSendError("");
    const res = await fetch(`${API_BASE}/panel/v1/support/threads/${encodeURIComponent(selectedId)}/messages`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));
    setSendBusy(false);
    if (!res.ok || !data?.ok) {
      if (res.status === 409) setSendError("Diese Anfrage ist geschlossen.");
      else setSendError(typeof data?.error === "string" ? data.error : "Senden fehlgeschlagen.");
      return;
    }
    if (typeof data.threadStatus === "string") setThreadStatus(data.threadStatus);
    await loadDetail();
    await loadList();
  };

  return (
    <div className="partner-support-shell">
      <div className="partner-page-hero partner-stack">
        <div>
          <h1 className="partner-page-hero__title">Anfragen</h1>
          <p className="partner-page-hero__lead">Schreiben Sie die Plattform — Antworten erscheinen hier im Verlauf.</p>
        </div>
        {listError ? <p className="partner-support-modal__err">{listError}</p> : null}
      </div>
      <div className="partner-support-layout">
        <aside className="partner-support-sidebar">
          <button
            type="button"
            className="partner-shell__nav-btn partner-shell__nav-btn--active"
            onClick={() => {
              setModalPrefill(null);
              setModalOpen(true);
            }}
          >
            Neue Anfrage
          </button>
          <SupportList threads={threads} selectedId={selectedId} onSelect={setSelectedId} loading={loadingList} />
        </aside>
        <section className="partner-support-main partner-nested-panel">
          {detailError ? <p className="partner-support-modal__err">{detailError}</p> : null}
          <SupportThread
            thread={thread}
            messages={messages}
            onSend={handleSend}
            sendBusy={sendBusy}
            sendError={sendError}
            threadStatus={threadStatus}
          />
        </section>
      </div>
      <SupportNewThreadModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalError("");
          setModalPrefill(null);
        }}
        onSubmit={handleCreate}
        busy={modalBusy}
        error={modalError}
        initialCategory={modalPrefill?.category}
        initialTitle={modalPrefill?.title}
        initialBody={modalPrefill?.body}
      />
    </div>
  );
}
