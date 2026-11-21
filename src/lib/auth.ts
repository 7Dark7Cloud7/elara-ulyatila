import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { SessionUser } from '../types';

const PORTUGUESE_ERRORS: Array<{ match: RegExp; message: string }> = [
  { match: /invalid login credentials|invalid credentials|invalid_credentials/i,
    message: 'Email ou palavra-passe incorrectos. Verifique os dados e tente novamente.' },
  { match: /email not confirmed|email_confirm/i,
    message: 'Ainda não confirmou o seu email. Abra o link que lhe enviámos ou peça um novo abaixo.' },
  { match: /user already registered|already been registered|duplicate/i,
    message: 'Já existe uma conta com este email. Inicie sessão ou recupere a palavra-passe.' },
  { match: /password should be at least|weak_password|too short/i,
    message: 'A palavra-passe é demasiado curta. Use pelo menos 6 caracteres.' },
  { match: /for an added security|rate limit|over_|too many/i,
    message: 'Demasiados pedidos. Aguarde alguns minutos e tente de novo.' },
  { match: /unable to authenticate|invalid claim|jwt expired|refresh token not found|session_missing/i,
    message: 'A sua sessão expirou. Inicie sessão novamente para continuar.' },
  { match: /network|failed to fetch|load failed|timeout/i,
    message: 'Não foi possível contactar o servidor. Verifique a sua ligação à internet.' },
  { match: /missing or empty|validate|invalid email|invalid input/i,
    message: 'Verifique o email e a palavra-passe introduzidos.' },
];

export const translateAuthError = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = (err as { code?: string } | null)?.code ?? '';
  const haystack = `${code} ${raw}`;
  const found = PORTUGUESE_ERRORS.find((entry) => entry.match.test(haystack));
  if (found) return found.message;
  return raw && raw !== 'Error' ? raw : 'Não foi possível concluir a operação. Tente novamente.';
};

/**
 * A mesma conta do Elara serve aqui: a linha em `profiles` é o que liga o
 * motorista, a viagem e a carteira ao dono. O papel vive na base de dados —
 * nunca se decide nada no cliente a partir do user_metadata.
 */
export const sessionUserFromAuth = async (user: User): Promise<SessionUser> => {
  const fallbackName =
    user.user_metadata?.full_name || user.user_metadata?.name ||
    user.email?.split('@')[0] || 'Utilizador Elara';

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) {
    return {
      uid: user.id,
      name: fallbackName,
      email: user.email || '',
      isAdmin: false,
    };
  }

  return {
    uid: data.id,
    name: data.full_name || fallbackName,
    email: user.email || '',
    isAdmin: data.role === 'admin',
  };
};
