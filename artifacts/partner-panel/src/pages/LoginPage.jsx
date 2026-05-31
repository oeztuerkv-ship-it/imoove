import { useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import OnrodaMark from "../components/OnrodaMark.jsx";

export default function LoginPage() {
  const { login, error } = usePanelAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetIdentity, setResetIdentity] = useState("");
  const [showResetForm, setShowResetForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
    } finally {
      setSubmitting(false);
    }
  }

  async function onRequestPasswordReset(e) {
    e.preventDefault();
    setResetBusy(true);
    setResetMessage("");
    setResetError("");
    const identity = resetIdentity.trim();
    if (!identity) {
      setResetError("Bitte E-Mail oder Benutzername eingeben.");
      setResetBusy(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/panel-auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setResetError("Zu viele Versuche — bitte in ein paar Minuten erneut.");
        return;
      }
      if (!res.ok || data?.ok === false) {
        const msg =
          typeof data?.message === "string" && data.message.trim()
            ? data.message
            : data?.error === "panel_user_not_found"
              ? "Kein aktiver Partner-Zugang zu dieser E-Mail oder diesem Benutzernamen."
              : data?.error === "panel_user_no_email"
                ? "Zu diesem Zugang ist keine E-Mail hinterlegt — bitte Administrator kontaktieren."
                : "Anfrage fehlgeschlagen. Bitte später erneut versuchen.";
        setResetError(msg);
        return;
      }
      setResetMessage(
        typeof data?.message === "string" && data.message.trim()
          ? data.message
          : "Die E-Mail mit dem Link zum neuen Passwort wurde gesendet.",
      );
    } catch {
      setResetError("Netzwerkfehler — bitte Verbindung prüfen.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="partner-login">
      <div className="partner-login__card">
        <div className="partner-login__brand">
          <OnrodaMark className="partner-login__brand-mark" />
          <p className="partner-login__brand-subtitle">Partnerportal</p>
        </div>
        <h1 className="partner-login__title">Unternehmens-Login</h1>
        <form className="partner-login__form" onSubmit={onSubmit}>
          <label className="partner-login__label">
            E-Mail oder Benutzername
            <input
              className="partner-login__input"
              name="username"
              autoComplete="username"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="name@unternehmen.de"
              value={username}
              onChange={(ev) => setUsername(ev.target.value)}
              required
            />
          </label>
          <label className="partner-login__label">
            Passwort
            <input
              className="partner-login__input"
              name="password"
              type="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
            />
          </label>
          {error ? <p className="partner-login__error">{error}</p> : null}
          <button type="submit" className="panel-btn-primary partner-login__submit" disabled={submitting}>
            {submitting ? "Anmeldung …" : "Anmelden"}
          </button>
        </form>
        <div className="partner-login__status-form">
          {!showResetForm ? (
            <button
              type="button"
              className="partner-login__forgot-btn"
              onClick={() => {
                setShowResetForm(true);
                setResetMessage("");
                setResetError("");
                setResetIdentity(username.trim());
              }}
            >
              Passwort vergessen?
            </button>
          ) : (
            <form className="partner-login__form" onSubmit={onRequestPasswordReset}>
              <p className="partner-login__lead">
                Geben Sie die <strong>E-Mail oder den Benutzernamen</strong> Ihres Partner-Zugangs ein. Wir prüfen, ob der
                Zugang existiert, und senden bei Treffer eine E-Mail mit dem Link zum neuen Passwort.
              </p>
              <label className="partner-login__label">
                E-Mail oder Benutzername
                <input
                  className="partner-login__input"
                  name="reset-identity"
                  autoComplete="username"
                  type="text"
                  inputMode="email"
                  placeholder="name@unternehmen.de"
                  value={resetIdentity}
                  onChange={(ev) => setResetIdentity(ev.target.value)}
                  required
                />
              </label>
              {resetError ? <p className="partner-login__error">{resetError}</p> : null}
              {resetMessage ? <p className="partner-login__ok">{resetMessage}</p> : null}
              <button
                type="submit"
                className="partner-login__submit partner-login__submit-secondary"
                disabled={resetBusy}
              >
                {resetBusy ? "Wird gesendet …" : "Anweisungen per E-Mail senden"}
              </button>
              <button
                type="button"
                className="partner-login__forgot-btn"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setShowResetForm(false);
                  setResetMessage("");
                  setResetError("");
                }}
              >
                ← Zurück zum Login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
