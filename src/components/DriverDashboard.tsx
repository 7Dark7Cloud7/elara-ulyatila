import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Bell, CalendarClock, Loader2, MapPin, Navigation, Power, Radio, Star, TrendingUp } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import type { Driver, OpenTrip, Pickup, SessionUser, TripState, VehicleClass, Zone } from '../types';
import { DriverConsole } from './DriverConsole';
import { MapScreen } from './MapScreen';
import { RideRunDesk, type RunPickupPin } from './RideRunDesk';
import { ridesLive } from '../lib/rides';
import { FloatPill, LocateFab, RoutePeek } from './MapBits';
import { VehicleArt, vehicleKindFor } from './VehicleArt';
import type { MapBubble } from './MapView';
import { LUANDA } from '../lib/map';
import { distanceText, useFixFlash, type GpsStatus, type LatLon } from '../lib/geo';
import { cn, minutesAgo, OFF } from '../lib/utils';
import { formatKz } from '../lib/money';
import { DriverBoard } from './DriverBoard';
import { BatteryNotice } from './BatteryNotice';
import { ShiftNotice } from './ShiftNotice';
import { DriverPapers } from './DriverPapers';
import { cancelBadge, ratingBadge } from '../lib/reputation';
import { STATE_LABEL } from '../lib/trips';

interface DriverDashboardProps {
  user: SessionUser;
  driver: Driver;
  zones: Zone[];
  classes: VehicleClass[];
  onDriverChanged: () => void;
  onError: (message: string) => void;
}

const PRESENCE_EVERY_MS = 15000;

interface ActiveTripLite {
  id: string;
  from_zone_id: string;
  to_zone_id: string;
  state: TripState;
  pickup?: Pickup | null;
}

interface TodayRow {
  driver_keeps_kz: number;
}

/** Os últimos 30 dias do motorista, contados pelo servidor, não por nós. */
interface MonthRecord {
  accepted: number;
  mine: number;
}

const RUN_STATES = ['accepted', 'arriving', 'waiting_pin', 'ongoing', 'waiting_drop'];

/**
 * `pickup` só existe com a 0004 aplicada. Uma coluna que o servidor não tem faz
 * a query inteira falhar, e o motorista perdia a corrida em curso ao reabrir a
 * app. Por isso: pedir com o ponto e, se a coluna não existir, pedir sem ele.
 */
async function selectMyActiveTrips(driverId: string, onlyId?: string): Promise<ActiveTripLite[]> {
  for (const cols of ['id, from_zone_id, to_zone_id, state, pickup', 'id, from_zone_id, to_zone_id, state']) {
    const res: { data: unknown; error: { message: string } | null } = onlyId
      ? await supabase.from('tr_trip').select(cols).eq('id', onlyId).eq('driver_id', driverId).maybeSingle()
      : await supabase.from('tr_trip').select(cols).eq('driver_id', driverId)
        .in('state', RUN_STATES).order('created_at', { ascending: false }).limit(8);
    if (res.error) {
      if (!/pickup|42703|does not exist/i.test(res.error.message)) return [];
      continue;
    }
    if (!res.data) return [];
    return (Array.isArray(res.data) ? res.data : [res.data]) as ActiveTripLite[];
  }
  return [];
}

/** Começa o dia à hora de Luanda (UTC+1), não à do servidor. */
function startOfTodayAo(): number {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const local = new Date(utc + 3600000); // África/Luanda
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 3600000;
}

/**
 * A praça do motorista, em mapa: os pedidos abertos da sua categoria aparecem
 * onde estão, com o preço por cima. O carro é o seu ponto — e só ele vê a
 * praça assim; quem pede só vê carros, nunca pedidos alheios.
 */
