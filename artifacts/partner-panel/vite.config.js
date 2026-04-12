import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production: Host panel.onroda.de, kein URL-Pfad-Präfix.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/" : "/",
  server: {
    port: 5175,
    allowedHosts: ["panel.onroda.de", ".onroda.de", "localhost", "127.0.0.1"],
  },
  preview: {
    port: 4175,
    allowedHosts: ["panel.onroda.de", ".onroda.de", "localhost", "127.0.0.1"],
  },
}));
