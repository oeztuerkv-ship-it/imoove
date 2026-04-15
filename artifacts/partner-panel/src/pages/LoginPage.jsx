import { useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";

export default function LoginPage() {
  const { login, error } = usePanelAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
        <h1 className="partner-login__title">Unternehmerportal</h1>
        <p className="partner-login__lead">
          Melde dich mit deinem Unternehmenszugang an (Benutzername <strong>oder</strong> die hinterlegte
          geschäftliche E-Mail). Passwort mindestens 10 Zeichen — bei Erstanlage oft ein temporäres Passwort vom
          Betreiber. Neue Unternehmen starten die Registrierung ausschließlich über die Homepage.
        </p>
        <form className="partner-login__form" onSubmit={onSubmit}>
          <label className="partner-login__label">
            Benutzername oder E-Mail
            <input
              className="partner-login__input"
              name="username"
              autoComplete="username"
              placeholder="z. B. max oder name@firma.de"
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
        <p className="partner-login__lead partner-login__status-form">
          Noch kein Zugang?{" "}
          <a href="https://onroda.de/partnerschaft" style={{ color: "var(--onroda-red)", fontWeight: 700 }}>
            Partnerschaft auf der Homepage anfragen
          </a>
        </p>
      </div>
    </div>
  );
}
