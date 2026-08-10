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
      portable
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['lifeos-icon.svg', 'lifeos-icon-192.png', 'lifeos-icon-512.png'],
            manifest: {
              id: '/',
              name: 'LifeOS de Christian',
              short_name: 'LifeOS',
              description: 'Centro de operaciones personal, local y sincronizado.',
              lang: 'es',
              theme_color: '#2563eb',
              background_color: '#f8fafc',
              display: 'standalone',
              start_url: '/',
              scope: '/',
              icons: [
                { src: '/lifeos-icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/lifeos-icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: '/lifeos-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
              ],
            },
            workbox: {
              navigateFallback: '/index.html',
              cleanupOutdatedCaches: true,
              clientsClaim: true,
              skipWaiting: true,
            },
          }),
    ],
    define: {
      __LIFEOS_PORTABLE__: JSON.stringify(portable),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
