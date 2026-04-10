import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Production-Base: zusätzlich fest in package.json (`vite build --base /partners/`).
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/partners/' : '/',
}))
