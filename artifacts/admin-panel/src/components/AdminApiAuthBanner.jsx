import { useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders, isAdminSessionConfigured } from "../lib/adminApiHeaders.js";

const STATS_URL = `${API_BASE}/admin/stats`;

/**
 * Einmaliger Check gegen GET /api/admin/stats: erklärt 401/503 statt leerer Dashboards.
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
          if (!isAdminSessionConfigured()) {
            setMessage("Plattform-Admin: Sitzung abgelaufen oder nicht angemeldet. Bitte erneut einloggen.");
          } else {
            setMessage("Plattform-Admin: 401 Unauthorized — bitte abmelden und erneut einloggen.");
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