export function DriverDashboard({ user, driver, zones, classes, onDriverChanged, onError }: DriverDashboardProps) {
  const [feed, setFeed] = useState<OpenTrip[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveTripLite | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [myPos, setMyPos] = useState<LatLon | null>(null);
  // A precisão anunciada pelo aparelho, em metros: é o círculo em volta do carro
  // no mapa. Sem ela o ponto do motorista parece exacto, e não é.
  const [myAcc, setMyAcc] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const [focus, setFocus] = useState(0);
  const [today, setToday] = useState<{ trips: number; kz: number } | null>(null);
  const [record, setRecord] = useState<MonthRecord | 'falhou' | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  // Os pontos de embarque dos lugares vendidos: é o motorista que os tem de
  // conduzir, e a praça é dele.
  const [runPins, setRunPins] = useState<RunPickupPin[]>([]);
  // A secretária fecha-se sozinha quando a 0004 não está aplicada; este sinal é
  // para o texto não mandar anunciar uma coisa que não está na tela.
  const [ridesOn, setRidesOn] = useState(false);
  const lastSentRef = useRef(0);
  const onlineRef = useRef(driver.online);
  onlineRef.current = driver.online;
  const knownIds = useRef<Set<string> | null>(null);

  const home = zones.find((z) => z.id === driver.home_zone_id) ?? null;
  const cls = classes.find((c) => c.id === driver.class_id) ?? null;
  const zoneOf = useCallback((id: string) => zones.find((z) => z.id === id) ?? null, [zones]);
  const name = (id: string) => zoneOf(id)?.name ?? id;
  const center = useMemo<LatLon>(
    () => myPos ?? (home ? { lat: home.lat, lon: home.lon } : LUANDA),
    [myPos, home],
  );

  const loadFeed = useCallback(async () => {
    const { data } = await supabase
      .from('tr_trips_open')
      .select('*')
      .eq('class_id', driver.class_id)
      .order('created_at', { ascending: true })
      .limit(30);
    const rows = (data as OpenTrip[]) ?? [];
    // Um pedido acabado de cair na praça faz vibrar o telemóvel e acende o
    // cartão: é assim que se conduz com a app no suporte e não no olho.
    if (knownIds.current && driver.online) {
      const fresh = rows.find((r) => !knownIds.current!.has(r.id));
      if (fresh) {
        setFlashId(fresh.id);
        if ('vibrate' in navigator) navigator.vibrate?.([90, 60, 90]);
        window.setTimeout(() => setFlashId((f) => (f === fresh.id ? null : f)), 7000);
      }
    }
    knownIds.current = new Set(rows.map((r) => r.id));
    setFeed(rows);
    setLoadingFeed(false);
  }, [driver.class_id, driver.online]);

  const loadActiveTrip = useCallback(async () => {
    // O painel do motorista mostra UMA viagem de cada vez. Num carro com
    // lugares vendidos (0004) há várias ao mesmo tempo, e a regra tem de ser a
    // da rua: quem está a ser servido continua a ser servido. Sem isto, cada
    // compra de um lugar novo trocava o painel por baixo do motorista — ele
    // estava a confirmar o código de um e ficava com o console de outro.
    const rows = await selectMyActiveTrips(driver.id);
    setActive((prev) => (prev ? rows.find((r) => r.id === prev.id) ?? rows[0] ?? null : rows[0] ?? null));
  }, [driver.id]);

  /** Numa carrinha cheia é o motorista que decide a quem serve primeiro: a
   *  lista de bordo aponta uma pessoa e o painel passa a ser dessa viagem. */
  const focusTrip = useCallback(async (tripId: string) => {
    const rows = await selectMyActiveTrips(driver.id, tripId);
    if (rows[0]) setActive(rows[0]);
  }, [driver.id]);

  const loadToday = useCallback(async () => {
    const { data } = await supabase
      .from('tr_trip')
      .select('driver_keeps_kz')
      .eq('driver_id', driver.id)
      .in('state', ['ended', 'rated'])
      .gte('created_at', startOfTodayAo());
    const rows = (data as TodayRow[]) ?? [];
    setToday({ trips: rows.length, kz: rows.reduce((s, r) => s + r.driver_keeps_kz, 0) });
  }, [driver.id]);

  // O registo dos 30 dias lê-se uma vez por abertura, não a cada pedido que
  // muda de estado: duas contagens por minuto num 2G não valem a pena, e o
  // número que importa ao motorista é o do dia (o `loadToday`).
  const loadRecord = useCallback(async () => {
    const monthAgo = startOfTodayAo() - 29 * 86_400_000;
    const [accepted, cancelled] = await Promise.all([
      supabase
        .from('tr_trip')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', driver.id)
        .gte('created_at', monthAgo),
      supabase
        .from('tr_trip')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', driver.id)
        .eq('state', 'cancelled')
        .eq('cancelled_by', 'driver')
        .gte('created_at', monthAgo),
    ]);
    // A contagem por cabeçalho não devolve erro quando a PostgREST não entrega
    // contagem: devolve `null`. Um zero ali seria uma mentira sobre o motorista,
    // por isso é o espaço vazio que fica no ecrã.
    if (accepted.error || cancelled.error || accepted.count == null || cancelled.count == null) {
      setRecord('falhou');
      return;
    }
    setRecord({ accepted: accepted.count, mine: cancelled.count });
  }, [driver.id]);

  useEffect(() => {
    loadFeed();
    loadActiveTrip();
    loadToday();
    loadRecord();
  }, [loadFeed, loadActiveTrip, loadToday, loadRecord]);

  useEffect(() => {
    if (!cls?.per_seat) { setRidesOn(false); return; }
    let alive = true;
    ridesLive().then((v) => { if (alive) setRidesOn(v); });
    return () => { alive = false; };
  }, [cls?.per_seat]);

  // Tempo real na praça: novo pedido ou pedido aceito → a lista refresca.
  useEffect(() => {
    const channel = supabase
      .channel(`tr-feed-${driver.class_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tr_trip', filter: `class_id=eq.${driver.class_id}` },
        () => { loadFeed(); },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tr_trip', filter: `class_id=eq.${driver.class_id}` },
        () => { loadFeed(); loadActiveTrip(); loadToday(); },
      )
      .subscribe();
    // Redes móveis em Luanda partem o tempo real sem avisar. O canal continua,
    // mas uma leitura de 20 em 20 segundos garante que nenhum pedido fica preso
    // numa lista antiga — e o motorista não perde corrida por isso.
    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadFeed();
      loadActiveTrip();
    }, 20000);
    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [driver.class_id, loadFeed, loadActiveTrip, loadToday]);

  // Publicar posição: é o que faz o pedido chegar ao motorista mais perto.
  // Sem GPS não publicamos nada: um carro no mapa onde ninguém está é pior que
  // nenhum carro — é a pessoa à espera de um veículo que nunca chega. O
  // motorista continua online e a ver a praça em lista; só não aparece no mapa.
  const publishPresence = useCallback(async () => {
    if (!onlineRef.current) return;
    if (Date.now() - lastSentRef.current < PRESENCE_EVERY_MS - 500) return;
    if (!('geolocation' in navigator)) { setGpsError('Este navegador não tem GPS. Ligue a localização do telemóvel.'); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        lastSentRef.current = Date.now();
        const at = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setMyPos(at);
        setMyAcc(Math.round(pos.coords.accuracy));
        setGpsError(null);
        const { error } = await supabase.rpc('tr_set_presence', { p_lat: at.lat, p_lon: at.lon });
        if (error) setGpsError(rpcError(error));
      },
      () => {
        lastSentRef.current = Date.now();
        setMyPos(null);
        setMyAcc(null);
        setGpsError('Sem localização — não aparece no mapa, mas continua a receber pedidos.');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  }, []);

  useEffect(() => {
    if (!driver.online) return;
    publishPresence();
    const interval = window.setInterval(publishPresence, PRESENCE_EVERY_MS);
    return () => { window.clearInterval(interval); };
  }, [driver.online, publishPresence]);

  // O botão «o meu ponto»: pede ao aparelho uma leitura NOVA — a última pode ter
  // 15 segundos e ser da praça, não da esquina onde ele está mesmo — e leva a
  // câmara até ao carro. Offline não se publica nada, mas o motorista quer
  // igualmente ver onde está.
  const [finding, setFinding] = useState(false);
  const { arm: fixArm, justFixed } = useFixFlash(myPos, () => setFocus((f) => f + 1));

  const locate = () => {
    fixArm();
    setFocus((f) => f + 1);
    if (!('geolocation' in navigator)) { setGpsError('Este navegador não tem GPS. Ligue a localização do telemóvel.'); return; }
    setFinding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFinding(false);
        lastSentRef.current = 0;
        setMyPos({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setMyAcc(Math.round(pos.coords.accuracy));
        setGpsError(null);
        publishPresence();
      },
      () => {
        setFinding(false);
        setGpsError('Sem localização — mostramos o último ponto que tivemos.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const fabGps: GpsStatus = finding ? 'asking' : myPos ? 'ok' : gpsError ? 'denied' : 'idle';

  const toggleOnline = async () => {
    if (onlineBusy) return;
    setOnlineBusy(true);
    const { error } = await supabase.rpc('tr_set_online', { p_online: !driver.online });
    setOnlineBusy(false);
    if (error) { onError(rpcError(error)); return; }
    lastSentRef.current = 0;
    knownIds.current = null;
    onDriverChanged();
  };

  const claim = async (tripId: string) => {
    if (claimingId) return;
    setClaimingId(tripId);
    const { error } = await supabase.rpc('tr_claim_trip', { p_trip_id: tripId });
    setClaimingId(null);
    if (error) { onError(rpcError(error)); loadFeed(); return; }
    setSelected(null);
    loadActiveTrip();
    loadFeed();
  };

  const bubbles = useMemo<MapBubble[]>(() => {
    const out: MapBubble[] = [];
    for (const t of feed) {
      const z = zoneOf(t.from_zone_id);
      if (z) out.push({ id: t.id, at: { lat: z.lat, lon: z.lon }, text: formatKz(t.price_kz), active: selected === t.id });
    }
    return out;
  }, [feed, zoneOf, selected]);

  const ordered = useMemo(() => {
    if (!selected) return feed;
    const picked = feed.find((t) => t.id === selected);
    return picked ? [picked, ...feed.filter((t) => t.id !== selected)] : feed;
  }, [feed, selected]);

  // A secretária de lugares só aparece em quem conta por lugar. Um económico
  // fecha-se inteiro; fingir partilha onde não há seria enganar os dois lados.
  const runDesk = cls?.per_seat ? (
    <RideRunDesk
      driver={driver}
      zones={zones}
      cls={cls}
      at={myPos}
      onPins={setRunPins}
      onPickTrip={focusTrip}
      pickedTripId={active?.id ?? null}
      onError={onError}
    />
  ) : null;

  // — Em viagem: o mapa mostra o caminho, o painel manda no estado ——————
  if (active) {
    const a = zoneOf(active.from_zone_id);
    const b = zoneOf(active.to_zone_id);
    // O ponto que a pessoa marcou vale mais que o centro do bairro: é ele que o
    // motorista segue. Numa corrida de lugares vê-se o embarque de cada um.
    const own: RunPickupPin[] = active.pickup && !runPins.some((p) => p.id === active.id)
      ? [{
        id: active.id,
        at: { lat: active.pickup.lat, lon: active.pickup.lon },
        label: active.pickup.note?.trim() || 'embarque',
        tone: 'pick',
      }]
      : [];
    return (
      <MapScreen
        open={open}
        onOpenChange={setOpen}
        forceOpen
        peek={
          <RoutePeek
            from={active.pickup?.note?.trim() || a?.name || null}
            to={b?.name || null}
            status={STATE_LABEL[active.state]}
            detail={cls?.label ?? null}
            onOpen={() => setOpen(true)}
          />
        }
        map={{
          center,
          zoom: 12.5,
          me: myPos,
          meAccuracy: myAcc,
          pins: [
            ...(a ? [{ id: 'from', at: { lat: a.lat, lon: a.lon }, label: a.name, tone: 'from' as const }] : []),
            ...(b ? [{ id: 'to', at: { lat: b.lat, lon: b.lon }, label: b.name, tone: 'to' as const }] : []),
            ...own,
            ...runPins,
          ],
          route: a && b ? [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }] : null,
          fitKey: `${active.id}|${active.state}|${runPins.length}|${active.pickup ? 1 : 0}`,
          focusToken: focus,
        }}
        top={
          <FloatPill>
            <span className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-white">
              <Navigation className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              {active.state === 'ongoing' ? (b?.name ?? 'Destino') : (a?.name ?? 'Encontro')}
            </span>
          </FloatPill>
        }
        actions={<LocateFab onClick={locate} gps={fabGps} justFixed={justFixed} />}
      >
        {runDesk && <div className="pb-3">{runDesk}</div>}
        <DriverConsole
          tripId={active.id}
          user={user}
          driver={driver}
          zones={zones}
          onFinished={() => { loadActiveTrip(); loadFeed(); loadToday(); onDriverChanged(); }}
          onError={onError}
        />
      </MapScreen>
    );
  }

  // — Praça ————————————————————————————————————————————————————————————————
  return (
    <MapScreen
      open={open}
      onOpenChange={setOpen}
      map={{
        center, zoom: 12.5, me: myPos, meAccuracy: myAcc, bubbles, pins: runPins,
        onBubble: (id) => { setSelected(id); setOpen(true); },
        fitKey: `${feed.length}|${selected ?? ''}|${runPins.length}`,
        focusToken: focus,
      }}
      top={
        <FloatPill className={cn(driver.online && 'ring-2 ring-purple-500/40')}>
          <span className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-white">
            <Radio className={cn('w-4 h-4', driver.online ? 'text-purple-600 dark:text-purple-400 map-pulse' : 'text-zinc-400')} />
            {driver.online
              ? feed.length === 0 ? 'Online — praça quieta' : `${feed.length} pedido${feed.length > 1 ? 's' : ''} na sua categoria`
              : 'Offline — ninguém o vê'}
          </span>
        </FloatPill>
      }
      actions={<LocateFab onClick={locate} gps={fabGps} justFixed={justFixed} />}
    >
      <div className="space-y-3 pt-1">
        {/* Estado do motorista — cartão de comando ao estilo Yango Pro / Uber Driver */}
        <div className={cn(
          'rounded-card p-4 transition-colors',
          driver.online
            ? 'bg-purple-600 text-white shadow-card dark:bg-[#3a1a6e]'
            : 'surface-card',
        )}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <VehicleArt
                kind={vehicleKindFor(driver.class_id, cls?.icon)}
                tone={driver.online ? 'active' : 'idle'}
                className="w-[64px] h-auto shrink-0"
              />
              <div className="min-w-0">
                <p className={cn('text-[12px] font-medium truncate', driver.online ? 'text-purple-100' : 'text-zinc-500 dark:text-zinc-400')}>
                  {driver.public_name} · {driver.plate}
                </p>
                <p className={cn('text-lg font-bold tracking-tight leading-tight', driver.online ? 'text-white' : 'text-ink dark:text-white')}>
                  {driver.online ? 'Online · a receber' : 'Offline'}
                </p>
                <div className={cn('flex items-center gap-3 mt-0.5 text-[12px]', driver.online ? 'text-purple-100' : 'text-zinc-500 dark:text-zinc-400')}>
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    {ratingBadge(driver)}
                  </span>
                  <span>{driver.trips} viagens</span>
                  {driver.trial_trips_left > 0 && <span className="font-bold">teste: {driver.trial_trips_left}</span>}
                </div>
              </div>
            </div>
            <button
              onClick={toggleOnline}
              disabled={onlineBusy}
              role="switch"
              aria-checked={driver.online}
              aria-label="Modo online"
              className={cn(
                'tap-pad-lg w-16 h-9 rounded-full relative transition-colors shrink-0',
                driver.online ? 'bg-white/90 dark:bg-amber-400' : 'bg-zinc-300/70 dark:bg-zinc-700',
              )}
            >
              <span className={cn(
                'absolute top-1 w-7 h-7 rounded-full shadow-hair flex items-center justify-center transition-all duration-300',
                driver.online ? 'left-8 bg-purple-600 dark:bg-ink' : 'left-1 bg-white dark:bg-zinc-900',
              )}>
                {onlineBusy
                  ? <Loader2 className={cn('w-3.5 h-3.5 animate-spin', driver.online ? 'text-white dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400')} />
                  : <Power className={cn('w-3.5 h-3.5', driver.online ? 'text-white dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400')} />}
              </span>
            </button>
          </div>
          {driver.online && (
            <p className={cn(
              'flex w-fit items-center gap-1.5 text-[12px] mt-3 rounded-lg px-2.5 py-1',
              gpsError ? 'font-semibold bg-amber-100 text-amber-800' : 'bg-white/10 text-purple-100',
            )}>
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {gpsError ?? (myPos && home ? `A ${distanceText(myPos, home) ?? '0 m'} da sua praça` : 'A partilhar a sua posição no mapa')}
            </p>
          )}
        </div>

        {/* Painel rápido do dia — ganhos, corridas e praça visíveis num olhar */}
        <div className="grid grid-cols-3 gap-2">
          <div className="surface-card rounded-card p-3">
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-purple-600 dark:text-amber-400 shrink-0" />
              Hoje
            </p>
            <p className="mt-1 font-display text-[17px] font-semibold leading-tight text-ink dark:text-white truncate">
              {formatKz(today?.kz ?? 0)}
            </p>
          </div>
          <div className="surface-card rounded-card p-3">
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Corridas</p>
            <p className="mt-1 font-display text-[17px] font-semibold leading-tight text-ink dark:text-white">
              {today?.trips ?? 0}
            </p>
          </div>
          <div className="surface-card rounded-card p-3">
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Na praça</p>
            <p className="mt-1 font-display text-[17px] font-semibold leading-tight text-purple-700 dark:text-amber-400">
              {feed.length}
            </p>
          </div>
        </div>

        {runDesk}

        <BatteryNotice role="driver" />
        <ShiftNotice uid={user.uid} online={driver.online} />
        <DriverPapers driverId={driver.id} onError={onError} />

        {/* Os últimos 30 dias, contados pelo servidor e não por nós: é o número
            com que a equipa fala com o motorista, por isso ele vê-lo-á também. */}
        {record === 'falhou' ? (
          <p className="px-1 flex items-center gap-2 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
            <CalendarClock className="w-4 h-4 shrink-0" />
            Não conseguimos contar os últimos 30 dias.
            <button
              onClick={loadRecord}
              className="tap-pad font-bold text-purple-600 dark:text-purple-400 shrink-0"
            >
              Tentar de novo
            </button>
          </p>
        ) : record && (
          <p className="px-1 flex items-center gap-2 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
            <CalendarClock className="w-4 h-4 shrink-0" />
            30 dias: {record.accepted === 0
              ? 'sem corridas aceites'
              : cancelBadge(record.accepted, record.mine)}.
          </p>
        )}

        <DriverBoard driver={driver} />

        {/* Primeira vez na praça: três passos, escritos uma vez. */}
        {driver.trips === 0 && (
          <div className="animate-enter rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 shadow-float">
            <p className="flex items-center gap-2 text-[13px] font-bold text-zinc-900 dark:text-zinc-50">
              <Bell className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Primeira vez aqui?
            </p>
            <ol className="mt-2 space-y-1.5 text-[12px] font-medium leading-relaxed text-zinc-600 dark:text-zinc-300">
              <li>1. Ligue o modo online (botão acima) — é isso que põe o seu carro no mapa.</li>
              <li>2. Quando cair um pedido, o telemóvel vibra. Leia o trajecto e aceite.</li>
              <li>3. No encontro, pergunte o código de 4 números e escreva-o. Só aí a corrida começa.</li>
            </ol>
            <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-2.5">
              As suas primeiras viagens são de teste: a equipa acompanha. O dinheiro entra na carteira quando fecha cada corrida.
            </p>
          </div>
        )}

        {loadingFeed && (
          <p className="text-center text-zinc-500 dark:text-zinc-400 py-6 text-sm">a carregar a praça…</p>
        )}

        {!loadingFeed && feed.length === 0 && (
          <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-6 text-center">
            <Navigation className="w-7 h-7 text-zinc-300 dark:text-zinc-600 mx-auto" />
            <p className="font-bold text-zinc-900 dark:text-white mt-2">Sem pedidos nesta categoria</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Fique online — o próximo pedido aparece aqui e no mapa no mesmo segundo.
            </p>
            {cls?.per_seat && ridesOn && (
              <p className="text-[12px] font-bold text-purple-700 dark:text-purple-300 mt-2">
                {cls.label} é de lugares: costuma encher em hora de ponta, junto a escolas e
                terminais. Enquanto a praça está quieta, anuncie a sua corrida acima e venda
                lugar a lugar.
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {ordered.map((t) => {
            const from = zoneOf(t.from_zone_id);
            const to = zoneOf(t.to_zone_id);
            const picked = selected === t.id;
            const isNew = flashId === t.id;
            return (
              <div
                key={t.id}
                className={cn(
                  'rounded-card border p-4 transition-colors',
                  picked
                    ? 'bg-purple-50 dark:bg-amber-400/[0.08] border-purple-400 dark:border-amber-400/60 shadow-card'
                    : 'surface-card',
                  isNew && 'animate-alert border-purple-500 dark:border-amber-400',
                )}
              >
                {/* Cabeçalho do pedido: preço em destaque e badges de transparência imediata */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-amber-400/15 dark:text-amber-300">
                      {t.kind === 'entrega' ? 'Entrega' : t.seats > 1 ? `${t.seats} lugares` : 'Viagem'}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200">
                      {t.distance_km} km
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300 inline-flex items-center gap-1">
                      <Banknote className="w-3 h-3" aria-hidden="true" />
                      {t.payment === 'cash' ? 'Dinheiro' : 'Multicaixa'}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-xl font-semibold tracking-tight leading-none text-purple-700 dark:text-amber-400">
                      {formatKz(t.price_kz)}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {minutesAgo(t.created_at)} · {t.code}
                    </p>
                  </div>
                </div>

                {/* Rota vertical de leitura em < 1,5 s (padrão Uber Driver / Bolt) */}
                <div className="relative mt-3 pl-5 space-y-2">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[5px] top-[9px] bottom-[9px] w-px border-l border-dashed border-purple-300 dark:border-amber-400/45"
                  />
                  <div className="relative flex items-baseline justify-between gap-2">
                    <span
                      aria-hidden="true"
                      className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full bg-purple-600 ring-2 ring-white dark:bg-purple-400 dark:ring-night"
                    />
                    <p className="text-body font-semibold text-ink dark:text-white truncate">{name(t.from_zone_id)}</p>
                    {from && myPos && (
                      <span className="shrink-0 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        a {distanceText(myPos, from) ?? '0 m'}
                      </span>
                    )}
                  </div>
                  <div className="relative flex items-baseline justify-between gap-2">
                    <span
                      aria-hidden="true"
                      className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-[3px] bg-ink dark:bg-amber-400"
                    />
                    <p className="text-body font-semibold text-ink dark:text-white truncate">{name(t.to_zone_id)}</p>
                    {t.pickup && (
                      <span className="shrink-0 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                        ponto exacto
                      </span>
                    )}
                  </div>
                </div>

                {t.kind === 'entrega' && t.parcel && (
                  <p className="mt-2 text-[12px] text-zinc-600 dark:text-zinc-300 truncate">
                    Carga: {t.parcel.what}
                  </p>
                )}

                {/* Zona do polegar: botão de aceitar generoso (48 px) + mapa ao lado */}
                <div className="flex items-center gap-2 mt-3.5">
                  <button
                    onClick={() => setSelected(picked ? null : t.id)}
                    className="h-12 px-3.5 rounded-control text-[12px] font-semibold surface-outline text-zinc-700 dark:text-zinc-200 shrink-0"
                  >
                    {picked ? 'No mapa' : 'Mapa'}
                  </button>
                  <button
                    onClick={() => claim(t.id)}
                    disabled={claimingId === t.id || !driver.online}
                    className={cn(
                      'flex-1 h-12 px-4 rounded-control font-semibold text-[14px] flex items-center justify-center gap-2 transition-transform active:scale-[0.98]',
                      claimingId === t.id || !driver.online ? OFF : 'btn-main',
                    )}
                  >
                    {claimingId === t.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <VehicleArt kind={vehicleKindFor(t.class_id)} tone="active" className="w-7 h-auto" />}
                    Aceitar · {formatKz(t.price_kz)}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {!driver.online && feed.length > 0 && (
          <p className="text-[12px] text-center text-amber-600 dark:text-amber-400 font-medium">
            Active o modo online para poder aceitar pedidos.
          </p>
        )}
      </div>
    </MapScreen>
  );
}
