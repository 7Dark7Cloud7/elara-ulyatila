import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isValidUrl = (url: string) => {
  try {
    return new URL(url).protocol.startsWith('http');
  } catch {
    return false;
  }
};

// Placeholders se as variáveis faltarem: a app abre, só não fala com o servidor.
const placeholderUrl = 'https://placeholder-project.supabase.co';
const placeholderKey = 'placeholder-key';

export const supabase = createClient(
  (supabaseUrl && isValidUrl(supabaseUrl)) ? supabaseUrl : placeholderUrl,
  supabaseAnonKey || placeholderKey,
  {
    realtime: {
      params: { eventsPerSecond: 4 },
    },
  },
);

if (!supabaseUrl || !supabaseAnonKey || !isValidUrl(supabaseUrl)) {
  console.error('Supabase não inicializado corretamente. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

export const rpcError = (error: { message?: string } | null): string =>
  error?.message?.replace(/^ERROR:\s*/i, '').trim() || 'Não foi possível concluir a operação.';
