import { useEffect, useRef, useState } from 'react';
import {
  ArrowRightIcon, CarFrontIcon, DemoFlaskIcon, KeyIcon, MessageIcon, MoonIcon,
  ShareIcon, SpinnerIcon, StarIcon, UsersIcon, XCircleIcon,
} from './ElaraIcons';
import { supabase } from '../lib/supabase';
import { useDemo } from '../lib/demoContext';
import { advanceDemoTrip, cancelDemoTrip } from '../lib/demoEngine';
import type { SessionUser, Trip, TripState, Zone } from '../types';
import type { LatLon } from '../lib/geo';
import { distanceText } from '../lib/geo';
import { haversineKm } from '../lib/map';
import { buzz, chime, usePrefs } from '../lib/alerts';
import { departText } from '../lib/rides';
import { setTripVibe, tripPrefsLive, tripVibe, VIBES, VIBE_LABEL, type Vibe } from '../lib/extras';
import { changeOf, suggestNote } from '../lib/money';
import { ChatPanel } from './ChatPanel';
import { BatteryNotice } from './BatteryNotice';
import { RideCheck } from './RideCheck';
import { ReportSheet, ReportButton } from './ReportSheet';
import {
  NIGHT_WINDOW, driveMinutes, isNight,
  isTripMine, nextHint, shareMessage,
} from '../lib/trips';
import { cn, waLink, when } from '../lib/utils';
import { formatKz } from '../lib/money';
import { loadTrustedContacts, trustedShareMessage } from '../lib/localExtras';

/** O que uma corrida partilhada diz a quem comprou um lugar: números, nada de pessoas. */
type RideSeatSummary = { depart_at: number; seats_taken: number; capacity: number };

interface TripConsoleProps {
  trip: Trip;
  user: SessionUser;
  zones: Zone[];
  /** PINs devolvidos pelo tr_create_trip — a memória da sessão que pediu. */
  freshPins?: { pin: string; dropPin?: string | null } | null;
  /** Posição em directo do motorista, quando a viagem já tem um. */
  driverPos?: LatLon | null;
  onTripEnded: () => void;
  onTripChanged: () => void;
  onError: (message: string) => void;
  /** Abre o mesmo painel SOS do botão do menu: um caminho de emergência só. */
  onSos: () => void;
}

/**
 * A viagem a acontecer, no painel que flutua sobre o mapa: estado, motorista,
 * código, chat e avaliação. O passageiro vê os seus próprios códigos; o
 * motorista nunca os lê.
 */
