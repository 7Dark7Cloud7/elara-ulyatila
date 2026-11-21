import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import {
  CloseIcon, DemoFlaskIcon, PhoneIcon, RefreshIcon, ShareIcon, SosShieldIcon, UserPlusIcon,
} from './components/ElaraIcons';
import { supabase } from './lib/supabase';
import { sessionUserFromAuth } from './lib/auth';
import { EMERGENCY_NUMBER, STATE_LABEL, isTripActive, sosMessage } from './lib/trips';
import { fetchElaraOrder, seedFromOrder, type ElaraOrder } from './lib/orders';
import {
  buildRepeatSeed, loadTrustedContacts, trustedShareMessage,
  type RepeatTripSeed, type TrustedContact,
} from './lib/localExtras';
import { DemoContext } from './lib/demoContext';
import {
  DEMO_CLASSES, DEMO_DELIVERY_CLASSES, DEMO_USER, DEMO_ZONES,
  loadDemoState, resetDemoState, saveDemoState, type DemoState,
} from './lib/demoEngine';
import { setTheme, useTheme } from './lib/theme';
import { ensurePlaces } from './lib/places';
import { waLink, cn, APOIO_PHONE } from './lib/utils';
import type { DeliveryClass, Driver, SessionUser, Trip, TripState, VehicleClass, Zone } from './types';
import { Header } from './components/Header';
import { BottomNav, type TabId } from './components/BottomNav';
import { AuthSheet } from './components/AuthSheet';
import { Sheet } from './components/Sheet';
import { TripReceipt } from './components/TripReceipt';
import { ReportSheet } from './components/ReportSheet';
import { NetBanner } from './components/NetBanner';
import { Splash } from './components/Splash';
import { RideView } from './views/RideView';
import { TripsView } from './views/TripsView';
import { WalletView } from './views/WalletView';
import { ProfileView } from './views/ProfileView';
import { ShareView } from './views/ShareView';

/* Quem abre a app é o passageiro, e o primeiro download dele não devia levar
   o painel do motorista, a consola da equipa nem as folhas que se abrem de um
   toque no perfil. São ecrãs próprios, com os componentes todos atrás deles;
   chegam quando se abrem e ficam no aparelho. O React quer um `default`, e
   aqui são nomes — por isso o `{ default: … }`. */
const DriverView = lazy(() => import('./views/DriverView').then((m) => ({ default: m.DriverView })));
const TeamConsole = lazy(() => import('./components/TeamConsole').then((m) => ({ default: m.TeamConsole })));
const DemoStudio = lazy(() => import('./components/DemoStudio').then((m) => ({ default: m.DemoStudio })));
const RentalsSheet = lazy(() => import('./components/RentalsSheet').then((m) => ({ default: m.RentalsSheet })));
const DataSheet = lazy(() => import('./components/DataSheet').then((m) => ({ default: m.DataSheet })));
const HelpSheet = lazy(() => import('./components/HelpSheet').then((m) => ({ default: m.HelpSheet })));

/**
 * Um painel que já abriu uma vez fica montado, mesmo depois de fechado: o
 * ficheiro pediu-se ao primeiro toque, e o que a pessoa escolheu dentro dele
 * (a fila que estava a ver, o carro que tinha aberto) não se perde ao fechar.
 * É assim desde sempre; só o momento de montar é que mudou.
 */
function useEver(open: boolean): boolean {
  const [ever, setEver] = useState(open);
  useEffect(() => { if (open) setEver(true); }, [open]);
  return ever;
}

/**
 * O lugar marcado de um painel que ainda está a chegar. São cartões com a
 * altura dos que vêm, e não um spinner solto: o ecrã não salta quando o
 * ficheiro entra, e em Ligação fraca a pessoa vê que há ali algo desenhado.
 */
function PaneLoading({ label }: { label: string }) {
  return (
    <div className="animate-enter space-y-3" role="status">
      <p className="text-label text-zinc-500 dark:text-zinc-400">{label}</p>
      <div className="h-24 rounded-card bg-zinc-100 dark:bg-white/[0.06]" />
      <div className="h-32 rounded-card bg-zinc-100 dark:bg-white/[0.06]" />
      <div className="h-24 rounded-card bg-zinc-100 dark:bg-white/[0.06]" />
    </div>
  );
}

const DEMO_KEY = 'trajectoria_demo';

const readDemo = (): boolean => {
  try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; }
};

