import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

function can(p, key) {
  return Array.isArray(p) && p.includes(key);
}

const ROLE_OPTIONS = [
  { value: "readonly", label: "Nur lesen" },
  { value: "staff", label: "Mitarbeiter" },
  { value: "manager", label: "Manager" },
  { value: "owner", label: "Inhaber" },
];

function roleLabel(role) {
  const r = ROLE_OPTIONS.find((x) => x.value === role);
  return r ? r.label : role;
}

export default function TeamPage() {
  const { token, user } = usePanelAuth();
  const perms = user?.permissions ?? [];
  const manage = can(perms, "users.manage");
  const resetPw = can(perms, "users.reset_password");

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    username: "",
    email: "",
    role: "staff",
    password: "",
  });
  const [creating, setCreating] = useState(false);
  const [onboarding, setOnboarding] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ username: "", email: "", role: "staff" });
  const [savingEdit, setSavingEdit] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr("Liste konnte nicht geladen werden.");
        setUsers([]);
        return;
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch {
      setErr("Liste konnte nicht geladen werden.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function openEdit(u) {
    setEditId(u.id);
    setEditForm({
      username: u.username,
      email: u.email || "",
      role: u.role,
    });
    setEditOpen(true);
    setMsg("");
    setOnboarding(null);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!token || !manage || !editId) return;
    setSavingEdit(true);
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/users/${encodeURIComponent(editId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: editForm.username.trim(),
          email: editForm.email.trim(),
          role: editForm.role,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.error === "username_taken") setMsg("Benutzername ist bereits vergeben.");
        else if (data?.error === "username_invalid") setMsg("Benutzername zu kurz.");
        else if (data?.error === "forbidden_role_assignment") setMsg("Diese Rolle dürfen Sie so nicht setzen.");
        else if (data?.error === "no_changes") setMsg("Keine Änderung.");
        else setMsg("Speichern fehlgeschlagen.");
        return;
      }
      setMsg("Gespeichert.");
      setEditOpen(false);
      setEditId(null);
      await loadUsers();
    } catch {
      setMsg("Speichern fehlgeschlagen.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function onCreate(e) {
    e.preventDefault();
    if (!token || !manage) return;
    setMsg("");
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: form.username.trim(),
          email: form.email.trim(),
          role: form.role,
          password: form.password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.error === "username_taken") setMsg("Benutzername ist schon vergeben.");
        else if (data?.error === "forbidden_role_assignment") setMsg("Diese Rolle dürfen Sie so nicht vergeben.");
        else setMsg("Anlegen fehlgeschlagen.");
        return;
      }
      setMsg("Mitarbeiter angelegt.");
      setOnboarding(data?.onboarding ?? null);
      setForm({ username: "", email: "", role: "staff", password: "" });
      await loadUsers();
    } catch {
      setMsg("Anlegen fehlgeschlagen.");
    } finally {
      setCreating(false);
    }
  }

  async function deactivate(id) {
    if (!token || !manage) return;
    if (!window.confirm("Zugang sperren? Der Mitarbeiter kann sich nicht mehr anmelden.")) return;
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg(data?.error === "cannot_modify_self_here" ? "Eigenes Konto hier nicht möglich." : "Sperren fehlgeschlagen.");
        return;
      }
      setMsg("Zugang gesperrt.");
      await loadUsers();
    } catch {
      setMsg("Sperren fehlgeschlagen.");
    }
  }

  async function reactivate(id) {
    if (!token || !manage) return;
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Reaktivierung fehlgeschlagen.");
        return;
      }
      setMsg("Zugang wieder aktiv.");
      await loadUsers();
    } catch {
      setMsg("Reaktivierung fehlgeschlagen.");
    }
  }

  async function removePermanently(id) {
    if (!token || !manage) return;
    if (
      !window.confirm(
        "Eintrag endgültig löschen? Nur möglich bei gesperrtem Zugang. Protokolleinträge bleiben anonymisiert referenzierbar.",
      )
    ) {
      return;
    }
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.error === "user_must_be_inactive") {
          setMsg("Zuerst sperren, dann löschen.");
        } else {
          setMsg("Löschen fehlgeschlagen.");
        }
        return;
      }
      setMsg("Eintrag entfernt.");
      await loadUsers();
    } catch {
      setMsg("Löschen fehlgeschlagen.");
    }
  }

  async function resetPassword(id) {
    if (!token || !resetPw) return;
    const neu = window.prompt("Neues Passwort (min. 10 Zeichen):", "");
    if (neu == null) return;
    if (neu.length < 10) {
      window.alert("Passwort zu kurz.");
      return;
    }
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/users/${encodeURIComponent(id)}/reset-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword: neu }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg("Passwort-Reset fehlgeschlagen.");
        return;
      }
      setMsg("Neues Passwort gesetzt.");
    } catch {
      setMsg("Passwort-Reset fehlgeschlagen.");
    }
  }

  const editModal =
    editOpen && editId ? (
      <div className="panel-modal-backdrop" role="dialog" aria-modal="true">
        <div className="panel-modal">
          <h3 className="panel-modal__title">Mitarbeiter bearbeiten</h3>
          <form className="panel-rides-form" onSubmit={saveEdit}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field">
                <span>Benutzername</span>
                <input
                  value={editForm.username}
                  onChange={(ev) => setEditForm((f) => ({ ...f, username: ev.target.value }))}
                  required
                  autoComplete="off"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>E-Mail</span>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(ev) => setEditForm((f) => ({ ...f, email: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Rolle</span>
                <select
                  value={editForm.role}
                  onChange={(ev) => setEditForm((f) => ({ ...f, role: ev.target.value }))}
                >
                  {ROLE_OPTIONS.filter((o) => o.value !== "owner" || user?.role === "owner").map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="panel-modal__actions" style={{ marginTop: "14px" }}>
              <button type="submit" className="panel-btn-primary" disabled={savingEdit}>
                {savingEdit ? "Speichern …" : "Speichern"}
              </button>
              <button
                type="button"
                className="panel-btn-secondary"
                onClick={() => {
                  setEditOpen(false);
                  setEditId(null);
                }}
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  return (
    <div className="panel-page panel-page--team">
      {editModal}
      <h2 className="panel-page__title">Mitarbeiter</h2>
      <p className="panel-page__lead">Zugänge und Rollen für Ihr Unternehmen.</p>
      {err ? <p className="panel-page__warn">{err}</p> : null}
      {msg ? <p className={msg.includes("fehl") || msg.includes("nicht") ? "panel-page__warn" : "panel-page__ok"}>{msg}</p> : null}
      {onboarding?.username ? (
        <p className="panel-page__warn">
          Zugang erstellt: Benutzername <strong>{onboarding.username}</strong>
          {onboarding.initialPassword ? `, Startpasswort ${onboarding.initialPassword}` : ""}. Beim ersten Login muss das Passwort geändert werden.
        </p>
      ) : null}

      {manage ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Neuer Zugang</h3>
          <form className="panel-rides-form" onSubmit={onCreate}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field">
                <span>Benutzername</span>
                <input
                  value={form.username}
                  onChange={(ev) => setForm((f) => ({ ...f, username: ev.target.value }))}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="panel-rides-form__field">
                <span>E-Mail</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Rolle</span>
                <select value={form.role} onChange={(ev) => setForm((f) => ({ ...f, role: ev.target.value }))}>
                  {ROLE_OPTIONS.filter((o) => o.value !== "owner" || user?.role === "owner").map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Initiales Passwort (optional)</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(ev) => setForm((f) => ({ ...f, password: ev.target.value }))}
                  autoComplete="new-password"
                  minLength={10}
                  placeholder="Leer lassen = automatisch erzeugen"
                />
              </label>
            </div>
            <button type="submit" className="panel-btn-primary" disabled={creating}>
              {creating ? "Speichern …" : "Anlegen"}
            </button>
          </form>
        </div>
      ) : null}

      <div className="panel-card panel-card--wide panel-card--table">
        <h3 className="panel-card__title">Team</h3>
        {loading ? <p className="panel-page__lead">Lade …</p> : null}
        {!loading && users.length === 0 ? <p className="panel-page__lead">Keine Einträge.</p> : null}
        {!loading && users.length > 0 ? (
          <div className="panel-table-wrap">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Benutzer</th>
                  <th>Rolle</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.username}
                      <div className="panel-table__muted">{u.email || "—"}</div>
                    </td>
                    <td>{roleLabel(u.role)}</td>
                    <td>
                      <span className={u.isActive ? "panel-pill panel-pill--ok" : "panel-pill panel-pill--warn"}>
                        {u.isActive ? "Aktiv" : "Gesperrt"}
                      </span>
                    </td>
                    <td className="panel-table__actions">
                      {manage && u.id !== user?.id ? (
                        <>
                          <button type="button" className="panel-btn-text" onClick={() => openEdit(u)}>
                            Bearbeiten
                          </button>
                          {u.isActive ? (
                            <button type="button" className="panel-btn-text" onClick={() => void deactivate(u.id)}>
                              Sperren
                            </button>
                          ) : (
                            <button type="button" className="panel-btn-text" onClick={() => void reactivate(u.id)}>
                              Reaktivieren
                            </button>
                          )}
                          <button type="button" className="panel-btn-text" onClick={() => void removePermanently(u.id)}>
                            Löschen
                          </button>
                        </>
                      ) : null}
                      {resetPw && u.isActive && u.id !== user?.id ? (
                        <button type="button" className="panel-btn-text" onClick={() => void resetPassword(u.id)}>
                          Passwort setzen
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <p className="panel-page__lead panel-page__lead--footnote">
        Gesperrte Zugänge können reaktiviert oder nach Sperre endgültig entfernt werden. Aktive Konten zuerst sperren.
      </p>
    </div>
  );
}
