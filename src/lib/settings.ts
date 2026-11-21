import { supabase } from './supabase';

/**
 * As condições comerciais da praça. `tr_setting` é uma linha única, leitura
 * aberta a qualquer conta (`tr_setting_read`) e escrita só da equipa
 * (`tr_setting_admin` → `is_admin()`), por isto é a única tabela de
 * configuração que esta app pode editar sem migração nenhuma.
 *
 * `marginSplit()` espelha **literalmente** o cálculo de `tr_quote` na 0001,
 * incluindo a graça de lançamento. Se a função do servidor mudar, este espelho
 * tem de mudar com ela — um número bonito que não bate certo com o recibo é
 * pior que nenhum número.
 */

export interface Setting {
  commission_pct: number;
  booking_fee_kz: number;
  cancel_fee_kz: number;
  min_driver_balance_kz: number;
  surge_cap: number;
  trial_trip_limit: number;
  launch_commission_until: number;
  province: string;
  updated_at: number;
}

/** Os campos que a consola escreve. `min_driver_balance_kz` fica de fora:
 *  nenhuma função aplicada o lê, e um controlo sem efeito é uma mentira na UI. */
export type WritableField =
  | 'commission_pct' | 'booking_fee_kz' | 'cancel_fee_kz'
  | 'surge_cap' | 'trial_trip_limit' | 'launch_commission_until';

export async function loadSetting(): Promise<{ setting: Setting | null; error: string | null }> {
  const { data, error } = await supabase.from('tr_setting').select('*').eq('id', 1).maybeSingle();
  if (error) return { setting: null, error: error.message };
  return { setting: (data as Setting) ?? null, error: null };
}

export async function saveSetting(patch: Partial<Setting>): Promise<string | null> {
  const { error } = await supabase.from('tr_setting').update(patch).eq('id', 1);
  if (!error) return null;
  // A política é `is_admin()`: uma conta normal lê mas não escreve.
  if (error.code === 'PGRST102' || /row-level|permission|policy/i.test(error.message)) {
    return 'Só uma conta de equipa altera as condições. Esta conta pode ler, não pode escrever.';
  }
  return error.message;
}

export interface Split {
  commissionKz: number;
  driverKeepsKz: number;
  /** A graça está a contar: a comissão é 0 por decisão, não por erro. */
  inGrace: boolean;
}

/** O mesmo arredondamento do servidor: `round((preço − taxa) × pct / 100)`. */
export const marginSplit = (priceKz: number, s: Setting, now = Date.now()): Split => {
  const inGrace = now < (s.launch_commission_until ?? 0);
  if (inGrace) return { commissionKz: 0, driverKeepsKz: priceKz, inGrace: true };
  const base = Math.max(0, priceKz - s.booking_fee_kz);
  const commissionKz = Math.max(0, Math.round((base * s.commission_pct) / 100));
  return { commissionKz, driverKeepsKz: priceKz - commissionKz, inGrace: false };
};

/** A data legível do fim da graça; `null` quando já terminou ou não está posta. */
export const graceEnds = (s: Setting, now = Date.now()): string | null => {
  const until = s.launch_commission_until ?? 0;
  if (!until || until <= now) return null;
  return new Date(until).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** O teto de hora de pico que o servidor realmente aplica: `least(1.1, cap)`
 *  nas janelas 07–09 e 17–20. Passar de 1,1 não muda seja o que for. */
export const PEAK_CEILING = 1.1;
export const effectivePeak = (cap: number): number => Math.min(PEAK_CEILING, cap);