// Derivada das etiquetas: um estado novo não pode ficar invisível aqui e vivo na app.
const ACTIVE_STATES = (Object.keys(STATE_LABEL) as TripState[]).filter((s) => isTripActive({ state: s }));

/** A ligação que a app gera quando se partilha uma viagem. */
const shareTokenFromHash = (): string | null => {
  const m = /^#\/viagem\/([a-z0-9]{16,64})$/i.exec(window.location.hash);
  return m ? m[1].toLowerCase() : null;
};

/**
 * A ligação que o Elara Marketplace gera para trazer uma compra para a entrega.
 * Só leva o código da encomenda: a morada e o telefone de quem recebe são lidos
 * pela sessão de quem a comprou, nunca pelo endereço da barra.
 */
const orderCodeFromHash = (): string | null => {
  const m = /^#\/encomenda\/([a-z0-9_-]{6,48})$/i.exec(window.location.hash);
  if (!m) return null;
  // Os códigos do Elara são maiúsculos; outros formatos (pedidos antigos com
  // `ord_...`) ficam exactamente como vieram, senão a procura não os encontra.
  return /^elr-/i.test(m[1]) ? m[1].toUpperCase() : m[1];
};

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [rentalsOpen, setRentalsOpen] = useState(false);
  // «Os meus dados»: exportação e pedido de eliminação, na mesma folha.
  const [dataOpen, setDataOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const dark = useTheme();
  const [tab, setTab] = useState<TabId>('corrida');
  // A assinatura da casa, uma vez por sessão: um F5 a meio não a repete.
  const [splash, setSplash] = useState(() => {
    try { return !sessionStorage.getItem('traj_splash_seen'); } catch { return false; }
  });
  const endSplash = useCallback(() => {
    try { sessionStorage.setItem('traj_splash_seen', '1'); } catch { /* modo privado */ }
    setSplash(false);
  }, []);
  // Modo demonstração integrado: corre a app inteira com conta, carro e carteira locais.
  const [demo, setDemo] = useState(readDemo);
  const [demoState, setDemoStateRaw] = useState<DemoState>(() => loadDemoState());
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(shareTokenFromHash);

  // Encomenda trazida do Marketplace. O `authKnown` existe porque a sessão só
  // chega tarde: sem ele, quem entra por ligação antes de o `getSession`
  // responder seria mandado para um login que já tem.
  const [authKnown, setAuthKnown] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<string | null>(orderCodeFromHash);
  const [orderRow, setOrderRow] = useState<ElaraOrder | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMissing, setOrderMissing] = useState(false);
  const fetchedOrder = useRef<string | null>(null);

  const [zones, setZones] = useState<Zone[]>([]);
  const [classes, setClasses] = useState<VehicleClass[]>([]);
  const [deliveryClasses, setDeliveryClasses] = useState<DeliveryClass[]>([]);

  const [myTrips, setMyTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [freshPins, setFreshPins] = useState<{ pin: string; dropPin?: string | null } | null>(null);
  // O recibo abre-se no momento em que a viagem fecha, e sempre que se toca
  // numa viagem do histórico. É ali que se avalia, e não uma semana depois.
  const [receiptTrip, setReceiptTrip] = useState<Trip | null>(null);
  const [reportTrip, setReportTrip] = useState<Trip | null>(null);
  const [repeatSeed, setRepeatSeed] = useState<RepeatTripSeed | null>(null);
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>(() => loadTrustedContacts());
  const lastActiveId = useRef<string | null>(null);

  const [driver, setDriver] = useState<Driver | null>(null);
  const [driverLoading, setDriverLoading] = useState(true);

  const notify = useCallback((text: string, tone: 'ok' | 'err' = 'err') => {
    setToast({ text, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  // Zonas e tarifas vêm da base de dados — é o servidor que manda nos preços.
  // Só depois de entrar: são tabelas de leitura autenticada, e um visitante
  // não precisa delas (vê o convite para entrar), pelo que pedirmos cedo
  // seria só um 401 na consola.
  useEffect(() => {
    if (!user) return;
    if (zones.length || classes.length) return;
    (async () => {
      const [z, c, d] = await Promise.all([
        supabase.from('tr_zone').select('id, name, city, province, lat, lon, kind').order('city').order('name'),
        supabase.from('tr_vehicle_class').select('*').order('sort'),
        supabase.from('tr_delivery_class').select('*').order('base_kz'),
      ]);
      setZones((z.data as Zone[]) ?? []);
      setClasses((c.data as VehicleClass[]) ?? []);
      setDeliveryClasses((d.data as DeliveryClass[]) ?? []);
    })();
  }, [user]);

  // O índice de nomes é o maior ficheiro da app, por isso viaja atrás do
  // primeiro ecrã: a tela desenha-se primeiro e a busca começa logo a seguir,
  // para que os nomes estejam no aparelho antes de a pessoa abrir a lista.
  useEffect(() => { void ensurePlaces(); }, []);

  // Sessão: a mesma conta do Elara.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ? await sessionUserFromAuth(session.user) : null);
      setAuthKnown(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ? await sessionUserFromAuth(session.user) : null);
      setAuthKnown(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Colar a ligação noutra janela do mesmo separador não recarrega a app: a
  // página pública tem de aparecer também quando só o endereço muda.
  useEffect(() => {
    const onHash = () => {
      setShareToken(shareTokenFromHash());
      const code = orderCodeFromHash();
      if (code) setPendingOrder(code);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // A encomenda só pode ser lida pela conta que a fez — é o Row Level Security
  // do Marketplace que o garante, e é por isso que a ligação não carrega nada
  // dela própria. A morada adivinha a zona, mas quem a escolhe é a pessoa.
  useEffect(() => {
    if (!pendingOrder) return;
    const code = pendingOrder;
    // O endereço limpa-se logo: um F5 a meio não volta a escrever por cima do
    // que a pessoa entretanto mudou no formulário.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!authKnown) return;
    // Sem sessão fica à espera: quando a pessoa entrar, este mesmo efeito lê a
    // encomenda. Perder o código aqui era mandar alguém voltar ao Elara para
    // carregar no botão outra vez.
    if (!user) {
      setAuthOpen(true);
      notify('Para ler a encomenda, entra primeiro com a conta do Elara.', 'err');
      return;
    }
    if (fetchedOrder.current === code) { setPendingOrder(null); return; }
    fetchedOrder.current = code;
    setPendingOrder(null);
    setTab('corrida');
    setOrderLoading(true);
    setOrderMissing(false);
    setOrderRow(null);
    fetchElaraOrder(code).then((o) => {
      setOrderLoading(false);
      if (!o) { setOrderMissing(true); return; }
      setOrderRow(o);
    });
  }, [pendingOrder, authKnown, user, notify]);

  const loadTrips = useCallback(async () => {
    if (!user) { setMyTrips([]); setTripsLoading(false); return; }
    const { data } = await supabase
      .from('tr_trip')
      .select('*')
      .eq('passenger_id', user.uid)
      .order('created_at', { ascending: false })
      .limit(50);
    setMyTrips((data as Trip[]) ?? []);
    setTripsLoading(false);
  }, [user]);

  const loadDriver = useCallback(async () => {
    if (!user) { setDriver(null); setDriverLoading(false); return; }
    const { data } = await supabase
      .from('tr_driver')
      .select('*')
      .eq('account_id', user.uid)
      .maybeSingle();
    setDriver((data as Driver) ?? null);
    setDriverLoading(false);
  }, [user]);

  useEffect(() => {
    setTripsLoading(true);
    setDriverLoading(true);
    setFreshPins(null);
    setReceiptTrip(null);
    setReportTrip(null);
    loadTrips();
    loadDriver();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tempo real do passageiro: qualquer mudança numa das suas viagens chega sozinha.
  // O intervalo por cima é o seguro: as redes móveis partem o canal em silêncio,
  // e ninguém pode perder o fecho de uma corrida por isso.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tr-my-${user.uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tr_trip', filter: `passenger_id=eq.${user.uid}` },
        () => { loadTrips(); },
      )
      .subscribe();
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadTrips();
    }, 25000);
    return () => { window.clearInterval(poll); supabase.removeChannel(channel); };
  }, [user, loadTrips]);

  const setDemoState = useCallback((updater: (prev: DemoState) => DemoState) => {
    setDemoStateRaw((prev) => {
      const next = updater(prev);
      saveDemoState(next);
      return next;
    });
  }, []);

  const effectiveUser = demo ? DEMO_USER : user;
  const effectiveZones = demo ? DEMO_ZONES : zones;
  const effectiveClasses = demo ? DEMO_CLASSES : classes;
  const effectiveDeliveryClasses = demo ? DEMO_DELIVERY_CLASSES : deliveryClasses;
  const effectiveTrips = demo ? demoState.trips : myTrips;
  const effectiveTripsLoading = demo ? false : tripsLoading;
  const effectiveDriver = demo ? demoState.driver : driver;
  const effectiveDriverLoading = demo ? false : driverLoading;

  const activeTrip = effectiveTrips.find((t) => ACTIVE_STATES.includes(t.state)) ?? null;

  // A zona adivinhada só se resolve quando as zonas chegam, o que acontece
  // depois do login. Por isso é um cálculo em cima da linha, não um instantâneo
  // do momento em que a encomenda foi lida.
  const orderSeed = useMemo(
    () => (orderRow ? seedFromOrder(orderRow, effectiveZones) : null),
    [orderRow, effectiveZones],
  );
  const order = orderRow || orderLoading || orderMissing
    ? { seed: orderSeed, loading: orderLoading && !orderRow, missing: orderMissing }
    : null;
  const dismissOrder = () => { setOrderRow(null); setOrderMissing(false); setOrderLoading(false); };

  // A viagem acabou de sair da lista dos activos: é agora, com o motorista ainda
  // à porta, que a pessoa dá as estrelas.
  useEffect(() => {
    const prev = lastActiveId.current;
    lastActiveId.current = activeTrip?.id ?? null;
    if (!prev || activeTrip) return;
    const closed = effectiveTrips.find((t) => t.id === prev);
    if (closed && (closed.state === 'ended' || closed.state === 'rated' || closed.state === 'cancelled')) {
      setReceiptTrip(closed);
    }
  }, [activeTrip, effectiveTrips]);

  const handleTripCreated = (pins: { pin: string; dropPin?: string | null }, message?: string) => {
    setFreshPins(pins);
    if (!demo) loadTrips();
    notify(message ?? 'Pedido criado — está na praça à espera de motorista.', 'ok');
  };

  // Liga o modo demonstração directamente na app real — sem abrir janela separada.
  const toggleDemo = useCallback((on: boolean) => {
    setDemo(on);
    try { localStorage.setItem(DEMO_KEY, on ? '1' : '0'); } catch { /* modo privado */ }
    setReceiptTrip(null);
    setReportTrip(null);
    setFreshPins(null);
    if (on) {
      setDemoStateRaw(loadDemoState());
      setAuthOpen(false);
    } else {
      setTab('corrida');
    }
    notify(
      on
        ? 'Modo demonstração activo — toda a app está aberta com conta, viatura e carteira de teste.'
        : 'Modo demonstração desligado.',
      'ok',
    );
  }, [notify]);

  const resetDemo = useCallback(() => {
    const fresh = resetDemoState();
    setDemoStateRaw(fresh);
    setReceiptTrip(null);
    setReportTrip(null);
    setFreshPins(null);
    notify('Dados de demonstração repostos.', 'ok');
  }, [notify]);

  const logout = async () => {
    if (demo) {
      toggleDemo(false);
      return;
    }
    await supabase.auth.signOut();
    setTab('corrida');
    notify('Sessão terminada.', 'ok');
  };

  const handleRepeatTrip = useCallback((trip: Trip) => {
    setRepeatSeed(buildRepeatSeed(trip, effectiveClasses));
    setReceiptTrip(null);
    setTab('corrida');
    notify('Rota carregada — confirme os detalhes e o preço.', 'ok');
  }, [effectiveClasses, notify]);

  const demoContextValue = useMemo(
    () => ({
      isDemo: demo,
      demoState,
      setDemoState,
      resetDemo,
      exitDemo: () => toggleDemo(false),
    }),
    [demo, demoState, setDemoState, resetDemo, toggleDemo],
  );

  const sosText = sosMessage(activeTrip?.code ?? '—');
  const activeFromName = activeTrip
    ? effectiveZones.find((z) => z.id === activeTrip.from_zone_id)?.name ?? activeTrip.from_zone_id
    : null;
  const activeToName = activeTrip
    ? effectiveZones.find((z) => z.id === activeTrip.to_zone_id)?.name ?? activeTrip.to_zone_id
    : null;

  const everRentals = useEver(rentalsOpen);
  const everHelp = useEver(helpOpen);
  const everData = useEver(dataOpen);
  const everTeam = useEver(teamOpen);
  const everDemo = useEver(demoOpen);

  // O mapa ocupa o ecrã inteiro entre a barra de topo e a navegação; os outros
  // ecrãs (candidatura, histórico, carteira) ficam no layout de coluna do Elara.
  const atWork = tab === 'motorista' && !effectiveDriverLoading && effectiveDriver?.status === 'approved';
  const immersive = tab === 'corrida' || atWork;

  // Página pública: abre-se sem sessão e sem navegação de conta.
  if (shareToken) {
    return (
      <ShareView
        token={shareToken}
        onExit={() => {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
          setShareToken(null);
        }}
      />
    );
  }

  return (
    <DemoContext.Provider value={demoContextValue}>
    <div className={cn(
      'min-h-screen bg-cream dark:bg-night',
      immersive && 'app-map-shell',
      // No PC a navegação vive na coluna da esquerda; tudo o resto desloca-se
      // para a direita dela em vez de ficar centrado por cima do nada.
      'lg:pl-[var(--rail)]',
    )}
    >
      <Header
        dark={dark}
        onToggleTheme={() => setTheme(!dark)}
        userName={effectiveUser?.name ?? null}
        onAccount={() => (effectiveUser ? setTab('perfil') : setAuthOpen(true))}
      />

      <NetBanner />

      {/* Faixa discreta e honesta quando o modo demonstração está ligado na app real. */}
      {demo && (
        <div className="border-b border-purple-200/80 bg-purple-50/95 px-4 py-2 dark:border-amber-400/25 dark:bg-[#23143c]">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-2 lg:max-w-none lg:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <DemoFlaskIcon className="h-4 w-4 shrink-0 text-purple-600 dark:text-amber-400" />
              <span className="truncate text-[12px] font-semibold text-purple-900 dark:text-amber-200">
                Modo demonstração · conta, viatura e carteira de teste
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={resetDemo}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-purple-300/80 bg-white px-2 text-[11px] font-semibold text-purple-700 dark:border-amber-400/35 dark:bg-white/[0.08] dark:text-amber-200"
              >
                <RefreshIcon className="h-3 w-3" /> Reiniciar
              </button>
              <button
                type="button"
                onClick={() => toggleDemo(false)}
                className="inline-flex h-7 items-center gap-1 rounded-lg bg-purple-600 px-2 text-[11px] font-semibold text-white dark:bg-amber-400 dark:text-ink"
              >
                <CloseIcon className="h-3 w-3" /> Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A tela do mapa é o contrário de uma coluna de leitura: ocupa a largura
          toda, porque é ela que dá ao painel de 400 px um mapa ao lado. Uma
          coluna centrada de 512 px deixaria 100 px de mapa e muita areia. */}
      <main
        className={cn(
          'mx-auto',
          immersive
            ? 'max-w-none'
            : 'max-w-lg px-4 pt-4 pb-32 lg:max-w-2xl lg:px-8 lg:pb-12',
        )}
      >
        {tab === 'corrida' && (
          <RideView
            user={effectiveUser}
            zones={effectiveZones}
            classes={effectiveClasses}
            deliveryClasses={effectiveDeliveryClasses}
            activeTrip={activeTrip}
            trips={effectiveTrips}
            freshPins={freshPins}
            onLogin={() => setAuthOpen(true)}
            onOpenDemo={() => toggleDemo(true)}
            onOpenRentals={() => setRentalsOpen(true)}
            onTripCreated={handleTripCreated}
            onRefreshTrips={() => { if (!demo) loadTrips(); }}
            onError={(m) => notify(m)}
            onSos={() => setSosOpen(true)}
            order={order}
            onOrderDismiss={dismissOrder}
            repeatSeed={repeatSeed}
            onRepeatConsumed={() => setRepeatSeed(null)}
          />
        )}
        {tab === 'viagens' && (
          <TripsView
            user={effectiveUser}
            trips={effectiveTrips}
            zones={effectiveZones}
            classes={effectiveClasses}
            loading={effectiveTripsLoading}
            onOpenTrip={(t) => {
              if (ACTIVE_STATES.includes(t.state)) { setTab('corrida'); return; }
              setReceiptTrip(t);
            }}
            onRepeatTrip={handleRepeatTrip}
            onLogin={() => setAuthOpen(true)}
            onError={(m) => notify(m, 'ok')}
          />
        )}
        {tab === 'motorista' && (
          <Suspense fallback={<PaneLoading label="A abrir o painel do motorista…" />}>
            <DriverView
              user={effectiveUser}
              zones={effectiveZones}
              classes={effectiveClasses}
              driver={effectiveDriver}
              driverLoading={effectiveDriverLoading}
              onDriverChanged={() => { if (!demo) loadDriver(); }}
              onLogin={() => setAuthOpen(true)}
              onError={(m) => notify(m)}
            />
          </Suspense>
        )}
        {tab === 'carteira' && (
          <WalletView
            user={effectiveUser}
            onLogin={() => setAuthOpen(true)}
            onError={(m) => notify(m)}
          />
        )}
        {tab === 'perfil' && (
          <ProfileView
            user={effectiveUser}
            driver={effectiveDriver}
            driverLoading={effectiveDriverLoading}
            dark={dark}
            onToggleTheme={() => setTheme(!dark)}
            onLogin={() => setAuthOpen(true)}
            onDriver={() => setTab('motorista')}
            onSos={() => setSosOpen(true)}
            onHelp={() => setHelpOpen(true)}
            onData={() => setDataOpen(true)}
            onTeam={() => setTeamOpen(true)}
            onLogout={logout}
            onError={(m, tone) => notify(m, tone)}
            demo={demo}
            onDemo={toggleDemo}
            onResetDemo={resetDemo}
            onTrustedContactsChanged={setTrustedContacts}
            onImportOrder={(code) => setPendingOrder(code)}
          />
        )}
      </main>

      <BottomNav tab={tab} onTab={setTab} dark={dark} />

      {/* SOS: só o número que existe de verdade — sem prometer centros que não há. */}
      <Sheet open={sosOpen} title="SOS — Emergência" onClose={() => setSosOpen(false)}>
        <div className="space-y-3">
          <div className="rounded-card bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-4">
            <p className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300">
              <SosShieldIcon className="w-5 h-5" /> Precisa de ajuda agora?
            </p>
            <p className="text-label text-red-800/90 dark:text-red-200/90 mt-1.5 leading-relaxed">
              A ligação sai da app para o número nacional de emergência. Se estiver numa viagem, o código da viagem vai na mensagem — nunca o PIN.
            </p>
            <a
              href={`tel:${EMERGENCY_NUMBER}`}
              className="mt-4 w-full h-14 rounded-control font-semibold text-white bg-red-600 active:bg-red-700 shadow-card flex items-center justify-center gap-2"
            >
              <PhoneIcon className="w-5 h-5" /> Ligar {EMERGENCY_NUMBER}
            </a>
            <a
              href={waLink(APOIO_PHONE, sosText)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 w-full h-12 rounded-control font-semibold border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 flex items-center justify-center gap-2"
            >
              Avisar o suporte Elara
            </a>
            <p className="text-caption text-red-700/80 dark:text-red-300/80 mt-3">
              Emergência {EMERGENCY_NUMBER} · O suporte responde em horário de trabalho — numa emergência real, ligue {EMERGENCY_NUMBER}.
            </p>
          </div>

          {/* Contactos de confiança guardados neste telemóvel (mensagem sem PIN) */}
          <div className="surface-card rounded-card p-4">
            <p className="text-body font-semibold text-ink dark:text-white">
              Contactos de confiança
            </p>
            {trustedContacts.length > 0 ? (
              <div className="mt-2.5 space-y-2">
                {trustedContacts.map((tc) => (
                  <a
                    key={tc.id}
                    href={waLink(
                      tc.phone,
                      trustedShareMessage({
                        contactName: tc.name,
                        trip: activeTrip,
                        fromName: activeFromName,
                        toName: activeToName,
                        emergency: true,
                      }),
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="surface-outline flex min-h-11 items-center justify-between gap-2 rounded-control px-3 py-2 text-label font-semibold text-purple-700 dark:text-amber-300"
                  >
                    <span className="truncate">
                      Avisar {tc.name} <span className="font-normal text-zinc-500 dark:text-zinc-400">· {tc.relation}</span>
                    </span>
                    <ShareIcon className="h-4 w-4 shrink-0" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="mt-2 space-y-2.5">
                <p className="text-label text-zinc-500 dark:text-zinc-400">
                  Ainda não guardou contactos de família ou amigos neste telemóvel.
                </p>
                <button
                  type="button"
                  onClick={() => { setSosOpen(false); setTab('perfil'); }}
                  className="surface-outline flex h-11 w-full items-center justify-center gap-2 rounded-control text-label font-semibold text-purple-700 dark:text-amber-300"
                >
                  <UserPlusIcon className="h-4 w-4" /> Adicionar contacto no Perfil
                </button>
              </div>
            )}
          </div>
        </div>
      </Sheet>

      <AuthSheet
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onDone={() => setAuthOpen(false)}
        onError={(m) => notify(m, 'ok')}
        onOpenDemo={() => toggleDemo(true)}
      />

      {/* Cada folha só se monta ao primeiro toque: é isso que faz o ficheiro
          dela pedir-se naquele toque e não no arranque. */}
      {everRentals && (
        <Suspense fallback={null}>
          <RentalsSheet
            open={rentalsOpen}
            onClose={() => setRentalsOpen(false)}
            user={effectiveUser}
            zones={effectiveZones}
            classes={effectiveClasses}
            driver={effectiveDriver}
            onLogin={() => setAuthOpen(true)}
            onOpenDemo={() => toggleDemo(true)}
            onError={(m) => notify(m)}
          />
        </Suspense>
      )}

      {effectiveUser && receiptTrip && receiptTrip.passenger_id === effectiveUser.uid && (
        <Sheet open title="Fecho da viagem" onClose={() => setReceiptTrip(null)}>
          <TripReceipt
            trip={receiptTrip}
            zones={effectiveZones}
            onRated={() => { if (!demo) loadTrips(); }}
            onRepeat={() => handleRepeatTrip(receiptTrip)}
            onReport={() => {
              setReportTrip(receiptTrip);
              setReceiptTrip(null);
            }}
            onError={(m, tone) => notify(m, tone)}
          />
        </Sheet>
      )}

      {effectiveUser && reportTrip && reportTrip.passenger_id === effectiveUser.uid && (
        <ReportSheet
          key={`${effectiveUser.uid}:${reportTrip.id}`}
          trip={reportTrip}
          uid={effectiveUser.uid}
          role="passenger"
          onClose={() => setReportTrip(null)}
          onError={notify}
        />
      )}

      {/* Ajuda e segurança: texto fixo, sem leitura ao servidor. */}
      {everHelp && (
        <Suspense fallback={null}>
          <HelpSheet
            open={helpOpen}
            onClose={() => setHelpOpen(false)}
            isDriver={!!effectiveDriver}
            onOpenData={() => { setHelpOpen(false); setDataOpen(true); }}
          />
        </Suspense>
      )}

      {/* Os dados da conta: só se lê o que o RLS já mostra, e o pedido de
          eliminação vai para a fila de reportes que a equipa lê. */}
      {effectiveUser && everData && (
        <Suspense fallback={null}>
          <DataSheet
            open={dataOpen}
            onClose={() => setDataOpen(false)}
            user={effectiveUser}
            isDriver={!!effectiveDriver}
            onError={(m, tone) => notify(m, tone)}
          />
        </Suspense>
      )}

      {/* Só a equipa abre a consola; a conta comum nem sabe que ela existe. */}
      {effectiveUser?.isAdmin && everTeam && (
        <Suspense fallback={null}>
          <TeamConsole
            open={teamOpen}
            onClose={() => setTeamOpen(false)}
            zones={effectiveZones}
            classes={effectiveClasses}
            onError={(m) => notify(m)}
          />
        </Suspense>
      )}

      {/* «Saia da demonstração» fica sempre à mão: quem entra por engano não
          fica preso dentro de um ecrã que finge viagens. */}
      {everDemo && (
        <Suspense fallback={null}>
          <DemoStudio
            open={demoOpen}
            zones={effectiveZones}
            classes={effectiveClasses}
            onClose={() => setDemoOpen(false)}
            onExit={() => { toggleDemo(false); setDemoOpen(false); }}
          />
        </Suspense>
      )}

      {splash && <Splash onDone={endSplash} />}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={cn(
            // O toast centra-se na área de trabalho, não no browser inteiro:
            // com a coluna de navegação à esquerda, o meio do ecrã fica 124 px
            // antes do meio do que é nosso.
            'animate-toast fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] lg:left-[calc(50%+var(--rail)/2)]',
            'rounded-2xl px-4 py-3 text-sm font-bold shadow-card backdrop-blur',
            toast.tone === 'ok'
              ? 'bg-purple-600/95 text-white dark:bg-amber-400/95 dark:text-ink'
              : 'bg-zinc-900/95 text-white dark:bg-zinc-100/95 dark:text-ink',
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
    </DemoContext.Provider>
  );
}
