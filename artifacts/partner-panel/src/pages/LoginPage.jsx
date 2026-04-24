import { useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";

export default function LoginPage() {
  const { login, error } = usePanelAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [showResetForm, setShowResetForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="partner-login">
      <div className="partner-login__card">
        <div className="partner-login__brand">
          <p className="partner-login__brand-name">ONRODA</p>
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
              onClick={() => setShowResetForm(true)}
            >
              Passwort vergessen?
            </button>
          ) : (
            <form className="partner-login__form" onSubmit={(ev) => ev.preventDefault()}>
              <p className="partner-login__lead">
                Gib deine E-Mail-Adresse ein. Wir senden dir einen Link zum Zurücksetzen deines Passworts.
              </p>
              <label className="partner-login__label">
                E-Mail-Adresse
                <input
                  className="partner-login__input"
                  name="reset-email"
                  autoComplete="email"
                  type="email"
                  placeholder="name@unternehmen.de"
                  value={resetEmail}
                  onChange={(ev) => setResetEmail(ev.target.value)}
                  required
                />
              </label>
              <button type="submit" className="partner-login__submit partner-login__submit-secondary">
                Reset-Link senden
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
