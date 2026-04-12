/**
 * Onroda Admin-Panel — Vite-Konfiguration (nur gültiges ESM, keine Shell-Snippets).
 * Bei Merge-Konflikten: Marker <<<<<<< / ======= / >>>>>>> hier nie committen.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
// Production-Base: auch in package.json (`vite build --base /partners/`).
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/partners/" : "/",
  /**
   * Dev (`vite`) + `vite preview`: Host-Check (DNS-Rebinding-Schutz).
   * Nginx: `proxy_set_header Host $host;`
   */
  server: {
    port: 5174,
    strictPort: false,
    allowedHosts: ["admin.onroda.de", ".onroda.de", "localhost", "127.0.0.1"],
  },
  preview: {
    port: 3001,
    strictPort: true,
    host: "127.0.0.1",
    allowedHosts: ["admin.onroda.de", ".onroda.de", "localhost", "127.0.0.1"],
  },
}));
