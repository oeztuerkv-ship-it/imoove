import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../api-server/static/onroda-brand.css";
import "./index.css";
import "./styles/panel-shell.css";
import "./styles/panel-login.css";
import "./styles/panel-ui.css";
import "./styles/partner-workspace.css";
import App from "./App.jsx";
import { PanelAuthProvider } from "./context/PanelAuthContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PanelAuthProvider>
      <App />
    </PanelAuthProvider>
  </StrictMode>,
);
