import { useGoogleReCaptcha } from "react-google-recaptcha-v3";

/**
 * Öffentlicher Site Key (kein Secret). Override: VITE_RECAPTCHA_SITE_KEY beim Vite-Build.
 */
export const RECAPTCHA_SITE_KEY =
  (typeof import.meta !== "undefined" && String(import.meta.env?.VITE_RECAPTCHA_SITE_KEY ?? "").trim()) ||
  "6LfNclstAAAAAFkwoDtPRErL_fx3xu0K6M81gpbT";

export const RECAPTCHA_LOGIN_ACTION = "admin_login";

/** Token für Admin-Login holen; wirft bei fehlendem Script/Fehler. */
export function useAdminLoginRecaptcha() {
  const { executeRecaptcha } = useGoogleReCaptcha();

  return async function getLoginRecaptchaToken() {
    if (!executeRecaptcha) {
      throw new Error("recaptcha_not_ready");
    }
    const token = await executeRecaptcha(RECAPTCHA_LOGIN_ACTION);
    if (!token || typeof token !== "string") {
      throw new Error("recaptcha_empty_token");
    }
    return token;
  };
}
