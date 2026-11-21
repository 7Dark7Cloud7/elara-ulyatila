import { supabase } from './supabase';
import { isNotReady } from './rentals';
import type { BoardRow, CreatedTrip, Pickup, RideManifest, RideState } from '../types';

/**
 * O quadro de saídas (0004).
 *
 * Comprar um lugar não é alugar o carro inteiro: é entrar numa corrida que um
 * motorista aprovado já abriu, com rota, hora de saída e preço POR LUGAR
 * congelados no servidor. Cada compra é uma `tr_trip` normal por baixo — por
 * isso o PIN, o chat, a liquidação e o historial funcionam sem nada novo.
 */

export const RIDE_STATE_LABEL: Record<RideState, string> = {
  open: 'a encher',
  departed: 'partiu',
  closed: 'terminada',
  cancelled: 'cancelada',
};

/** A hora de saída, dita como a rua diz: «sai às 07:30» ou «sai daqui a 20 min». */
export function departText(departAt: number, now = Date.now()): string {
  const mins = Math.round((departAt - now) / 60000);
  if (mins <= 0) return 'está a sair agora';
  if (mins <= 45) return `sai em ~${mins} min`;
  const d = new Date(departAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay) return `sai às ${hhmm}`;
  return `sai ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${hhmm}`;
}

/** Minutos redondos para a hora de saída — ninguém anuncia «sai às 07:43». */
export const nextDepartOptions = (now = Date.now()): { label: string; at: number }[] => [
  { label: 'daqui a 15 min', at: now + 15 * 60000 },
  { label: 'daqui a 30 min', at: now + 30 * 60000 },
  { label: 'daqui a 1 hora', at: now + 60 * 60000 },
  { label: 'daqui a 2 horas', at: now + 120 * 60000 },
  { label: 'amanhã de manhã', at: now + 14 * 3600000 },
];

/**
 * A migração 0004 está aplicada neste project? Uma leitura de 1 linha responde
 * sem escrever seja o que for: enquanto ela não estiver lá, a app esconde os
 * lugares partilhados em vez de prometer algo que não pode cumprir.
 */
export async function ridesLive(): Promise<boolean> {
  const { error } = await supabase.from('tr_ride').select('id').limit(1);
  return !isNotReady(error);
}

/** O quadro de saídas à volta de um ponto. Nem matrícula, nem telefone. */
export async function fetchBoard(
  at: Pickup | null,
  toZoneId?: string | null,
  radiusKm = 12,
): Promise<{ rows: BoardRow[]; missing: boolean }> {
  if (!at) return { rows: [], missing: false };
  const { data, error } = await supabase.rpc('tr_nearby_rides', {
    p_lat: at.lat,
    p_lon: at.lon,
    p_radius_km: radiusKm,
    p_to_zone_id: toZoneId ?? null,
  });
  if (error) return { rows: [], missing: isNotReady(error) };
  return { rows: (data as BoardRow[]) ?? [], missing: false };
}

/** Quantos lugares há livres HOJE numa corrida ainda aberta. */
export async function fetchOpenRides(driverId: string): Promise<RideManifest[]> {
  const { data } = await supabase
    .from('tr_ride')
    .select('id')
    .eq('driver_id', driverId)
    .in('state', ['open', 'departed'])
    .limit(1);
  const row = (data ?? [])[0] as { id: string } | undefined;
  if (!row) return [];
  const m = await fetchManifest(row.id);
  return m ? [m] : [];
}

export async function fetchManifest(rideId: string): Promise<RideManifest | null> {
  const { data, error } = await supabase.rpc('tr_ride_manifest', { p_ride_id: rideId });
  if (error || !data) return null;
  return data as RideManifest;
}

export async function openRide(input: {
  fromZoneId: string;
  toZoneId: string;
  departAt: number;
  note: string;
}): Promise<{ ok: boolean; error?: string; id?: string; seatPriceKz?: number; capacity?: number }> {
  const { data, error } = await supabase.rpc('tr_open_ride', {
    p_from_zone_id: input.fromZoneId,
    p_to_zone_id: input.toZoneId,
    p_depart_at: input.departAt,
    p_note: input.note.trim(),
  });
  if (error) return { ok: false, error: error.message };
  const d = data as { id: string; seat_price_kz: number; capacity: number };
  return { ok: true, id: d.id, seatPriceKz: d.seat_price_kz, capacity: d.capacity };
}

export async function joinRide(input: {
  rideId: string;
  seats: number;
  payment: 'cash' | 'multicaixa';
  pickup: Pickup | null;
}): Promise<{ trip?: CreatedTrip; error?: string }> {
  const { data, error } = await supabase.rpc('tr_join_ride', {
    p_ride_id: input.rideId,
    p_seats: input.seats,
    p_payment: input.payment,
    p_pickup: input.pickup ? { lat: input.pickup.lat, lon: input.pickup.lon, note: input.pickup.note ?? '' } : null,
  });
  if (error) return { error: error.message };
  return { trip: data as CreatedTrip };
}

export async function setPickup(tripId: string, pickup: Pickup): Promise<string | null> {
  const { error } = await supabase.rpc('tr_set_pickup', {
    p_trip_id: tripId,
    p_pickup: { lat: pickup.lat, lon: pickup.lon, note: pickup.note ?? '' },
  });
  return error ? error.message : null;
}

export async function rideAction(
  fn: 'tr_depart_ride' | 'tr_close_ride' | 'tr_cancel_ride',
  rideId: string,
): Promise<string | null> {
  const { error } = await supabase.rpc(fn, { p_ride_id: rideId });
  return error ? error.message : null;
}
