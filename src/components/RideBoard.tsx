import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, Users, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { BoardRow, CreatedTrip, Pickup, VehicleClass, Zone } from '../types';
import type { LatLon } from '../lib/geo';
import { fetchBoard, joinRide } from '../lib/rides';
import { cn, OFF } from '../lib/utils';
import { formatKz } from '../lib/money';
import { PickupField } from './PickupField';
import { VehicleArt, vehicleKindFor } from './VehicleArt';

interface RideBoardProps {
  zones: Zone[];
  classes: VehicleClass[];
  /** Centro da procura: o GPS quando o há, senão a zona de partida escolhida. */
  at: LatLon;
  toZoneId: string | null;
  pickup: Pickup | null;
  picking: boolean;
  onAskPick: () => void;
  onNote: (note: string) => void;
  onClearPickup: () => void;
  payment: 'cash' | 'multicaixa';
  seats: number;
  onSeats: (n: number) => void;
  onJoined: (trip: CreatedTrip, ride: string) => void;
  onError: (message: string) => void;
  /** Fecha o modo "lugar" e volta ao pedido de viagem fechada. */
  onWantPrivate: () => void;
}

const kmText = (km: number): string =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

/**
 * O quadro de saídas: as carrinhas que já estão a encher para o lado da pessoa.
 *
 * É a outra metade da rua — quem não aluga o carro inteiro compra um lugar. O
 * preço por lugar vem do servidor e está congelado desde que o motorista abriu
 * a corrida, por isso duas pessoas no mesmo banco pagam o mesmo.
 */
