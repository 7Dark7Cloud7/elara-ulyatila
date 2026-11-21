import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, Loader2, MapPin, Navigation, UserRound, XCircle } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import type { Driver, SessionUser, Trip, TripState, Zone } from '../types';
import { ChatPanel } from './ChatPanel';
import { RateStars } from './RateStars';
import { ReportSheet, ReportButton } from './ReportSheet';
import { tripPrefsLive, tripVibe, VIBE_LABEL } from '../lib/extras';
import { STATE_LABEL, mapsUrl, nextHint, wazeUrl } from '../lib/trips';
import { cn, when, OFF } from '../lib/utils';
import { formatKz } from '../lib/money';

interface DriverConsoleProps {
  tripId: string;
  user: SessionUser;
  driver: Driver;
  zones: Zone[];
  onFinished: () => void;
  onError: (message: string) => void;
}

/** As fases em que o carro vai a andar. Não medimos velocidade — fechamos o
 *  teclado nestas três porque é nelas que ele se usa ao volante. */
const DRIVING: TripState[] = ['accepted', 'arriving', 'ongoing'];

const DRIVE_LOCK = 'Ao volante não se escreve. Use uma resposta rápida '
  + 'ou pare o carro antes de conversar.';

/**
 * A corrida na mão do motorista: avanços com regras no servidor, código escrito
 * (nunca lido), e o fecho que liquida a carteira.
 */
