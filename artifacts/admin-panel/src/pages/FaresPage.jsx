import { useEffect, useState } from "react";

const API_URL = "https://onroda.de/api/admin/fare-areas";

export default function FaresPage() {
  const [form, setForm] = useState({
    name: "",
    ruleType: "official_metered_tariff",
    isRequiredArea: "Ja",
    fixedPriceAllowed: "Prüfen",
    status: "aktiv",
  });

  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadAreas();
  }, []);

  async function loadAreas() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(API_URL);
      if (!res.ok) {
        throw new Error("Gebiete konnten nicht geladen werden");
      }

      const data = await res.json();
      setAreas(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAddArea(e) {
    e.preventDefault();

    if (!form.name.trim()) {
      setError("Gebietsname fehlt");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          ruleType: form.ruleType,
          isRequiredArea: form.isRequiredArea,
          fixedPriceAllowed: form.fixedPriceAllowed,
          status: form.status,
        }),
      });

      if (!res.ok) {
        throw new Error("Gebiet konnte nicht gespeichert werden");
      }

      const data = await res.json();
      setAreas(Array.isArray(data.items) ? data.items : []);

      setForm({
        name: "",
        ruleType: "official_metered_tariff",
        isRequiredArea: "Ja",
        fixedPriceAllowed: "Prüfen",
        status: "aktiv",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  const officialCount = areas.filter(
    (a) => a.ruleType === "official_metered_tariff"
  ).length;

  const contractCount = areas.filter(
    (a) =>
      a.ruleType === "health_contract_rate" ||
      a.ruleType === "partner_contract_rate"
  ).length;

  const specialCount = areas.filter(
    (a) =>
      a.ruleType === "free_price_outside_area" ||
      a.ruleType === "special_manual_rule" ||
      a.ruleType === "official_fixed_price" ||
      a.ruleType === "tariff_corridor"
  ).length;

  return (
    <div style={styles.wrapper}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Tarifregeln & Gebiete</h2>
          <p style={styles.subtitle}>
            Verwaltung von Pflichtfahrgebieten, Preisregel-Typen und Vertragstarifen.
          </p>
        </div>
      </div>

      {error ? <div style={styles.errorBox}>Fehler: {error}</div> : null}

      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.label}>Aktive Gebiete</div>
          <div style={styles.value}>{areas.length}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.label}>Offizielle Tarife</div>
          <div style={styles.value}>{officialCount}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.label}>Vertragstarife</div>
          <div style={styles.value}>{contractCount}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.label}>Sonderregeln</div>
          <div style={styles.value}>{specialCount}</div>
        </div>
      </div>

      <div style={styles.formPanel}>
        <div style={styles.panelTitle}>Neues Gebiet hinzufügen</div>

        <form onSubmit={handleAddArea} style={styles.formGrid}>
          <input
            style={styles.input}
            placeholder="Gebiet (z. B. Stuttgart)"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
          />

          <select
            style={styles.input}
            value={form.ruleType}
            onChange={(e) => handleChange("ruleType", e.target.value)}
          >
            <option value="official_metered_tariff">official_metered_tariff</option>
            <option value="official_fixed_price">official_fixed_price</option>
            <option value="tariff_corridor">tariff_corridor</option>
            <option value="free_price_outside_area">free_price_outside_area</option>
            <option value="health_contract_rate">health_contract_rate</option>
            <option value="partner_contract_rate">partner_contract_rate</option>
            <option value="special_manual_rule">special_manual_rule</option>
          </select>

          <select
            style={styles.input}
            value={form.isRequiredArea}
            onChange={(e) => handleChange("isRequiredArea", e.target.value)}
          >
            <option value="Ja">Pflichtgebiet: Ja</option>
            <option value="Nein">Pflichtgebiet: Nein</option>
            <option value="Prüfen">Pflichtgebiet: Prüfen</option>
          </select>

          <select
            style={styles.input}
            value={form.fixedPriceAllowed}
            onChange={(e) => handleChange("fixedPriceAllowed", e.target.value)}
          >
            <option value="Ja">Festpreis: Ja</option>
            <option value="Nein">Festpreis: Nein</option>
            <option value="Prüfen">Festpreis: Prüfen</option>
          </select>

          <select
            style={styles.input}
            value={form.status}
            onChange={(e) => handleChange("status", e.target.value)}
          >
            <option value="aktiv">aktiv</option>
            <option value="inaktiv">inaktiv</option>
            <option value="regelbasiert">regelbasiert</option>
          </select>

          <button type="submit" style={styles.button} disabled={saving}>
            {saving ? "Speichert..." : "+ Hinzufügen"}
          </button>
        </form>
      </div>

      <div style={styles.tableWrap}>
        <div style={styles.tableTitle}>Aktuelle Regeln</div>

        {loading ? (
          <div style={styles.infoText}>Lade Gebiete...</div>
        ) : (
          <div style={styles.table}>
            <div style={styles.rowHeader}>
              <div>Gebiet</div>
              <div>Regeltyp</div>
              <div>Pflicht</div>
              <div>Festpreis</div>
              <div>Status</div>
            </div>

            {areas.map((a) => (
              <div key={a.id} style={styles.row}>
                <div>{a.name}</div>
                <div>{a.ruleType}</div>
                <div>{a.isRequiredArea}</div>
                <div>{a.fixedPriceAllowed}</div>
                <div>{a.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 28,
    color: "#fff",
    margin: 0,
  },
  subtitle: {
    color: "#aaa",
    marginTop: 8,
    marginBottom: 0,
  },
  errorBox: {
    background: "#2a1111",
    border: "1px solid #5c2222",
    color: "#ffb3b3",
    borderRadius: 14,
    padding: 16,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 20,
  },
  card: {
    background: "#161616",
    padding: 20,
    borderRadius: 14,
    border: "1px solid #262626",
  },
  label: {
    color: "#aaa",
    marginBottom: 10,
  },
  value: {
    fontSize: 28,
    fontWeight: 700,
    color: "#fff",
  },
  formPanel: {
    background: "#161616",
    padding: 20,
    borderRadius: 14,
    border: "1px solid #262626",
  },
  panelTitle: {
    fontWeight: 700,
    marginBottom: 14,
    color: "#fff",
    fontSize: 18,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  input: {
    padding: 12,
    borderRadius: 10,
    border: "1px solid #333",
    background: "#0b0b0b",
    color: "#fff",
    fontSize: 14,
  },
  button: {
    padding: 12,
    background: "#fff",
    color: "#000",
    borderRadius: 10,
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  },
  tableWrap: {
    background: "#161616",
    padding: 20,
    borderRadius: 14,
    border: "1px solid #262626",
  },
  tableTitle: {
    fontWeight: 700,
    marginBottom: 14,
    color: "#fff",
    fontSize: 18,
  },
  infoText: {
    color: "#aaa",
  },
  table: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  rowHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 1.5fr 1fr 1fr 1fr",
    gap: 12,
    fontWeight: 700,
    color: "#fff",
    paddingBottom: 10,
    borderBottom: "1px solid #2a2a2a",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1.5fr 1fr 1fr 1fr",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #202020",
    color: "#d4d4d4",
    fontSize: 14,
  },
};
