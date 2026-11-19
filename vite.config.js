// Vite-Konfiguration: baut die App und macht sie zur installierbaren PWA.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative Pfade: so läuft die App auf GitHub Pages (Unterordner),
  // Netlify und Vercel ohne weitere Anpassung.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Lesezeit',
        short_name: 'Lesezeit',
        description: 'E-Books lesen und Hörbücher hören – offline, auf allen Geräten.',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f6f1e7',
        theme_color: '#f6f1e7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Alles, was die App selbst braucht, wird für den Offline-Betrieb gespeichert.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