export function RideBoard({
  zones, classes, at, toZoneId, pickup, picking, onAskPick, onNote, onClearPickup,
  payment, seats, onSeats, onJoined, onError, onWantPrivate,
}: RideBoardProps) {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const zoneOf = useCallback((id: string) => zones.find((z) => z.id === id) ?? null, [zones]);
  const name = (id: string) => zoneOf(id)?.name ?? id;

  const load = useCallback(async () => {
    const { rows: r, missing: m } = await fetchBoard(at, toZoneId);
    setRows(r);
    setMissing(m);
    setLoading(false);
  }, [at, toZoneId]);

  useEffect(() => {
    setLoading(true);
    load();
    // O quadro mexe-se: um carro que encheu ou partiu deixa de servir. O
    // tempo real trata do imediato, o intervalo só segura quem ficou com o
    // telemóvel em segundo plano e voltou depois.
    const channel = supabase
      .channel('tr-ride-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tr_ride' }, () => load())
      .subscribe();
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 20000);
    return () => { window.clearInterval(tick); supabase.removeChannel(channel); };
  }, [load]);

  // Uma corrida que já partiu ou encheu não se compra: sai do quadro sozinha,
  // mas se estiver aberta no ecrã da pessoa tira-mos-lha assim que desaparece.
  useEffect(() => {
    if (picked && !rows.some((r) => r.ride_id === picked)) setPicked(null);
  }, [rows, picked]);

  const seatPrice = useMemo(
    () => rows.find((r) => r.ride_id === picked)?.seat_price_kz ?? 0,
    [rows, picked],
  );

  const buy = async (row: BoardRow) => {
    if (busy) return;
    setBusy(true);
    const { trip, error } = await joinRide({ rideId: row.ride_id, seats, payment, pickup });
    setBusy(false);
    if (error) { onError(error); load(); return; }
    // Levar quem anunciou e a hora de saída na mensagem de confirmação é o que
    // distingue «reservei» de «sei quando hei de estar à espera».
    if (trip) onJoined(trip, `${row.public_name} · ${departLabel(row.depart_at)}`);
  };

  if (missing) {
    return (
      <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-5 text-center">
        <p className="font-bold text-zinc-900 dark:text-white">Lugares partilhados ainda não estão ligados</p>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Peça a viagem fechada como sempre — é o mesmo carro, o mesmo preço da app.
        </p>
        <button onClick={onWantPrivate} className="mt-3 h-10 px-4 rounded-xl font-semibold text-[13px] bg-purple-600 text-white">
          Pedir viagem
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400">
        Os carros que já vão para o seu lado. Paga o lugar, não o carro inteiro — e o
        dinheiro só sai a bordo, com o código confirmado.
      </p>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" /> a procurar carrinhas a encher…
        </p>
      )}

      {!loading && rows.length === 0 && (
        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-5 text-center">
          <Users className="w-7 h-7 text-zinc-300 dark:text-zinc-600 mx-auto" />
          <p className="font-bold text-zinc-900 dark:text-white mt-2">
            Ainda não há corridas com lugares abertos por aqui
          </p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            Um motorista aprovado anuncia a corrida dele, com hora de saída. Quando
            houver, aparecem aqui — enquanto isso pode pedir a viagem fechada.
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={load} className="flex-1 h-10 rounded-xl font-semibold text-[13px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
              Procurar de novo
            </button>
            <button onClick={onWantPrivate} className="flex-1 h-10 rounded-xl font-semibold text-[13px] bg-purple-600 text-white">
              Pedir viagem
            </button>
          </div>
        </div>
      )}

      {rows.map((r) => {
        const open = picked === r.ride_id;
        const cls = classes.find((c) => c.id === r.class_id) ?? null;
        const from = zoneOf(r.from_zone_id);
        const maxSeats = Math.min(4, r.seats_left);
        return (
          <div
            key={r.ride_id}
            className={cn(
              'rounded-2xl border transition-colors overflow-hidden',
              open
                ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400'
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700',
            )}
          >
            <button
              type="button"
              onClick={() => { setPicked(open ? null : r.ride_id); onSeats(1); }}
              aria-expanded={open}
              className="w-full text-left p-4 flex items-start gap-3"
            >
              <VehicleArt
                kind={vehicleKindFor(r.class_id, cls?.icon)}
                tone={open ? 'active' : 'idle'}
                label={cls?.label ?? 'Corrida'}
                className="w-[54px] h-auto shrink-0 mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-bold text-[14px] leading-tight text-zinc-900 dark:text-white">
                  <span className="truncate">{name(r.from_zone_id)}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                  <span className="truncate">{name(r.to_zone_id)}</span>
                </span>
                <span className="block text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                  {cls?.label ?? 'lotação'} · {r.distance_km} km ·{' '}
                  {from ? `${kmText(r.away_km)} de si` : `${r.eta_min} min`}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                  <span className="rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-[12px] font-semibold text-purple-700 dark:text-purple-300">
                    {r.seats_left} de {r.capacity} lugares livres
                  </span>
                  <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                    {r.public_name}{r.rating > 0 ? ` · ${r.rating.toFixed(1)}` : ''}
                  </span>
                </span>
              </span>
              <span className="text-right shrink-0">
                <span className="block font-bold text-[16px] leading-none text-purple-600 dark:text-purple-400">
                  {formatKz(r.seat_price_kz)}
                </span>
                <span className="block text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 mt-0.5">/ lugar</span>
                <span className="block text-[12px] font-medium text-amber-600 dark:text-amber-400 mt-1.5">
                  {departLabel(r.depart_at)}
                </span>
              </span>
            </button>

            {open && (
              <div className="border-t border-purple-200/70 dark:border-purple-900 px-4 py-3 space-y-3 animate-enter-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-bold text-sm text-zinc-700 dark:text-zinc-200">
                    <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Lugares
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSeats(Math.max(1, seats - 1))}
                      aria-label="Menos lugares"
                      className="tap-pad w-9 h-9 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-bold tracking-tight text-lg text-zinc-700 dark:text-zinc-200"
                    >−</button>
                    <span className="font-bold tracking-tight text-lg w-6 text-center text-zinc-900 dark:text-white">{seats}</span>
                    <button
                      onClick={() => onSeats(Math.min(maxSeats, seats + 1))}
                      aria-label="Mais lugares"
                      className="tap-pad w-9 h-9 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-bold tracking-tight text-lg text-zinc-700 dark:text-zinc-200"
                    >+</button>
                  </div>
                </div>

                <PickupField
                  pickup={pickup}
                  picking={picking}
                  at={at}
                  zoneName={from?.name}
                  zones={zones}
                  onAskPick={onAskPick}
                  onNote={onNote}
                  onName={onNote}
                  onClear={onClearPickup}
                />

                <button
                  onClick={() => buy(r)}
                  disabled={busy || seats > r.seats_left}
                  className={cn(
                    'btn-main w-full h-12 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2',
                    (busy || seats > r.seats_left) && OFF,
                  )}
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
                  Reservar {seats} lugar{seats > 1 ? 's' : ''} · {formatKz(seatPrice * seats)}
                </button>
                <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 text-center">
                  Paga a bordo a {payment === 'cash' ? 'dinheiro' : 'Multicaixa'}. Quem lhe pedir
                  pagamento adiantado fora da app está a fugir à Elara — não pague.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** «sai em ~20 min» / «sai às 07:30» — é assim que a rua fala de uma carrinha. */
function departLabel(departAt: number): string {
  const mins = Math.round((departAt - Date.now()) / 60000);
  if (mins <= 0) return 'a sair agora';
  if (mins <= 45) return `sai em ~${mins} min`;
  const d = new Date(departAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `sai às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
