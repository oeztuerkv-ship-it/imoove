import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Production-Base: zusätzlich fest in package.json (`vite build --base /partners/`).
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/partners/' : '/',
  /* Dev / vite preview: sonst „Blocked request … host is not allowed“ bei Zugriff über echte Domain. */
  server: {
    allowedHosts: ["admin.onroda.de"],
  },
  preview: {
    allowedHosts: ["admin.onroda.de"],
  },
}))
