import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightIcon, CardIcon, CashIcon, ClockIcon, DemoFlaskIcon, PinIcon,
  RouteIcon, SeatIcon, ShareIcon, SpinnerIcon, SwapVerticalIcon, UsersIcon,
} from '../components/ElaraIcons';
import { supabase, rpcError } from '../lib/supabase';
import type { DeliveryClass, ParcelSize, Pickup, Quote, SessionUser, Trip, TripKind, VehicleClass, Zone } from '../types';
import { ZonePicker } from '../components/ZonePicker';
import { ClassPicker } from '../components/ClassPicker';
import { SERVICE_HINT, ServiceGrid, type Service } from '../components/ServiceGrid';
import { TripConsole } from '../components/TripConsole';
import { MatchingPanel } from '../components/MatchingPanel';
import { MapScreen } from '../components/MapScreen';
import { RideBoard } from '../components/RideBoard';
import { PickupField } from '../components/PickupField';
import { FloatPill, LocateFab, NearbyPill, RoutePeek, WhereAmI } from '../components/MapBits';
import { QuoteCard } from '../components/QuoteCard';
import { ParcelFields } from '../components/ParcelFields';
import { OrderNotice } from '../components/OrderNotice';
import { linkOrder, type OrderSeed } from '../lib/orders';
import { SavedPlaces } from '../components/SavedPlaces';
import { RecentPlaces, recentDestinations } from '../components/RecentPlaces';
import type { MapCar, MapPin } from '../components/MapView';
import { LUANDA, haversineKm } from '../lib/map';
import { ParcelPicker } from '../components/ParcelPicker';
import { distanceText, useDriverPresence, useFixFlash, useMyPosition, useNearbyDrivers, NEARBY_MAX_KM, type LatLon } from '../lib/geo';
import { ridesLive, setPickup as pushPickup } from '../lib/rides';
import { nameAt, usePlacesReady, type Place } from '../lib/places';
import { deletePlace, fetchPlaces, placesLive, savePlace, type SavedPlace } from '../lib/extras';
import {
  loadLocalPlaces, mergeSavedPlaces, removeLocalPlace, saveLocalPlace, type RepeatTripSeed,
} from '../lib/localExtras';
import { useDemo } from '../lib/demoContext';
import {
  buildDemoNearbyCars, computeDemoQuote, createDemoTrip, demoDriverPosition,
} from '../lib/demoEngine';
import { ServiceArt } from '../components/ServiceArt';
import { STATE_LABEL, greeting, hourTip } from '../lib/trips';
import { cn, meters, OFF, OFF_ATTR } from '../lib/utils';
import { formatKz } from '../lib/money';

interface RideViewProps {
  user: SessionUser | null;
  zones: Zone[];
  classes: VehicleClass[];
  deliveryClasses: DeliveryClass[];
  activeTrip: Trip | null;
  /** O histórico que já está na memória da app — é dele que saem os destinos recentes. */
  trips: Trip[];
  freshPins: { pin: string; dropPin?: string | null } | null;
  onLogin: () => void;
  /** Liga o modo demonstração directamente na app real. */
  onOpenDemo?: () => void;
  /** O chip "Alugar" leva ao ecrã de aluguer — é outra sala, não um tipo de viagem. */
  onOpenRentals: () => void;
  /** Mensagem de quem acabou de pedir — um lugar reservado não é um carro fechado. */
  onTripCreated: (pins: { pin: string; dropPin?: string | null }, message?: string) => void;
  onRefreshTrips: () => void;
  onError: (message: string) => void;
  /** O painel SOS do menu — a verificação de viagem abre-o, não há dois. */
  onSos: () => void;
  /** Encomenda do Elara Marketplace trazida por ligação `#/encomenda/…`. */
  order: { seed: OrderSeed | null; loading: boolean; missing: boolean } | null;
  onOrderDismiss: () => void;
  /** Semente de repetição vinda do histórico ou recibo. */
  repeatSeed?: RepeatTripSeed | null;
  onRepeatConsumed?: () => void;
}

type Kind = 'passageiro' | 'entrega';
type Pay = 'cash' | 'multicaixa';

/** As categorias de carga que fazem uma mudança — o aluguer é outra sala. */
const CARGO_CLASSES = ['picape', 'canter', 'camiao', 'carga'];

/** O que cada porta pede antes do toque. O título é a pergunta que a pessoa traz. */
const SERVICE_TITLE: Record<Service, string> = {
  carro: 'Para onde vais?',
  moto: 'Para onde vais?',
  partilha: 'Vão juntos?',
  entrega: 'O que vais enviar?',
  mudanca: 'O que vais mudar?',
};

