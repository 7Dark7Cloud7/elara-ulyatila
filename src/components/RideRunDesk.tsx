import { useCallback, useEffect, useMemo, useState } from 'react';
import { Armchair, Loader2, MapPin, Power, Users, X } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import type { Driver, RideManifest, VehicleClass, Zone } from '../types';
import { distanceText, type LatLon } from '../lib/geo';
import { departText, fetchOpenRides, nextDepartOptions, openRide, rideAction, ridesLive, RIDE_STATE_LABEL } from '../lib/rides';
import { STATE_LABEL } from '../lib/trips';
import { ZonePicker } from './ZonePicker';
import { cn, OFF } from '../lib/utils';
import { formatKz } from '../lib/money';

export interface RunPickupPin { id: string; at: LatLon; label: string; tone: 'pick' }

interface RideRunDeskProps {
  driver: Driver;
  zones: Zone[];
  cls: VehicleClass;
  /** Posição do motorista, para dizer «a 300 m do ponto dele». */
  at: LatLon | null;
  /** O mapa da praça pinta o ponto de embarque de cada passageiro. */
  onPins: (pins: RunPickupPin[]) => void;
  /** Tocar numa pessoa passa o painel à viagem dela — é como se serve uma carrinha cheia. */
  onPickTrip?: (tripId: string) => void;
  /** A viagem que o painel está a mostrar agora. */
  pickedTripId?: string | null;
  onError: (message: string) => void;
}

/**
 * A secretária da corrida partilhada: o motorista anuncia rota e hora de saída,
 * e vê entrar lugar a lugar.
 *
 * O preço nunca se escreve à mão — vem da tabela no momento em que a corrida
 * nasce, e é por isso que duas pessoas no mesmo banco pagam o mesmo. É também o
 * que impede o «ai mudou o preço porque já vamos tarde», a discussão que a rua
 * conhece bem.
 */
