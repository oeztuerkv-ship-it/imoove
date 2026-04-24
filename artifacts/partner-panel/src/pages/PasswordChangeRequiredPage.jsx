import { useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";

export default function PasswordChangeRequiredPage() {
  const { token, refreshUser, logout } = usePanelAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setOk("");
    if (!currentPassword || !newPassword) {
      setError("Bitte aktuelles und neues Passwort eingeben.");
      return;
    }
    if (newPassword.length < 10) {
      setError("Neues Passwort muss mindestens 10 Zeichen haben.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwort-Bestätigung stimmt nicht überein.");
      return;
    }
    if (!token) {
      setError("Sitzung fehlt. Bitte neu anmelden.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/me/change-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.error === "invalid_current_password") {
          setError("Aktuelles Passwort ist nicht korrekt.");
        } else if (data?.error === "password_fields_invalid") {
          setError("Neues Passwort muss mindestens 10 Zeichen haben.");
        } else {
          setError("Passwort konnte nicht geändert werden. Bitte erneut versuchen.");
        }
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOk("Passwort aktualisiert. Daten werden geladen …");
      await refreshUser();
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="partner-login">
      <div className="partner-login__card">
        <div className="partner-login__brand">
          <p className="partner-login__brand-name">ONRODA</p>
          <p className="partner-login__brand-subtitle">Partnerportal</p>
        </div>
        <h1 className="partner-login__title">Passwort aktualisieren</h1>
        <p className="partner-login__lead">
          Aus Sicherheitsgründen müssen Sie zuerst ein neues Passwort setzen, bevor Firmendaten und Dashboard
          geladen werden.
        </p>
        <form className="partner-login__form" onSubmit={onSubmit}>
          <label className="partner-login__label">
            Aktuelles Passwort
            <input
              className="partner-login__input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="partner-login__label">
            Neues Passwort (mind. 10 Zeichen)
            <input
              className="partner-login__input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={10}
              required
            />
          </label>
          <label className="partner-login__label">
            Neues Passwort wiederholen
            <input
              className="partner-login__input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={10}
              required
            />
          </label>
          {error ? <p className="partner-login__error">{error}</p> : null}
          {ok ? <p className="partner-login__ok">{ok}</p> : null}
          <button type="submit" className="panel-btn-primary partner-login__submit" disabled={busy}>
            {busy ? "Speichern …" : "Passwort speichern"}
          </button>
        </form>
        <div className="partner-login__status-form">
          <button type="button" className="partner-login__forgot-btn" onClick={() => void logout()}>
            Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}
