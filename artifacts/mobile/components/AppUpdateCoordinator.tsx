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
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (loading || ranRef.current) return;
    ranRef.current = true;
    void (async () => {
      const updateReady = await runOtaUpdateCheck();
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
  }, [loading, config.system]);

  const handleOtaContinue = useCallback(() => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    void reloadAfterOtaUpdate();
  }, []);

  return <OtaUpdateInstalledModal visible={otaReady} onContinue={handleOtaContinue} />;
}
