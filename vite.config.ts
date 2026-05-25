import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          // Inject the <link rel="manifest"> automatically into index.html
          injectRegister: 'auto',
          includeAssets: ['icons/*.png', 'icons/*.svg', 'fonts/**'],
          manifest: {
            name: 'BillHippo – GST Invoicing & Accounts',
            short_name: 'BillHippo',
            description: 'Create GST invoices, manage inventory, track payments and file GSTR returns on the go.',
            theme_color: '#4c2de0',
            background_color: '#f8f7ff',
            display: 'standalone',
            orientation: 'portrait-primary',
            scope: '/',
            start_url: '/?source=pwa',
            lang: 'en-IN',
            categories: ['finance', 'business', 'productivity'],
            icons: [
              {
                src: 'icons/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: 'icons/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: 'icons/icon-maskable.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
            shortcuts: [
              {
                name: 'New Invoice',
                short_name: 'Invoice',
                description: 'Create a new GST invoice',
                url: '/?tab=invoices&new=1&source=pwa',
                icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
              },
              {
                name: 'Inventory',
                short_name: 'Inventory',
                description: 'View your inventory',
                url: '/?tab=inventory&source=pwa',
                icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
              },
            ],
          },
          workbox: {
            // Pre-cache all built assets
            globPatterns: ['**/*.{js,css,html,woff,woff2,ttf,svg,png}'],
            // Main bundle exceeds 2 MiB due to @react-pdf/renderer — raise the limit
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            navigateFallback: '/index.html',
            navigateFallbackDenylist: [/^\/api\//],
            runtimeCaching: [
              // Google Fonts — cache for a year
              {
                urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts',
                  expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              // Firebase Storage (logos, assets) — cache for 30 days
              {
                urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'firebase-storage',
                  expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              // Tailwind CDN — cache for a week
              {
                urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'tailwind-cdn',
                  expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 7 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
            ],
          },
        }),
      ],
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // @react-pdf/renderer ships CommonJS — let Vite pre-bundle it correctly
      optimizeDeps: {
        include: ['@react-pdf/renderer'],
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
          output: {
            manualChunks: {
              firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
              vendor: ['react', 'react-dom', 'recharts'],
              pdf: ['@react-pdf/renderer'],
            }
          }
        }
      }
    };
});
