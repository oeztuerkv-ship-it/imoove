import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";
import {
  createStripeConnectOnboardingLink,
  fetchStripeConnectStatus,
  stripeConnectErrorDe,
} from "../../lib/stripeConnectApi.js";
import { derivePayoutSummary, formatMoney, maskIban } from "./financeHelpers.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function ConnectStatusBadge({ stripeConnect }) {
  if (!stripeConnect?.stripeConfigured) {
    return <span className="partner-finance-badge partner-finance-badge--muted">Noch nicht verfügbar</span>;
  }
  if (!stripeConnect?.payoutAllowed) {
    return <span className="partner-finance-badge partner-finance-badge--warn">Auszahlung nicht freigegeben</span>;
  }
  if (stripeConnect?.onboarded) {
    return <span className="partner-finance-badge partner-finance-badge--ok">Auszahlung aktiv</span>;
  }
  if (stripeConnect?.detailsSubmitted) {
    return <span className="partner-finance-badge partner-finance-badge--warn">Prüfung läuft</span>;
  }
  return <span className="partner-finance-badge partner-finance-badge--warn">Einrichtung offen</span>;
}

/**
 * @param {{
 *   rides: Record<string, unknown>[];
 *   loading: boolean;
 *   notice?: string;
 *   onConsumeNotice?: () => void;
 * }} props
 */
