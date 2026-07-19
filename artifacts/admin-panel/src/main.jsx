import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
/* 1) Marken-Tokens zuerst — alle folgenden Sheets nutzen nur var(--onroda-*) */
import "../../marketing-site/onroda-brand.css";
import "./index.css";
import "./admin-topnav.css";
import "./admin-shell.css";
import "./admin-ui.css";
import "./admin-dashboard.css";
import "./admin-finance.css";
import App from "./App.jsx";
import { RECAPTCHA_SITE_KEY } from "./lib/adminRecaptcha.js";
import { redirectPartnerSessionAwayFromAdmin } from "./lib/redirectPartnerSessionFromAdmin.js";

redirectPartnerSessionAwayFromAdmin();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY} language="de">
      <App />
    </GoogleReCaptchaProvider>
  </StrictMode>,
);