export function RideRunDesk({ driver, zones, cls, at, onPins, onPickTrip, pickedTripId, onError }: RideRunDeskProps) {
  const [run, setRun] = useState<RideManifest | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [from, setFrom] = useState<string | null>(driver.home_zone_id);
  const [to, setTo] = useState<string | null>(null);
  const [depart, setDepart] = useState(1);
  const [note, setNote] = useState('');
  const [price, setPrice] = useState<number | null>(null);

  const zone = useCallback((id: string) => zones.find((z) => z.id === id) ?? null, [zones]);

  const load = useCallback(async () => {
    const list = await fetchOpenRides(driver.id);
    setRun(list[0] ?? null);
    setLoading(false);
  }, [driver.id]);

  useEffect(() => {
    let alive = true;
    // Sem a migração 0004 aplicada não há corrida partilhada para anunciar: a
    // secretária fecha-se em vez de prometer lugares que ninguém pode vender.
    ridesLive().then((v) => {
      if (!alive) return;
      setReady(v);
      if (v) load();
      else setLoading(false);
    });
    return () => { alive = false; };
  }, [load]);

  // Quem compra um lugar aparece aqui no mesmo segundo: esta é a lista com que
  // se conduz uma carrinha cheia, sem grupo de WhatsApp pelo meio.
  useEffect(() => {
    if (!ready) return;
    const channel = supabase
      .channel(`tr-run-${driver.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tr_ride', filter: `driver_id=eq.${driver.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tr_trip', filter: `driver_id=eq.${driver.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ready, driver.id, load]);

  const pins = useMemo<RunPickupPin[]>(() => (
    run ? run.passengers.flatMap((p) => (p.pickup
      ? [{ id: p.trip_id, at: { lat: p.pickup.lat, lon: p.pickup.lon }, label: p.name || 'embarque', tone: 'pick' as const }]
      : [])) : []
  ), [run]);

  useEffect(() => { onPins(pins); }, [pins, onPins]);

  // O preço mostra-se antes de anunciar, para o motorista saber o que está a
  // vender — mas é sempre o servidor a congelá-lo.
  useEffect(() => {
    if (!form || !from || !to || from === to) { setPrice(null); return; }
    let alive = true;
    supabase
      .rpc('tr_quote', {
        p_class_id: cls.id, p_from_zone_id: from, p_to_zone_id: to,
        p_seats: 1, p_kind: 'passageiro', p_parcel_size: null,
      })
      .then(({ data, error }) => {
        if (!alive) return;
        setPrice(error ? null : (data as { priceKz: number }).priceKz);
      });
    return () => { alive = false; };
  }, [form, from, to, cls.id]);

  const open = async () => {
    if (!from || !to || busy) return;
    setBusy(true);
    const res = await openRide({
      fromZoneId: from, toZoneId: to,
      departAt: nextDepartOptions()[depart].at, note,
    });
    setBusy(false);
    if (!res.ok) { onError(rpcError({ message: res.error })); return; }
    setForm(false); setNote(''); setPrice(null); setTo(null);
    load();
  };

  const act = async (fn: 'tr_depart_ride' | 'tr_close_ride' | 'tr_cancel_ride') => {
    if (!run || busy) return;
    setBusy(true);
    const msg = await rideAction(fn, run.ride.id);
    setBusy(false);
    if (msg) { onError(rpcError({ message: msg })); }
    load();
  };

  if (!ready || loading) return null;

  // — Anunciar ————————————————————————————————————————————————————————————————
  if (!run) {
    if (!form) {
      return (
        <button
          onClick={() => setForm(true)}
          className="w-full text-left rounded-2xl border border-dashed border-purple-300 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/30 p-4 flex items-center gap-3"
        >
          <Armchair className="w-6 h-6 shrink-0 text-purple-600 dark:text-purple-400" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-[14px] text-zinc-900 dark:text-white">
              Vender lugares da sua {cls.label.toLowerCase()}
            </span>
            <span className="block text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
              Anuncie a rota e a hora de saída. Quem entra paga o lugar a bordo, com código.
            </span>
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-purple-700 dark:text-purple-300">
            abrir
          </span>
        </button>
      );
    }

    const canOpen = !!from && !!to && from !== to;
    return (
      <div className="animate-enter-sm rounded-2xl bg-white dark:bg-zinc-900 border border-purple-300 dark:border-purple-800 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-bold text-[14px] text-zinc-900 dark:text-white">
            <Armchair className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Corrida de lugares
          </p>
          <button
            onClick={() => setForm(false)}
            aria-label="Desistir de anunciar"
            className="tap-pad w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <ZonePicker compact tone="from" label="Ponto de partida" value={from} zones={zones} onChange={setFrom} />
          <div className="h-px bg-zinc-200 dark:bg-zinc-700 ml-[26px]" />
          <ZonePicker compact tone="to" label="Destino" value={to} zones={zones} onChange={setTo} />
        </div>

        <div>
          <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
            Hora de saída
          </p>
          <div className="flex flex-wrap gap-1.5">
            {nextDepartOptions().map((o, i) => (
              <button
                key={o.label}
                onClick={() => setDepart(i)}
                aria-pressed={depart === i}
                className={cn(
                  'h-9 px-3 rounded-xl text-[12px] font-semibold border transition-colors',
                  depart === i
                    ? 'bg-purple-100 dark:bg-purple-900/40 border-purple-400 text-purple-700 dark:text-purple-300'
                    : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 140))}
          aria-label="Nota da corrida"
          placeholder="Nota para quem entra: ex. passa na Av. 21, sai cheio"
          className="w-full h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 text-[13px] font-bold outline-none focus:border-purple-400 placeholder:text-zinc-500"
        />

        <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
          {price
            ? `Lugar a ${formatKz(price)} — o preço da tabela para este traço, congelado quando abrir a corrida. Não se escreve à mão.`
            : canOpen
              ? 'A calcular o preço da tabela…'
              : 'Escolha partida e destino diferentes.'}
        </p>

        <button
          onClick={open}
          disabled={!canOpen || busy}
          className={cn(
            'btn-main w-full h-12 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2',
            (!canOpen || busy) && OFF,
          )}
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5" />}
          Anunciar corrida
        </button>
      </div>
    );
  }

  // — A corrida aberta ————————————————————————————————————————————————————————
  const r = run.ride;
  const a = zone(r.from_zone_id);
  const b = zone(r.to_zone_id);
  const filled = Math.round((r.seats_taken / r.capacity) * 100);

  return (
    <div className={cn(
      'rounded-2xl border p-4 space-y-3',
      r.state === 'open'
        ? 'bg-white dark:bg-zinc-900 border-purple-300 dark:border-purple-800'
        : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-[14px] leading-tight text-zinc-900 dark:text-white truncate">
            {a?.name ?? r.from_zone_id} → {b?.name ?? r.to_zone_id}
          </p>
          <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
            {cls.label} · {r.distance_km} km · {formatKz(r.seat_price_kz)} por lugar
          </p>
        </div>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold',
          r.state === 'open'
            ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
            : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300',
        )}>
          {RIDE_STATE_LABEL[r.state]}
        </span>
      </div>

      <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
        {r.seats_taken} de {r.capacity} lugares vendidos
        {/* A hora que se anuncia só faz sentido enquanto o carro não saiu: dizer
            «sai em 20 min» de um carro que já partiu era inventar. */}
        {r.state === 'open' ? ` · ${departText(r.depart_at)}` : ' · este carro já partiu'}
      </p>
      <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-600 transition-[width] duration-500"
          style={{ width: r.seats_taken === 0 ? '0%' : `${Math.max(4, filled)}%` }}
          role="progressbar"
          aria-valuenow={r.seats_taken}
          aria-valuemin={0}
          aria-valuemax={r.capacity}
        />
      </div>
      {r.note && (
        <p className="text-[12px] font-bold text-zinc-600 dark:text-zinc-300">
          A sua nota: “{r.note}”
        </p>
      )}

      {run.passengers.length === 0 ? (
        <p className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400">
          Ainda ninguém entrou. Quem comprar aparece aqui, com o ponto onde quer
          ser apanhado.
        </p>
      ) : (
        <>
          {onPickTrip && run.passengers.length > 1 && (
            <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              Toque em uma pessoa para abrir a viagem dela — o código, o chat e o
              estado são de cada uma, não do carro.
            </p>
          )}
          <ul className="space-y-2">
            {run.passengers.map((p) => {
              const away = p.pickup && at ? distanceText(at, p.pickup) : null;
              const here = pickedTripId === p.trip_id;
              const body = (
                <>
                  <p className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-900 dark:text-white">
                      {p.name || 'Passageiro'}
                    </span>
                    <span className="shrink-0 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                      {p.seats} lug. · {formatKz(p.price_kz)}
                    </span>
                  </p>
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-purple-700 dark:text-purple-300 mt-0.5">
                    <Users className="w-3 h-3 shrink-0" />
                    {STATE_LABEL[p.state] ?? p.state}
                    {away && <span className="text-zinc-500 dark:text-zinc-400">· ponto a {away}</span>}
                  </p>
                  {p.pickup && (
                    <p className="flex items-start gap-1.5 text-[12px] font-medium text-amber-800 dark:text-amber-300 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                      {p.pickup.note?.trim() || 'marcado no mapa'}
                    </p>
                  )}
                </>
              );
              return (
                <li
                  key={p.trip_id}
                  className={cn(
                    'rounded-xl border px-3 py-2',
                    here
                      ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400 dark:border-purple-700'
                      : 'bg-zinc-50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800',
                  )}
                >
                  {onPickTrip ? (
                    <button
                      type="button"
                      onClick={() => onPickTrip(p.trip_id)}
                      aria-pressed={here}
                      className="w-full text-left"
                    >
                      {body}
                    </button>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {r.state === 'open' ? (
        <div className="flex gap-2">
          <button
            onClick={() => act('tr_depart_ride')}
            disabled={busy || r.seats_taken === 0}
            className={cn(
              'btn-main flex-1 h-11 rounded-2xl font-semibold text-[13px] flex items-center justify-center gap-2',
              (busy || r.seats_taken === 0) && OFF,
            )}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
            Partir
          </button>
          {r.seats_taken === 0 && (
            <button
              onClick={() => act('tr_cancel_ride')}
              disabled={busy}
              className="h-11 px-3 rounded-2xl font-semibold text-[13px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
            >
              Tirar do quadro
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => act('tr_close_ride')}
          disabled={busy}
          className={cn(
            'w-full h-11 rounded-2xl font-semibold text-[13px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200',
            busy && OFF,
          )}
        >
          Fechar a corrida
        </button>
      )}
      <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
        {r.state === 'open'
          ? 'Só se parte com pelo menos um lugar vendido. Depois de partir, o quadro deixa de a mostrar.'
          : 'Fecha quando todas as viagens do carro estiverem terminadas — cada passageiro liquida-se por si.'}
      </p>
    </div>
  );
}