export function DriverConsole({
  tripId, user, driver, zones, onFinished, onError,
}: DriverConsoleProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  // A outra ponta da fila de reportes: sem isto o motorista não tem por onde
  // denunciar, embora a tabela aceite `by_role = 'driver'`.
  const [reportOpen, setReportOpen] = useState(false);
  // O cancelamento confirma-se dentro da app: o diálogo do browser tapa o
  // ecrã, e num carro em movimento isso é um risco a mais.
  const [askCancel, setAskCancel] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [vibe, setVibe] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    tripPrefsLive().then(async (on) => {
      if (!alive || !on) return;
      const v = await tripVibe(tripId);
      if (alive && v) setVibe(VIBE_LABEL[v]);
    });
    return () => { alive = false; };
  }, [tripId]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('tr_trip')
        .select('*')
        .eq('id', tripId)
        .maybeSingle();
      if (alive && data) setTrip(data as Trip);
    };
    load();
    const channel = supabase
      .channel(`tr-dtrip-${tripId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tr_trip', filter: `id=eq.${tripId}` },
        (payload) => {
          setTrip((prev) => (prev ? { ...prev, ...(payload.new as Partial<Trip>) } : (payload.new as Trip)));
        },
      )
      .subscribe();
    // Seguro contra o tempo real que cai sem avisar: a corrida pode ter mudado
    // de estado e o painel do motorista não pode ficar preso noutro tempo.
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 20000);
    return () => { alive = false; window.clearInterval(poll); supabase.removeChannel(channel); };
  }, [tripId]);

  if (!trip) {
    return <p className="text-center text-zinc-500 dark:text-zinc-400 py-16 text-sm">a carregar a corrida…</p>;
  }

  const from = zones.find((z) => z.id === trip.from_zone_id)?.name ?? trip.from_zone_id;
  const to = zones.find((z) => z.id === trip.to_zone_id)?.name ?? trip.to_zone_id;
  const fromZone = zones.find((z) => z.id === trip.from_zone_id) ?? null;
  const toZone = zones.find((z) => z.id === trip.to_zone_id) ?? null;
  const done = trip.state === 'ended' || trip.state === 'rated' || trip.state === 'cancelled';
  const cancelled = trip.state === 'cancelled';
  // O ponto que a pessoa marcou vale mais que o centro do bairro: é lá que o
  // carro tem de parar. No destino, abre-se o mapa que o motorista já usa.
  const pickAt = trip.pickup ?? fromZone;
  const navAt = ['ongoing', 'waiting_drop'].includes(trip.state) ? toZone : pickAt;
  const navLabel = ['ongoing', 'waiting_drop'].includes(trip.state) ? to : from;

  const rate = async (n: number) => {
    if (ratingBusy || score) return;
    setRatingBusy(true);
    const { error } = await supabase.rpc('tr_rate', { p_trip_id: trip.id, p_score: n });
    setRatingBusy(false);
    if (error) { onError(rpcError(error)); return; }
    setScore(n);
  };

  const run = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    if (busy) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) onError(rpcError(error));
  };

  const advance = (to_state: string) =>
    run(() => supabase.rpc('tr_advance', { p_trip_id: trip.id, p_to: to_state }) as unknown as Promise<{ error: { message: string } | null }>);

  const verifyPin = () =>
    run(async () => {
      if (!/^\d{4}$/.test(pin)) { onError('O código tem 4 números.'); return { error: null }; }
      const res = await supabase.rpc('tr_verify_pin', { p_trip_id: trip.id, p_pin: pin });
      return res as unknown as { error: { message: string } | null };
    });

  const verifyDropPin = () =>
    run(async () => {
      if (!/^\d{4}$/.test(pin)) { onError('O código de entrega tem 4 números.'); return { error: null }; }
      const res = await supabase.rpc('tr_verify_drop_pin', { p_trip_id: trip.id, p_pin: pin });
      return res as unknown as { error: { message: string } | null };
    });

  const finish = () =>
    run(() => supabase.rpc('tr_finish_trip', { p_trip_id: trip.id }) as unknown as Promise<{ error: { message: string } | null }>);

  const cancel = () => {
    if (busy) return;
    setAskCancel(true);
  };

  const doCancel = async () => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('tr_cancel_trip', { p_trip_id: trip.id });
    setBusy(false);
    setAskCancel(false);
    // Sem isto o motorista volta à praça com o erro por dizer, e fica a
    // perguntar-se se a corrida ficou ou não nas suas mãos.
    if (error) { onError(rpcError(error)); return; }
    onFinished();
  };

  const phaseIndex = trip.state === 'accepted' ? 0
    : trip.state === 'arriving' ? 1
    : trip.state === 'waiting_pin' ? 2
    : trip.state === 'ongoing' || trip.state === 'waiting_drop' ? 3
    : 4;

  return (
    <div className="animate-enter space-y-4">
      <div className="rounded-card bg-purple-600 p-5 text-white shadow-card dark:bg-[#3a1a6e]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-purple-100">
              Corrida {trip.code} · {when(trip.created_at)}
            </p>
            <h2 className="font-display text-xl font-medium tracking-tight leading-tight mt-0.5">
              {STATE_LABEL[trip.state]}
            </h2>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] font-medium text-purple-100">Para si</p>
            <p className="font-display text-xl font-semibold leading-none text-white dark:text-amber-300">
              {formatKz(trip.driver_keeps_kz)}
            </p>
          </div>
        </div>

        {/* Barra de progresso das 4 etapas da corrida */}
        {!cancelled && (
          <div className="mt-3.5 grid grid-cols-4 gap-1.5" aria-hidden="true">
            {[0, 1, 2, 3].map((step) => (
              <span
                key={step}
                className={cn(
                  'h-1.5 rounded-full transition-colors',
                  step <= phaseIndex ? 'bg-white dark:bg-amber-400' : 'bg-white/25',
                )}
              />
            ))}
          </div>
        )}

        <div className="mt-3.5 flex items-center gap-2 text-sm font-semibold">
          <span className="truncate">{from}</span>
          <ArrowRight className="w-4 h-4 shrink-0 text-purple-100 dark:text-amber-300" />
          <span className="truncate">{to}</span>
        </div>
        <p className="mt-1 text-[12px] text-purple-100">
          {trip.distance_km} km · {trip.payment === 'cash' ? 'recebe em dinheiro a bordo' : 'pago por Multicaixa'}
        </p>
      </div>

      {/* Quem vai no carro / o que se transporta */}
      <div className="surface-card rounded-card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-control bg-purple-100 dark:bg-amber-400/[0.14] text-purple-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <UserRound className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink dark:text-white truncate">
              {trip.kind === 'entrega' ? 'Entrega' : trip.passenger_name}
            </p>
            {trip.kind === 'entrega' && trip.parcel ? (
              <p className="text-label text-zinc-500 dark:text-zinc-400 truncate">
                {trip.parcel.what} · recebe {trip.parcel.toName}
              </p>
            ) : (
              <p className="text-label text-zinc-500 dark:text-zinc-400">Passageiro confirmado pelo código</p>
            )}
          </div>
        </div>
        {trip.pickup && (
          <p className="flex items-start gap-2 text-caption font-semibold text-amber-800 dark:text-amber-300 mt-3">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Embarque marcado no mapa
              {trip.pickup.note?.trim() ? `: ${trip.pickup.note.trim()}` : ''} — siga o ponto, não
              o centro do bairro.
            </span>
          </p>
        )}
        {vibe && (
          <p className="text-caption font-semibold text-purple-700 dark:text-amber-300 mt-2">
            Este passageiro pede: {vibe.toLowerCase()}. Faça o que puder — não é uma obrigação.
          </p>
        )}
        {trip.state !== 'searching' && (
          <p className="text-caption text-zinc-500 dark:text-zinc-400 mt-3 border-t border-zinc-200/70 dark:border-white/10 pt-3">
            {nextHint(trip.state, trip.kind)}
          </p>
        )}
      </div>

      {/* Navegar: o mapa do telemóvel, com o ponto certo. A rota da rua quem
          conhece é o motorista — a app só entrega as coordenadas. */}
      {!done && navAt && (
        <div className="grid grid-cols-2 gap-2">
          <a
            href={mapsUrl(navAt.lat, navAt.lon, navLabel)}
            target="_blank"
            rel="noreferrer"
            className="surface-outline h-12 rounded-control font-semibold text-label flex items-center justify-center gap-2 text-ink dark:text-white active:scale-[0.98] transition-transform"
          >
            <Navigation className="w-4 h-4 text-purple-600 dark:text-amber-400" /> Google Maps
          </a>
          <a
            href={wazeUrl(navAt.lat, navAt.lon)}
            target="_blank"
            rel="noreferrer"
            className="surface-outline h-12 rounded-control font-semibold text-label flex items-center justify-center gap-2 text-ink dark:text-white active:scale-[0.98] transition-transform"
          >
            <Navigation className="w-4 h-4 text-purple-600 dark:text-amber-400" /> Waze
          </a>
        </div>
      )}

      {/* Avanços */}
      {trip.state === 'accepted' && (
        <Action onClick={() => advance('arriving')} busy={busy} icon={<Navigation className="w-5 h-5" />}>
          Estou a caminho do passageiro
        </Action>
      )}
      {trip.state === 'arriving' && (
        <Action onClick={() => advance('waiting_pin')} busy={busy} icon={<Navigation className="w-5 h-5" />}>
          Cheguei ao ponto de partida
        </Action>
      )}

      {/* O código escrito — o motorista nunca o lê, escreve o que ouviu. */}
      {trip.state === 'waiting_pin' && (
        <div className="surface-card rounded-card p-5">
          <p className="flex items-center gap-2 text-caption font-semibold text-zinc-500 dark:text-zinc-400">
            <KeyRound className="w-4 h-4 text-purple-600 dark:text-amber-400" /> Pergunte o código ao {trip.kind === 'entrega' ? 'remetente' : 'passageiro'}
          </p>
          <div className="flex gap-2 mt-3">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4 números"
              inputMode="numeric"
              maxLength={4}
              className="grow h-14 rounded-control bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/15 text-center text-2xl font-bold tracking-[0.4em] text-ink dark:text-white outline-none focus:border-purple-500 dark:focus:border-amber-400"
            />
            <button
              onClick={verifyPin}
              disabled={busy || pin.length !== 4}
              className={cn(
                'h-14 px-6 rounded-control font-semibold',
                busy || pin.length !== 4 ? OFF : 'btn-main',
              )}
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {trip.state === 'ongoing' && trip.kind === 'passageiro' && (
        <Action onClick={finish} busy={busy} icon={<CheckCircle2 className="w-5 h-5" />}>
          Fechar a corrida — chegámos ao destino
        </Action>
      )}
      {trip.state === 'ongoing' && trip.kind === 'entrega' && (
        <Action onClick={() => advance('waiting_drop')} busy={busy} icon={<Navigation className="w-5 h-5" />}>
          Cheguei ao ponto de entrega
        </Action>
      )}

      {trip.state === 'waiting_drop' && (
        <div className="surface-card rounded-card p-5">
          <p className="flex items-center gap-2 text-caption font-semibold text-zinc-500 dark:text-zinc-400">
            <KeyRound className="w-4 h-4 text-purple-600 dark:text-amber-400" /> Código de quem recebe a encomenda
          </p>
          <div className="flex gap-2 mt-3">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4 números"
              inputMode="numeric"
              maxLength={4}
              className="grow h-14 rounded-control bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/15 text-center text-2xl font-bold tracking-[0.4em] text-ink dark:text-white outline-none focus:border-purple-500 dark:focus:border-amber-400"
            />
            <button
              onClick={verifyDropPin}
              disabled={busy || pin.length !== 4}
              className={cn(
                'h-14 px-6 rounded-control font-semibold',
                busy || pin.length !== 4 ? OFF : 'btn-main',
              )}
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entregue'}
            </button>
          </div>
        </div>
      )}

      {!done && (
        <ChatPanel
          tripId={trip.id}
          myRole="driver"
          lockNote={DRIVING.includes(trip.state) ? DRIVE_LOCK : null}
        />
      )}

      {done && (
        <div className="surface-card rounded-card p-5 text-center">
          {cancelled ? (
            <>
              <XCircle className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="font-semibold text-ink dark:text-white mt-2">Corrida cancelada</p>
              <p className="text-label text-zinc-500 dark:text-zinc-400 mt-1">
                Nada lhe foi cobrado. Cancelamentos repetidos pesam na sua candidatura.
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-8 h-8 text-purple-600 dark:text-amber-400 mx-auto" />
              <p className="font-semibold text-ink dark:text-white mt-2">Corrida concluída</p>
              <p className="text-label text-zinc-500 dark:text-zinc-400 mt-1">
                {trip.payment === 'cash'
                  ? `${formatKz(trip.driver_keeps_kz)} recebidos em dinheiro a bordo. A comissão da Elara (${formatKz(trip.commission_kz)}) acerta-se com a equipa.`
                  : `${formatKz(trip.driver_keeps_kz)} creditados na carteira.`}
              </p>
              {!trip.driver_rating && !score && (
                <div className="mt-4 border-t border-zinc-200/70 dark:border-white/10 pt-4">
                  <p className="text-label font-semibold text-ink dark:text-white">
                    Como foi {trip.kind === 'entrega' ? 'quem recebeu' : 'o passageiro'}?
                  </p>
                  <div className="mt-2 flex items-center justify-center gap-3">
                    <RateStars score={null} busy={ratingBusy} onPick={rate} />
                    {ratingBusy && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
                  </div>
                </div>
              )}
              {(trip.driver_rating || score) && (
                <div className="mt-4 flex items-center justify-center gap-2 border-t border-zinc-200/70 dark:border-white/10 pt-4">
                  <RateStars score={score ?? trip.driver_rating} busy={false} size="sm" />
                  <span className="text-caption font-medium text-zinc-500 dark:text-zinc-400">A sua avaliação</span>
                </div>
              )}
            </>
          )}
          <button
            onClick={onFinished}
            className="btn-main mt-4 w-full h-12 rounded-control font-semibold"
          >
            Voltar à praça
          </button>
        </div>
      )}

      {!done && ['accepted', 'arriving', 'waiting_pin'].includes(trip.state) && (
        askCancel ? (
          <div className="rounded-card bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-4">
            <p className="font-semibold text-red-700 dark:text-red-300">Cancelar esta corrida?</p>
            <p className="text-label text-red-700/85 dark:text-red-300/85 mt-1">
              {trip.state === 'accepted'
                ? 'A pessoa ainda está à espera no ponto. Avise no chat antes de desistir.'
                : 'Já está no ponto de partida: cancelando aqui, deixa a pessoa na rua.'}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={() => setAskCancel(false)}
                className="surface-outline h-12 rounded-control font-semibold text-label text-ink dark:text-white"
              >Manter corrida</button>
              <button
                onClick={doCancel}
                disabled={busy}
                className="h-12 rounded-control font-semibold text-label text-white bg-red-600 active:bg-red-700 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Sim, cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={cancel}
            disabled={busy}
            className="w-full h-12 rounded-control font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <XCircle className="w-5 h-5" /> Cancelar corrida
          </button>
        )
      )}

      <ReportButton
        onOpen={() => setReportOpen(true)}
        label="Reportar esta viagem"
        className="w-full"
      />

      {reportOpen && (
        <ReportSheet
          key={trip.id}
          trip={trip}
          uid={user.uid}
          role="driver"
          onClose={() => setReportOpen(false)}
          onError={onError}
        />
      )}
    </div>
  );
}

function Action({ onClick, busy, icon, children }: {
  onClick: () => void; busy: boolean; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        'w-full h-14 rounded-control font-semibold tracking-tight text-body flex items-center justify-center gap-2',
        busy ? OFF : 'btn-main',
      )}
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      {children}
    </button>
  );
}
