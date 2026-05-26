import { useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminFetch, getAdminSessionToken, setAdminSessionToken } from "../lib/adminApiHeaders.js";
import { classifyAdminStoredToken } from "../lib/unsafeJwtPayload.js";

function messageForChangePasswordError(status, data) {
  if (data?.error === "invalid_current_password") {
    return "Aktuelles Passwort ist nicht korrekt.";
  }
  if (data?.error === "session_required") {
    const kind = data?.authKind ?? classifyAdminStoredToken(getAdminSessionToken());
    if (kind === "invalid" || !getAdminSessionToken()) {
      return "Keine gültige Admin-Sitzung. Bitte abmelden und mit Benutzername/Passwort neu anmelden.";
    }
    return (
      "Passwortänderung erfordert eine echte Anmeldesitzung (Session-JWT), nicht den statischen API-Bearer. " +
      "Bitte abmelden, Browser-Cache/LocalStorage leeren falls nötig, und erneut über Admin-Login anmelden."
    );
  }
  if (data?.error === "password_fields_invalid") {
    return "Aktuelles Passwort mindestens 8 Zeichen, neues Passwort mindestens 10 Zeichen.";
  }
  if (data?.error === "admin_auth_store_unavailable") {
    return "Passwortspeicher nicht verfügbar (Datenbank auf dem Server prüfen).";
  }
  if (status === 401) {
    return "Sitzung abgelaufen — bitte neu anmelden und erneut versuchen.";
  }
  return "Passwort konnte nicht geändert werden.";
}

export default function SettingsPage() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const storedKind = classifyAdminStoredToken(getAdminSessionToken());

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (storedKind !== "session") {
      setError(
        "Keine gültige Admin-Sitzung im Browser. Bitte abmelden und mit Benutzername/Passwort neu anmelden " +
          "(nicht mit einem eingebetteten API-Bearer aus älteren Panel-Builds).",
      );
      return;
    }
    if (form.newPassword.length < 10) {
      setError("Neues Passwort muss mindestens 10 Zeichen haben.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("Neues Passwort und Bestätigung stimmen nicht überein.");
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch(`${API_BASE}/admin/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (import.meta.env.DEV) {
          console.warn("[admin] change-password failed", res.status, data);
        }
        setError(messageForChangePasswordError(res.status, data));
        return;
      }
      if (typeof data?.token === "string" && data.token.trim()) {
        setAdminSessionToken(data.token);
      }
      setSuccess("Passwort wurde erfolgreich geändert.");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[admin] change-password network error", err);
      }
      setError("Passwort konnte nicht geändert werden (Netzwerk).");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <section className="admin-panel-card" style={{ maxWidth: 640 }}>
        <h2 className="admin-panel-card__title" style={{ fontSize: "1.2rem", marginBottom: 8 }}>
          Passwort ändern
        </h2>
        <p className="admin-table-sub" style={{ marginTop: 0, marginBottom: 16 }}>
          Dieser Zugang gilt für die Plattform-Konsole (Admin-Panel). Erfordert eine Anmeldung über
          Benutzername und Passwort — nicht den technischen API-Bearer.
        </p>
        {storedKind !== "session" ? (
          <div className="admin-error-banner" style={{ marginBottom: 16 }}>
            Im Browser ist keine gültige Admin-Sitzung gespeichert. Bitte abmelden und erneut anmelden.
          </div>
        ) : null}
        <form onSubmit={onSubmit} className="admin-form-vertical">
          <input
            className="admin-input"
            type="password"
            placeholder="Aktuelles Passwort"
            value={form.currentPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            autoComplete="current-password"
            required
          />
          <input
            className="admin-input"
            type="password"
            placeholder="Neues Passwort (mind. 10 Zeichen)"
            value={form.newPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            autoComplete="new-password"
            required
          />
          <input
            className="admin-input"
            type="password"
            placeholder="Neues Passwort bestätigen"
            value={form.confirmPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            autoComplete="new-password"
            required
          />
          {error ? <div className="admin-error-banner">{error}</div> : null}
          {success ? <div className="admin-info-banner">{success}</div> : null}
          <button type="submit" className="admin-btn-primary" disabled={saving || storedKind !== "session"}>
            {saving ? "Speichern …" : "Passwort aktualisieren"}
          </button>
        </form>
      </section>
    </div>
  );
}
