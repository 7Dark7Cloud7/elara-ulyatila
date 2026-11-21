import { supabase } from './supabase';
import { isNotReady } from './rentals';

/**
 * A camada da migração 0005.
 *
 * Nada disto existe no servidor enquanto a 0005 não for aplicada. Em vez de
 * mostrar um erro a quem toca num botão, cada ecrã pergunta primeiro «está lá?»
 * e esconde-se quando não está — a app funciona exactamente como antes, com o
 * extra a aparecer no dia em que a migração correr.
 */

const probe = async (table: string): Promise<boolean> => {
  const { error } = await supabase.from(table).select('id').limit(1);
  return !isNotReady(error);
};

export const reviewsLive = () => probe('tr_review');
export const placesLive = () => probe('tr_saved_place');
export const tripPrefsLive = () => probe('tr_trip_pref');
export const referralsLive = () => probe('tr_referral');
export const shareLinksLive = () => probe('tr_share_token');

/** Elogios escolhidos depois das estrelas. As estrelas já vivem na viagem. */
export async function addReview(tripId: string, tags: string[]): Promise<string | null> {
  const { error } = await supabase.rpc('tr_add_review', { p_trip_id: tripId, p_tags: tags });
  return error ? error.message.replace(/^ERROR:\s*/i, '') : null;
}

export interface SavedPlace {
  id: string;
  label: string;
  emoji: string;
  zone_id: string | null;
  lat: number;
  lon: number;
  note: string;
}

const EMOJIS = ['🏠', '🏫', '⛪', '🛒', '🏭', '💼', '🏥', '⛽'];
export const PLACE_EMOJIS = EMOJIS;

export async function fetchPlaces(uid: string): Promise<SavedPlace[] | null> {
  const { data, error } = await supabase
    .from('tr_saved_place')
    .select('id, label, emoji, zone_id, lat, lon, note')
    .eq('owner_id', uid)
    .order('created_at', { ascending: true })
    .limit(12);
  if (error) return isNotReady(error) ? null : [];
  return (data as SavedPlace[]) ?? [];
}

export async function savePlace(input: Omit<SavedPlace, 'id' | 'created_at'> & { owner_id: string }): Promise<string | null> {
  const { error } = await supabase.from('tr_saved_place').insert({
    owner_id: input.owner_id,
    label: input.label.slice(0, 40),
    emoji: EMOJIS.includes(input.emoji) ? input.emoji : EMOJIS[0],
    zone_id: input.zone_id,
    lat: input.lat,
    lon: input.lon,
    note: input.note.slice(0, 80),
    created_at: Date.now(),
  });
  return error ? error.message.replace(/^ERROR:\s*/i, '') : null;
}

export async function deletePlace(id: string): Promise<string | null> {
  const { error } = await supabase.from('tr_saved_place').delete().eq('id', id);
  return error ? error.message.replace(/^ERROR:\s*/i, '') : null;
}

/** O ambiente que a pessoa quer dentro do carro. Não é uma promessa de serviço:
 *  é uma nota que o motorista lê e faz o que puder. */
export const VIBES = ['silencio', 'calmo', 'kuduro', 'semba'] as const;
export type Vibe = (typeof VIBES)[number];

export const VIBE_LABEL: Record<Vibe, string> = {
  silencio: 'Silêncio',
  calmo: 'Música calma',
  kuduro: 'Kuduro',
  semba: 'Semba',
};

export async function setTripVibe(tripId: string, vibe: Vibe): Promise<string | null> {
  const { error } = await supabase.rpc('tr_set_trip_pref', { p_trip_id: tripId, p_vibe: vibe });
  return error ? error.message.replace(/^ERROR:\s*/i, '') : null;
}

export async function tripVibe(tripId: string): Promise<Vibe | null> {
  const { data, error } = await supabase
    .from('tr_trip_pref')
    .select('vibe')
    .eq('trip_id', tripId)
    .maybeSingle();
  if (error || !data) return null;
  const v = (data as { vibe: Vibe }).vibe;
  return VIBES.includes(v) ? v : null;
}

/**
 * Referência de convite. O código é só um código: o crédito de quem o usa fica
 * `pending` até a equipa confirmar, e nada nesta app dá crédito sozinho.
 */
export interface Referral {
  id: string;
  code: string;
  status: 'pending' | 'confirmed' | 'rejected';
  who: string;
  at: number;
}

export async function myReferralCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc('tr_referral_code');
  if (error) return null;
  return (data as { code: string })?.code ?? null;
}

export async function claimReferral(code: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('tr_claim_referral', { p_code: code.trim().toUpperCase() });
  if (error) return { ok: false, error: error.message.replace(/^ERROR:\s*/i, '') };
  const d = data as { ok: boolean; status?: string } | null;
  return { ok: !!d?.ok };
}

export async function listReferrals(): Promise<Referral[] | null> {
  const { data, error } = await supabase
    .from('tr_referral')
    .select('id, code, status, who, at')
    .order('at', { ascending: false })
    .limit(100);
  if (error) return isNotReady(error) ? null : [];
  return (data as Referral[]) ?? [];
}

/**
 * A equipa confirma ou recusa. Nunca dá saldo: o crédito entra pelo fluxo de
 * pedidos de dinheiro que já existe, e fica nas mãos de quem vê a fila.
 */
export async function decideReferral(id: string, confirm: boolean, note: string): Promise<string | null> {
  const { error } = await supabase.rpc('tr_decide_referral', { p_id: id, p_confirm: confirm, p_note: note });
  return error ? error.message.replace(/^ERROR:\s*/i, '') : null;
}

/**
 * Ligação de partilha: um token de leitura que mostra a viagem a uma terceira
 * pessoa sem sessão, sem PIN e sem telefone. O token não dá acesso à conta de
 * ninguém — só ao que já ia na mensagem de partilha.
 */
export async function createShareToken(tripId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('tr_share_create', { p_trip_id: tripId });
  if (error) return null;
  return (data as { token: string })?.token ?? null;
}

export interface SharedTrip {
  code: string;
  state: string;
  kind: string;
  from: string;
  to: string;
  distance_km: number;
  price_kz: number;
  driver_name: string | null;
  car_model: string | null;
  plate: string | null;
  created_at: number;
  expires_at: number;
}

export async function readSharedTrip(token: string): Promise<SharedTrip | 'gone' | 'missing'> {
  const { data, error } = await supabase.rpc('tr_share_read', { p_token: token });
  if (error) return isNotReady(error) ? 'missing' : 'gone';
  if (!data) return 'gone';
  return data as SharedTrip;
}

/**
 * Quadro da semana: corridas fechadas e média. Sem valores em Kwanza — uma
 * equipa de uma a três pessoas não audita ganhos, e um quadro errado sobre
 * dinheiro estragaria a confiança de quem conduz.
 */
export interface BoardRow {
  id: string;
  public_name: string;
  vehicle: string;
  plate: string;
  trips: number;
  rating: number | null;
}

export async function fetchLeaderboard(days = 7): Promise<BoardRow[] | null> {
  const { data, error } = await supabase.rpc('tr_leaderboard', { p_days: days });
  if (error) return isNotReady(error) ? null : [];
  return (data as unknown as BoardRow[]) ?? [];
}
