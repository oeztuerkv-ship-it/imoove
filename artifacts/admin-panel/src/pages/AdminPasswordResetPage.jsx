import { useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";

const LOGIN_HREF = import.meta.env.BASE_URL.replace(/\/?$/, "") + "/";

export default function AdminPasswordResetPage() {
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
      setError("Bitte den Reset-Token aus der E-Mail einfügen.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/admin/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError("Reset-Token ist ungültig oder abgelaufen.");
        return;
      }
      setMessage("Passwort wurde erfolgreich zurückgesetzt. Sie können sich jetzt anmelden.");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Reset-Token ist ungültig oder abgelaufen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page" style={{ maxWidth: 460, margin: "40px auto" }}>
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Neues Passwort setzen</div>
        <p className="admin-table-sub" style={{ marginBottom: 14 }}>
          Geben Sie den Token aus der E-Mail ein (oder nutzen Sie den Link aus der Nachricht) und wählen Sie ein neues Passwort.
        </p>
        <form onSubmit={onSubmit} className="admin-form-vertical">
          <input
            className="admin-input"
            placeholder="Reset-Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <input
            className="admin-input"
            type="password"
            placeholder="Neues Passwort (mind. 10 Zeichen)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <input
            className="admin-input"
            type="password"
            placeholder="Neues Passwort bestätigen"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error ? <div className="admin-error-banner">{error}</div> : null}
          {message ? <div className="admin-info-banner">{message}</div> : null}
          <button type="submit" className="admin-btn-primary" disabled={busy}>
            {busy ? "Wird gespeichert …" : "Passwort speichern"}
          </button>
        </form>
        <p style={{ marginTop: 16 }}>
          <a className="admin-table-sub" href={LOGIN_HREF} style={{ color: "var(--onroda-accent-strong, #0ea5e9)" }}>
            ← Zurück zum Admin-Login
          </a>
        </p>
      </div>
    </div>
  );
}
