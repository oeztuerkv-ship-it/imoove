import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const COMPANIES_URL = `${API_BASE}/admin/companies`;
const ROLES = [
  { id: "owner", label: "Inhaber" },
  { id: "manager", label: "Verwaltung" },
  { id: "staff", label: "Mitarbeiter" },
  { id: "readonly", label: "Nur lesen" },
];

function roleLabel(role) {
  const r = ROLES.find((x) => x.id === role);
  return r?.label ?? role ?? "—";
}

function usersUrl(companyId) {
  return `${COMPANIES_URL}/${encodeURIComponent(companyId)}/panel-users`;
}

export default function PanelUsersPage() {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [users, setUsers] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    email: "",
    role: "staff",
    password: "",
  });
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [createOnboarding, setCreateOnboarding] = useState(null);

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ username: "", email: "", role: "staff", isActive: true });
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState("");

  const [resetUser, setResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetErr, setResetErr] = useState("");

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    setError("");
    try {
      const res = await fetch(COMPANIES_URL, { headers: adminApiHeaders() });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(`HTTP ${res.status}`);
      setCompanies(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("Unternehmen konnten nicht geladen werden.");
      setCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!companyId) {
      setUsers([]);
      return;
    }
    setLoadingUsers(true);
    setError("");
    try {
      const res = await fetch(usersUrl(companyId), { headers: adminApiHeaders() });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 404) throw new Error("Unternehmen nicht gefunden.");
        throw new Error(`HTTP ${res.status}`);
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setError(err.message || "Zugänge konnten nicht geladen werden.");
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function submitCreate(e) {
    e.preventDefault();
    if (!companyId) return;
    setCreateSaving(true);
    setCreateErr("");
    setCreateOnboarding(null);
    try {
      const res = await fetch(usersUrl(companyId), {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(createForm),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || data?.hint || `HTTP ${res.status}`);
      }
      setCreateOnboarding(data?.onboarding ?? null);
      setShowCreate(false);
      setCreateForm({ username: "", email: "", role: "staff", password: "" });
      await loadUsers();
    } catch (err) {
      setCreateErr(err.message || "Anlegen fehlgeschlagen.");
    } finally {
      setCreateSaving(false);
    }
  }

  function openEdit(u) {
    setEditUser(u);
    setEditForm({
      username: u.username ?? "",
      email: u.email ?? "",
      role: u.role ?? "staff",
      isActive: !!u.isActive,
    });
    setEditErr("");
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!companyId || !editUser) return;
    setEditSaving(true);
    setEditErr("");
    try {
      const res = await fetch(`${usersUrl(companyId)}/${encodeURIComponent(editUser.id)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          username: editForm.username.trim(),
          email: editForm.email.trim(),
          role: editForm.role,
          isActive: editForm.isActive,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setEditUser(null);
      await loadUsers();
    } catch (err) {
      setEditErr(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setEditSaving(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    if (!companyId || !resetUser) return;
    setResetSaving(true);
    setResetErr("");
    try {
      const res = await fetch(
        `${usersUrl(companyId)}/${encodeURIComponent(resetUser.id)}/reset-password`,
        {
          method: "POST",
          headers: adminApiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ newPassword }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || data?.hint || `HTTP ${res.status}`);
      setResetUser(null);
      setNewPassword("");
    } catch (err) {
      setResetErr(err.message || "Passwort-Reset fehlgeschlagen.");
    } finally {
      setResetSaving(false);
    }
  }

  const selectedCompany = companies.find((c) => c.id === companyId);

  if (loadingCompanies && companies.length === 0) {
    return <div className="admin-info-banner">Lade Unternehmen …</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-filter-card">
        <div className="admin-filter-grid">
          <div className="admin-filter-item">
            <label className="admin-field-label">Unternehmen</label>
            <select
              className="admin-select"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">— Bitte wählen —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id} title={c.id}>
                  {c.name}
                  {c.is_active ? "" : " (inaktiv)"}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-filter-item">
            <label className="admin-field-label">&nbsp;</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="admin-btn-refresh" disabled={!companyId} onClick={() => void loadUsers()}>
                Neu laden
              </button>
              <button
                type="button"
                className="admin-page-btn"
                disabled={!companyId || !selectedCompany?.is_active}
                onClick={() => {
                  setCreateErr("");
                  setShowCreate(true);
                }}
              >
                Zugang anlegen
              </button>
            </div>
          </div>
        </div>
        {selectedCompany && !selectedCompany.is_active ? (
          <p className="admin-entity-card__meta" style={{ marginTop: 12 }}>
            Dieses Unternehmen ist inaktiv — neue Zugänge können nicht angelegt werden.
          </p>
        ) : null}
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}
      {createOnboarding?.username ? (
        <div className="admin-info-banner">
          Zugang erstellt: <strong>{createOnboarding.username}</strong>
          {createOnboarding.initialPassword ? ` / Startpasswort: ${createOnboarding.initialPassword}` : ""}. Beim ersten Login ist Passwortwechsel Pflicht.
        </div>
      ) : null}

      {!companyId ? (
        <div className="admin-info-banner">Bitte ein Unternehmen auswählen.</div>
      ) : loadingUsers ? (
        <div className="admin-info-banner">Zugänge werden geladen …</div>
      ) : users.length === 0 ? (
        <div className="admin-info-banner">Keine Zugänge für dieses Unternehmen.</div>
      ) : (
        <div className="admin-table-card">
          <div className="admin-table-scroll">
            <div className="admin-table-row admin-table-row--head admin-cs-grid admin-cs-grid--panel-users">
              <div>Benutzername</div>
              <div>E-Mail</div>
              <div>Rolle</div>
              <div>Status</div>
              <div>Aktionen</div>
            </div>
            {users.map((u) => (
              <div key={u.id} className="admin-table-row admin-cs-grid admin-cs-grid--panel-users">
                <div className="admin-mono">{u.username}</div>
                <div>{u.email || "—"}</div>
                <div>{roleLabel(u.role)}</div>
                <div>{u.isActive ? "Aktiv" : "Inaktiv"}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="admin-btn-action admin-btn-action--secondary" onClick={() => openEdit(u)}>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="admin-btn-action"
                    disabled={!u.isActive}
                    onClick={() => {
                      setResetErr("");
                      setNewPassword("");
                      setResetUser(u);
                    }}
                  >
                    Passwort setzen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreate ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => !createSaving && setShowCreate(false)}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h2 className="admin-modal__title">Partner-Zugang anlegen</h2>
              <button type="button" className="admin-modal__close" onClick={() => setShowCreate(false)} aria-label="Schließen">
                ×
              </button>
            </div>
            <form className="admin-modal__body" onSubmit={submitCreate}>
              {createErr ? <div className="admin-error-banner">{createErr}</div> : null}
              <div className="admin-filter-item">
                <label className="admin-field-label">Benutzername *</label>
                <input
                  className="admin-input"
                  value={createForm.username}
                  onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="admin-filter-item">
                <label className="admin-field-label">E-Mail</label>
                <input
                  className="admin-input"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="admin-filter-item">
                <label className="admin-field-label">Rolle</label>
                <select
                  className="admin-select"
                  value={createForm.role}
                  onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-filter-item">
                <label className="admin-field-label">Passwort (optional, min. 10 Zeichen)</label>
                <input
                  className="admin-input"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                  minLength={10}
                  autoComplete="new-password"
                  placeholder="Leer lassen = automatisch erzeugen"
                />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="submit" className="admin-btn-refresh" disabled={createSaving}>
                  {createSaving ? "…" : "Anlegen"}
                </button>
                <button type="button" className="admin-page-btn" onClick={() => setShowCreate(false)} disabled={createSaving}>
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editUser ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => !editSaving && setEditUser(null)}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h2 className="admin-modal__title">Benutzer bearbeiten</h2>
              <button type="button" className="admin-modal__close" onClick={() => setEditUser(null)} aria-label="Schließen">
                ×
              </button>
            </div>
            <form className="admin-modal__body" onSubmit={submitEdit}>
              {editErr ? <div className="admin-error-banner">{editErr}</div> : null}
              <div className="admin-filter-item">
                <label className="admin-field-label">Benutzername</label>
                <input
                  className="admin-input"
                  value={editForm.username}
                  onChange={(e) => setEditForm((p) => ({ ...p, username: e.target.value }))}
                  required
                />
              </div>
              <div className="admin-filter-item">
                <label className="admin-field-label">E-Mail</label>
                <input
                  className="admin-input"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="admin-filter-item">
                <label className="admin-field-label">Rolle</label>
                <select
                  className="admin-select"
                  value={editForm.role}
                  onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="admin-switch-row" style={{ marginTop: 12 }}>
                <span className="admin-switch-row__label">Aktiv</span>
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="submit" className="admin-btn-refresh" disabled={editSaving}>
                  {editSaving ? "…" : "Speichern"}
                </button>
                <button type="button" className="admin-page-btn" onClick={() => setEditUser(null)} disabled={editSaving}>
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {resetUser ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => !resetSaving && setResetUser(null)}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h2 className="admin-modal__title">Neues Passwort — {resetUser.username}</h2>
              <button type="button" className="admin-modal__close" onClick={() => setResetUser(null)} aria-label="Schließen">
                ×
              </button>
            </div>
            <form className="admin-modal__body" onSubmit={submitReset}>
              {resetErr ? <div className="admin-error-banner">{resetErr}</div> : null}
              <div className="admin-filter-item">
                <label className="admin-field-label">Neues Passwort (min. 10 Zeichen)</label>
                <input
                  className="admin-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="submit" className="admin-btn-refresh" disabled={resetSaving}>
                  {resetSaving ? "…" : "Passwort setzen"}
                </button>
                <button type="button" className="admin-page-btn" onClick={() => setResetUser(null)} disabled={resetSaving}>
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
