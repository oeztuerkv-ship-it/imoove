import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Production-Base: zusätzlich fest in package.json (`vite build --base /partners/`).
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/partners/' : '/',
  /**
   * Dev (`vite`) + `vite preview`: Host-Check (DNS-Rebinding-Schutz).
   * - Nginx muss `Host: admin.onroda.de` durchreichen (`proxy_set_header Host $host;`).
   * - Ohne korrekten Host sieht Vite z. B. `127.0.0.1:5174` → Eintrag in allowedHosts nützt nichts.
   * - `.onroda.de` = Subdomains laut Vite-Doku.
   * - Nur `preview.*` reicht nicht, wenn der Prozess `vite` (dev) ist — beide setzen.
   */
  server: {
    allowedHosts: ["admin.onroda.de", ".onroda.de", "localhost", "127.0.0.1"],
  },
  preview: {
    allowedHosts: ["admin.onroda.de", ".onroda.de", "localhost", "127.0.0.1"],
  },
}))
