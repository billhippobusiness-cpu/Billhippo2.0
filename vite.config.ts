import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
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
