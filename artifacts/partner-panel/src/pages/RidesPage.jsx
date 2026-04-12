import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

function statusLabel(de) {
  const m = {
    pending: "Offen",
    accepted: "Angenommen",
    arrived: "Vor Ort",
    in_progress: "Unterwegs",
    rejected: "Abgelehnt",
    cancelled: "Storniert",
    completed: "Abgeschlossen",
  };
  return m[de] ?? de;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

export default function RidesPage() {
  const { token, user } = usePanelAuth();
  const canCreate = hasPerm(user?.permissions, "rides.create");
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  const [form, setForm] = useState({
    customerName: "",
    from: "",
    fromFull: "",
    to: "",
    toFull: "",
    distanceKm: "",
    durationMinutes: "",
    estimatedFare: "",
    paymentMethod: "rechnung",
    vehicle: "standard",
    scheduledAt: "",
    passengerId: "",
  });

  const loadRides = useCallback(async () => {
    if (!token) return;
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/rides`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = typeof data?.error === "string" ? data.error : "";
        const hint = typeof data?.hint === "string" ? data.hint : "";
        const tail = [code && `Fehler: ${code}`, hint && `Hinweis: ${hint}`].filter(Boolean).join(" · ");
        if (res.status === 403) {
          setErr(
            tail
              ? `Keine Berechtigung, Fahrten zu sehen. ${tail}`
              : "Keine Berechtigung, Fahrten zu sehen.",
          );
        } else if (res.status === 404) {
          setErr(
            "Die Fahrten-API wurde nicht gefunden (HTTP 404). Typisch: API-Server ist noch nicht auf dem Stand mit /api/panel/v1/rides — bitte Deploy prüfen.",
          );
        } else if (res.status === 503 && code === "database_not_configured") {
          setErr("API: Datenbank nicht konfiguriert (503).");
        } else {
          setErr(
            tail
              ? `Fahrten konnten nicht geladen werden (HTTP ${res.status}). ${tail}`
              : `Fahrten konnten nicht geladen werden (HTTP ${res.status}).`,
          );
        }
        setRides([]);
        return;
      }
      setRides(Array.isArray(data.rides) ? data.rides : []);
    } catch {
      setErr("Fahrten konnten nicht geladen werden.");
      setRides([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

  const onExportCsv = useCallback(() => {
    const header = [
      "id",
      "status",
      "customerName",
      "from",
      "to",
      "estimatedFare",
      "createdAt",
      "createdByPanelUserId",
    ];
    const lines = [
      header.join(","),
      ...rides.map((r) =>
        [
          csvEscape(r.id),
          csvEscape(r.status),
          csvEscape(r.customerName),
          csvEscape(r.from),
          csvEscape(r.to),
          csvEscape(r.estimatedFare),
          csvEscape(r.createdAt),
          csvEscape(r.createdByPanelUserId ?? ""),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `onroda-fahrten-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rides]);

  async function onCreate(e) {
    e.preventDefault();
    if (!token) return;
    setCreateMsg("");
    const distanceKm = Number(String(form.distanceKm).replace(",", "."));
    const durationMinutes = Number(String(form.durationMinutes).replace(",", "."));
    const estimatedFare = Number(String(form.estimatedFare).replace(",", "."));
    if (!form.customerName.trim()) {
      setCreateMsg("Bitte Kundenname angeben.");
      return;
    }
    if (!form.from.trim() || !form.fromFull.trim() || !form.to.trim() || !form.toFull.trim()) {
      setCreateMsg("Bitte Start und Ziel vollständig ausfüllen.");
      return;
    }
    if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMinutes) || !Number.isFinite(estimatedFare)) {
      setCreateMsg("Entfernung, Dauer und Preis müssen gültige Zahlen sein.");
      return;
    }
    setCreating(true);
    try {
      const body = {
        customerName: form.customerName.trim(),
        from: form.from.trim(),
        fromFull: form.fromFull.trim(),
        to: form.to.trim(),
        toFull: form.toFull.trim(),
        distanceKm,
        durationMinutes,
        estimatedFare,
        paymentMethod: form.paymentMethod.trim() || "rechnung",
        vehicle: form.vehicle.trim() || "standard",
        ...(form.scheduledAt.trim() ? { scheduledAt: form.scheduledAt.trim() } : {}),
        ...(form.passengerId.trim() ? { passengerId: form.passengerId.trim() } : {}),
      };
      const res = await fetch(`${API_BASE}/panel/v1/rides`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = typeof data?.error === "string" ? data.error : "";
        setCreateMsg(
          res.status === 403
            ? "Keine Berechtigung, Fahrten anzulegen."
            : code === "customer_name_required"
              ? "Kundenname fehlt."
              : code === "route_fields_required"
                ? "Route unvollständig."
                : code === "pricing_or_vehicle_invalid"
                  ? "Preis oder Fahrzeugtyp ungültig."
                  : "Fahrt konnte nicht angelegt werden.",
        );
        return;
      }
      setCreateMsg("Fahrt wurde angelegt.");
      setForm((f) => ({
        ...f,
        customerName: "",
        from: "",
        fromFull: "",
        to: "",
        toFull: "",
        distanceKm: "",
        durationMinutes: "",
        estimatedFare: "",
        scheduledAt: "",
        passengerId: "",
      }));
      await loadRides();
    } catch {
      setCreateMsg("Fahrt konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  }

  /** Keine Daten und kein Ladefehler — sonst wäre „keine Fahrten“ irreführend. */
  const empty = !loading && rides.length === 0 && !err;

  const creatorHint = useMemo(
    () => (id) => {
      if (!id) return "—";
      if (user?.id && id === user.id) return "Sie";
      return id.slice(0, 8) + "…";
    },
    [user?.id],
  );

  return (
    <div className="panel-page panel-page--rides">
      <h2 className="panel-page__title">Fahrten</h2>
      <p className="panel-page__lead">
        Fahrten Ihres Unternehmens (nur Mandant aus Ihrer Anmeldung). Zuweisung an Fahrer erfolgt über die
        Disposition / Fahrer-App, nicht hier.
      </p>

      {err ? <p className="panel-page__warn">{err}</p> : null}

      <div className="panel-rides-toolbar">
        <button type="button" className="panel-btn-secondary" disabled={loading} onClick={() => void loadRides()}>
          Aktualisieren
        </button>
        <button type="button" className="panel-btn-secondary" disabled={rides.length === 0} onClick={onExportCsv}>
          CSV exportieren
        </button>
      </div>

      {canCreate ? (
      <div className="panel-card panel-card--wide">
        <h3 className="panel-card__title">Neue Fahrt anlegen</h3>
        <form className="panel-rides-form" onSubmit={onCreate}>
          <div className="panel-rides-form__grid">
            <label className="panel-rides-form__field panel-rides-form__field--2">
              <span>Kundenname</span>
              <input
                value={form.customerName}
                onChange={(ev) => setForm((f) => ({ ...f, customerName: ev.target.value }))}
                required
                autoComplete="off"
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Abholort (Kurz)</span>
              <input
                value={form.from}
                onChange={(ev) => setForm((f) => ({ ...f, from: ev.target.value }))}
                placeholder="z. B. Hauptbahnhof"
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Abholort (voll)</span>
              <input
                value={form.fromFull}
                onChange={(ev) => setForm((f) => ({ ...f, fromFull: ev.target.value }))}
                placeholder="Straße, PLZ Ort"
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Ziel (Kurz)</span>
              <input value={form.to} onChange={(ev) => setForm((f) => ({ ...f, to: ev.target.value }))} />
            </label>
            <label className="panel-rides-form__field">
              <span>Ziel (voll)</span>
              <input value={form.toFull} onChange={(ev) => setForm((f) => ({ ...f, toFull: ev.target.value }))} />
            </label>
            <label className="panel-rides-form__field">
              <span>Entfernung (km)</span>
              <input
                inputMode="decimal"
                value={form.distanceKm}
                onChange={(ev) => setForm((f) => ({ ...f, distanceKm: ev.target.value }))}
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Dauer (Min.)</span>
              <input
                inputMode="numeric"
                value={form.durationMinutes}
                onChange={(ev) => setForm((f) => ({ ...f, durationMinutes: ev.target.value }))}
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Preis (geschätzt)</span>
              <input
                inputMode="decimal"
                value={form.estimatedFare}
                onChange={(ev) => setForm((f) => ({ ...f, estimatedFare: ev.target.value }))}
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Zahlungsart</span>
              <input
                value={form.paymentMethod}
                onChange={(ev) => setForm((f) => ({ ...f, paymentMethod: ev.target.value }))}
                placeholder="rechnung, app, …"
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Fahrzeug</span>
              <input
                value={form.vehicle}
                onChange={(ev) => setForm((f) => ({ ...f, vehicle: ev.target.value }))}
                placeholder="standard, van, …"
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Geplant (optional, ISO)</span>
              <input
                value={form.scheduledAt}
                onChange={(ev) => setForm((f) => ({ ...f, scheduledAt: ev.target.value }))}
                placeholder="2026-04-15T14:00:00.000Z"
              />
            </label>
            <label className="panel-rides-form__field">
              <span>Passenger-ID (optional)</span>
              <input value={form.passengerId} onChange={(ev) => setForm((f) => ({ ...f, passengerId: ev.target.value }))} />
            </label>
          </div>
          {createMsg ? (
            <p className={createMsg.startsWith("Fahrt wurde") ? "panel-page__ok" : "panel-page__warn"}>{createMsg}</p>
          ) : null}
          <button type="submit" className="panel-btn-primary" disabled={creating}>
            {creating ? "Speichern …" : "Fahrt speichern"}
          </button>
        </form>
      </div>
      ) : (
        <p className="panel-page__lead">Du hast nur Leserechte — neue Fahrten kannst du hier nicht anlegen.</p>
      )}

      <div className="panel-card panel-card--wide panel-card--table">
        <h3 className="panel-card__title">Alle Fahrten</h3>
        {loading ? <p className="panel-page__lead">Lade …</p> : null}
        {!loading && err ? (
          <p className="panel-page__lead">Tabelle nicht geladen — siehe Hinweis oben. Nach dem Beheben auf „Aktualisieren“ klicken.</p>
        ) : null}
        {empty ? (
          <p className="panel-page__lead">Noch keine Fahrten für Ihr Unternehmen erfasst.</p>
        ) : null}
        {!loading && rides.length > 0 ? (
          <div className="panel-table-wrap">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Kunde</th>
                  <th>Route</th>
                  <th>Preis</th>
                  <th>Angelegt</th>
                  <th>Angelegt von</th>
                </tr>
              </thead>
              <tbody>
                {rides.map((r) => (
                  <tr key={r.id}>
                    <td>{statusLabel(r.status)}</td>
                    <td>{r.customerName}</td>
                    <td className="panel-table__route">
                      {r.from} → {r.to}
                    </td>
                    <td>{Number(r.estimatedFare).toFixed(2)}</td>
                    <td className="panel-table__muted">{new Date(r.createdAt).toLocaleString("de-DE")}</td>
                    <td className="panel-table__muted" title={r.createdByPanelUserId ?? ""}>
                      {r.createdByUsername || creatorHint(r.createdByPanelUserId)}
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
