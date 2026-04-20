import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
/* 1) Marken-Tokens zuerst — alle folgenden Sheets nutzen nur var(--onroda-*) */
import "../../api-server/static/onroda-brand.css";
import "./index.css";
import "./admin-shell.css";
import "./admin-ui.css";
import "./admin-dashboard.css";
import "./admin-finance.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
