import { useState } from "react";
import TaxiMasterPanel from "./TaxiMasterPanel.jsx";
import AgenturMasterPanel from "./AgenturMasterPanel.jsx";
import KasseMasterPanel from "./KasseMasterPanel.jsx"; // NEU

export default function CompanyWorkspaceForm({ company, onUpdate }) {
  const [kind, setKind] = useState(company?.company_kind || "general");

  if (kind === "taxi") return <TaxiMasterPanel company={company} onUpdate={onUpdate} />;
  
  if (kind === "hotel" || kind === "travel" || kind === "agency") {
    return <AgenturMasterPanel company={company} onUpdate={onUpdate} />;
  }

  // DIE GRÜNE WELT
  if (kind === "insurer" || kind === "health") {
    return <KasseMasterPanel company={company} onUpdate={onUpdate} />;
  }

  return (
    <div style={{ padding: "20px" }}>
       <h3>Mandanten-Typ wählen</h3>
       <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ padding: "12px", width: "100%" }}>
          <option value="general">Standard</option>
          <option value="taxi">🚖 Taxi-Zentrale</option>
          <option value="hotel">🏨 Hotel / Agentur</option>
          <option value="insurer">🏥 Krankenkasse / Kostenträger</option>
       </select>
    </div>
  );
}
