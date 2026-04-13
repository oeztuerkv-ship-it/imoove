import { useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders, isAdminBearerConfigured } from "../lib/adminApiHeaders.js";

const STATS_URL = `${API_BASE}/admin/stats`;

/**
 * Einmaliger Check gegen GET /api/admin/stats: erklärt 401/503 statt leerer Dashboards.
 * Partner-Panel (JWT) ist davon getrennt — siehe PanelAuthContext im partner-panel.
 */
export default function AdminApiAuthBanner() {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("error");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(STATS_URL, { headers: adminApiHeaders() });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setMessage("");
          return;
        }
        if (res.status === 401) {
          setTone("error");
          if (!isAdminBearerConfigured()) {
            setMessage(
              "Plattform-Admin: Beim Vite-Build VITE_ADMIN_API_BEARER_TOKEN setzen (identisch mit ADMIN_API_BEARER_TOKEN auf der API). Ohne diesen Header liefert https://api.onroda.de/api/admin/* nur 401.",
            );
          } else {
            setMessage(
              "Plattform-Admin: 401 Unauthorized — der konfigurierte Bearer passt nicht zur API (ADMIN_API_BEARER_TOKEN auf dem Server prüfen, Admin-Panel neu bauen).",
            );
          }
          return;
        }
        if (res.status === 503 && data?.error === "admin_api_auth_not_configured") {
          setTone("error");
          setMessage(
            "API: In Produktion ist ADMIN_API_BEARER_TOKEN nicht gesetzt — /admin/* bleibt gesperrt, bis die Variable auf dem Server konfiguriert ist.",
          );
          return;
        }
        setMessage("");
      } catch {
        if (!cancelled) setMessage("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!message) return null;
  return (
    <div className={`admin-api-banner admin-api-banner--${tone}`} role="alert">
      {message}
    </div>
  );
}
