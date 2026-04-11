import { useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";

export default function PartnerLoginPage() {
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
        <h1 className="partner-login__title">Partner-Anmeldung</h1>
        <p className="partner-login__lead">
          Melde dich mit deinem Unternehmenszugang an. Die Daten werden über die API aus der
          Datenbank geladen.
        </p>
        <form className="partner-login__form" onSubmit={onSubmit}>
          <label className="partner-login__label">
            Benutzername
            <input
              className="partner-login__input"
              name="username"
              autoComplete="username"
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
          <button type="submit" className="admin-btn-primary partner-login__submit" disabled={submitting}>
            {submitting ? "Anmeldung …" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}
