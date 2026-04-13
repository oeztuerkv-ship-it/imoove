import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const ROLE_OPTIONS = [
  { value: "hotel", label: "Hotel" },
  { value: "insurance", label: "Krankenkasse" },
  { value: "admin", label: "Plattform-Admin" },
  { value: "service", label: "Service / Disposition" },
  { value: "taxi", label: "Taxi / Flotte" },
].sort((a, b) => a.label.localeCompare(b.label, "de", { sensitivity: "base" }));

const EMPTY_FORM = {
  username: "",
  password: "",
  role: "admin",
  scopeCompanyId: "",
};

export default function AdminUsersPage({ sessionUsername = "" }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username, "de", { sensitivity: "base" })),
    [users],
  );

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/admin/auth/users`, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !Array.isArray(data.users)) {
        setError("Admin-Zugänge konnten nicht geladen werden.");
        return;
      }
      setUsers(data.users);
    } catch {
      setError("Admin-Zugänge konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function onCreateUser(e) {
    e.preventDefault();
    setCreateError("");
    if (!createForm.username.trim() || createForm.password.length < 10) {
      setCreateError("Benutzername und Passwort (mind. 10 Zeichen) sind erforderlich.");
      return;
    }
    if (createForm.role === "hotel" && !createForm.scopeCompanyId.trim()) {
      setCreateError("Hotel-Zugänge benötigen eine Mandanten-ID (Unternehmens-ID).");
      return;
    }
    setCreateBusy(true);
    try {
      const res = await fetch(`${API_BASE}/admin/auth/users`, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          username: createForm.username.trim(),
          password: createForm.password,
          role: createForm.role,
          scopeCompanyId: createForm.scopeCompanyId.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.user) {
        if (data?.error === "scope_company_id_required_for_hotel") {
          setCreateError("Hotel-Zugänge benötigen eine Mandanten-ID.");
        } else {
          setCreateError(data?.error === "username_taken" ? "Benutzername ist bereits vergeben." : "Zugang konnte nicht angelegt werden.");
        }
        return;
      }
      setCreateForm(EMPTY_FORM);
      await loadUsers();
    } catch {
      setCreateError("Zugang konnte nicht angelegt werden.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function patchUser(id, patch) {
    const res = await fetch(`${API_BASE}/admin/auth/users/${id}`, {
      method: "PATCH",
      headers: adminApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.user) {
      throw new Error(data?.error || "update_failed");
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
  }

  async function deleteUser(user) {
    const ok = window.confirm(
      `Admin-Zugang „${user.username}“ dauerhaft löschen?\n\n` +
        "Dieser Vorgang kann nicht rückgängig gemacht werden. Aktive Sitzungen verlieren die Gültigkeit.",
    );
    if (!ok) return;
    setError("");
    try {
      const res = await fetch(`${API_BASE}/admin/auth/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: adminApiHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && data?.error === "cannot_delete_self") {
        setError("Sie können Ihren eigenen Zugang nicht löschen.");
        return;
      }
      if (res.status === 400 && data?.error === "last_active_admin") {
        setError("Der letzte aktive Admin-Zugang kann nicht gelöscht werden.");
        return;
      }
      if (!res.ok || !data?.ok) {
        setError(data?.error === "not_found" ? "Zugang nicht gefunden." : "Löschen fehlgeschlagen.");
        return;
      }
      await loadUsers();
    } catch {
      setError("Löschen fehlgeschlagen.");
    }
  }

  return (
    <div className="admin-page">
      <section className="admin-panel-card">
        <h2 className="admin-panel-card__title" style={{ fontSize: "1.2rem" }}>Neuen Konsole-Zugang anlegen</h2>
        <form className="admin-form-grid" onSubmit={onCreateUser}>
          <div>
            <div className="admin-field-label">Benutzername</div>
            <input
              className="admin-input"
              value={createForm.username}
              onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))}
              required
            />
          </div>
          <div>
            <div className="admin-field-label">Passwort</div>
            <input
              className="admin-input"
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="mind. 10 Zeichen"
              required
            />
          </div>
          <div>
            <div className="admin-field-label">Rolle (A–Z)</div>
            <select
              className="admin-select"
              value={createForm.role}
              onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="admin-field-label">Mandanten-ID (Hotel)</div>
            <input
              className="admin-input"
              value={createForm.scopeCompanyId}
              onChange={(e) => setCreateForm((p) => ({ ...p, scopeCompanyId: e.target.value }))}
              placeholder="z. B. co-demo-1 — Pflicht für Rolle Hotel"
            />
          </div>
          <div className="admin-toolbar-row admin-toolbar-row--form-span">
            <button className="admin-btn-primary" type="submit" disabled={createBusy}>
              {createBusy ? "Anlegen …" : "Zugang anlegen"}
            </button>
            {createError ? <span className="admin-error-banner" style={{ padding: "8px 12px" }}>{createError}</span> : null}
          </div>
        </form>
      </section>

      <section className="admin-panel-card">
        <div className="admin-table-toolbar">
          <div className="admin-panel-card__title" style={{ margin: 0, fontSize: "1.1rem" }}>Konsole-Zugänge</div>
          <button type="button" className="admin-btn-refresh" onClick={() => void loadUsers()} disabled={loading}>
            {loading ? "Lädt …" : "Aktualisieren"}
          </button>
        </div>
        {error ? <div className="admin-error-banner">{error}</div> : null}
        <div className="admin-data-table">
          <div className="admin-data-table__head admin-cs-grid admin-cs-grid--admin-auth-users">
            <div>Benutzer</div>
            <div>Rolle</div>
            <div>Mandant</div>
            <div>Status</div>
            <div>Geändert</div>
            <div>Aktionen</div>
          </div>
          {sortedUsers.map((user) => (
            <div key={user.id} className="admin-data-table__row admin-cs-grid admin-cs-grid--admin-auth-users">
              <div className="admin-cell-strong">{user.username}</div>
              <div>
                <select
                  className="admin-select"
                  value={user.role}
                  onChange={(e) => {
                    const next = e.target.value;
                    void patchUser(user.id, { role: next }).catch(() => setError("Rolle konnte nicht gespeichert werden."));
                  }}
                  aria-label={`Rolle für ${user.username}`}
                >
                  {!ROLE_OPTIONS.some((o) => o.value === user.role) ? (
                    <option value={user.role}>{user.role} (Legacy)</option>
                  ) : null}
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <input
                  key={`${user.id}-${user.scopeCompanyId ?? ""}`}
                  className="admin-input"
                  style={{ width: "100%", maxWidth: "100%" }}
                  defaultValue={user.scopeCompanyId ?? ""}
                  placeholder="co-…"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    const next = v || null;
                    const prev = user.scopeCompanyId?.trim() || null;
                    if (next === prev) return;
                    void patchUser(user.id, { scopeCompanyId: next }).catch(() =>
                      setError("Mandanten-ID konnte nicht gespeichert werden."),
                    );
                  }}
                  aria-label={`Mandanten-ID für ${user.username}`}
                />
              </div>
              <div>{user.isActive ? "Aktiv" : "Deaktiviert"}</div>
              <div className="admin-table-sub">
                {user.updatedAt ? new Date(user.updatedAt).toLocaleString("de-DE") : "—"}
              </div>
              <div className="admin-actions-cell admin-actions-cell--row">
                <button
                  type="button"
                  className="admin-btn-action"
                  onClick={() => void patchUser(user.id, { isActive: !user.isActive })}
                >
                  {user.isActive ? "Deaktivieren" : "Aktivieren"}
                </button>
                <button
                  type="button"
                  className="admin-btn-danger"
                  disabled={user.username === sessionUsername}
                  title={
                    user.username === sessionUsername
                      ? "Eigenen Zugang nicht löschbar"
                      : "Zugang dauerhaft entfernen"
                  }
                  onClick={() => void deleteUser(user)}
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
          {!loading && sortedUsers.length === 0 ? (
            <div className="admin-info-banner">Noch keine Zugänge vorhanden.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
