import { useState } from "react";
import { useAdminLoginRecaptcha } from "../lib/adminRecaptcha.js";
import { API_BASE } from "../lib/apiBase.js";
import { getAdminSessionToken, setAdminSessionToken } from "../lib/adminApiHeaders.js";
import { buildAdminAppHash } from "../lib/adminAppHistory.js";
import { firstAllowedAdminPage } from "../config/adminNavConfig.js";

/**
 * Admin-Login-Formular mit reCAPTCHA v3 (Token beim Submit).
 */
export default function AdminLoginForm({ onSuccess }) {
  const getRecaptchaToken = useAdminLoginRecaptcha();
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  async function onLogin(e) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      let recaptchaToken = "";
      try {
        recaptchaToken = await getRecaptchaToken();
      } catch {
        setAuthError("Sicherheitsprüfung fehlgeschlagen, bitte erneut versuchen");
        return;
      }

      const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authForm.username.trim(),
          password: authForm.password,
          recaptchaToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || typeof data?.token !== "string") {
        if (data?.error === "recaptcha_failed") {
          setAuthError(
            typeof data?.message === "string" && data.message.trim()
              ? data.message.trim()
              : "Sicherheitsprüfung fehlgeschlagen, bitte erneut versuchen",
          );
        } else if (data?.error === "invalid_credentials") {
          setAuthError("Benutzername oder Passwort falsch.");
        } else if (data?.error === "auth_bootstrap_persist_failed") {
          setAuthError("Bootstrap-Login konnte nicht in die DB übernommen werden. Bitte Server-Logs prüfen.");
        } else {
          setAuthError("Login fehlgeschlagen.");
        }
        return;
      }
      setAdminSessionToken(data.token);
      if (!getAdminSessionToken()) {
        setAuthError("Ungültiges Admin-Token — bitte erneut anmelden.");
        return;
      }
      setAuthForm({ username: "", password: "" });
      const role = data.user?.role ?? "admin";
      const hash = buildAdminAppHash({
        active: firstAllowedAdminPage(role) || "dashboard",
        companiesListTab: "all",
      });
      if (typeof onSuccess === "function") {
        onSuccess({ user: data.user ?? null, hash });
      }
    } catch {
      setAuthError("Login fehlgeschlagen.");
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <div className="admin-page" style={{ maxWidth: 460, margin: "40px auto" }}>
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Admin-Login</div>
        <form onSubmit={onLogin} className="admin-form-vertical">
          <input
            className="admin-input"
            placeholder="Benutzername"
            value={authForm.username}
            onChange={(e) => setAuthForm((p) => ({ ...p, username: e.target.value }))}
            autoComplete="username"
            required
          />
          <input
            className="admin-input"
            placeholder="Passwort"
            type="password"
            value={authForm.password}
            onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
            autoComplete="current-password"
            required
          />
          {authError ? <div className="admin-error-banner">{authError}</div> : null}
          <button type="submit" className="admin-btn-primary" disabled={authLoading}>
            {authLoading ? "Anmeldung …" : "Anmelden"}
          </button>
        </form>
        <p className="admin-muted" style={{ marginTop: 12, marginBottom: 0, fontSize: "0.85rem" }}>
          Diese Seite ist durch Google reCAPTCHA geschützt.
        </p>
      </div>
    </div>
  );
}
