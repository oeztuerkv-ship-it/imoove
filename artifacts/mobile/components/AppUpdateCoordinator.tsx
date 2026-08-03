import { useEffect, useRef } from "react";
import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import { runOtaUpdateCheck, runStoreVersionCheck } from "@/utils/appUpdateCheck";

/**
 * Einmal pro App-Session: OTA-Check, danach Store-Versions-Hinweis aus `/app/config` → system.mobileApp.
 */
export function AppUpdateCoordinator() {
  const { config, loading } = useOnrodaAppConfig();
  const ranRef = useRef(false);

  useEffect(() => {
    if (loading || ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;
    void (async () => {
      const reloading = await runOtaUpdateCheck();
      if (cancelled || reloading) return;
      await runStoreVersionCheck(
        config.system && typeof config.system === "object"
          ? (config.system as Record<string, unknown>)
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, config.system]);

  return null;
}
