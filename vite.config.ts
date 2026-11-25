import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Local by default: previewing a pilot must not send test events to production.
const API = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787'
const proxy = { '/api': { target: API, changeOrigin: true }, '/e': { target: API, changeOrigin: true } }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
})
