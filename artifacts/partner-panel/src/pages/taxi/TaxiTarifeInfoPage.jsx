import { useEffect, useState } from "react";
import { API_BASE } from "../../lib/apiBase.js";

function pricingModeDe(mode) {
  if (mode === "fixed_price") return "Fixpreis (vom System)";
  if (mode === "hybrid") return "Hybride Preislogik";
  return "Taxitarif (Schätzung / Taxameter)";
}

export default function TaxiTarifeInfoPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await fetch(`${API_BASE}/app/pricing`, { credentials: "omit" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.ok) throw new Error(j?.error || "Tarife konnten nicht geladen werden.");
        if (!cancelled) setPayload(j);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Fehler");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 48px" }}>
      <div className="partner-page-hero">
        <p className="partner-page-eyebrow">Plattform</p>
        <h1 className="partner-page-title">Preise &amp; Tarife für Ihre Fahrten</h1>
        <p className="partner-page-lead">
          Hier sehen Sie nur, welche Plattform-Preislogik für Buchungen gilt. <strong>Globale Tarife ändern Sie nicht hier</strong> — das
          bleibt der Plattform-Konsole vorbehalten. Endpreise je Fahrt setzt das System und speichert sie pro Auftrag.
        </p>
      </div>

      {loading ? <p style={{ color: "var(--partner-muted-foreground, #64748b)" }}>Laden …</p> : null}
      {err ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            color: "#B91C1C",
          }}
        >
          {err}
        </div>
      ) : null}

      {!loading && !err && payload ? (
        <div
          style={{
            padding: 20,
            borderRadius: 12,
            background: "var(--partner-surface-elevated, #fff)",
            border: "1px solid var(--partner-border, #e2e8f0)",
          }}
        >
          <p style={{ margin: "0 0 12px", fontWeight: 600 }}>Aktiver Modus</p>
          <p style={{ margin: 0, lineHeight: 1.5 }}>{pricingModeDe(payload.pricingMode)}</p>
          {payload.infoDe ? (
            <p style={{ margin: "14px 0 0", fontSize: 14, color: "var(--partner-muted-foreground, #64748b)", lineHeight: 1.55 }}>
              {payload.infoDe}
            </p>
          ) : null}
          <p style={{ margin: "16px 0 0", fontSize: 13, color: "var(--partner-muted-foreground, #64748b)", lineHeight: 1.5 }}>
            Konfiguration-Version: <code>{String(payload.version ?? "—")}</code>
            {payload.updatedAt ? (
              <>
                {" "}
                · zuletzt geändert: {new Date(payload.updatedAt).toLocaleString("de-DE")}
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
