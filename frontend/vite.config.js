import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy /api and /health to the FastAPI backend so the frontend
// never has to deal with CORS during development.
// BACKEND_URL defaults to localhost:8080 (Cloud Shell port) or 8000 locally.
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api':    { target: BACKEND, changeOrigin: true },
      '/health': { target: BACKEND, changeOrigin: true },
    },
  },
})
