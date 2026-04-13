import { useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

export default function SettingsPage() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
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
      const res = await fetch(`${API_BASE}/admin/auth/change-password`, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.error === "invalid_current_password") {
          setError("Aktuelles Passwort ist nicht korrekt.");
        } else if (data?.error === "session_required") {
          setError("Bitte neu einloggen, um das Passwort zu ändern.");
        } else {
          setError("Passwort konnte nicht geändert werden.");
        }
        return;
      }
      setSuccess("Passwort wurde erfolgreich geändert.");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      setError("Passwort konnte nicht geändert werden.");
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
          Dieser Zugang gilt für die Plattform-Konsole (Admin-Panel).
        </p>
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
          <button type="submit" className="admin-btn-primary" disabled={saving}>
            {saving ? "Speichern …" : "Passwort aktualisieren"}
          </button>
        </form>
      </section>
    </div>
  );
}
