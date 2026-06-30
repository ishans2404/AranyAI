import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Proxy /api and /health to the FastAPI backend so the frontend
// never has to deal with CORS during development.
// BACKEND_URL defaults to localhost:8080 (Cloud Shell port) or 8000 locally.
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8080'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifestFilename: 'site.webmanifest',
      scope: '/',
      base: '/',
      manifest: {
        name: 'AranyAI — Forest Watch',
        short_name: 'AranyAI',
        description: 'Forest change detection & monitoring — Chhattisgarh Forest Department',
        theme_color: '#283618',
        background_color: '#fefae0',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'portrait-primary',
        id: '/',
        dir: 'ltr',
        lang: 'en',
        categories: ['government', 'utilities'],
        start_url: '/',
        scope: '/',
        launch_handler: { client_mode: 'focus-existing' },
        icons: [
          { src: 'web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
        shortcuts: [],
        share_target: null,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/health/],
        runtimeCaching: [
          { urlPattern: /^https?:\/\/.*\/api\/.*/i, handler: 'NetworkOnly' },
          { urlPattern: /^https?:\/\/.*\/health$/i, handler: 'NetworkOnly' },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    proxy: {
      '/api':    { target: BACKEND, changeOrigin: true },
      '/health': { target: BACKEND, changeOrigin: true },
    },
  },
})
