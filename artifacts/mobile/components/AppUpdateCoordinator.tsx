import React, { useCallback, useEffect, useRef, useState } from "react";
import { OtaUpdateInstalledModal } from "@/components/OtaUpdateInstalledModal";
import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import { reloadAfterOtaUpdate, runOtaUpdateCheck, runStoreVersionCheck } from "@/utils/appUpdateCheck";

/**
 * Einmal pro App-Session: OTA-Check, danach Store-Versions-Hinweis aus `/app/config` → system.mobileApp.
 */
export function AppUpdateCoordinator() {
  const { config, loading } = useOnrodaAppConfig();
  const ranRef = useRef(false);
  const [otaReady, setOtaReady] = useState(false);

  useEffect(() => {
    if (loading || ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;
    void (async () => {
      const updateReady = await runOtaUpdateCheck();
      if (cancelled) return;
      if (updateReady) {
        setOtaReady(true);
        return;
      }
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

  const handleOtaContinue = useCallback(() => {
    void reloadAfterOtaUpdate();
  }, []);

  return <OtaUpdateInstalledModal visible={otaReady} onContinue={handleOtaContinue} />;
}