export default function FinancePayoutsTab({ rides, loading, notice, onConsumeNotice }) {
  const { token, user } = usePanelAuth();
  const canManage = hasPerm(user?.permissions, "company.update");

  const [company, setCompany] = useState(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [stripeConnect, setStripeConnect] = useState(null);
  const [connectLoading, setConnectLoading] = useState(true);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectMsg, setConnectMsg] = useState("");

  const summary = derivePayoutSummary(rides);
  const iban = typeof company?.bankIban === "string" ? company.bankIban : "";

  const loadCompany = useCallback(async () => {
    if (!token) return;
    setCompanyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/company`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      setCompany(res.ok && data?.ok ? data.company ?? null : null);
    } catch {
      setCompany(null);
    } finally {
      setCompanyLoading(false);
    }
  }, [token]);

  const loadConnect = useCallback(async () => {
    if (!token || !canManage) {
      setStripeConnect(null);
      setConnectLoading(false);
      return;
    }
    setConnectLoading(true);
    setConnectMsg("");
    const result = await fetchStripeConnectStatus(token);
    if (result.ok) {
      setStripeConnect(result.stripeConnect);
    } else {
      setStripeConnect(null);
      setConnectMsg(stripeConnectErrorDe(result.error));
    }
    setConnectLoading(false);
  }, [token, canManage]);

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  useEffect(() => {
    void loadConnect();
  }, [loadConnect]);

  useEffect(() => {
    if (notice && onConsumeNotice) {
      const t = window.setTimeout(() => onConsumeNotice(), 8000);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [notice, onConsumeNotice]);

  async function onStartOnboarding() {
    if (!token || !canManage || connectBusy) return;
    setConnectBusy(true);
    setConnectMsg("");
    const result = await createStripeConnectOnboardingLink(token);
    if (result.ok) {
      window.location.href = result.url;
      return;
    }
    setConnectMsg(stripeConnectErrorDe(result.error));
    setConnectBusy(false);
  }

  const showOnboardingButton =
    canManage &&
    stripeConnect?.stripeConfigured &&
    stripeConnect?.payoutAllowed &&
    stripeConnect?.needsOnboarding;

  const showContinueButton =
    canManage &&
    stripeConnect?.stripeConfigured &&
    stripeConnect?.payoutAllowed &&
    !stripeConnect?.onboarded &&
    stripeConnect?.accountId;

  return (
    <div className="partner-stack partner-stack--tight">
      {notice ? (
        <p className="partner-state-ok" style={{ margin: 0 }} role="status">
          {notice}
        </p>
      ) : null}

      <div className="partner-card partner-card--section">
        <div className="partner-finance-section-head">
          <h2 className="partner-card__title" style={{ margin: 0 }}>
            Stripe-Auszahlung
          </h2>
          {connectLoading ? null : <ConnectStatusBadge stripeConnect={stripeConnect} />}
        </div>
        <p className="partner-muted" style={{ margin: "12px 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
          ONRODA leitet Fahrtumsätze nach abgeschlossener Kartenzahlung an Ihr Unternehmen weiter. Die Plattform-Provision
          wird automatisch einbehalten. Dafür richten Sie einmalig ein Auszahlungskonto über Stripe ein (Express).
        </p>

        {!canManage ? (
          <p className="partner-muted" style={{ margin: 0 }}>
            Nur Nutzer mit Stammdaten-Berechtigung können die Auszahlung einrichten.
          </p>
        ) : connectLoading ? (
          <p className="partner-muted">Stripe-Status wird geladen …</p>
        ) : (
          <>
            <ul className="partner-finance-dl">
              <li>
                <span className="partner-finance-dl__k">Zahlungen empfangen</span>
                <span className="partner-finance-dl__v">
                  {stripeConnect?.chargesEnabled ? "Ja" : "Nein — Einrichtung erforderlich"}
                </span>
              </li>
              <li>
                <span className="partner-finance-dl__k">Auszahlungen an Ihr Konto</span>
                <span className="partner-finance-dl__v">
                  {stripeConnect?.payoutsEnabled ? "Aktiv" : "Noch nicht aktiv"}
                </span>
              </li>
              <li>
                <span className="partner-finance-dl__k">Stripe-Konto</span>
                <span className="partner-finance-dl__v partner-finance-dl__v--mono">
                  {stripeConnect?.accountId ? stripeConnect.accountId : "Noch nicht angelegt"}
                </span>
              </li>
            </ul>

            {connectMsg ? (
              <p className="partner-state-warn" style={{ margin: "12px 0 0" }} role="alert">
                {connectMsg}
              </p>
            ) : null}

            <div className="partner-action-row" style={{ marginTop: 16 }}>
              {showOnboardingButton || showContinueButton ? (
                <button
                  type="button"
                  className="partner-btn-primary partner-btn-primary--sm"
                  disabled={connectBusy}
                  onClick={() => void onStartOnboarding()}
                >
                  {connectBusy ? "Weiterleitung …" : stripeConnect?.accountId ? "Einrichtung fortsetzen" : "Auszahlung einrichten"}
                </button>
              ) : null}
              {stripeConnect?.onboarded ? (
                <button
                  type="button"
                  className="partner-btn-secondary partner-btn-secondary--sm"
                  disabled={connectBusy}
                  onClick={() => void loadConnect()}
                >
                  Status aktualisieren
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="partner-card partner-card--section">
        <h2 className="partner-card__title" style={{ marginTop: 0 }}>
          Auszahlungsübersicht (Rechnungen)
        </h2>
        <p className="partner-muted" style={{ margin: "0 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
          Beträge aus Fahrt-Metadaten, sobald eine Rechnung erzeugt wurde. Bei Abweichungen bitte Support kontaktieren.
        </p>
        {loading ? (
          <p className="partner-muted">Laden …</p>
        ) : (
          <ul className="partner-finance-dl">
            <li>
              <span className="partner-finance-dl__k">Letzte Auszahlung (bezahlt)</span>
              <span className="partner-finance-dl__v">{summary.lastPaidDisplay}</span>
            </li>
            <li>
              <span className="partner-finance-dl__k">Ausstehende Auszahlung (Summe)</span>
              <span className="partner-finance-dl__v">{formatMoney(summary.pendingSum)}</span>
            </li>
            <li>
              <span className="partner-finance-dl__k">Auszahlungsstatus</span>
              <span className="partner-finance-dl__v">
                {summary.pendingCount > 0
                  ? `${summary.pendingCount} Position(en) mit ausstehendem Auszahlungsbetrag (Rechnung nicht bezahlt)`
                  : "Keine ausstehenden Beträge in der aktuellen Datengrundlage"}
              </span>
            </li>
          </ul>
        )}
      </div>

      <div className="partner-card partner-card--section partner-card--hint">
        <h3 className="partner-card__title">Bankverbindung (Stammdaten)</h3>
        <p className="partner-muted" style={{ margin: "0 0 8px", lineHeight: 1.5 }}>
          Zusätzlich zur Stripe-Auszahlung sollte eine gültige IBAN in den Firmendaten hinterlegt sein (Einstellungen /
          Stammdaten).
        </p>
        <p style={{ margin: 0, fontWeight: 600 }}>
          {companyLoading ? (
            <span className="partner-muted">Laden …</span>
          ) : iban ? (
            <>Hinterlegte IBAN (Auszug): {maskIban(iban)}</>
          ) : (
            <span className="partner-muted">Keine IBAN in den Firmendaten gefunden.</span>
          )}
        </p>
      </div>
    </div>
  );
}
