import { useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

export default function SettingsPage() {
  const { token, user, refreshUser } = usePanelAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", newPasswordRepeat: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function onChangePassword(e) {
    e.preventDefault();
    if (!token) return;
    setMsg("");
    if (form.newPassword.length < 10) {
      setMsg("Neues Passwort muss mindestens 10 Zeichen lang sein.");
      return;
    }
    if (form.newPassword !== form.newPasswordRepeat) {
      setMsg("Neues Passwort und Wiederholung stimmen nicht überein.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/me/change-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = typeof data?.error === "string" ? data.error : "";
        setMsg(
          code === "invalid_current_password"
            ? "Aktuelles Passwort ist nicht korrekt."
            : code === "password_fields_invalid"
              ? "Passwort-Felder ungültig (min. 10 Zeichen)."
              : "Passwort konnte nicht geändert werden.",
        );
        return;
      }
      setMsg("Passwort erfolgreich geändert.");
      setForm({ currentPassword: "", newPassword: "", newPasswordRepeat: "" });
      await refreshUser();
    } catch {
      setMsg("Netzwerkfehler beim Passwort-Ändern.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel-page panel-page--profile">
      <h2 className="panel-page__title">Einstellungen</h2>
      <p className="panel-page__lead">Persönliche Sicherheitseinstellungen für Ihr Panel-Konto.</p>
      {user?.mustChangePassword ? (
        <p className="panel-page__warn">
          Für dieses Konto ist ein Startpasswort gesetzt. Bitte jetzt ein eigenes Passwort vergeben.
        </p>
      ) : null}

      <div className="panel-card panel-card--wide">
        <h3 className="panel-card__title">Passwort ändern</h3>
        <form className="panel-rides-form" onSubmit={onChangePassword}>
          <div className="panel-rides-form__grid">
            <label className="panel-rides-form__field">
              <span>Aktuelles Passwort</span>
              <input
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(ev) => setForm((f) => ({ ...f, currentPassword: ev.target.value }))}
                required
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Neues Passwort</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={form.newPassword}
                onChange={(ev) => setForm((f) => ({ ...f, newPassword: ev.target.value }))}
                required
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Neues Passwort wiederholen</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={form.newPasswordRepeat}
                onChange={(ev) => setForm((f) => ({ ...f, newPasswordRepeat: ev.target.value }))}
                required
              />
            </label>
          </div>
          {msg ? (
            <p className={msg.includes("erfolgreich") ? "panel-page__ok" : "panel-page__warn"}>{msg}</p>
          ) : null}
          <button type="submit" className="panel-btn-primary" disabled={saving}>
            {saving ? "Speichern …" : "Passwort speichern"}
          </button>
        </form>
      </div>
    </div>
  );
}
