import { useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

export default function RideCreatePage() {
  const { token, user } = usePanelAuth();
  const canCreate = hasPerm(user?.permissions, "rides.create");
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

  async function onCreate(e) {
    e.preventDefault();
    if (!token || !canCreate) return;
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
      setCreateMsg("Fahrt wurde angelegt. Unter „Meine Fahrten“ oder „Verlauf“ sichtbar, sobald die Liste aktualisiert ist.");
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
    } catch {
      setCreateMsg("Fahrt konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="panel-page panel-page--rides">
      <h2 className="panel-page__title">Neue Fahrt</h2>
      <p className="panel-page__lead">
        Erfassung für Ihr Unternehmen — Daten gehen an <code className="panel-inline-code">POST /api/panel/v1/rides</code>.
        Zuweisung an Fahrer erfolgt über Disposition / Fahrer-App.
      </p>

      {!canCreate ? (
        <p className="panel-page__warn">Du hast nur Leserechte — neue Fahrten kannst du hier nicht anlegen.</p>
      ) : (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Fahrt anlegen</h3>
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
                <input
                  value={form.passengerId}
                  onChange={(ev) => setForm((f) => ({ ...f, passengerId: ev.target.value }))}
                />
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
      )}
    </div>
  );
}
