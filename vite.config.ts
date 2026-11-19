import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const portable = mode === 'portable';

  return {
    base: portable ? './' : '/',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'lifeos-build-identity',
        transformIndexHtml() {
          return [{
            tag: 'meta',
            attrs: { name: 'lifeos-build-id', content: process.env.LIFEOS_BUILD_ID || 'dev' },
            injectTo: 'head' as const,
          }];
        },
      },
      VitePWA({
            disable: portable,
            registerType: 'prompt',
            injectRegister: false,
            includeAssets: ['lifeos-icon-16.png', 'lifeos-icon-32.png', 'lifeos-icon-180.png', 'lifeos-icon-192.png', 'lifeos-icon-512.png', 'icon-512-maskable.png'],
            manifest: {
              id: '/',
              name: 'Celestian LifeOS',
              short_name: 'LifeOS',
              description: 'Organización personal con datos locales y sincronización opcional.',
              lang: 'es',
              dir: 'ltr',
              theme_color: '#07090E',
              background_color: '#07090E',
              display: 'standalone',
              orientation: 'portrait',
              start_url: '/',
              scope: '/',
              shortcuts: [
                { name: 'Captura rápida', short_name: 'Capturar', url: '/?action=capture', icons: [{ src: '/lifeos-icon-192.png', sizes: '192x192' }] },
                { name: 'Iniciar gimnasio', short_name: 'Gimnasio', url: '/?action=gym', icons: [{ src: '/lifeos-icon-192.png', sizes: '192x192' }] },
              ],
              icons: [
                { src: '/lifeos-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: '/lifeos-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              // Keep the actual interface available offline, including local fonts
              // and the existing gym/completion artwork. The five Cervino panoramas
              // are large photographic scenes: they stay out of the install-time
              // precache and are cached on demand by the runtime rule below.
              globPatterns: ['**/*.{js,css,html,wasm,woff2,png,webp,svg,lottie,json}'],
              // Digital Asset Links must never be served from a stale precache or
              // swallowed by the SPA navigation fallback.
              globIgnores: ['**/.well-known/**', '**/cervino-panorama-*.webp'],
              navigateFallbackDenylist: [/^\/\.well-known\//],
              maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
              navigateFallback: '/index.html',
              cleanupOutdatedCaches: true,
              clientsClaim: false,
              skipWaiting: false,
              runtimeCaching: [
                {
                  urlPattern: /\/assets\/cervino-panorama-[\w-]+\.webp$/,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'lifeos-hero-scenes-v1',
                    expiration: {
                      maxEntries: 8,
                      maxAgeSeconds: 60 * 60 * 24 * 60,
                    },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
          }),
      ...(portable ? [viteSingleFile()] : []),
    ],
    define: {
      __LIFEOS_PORTABLE__: JSON.stringify(portable),
      __LIFEOS_BUILD_ID__: JSON.stringify(process.env.LIFEOS_BUILD_ID || 'dev'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: portable ? {} : {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const norm = id.replace(/\\/g, '/');
            if (!norm.includes('node_modules')) return undefined;
            if (norm.includes('/@firebase/firestore') || norm.includes('/firebase/firestore')) return 'firebase-firestore-vendor';
            if (norm.includes('/firebase/') || norm.includes('/@firebase/')) return 'firebase-auth-vendor';
            if (norm.includes('/recharts/') || norm.includes('/d3-')) return 'charts-vendor';
            if (norm.includes('/@lottiefiles/')) return 'motion-vendor';
            if (norm.includes('/react/') || norm.includes('/react-dom/') || norm.includes('/scheduler/')) return 'react-vendor';
            return undefined;
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
