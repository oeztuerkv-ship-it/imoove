import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

function can(p, key) {
  return Array.isArray(p) && p.includes(key);
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
        setErr("Mitarbeiterliste konnte nicht geladen werden.");
        setUsers([]);
        return;
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch {
      setErr("Mitarbeiterliste konnte nicht geladen werden.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

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
        else if (data?.error === "forbidden_role_assignment") setMsg("Diese Rolle darfst du so nicht vergeben.");
        else setMsg("Anlegen fehlgeschlagen.");
        return;
      }
      setMsg("Mitarbeiter wurde angelegt.");
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
    if (!window.confirm("Mitarbeiter wirklich deaktivieren?")) return;
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
        setMsg(data?.error === "cannot_modify_self_here" ? "Eigenes Konto hier nicht möglich." : "Deaktivieren fehlgeschlagen.");
        return;
      }
      setMsg("Mitarbeiter wurde deaktiviert.");
      await loadUsers();
    } catch {
      setMsg("Deaktivieren fehlgeschlagen.");
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
      setMsg("Neues Passwort wurde gesetzt.");
    } catch {
      setMsg("Passwort-Reset fehlgeschlagen.");
    }
  }

  return (
    <div className="panel-page panel-page--team">
      <h2 className="panel-page__title">Mitarbeiter</h2>
      <p className="panel-page__lead">Zugänge für dein Unternehmen — Rechte kommen aus der Rolle.</p>
      {err ? <p className="panel-page__warn">{err}</p> : null}
      {msg ? <p className={msg.includes("fehl") ? "panel-page__warn" : "panel-page__ok"}>{msg}</p> : null}

      {manage ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Neuen Mitarbeiter anlegen</h3>
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
                  <option value="readonly">readonly (nur lesen)</option>
                  <option value="staff">staff</option>
                  <option value="manager">manager</option>
                  {user?.role === "owner" ? <option value="owner">owner</option> : null}
                </select>
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Initiales Passwort</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(ev) => setForm((f) => ({ ...f, password: ev.target.value }))}
                  autoComplete="new-password"
                  required
                  minLength={10}
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
                  <th>Aktiv</th>
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
                    <td>{u.role}</td>
                    <td>{u.isActive ? "ja" : "nein"}</td>
                    <td className="panel-table__actions">
                      {manage && u.isActive && u.id !== user?.id ? (
                        <button type="button" className="panel-btn-text" onClick={() => void deactivate(u.id)}>
                          Deaktivieren
                        </button>
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
    </div>
  );
}
