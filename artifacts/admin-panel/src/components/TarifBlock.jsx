import CollapsibleCard from "./CollapsibleCard.jsx";

/** Taxameter-Felder (Grundgebühr, km-Stufen, Zeit) + optionaler €-Aufschlag. */
export default function TarifBlock({
  title,
  hint,
  value,
  onChange,
  surchargeEur,
  onSurchargeChange,
  surchargeLabel,
  surchargeHint,
}) {
  const ch = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const tripPerHour = (() => {
    const v = parseFloat(String(value.tripMin).replace(",", "."));
    if (!isFinite(v) || v <= 0) return null;
    return (v * 60).toFixed(2).replace(".", ",");
  })();
  const FieldRow = ({ children }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>
  );
  const Field = ({ label, fieldKey, unit, hint: fhint }) => (
    <label className="admin-form-label" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: "1px solid rgba(0,0,0,0.18)",
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--admin-input-bg, #fff)",
        }}
      >
        <input
          className="admin-input"
          style={{ border: "none", outline: "none", padding: "7px 10px", flex: 1, minWidth: 0, background: "transparent" }}
          value={value[fieldKey]}
          onChange={ch(fieldKey)}
          inputMode="decimal"
        />
        <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", paddingRight: 10, whiteSpace: "nowrap" }}>{unit}</span>
      </div>
      {fhint ? <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 1 }}>{fhint}</span> : null}
    </label>
  );
  return (
    <CollapsibleCard title={title}>
      {hint ? <p className="admin-table-sub" style={{ marginTop: 2 }}>{hint}</p> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 14, maxWidth: 500 }}>
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "rgba(0,0,0,0.35)",
              marginBottom: 8,
            }}
          >
            Grundgebühren
          </p>
          <FieldRow>
            <Field label="Grundgebühr" fieldKey="baseFare" unit="€" />
            <Field label="Mindestpreis je Fahrt" fieldKey="minFare" unit="€" />
          </FieldRow>
        </div>
        <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", paddingTop: 14 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "rgba(0,0,0,0.35)",
              marginBottom: 8,
            }}
          >
            Streckenpreise (km)
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Tarif 1 bis" fieldKey="bisKm" unit="km" />
            <Field label="Preis Tarif 1" fieldKey="preisBis" unit="€/km" />
            <Field label="Preis Tarif 2" fieldKey="danach" unit="€/km" />
          </div>
          <p style={{ fontSize: 11, color: "rgba(0,0,0,0.38)", marginTop: 6 }}>Tarif 2 gilt ab {value.bisKm || "?"} km</p>
        </div>
        <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", paddingTop: 14 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "rgba(0,0,0,0.35)",
              marginBottom: 8,
            }}
          >
            Zeitpreise
          </p>
          <FieldRow>
            <Field label="Fahrtminute" fieldKey="tripMin" unit="€/Min" fhint={tripPerHour ? `= ${tripPerHour} €/Std` : null} />
            <Field label="Wartezeit (Stau / Halt)" fieldKey="waitH" unit="€/Std" />
          </FieldRow>
        </div>
        {onSurchargeChange !== undefined ? (
          <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", paddingTop: 14 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "rgba(0,0,0,0.35)",
                marginBottom: 8,
              }}
            >
              Zuschlag
            </p>
            <div style={{ maxWidth: 220 }}>
              <label className="admin-form-label" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12 }}>{surchargeLabel || "Fahrzeugaufschlag"}</span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: "1px solid rgba(0,0,0,0.18)",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--admin-input-bg, #fff)",
                  }}
                >
                  <input
                    className="admin-input"
                    style={{ border: "none", outline: "none", padding: "7px 10px", flex: 1, minWidth: 0, background: "transparent" }}
                    value={surchargeEur ?? ""}
                    onChange={(e) => onSurchargeChange(e.target.value)}
                    inputMode="decimal"
                  />
                  <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", paddingRight: 10 }}>€</span>
                </div>
                <span style={{ fontSize: 11, color: "rgba(0,0,0,0.38)" }}>
                  {surchargeHint || "Wird zum Standard-Tarif addiert."}
                </span>
              </label>
            </div>
          </div>
        ) : null}
      </div>
    </CollapsibleCard>
  );
}
