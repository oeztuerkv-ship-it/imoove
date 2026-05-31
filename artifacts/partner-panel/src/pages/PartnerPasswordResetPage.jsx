import { useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import OnrodaMark from "../components/OnrodaMark.jsx";

const LOGIN_HREF = "/";

export default function PartnerPasswordResetPage() {
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const raw = q.get("token");
    const t = typeof raw === "string" ? raw.trim() : "";
    if (t) setToken(t);
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (newPassword.length < 10) {
      setError("Neues Passwort muss mindestens 10 Zeichen haben.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwort und Bestätigung stimmen nicht überein.");
      return;
    }
    if (!token.trim()) {
      setError("Bitte den Link aus der E-Mail öffnen oder den Code aus der E-Mail einfügen.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/panel-auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError("Link ist ungültig oder abgelaufen — bitte erneut „Passwort vergessen“ anfordern.");
        return;
      }
      setMessage("Passwort gespeichert. Sie können sich jetzt im Partner-Portal anmelden.");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="partner-login">
      <div className="partner-login__card">
        <div className="partner-login__brand">
          <OnrodaMark className="partner-login__brand-mark" />
          <p className="partner-login__brand-subtitle">Partnerportal</p>
        </div>
        <h1 className="partner-login__title">Neues Passwort festlegen</h1>
        <p className="partner-login__lead">
          Öffnen Sie den Link aus der E-Mail oder fügen Sie den Code aus der Nachricht ein.
        </p>
        <form className="partner-login__form" onSubmit={onSubmit}>
          <label className="partner-login__label">
            Code aus E-Mail (falls nicht per Link geöffnet)
            <input
              className="partner-login__input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="partner-login__label">
            Neues Passwort
            <input
              className="partner-login__input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
          </label>
          <label className="partner-login__label">
            Passwort bestätigen
            <input
              className="partner-login__input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
          </label>
          {error ? <p className="partner-login__error">{error}</p> : null}
          {message ? <p className="partner-login__ok">{message}</p> : null}
          <button type="submit" className="panel-btn-primary partner-login__submit" disabled={busy}>
            {busy ? "Speichert …" : "Passwort speichern"}
          </button>
        </form>
        <p style={{ marginTop: 16, textAlign: "center" }}>
          <a href={LOGIN_HREF} className="partner-login__forgot-btn">
            ← Zurück zum Login
          </a>
        </p>
      </div>
    </div>
  );
}
