import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// W trybie dev i preview klient i API dzielą jeden origin dzięki proxy —
// ciasteczko sesji jest wtedy pierwszej strony (SameSite=Lax) i nie potrzeba CORS.
const apiTarget = process.env.API_URL ?? 'http://localhost:3000';
const proxy = { '/api': { target: apiTarget, changeOrigin: false } };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Zapomniany Brzeg',
        short_name: 'Zapomniany Brzeg',
        description: 'Mobilna gra RPG w klimacie kosmicznego horroru: łowy, obłęd i echa zmarłych.',
        lang: 'pl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#07080b',
        theme_color: '#07080b',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Z fontów potrzebujemy tylko łaciny z polskimi znakami — reszty podzbiorów nie trzymamy offline.
        globIgnores: [
          '**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese,math,symbols}-*.woff2',
        ],
        // API nigdy nie jest cache'owane przez service workera — stan gry zna tylko serwer.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: { target: 'es2023', sourcemap: true },
});
