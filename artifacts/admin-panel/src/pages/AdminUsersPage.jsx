import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const EMPTY_FORM = {
  username: "",
  password: "",
  role: "admin",
};

export default function AdminUsersPage() {
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
    setCreateBusy(true);
    try {
      const res = await fetch(`${API_BASE}/admin/auth/users`, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          username: createForm.username.trim(),
          password: createForm.password,
          role: createForm.role,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.user) {
        setCreateError(data?.error === "username_taken" ? "Benutzername ist bereits vergeben." : "Admin konnte nicht angelegt werden.");
        return;
      }
      setCreateForm(EMPTY_FORM);
      await loadUsers();
    } catch {
      setCreateError("Admin konnte nicht angelegt werden.");
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

  return (
    <div className="admin-page">
      <section className="admin-panel-card">
        <h2 className="admin-panel-card__title" style={{ fontSize: "1.2rem" }}>Neuen Admin-Zugang anlegen</h2>
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
            <div className="admin-field-label">Rolle</div>
            <select
              className="admin-select"
              value={createForm.role}
              onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
            >
              <option value="admin">admin</option>
              <option value="service">service</option>
            </select>
          </div>
          <div className="admin-toolbar-row admin-toolbar-row--form-span">
            <button className="admin-btn-primary" type="submit" disabled={createBusy}>
              {createBusy ? "Anlegen …" : "Admin anlegen"}
            </button>
            {createError ? <span className="admin-error-banner" style={{ padding: "8px 12px" }}>{createError}</span> : null}
          </div>
        </form>
      </section>

      <section className="admin-panel-card">
        <div className="admin-table-toolbar">
          <div className="admin-panel-card__title" style={{ margin: 0, fontSize: "1.1rem" }}>Admin-Zugänge</div>
          <button type="button" className="admin-btn-refresh" onClick={() => void loadUsers()} disabled={loading}>
            {loading ? "Lädt …" : "Aktualisieren"}
          </button>
        </div>
        {error ? <div className="admin-error-banner">{error}</div> : null}
        <div className="admin-data-table">
          <div className="admin-data-table__head admin-cs-grid admin-cs-grid--panel-users">
            <div>Benutzer</div>
            <div>Rolle</div>
            <div>Status</div>
            <div>Geändert</div>
            <div>Aktionen</div>
          </div>
          {sortedUsers.map((user) => (
            <div key={user.id} className="admin-data-table__row admin-cs-grid admin-cs-grid--panel-users">
              <div className="admin-cell-strong">{user.username}</div>
              <div>{user.role}</div>
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
                  className="admin-btn-action"
                  onClick={() => void patchUser(user.id, { role: user.role === "admin" ? "service" : "admin" })}
                >
                  Rolle wechseln
                </button>
              </div>
            </div>
          ))}
          {!loading && sortedUsers.length === 0 ? (
            <div className="admin-info-banner">Noch keine Admin-Zugänge vorhanden.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
