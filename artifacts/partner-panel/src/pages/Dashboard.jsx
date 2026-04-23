import { useState, useEffect } from "react";
import { useAuth } from "../lib/auth.js"; 
import TaxiMasterPanel from "../components/TaxiMasterPanel.jsx";
import AgenturMasterPanel from "../components/AgenturMasterPanel.jsx";
import KasseMasterPanel from "../components/KasseMasterPanel.jsx";

export default function Dashboard() {
  const { user } = useAuth(); 
  const company = user?.company;

  if (!company) return <div style={{padding: "20px"}}>Lade Firmendaten...</div>;

  // WEICHE FÜR DIE KUNDEN-ANSICHT (PARTNER)
  if (company.company_kind === "taxi") {
    return <TaxiMasterPanel company={company} />;
  }

  if (company.company_kind === "hotel" || company.company_kind === "agency" || company.company_kind === "travel") {
    return <AgenturMasterPanel company={company} isPartnerView={true} />;
  }

  if (company.company_kind === "insurer" || company.company_kind === "medical") {
    return <KasseMasterPanel company={company} isPartnerView={true} />;
  }

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <h1>Willkommen bei Onroda</h1>
      <p>Dein Portal wird gerade konfiguriert.</p>
    </div>
  );
}
