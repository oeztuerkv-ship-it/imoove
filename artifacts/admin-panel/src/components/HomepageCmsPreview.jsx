import { useCallback, useEffect, useRef, useState } from "react";

const PREVIEW_ORIGIN = "https://www.onroda.de";

export function buildHomepageCmsPreviewPayload(form, modules = {}) {
  return {
    item: form,
    modules: {
      faq: modules.faqItems ?? [],
      trust: modules.trustItems ?? [],
    },
  };
}

export default function HomepageCmsPreview({
  form,
  faqItems = [],
  trustItems = [],
  previewPath = "/",
  split = false,
}) {
  const iframeRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [lastSent, setLastSent] = useState(0);
  const previewUrl = `${PREVIEW_ORIGIN}${previewPath}${previewPath.includes("?") ? "&" : "?"}cmsPreview=1`;

  const postPreview = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!ready || !win) return;
    const payload = buildHomepageCmsPreviewPayload(form, { faqItems, trustItems });
    try {
      win.postMessage({ type: "onroda-cms-preview", payload }, PREVIEW_ORIGIN);
    } catch {
      /* ignore */
    }
    setLastSent(Date.now());
  }, [ready, form, faqItems, trustItems]);

  useEffect(() => {
    function onMessage(ev) {
      if (ev.data?.type === "onroda-cms-preview-ready") {
        setReady(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const t = window.setTimeout(() => postPreview(), split ? 400 : 0);
    return () => window.clearTimeout(t);
  }, [ready, postPreview, split]);

  return (
    <div className={`homepage-cms-preview${split ? " homepage-cms-preview--split" : ""}`}>
      <div className="homepage-cms-preview__toolbar">
        <strong>Vorschau</strong>
        <span className="admin-muted" style={{ fontSize: 12 }}>
          {ready ? "Entwurf — noch nicht gespeichert" : "Lädt Vorschau …"}
          {lastSent ? ` · aktualisiert ${new Date(lastSent).toLocaleTimeString("de-DE")}` : ""}
        </span>
        <button type="button" className="admin-btn admin-btn--secondary" onClick={() => postPreview()} disabled={!ready}>
          Vorschau aktualisieren
        </button>
        <a className="admin-btn admin-btn--secondary" href={previewUrl} target="_blank" rel="noopener noreferrer">
          In neuem Tab
        </a>
      </div>
      <iframe
        ref={iframeRef}
        className="homepage-cms-preview__frame"
        title="Homepage-Vorschau"
        src={previewUrl}
        loading="lazy"
      />
    </div>
  );
}
