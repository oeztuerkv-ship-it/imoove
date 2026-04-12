import { useEffect, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

export default function MedicalSeriesPage() {
  const { token, user } = usePanelAuth();
  const showAccessCode = hasPanelModule(user?.panelModules, "access_codes");
  const canCreate = hasPerm(user?.permissions, "rides.create");
  const canRead = hasPerm(user?.permissions, "rides.read");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");
  const [seriesList, setSeriesList] = useState([]);
  const [listErr, setListErr] = useState("");

  const [form, setForm] = useState({
    patientReference: "",
    billingReference: "",
    validFrom: "",
    validUntil: "",
    totalRides: "5",
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
    rideKind: "medical",
    payerKind: "insurance",
    voucherCode: "",
    accessCode: "",
  });

  useEffect(() => {
    if (!token || !canRead) return;
    let cancelled = false;
    (async () => {
      setListErr("");
      try {
        const res = await fetch(`${API_BASE}/panel/v1/partner-ride-series`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setListErr("Serienliste konnte nicht geladen werden.");
          return;
        }
        setSeriesList(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) setListErr("Netzwerkfehler (Serien).");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, canRead]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!token || !canCreate) return;
    setMsg("");
    const totalRides = Number(String(form.totalRides).replace(",", "."));
    if (!form.patientReference.trim() || !form.customerName.trim()) {
      setMsg("Patientenreferenz und Anzeigename sind Pflicht.");
      return;
    }
    if (!Number.isFinite(totalRides) || totalRides < 1 || totalRides > 100) {
      setMsg("Anzahl Fahrten: 1–100.");
      return;
    }
    const distanceKm = Number(String(form.distanceKm).replace(",", "."));
    const durationMinutes = Number(String(form.durationMinutes).replace(",", "."));
    const estimatedFare = Number(String(form.estimatedFare).replace(",", "."));
    if (!form.from.trim() || !form.fromFull.trim() || !form.to.trim() || !form.toFull.trim()) {
      setMsg("Route unvollständig.");
      return;
    }
    if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMinutes) || !Number.isFinite(estimatedFare)) {
      setMsg("Preis, Dauer, Entfernung ungültig.");
      return;
    }
    setCreating(true);
    try {
      const template = {
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
      };
      const body = {
        patientReference: form.patientReference.trim(),
        totalRides: Math.floor(totalRides),
        rideKind: form.rideKind,
        payerKind: form.payerKind,
        template,
        ...(form.billingReference.trim() ? { billingReference: form.billingReference.trim() } : {}),
        ...(form.validFrom.trim() ? { validFrom: form.validFrom.trim() } : {}),
        ...(form.validUntil.trim() ? { validUntil: form.validUntil.trim() } : {}),
        ...(form.voucherCode.trim() ? { voucherCode: form.voucherCode.trim() } : {}),
        ...(form.accessCode.trim() ? { accessCode: form.accessCode.trim() } : {}),
      };
      const res = await fetch(`${API_BASE}/panel/v1/bookings/medical-series`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg(
          typeof data?.error === "string" ? `Fehler: ${data.error}` : "Serie konnte nicht angelegt werden.",
        );
        return;
      }
      setMsg(`Serie ${data.series?.id ?? ""}: ${data.rides?.length ?? totalRides} Fahrten angelegt.`);
      if (data.series && canRead) {
        setSeriesList((prev) => [data.series, ...prev.filter((s) => s.id !== data.series.id)]);
      }
      setForm((f) => ({
        ...f,
        patientReference: "",
        billingReference: "",
        customerName: "",
        from: "",
        fromFull: "",
        to: "",
        toFull: "",
        distanceKm: "",
        durationMinutes: "",
        estimatedFare: "",
        scheduledAt: "",
        voucherCode: "",
        accessCode: "",
      }));
    } catch {
      setMsg("Netzwerkfehler.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="panel-page panel-page--rides">
      <h2 className="panel-page__title">Serienfahrten (Medizin)</h2>
      <p className="panel-page__lead">
        Mehrere gleichartige Fahrten mit gemeinsamer Gültigkeit, Patientenreferenz und Abrechnungsbezug. Ein
        Freigabe-Code wird nur einmal eingelöst und allen Beinen zugeordnet.
      </p>
      {!canCreate ? (
        <p className="panel-page__warn">Keine Berechtigung zum Anlegen.</p>
      ) : (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Neue Serie</h3>
          <form className="panel-rides-form" onSubmit={onSubmit}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field">
                <span>Patienten-Referenz</span>
                <input
                  value={form.patientReference}
                  onChange={(ev) => setForm((f) => ({ ...f, patientReference: ev.target.value }))}
                  required
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Anzeigename auf der Fahrt</span>
                <input
                  value={form.customerName}
                  onChange={(ev) => setForm((f) => ({ ...f, customerName: ev.target.value }))}
                  required
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Anzahl Fahrten</span>
                <input
                  inputMode="numeric"
                  value={form.totalRides}
                  onChange={(ev) => setForm((f) => ({ ...f, totalRides: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Gültig von (optional)</span>
                <input
                  type="datetime-local"
                  value={form.validFrom}
                  onChange={(ev) => setForm((f) => ({ ...f, validFrom: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Gültig bis (optional)</span>
                <input
                  type="datetime-local"
                  value={form.validUntil}
                  onChange={(ev) => setForm((f) => ({ ...f, validUntil: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Kostenträger-Referenz</span>
                <input
                  value={form.billingReference}
                  onChange={(ev) => setForm((f) => ({ ...f, billingReference: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Fahrttyp</span>
                <select
                  value={form.rideKind}
                  onChange={(ev) => setForm((f) => ({ ...f, rideKind: ev.target.value }))}
                >
                  <option value="medical">Krankenfahrt</option>
                  <option value="standard">Normale Fahrt</option>
                </select>
              </label>
              <label className="panel-rides-form__field">
                <span>Zahler</span>
                <select
                  value={form.payerKind}
                  onChange={(ev) => setForm((f) => ({ ...f, payerKind: ev.target.value }))}
                >
                  <option value="insurance">Kostenträger (KV)</option>
                  <option value="company">Praxis / Firma</option>
                  <option value="passenger">Patient</option>
                </select>
              </label>
              <label className="panel-rides-form__field">
                <span>Gutscheincode (optional)</span>
                <input
                  value={form.voucherCode}
                  onChange={(ev) => setForm((f) => ({ ...f, voucherCode: ev.target.value }))}
                />
              </label>
              {showAccessCode ? (
                <label className="panel-rides-form__field panel-rides-form__field--2">
                  <span>Freigabe-Code (optional)</span>
                  <input
                    value={form.accessCode}
                    onChange={(ev) => setForm((f) => ({ ...f, accessCode: ev.target.value }))}
                  />
                </label>
              ) : null}
              <label className="panel-rides-form__field">
                <span>Von (Kurz)</span>
                <input value={form.from} onChange={(ev) => setForm((f) => ({ ...f, from: ev.target.value }))} />
              </label>
              <label className="panel-rides-form__field">
                <span>Von (voll)</span>
                <input
                  value={form.fromFull}
                  onChange={(ev) => setForm((f) => ({ ...f, fromFull: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Nach (Kurz)</span>
                <input value={form.to} onChange={(ev) => setForm((f) => ({ ...f, to: ev.target.value }))} />
              </label>
              <label className="panel-rides-form__field">
                <span>Nach (voll)</span>
                <input
                  value={form.toFull}
                  onChange={(ev) => setForm((f) => ({ ...f, toFull: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>km</span>
                <input
                  inputMode="decimal"
                  value={form.distanceKm}
                  onChange={(ev) => setForm((f) => ({ ...f, distanceKm: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Min.</span>
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
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Fahrzeug</span>
                <input
                  value={form.vehicle}
                  onChange={(ev) => setForm((f) => ({ ...f, vehicle: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Geplant je Fahrt (optional)</span>
                <input
                  value={form.scheduledAt}
                  onChange={(ev) => setForm((f) => ({ ...f, scheduledAt: ev.target.value }))}
                  placeholder="ISO oder leer"
                />
              </label>
            </div>
            {msg ? (
              <p className={msg.startsWith("Serie") ? "panel-page__ok" : "panel-page__warn"}>{msg}</p>
            ) : null}
            <button type="submit" className="panel-btn-primary" disabled={creating}>
              {creating ? "Anlegen …" : "Serie anlegen"}
            </button>
          </form>
        </div>
      )}

      {canRead ? (
        <div className="panel-card panel-card--wide panel-card--table" style={{ marginTop: "1.25rem" }}>
          <h3 className="panel-card__title">Angelegte Serien</h3>
          {listErr ? <p className="panel-page__warn">{listErr}</p> : null}
          {seriesList.length === 0 && !listErr ? (
            <p className="panel-page__lead">Noch keine Serien erfasst.</p>
          ) : (
            <div className="panel-table-wrap">
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Patient-Ref.</th>
                    <th>Anzahl</th>
                    <th>Gültig</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {seriesList.map((s) => (
                    <tr key={s.id}>
                      <td>{s.id}</td>
                      <td>{s.patientReference}</td>
                      <td>{s.totalRides}</td>
                      <td>
                        {s.validFrom || "—"} — {s.validUntil || "—"}
                      </td>
                      <td>{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
