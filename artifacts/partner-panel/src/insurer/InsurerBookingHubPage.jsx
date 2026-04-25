import { useState } from "react";
import MedicalRoundTripPage from "../pages/MedicalRoundTripPage.jsx";
import MedicalSeriesPage from "../pages/MedicalSeriesPage.jsx";
import RideCreatePage from "../pages/RideCreatePage.jsx";

/**
 * Buchung: wiederverwendet bestehende Panel-Formulare; mandantenbezogen über /panel/v1/… (Krankenkasse-Regeln in der API).
 * apiBase/token bewusst in Signatur, falls spätere Erweiterungen Konto-Header brauchen.
 */
// eslint-disable-next-line no-unused-vars
export default function InsurerBookingHubPage(_props) {
  const [sub, setSub] = useState("choice");

  if (sub === "round") {
    return (
      <div>
        <button type="button" className="link-button" onClick={() => setSub("choice")} style={{ marginBottom: 12 }}>
          ← Zurück
        </button>
        <MedicalRoundTripPage />
      </div>
    );
  }
  if (sub === "series") {
    return (
      <div>
        <button type="button" className="link-button" onClick={() => setSub("choice")} style={{ marginBottom: 12 }}>
          ← Zurück
        </button>
        <MedicalSeriesPage />
      </div>
    );
  }
  if (sub === "single") {
    return (
      <div>
        <button type="button" className="link-button" onClick={() => setSub("choice")} style={{ marginBottom: 12 }}>
          ← Zurück
        </button>
        <RideCreatePage />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px" }}>Buchung</h2>
      <p style={{ color: "#666", fontSize: 14, margin: "0 0 20px" }}>
        Einzelfahrt, Hin- und Rückfahrt (verbunden) oder Serienfahrten. Es werden keine medizinischen Befundtexte in der
        Datenbank gespeichert; nutzen Sie interne Referenzen. Die fachliche Freigabe geschieht über Ihre
        Prozess-/Vertragsparameter (API, Kostenträger-Regeln).
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        <button
          type="button"
          onClick={() => setSub("single")}
          style={{ padding: 16, textAlign: "left", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}
        >
          <strong>Einzelne Fahrt</strong>
          <div style={{ fontSize: 13, color: "#666" }}>Standard-Panel-Buchung</div>
        </button>
        <button
          type="button"
          onClick={() => setSub("round")}
          style={{ padding: 16, textAlign: "left", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}
        >
          <strong>Hin- und Rückfahrt (Patientenfahrt)</strong>
          <div style={{ fontSize: 13, color: "#666" }}>Zwei verbundene Fahrten</div>
        </button>
        <button
          type="button"
          onClick={() => setSub("series")}
          style={{ padding: 16, textAlign: "left", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}
        >
          <strong>Serienfahrten</strong>
          <div style={{ fontSize: 13, color: "#666" }}>Gültigkeitsfenster, Anzahl, Fahrten daraus</div>
        </button>
      </div>
    </div>
  );
}
