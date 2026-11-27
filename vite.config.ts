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
            includeAssets: ['favicon.svg', 'lifeos-icon-16.png', 'lifeos-icon-32.png', 'lifeos-icon-180.png', 'lifeos-icon-192.png', 'lifeos-icon-512.png', 'icon-192-maskable.png', 'icon-512-maskable.png'],
            manifest: {
              id: '/',
              name: 'Celestian LifeOS',
              short_name: 'Celestian',
              description: 'Tu espacio personal para organizar agenda, trabajo, finanzas, estudios y gimnasio, con datos locales y sincronización opcional.',
              lang: 'es',
              dir: 'ltr',
              theme_color: '#07090E',
              background_color: '#07090E',
              display: 'standalone',
              display_override: ['window-controls-overlay', 'standalone'],
              orientation: 'portrait',
              start_url: '/',
              scope: '/',
              categories: ['productivity', 'lifestyle', 'finance'],
              shortcuts: [
                { name: 'Hoy', short_name: 'Hoy', url: '/?view=dashboard', icons: [{ src: '/lifeos-icon-192.png', sizes: '192x192', type: 'image/png' }] },
                { name: 'Finanzas', short_name: 'Finanzas', url: '/?view=finanzas', icons: [{ src: '/lifeos-icon-192.png', sizes: '192x192', type: 'image/png' }] },
                { name: 'Gimnasio', short_name: 'Gimnasio', url: '/?view=gimnasio', icons: [{ src: '/lifeos-icon-192.png', sizes: '192x192', type: 'image/png' }] },
              ],
              icons: [
                { src: '/lifeos-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: '/lifeos-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
                { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              // Keep the actual interface available offline, including local fonts
              // and the existing gym/completion artwork. The five Cervino panoramas
              // and dotLottie WASM runtime are large assets: they stay out of the
              // install-time precache and are cached on demand by runtimeCaching below.
              globPatterns: ['**/*.{js,css,html,woff2,png,webp,svg,lottie,json}'],
              // Digital Asset Links and public legal/info pages must never be
              // swallowed by the SPA navigation fallback.
              globIgnores: ['**/.well-known/**', '**/cervino-panorama-*.webp'],
              navigateFallbackDenylist: [
                /^\/\.well-known\//,
                /^\/robots\.txt$/,
                /^\/privacidad\.html$/,
                /^\/eliminar-cuenta\.html$/,
                /^\/creditos\.html$/,
              ],
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
                {
                  urlPattern: /\.wasm$/i,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'lifeos-wasm-runtime-v1',
                    expiration: {
                      maxEntries: 4,
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
    esbuild: {
      legalComments: 'none',
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
            if (norm.includes('/lucide-react/')) return 'icons-vendor';
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