export function TripConsole({
  trip: initial, user, zones, freshPins, driverPos,
  onTripEnded, onTripChanged, onError, onSos,
}: TripConsoleProps) {
  const demoCtx = useDemo();
  const isDemo = !!demoCtx?.isDemo;
  const [trip, setTrip] = useState<Trip>(initial);
  const [pins, setPins] = useState<{ pin: string; dropPin?: string | null } | null>(freshPins ?? null);
  const [busy, setBusy] = useState(false);
  const [arrived, setArrived] = useState<string | null>(null);
  const lastState = useRef<TripState | null>(null);
  // O cancelamento confirma-se aqui dentro, não numa janela do browser: num
  // telemóvel o diálogo nativo tapa o ecrã e não pertence ao desenho da app.
  const [askCancel, setAskCancel] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [trustedContacts] = useState(() => loadTrustedContacts());
  const prefs = usePrefs();

  const from = zones.find((z) => z.id === trip.from_zone_id)?.name ?? trip.from_zone_id;
  const to = zones.find((z) => z.id === trip.to_zone_id)?.name ?? trip.to_zone_id;
  const fromZone = zones.find((z) => z.id === trip.from_zone_id) ?? null;
  // Distância do carro ao ponto de encontro: é o número que a pessoa quer ver.
  const carAway = driverPos && fromZone ? distanceText(fromZone, driverPos) : null;
  // A estimativa é distância sobre andamento médio de Luanda, não um tempo
  // medido na rua. Diz-se com «≈» para ninguém contar com ela como garantia.
  const carKm = driverPos && fromZone
    ? Math.round(haversineKm(fromZone.lat, fromZone.lon, driverPos.lat, driverPos.lon) * 10) / 10
    : null;
  const [note, setNote] = useState<string | null>(null);
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [vibesOn, setVibesOn] = useState(false);

  // O aviso de chegada: a app na algibeira não se olha, ouve-se. Só dispara na
  // mudança para o estado de chegada, uma vez, e apaga-se sozinho.
  useEffect(() => {
    const prev = lastState.current;
    lastState.current = trip.state;
    if (!prev || prev === trip.state) return;
    if (trip.state === 'arriving') { buzz([70, 50, 70]); chime('request'); setArrived('O motorista está quase a chegar.'); }
    if (trip.state === 'waiting_pin') { buzz([90, 60, 90, 60, 120]); chime('arrival'); setArrived('O seu motorista chegou ao ponto.'); }
    if (prev === 'arriving' || prev === 'waiting_pin') setArrived(null);
  }, [trip.state]);

  useEffect(() => {
    if (!arrived) return;
    const t = window.setTimeout(() => setArrived(null), 12000);
    return () => { window.clearTimeout(t); };
  }, [arrived]);

  useEffect(() => setTrip(initial), [initial]);

  // Buscar os PINs guardados em tr_trip_secret: só o passageiro os lê.
  useEffect(() => {
    if (isDemo && demoCtx) {
      const demoPin = demoCtx.demoState.pins[trip.id];
      if (demoPin) setPins(demoPin);
      return;
    }
    if (pins || !isTripMine(trip, user.uid)) return;
    let alive = true;
    supabase
      .from('tr_trip_secret')
      .select('pin, drop_pin')
      .eq('trip_id', trip.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data) setPins({ pin: data.pin, dropPin: data.drop_pin });
      });
    return () => { alive = false; };
  }, [trip.id, pins, user.uid, trip, isDemo, demoCtx]);

  // No modo demonstração, a viagem avança de forma natural no mapa (e o utilizador também pode avançar com 1 toque).
  useEffect(() => {
    if (!isDemo || !demoCtx) return;
    const autoMs: Partial<Record<TripState, number>> = {
      searching: 3200,
      accepted: 4500,
      arriving: 4500,
    };
    const ms = autoMs[trip.state];
    if (!ms) return;
    const timer = window.setTimeout(() => {
      demoCtx.setDemoState((prev) => advanceDemoTrip(prev, trip.id));
    }, ms);
    return () => window.clearTimeout(timer);
  }, [isDemo, demoCtx, trip.id, trip.state]);

  // O cartão do motorista diz o que o servidor sabe dele: nota e viagens.
  const [driverMeta, setDriverMeta] = useState<{ rating: number; trips: number } | null>(null);
  useEffect(() => {
    const driverId = trip.driver_id;
    if (!driverId) { setDriverMeta(null); return; }
    if (isDemo) {
      setDriverMeta({ rating: 4.9, trips: 1284 });
      return;
    }
    let alive = true;
    supabase
      .from('tr_driver')
      .select('rating, trips')
      .eq('id', driverId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data) {
          setDriverMeta({ rating: Number(data.rating) || 0, trips: Number(data.trips) || 0 });
        }
      });
    return () => { alive = false; };
  }, [trip.driver_id, isDemo]);

  const focusChat = () => {
    document.getElementById('trip-chat')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // O ambiente dentro do carro só existe com a 0005 aplicada. Sem ela, o
  // pedido faz-se no chat, como sempre se fez — a app não mostra uma porta
  // que não abre.
  useEffect(() => {
    if (isDemo) { setVibesOn(true); return; }
    let alive = true;
    tripPrefsLive().then(async (on) => {
      if (!alive || !on) return;
      setVibesOn(true);
      const v = await tripVibe(trip.id);
      if (alive) setVibe(v);
    });
    return () => { alive = false; };
  }, [trip.id, isDemo]);

  const chooseVibe = async (v: Vibe) => {
    if (busy || vibe === v) return;
    if (isDemo) { setVibe(v); return; }
    setBusy(true);
    const msg = await setTripVibe(trip.id, v);
    setBusy(false);
    if (msg) { onError(msg); return; }
    setVibe(v);
  };

  // Tempo real: cada mudança de estado chega sozinha ao passageiro.
  useEffect(() => {
    if (isDemo) return;
    const channel = supabase
      .channel(`tr-trip-${trip.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tr_trip', filter: `id=eq.${trip.id}` },
        (payload) => {
          setTrip((prev) => ({ ...prev, ...(payload.new as Partial<Trip>) }));
          onTripChanged();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [trip.id, onTripChanged, isDemo]);

  // Numa carrinha partilhada (0004) as duas perguntas da paragem são «com
  // quantos vou?» e «a que hora sai?». Respondem-se com números da corrida do
  // veículo: quantos lugares foram vendidos e a hora anunciada. Quem são os
  // outros passageiros nunca aparece — nem nome, nem matrícula, nem telefone.
  const [ride, setRide] = useState<RideSeatSummary | null>(null);
  useEffect(() => {
    const rideId = trip.ride_id;
    if (!rideId) return;
    let alive = true;
    const load = () => {
      supabase
        .from('tr_ride')
        .select('depart_at, seats_taken, capacity')
        .eq('id', rideId)
        .maybeSingle()
        .then(({ data }) => {
          if (alive) setRide(data ? (data as RideSeatSummary) : null);
        });
    };
    load();
    const channel = supabase
      .channel(`tr-ride-seat-${rideId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tr_ride', filter: `id=eq.${rideId}` },
        load,
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [trip.ride_id]);

  const cancel = async () => {
    if (busy) return;
    if (isDemo && demoCtx) {
      demoCtx.setDemoState((prev) => cancelDemoTrip(prev, trip.id));
      setAskCancel(false);
      onTripEnded();
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('tr_cancel_trip', { p_trip_id: trip.id });
    setBusy(false);
    setAskCancel(false);
    if (error) { onError(error.message.replace(/^ERROR:\s*/i, '')); return; }
    onTripEnded();
    if (data && (data as { cancelFeeKz?: number }).cancelFeeKz) {
      onError(`Viagem cancelada. Taxa registada: ${formatKz((data as { cancelFeeKz: number }).cancelFeeKz)}.`);
    }
  };

  const active = !['ended', 'rated', 'cancelled'].includes(trip.state);
  // O código de embarque deixa de ser útil no momento em que a pessoa entra no
  // carro; o de entrega continua a ser o único fecho da encomenda.
  const pastPickup = trip.state === 'ongoing' || trip.state === 'waiting_drop';

  return (
    <div className="animate-enter space-y-4">
      {/* Controlo rápido dentro da própria viagem quando o modo demonstração está activo */}
      {isDemo && demoCtx && active && (
        <div className="rounded-card border border-purple-300 bg-purple-50 p-3.5 dark:border-amber-400/40 dark:bg-amber-400/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <DemoFlaskIcon className="h-4 w-4 shrink-0 text-purple-700 dark:text-amber-300" />
            <p className="text-caption font-semibold text-purple-800 dark:text-amber-200 truncate">
              {trip.state === 'waiting_pin'
                ? 'Motorista no ponto — confirme o PIN para arrancar'
                : trip.state === 'ongoing'
                  ? 'Em viagem — termine quando quiser ver o recibo'
                  : 'Modo demonstração — a viagem avança sozinha ou num toque'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => demoCtx.setDemoState((prev) => advanceDemoTrip(prev, trip.id))}
            className="btn-main shrink-0 h-9 px-3 rounded-control text-caption font-semibold inline-flex items-center gap-1"
          >
            {trip.state === 'waiting_pin'
              ? 'Confirmar PIN'
              : trip.state === 'ongoing'
                ? 'Chegar ao destino'
                : trip.state === 'waiting_drop'
                  ? 'Concluir entrega'
                  : 'Avançar'}
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Primeiro o que pode ser um problema, depois o resto da viagem. */}
      {isTripMine(trip, user.uid) && <RideCheck trip={trip} uid={user.uid} onHelp={onSos} />}

      <BatteryNotice role="passenger" />

      {/* O motorista chegou: a app está na algibeira, e é o bolso que avisa. */}
      {arrived && (
        <div
          role="status"
          className="animate-alert rounded-2xl bg-purple-600 px-4 py-3 flex items-center gap-2.5 text-white shadow-card"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white map-pulse shrink-0" />
          <p className="text-sm font-bold leading-tight">{arrived}</p>
        </div>
      )}

      {/* Rota e preço, em duas linhas — o estado vai na pílula sobre o mapa */}
      <div className="surface-card rounded-card p-4">
        <div className="flex items-start gap-3">
          <div className="mt-1.5 flex flex-col items-center gap-1 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600 dark:bg-amber-400" />
            <span className="w-0.5 h-5 bg-zinc-300 dark:bg-zinc-600" />
            <span className="w-2.5 h-2.5 rounded-sm bg-ink dark:bg-zinc-200" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink dark:text-white truncate leading-tight">{from}</p>
            <p className="font-semibold text-ink dark:text-white truncate leading-tight mt-2.5">{to}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-display font-semibold tracking-tight text-lg text-purple-700 dark:text-amber-400 leading-tight">{formatKz(trip.price_kz)}</p>
            <p className="text-caption text-zinc-500 dark:text-zinc-400">{trip.distance_km} km</p>
          </div>
        </div>
        <p className="text-label text-zinc-600 dark:text-zinc-300 mt-3">{nextHint(trip.state, trip.kind, !!trip.ride_id)}</p>
        <p className="text-caption text-zinc-500 dark:text-zinc-400 mt-1">
          Viagem {trip.code} · {trip.payment === 'cash' ? 'Dinheiro' : 'Multicaixa'}
          {trip.seats > 1 ? ` · ${trip.seats} lugares` : ''}
        </p>
      </div>

      {/* Onde é que isto vai: quatro paragens, uma acesa. */}
      <div className="surface-card rounded-card p-4">
        <TripTimeline trip={trip} />
      </div>

      {/* Os códigos de viagem — só quem pediu os lê, e só enquanto correm.
          O de entrega vive até ao fim: é ele que fecha a encomenda no destino,
          escondê-lo em «em viagem» deixava o remetente sem nada para enviar a
          quem recebe. */}
      {pins && active && (!pastPickup || (trip.kind === 'entrega' && !!pins.dropPin)) && (
        <div className="rounded-3xl bg-purple-600 p-5 text-white shadow-card">
          {!pastPickup && (
            <>
              <div className="flex items-center gap-2 text-purple-100 text-xs font-bold">
                <KeyIcon className="w-4 h-4" /> Código de viagem
              </div>
              <p className="text-4xl font-semibold tracking-[0.3em] mt-1">{pins.pin}</p>
              <p className="text-sm text-purple-100 mt-2">
                {trip.kind === 'entrega'
                  ? 'Mostre a quem entrega. Sem este código a viagem não começa.'
                  : 'Diga ao motorista quando ele chegar. Sem ele, a viagem não começa.'}
              </p>
            </>
          )}
          {trip.kind === 'entrega' && pins.dropPin && (
            <div className={cn(!pastPickup && 'mt-3 border-t border-purple-400/60 pt-3')}>
              <p className="text-purple-100 text-xs font-bold">Código de entrega</p>
              <p className="text-3xl font-bold tracking-[0.3em] mt-0.5">{pins.dropPin}</p>
              <p className="text-sm text-purple-100 mt-1">
                {pastPickup
                  ? 'Quem recebe dá-o ao motorista — é isso que fecha a entrega.'
                  : 'Envie já a quem recebe. É o código que fecha a entrega.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Motorista */}
      {trip.driver_name && (
        <div className="surface-card rounded-card p-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-control bg-purple-100 dark:bg-amber-400/15 text-purple-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <CarFrontIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-ink dark:text-white truncate">{trip.driver_name}</p>
              <p className="text-label text-zinc-500 dark:text-zinc-400 truncate">
                {trip.car_model} · <span className="font-semibold text-zinc-700 dark:text-zinc-200">{trip.plate}</span>
              </p>
              {driverMeta && (
                <p className="flex items-center gap-1 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300 mt-0.5">
                  <StarIcon filled className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  {driverMeta.rating.toFixed(1).replace('.', ',')} · {driverMeta.trips.toLocaleString('pt-AO')} viagens
                </p>
              )}
              {driverPos && carAway && (
                <p className="text-[12px] font-bold text-purple-600 dark:text-purple-400 mt-0.5">
                  Carro a {carAway} · faltam ≈{driveMinutes(carKm ?? 0)} min
                </p>
              )}
              {trip.trial && (
                <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400 mt-0.5">
                  Motorista novo, ainda em período de teste — pode reportar qualquer problema desta viagem.
                </p>
              )}
              {ride && active && (
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-purple-700 dark:text-purple-300 mt-1">
                  <UsersIcon className="w-3.5 h-3.5 shrink-0" />
                  Lugar partilhado: {ride.seats_taken} de {ride.capacity} vendidos · {departText(ride.depart_at)}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 flex-1">
              Encontro e pagamento combinam-se no chat. Pediu às {when(trip.created_at)}.
            </p>
            {active && (
              <button
                onClick={focusChat}
                className="h-10 px-3.5 rounded-xl shrink-0 flex items-center gap-1.5 text-[12px] font-bold bg-purple-600 text-white dark:bg-amber-400 dark:text-ink active:scale-[0.98] transition-transform"
              >
                <MessageIcon className="w-4 h-4" /> Mensagem
              </button>
            )}
          </div>
        </div>
      )}

      {/* O troco, avisado antes de subir: em Luanda a discussão do «não tenho
          mudança» acontece dentro do carro, e é sempre desconfortável. A app
          diz a menor nota que cobre o preço e escreve isso no chat. */}
      {active && trip.payment === 'cash' && isTripMine(trip, user.uid) && trip.driver_name && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-4">
          <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-200">
            {(() => {
              const n = suggestNote(trip.price_kz);
              if (!n) return 'Preço acima das notas de 10.000 Kz — combine o pagamento com o motorista.';
              const change = changeOf(n, trip.price_kz);
              return change === 0
                ? `Dá jeito ter nota exacta de ${formatKz(n)}.`
                : `Com uma nota de ${formatKz(n)}, o motorista precisa de ${formatKz(change)} em troco.`;
            })()}
          </p>
          {suggestNote(trip.price_kz) && (
            <button
              onClick={() => setNote(`Vou pagar com nota de ${formatKz(suggestNote(trip.price_kz) ?? 0)}.`)}
              className={cn(
                'mt-2.5 h-10 px-3.5 rounded-xl text-[12px] font-semibold',
                'bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200',
                note && 'opacity-60',
              )}
            >
              {note ? 'Escrito no chat — carregue para enviar' : 'Avisar no chat'}
            </button>
          )}
        </div>
      )}

      {/* O ambiente dentro do carro, quando o servidor o guarda. */}
      {vibesOn && active && trip.driver_name && (
        <div className="surface-card rounded-card p-4">
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Dentro do carro
          </p>
          <div className="h-rail mt-2 flex gap-2 overflow-x-auto">
            {VIBES.map((v) => (
              <button
                key={v}
                onClick={() => void chooseVibe(v)}
                aria-pressed={vibe === v}
                disabled={busy}
                className={cn(
                  'shrink-0 rounded-full px-3 py-2 text-[12px] font-semibold border transition-colors',
                  vibe === v
                    ? 'bg-purple-600 border-purple-600 text-white'
                    : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200',
                )}
              >{VIBE_LABEL[v]}</button>
            ))}
          </div>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-2">
            É um pedido, não uma garantia: depende do carro e do que o motorista puder fazer.
          </p>
        </div>
      )}

      {/* Chat */}
      {active && trip.driver_name && (
        <div id="trip-chat">
          <ChatPanel tripId={trip.id} myRole="passenger" seed={note} />
        </div>
      )}

      {/* O que vale mais à noite, dito enquanto é noite: a matrícula e a
          partilha. Não é vigilância nem promessa — são duas coisas que a pessoa
          pode fazer em dois segundos antes de o carro arrancar. */}
      {active && prefs.night && isNight() && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-white">
            <MoonIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            É de noite ({NIGHT_WINDOW})
          </p>
          <ul className="mt-2 space-y-1.5 text-[12px] text-zinc-600 dark:text-zinc-300">
            <li>
              Confirme a matrícula{' '}
              {trip.plate
                ? <strong className="font-bold text-zinc-900 dark:text-white">{trip.plate}</strong>
                : 'que a app mostra'}
              {' '}antes de entrar.
            </li>
            <li>A verificação de viagem pergunta mais cedo do que de dia.</li>
            <li>Partilhar a viagem, logo abaixo, é um toque — e não leva PIN.</li>
          </ul>
        </div>
      )}

      {/* Dois gestos que a pessoa procura numa viagem: avisar alguém e falar com a
          equipa. O link de partilha não leva código nenhum. */}
      {active && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <a
              href={waLink('', shareMessage(trip, from, to))}
              target="_blank"
              rel="noreferrer"
              className="h-12 rounded-control font-semibold text-label surface-outline flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <ShareIcon className="w-4 h-4" /> Partilhar viagem
            </a>
            <ReportButton onOpen={() => setReportOpen(true)} />
          </div>
          {trustedContacts.length > 0 && (
            <div className="surface-card rounded-card p-3">
              <p className="text-caption font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Avisar contacto de confiança (sem PIN)
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {trustedContacts.map((tc) => (
                  <a
                    key={tc.id}
                    href={waLink(
                      tc.phone,
                      trustedShareMessage({
                        contactName: tc.name,
                        trip,
                        fromName: from,
                        toName: to,
                      }),
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 rounded-full border border-purple-200 bg-purple-50 px-3 text-caption font-semibold text-purple-700 inline-flex items-center gap-1.5 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200"
                  >
                    <ShareIcon className="h-3 w-3" /> {tc.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cancelar — dois toques, e a taxa diz-se antes do segundo */}
      {active && isTripMine(trip, user.uid) && ['searching', 'accepted', 'arriving'].includes(trip.state) && (
        askCancel ? (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-4">
            <p className="font-bold text-red-700 dark:text-red-300">
              {trip.driver_name ? 'Cancelar com motorista atribuído?' : 'Cancelar este pedido?'}
            </p>
            <p className="text-sm text-red-700/80 dark:text-red-300/80 mt-1">
              {trip.driver_name
                ? 'O motorista já vai a caminho. Se ele já estiver no ponto, a taxa de cancelamento pode ser cobrada.'
                : 'O pedido sai da praça. Não há taxa enquanto nenhum motorista aceitou.'}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={() => setAskCancel(false)}
                className="h-12 rounded-2xl font-bold text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100"
              >Manter viagem</button>
              <button
                onClick={cancel}
                disabled={busy}
                className="h-12 rounded-2xl font-bold text-sm text-white bg-red-600 active:bg-red-700 flex items-center justify-center gap-2"
              >
                {busy && <SpinnerIcon className="w-4 h-4 animate-spin" />} Sim, cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAskCancel(true)}
            className="w-full h-12 rounded-2xl font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <XCircleIcon className="w-5 h-5" /> Cancelar viagem
          </button>
        )
      )}

      {reportOpen && (
        <ReportSheet
          key={trip.id}
          onClose={() => setReportOpen(false)}
          trip={trip}
          uid={user.uid}
          role="passenger"
          onError={onError}
        />
      )}
    </div>
  );
}

/**
 * A linha do tempo da viagem: quatro paragens, uma delas acesa. É o mapa
 * mental de quem espera — em que ponto é que isto está e quanto falta — sem
 * números que ninguém prometeu.
 */
function TripTimeline({ trip }: { trip: Trip }) {
  const labels = trip.kind === 'entrega'
    ? ['Pedido', 'Recolha', 'Em rota', 'Entregue']
    : ['Pedido', 'A caminho', 'Em viagem', 'Fim'];
  const index = trip.state === 'searching' ? 0
    : ['accepted', 'arriving', 'waiting_pin'].includes(trip.state) ? 1
    : ['ongoing', 'waiting_drop'].includes(trip.state) ? 2
    : ['ended', 'rated'].includes(trip.state) ? 3
    : -1;
  if (index < 0) return null;
  return (
    <div className="grid grid-cols-4">
      {labels.map((label, i) => (
        <div key={label} className="relative flex flex-col items-center">
          {i < labels.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-[5px] left-1/2 w-full h-0.5',
                i < index ? 'bg-purple-600 dark:bg-amber-400' : 'bg-zinc-200 dark:bg-zinc-700',
              )}
            />
          )}
          <span
            aria-hidden="true"
            className={cn(
              'relative w-3 h-3 rounded-full border-2',
              i < index && 'bg-purple-600 border-purple-600 dark:bg-amber-400 dark:border-amber-400',
              i === index && 'bg-white dark:bg-zinc-900 border-purple-600 dark:border-amber-400 map-pulse',
              i > index && 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600',
            )}
          />
          <p
            className={cn(
              'mt-1.5 text-[11px] font-semibold leading-tight text-center px-0.5',
              i === index
                ? 'text-purple-700 dark:text-amber-300'
                : i < index
                  ? 'text-zinc-700 dark:text-zinc-300'
                  : 'text-zinc-400 dark:text-zinc-500',
            )}
          >
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}
