import { useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

export default function QuickCreatePanelUserModal({ companyId, companyName, onClose, onCreated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true);
    setErr("");
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/panel-users`, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim() || undefined,
          role: "staff",
          sendWelcomeEmail,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.error;
        if (code === "username_password_required") {
          throw new Error("Passwort mindestens 10 Zeichen — oder leer lassen für Auto-Generierung.");
        }
        throw new Error(data?.error || data?.hint || `HTTP ${res.status}`);
      }
      setResult(data);
      onCreated?.(data);
    } catch (ex) {
      setErr(ex?.message || "Anlage fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div className="admin-modal" role="dialog" aria-modal="true" onClick={(ev) => ev.stopPropagation()}>
        <div className="admin-modal__header">
          <h2 className="admin-modal__title">Partner-Zugang schnell anlegen</h2>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <form className="admin-modal__body" onSubmit={submit}>
          {companyName ? (
            <p className="admin-entity-card__meta" style={{ marginBottom: 12 }}>
              Mandant: <strong>{companyName}</strong>
            </p>
          ) : null}
          {err ? <div className="admin-error-banner">{err}</div> : null}
          {result ? (
            <div className="admin-success-banner" style={{ marginBottom: 12 }}>
              Zugang angelegt
              {result.initialPassword ? ` — Passwort: ${result.initialPassword}` : ""}
              {result.welcomeEmail?.sent ? " · Einladungs-E-Mail gesendet." : ""}
            </div>
          ) : null}
          <div className="admin-filter-item">
            <label className="admin-field-label">E-Mail *</label>
            <input
              className="admin-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </div>
          <div className="admin-filter-item">
            <label className="admin-field-label">Passwort (optional, min. 10 Zeichen)</label>
            <input
              className="admin-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              autoComplete="new-password"
              placeholder="Leer = automatisch erzeugen"
            />
          </div>
          <label className="admin-form-label" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input
              type="checkbox"
              checked={sendWelcomeEmail}
              onChange={(e) => setSendWelcomeEmail(e.target.checked)}
            />
            Einladungs-E-Mail senden
          </label>
          <div className="admin-modal__footer" style={{ marginTop: 20, display: "flex", gap: 8 }}>
            <button type="button" className="admin-btn admin-btn--secondary" onClick={onClose} disabled={saving}>
              {result ? "Schließen" : "Abbrechen"}
            </button>
            {!result ? (
              <button type="submit" className="admin-btn admin-btn--primary" disabled={saving || !email.trim()}>
                {saving ? "Speichern …" : "Zugang anlegen"}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
