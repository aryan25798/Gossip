import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: '/',
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: false
        },
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'nova-icon.png'],
        manifest: {
          name: 'NovaChat',
          short_name: 'NovaChat',
          description: 'Next-Gen Realtime Messaging Powered by Supabase',
          theme_color: '#10b981',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          icons: [
            {
              src: '/nova-icon.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/nova-icon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        }
      })
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || "https://fijjtocoiaumfxzdjxbi.supabase.co"),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ""),
      'import.meta.env.VITE_MAPMYINDIA_API_KEY': JSON.stringify(env.VITE_MAPMYINDIA_API_KEY || "dtbcmezcuovukpygcuegiuimtvizaohaamid"),
      'import.meta.env.VITE_MAPPLS_API_KEY': JSON.stringify(env.VITE_MAPPLS_API_KEY || "dtbcmezcuovukpygcuegiuimtvizaohaamid"),
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY || "")
    },
    build: {
      target: 'esnext',
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'supabase-vendor': ['@supabase/supabase-js'],
            'ui-vendor': ['framer-motion', 'lucide-react', 'react-virtuoso'],
            'utils-vendor': ['date-fns', 'clsx', 'tailwind-merge'],
            'geo-vendor': ['leaflet', 'react-leaflet'],
            'chart-vendor': ['recharts']
          }
        }
      }
    },
    server: {
      port: 5173,
      host: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'unsafe-none',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
    },
    preview: {
      port: 4173,
      host: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'unsafe-none',
      },
    }
  };
});
