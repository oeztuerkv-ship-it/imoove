import { useEffect } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { installPartnerPanelHistoryGuard } from "../lib/panelHistoryGuard.js";

/**
 * Nach Login: History-Barriere + Schutz vor Zurück auf admin.onroda.de/partners/.
 */
export default function PanelHistoryGuard({ children }) {
  const { user } = usePanelAuth();

  useEffect(() => {
    if (!user) return undefined;
    return installPartnerPanelHistoryGuard();
  }, [user]);

  return children;
}
