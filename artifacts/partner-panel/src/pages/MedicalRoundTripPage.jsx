import { useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

const emptyLeg = () => ({
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
});

export default function MedicalRoundTripPage() {
  const { token, user } = usePanelAuth();
  const showAccessCode = hasPanelModule(user?.panelModules, "access_codes");
  const canCreate = hasPerm(user?.permissions, "rides.create");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    customerName: "",
    patientReference: "",
    billingReference: "",
    rideKind: "medical",
    payerKind: "insurance",
    voucherCode: "",
    accessCode: "",
    outbound: emptyLeg(),
    return: emptyLeg(),
  });

  function setLeg(which, key, value) {
    setForm((f) => ({
      ...f,
      [which]: { ...f[which], [key]: value },
    }));
  }

  function parseLeg(leg, label) {
    const distanceKm = Number(String(leg.distanceKm).replace(",", "."));
    const durationMinutes = Number(String(leg.durationMinutes).replace(",", "."));
    const estimatedFare = Number(String(leg.estimatedFare).replace(",", "."));
    if (!leg.from.trim() || !leg.fromFull.trim() || !leg.to.trim() || !leg.toFull.trim()) {
      return { error: `${label}: Route unvollständig.` };
    }
    if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMinutes) || !Number.isFinite(estimatedFare)) {
      return { error: `${label}: Preis/Dauer/Entfernung ungültig.` };
    }
    return {
      from: leg.from.trim(),
      fromFull: leg.fromFull.trim(),
      to: leg.to.trim(),
      toFull: leg.toFull.trim(),
      distanceKm,
      durationMinutes,
      estimatedFare,
      paymentMethod: leg.paymentMethod.trim() || "rechnung",
      vehicle: leg.vehicle.trim() || "standard",
      ...(leg.scheduledAt.trim() ? { scheduledAt: leg.scheduledAt.trim() } : {}),
    };
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!token || !canCreate) return;
    setMsg("");
    if (!form.customerName.trim() || !form.patientReference.trim()) {
      setMsg("Patienten-Anzeigename und Referenz (Akte/Fall) sind Pflicht.");
      return;
    }
    const out = parseLeg(form.outbound, "Hinfahrt");
    if (out.error) {
      setMsg(out.error);
      return;
    }
    const ret = parseLeg(form.return, "Rückfahrt");
    if (ret.error) {
      setMsg(ret.error);
      return;
    }
    setCreating(true);
    try {
      const body = {
        customerName: form.customerName.trim(),
        patientReference: form.patientReference.trim(),
        rideKind: form.rideKind,
        payerKind: form.payerKind,
        outbound: out,
        return: ret,
        ...(form.billingReference.trim() ? { billingReference: form.billingReference.trim() } : {}),
        ...(form.voucherCode.trim() ? { voucherCode: form.voucherCode.trim() } : {}),
        ...(form.accessCode.trim() ? { accessCode: form.accessCode.trim() } : {}),
      };
      const res = await fetch(`${API_BASE}/panel/v1/bookings/medical-round-trip`, {
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
          res.status === 403
            ? "Keine Berechtigung."
            : typeof data?.error === "string"
              ? `Fehler: ${data.error}`
              : "Speichern fehlgeschlagen.",
        );
        return;
      }
      setMsg(`Angelegt: ${data.rides?.length ?? 2} Fahrten (Hin- und Rück).`);
      setForm((f) => ({
        ...f,
        customerName: "",
        patientReference: "",
        billingReference: "",
        voucherCode: "",
        accessCode: "",
        outbound: emptyLeg(),
        return: emptyLeg(),
      }));
    } catch {
      setMsg("Netzwerkfehler.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="panel-page panel-page--rides">
      <h2 className="panel-page__title">Patientenfahrt: Hin- & Rück</h2>
      <p className="panel-page__lead">
        Zwei verknüpfte Aufträge mit gemeinsamer Patientenreferenz. Ein Freigabe-Code gilt für beide Beine (eine
        Einlösung).
      </p>
      {!canCreate ? (
        <p className="panel-page__warn">Keine Berechtigung zum Anlegen.</p>
      ) : (
        <form className="panel-rides-form" onSubmit={onSubmit}>
          <div className="panel-card panel-card--wide">
            <h3 className="panel-card__title">Patient & Abrechnung</h3>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field">
                <span>Name auf der Fahrt</span>
                <input
                  value={form.customerName}
                  onChange={(ev) => setForm((f) => ({ ...f, customerName: ev.target.value }))}
                  required
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Patienten-Referenz / Aktenzeichen</span>
                <input
                  value={form.patientReference}
                  onChange={(ev) => setForm((f) => ({ ...f, patientReference: ev.target.value }))}
                  required
                />
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Kostenträger-Referenz (optional)</span>
                <input
                  value={form.billingReference}
                  onChange={(ev) => setForm((f) => ({ ...f, billingReference: ev.target.value }))}
                  placeholder="Kostenstelle, Genehmigung, …"
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
                  <option value="company">Firmenfahrt</option>
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
                  <option value="third_party">Dritter</option>
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
                  <span>Freigabe-Code (optional, für beide Fahrten)</span>
                  <input
                    value={form.accessCode}
                    onChange={(ev) => setForm((f) => ({ ...f, accessCode: ev.target.value }))}
                  />
                </label>
              ) : null}
            </div>
          </div>

          {["outbound", "return"].map((which) => {
            const title = which === "outbound" ? "Hinfahrt" : "Rückfahrt";
            const leg = form[which];
            return (
              <div key={which} className="panel-card panel-card--wide" style={{ marginTop: "1rem" }}>
                <h3 className="panel-card__title">{title}</h3>
                <div className="panel-rides-form__grid">
                  <label className="panel-rides-form__field">
                    <span>Von (Kurz)</span>
                    <input value={leg.from} onChange={(ev) => setLeg(which, "from", ev.target.value)} />
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Von (voll)</span>
                    <input value={leg.fromFull} onChange={(ev) => setLeg(which, "fromFull", ev.target.value)} />
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Nach (Kurz)</span>
                    <input value={leg.to} onChange={(ev) => setLeg(which, "to", ev.target.value)} />
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Nach (voll)</span>
                    <input value={leg.toFull} onChange={(ev) => setLeg(which, "toFull", ev.target.value)} />
                  </label>
                  <label className="panel-rides-form__field">
                    <span>km</span>
                    <input
                      inputMode="decimal"
                      value={leg.distanceKm}
                      onChange={(ev) => setLeg(which, "distanceKm", ev.target.value)}
                    />
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Min.</span>
                    <input
                      inputMode="numeric"
                      value={leg.durationMinutes}
                      onChange={(ev) => setLeg(which, "durationMinutes", ev.target.value)}
                    />
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Preis (geschätzt)</span>
                    <input
                      inputMode="decimal"
                      value={leg.estimatedFare}
                      onChange={(ev) => setLeg(which, "estimatedFare", ev.target.value)}
                    />
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Zahlungsart</span>
                    <input
                      value={leg.paymentMethod}
                      onChange={(ev) => setLeg(which, "paymentMethod", ev.target.value)}
                    />
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Fahrzeug</span>
                    <input value={leg.vehicle} onChange={(ev) => setLeg(which, "vehicle", ev.target.value)} />
                  </label>
                  <label className="panel-rides-form__field panel-rides-form__field--2">
                    <span>Geplant (optional)</span>
                    <input
                      value={leg.scheduledAt}
                      onChange={(ev) => setLeg(which, "scheduledAt", ev.target.value)}
                      placeholder="ISO-Datum"
                    />
                  </label>
                </div>
              </div>
            );
          })}

          {msg ? (
            <p className={msg.startsWith("Angelegt") ? "panel-page__ok" : "panel-page__warn"} style={{ marginTop: "1rem" }}>
              {msg}
            </p>
          ) : null}
          <button type="submit" className="panel-btn-primary" style={{ marginTop: "1rem" }} disabled={creating}>
            {creating ? "Speichern …" : "Hin- & Rückfahrt anlegen"}
          </button>
        </form>
      )}
    </div>
  );
}
