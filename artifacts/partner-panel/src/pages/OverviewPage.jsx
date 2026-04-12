import { useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

export default function OverviewPage() {
  const { user, token } = usePanelAuth();
  const [company, setCompany] = useState(null);
  const [companyErr, setCompanyErr] = useState("");
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      setCompanyErr("");
      try {
        const res = await fetch(`${API_BASE}/panel/v1/company`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setCompanyErr("Firmendaten konnten nicht geladen werden.");
          setCompany(null);
          return;
        }
        setCompany(data.company ?? null);
      } catch {
        if (!cancelled) setCompanyErr("Firmendaten konnten nicht geladen werden.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onChangePassword(e) {
    e.preventDefault();
    if (!token || !hasPerm(user?.permissions, "self.change_password")) return;
    setPwMsg("");
    setPwBusy(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/me/change-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword: pwCur, newPassword: pwNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.error === "invalid_current_password") setPwMsg("Aktuelles Passwort ist falsch.");
        else setPwMsg("Passwort konnte nicht geändert werden.");
        return;
      }
      setPwMsg("Passwort wurde geändert.");
      setPwCur("");
      setPwNew("");
    } catch {
      setPwMsg("Passwort konnte nicht geändert werden.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="panel-page panel-page--overview">
      <h2 className="panel-page__title">Übersicht</h2>
      <p className="panel-page__lead">
        Angemeldet als <strong>{user?.username}</strong>
        {user?.companyName ? (
          <>
            {" "}
            · <strong>{user.companyName}</strong>
          </>
        ) : null}
        .
      </p>
      {companyErr ? <p className="panel-page__warn">{companyErr}</p> : null}
      <div className="panel-card panel-card--hint">
        <h3 className="panel-card__title">Einstieg</h3>
        <ul className="panel-hint-list">
          <li>
            Unter <strong>Fahrten</strong> siehst du alle Aufträge deines Unternehmens inkl. <strong>Angelegt von</strong>{" "}
            (Mitarbeiter im Panel).
          </li>
          <li>
            Unter <strong>Mitarbeiter</strong> verwaltest du Zugänge (je nach Rolle: anlegen, deaktivieren, Passwort
            setzen).
          </li>
          <li>Firmendaten sind derzeit <strong>nur lesend</strong>; Änderungen laufen über den Onroda-Support.</li>
        </ul>
      </div>

      {hasPerm(user?.permissions, "self.change_password") ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Eigenes Passwort ändern</h3>
          <form className="panel-rides-form" onSubmit={onChangePassword}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field">
                <span>Aktuelles Passwort</span>
                <input
                  type="password"
                  value={pwCur}
                  onChange={(ev) => setPwCur(ev.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Neues Passwort (min. 10 Zeichen)</span>
                <input
                  type="password"
                  value={pwNew}
                  onChange={(ev) => setPwNew(ev.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={10}
                />
              </label>
            </div>
            {pwMsg ? (
              <p className={pwMsg.includes("geändert") ? "panel-page__ok" : "panel-page__warn"}>{pwMsg}</p>
            ) : null}
            <button type="submit" className="panel-btn-primary" disabled={pwBusy}>
              {pwBusy ? "Speichern …" : "Passwort speichern"}
            </button>
          </form>
        </div>
      ) : null}

      {company ? (
        <div className="panel-card">
          <h3 className="panel-card__title">Firma (API)</h3>
          <p className="panel-card__row">
            <span className="panel-card__k">Name</span> {company.name}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">E-Mail</span> {company.email || "—"}
          </p>
          <p className="panel-card__row">
            <span className="panel-card__k">Telefon</span> {company.phone || "—"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
