import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0'),
  },
  server: {
    host: true,
    port: 5180,
  },
  build: {
    // es2020 e o mínimo: o MapLibre usa literais BigInt, que o es2018 não
    // sabe baixar. Chrome 67+ (Android 8 para cima) tem os dois.
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