export function RideView({
  user, zones, classes, deliveryClasses, activeTrip, trips, freshPins,
  onLogin, onOpenDemo, onOpenRentals, onTripCreated, onRefreshTrips, onError, onSos, order, onOrderDismiss,
  repeatSeed, onRepeatConsumed,
}: RideViewProps) {
  const demoCtx = useDemo();
  const isDemo = !!demoCtx?.isDemo;
  const [service, setService] = useState<Service>('carro');
  // Uma encomenda ou uma mudança são viagens de carga para o servidor; a
  // diferença é só o que a pessoa vê e escolhe.
  const kind: Kind = service === 'entrega' || service === 'mudanca' ? 'entrega' : 'passageiro';
  // A carrinha cheia («lugar») vive dentro da partilha: é a outra forma de não
  // alugar um carro sozinho.
  const [boardOpen, setBoardOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [parcelSize, setParcelSize] = useState<string>('documento');
  const [seats, setSeats] = useState(1);
  // Quantas pessoas vão no carro alugado em conjunto (partilha). O preço é do
  // carro inteiro; este número serve para dividir, não para multiplicar.
  const [partySize, setPartySize] = useState(2);
  const [payment, setPayment] = useState<Pay>('cash');
  const [quoteResult, setQuoteResult] = useState<{ key: string; value: Quote | null; failed: boolean } | null>(null);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const [focus, setFocus] = useState(0);
  const [what, setWhat] = useState('');
  const [toName, setToName] = useState('');
  const [toPhone, setToPhone] = useState('');
  const [payBy, setPayBy] = useState<'remetente' | 'destinatario'>('remetente');
  // O ponto exacto no mapa (0004). Marca-se quando apetece, e só se escreve na
  // viagem quando ela existe: um ponto sem viagem é um desejo.
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickupBusy, setPickupBusy] = useState(false);
  // Os lugares partilhados só existem com a migração 0004 aplicada. Sem ela não
  // há quadro de saídas, e a app não mostra uma porta que não abre.
  const [ridesOn, setRidesOn] = useState(false);
  // Sem a migração 0004 não há campo `pickup` na viagem: o ponto de referência
  // passa então a ser a primeira mensagem do chat, que os dois lados vêem e o
  // servidor guarda. É menos bonito e chega ao mesmo sítio — ao motorista.
  const [landmark, setLandmark] = useState('');
  // O destino também pode ser um lugar com nome. O preço não muda — é sempre o
  // da zona onde o ponto cai — mas o motorista lê «Shopping Vianodo» em vez de
  // «Luanda», que é a diferença entre parar à porta e dar três voltas.
  const [destPlace, setDestPlace] = useState<Place | null>(null);
  // Os atalhos guardados funcionam já neste telemóvel e juntam-se ao servidor quando a 0005 estiver activa.
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [placesServerLive, setPlacesServerLive] = useState(false);
  const [placeBusy, setPlaceBusy] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const uid = user?.uid ?? null;
  // Os milhares de nomes de lugar chegam ao aparelho um instante depois da
  // tela; esta bandeira é o que faz o bairro recalculado aparecer sozinho.
  const indexReady = usePlacesReady();

  // Uma encomenda do Marketplace chega com os campos meio escritos. Preenche-
  // se uma vez por código: depois do primeiro toque a pessoa é que manda no
  // formulário, e um re-render não volta a escrever nada por cima dela.
  const seededCode = useRef<string | null>(null);
  useEffect(() => {
    const seed = order?.seed;
    if (!seed || seededCode.current === seed.code) return;
    seededCode.current = seed.code;
    setService('entrega');
    setBoardOpen(false);
    setWhat(seed.what);
    setToName(seed.toName);
    setToPhone(seed.toPhone);
    setParcelSize(seed.parcelSize);
    setOpen(true);
  }, [order?.seed]);
  useEffect(() => {
    if (!uid || isDemo) { setRidesOn(false); return; }
    let alive = true;
    ridesLive().then((v) => { if (alive) setRidesOn(v); });
    return () => { alive = false; };
  }, [uid, isDemo]);

  // Em modo demonstração, preenche logo uma rota real em Luanda para mostrar
  // preço, mapa e carros prontos ao primeiro olhar — continuando 100% editável.
  const demoSeededRef = useRef(false);
  useEffect(() => {
    if (!isDemo) { demoSeededRef.current = false; return; }
    if (demoSeededRef.current || activeTrip || from || to || zones.length < 2) return;
    demoSeededRef.current = true;
    setFrom(zones.find((z) => z.id === 'd-talatona')?.id ?? zones[0].id);
    setTo(zones.find((z) => z.id === 'd-ilha')?.id ?? zones[1].id);
  }, [isDemo, activeTrip, from, to, zones]);

  // Repetir uma viagem anterior num toque: carrega serviço, rota, categoria e pagamento.
  const consumedRepeat = useRef<string | null>(null);
  useEffect(() => {
    if (!repeatSeed || consumedRepeat.current === repeatSeed.token) return;
    consumedRepeat.current = repeatSeed.token;
    setService(repeatSeed.service);
    setBoardOpen(false);
    setFrom(repeatSeed.fromZoneId);
    setTo(repeatSeed.toZoneId);
    setClassId(repeatSeed.classId);
    setPayment(repeatSeed.payment);
    if (repeatSeed.service === 'partilha') setPartySize(Math.max(2, repeatSeed.seats));
    else setSeats(Math.max(1, repeatSeed.seats));
    if (repeatSeed.parcelSize) setParcelSize(repeatSeed.parcelSize);
    setAutoFrom(null);
    setDestPlace(null);
    setOpen(true);
    onRepeatConsumed?.();
  }, [repeatSeed, onRepeatConsumed]);

  useEffect(() => {
    if (!uid) { setPlaces([]); setPlacesServerLive(false); return; }
    let alive = true;
    const local = loadLocalPlaces(uid);
    setPlaces(local);
    if (isDemo) {
      setPlacesServerLive(false);
      return;
    }
    placesLive().then(async (live) => {
      if (!alive) return;
      setPlacesServerLive(live);
      if (!live) return;
      const rows = await fetchPlaces(uid);
      if (alive) setPlaces(mergeSavedPlaces(rows ?? [], loadLocalPlaces(uid)));
    });
    return () => { alive = false; };
  }, [uid, isDemo]);

  const gps = useMyPosition();
  const liveDriverPos = useDriverPresence(isDemo ? null : activeTrip?.driver_id);
  const driverPos = isDemo && activeTrip ? demoDriverPosition(activeTrip, zones) : liveDriverPos;

  const selectedClass = classes.find((c) => c.id === classId) ?? null;
  const selectedDelivery = deliveryClasses.find((d) => d.id === parcelSize) ?? null;
  // As categorias de carga (picape, Canter, camião) não são um táxi com mais
  // lugares: aparecem nas entregas e no aluguer, nunca no pedido de Passageiro.
  const passengerClasses = useMemo(() => classes.filter((c) => c.lane !== 'carga'), [classes]);
  const motoClasses = useMemo(() => passengerClasses.filter((c) => c.id === 'moto'), [passengerClasses]);
  // Partilhar é repartir um carro fechado. As categorias por lugar (táxi
  // colectivo, candongueiro, Hiace) já são vendidas ao lugar — ficam de fora.
  const sharedClasses = useMemo(
    () => passengerClasses.filter((c) => !c.per_seat && c.seats >= 2),
    [passengerClasses],
  );
  const cargoDelivery = useMemo(
    () => deliveryClasses.filter((d) => CARGO_CLASSES.includes(d.class_id)),
    [deliveryClasses],
  );
  const modeDelivery = service === 'mudanca' ? cargoDelivery : deliveryClasses;
  const quoteClassId = kind === 'entrega'
    ? (selectedDelivery?.class_id ?? null)
    : (passengerClasses.find((c) => c.id === classId)?.id ?? null);
  const quoteSeats = service === 'partilha' && selectedClass
    ? Math.min(partySize, selectedClass.seats)
    : kind === 'passageiro' && selectedClass?.per_seat
      ? Math.min(seats, selectedClass.seats) : 1;
  const fromZone = zones.find((z) => z.id === (activeTrip?.from_zone_id ?? from)) ?? null;
  const toZone = zones.find((z) => z.id === (activeTrip?.to_zone_id ?? to)) ?? null;
  const quoteKey = from && to && from !== to && quoteClassId && !boardOpen && !activeTrip
    ? `${quoteClassId}|${from}|${to}|${quoteSeats}|${kind}|${kind === 'entrega' ? parcelSize : ''}` : null;
  const requestKey = quoteKey && uid ? `${uid}|${quoteKey}|${quoteAttempt}` : null;
  const currentResult = requestKey && quoteResult?.key === requestKey ? quoteResult : null;
  const quote = currentResult?.value ?? null;
  const quoteFailed = currentResult?.failed ?? false;
  const quoting = !!requestKey && !currentResult;

  // Para onde a pessoa já foi neste tipo de viagem. A fila sai do histórico que
  // já está na memória da app: sem migração e sem inventar nomes — uma zona que
  // desapareceu da base nunca se oferece como atalho.
  const recents = useMemo(
    () => recentDestinations(trips, zones, kind),
    [trips, zones, kind],
  );

  // O resumo que fica na folha fechada. Fechar a folha é o gesto de quem quer
  // ver o mapa — não de quem quer perder a rota de vista, e até aqui era
  // exactamente isso que acontecia: meio cartão cortado e nada escolhido.
  const peekFrom = pickup?.note?.trim() || fromZone?.name || null;
  // O lugar com nome só vale para a viagem que se está a pedir: numa viagem já
  // criada é a zona do servidor que manda, e um nome velho seria uma mentira.
  const peekTo = (!activeTrip && kind === 'passageiro' ? destPlace?.name : null) || toZone?.name || null;
  const peekDetail = activeTrip
    ? classes.find((c) => c.id === activeTrip.class_id)?.label ?? null
    : kind === 'entrega'
      ? selectedDelivery?.label ?? null
      : selectedClass?.label ?? null;

  // Mudanças de casa e carga entre províncias têm custos que a app não pode
  // calcular sozinha. Dizer isso antes do pedido evita a discussão no destino.
  const quoteNote = useMemo(() => {
    if (!quote || kind !== 'entrega') return null;
    const isCargo = classes.find((c) => c.id === quote.classId)?.lane === 'carga';
    if (!isCargo && quote.distanceKm < 60) return null;
    return 'Este preço cobre a viagem. Portagens, combustível em trânsito e espera fora da rota combinam-se com o motorista antes de partir.';
  }, [quote, kind, classes]);

  // Uma mudança só tem veículos de carga. Se o tamanho de encomenda escolhido
  // antes (um documento, por exemplo) não serve, troca-se por um que sirva.
  useEffect(() => {
    if (service !== 'mudanca' || !cargoDelivery.length) return;
    if (!cargoDelivery.some((d) => d.id === parcelSize)) {
      setParcelSize(
        cargoDelivery.find((d) => d.id === 'canter')?.id
          ?? cargoDelivery.find((d) => d.id === 'moveis')?.id
          ?? cargoDelivery[0].id,
      );
    }
  }, [service, cargoDelivery, parcelSize]);

  useEffect(() => {
    if (kind === 'entrega') {
      if (selectedDelivery && selectedDelivery.class_id !== classId) {
        setClassId(selectedDelivery.class_id);
      }
      return;
    }
    const pool = service === 'moto' ? motoClasses
      : service === 'partilha' ? sharedClasses
        : passengerClasses;
    if (!pool.some((c) => c.id === classId)) {
      setClassId(pool.find((c) => c.id === 'economico')?.id ?? pool[0]?.id ?? null);
    }
  }, [kind, service, passengerClasses, motoClasses, sharedClasses, classId, selectedDelivery]);

  useEffect(() => {
    setSeats((s) => selectedClass?.per_seat && kind === 'passageiro'
      ? Math.min(s, selectedClass.seats) : 1);
  }, [selectedClass, kind]);

  // Os lugares da partilha são para dividir o carro: no mínimo dois.
  useEffect(() => {
    if (!selectedClass) return;
    const most = Math.max(2, selectedClass.seats);
    setPartySize((p) => Math.min(Math.max(2, p), most));
  }, [selectedClass]);

  // Uma pergunta, uma vez. Quem negar o GPS fica com o mapa centrado na zona.
  const askGps = gps.ask;
  useEffect(() => { if (user) askGps(); }, [user, askGps]);

  // O GPS aponta a zona mais perto: é assim que a Uber começa, e poupa à pessoa
  // a procura no mapa. Nunca por cima de uma escolha dela, e dizemos de onde
  // veio a sugestão.
  const [autoFrom, setAutoFrom] = useState<{ id: string; meters: number } | null>(null);
  useEffect(() => {
    if (from || activeTrip || !gps.pos || !zones.length) return;
    let best = zones[0];
    let bestKm = Infinity;
    for (const z of zones) {
      const km = haversineKm(gps.pos.lat, gps.pos.lon, z.lat, z.lon);
      if (km < bestKm) { bestKm = km; best = z; }
    }
    setFrom(best.id);
    setAutoFrom({ id: best.id, meters: Math.round(bestKm * 1000) });
  }, [gps.pos, zones, from, activeTrip]);

  const center = useMemo<LatLon>(
    () => (fromZone ? { lat: fromZone.lat, lon: fromZone.lon } : gps.pos ?? LUANDA),
    [fromZone, gps.pos],
  );

  // Enquanto procura motorista os carros continuam à vista — é o que a Uber e a
  // Bolt fazem, e é a única coisa que diz à pessoa que o pedido não caiu no vazio.
  // A partir de um carro aceite, só mostramos o dele: os outros deixam de importar.
  const showNearby = !activeTrip || activeTrip.state === 'searching';
  const nearby = useNearbyDrivers(center, !!user && showNearby && !isDemo);
  const effectiveNearbyCars = useMemo(
    () => (isDemo ? (showNearby ? buildDemoNearbyCars(center) : []) : nearby.cars),
    [isDemo, showNearby, center, nearby.cars],
  );
  const cars = useMemo<MapCar[]>(
    () => (showNearby ? effectiveNearbyCars.map((c) => ({ id: c.driver_id, at: { lat: c.lat, lon: c.lon } })) : []),
    [effectiveNearbyCars, showNearby],
  );

  // O ponto de embarque: enquanto a viagem existe é uma coisa do servidor, antes
  // disso é só a intenção de quem está a escolher o pedido. Só se marca até o
  // motorista estar dentro do carro — depois disso mudar o ponto é outro pedido.
  useEffect(() => {
    setPicking(false);
    setPickup(activeTrip?.pickup ?? null);
  }, [activeTrip?.id]);

  const canMarkPickup = !activeTrip
    || ['searching', 'accepted', 'arriving', 'waiting_pin'].includes(activeTrip.state);

  const savePickup = async (next: Pickup) => {
    if (!activeTrip) { setPickup(next); return; }
    if (pickupBusy) return;
    setPickupBusy(true);
    const msg = await pushPickup(activeTrip.id, next);
    setPickupBusy(false);
    if (msg) { onError(msg); return; }
    setPickup(next);
    onRefreshTrips();
  };

  // O pedido de lugar usa o ponto só quando a pessoa o marcou; sem marca, a
  // carrinha pára na paragem da zona, que é o que sempre fez.
  const onPick = (at: LatLon) => {
    setPicking(false);
    void savePickup({ lat: at.lat, lon: at.lon, note: pickup?.note ?? '' });
  };

  // — «Onde estou» ——————————————————————————————————————————————————————————
  // O botão da localização faz três coisas de uma vez: pede ao aparelho uma
  // leitura NOVA (a da cache pode ter um minuto e ser noutro bairro), leva a
  // câmara até ela, e dá-lhe um nome. Só os dois primeiros eram o que a pessoa
  // via mexer, e é por isso que o bairro antigo ficava no ecrã.
  // Uma leitura que chegou sozinha (a primeira, ao abrir o ecrã) não rouba a
  // câmara aos pinos: só um toque da pessoa centra no ponto dela.
  const { arm: fixArm, justFixed } = useFixFlash(gps.updatedAt, () => setFocus((f) => f + 1));

  const locate = () => {
    fixArm();
    setFocus((f) => f + 1);
    gps.ask(true);
  };

  const whereIAm = useMemo(
    () => (gps.pos && zones.length ? nameAt(gps.pos.lat, gps.pos.lon, zones) : null),
    // O índice de nomes chega depois do primeiro ecrã: sem aqui, o bairro
    // ficava para sempre na zona com que a tela nasceu.
    [gps.pos, zones, indexReady],
  );

  // Uma acção, e é a que falta. Se a sugestão automática apanhou a pessoa noutro
  // bairro entretanto, é a partida que está errada (e é a partida que dá o
  // preço); se a zona bate certo, o que falta é a porta exacta.
  const whereAction = useMemo(() => {
    const at = gps.pos;
    const w = whereIAm;
    if (!at || !w) return null;
    const named = w.place ?? w.bairro ?? w.zone;
    if (!named) return null;
    if (autoFrom && from === autoFrom.id && w.zoneId && w.zoneId !== from) {
      const zoneId = w.zoneId;
      return {
        kind: 'move' as const,
        label: `Mudar a partida para ${w.zone}`,
        onClick: () => { setFrom(zoneId); setAutoFrom(null); setPickup(null); setLandmark(''); },
      };
    }
    if (ridesOn && !pickup) {
      return {
        kind: 'use' as const,
        label: 'Usar como ponto de embarque',
        onClick: () => void savePickup({ lat: at.lat, lon: at.lon, note: named }),
      };
    }
    if (!ridesOn && kind === 'passageiro' && !landmark.trim()) {
      return {
        kind: 'use' as const,
        label: `Pôr «${named}» na referência`,
        onClick: () => setLandmark(named),
      };
    }
    return null;
  }, [gps.pos, whereIAm, autoFrom, from, ridesOn, pickup, kind, landmark]);

  // Um nome do índice faz duas coisas: põe o ponto exacto no mapa e escreve o
  // nome onde o motorista lê. Sem a 0004 aplicada não há campo `pickup` na
  // viagem, por isso o nome vai para a referência que entra no chat — o nome
  // chega sempre, o ponto é que depende da migração.
  const onExactPlace = (p: Place) => {
    setPickup({ lat: p.lat, lon: p.lon, note: p.name });
    if (!ridesOn) setLandmark(p.name);
  };

  // Escolher um lugar no destino põe a zona dele (é a zona que preço e busca
  // usam) e guarda o nome para a primeira mensagem do chat.
  const onExactDest = (p: Place) => {
    setTo(p.zoneId);
    setDestPlace(p);
  };

  // A app reconheceu o nome do ponto tocado no mapa: um toque pass-a a nota,
  // e grava-se de uma vez — a pessoa não tem de o escrever à mão no telemóvel.
  const usePlaceName = (name: string) => {
    if (!pickup) return;
    void savePickup({ ...pickup, note: name });
  };

  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    if (fromZone) {
      out.push({
        id: 'from', at: { lat: fromZone.lat, lon: fromZone.lon }, label: fromZone.name, tone: 'from',
        scan: activeTrip?.state === 'searching',
      });
    }
    if (toZone) out.push({ id: 'to', at: { lat: toZone.lat, lon: toZone.lon }, label: toZone.name, tone: 'to' });
    // O ponto marcado por cima da zona: é ele que o motorista segue.
    if (pickup) {
      out.push({
        id: 'pickup', at: { lat: pickup.lat, lon: pickup.lon },
        label: pickup.note?.trim() ? pickup.note.trim() : 'o meu ponto', tone: 'pick',
      });
    }
    return out;
  }, [fromZone, toZone, pickup, activeTrip?.state]);

  const route = useMemo<LatLon[] | null>(
    () => (fromZone && toZone ? [{ lat: fromZone.lat, lon: fromZone.lon }, { lat: toZone.lat, lon: toZone.lon }] : null),
    [fromZone, toZone],
  );

  // O preço vem do servidor (ou do motor local quando o modo demonstração está activo).
  useEffect(() => {
    if (!quoteKey || !requestKey) return;
    const [pClass, pFrom, pTo, pSeats, pKind, pParcel] = quoteKey.split('|');
    if (isDemo) {
      const value = computeDemoQuote({
        classId: pClass,
        fromZoneId: pFrom,
        toZoneId: pTo,
        seats: Number(pSeats),
        kind: pKind as TripKind,
        parcelSize: pParcel || null,
        zones,
        classes,
        deliveryClasses,
      });
      setQuoteResult({ key: requestKey, value, failed: !value });
      return;
    }
    let alive = true;
    supabase
      .rpc('tr_quote', {
        p_class_id: pClass, p_from_zone_id: pFrom, p_to_zone_id: pTo,
        p_seats: Number(pSeats), p_kind: pKind, p_parcel_size: pParcel || null,
      })
      .then(({ data, error }) => {
        if (!alive) return;
        setQuoteResult({ key: requestKey, value: error ? null : data as Quote | null, failed: !!error || !data });
      }, () => {
        if (alive) setQuoteResult({ key: requestKey, value: null, failed: true });
      });
    return () => { alive = false; };
  }, [quoteKey, requestKey, isDemo, zones, classes, deliveryClasses]);

  // — Viagem em curso: o mapa segue o carro, o painel manda na viagem ————
  if (activeTrip) {
    const eta = driverPos ? distanceText(gps.pos ?? center, driverPos) : null;
    // O carro do nosso motorista é o único que importa agora: marcador maior,
    // cor da Elara, e a deslizar de 15 em 15 segundos conforme a posição dele.
    const driverCar: MapCar[] = driverPos && activeTrip.driver_id
      ? [{ id: `meu-${activeTrip.driver_id}`, at: driverPos, assigned: true }]
      : [];
    return (
      <MapScreen
        collapsible
        open={open}
        onOpenChange={setOpen}
        forceOpen={activeTrip.state !== 'searching'}
        peek={
          <RoutePeek
            from={peekFrom}
            to={peekTo}
            status={STATE_LABEL[activeTrip.state]}
            detail={peekDetail}
            priceKz={activeTrip.price_kz}
            onOpen={() => setOpen(true)}
          />
        }
        map={{
          center, pins, cars: [...cars, ...driverCar], me: gps.pos, meAccuracy: gps.accuracy, route,
          follow: driverPos,
          onPick: picking ? onPick : undefined,
          // O círculo é o raio que o servidor usa: alargar a procura vê-se no mapa.
          radar: activeTrip.state === 'searching' && fromZone
            ? { at: { lat: fromZone.lat, lon: fromZone.lon }, radiusKm: nearby.radiusKm }
            : null,
          fitKey: `${activeTrip.id}|${activeTrip.state}|${open ? 'o' : 'c'}|${pickup ? `${pickup.lat},${pickup.lon}` : ''}`,
          focusToken: focus,
          zoom: 13.5,
        }}
        top={
          picking ? (
            <FloatPill>
              <span className="flex items-center gap-2 text-[13px] font-semibold text-amber-800 dark:text-amber-300">
                <PinIcon className="w-4 h-4" /> Toque no mapa, no sítio onde vai estar
              </span>
            </FloatPill>
          ) : (
            <FloatPill>
              <span className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-white">
                <span className={cn('w-2 h-2 rounded-full', activeTrip.state === 'searching' ? 'bg-amber-400' : 'bg-purple-500 map-pulse')} />
                {STATE_LABEL[activeTrip.state]}
                {driverPos && eta && <span className="font-bold text-zinc-500 dark:text-zinc-400">· motorista a {eta}</span>}
              </span>
            </FloatPill>
          )
        }
        actions={<LocateFab onClick={locate} gps={gps.status} justFixed={justFixed} />}
      >
        {activeTrip.state === 'searching' && (
          <div className="pb-4">
            <MatchingPanel
              createdAt={activeTrip.created_at}
              fromLabel={fromZone?.name ?? 'si'}
              classLabel={classes.find((c) => c.id === activeTrip.class_id)?.label ?? 'viagem'}
              kind={activeTrip.kind}
              cars={effectiveNearbyCars.length}
              radiusKm={nearby.radiusKm}
              maxRadiusKm={NEARBY_MAX_KM}
              canWiden={!isDemo && nearby.canWiden}
              onWiden={nearby.widen}
              failed={!isDemo && nearby.failed}
              onRetry={nearby.refresh}
            />
          </div>
        )}
        {/* O ponto exacto do encontro: a zona diz ao motorista o bairro, este
            ponto diz-lhe a porta. Só se marca enquanto ninguém está dentro, e só
            aparece quando o servidor tem `tr_set_pickup` (0004) para o guardar. */}
        {user && ridesOn && canMarkPickup && (
          <div className="pb-2.5">
            <PickupField
              pickup={pickup}
              picking={picking}
              busy={pickupBusy}
              at={gps.pos ?? center}
              zoneName={fromZone?.name}
              zones={zones}
              onAskPick={() => setPicking((p) => !p)}
              onNote={(note) => setPickup(pickup ? { ...pickup, note } : pickup)}
              onNoteDone={() => { if (pickup) void savePickup(pickup); }}
              onName={usePlaceName}
            />
          </div>
        )}
        <TripConsole
          trip={activeTrip}
          user={user!}
          zones={zones}
          freshPins={freshPins}
          driverPos={driverPos}
          onTripEnded={onRefreshTrips}
          onTripChanged={onRefreshTrips}
          onError={onError}
          onSos={onSos}
        />
      </MapScreen>
    );
  }

  // — Ecrã de pedido ——————————————————————————————————————————————————————
  // O preço tem de estar visto antes do toque: com `quoting` a pedido o botão
  // acender-se-ia com um valor que ainda não chegou do servidor.
  const canSubmit =
    !!from && !!to && from !== to && !!quoteClassId && !!quote && !quoting && !busy &&
    (kind === 'passageiro' || (what.trim().length >= 3 && !!toName.trim() && toPhone.replace(/\D/g, '').length >= 9));
  // A parte de cada um: o preço é do carro inteiro, por isso divide-se. Arredonda
  // aos 5 Kz para cima — ninguém combina cêntimos à porta do carro.
  const eachKz = quote && service === 'partilha'
    ? Math.ceil(quote.priceKz / Math.max(2, quoteSeats) / 5) * 5 : 0;
  const receiverWord = service === 'mudanca' ? 'a pessoa no destino' : 'quem recebe';
  const submitHint = busy ? 'A enviar o seu pedido…'
    : !from ? 'Escolha de onde parte.'
    : !to ? 'Escolha para onde vai.'
    : from === to ? 'Escolha uma zona de destino diferente.'
    : !quoteClassId ? 'Escolha uma categoria disponível.'
    : quoteFailed ? 'O preço não carregou. Tente novamente.'
    : quoting ? 'A calcular o preço da sua rota…'
    : kind === 'entrega' && what.trim().length < 3 ? (service === 'mudanca' ? 'Diga o que vai mudar (mínimo 3 letras).' : 'Descreva o que vai enviar (mínimo 3 letras).')
    : kind === 'entrega' && !toName.trim() ? `Escreva o nome de ${receiverWord}.`
    : kind === 'entrega' && toPhone.replace(/\D/g, '').length < 9 ? `Escreva o telefone de ${receiverWord} (mínimo 9 dígitos).`
    : service === 'partilha' && quote
      ? `${quoteSeats} pessoas · ${formatKz(eachKz)} por pessoa · o carro é vosso`
      : `Preço fechado · pagamento ${payment === 'cash' ? 'em dinheiro' : 'por Multicaixa'}`;

  const submit = async () => {
    if (!canSubmit || !user) return;
    setBusy(true);
    const parcel = kind === 'entrega'
      ? { size: parcelSize as ParcelSize, what: what.trim(), toName: toName.trim(), toPhone: toPhone.trim(), payBy }
      : null;

    if (isDemo && demoCtx && quote) {
      let createdPins: { pin: string; dropPin?: string | null } = { pin: '4821', dropPin: null };
      const destNote = destPlace && kind === 'passageiro'
        ? `O meu destino é ${destPlace.name}${destPlace.parent ? ` (${destPlace.parent})` : ''}.`
        : undefined;
      demoCtx.setDemoState((prev) => {
        const res = createDemoTrip(prev, {
          quote,
          kind,
          payment,
          parcel,
          pickup,
          landmark: kind === 'passageiro' ? landmark : undefined,
          destNote,
        });
        createdPins = { pin: res.pin, dropPin: res.dropPin };
        return res.state;
      });
      setLandmark('');
      setDestPlace(null);
      setBusy(false);
      setWhat(''); setToName(''); setToPhone('');
      const createdMsg = service === 'partilha'
        ? `Carro demo pedido para ${quoteSeats} pessoas.`
        : service === 'mudanca'
          ? 'Mudança demo criada — acompanhe o trajecto no ecrã real.'
          : 'Pedido demo criado — o motorista vai aceitar já a seguir.';
      onTripCreated(createdPins, createdMsg);
      return;
    }

    const { data, error } = await supabase.rpc('tr_create_trip', {
      p_class_id: quoteClassId,
      p_from_zone_id: from,
      p_to_zone_id: to,
      p_seats: quoteSeats,
      p_payment: payment,
      p_kind: kind,
      p_for_whom: null,
      p_parcel: parcel,
    });
    if (error) { setBusy(false); onError(rpcError(error)); return; }
    const created = data as { id: string; code: string; pin: string; dropPin?: string | null };
    // A ligação encomenda↔viagem é a migração 0006. Sem ela o `tr_link_order`
    // não existe e isto não faz nem barulho: a entrega acontece igual.
    if (order?.seed) void linkOrder(created.id, order.seed.code);
    // O ponto marcado é um pormenor do encontro, não uma condição do pedido. Se
    // não for gravado, a pessoa é apanhada na paragem da zona, como sempre foi —
    // e dizemos isso, em vez de deixar combinado no ar.
    if (pickup) {
      const msg = await pushPickup(created.id, pickup);
      if (msg) onError('A viagem foi criada, mas o ponto marcado não ficou guardado. Combine a porta no chat.');
    }
    // O ponto de referência escrito à mão segue como primeira mensagem: fica
    // registado tal como o combinado, e o motorista lê-o antes de ligar. O
    // destino nomeado vai na mesma mensagem — não há campo de destino com nome
    // na viagem (nem com a 0004), por isso o chat é o único sítio honesto.
    const note = landmark.trim();
    const lines = [
      note && kind === 'passageiro' ? `O meu ponto de encontro: ${note}` : null,
      destPlace && kind === 'passageiro'
        ? `O meu destino é ${destPlace.name}${destPlace.parent ? ` (${destPlace.parent})` : ''}.`
        : null,
    ].filter((l): l is string => !!l);
    if (lines.length) {
      const { error: chatError } = await supabase.from('tr_chat_message').insert({
        trip_id: created.id,
        sender_role: 'passenger',
        text: lines.join('\n'),
        at: Date.now(),
      });
      if (chatError) onError('A viagem foi criada. Não foi possível guardar os pontos de encontro — escreva-os no chat.');
      setLandmark('');
      setDestPlace(null);
    }
    setBusy(false);
    const createdMsg = service === 'partilha'
      ? `Carro pedido para ${quoteSeats}. O preço é do carro inteiro — dividam entre vocês e paguem ao motorista.`
      : service === 'mudanca'
        ? 'Mudança pedida. O motorista liga para combinar a hora e quem carrega.'
        : undefined;
    onTripCreated({ pin: created.pin, dropPin: created.dropPin }, createdMsg);
    setWhat(''); setToName(''); setToPhone('');
  };

  // Os atalhos guardam o destino escolhido; um toque volta a pedir o preço ao
  // servidor, por isso a tarifa nunca vem de um endereço guardado na memória.
  const pickPlace = (p: SavedPlace) => {
    if (p.zone_id) { setTo(p.zone_id); setDestPlace(null); return; }
    onError('Esse atalho não tem zona associada. Escolha o destino na lista.');
  };

  const addPlace = async (emoji: string, customLabel?: string) => {
    if (!uid || !toZone || !to) return;
    const label = (customLabel ?? toZone.name).trim() || toZone.name;
    setPlaceBusy(true);
    if (!placesServerLive) {
      const nextLocal = saveLocalPlace(uid, {
        label,
        emoji,
        zone_id: to,
        lat: toZone.lat,
        lon: toZone.lon,
        note: destPlace?.name ?? '',
      });
      setPlaces(nextLocal);
      setPlaceBusy(false);
      return;
    }
    const msg = await savePlace({
      owner_id: uid,
      label,
      emoji,
      zone_id: to,
      lat: toZone.lat,
      lon: toZone.lon,
      note: destPlace?.name ?? '',
    });
    if (msg) {
      const nextLocal = saveLocalPlace(uid, {
        label,
        emoji,
        zone_id: to,
        lat: toZone.lat,
        lon: toZone.lon,
        note: destPlace?.name ?? '',
      });
      setPlaces((prev) => mergeSavedPlaces(prev.filter((p) => !p.id.startsWith('local-')), nextLocal));
      onError('Guardado neste telemóvel (o servidor não respondeu).');
    } else {
      const rows = await fetchPlaces(uid);
      setPlaces(mergeSavedPlaces(rows ?? [], loadLocalPlaces(uid)));
    }
    setPlaceBusy(false);
  };

  const removePlace = async (id: string) => {
    if (!uid) return;
    setPlaceBusy(true);
    if (!placesServerLive || id.startsWith('local-')) {
      const nextLocal = removeLocalPlace(uid, id);
      setPlaces((prev) => mergeSavedPlaces(prev.filter((p) => !p.id.startsWith('local-') && p.id !== id), nextLocal));
      setPlaceBusy(false);
      return;
    }
    const msg = await deletePlace(id);
    if (msg) onError(msg);
    else setPlaces((prev) => prev.filter((p) => p.id !== id));
    setPlaceBusy(false);
  };

  const perSeat = selectedClass?.per_seat && kind === 'passageiro';

  // Uma leitura da hora por render: a saudação e o aviso vêm do mesmo instante.
  const tip = hourTip();
  const firstName = (user?.name ?? '').trim().split(' ')[0] || null;

  // O título é o que a pessoa diria ao motorista ao telefone; a segunda palavra é
  // o que o rodeia. Um ponto fino só vale até 700 m e um bairro até 2 km — para
  // lá disso dizemos a paragem e os metros, porque nome longe é adivinhação.
  const whereTitle = whereIAm ? (whereIAm.place ?? whereIAm.bairro ?? whereIAm.zone ?? null) : null;
  const whereDetail = !whereIAm || !whereTitle
    ? null
    : whereIAm.place
      ? (whereIAm.bairro && whereIAm.bairro !== whereIAm.place
        ? `· ${whereIAm.bairro}`
        : `· ${whereIAm.zone}`)
      : whereIAm.bairro
        ? `· a ${meters(whereIAm.bairroMetres)} · ${whereIAm.zone}`
        : `· a ${meters(whereIAm.metres)} da paragem`;

  const payRow = (
    <div className="grid grid-cols-2 gap-2">
      {([['cash', 'Dinheiro', CashIcon], ['multicaixa', 'Multicaixa', CardIcon]] as const).map(([id, label, Icon]) => (
        <button
          key={id}
          onClick={() => setPayment(id)}
          aria-pressed={payment === id}
          className={cn(
            'h-11 rounded-control border flex items-center justify-center gap-2 text-[13px] font-semibold transition-colors',
            payment === id
              ? 'border-purple-400 bg-purple-100 text-purple-700 dark:border-amber-400 dark:bg-amber-400/[0.12] dark:text-amber-200'
              : 'surface-outline text-zinc-600 dark:text-zinc-200',
          )}
        >
          <Icon className="w-4 h-4" /> {label}
        </button>
      ))}
    </div>
  );

  const ctaVerb = service === 'partilha' ? 'Pedir carro'
    : service === 'mudanca' ? 'Pedir mudança'
      : kind === 'entrega' ? 'Enviar' : 'Pedir viagem';

  // O convite leva o essencial: de onde, para onde, quantos e quanto fica a
  // cada um. Vai pelo menu do telemóvel (WhatsApp incluído) — a app não guarda
  // contactos de ninguém para fazer a divisão.
  const inviteText = quote && fromZone && toZone
    ? `Vou de ${fromZone.name} para ${toZone.name}${selectedClass ? ` num ${selectedClass.label}` : ''}. Somos ${Math.max(2, quoteSeats)} e fica ${formatKz(eachKz)} por pessoa. Se fores para o mesmo lado, vamos juntos no mesmo carro — Ulyatila.`
    : '';
  const invite = async () => {
    if (!inviteText) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Carro partilhado', text: inviteText });
        return;
      }
    } catch {
      return; // a pessoa fechou o menu — não é um erro
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteText)}`, '_blank', 'noopener');
  };

  // O preço e o botão ficam no rodapé do painel: em écrans curtos o cartão não
  // mostra tudo, e pedir viagem tem de estar sempre ao alcance do polegar.
  const submitCta = (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p id="ride-request-status" role="status" className={cn(
          'flex-1 text-label leading-relaxed',
          quoteFailed ? 'text-amber-800 dark:text-amber-200' : 'text-zinc-600 dark:text-zinc-400',
        )}>{submitHint}</p>
        {quoteFailed && (
          <button
            type="button"
            onClick={() => setQuoteAttempt((a) => a + 1)}
            className="shrink-0 min-h-11 px-2 text-label font-semibold text-purple-700 dark:text-purple-300 underline underline-offset-4 rounded-control"
          >Recalcular preço</button>
        )}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        aria-describedby="ride-request-status"
        aria-busy={busy || quoting}
        className={cn(
          'w-full min-h-14 px-3 py-3 rounded-card font-semibold tracking-tight text-control flex items-center justify-center gap-2',
          'transition-colors',
          canSubmit ? 'btn-main' : OFF,
          quoting && 'animate-sheen',
        )}
      >
        {busy || quoting
          ? <SpinnerIcon className="w-5 h-5 shrink-0 animate-spin" />
          : kind === 'passageiro' ? <RouteIcon className="w-5 h-5 shrink-0" /> : <CashIcon className="w-5 h-5 shrink-0" />}
        {busy ? 'A enviar pedido…' : quoting ? 'A calcular preço…' : quote
          ? `${ctaVerb} · ${formatKz(quote.priceKz)}`
          : ctaVerb}
      </button>
    </div>
  );

  return (
    <MapScreen
      collapsible
      open={open}
      onOpenChange={setOpen}
      peek={user ? (
        <RoutePeek
          from={peekFrom}
          to={peekTo}
          detail={peekDetail}
          priceKz={quote?.priceKz ?? null}
          onOpen={() => setOpen(true)}
        />
      ) : undefined}
      footer={user && !boardOpen ? submitCta : undefined}
      map={{ center, pins, cars, me: gps.pos, meAccuracy: gps.accuracy, route, onPick: picking ? onPick : undefined, zoom: 13.2, focusToken: focus, fitKey: `${from}|${to}|${pickup ? `${pickup.lat},${pickup.lon}` : ''}` }}
      top={user ? (picking ? (
        <FloatPill>
          <span className="flex items-center gap-2 text-[13px] font-semibold text-amber-800 dark:text-amber-300">
            <PinIcon className="w-4 h-4" /> Toque no mapa, no sítio onde vai estar
          </span>
        </FloatPill>
      ) : (
        <NearbyPill
          cars={effectiveNearbyCars}
          gps={gps.status}
          loading={!isDemo && nearby.loading}
          failed={!isDemo && nearby.failed}
          onAskGps={locate}
          onRetry={nearby.refresh}
        />
      )) : null}
      actions={<LocateFab onClick={locate} gps={gps.status} justFixed={justFixed} />}
    >
      {!user ? (
        <div className="space-y-4 py-1">
          <div className="text-center">
            <p className="eyebrow text-purple-700 dark:text-amber-400">Elara Ulyatila · Luanda</p>
            <h1 className="mt-1 font-display text-hero font-medium text-ink dark:text-white">Para onde vais?</h1>
            <p className="mt-1.5 text-body text-zinc-500 dark:text-zinc-400">
              Escolhe o destino ou o serviço. Entras na conta Elara para confirmar o pedido.
            </p>
          </div>
          {/* Barra de destino ao estilo Yango: carro 3D à esquerda e seta circular à direita */}
          <button
            type="button"
            onClick={onLogin}
            className="surface-card w-full min-h-14 rounded-card px-3 py-2.5 flex items-center gap-3 text-left transition-all hover:border-purple-300 active:scale-[0.99] dark:hover:border-amber-400/50"
          >
            <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-[11px] bg-zinc-100/90 px-1 dark:bg-white/[0.10]">
              {heroImgFailed ? (
                <ServiceArt id="carro" className="h-8 w-10" />
              ) : (
                <img
                  src="/icons-3d/carro.png"
                  alt=""
                  aria-hidden="true"
                  onError={() => setHeroImgFailed(true)}
                  className="h-8 w-auto object-contain"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-ink dark:text-white">
                Para onde vais?
              </span>
              <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                Bairro, rua, shopping ou ponto de referência
              </span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white dark:bg-amber-400 dark:text-ink">
              <ArrowRightIcon className="h-4 w-4" />
            </span>
          </button>
          <ServiceGrid value={null} onPick={onLogin} onRent={onLogin} />
          <div className="space-y-2">
            <button
              onClick={onLogin}
              className="w-full h-14 rounded-card font-semibold text-control btn-main flex items-center justify-center gap-2"
            >
              <RouteIcon className="w-5 h-5" /> Entrar na minha conta
            </button>
            {onOpenDemo && (
              <button
                type="button"
                onClick={onOpenDemo}
                className="surface-outline flex h-12 w-full items-center justify-center gap-2 rounded-card text-label font-semibold text-purple-700 dark:text-amber-300"
              >
                <DemoFlaskIcon className="h-4 w-4" /> Explorar app completa em modo demonstração
              </button>
            )}
          </div>
          <p className="text-center text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            O mesmo acesso do Elara. Não pedimos senha por mensagem.
          </p>
        </div>
      ) : (
        <div className="space-y-3 pt-0.5">
          {/* O título é a pergunta que a pessoa traz na cabeça; o serviço
              escolhido diz-lhe o resto em palavras, sem siglas. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow truncate text-zinc-500 dark:text-[#B9A8DC]">
                {greeting()}{firstName ? `, ${firstName}` : ''}
              </p>
              <h1 className="mt-1 font-display text-title font-medium leading-tight text-ink dark:text-white">
                {SERVICE_TITLE[service]}
              </h1>
            </div>
            <ClockIcon className="mt-1 h-4 w-4 shrink-0 text-purple-600 dark:text-amber-400" />
          </div>

          <p className="eyebrow text-zinc-500 dark:text-[#B9A8DC]">Serviços</p>
          <ServiceGrid
            value={service}
            onPick={(next) => { setService(next); setBoardOpen(false); }}
            onRent={onOpenRentals}
          />
          <p className="text-label leading-relaxed text-zinc-500 dark:text-zinc-400">
            {SERVICE_HINT[service]}
          </p>

          {/* Rota: a mesma nos cinco serviços. Na partilha é ela que filtra o
              quadro de carrinhas — sem destino não há o que escolher. */}
          <div className="surface-card relative overflow-hidden rounded-card">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-[20px] top-[34px] bottom-[34px] w-px border-l border-dashed border-purple-300 dark:border-amber-400/40"
            />
            <ZonePicker
              compact
              tone="from"
              label="De onde parte"
              value={from}
              displayName={pickup?.note?.trim() || undefined}
              zones={zones}
              onChange={(id) => { setFrom(id); setAutoFrom(null); setPickup(null); setLandmark(''); }}
              onExact={onExactPlace}
              report={user ? { uid: user.uid, role: 'passenger' } : null}
            />
            <div className="relative ml-[26px] h-px bg-zinc-200 dark:bg-[rgba(185,168,220,0.25)]">
              {from && to && from !== to && (
                <button
                  type="button"
                  aria-label="Inverter partida e destino"
                  onClick={() => {
                    const prevFrom = from;
                    const prevTo = to;
                    setFrom(prevTo);
                    setTo(prevFrom);
                    setAutoFrom(null);
                    setPickup(null);
                    setDestPlace(null);
                    setLandmark('');
                  }}
                  className="tap-pad absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-purple-700 shadow-hair transition-transform active:scale-95 dark:border-[rgba(185,168,220,0.3)] dark:bg-night dark:text-amber-300"
                >
                  <SwapVerticalIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <ZonePicker
              compact
              tone="to"
              label="Para onde vai"
              value={to}
              displayName={kind === 'passageiro' ? destPlace?.name : undefined}
              zones={zones}
              onChange={(id) => { setTo(id); setDestPlace(null); }}
              onExact={kind === 'passageiro' ? onExactDest : undefined}
              report={user ? { uid: user.uid, role: 'passenger' } : null}
            />
          </div>

          {/* O destino mais provável não é o que a pessoa escreve: é aquele a
              que ela já foi três vezes. Um toque põe-no no lugar, e o preço
              volta a pedir-se ao servidor como se o tivesse escolhido à mão. */}
          {!!recents.length && (
            <RecentPlaces
              items={recents}
              activeZoneId={to}
              onPick={(id) => { setTo(id); setDestPlace(null); }}
            />
          )}

          {/* O nome do lugar onde a pessoa está, com uma saída para o que está
              desactualizado. É a resposta ao botão da localização. */}
          {gps.pos && whereTitle && (
            <WhereAmI
              title={whereTitle}
              detail={whereDetail}
              accuracy={gps.accuracy}
              updatedAt={gps.updatedAt}
              viaTeam={whereIAm?.via === 'equipa'}
              justFixed={justFixed}
              onRecenter={locate}
              action={whereAction}
            />
          )}

          {autoFrom && from === autoFrom.id && !pickup && (
            <p className="text-label text-zinc-600 dark:text-zinc-400">Partida sugerida pelo GPS. Confirme o ponto de encontro.</p>
          )}

          {/* Atalhos favoritos (Casa, Trabalho, etc.): funcionam de imediato neste telemóvel e juntam-se ao servidor quando disponível. */}
          {kind === 'passageiro' && (places.length > 0 || !!toZone) && (
            <SavedPlaces
              places={places}
              targetZoneId={to}
              targetLabel={toZone?.name ?? null}
              busy={placeBusy}
              localOnly={!placesServerLive}
              onPick={pickPlace}
              onSave={({ emoji, label }) => void addPlace(emoji, label)}
              onRemove={(id) => void removePlace(id)}
            />
          )}

          {/* Sem 0004 não há campo de ponto na viagem: o referência vai para o
              chat assim que a viagem nasce, e dizemo-lo aqui, antes do toque. */}
          {!ridesOn && kind === 'passageiro' && (
            <label className="surface-card block rounded-card px-3.5 py-2.5">
              <span className="flex items-center gap-1.5 text-caption font-medium text-zinc-500 dark:text-zinc-400">
                <PinIcon className="w-3.5 h-3.5 text-purple-600 dark:text-amber-400" /> Ponto de referência (opcional)
              </span>
              <input
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                maxLength={90}
                placeholder="Ex: portão do condomínio, em frente à farmácia"
                className="mt-1.5 w-full bg-transparent text-control font-semibold text-ink dark:text-white outline-none placeholder:font-medium placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
              />
              <span className="block mt-1 text-caption text-zinc-500 dark:text-zinc-400">
                {landmark.trim()
                  ? 'Segue como primeira mensagem do chat quando a viagem for criada.'
                  : 'Ajuda o motorista a encontrá-la sem telefonemas.'}
              </span>
            </label>
          )}

          {boardOpen ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lead font-medium text-ink dark:text-white">Lugares em carrinhas</h2>
                <button
                  type="button"
                  onClick={() => setBoardOpen(false)}
                  className="min-h-11 px-2 text-label font-semibold text-purple-700 underline underline-offset-4 dark:text-amber-300"
                >Voltar</button>
              </div>
              {payRow}
              <RideBoard
                zones={zones}
                classes={classes}
                at={center}
                toZoneId={to}
                pickup={pickup}
                picking={picking}
                onAskPick={() => setPicking((p) => !p)}
                onNote={(note) => setPickup((p) => (p ? { ...p, note } : p))}
                onClearPickup={() => setPickup(null)}
                payment={payment}
                seats={seats}
                onSeats={setSeats}
                onJoined={(t, who) => onTripCreated(
                  { pin: t.pin, dropPin: t.dropPin },
                  `Lugar reservado na corrida de ${who}. Mostre o código ao motorista quando a carrinha chegar.`,
                )}
                onError={onError}
                onWantPrivate={() => { setBoardOpen(false); setService('carro'); }}
              />
            </>
          ) : (
            <>
            {/* Uma viagem fechada também tem porta: o ponto marca-se antes do
                pedido e grava-se na viagem assim que ela nasce. */}
            {ridesOn && kind === 'passageiro' && (
              <PickupField
                pickup={pickup}
                picking={picking}
                at={gps.pos ?? center}
                zoneName={fromZone?.name}
                zones={zones}
                onAskPick={() => setPicking((p) => !p)}
                onNote={(note) => setPickup((p) => (p ? { ...p, note } : p))}
                onName={usePlaceName}
                onClear={() => setPickup(null)}
              />
            )}

            {/* O que a partilha é, em duas linhas: um carro dividido entre
                pessoas que vão para o mesmo lado — não uma boleia grátis nem
                uma corrida por lugar. */}
            {service === 'partilha' && (
              <div className="surface-card rounded-card p-3">
                <p className="text-body font-semibold text-ink dark:text-white">Um carro para todos</p>
                <p className="mt-1 text-label leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Um de vocês pede o carro; os outros entram. O preço é do carro inteiro — dividem entre vocês e pagam ao motorista à chegada. A app não cobra a ninguém.
                </p>
                {ridesOn && (
                  <button
                    type="button"
                    onClick={() => setBoardOpen(true)}
                    className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-purple-300 bg-purple-50 text-label font-semibold text-purple-700 dark:border-amber-400/40 dark:bg-amber-400/[0.12] dark:text-amber-200"
                  >
                    <SeatIcon className="h-4 w-4" /> Já há carrinhas a partir — comprar um lugar
                  </button>
                )}
              </div>
            )}

            <h3 className="text-body font-semibold text-ink dark:text-white">
              {kind === 'passageiro'
                ? service === 'moto' ? 'A sua moto'
                  : service === 'partilha' ? 'O carro que vão dividir'
                    : 'Escolha o veículo'
                : 'O que vai na carga?'}
            </h3>
            {kind === 'passageiro' ? (
              <ClassPicker
                classes={service === 'moto' ? motoClasses : service === 'partilha' ? sharedClasses : passengerClasses}
                value={classId}
                onChange={setClassId}
              />
            ) : (
              <ParcelPicker
                classes={modeDelivery}
                value={parcelSize}
                onChange={setParcelSize}
                vehicles={service === 'mudanca'}
              />
            )}
            {kind === 'entrega' && selectedDelivery?.blurb && (
              <p className="text-label leading-relaxed text-zinc-600 dark:text-zinc-400">{selectedDelivery.blurb}</p>
            )}
            {service === 'mudanca' && (
              <p className="text-label leading-relaxed text-zinc-500 dark:text-zinc-400">
                Quem carrega combina-se com o motorista antes de partir. Portagens e espera fora da rota também.
              </p>
            )}

            {/* A divisão é do carro, não do lugar: o número serve para dizer a
                cada um quanto põe, e o convite leva-o escrito. */}
            {service === 'partilha' && (
              <div className="surface-card rounded-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-body font-semibold text-ink dark:text-white">
                    <UsersIcon className="h-4 w-4 text-purple-600 dark:text-amber-400" /> Quantos vão?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPartySize((p) => Math.max(2, p - 1))}
                      disabled={partySize <= 2}
                      aria-label="Menos uma pessoa"
                      className={cn(
                        'tap-pad h-9 w-9 rounded-control border border-zinc-200 bg-white text-lg font-semibold leading-none text-zinc-700 dark:border-[rgba(185,168,220,0.3)] dark:bg-white/[0.08] dark:text-white',
                        OFF_ATTR,
                      )}
                    >−</button>
                    <span className="w-6 text-center text-body font-semibold text-ink dark:text-white" aria-live="polite">{partySize}</span>
                    <button
                      type="button"
                      onClick={() => setPartySize((p) => Math.min(Math.max(2, selectedClass?.seats ?? 2), p + 1))}
                      disabled={partySize >= Math.max(2, selectedClass?.seats ?? 2)}
                      aria-label="Mais uma pessoa"
                      className={cn(
                        'tap-pad h-9 w-9 rounded-control border border-zinc-200 bg-white text-lg font-semibold leading-none text-zinc-700 dark:border-[rgba(185,168,220,0.3)] dark:bg-white/[0.08] dark:text-white',
                        OFF_ATTR,
                      )}
                    >+</button>
                  </div>
                </div>
                <p className="mt-2 border-t border-zinc-100 pt-2 text-label text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                  {quote
                    ? <><span className="font-semibold text-ink dark:text-white">{formatKz(eachKz)} por pessoa</span> · o carro leva {selectedClass?.seats ?? partySize}</>
                    : 'O preço por pessoa aparece quando a rota estiver escolhida.'}
                </p>
                <button
                  type="button"
                  onClick={invite}
                  disabled={!inviteText}
                  className={cn(
                    'mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-purple-300 bg-purple-50 text-label font-semibold text-purple-700',
                    'dark:border-amber-400/40 dark:bg-amber-400/[0.12] dark:text-amber-200',
                    OFF_ATTR,
                  )}
                >
                  <ShareIcon className="h-4 w-4" /> Convidar quem vai para o mesmo lado
                </button>
              </div>
            )}

            {perSeat && (
              <div className="surface-card rounded-card p-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-body font-semibold text-ink dark:text-white">
                  <UsersIcon className="w-4 h-4 text-purple-600 dark:text-amber-400" /> Lugares
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSeats((s) => Math.max(1, s - 1))}
                    aria-label="Menos lugares"
                    className="tap-pad w-9 h-9 rounded-control bg-white dark:bg-white/[0.08] border border-zinc-200 dark:border-[rgba(185,168,220,0.3)] font-semibold text-lg text-zinc-700 dark:text-white"
                  >−</button>
                  <span className="font-semibold text-lg w-6 text-center text-ink dark:text-white">{seats}</span>
                  <button
                    onClick={() => setSeats((s) => Math.min(selectedClass?.seats ?? 4, s + 1))}
                    aria-label="Mais lugares"
                    className="tap-pad w-9 h-9 rounded-control bg-white dark:bg-white/[0.08] border border-zinc-200 dark:border-[rgba(185,168,220,0.3)] font-semibold text-lg text-zinc-700 dark:text-white"
                  >+</button>
                </div>
              </div>
            )}

            {order && (
              <OrderNotice
                seed={order.seed}
                loading={order.loading}
                missing={order.missing}
                onUseZone={(zoneId) => setTo(zoneId)}
                onDismiss={onOrderDismiss}
              />
            )}

            {kind === 'entrega' && (
              <ParcelFields
                what={what} setWhat={setWhat}
                toName={toName} setToName={setToName}
                toPhone={toPhone} setToPhone={setToPhone}
                payBy={payBy} setPayBy={setPayBy}
                deliverySizeId={parcelSize}
                move={service === 'mudanca'}
              />
            )}

            {payRow}

            <QuoteCard
              flush
              quote={quote}
              quoting={quoting}
              note={quoteNote}
              failed={quoteFailed}
              each={service === 'partilha' && quote && eachKz > 0 ? { count: Math.max(2, quoteSeats), amountKz: eachKz } : null}
              onRetry={() => setQuoteAttempt((a) => a + 1)}
            />

            {tip && (
              <p className="text-caption leading-relaxed text-zinc-500 dark:text-zinc-400">{tip}</p>
            )}
            </>
          )}
        </div>
      )}
    </MapScreen>
  );
}
