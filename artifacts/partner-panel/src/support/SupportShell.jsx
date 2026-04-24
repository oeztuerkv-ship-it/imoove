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

function messageForSupportApiError(status, fallback, apiError) {
  if (status === 401 || status === 403) {
    return "Keine Berechtigung fuer Anfragen. Bitte neu anmelden oder Rechte pruefen.";
  }
  if (status === 404) {
    return "Support-API nicht gefunden (404). Erwartet wird /api/panel/v1/support/threads.";
  }
  if (status >= 500) {
    return `Serverfehler (${status}) beim Support-System. Bitte spaeter erneut versuchen.`;
  }
  if (typeof apiError === "string" && apiError.trim()) return apiError.trim();
  return fallback;
}

async function requestSupportJson(url, options, fallbackErrorText) {
  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        status: res.status,
        error: messageForSupportApiError(res.status, fallbackErrorText, data?.error),
      };
    }
    return { ok: true, status: res.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `Netzwerkfehler beim Support-System: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function EmptyInboxCTA({ onNewRequest, listLoading }) {
  return (
    <div className="partner-support-empty">
      <div className="partner-support-empty__icon" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M4 4h16v12H5.17L4 17.17V4zm0-2a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2H4zM7 9h10v2H7V9zm0-3h10v2H7V6zm0 6h7v2H7v-2z"
            fill="currentColor"
            opacity="0.88"
          />
        </svg>
      </div>
      <h2 className="partner-support-empty__title">Noch keine Anfrage</h2>
      <p className="partner-support-empty__text">Hier tauschen Sie sich mit der Plattform aus — Fragen, Rückmeldungen und Stammdaten-Anliegen laufen in einem Verlauf zusammen.</p>
      <button
        type="button"
        className="partner-btn-primary"
        onClick={onNewRequest}
        disabled={listLoading}
      >
        Neue Anfrage
      </button>
    </div>
  );
}

function SelectThreadHint() {
  return (
    <div className="partner-support-prompt">
      <p className="partner-support-prompt__text">Wählen Sie links eine Anfrage aus, um den Verlauf zu sehen, oder starten Sie eine neue Nachricht an die Plattform.</p>
    </div>
  );
}

function DetailLoading() {
  return (
    <div className="partner-support-prompt">
      <p className="partner-support-prompt__text">Verlauf wird geladen …</p>
    </div>
  );
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [modalPrefill, setModalPrefill] = useState(null);

  const openNewModal = useCallback(() => {
    setModalPrefill(null);
    setModalError("");
    setModalOpen(true);
  }, []);

  const loadList = useCallback(async () => {
    if (!token) return;
    setListError("");
    const result = await requestSupportJson(
      `${API_BASE}/panel/v1/support/threads`,
      { headers: authHeaders(token) },
      "Liste konnte nicht geladen werden.",
    );
    if (!result.ok) {
      setListError(result.error);
      setLoadingList(false);
      return;
    }
    setThreads(Array.isArray(result.data.threads) ? result.data.threads : []);
    setLoadingList(false);
  }, [token]);

  const loadDetail = useCallback(async () => {
    if (!token || !selectedId) return;
    setDetailError("");
    setDetailLoading(true);
    setThread(null);
    setMessages([]);
    setThreadStatus(null);
    const result = await requestSupportJson(
      `${API_BASE}/panel/v1/support/threads/${encodeURIComponent(selectedId)}`,
      { headers: authHeaders(token) },
      "Detail nicht verfuegbar.",
    );
    setDetailLoading(false);
    if (!result.ok) {
      setDetailError(result.error);
      return;
    }
    setThread(result.data.thread || null);
    setMessages(Array.isArray(result.data.messages) ? result.data.messages : []);
    setThreadStatus(result.data.thread?.status ?? null);
  }, [token, selectedId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      setMessages([]);
      setThreadStatus(null);
      setDetailError("");
      setDetailLoading(false);
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
    const result = await requestSupportJson(
      `${API_BASE}/panel/v1/support/threads`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ category, title, body }),
      },
      "Anfrage konnte nicht angelegt werden.",
    );
    setModalBusy(false);
    if (!result.ok) {
      setModalError(result.error);
      return;
    }
    setModalOpen(false);
    setModalPrefill(null);
    await loadList();
    if (result.data.thread?.id) setSelectedId(result.data.thread.id);
  };

  const handleSend = async (body) => {
    if (!token || !selectedId) return;
    setSendBusy(true);
    setSendError("");
    const result = await requestSupportJson(
      `${API_BASE}/panel/v1/support/threads/${encodeURIComponent(selectedId)}/messages`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ body }),
      },
      "Senden fehlgeschlagen.",
    );
    setSendBusy(false);
    if (!result.ok) {
      if (result.status === 409) setSendError("Diese Anfrage ist geschlossen.");
      else setSendError(result.error);
      return;
    }
    if (typeof result.data.threadStatus === "string") setThreadStatus(result.data.threadStatus);
    await loadDetail();
    await loadList();
  };

  const hasThreads = threads.length > 0;
  const showListEmpty = !hasThreads && !loadingList;
  const showInitialListLoading = loadingList && !hasThreads;

  return (
    <div className="partner-support-shell">
      <header className="partner-support-header">
        <div>
          <h1 className="partner-support-header__title">Plattform</h1>
          <p className="partner-support-header__lead">Ihre Anfragen und Antworten — in einem Verlauf gebündelt.</p>
        </div>
        {listError ? <p className="partner-support-header__err">{listError}</p> : null}
      </header>

      <div className="partner-support-workspace" aria-label="Zweispaltige Ansicht: Anfragen und Verlauf">
        <aside className="partner-support-col partner-support-col--list">
          <div className="partner-support-list-toolbar">
            <button type="button" className="partner-btn-primary partner-support-list-toolbar__btn" onClick={openNewModal}>
              Neue Anfrage
            </button>
            <p className="partner-support-list-toolbar__hint">Bestehende Themen erscheinen in der Liste.</p>
          </div>
          <div className="partner-support-list-wrap">
            {showListEmpty && !listError ? (
              <div className="partner-support-list-empty-sidebar">
                <p className="partner-support-list-empty-sidebar__text">Noch kein Verlauf.</p>
                <button type="button" className="partner-btn-secondary partner-btn-primary--sm" onClick={openNewModal}>
                  Erste Anfrage starten
                </button>
              </div>
            ) : (
              <SupportList
                threads={threads}
                selectedId={selectedId}
                onSelect={setSelectedId}
                loading={loadingList}
              />
            )}
          </div>
        </aside>

        <section className="partner-support-col partner-support-col--thread" aria-label="Nachrichten">
          {detailError ? <p className="partner-support-main-err">{detailError}</p> : null}
          {showInitialListLoading && !listError ? <DetailLoading /> : null}
          {showListEmpty && !listError && !selectedId && !showInitialListLoading ? (
            <EmptyInboxCTA onNewRequest={openNewModal} listLoading={loadingList} />
          ) : null}
          {hasThreads && !selectedId && !detailError && !showInitialListLoading ? <SelectThreadHint /> : null}
          {selectedId && detailLoading && !detailError ? <DetailLoading /> : null}
          {thread && !detailLoading ? (
            <SupportThread
              thread={thread}
              messages={messages}
              onSend={handleSend}
              sendBusy={sendBusy}
              sendError={sendError}
              threadStatus={threadStatus}
            />
          ) : null}
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
