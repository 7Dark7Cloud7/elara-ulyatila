import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ao.elara.trajectoria',
  appName: 'Elara Ulyatila',
  webDir: 'dist',
  server: {
    // HTTPS coloca a WebView num contexto seguro: crypto.randomUUID, geolocalização
    // e as requisições ao Supabase exigem isso.
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
