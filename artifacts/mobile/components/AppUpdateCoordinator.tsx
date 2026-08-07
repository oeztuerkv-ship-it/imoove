import React, { useCallback, useEffect, useRef, useState } from "react";
import { OtaUpdateAvailableModal } from "@/components/OtaUpdateAvailableModal";
import { OtaUpdateInstalledModal } from "@/components/OtaUpdateInstalledModal";
import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import {
  checkOtaUpdateAvailable,
  fetchOtaUpdate,
  reloadAfterOtaUpdate,
  runStoreVersionCheck,
} from "@/utils/appUpdateCheck";

/**
 * Einmal pro App-Session:
 * 1) OTA verfügbar → Modal „Neue Version verfügbar“
 * 2) Download → Modal „Update erfolgreich installiert“ (unverändert)
 * 3) sonst Store-Versions-Hinweis aus `/app/config` → system.mobileApp
 */
export function AppUpdateCoordinator() {
  const { config, loading } = useOnrodaAppConfig();
  const ranRef = useRef(false);
  const [otaAvailable, setOtaAvailable] = useState(false);
  const [otaReady, setOtaReady] = useState(false);
  const fetchingRef = useRef(false);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (loading || ranRef.current) return;
    ranRef.current = true;
    void (async () => {
      const available = await checkOtaUpdateAvailable();
      if (available) {
        setOtaAvailable(true);
        return;
      }
      await runStoreVersionCheck(
        config.system && typeof config.system === "object"
          ? (config.system as Record<string, unknown>)
          : null,
      );
    })();
  }, [loading, config.system]);

  const handleAvailableContinue = useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    void (async () => {
      const ok = await fetchOtaUpdate();
      setOtaAvailable(false);
      if (ok) {
        setOtaReady(true);
        return;
      }
      // Download fehlgeschlagen — Store-Hinweis als Fallback
      await runStoreVersionCheck(
        config.system && typeof config.system === "object"
          ? (config.system as Record<string, unknown>)
          : null,
      );
    })();
  }, [config.system]);

  const handleOtaContinue = useCallback(() => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    void reloadAfterOtaUpdate();
  }, []);

  return (
    <>
      <OtaUpdateAvailableModal visible={otaAvailable} onContinue={handleAvailableContinue} />
      <OtaUpdateInstalledModal visible={otaReady} onContinue={handleOtaContinue} />
    </>
  );
}
