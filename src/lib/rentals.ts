import { supabase } from './supabase';
import type { Rental, RentalPlan, RentalQuote, RentalRequest } from '../types';

/** Como se diz o plano na rua — e no plural certo. */
export const PLAN_LABEL: Record<RentalPlan, string> = {
  hour: 'hora', day: 'dia', week: 'semana', month: 'mês',
};
export const PLAN_PLURAL: Record<RentalPlan, string> = {
  hour: 'horas', day: 'dias', week: 'semanas', month: 'meses',
};
export const PLANS: RentalPlan[] = ['hour', 'day', 'week', 'month'];

/** A pergunta que aparece ao lado do contador de quantidade. */
export const QTY_LABEL: Record<RentalPlan, string> = {
  hour: 'Quantas horas?', day: 'Quantos dias?', week: 'Quantas semanas?', month: 'Quantos meses?',
};

export const planText = (plan: RentalPlan, qty: number): string =>
  `${qty} ${qty === 1 ? PLAN_LABEL[plan] : PLAN_PLURAL[plan]}`;

export const REQUEST_STATE: Record<RentalRequest['state'], string> = {
  sent: 'à espera do dono',
  accepted: 'aceite pelo dono',
  declined: 'recusado',
  cancelled: 'cancelado por si',
};

/**
 * O aluguer chega com a migração 0003 e os lugares partilhados com a 0004.
 * Enquanto elas não estiverem aplicadas no projecto, o PostgREST responde
 * «relation does not exist» (42P01) ou «Could not find the table/function»
 * (PGRST205/PGRST202) — e isso não é erro para atirar à cara da pessoa, é
 * funcionalidade ainda não ligada.
 */
export const isNotReady = (error: { code?: string; message?: string } | null): boolean =>
  !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' ||
    /does not exist|Could not find the table|Could not find the function/i.test(error.message ?? ''));

export async function fetchRentals(): Promise<{ rows: Rental[]; error: string | null; missing: boolean }> {
  const { data, error } = await supabase
    .from('tr_rental')
    .select('*, tr_driver(public_name, rating, rating_count, model, plate)')
    .eq('state', 'active')
    .order('price_day_kz', { ascending: true })
    .limit(60);
  if (error) return { rows: [], error: error.message, missing: isNotReady(error) };
  return { rows: (data as Rental[]) ?? [], error: null, missing: false };
}

export async function fetchMyRequests(uid: string): Promise<{ rows: RentalRequest[]; missing: boolean }> {
  const { data, error } = await supabase
    .from('tr_rental_request')
    .select('*, rental:tr_rental(id, title, class_id, price_day_kz)')
    .eq('renter_id', uid)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) return { rows: [], missing: isNotReady(error) };
  return { rows: (data as RentalRequest[]) ?? [], missing: false };
}

export async function fetchOwnerRequests(driverId: string): Promise<{ rows: RentalRequest[]; missing: boolean }> {
  const { data, error } = await supabase
    .from('tr_rental_request')
    .select('*, rental:tr_rental(id, title, class_id, price_day_kz)')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) return { rows: [], missing: isNotReady(error) };
  return { rows: (data as RentalRequest[]) ?? [], missing: false };
}

export async function fetchMyRentals(driverId: string): Promise<Rental[]> {
  const { data } = await supabase
    .from('tr_rental')
    .select('*')
    .eq('driver_id', driverId)
    .order('updated_at', { ascending: false });
  return (data as Rental[]) ?? [];
}

/** Preço sempre do servidor: o cliente não faz contas do aluguer de ninguém. */
export async function quoteRental(
  rentalId: string, plan: RentalPlan, qty: number, withDriver: boolean,
): Promise<RentalQuote | null> {
  const { data, error } = await supabase.rpc('tr_rental_quote', {
    p_rental_id: rentalId, p_plan: plan, p_qty: qty, p_with_driver: withDriver,
  });
  if (error || !data) return null;
  return data as RentalQuote;
}

/** Um datetime-local do telemóvel em milissegundos, na hora de quem escolheu. */
export const toMs = (local: string): number => {
  const t = new Date(local).getTime();
  return Number.isFinite(t) ? t : Date.now() + 3600000;
};

export const defaultStart = (): string => {
  const d = new Date(Date.now() + 3 * 3600000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
};
