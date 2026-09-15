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
      VitePWA({
            disable: portable,
            registerType: 'prompt',
            injectRegister: false,
            includeAssets: ['lifeos-icon-16.png', 'lifeos-icon-32.png', 'lifeos-icon-180.png', 'lifeos-icon-192.png', 'lifeos-icon-512.png'],
            manifest: {
              id: '/',
              name: 'LifeOS de Christian',
              short_name: 'LifeOS',
              description: 'Centro de operaciones personal, local y sincronizado.',
              lang: 'es',
              theme_color: '#08111f',
              background_color: '#08111f',
              display: 'standalone',
              start_url: '/',
              scope: '/',
              shortcuts: [
                { name: 'Captura rápida', short_name: 'Capturar', url: '/?action=capture', icons: [{ src: '/lifeos-icon-192.png', sizes: '192x192' }] },
                { name: 'Iniciar gimnasio', short_name: 'Gimnasio', url: '/?action=gym', icons: [{ src: '/lifeos-icon-192.png', sizes: '192x192' }] },
              ],
              icons: [
                { src: '/lifeos-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: '/lifeos-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: '/lifeos-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              navigateFallback: '/index.html',
              cleanupOutdatedCaches: true,
              clientsClaim: false,
              skipWaiting: false,
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
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase-vendor';
            if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts-vendor';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor';
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
