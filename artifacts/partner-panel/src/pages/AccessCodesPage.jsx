import { useCallback, useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

const CODE_TYPES = [
  { value: "general", label: "Allgemein (Fahrcode)" },
  { value: "hotel", label: "Hotel" },
  { value: "company", label: "Firma / Auftraggeber" },
  { value: "voucher", label: "Gutschein (Kostenübernahme)" },
];

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function typeLabel(t) {
  const row = CODE_TYPES.find((x) => x.value === t);
  return row ? row.label : t ?? "—";
}

export default function AccessCodesPage() {
  const { token, user } = usePanelAuth();
  const canManage = hasPerm(user?.permissions, "access_codes.manage");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [formMsg, setFormMsg] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({
    code: "",
    codeType: "general",
    label: "",
    maxUses: "",
    validFrom: "",
    validUntil: "",
  });

  const load = useCallback(async () => {
    if (!token) return;
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/access-codes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr("Freigabe-Codes konnten nicht geladen werden.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setErr("Freigabe-Codes konnten nicht geladen werden.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e) {
    e.preventDefault();
    if (!token || !canManage) return;
    setFormMsg("");
    const maxUsesRaw = String(form.maxUses).trim();
    const maxUses =
      maxUsesRaw === "" ? undefined : Number(maxUsesRaw.replace(",", "."));
    if (maxUsesRaw !== "" && (!Number.isFinite(maxUses) || maxUses < 1)) {
      setFormMsg("Max. Nutzungen: leer (unbegrenzt) oder positive Zahl.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/panel/v1/access-codes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: form.code.trim(),
          codeType: form.codeType,
          label: form.label.trim() || undefined,
          maxUses,
          validFrom: form.validFrom.trim() || undefined,
          validUntil: form.validUntil.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.error === "code_duplicate") setFormMsg("Dieser Code existiert bereits.");
        else if (data?.error === "code_required") setFormMsg("Bitte einen Code eingeben.");
        else if (data?.error === "code_type_invalid") setFormMsg("Ungültiger Typ.");
        else setFormMsg("Code konnte nicht angelegt werden.");
        return;
      }
      setForm({
        code: "",
        codeType: "general",
        label: "",
        maxUses: "",
        validFrom: "",
        validUntil: "",
      });
      setFormMsg(
        "Code wurde angelegt. In der Liste erscheint die normalisierte Form (Großbuchstaben, ohne Leerzeichen) — so wird er bei der Buchung erwartet.",
      );
      await load();
    } catch {
      setFormMsg("Code konnte nicht angelegt werden.");
    }
  }

  async function toggleActive(row, nextActive) {
    if (!token || !canManage) return;
    setBusyId(row.id);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/access-codes/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr("Status konnte nicht geändert werden.");
        return;
      }
      await load();
    } catch {
      setErr("Status konnte nicht geändert werden.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel-page panel-page--access-codes">
      <h2 className="panel-page__title">Meine Freigabe-Codes</h2>
      <p className="panel-page__lead">
        Codes für die <strong>digitale Kostenübernahme</strong> in Ihrem Unternehmen. Buchungen mit Code erscheinen in{" "}
        <strong>Meine Fahrten</strong> inkl. Nachvollziehbarkeit (Einlösung, Regel-Stand). Nur Ihr Mandant — keine
        fremden Codes.
      </p>

      {err ? <p className="panel-page__warn">{err}</p> : null}

      {canManage ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Neuen Code anlegen</h3>
          <form className="panel-rides-form" onSubmit={onCreate}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field">
                <span>Code (Klartext)</span>
                <input
                  value={form.code}
                  onChange={(ev) => setForm((f) => ({ ...f, code: ev.target.value }))}
                  autoComplete="off"
                  required
                  placeholder="z. B. HOTEL-GAST-2026"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Typ</span>
                <select
                  value={form.codeType}
                  onChange={(ev) => setForm((f) => ({ ...f, codeType: ev.target.value }))}
                >
                  {CODE_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="panel-rides-form__field">
                <span>Anzeigename (für Fahrer)</span>
                <input
                  value={form.label}
                  onChange={(ev) => setForm((f) => ({ ...f, label: ev.target.value }))}
                  placeholder="optional"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Max. Nutzungen</span>
                <input
                  value={form.maxUses}
                  onChange={(ev) => setForm((f) => ({ ...f, maxUses: ev.target.value }))}
                  placeholder="leer = unbegrenzt"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Gültig ab (ISO, optional)</span>
                <input
                  value={form.validFrom}
                  onChange={(ev) => setForm((f) => ({ ...f, validFrom: ev.target.value }))}
                  placeholder="2026-01-01T00:00:00.000Z"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Gültig bis (ISO, optional)</span>
                <input
                  value={form.validUntil}
                  onChange={(ev) => setForm((f) => ({ ...f, validUntil: ev.target.value }))}
                />
              </label>
            </div>
            {formMsg ? (
              <p className={formMsg.includes("angelegt") ? "panel-page__ok" : "panel-page__warn"}>{formMsg}</p>
            ) : null}
            <button type="submit" className="panel-btn-primary">
              Code speichern
            </button>
          </form>
        </div>
      ) : (
        <p className="panel-page__lead">
          Nur <strong>Inhaber</strong> und <strong>Manager</strong> dürfen Codes anlegen oder deaktivieren. Sie können
          die Liste einsehen.
        </p>
      )}

      <div className="panel-rides-toolbar">
        <button type="button" className="panel-btn-secondary" disabled={loading} onClick={() => void load()}>
          Aktualisieren
        </button>
      </div>

      <div className="panel-card panel-card--wide panel-card--table">
        <h3 className="panel-card__title">Ihre Codes</h3>
        {loading ? <p className="panel-page__lead">Lade …</p> : null}
        {!loading && items.length === 0 ? (
          <p className="panel-page__lead">Noch keine Codes für Ihr Unternehmen angelegt.</p>
        ) : null}
        {!loading && items.length > 0 ? (
          <div className="panel-table-wrap">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Normalisiert</th>
                  <th>Typ</th>
                  <th>Anzeigename</th>
                  <th>Nutzungen</th>
                  <th>Gültig</th>
                  <th>Status</th>
                  {canManage ? <th>Aktion</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className="panel-table__muted" title="Intern gespeichert (Großbuchstaben, ohne Leerzeichen)">
                      {row.codeNormalized}
                    </td>
                    <td>{typeLabel(row.codeType)}</td>
                    <td>{row.label || "—"}</td>
                    <td className="panel-table__muted">
                      {row.maxUses != null ? `${row.usesCount} / ${row.maxUses}` : `${row.usesCount} / ∞`}
                    </td>
                    <td className="panel-table__muted">
                      {row.validFrom || "—"} → {row.validUntil || "—"}
                    </td>
                    <td>{row.isActive ? "Aktiv" : "Deaktiviert"}</td>
                    {canManage ? (
                      <td>
                        <button
                          type="button"
                          className="panel-btn-secondary"
                          disabled={busyId === row.id}
                          onClick={() => void toggleActive(row, !row.isActive)}
                        >
                          {row.isActive ? "Deaktivieren" : "Aktivieren"}
                        </button>
                      </td>
                    ) : null}
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
