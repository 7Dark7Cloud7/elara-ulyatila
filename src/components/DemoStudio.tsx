import { useEffect, useState } from 'react';
import {
  ArrowRight, Banknote, CalendarDays, Check, CircleDot, CreditCard, Flag,
  KeyRound, Loader2, MessageSquare, Moon, Send, Share2, Sparkles, Star, Users, X,
} from 'lucide-react';
import type { Payment, VehicleClass, Zone } from '../types';
import { haversineKm } from '../lib/map';
import { COMPLIMENTS, driveMinutes } from '../lib/trips';
import { changeOf, formatKz, suggestNote } from '../lib/money';
import {
  DEMO_QUICK_REPLIES,
  DEMO_RENTALS,
  demoDriverReply,
  demoStepProgress,
  verifyDemoPin,
  type DemoReplyId,
} from '../lib/localExtras';
import { VehicleArt, vehicleKindFor } from './VehicleArt';
import { ParcelSizeArt } from './ParcelSizeArt';
import { ServiceArt, type ServiceArtId } from './ServiceArt';
import { cn, OFF, OFF_ATTR, waLink } from '../lib/utils';

/**
 * O simulador interactivo: percorre os seis serviços da Elara Ulyatila —
 * Viagem, Moto, Partilhar, Entrega, Mudança e Aluguer — com preço, pista
 * animada, chat bidireccional, confirmação de PIN de 4 dígitos, troco e
 * avaliação, sem servidor e sem dinheiro. Tudo leva a marca DEMO.
 */

interface DemoStudioProps {
  open: boolean;
  zones: Zone[];
  classes: VehicleClass[];
  onClose: () => void;
  onExit: () => void;
}

const FALLBACK_ZONES: Zone[] = [
  { id: 'd-praca', name: 'Praça da Independência', city: 'Luanda', province: 'Luanda', lat: -8.8121, lon: 13.2350, kind: 'paragem' },
  { id: 'd-talatona', name: 'Talatona', city: 'Luanda', province: 'Luanda', lat: -8.9243, lon: 13.1842, kind: 'bairro' },
  { id: 'd-eldorado', name: 'Nova Vida', city: 'Luanda', province: 'Luanda', lat: -8.9856, lon: 13.2201, kind: 'bairro' },
  { id: 'd-ai', name: 'Aeroporto 4 de Fevereiro', city: 'Luanda', province: 'Luanda', lat: -8.8583, lon: 13.2312, kind: 'aeroporto' },
  { id: 'd-cacuaco', name: 'Cacuaco', city: 'Luanda', province: 'Luanda', lat: -8.7779, lon: 13.3666, kind: 'zona' },
];

const FALLBACK_CLASSES: VehicleClass[] = [
  { id: 'economico', label: 'Económico', seats: 4, base_kz: 300, per_km_kz: 450, min_kz: 900, per_seat: false, blurb: 'Carro do dia-a-dia com AC.', icon: 'Car', sort: 1 },
  { id: 'conforto', label: 'Conforto', seats: 4, base_kz: 500, per_km_kz: 650, min_kz: 1500, per_seat: false, blurb: 'Sedan executivo espaçoso.', icon: 'Armchair', sort: 2 },
  { id: 'xl', label: 'SUV · 7 lugares', seats: 7, base_kz: 700, per_km_kz: 800, min_kz: 2200, per_seat: false, blurb: 'Para família e malas grandes.', icon: 'Users', sort: 3 },
  { id: 'moto', label: 'Moto', seats: 1, base_kz: 200, per_km_kz: 300, min_kz: 600, per_seat: false, blurb: 'Rápida no trânsito de Luanda.', icon: 'Bike', sort: 4 },
  { id: 'hiace', label: 'Hiace', seats: 14, base_kz: 500, per_km_kz: 700, min_kz: 1500, per_seat: true, blurb: 'Grupo grande ou partilha.', icon: 'Van', sort: 5 },
  { id: 'canter', label: 'Canter', seats: 2, base_kz: 2000, per_km_kz: 1100, min_kz: 5000, per_seat: false, blurb: 'Mudança de casa ou escritório.', icon: 'Truck', sort: 6, lane: 'carga' },
];

type Kind = ServiceArtId;

const KIND_LABEL: Record<Kind, string> = {
  carro: 'Viagem',
  moto: 'Moto',
  partilha: 'Partilhar',
  entrega: 'Entrega',
  mudanca: 'Mudança',
  alugar: 'Alugar',
};

const CLASS_FOR: Record<Exclude<Kind, 'alugar'>, string[]> = {
  carro: ['economico', 'carro', 'conforto', 'xl', 'suv'],
  moto: ['moto'],
  partilha: ['economico', 'conforto', 'xl', 'hiace', 'carro'],
  entrega: ['moto', 'economico', 'carro'],
  mudanca: ['canter', 'picape', 'camiao', 'carga'],
};

const STEPS = [
  { label: 'À procura de motorista', hint: 'O pedido está na praça. Assim que um motorista aceitar, aparece aqui.' },
  { label: 'Motorista a caminho', hint: 'João Manuel aceitou. Guarde o código — ele pergunta-o quando chegar.' },
  { label: 'Quase a chegar', hint: 'O carro está a 300 m do ponto de embarque.' },
  { label: 'À espera do código', hint: 'O motorista está no ponto. Escreva ou confirme o PIN de 4 dígitos.' },
  { label: 'Em viagem', hint: 'A caminho do destino. A rota segue a zona que escolheu.' },
  { label: 'Terminada', hint: 'Chegou ao destino. O recibo de ensaio fica pronto para avaliação.' },
];

const DRIVER = {
  name: 'João Manuel',
  rating: 4.9,
  trips: 1284,
  plate: 'LD-24-71-AA',
  car: 'Toyota Corolla',
  pin: '4821',
};

interface DemoMsg {
  from: 'driver' | 'you';
  text: string;
}

const AUTO_MS = [2400, 3200, 3000, 0, 10000, 0];

/** 840 min não se lê; 14 h lê-se. */
const span = (min: number) => (min >= 90 ? `${Math.round(min / 60)} h` : `${min} min`);

export function DemoStudio({ open, zones, classes, onClose, onExit }: DemoStudioProps) {
  const zs = zones.length >= 2 ? zones : FALLBACK_ZONES;
  const cs = classes.length ? classes : FALLBACK_CLASSES;

  const [kind, setKind] = useState<Kind>('carro');
  const [pickedClassId, setPickedClassId] = useState<string | null>(null);
  const [from, setFrom] = useState<string>(zs[0].id);
  const [to, setTo] = useState<string>(zs[1].id);
  const [party, setParty] = useState(2);
  const [payment, setPayment] = useState<Payment>('cash');
  const [nightPreview, setNightPreview] = useState(false);

  // Aluguer (modo ensaio)
  const [rentalId, setRentalId] = useState(DEMO_RENTALS[0].id);
  const [rentalDays, setRentalDays] = useState(2);
  const [rentalWithDriver, setRentalWithDriver] = useState(true);
  const [rentalBooked, setRentalBooked] = useState(false);

  // Viagem ao vivo (modo ensaio)
  const [phase, setPhase] = useState<'form' | 'live'>('form');
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<DemoMsg[]>([
    { from: 'driver', text: 'Boa tarde! Estou a caminho do ponto — sou o Toyota Corolla prata (LD-24-71-AA).' },
  ]);
  const [draftMsg, setDraftMsg] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [compliments, setCompliments] = useState<string[]>([]);
  const [rated, setRated] = useState(false);

  const launch = (() => {
    const luanda = zs.filter((z) => z.province === 'Luanda' || z.city === 'Luanda');
    return luanda.length >= 2 ? luanda : zs;
  })();
  const fromId = zs.some((z) => z.id === from) ? from : launch[0].id;
  const toId = zs.some((z) => z.id === to) && to !== fromId
    ? to
    : (launch.find((z) => z.id !== fromId)?.id ?? zs[0].id);
  const fromZone = zs.find((z) => z.id === fromId) ?? zs[0];
  const toZone = zs.find((z) => z.id === toId) ?? zs[1] ?? zs[0];
  const km = Math.max(1, Math.round(haversineKm(fromZone.lat, fromZone.lon, toZone.lat, toZone.lon) * 10) / 10);

  const pool = kind === 'alugar'
    ? cs
    : cs.filter((c) => CLASS_FOR[kind].includes(c.id));
  const activePool = pool.length ? pool : cs;
  const cls = activePool.find((c) => c.id === pickedClassId) ?? activePool[0];
  const vehicleKind = vehicleKindFor(cls.id, cls.icon);

  const price = Math.max(cls.min_kz, Math.round((cls.base_kz + cls.per_km_kz * km) / 100) * 100);
  const each = Math.ceil(price / Math.max(2, party) / 5) * 5;
  const eta = driveMinutes(km);

  const selectedRental = DEMO_RENTALS.find((r) => r.id === rentalId) ?? DEMO_RENTALS[0];
  const rentalTotal = (selectedRental.priceDayKz + (rentalWithDriver ? selectedRental.withDriverFeeKz : 0)) * rentalDays;

  useEffect(() => {
    if (!open || phase !== 'live') return;
    const ms = AUTO_MS[step] ?? 0;
    if (!ms) return;
    const t = window.setTimeout(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), ms);
    return () => window.clearTimeout(t);
  }, [open, phase, step]);

  useEffect(() => {
    if (!open) {
      const t = window.setTimeout(() => {
        setPhase('form');
        setStep(0);
        setPinInput('');
        setPinError(null);
        setStars(0);
        setCompliments([]);
        setRated(false);
        setRentalBooked(false);
      }, 260);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  const shareText = [
    `Viagem Elara Ulyatila DEMO-${String(Math.round(price)).padStart(4, '0')}, em curso.`,
    `De ${fromZone.name} para ${toZone.name} · ${km} km.`,
    `Motorista: ${DRIVER.name} · ${DRIVER.car} ${DRIVER.plate}.`,
    `Preço ${formatKz(price)}. Sem PIN nesta mensagem.`,
  ].join('\n');

  const share = () => {
    if (navigator.share) {
      void navigator.share({ title: 'Viagem Elara Ulyatila (DEMO)', text: shareText }).catch(() => {});
      return;
    }
    window.open(waLink('', shareText), '_blank', 'noopener');
  };

  const sendQuickReply = (id: DemoReplyId, text: string) => {
    setMessages((prev) => [
      ...prev,
      { from: 'you', text },
      { from: 'driver', text: demoDriverReply(id, DRIVER.car, DRIVER.plate) },
    ]);
  };

  const sendCustomReply = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draftMsg.trim();
    if (!clean) return;
    setDraftMsg('');
    setMessages((prev) => [
      ...prev,
      { from: 'you', text: clean },
      { from: 'driver', text: 'Recebido! Estou atento aqui no ponto de encontro.' },
    ]);
  };

  const confirmPin = () => {
    if (!verifyDemoPin(pinInput, DRIVER.pin)) {
      setPinError(`Código incorrecto. No ensaio o código é ${DRIVER.pin}.`);
      return;
    }
    setPinError(null);
    setStep(4);
  };

  const startLive = () => {
    setPhase('live');
    setStep(0);
    setPinInput('');
    setPinError(null);
    setStars(0);
    setCompliments([]);
    setRated(false);
    setMessages([
      { from: 'driver', text: `Boa tarde! Estou a caminho de ${fromZone.name} — ${DRIVER.car} (${DRIVER.plate}).` },
    ]);
  };

  const restart = () => {
    setPhase('form');
    setStep(0);
    setPinInput('');
    setPinError(null);
    setStars(0);
    setCompliments([]);
    setRated(false);
    setRentalBooked(false);
  };

  // Atalhos rápidos de rotas reais em Luanda (com base nas zonas disponíveis)
  const routePresets = launch.length >= 3
    ? [
        { label: `${launch[0].name} → ${launch[1].name}`, a: launch[0].id, b: launch[1].id },
        { label: `${launch[1].name} → ${launch[2].name}`, a: launch[1].id, b: launch[2].id },
      ]
    : [];

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-cream dark:bg-night">
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-0 lg:max-w-2xl lg:px-6">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-cream/[0.97] px-4 pb-2 pt-safe backdrop-blur-2xl dark:border-[rgba(185,168,220,0.25)] dark:bg-night/[0.97]">
          <div className="flex h-12 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-purple-600 text-white dark:bg-amber-400 dark:text-ink">
              <Sparkles className="h-4 w-4" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-label font-semibold leading-tight text-ink dark:text-white">Simulador Elara · DEMO</p>
              <p className="text-caption text-zinc-500 dark:text-zinc-400">Sem servidor · sem dinheiro · ensaio completo no telemóvel</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar o simulador"
              className="tap-pad grid h-10 w-10 place-items-center rounded-full text-zinc-600 active:bg-black/5 dark:text-zinc-300 dark:active:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 px-4 pb-28 pt-4">
          {phase === 'form' ? (
            <div className="space-y-4">
              <div>
                <p className="eyebrow text-purple-700 dark:text-amber-400">Ensaio interactivo</p>
                <h1 className="mt-1 font-display text-title font-medium leading-tight text-ink dark:text-white">
                  Experimentar a Elara Ulyatila
                </h1>
                <p className="mt-1 text-label text-zinc-500 dark:text-zinc-400">
                  Teste qualquer um dos 6 serviços, a frota vectorial, o chat e o código de embarque — tudo marcado como DEMO.
                </p>
              </div>

              {/* Barra dos 6 serviços com arte vectorial em destaque (sempre todos visíveis) */}
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" role="group" aria-label="Serviços do simulador">
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => {
                  const active = kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { setKind(k); setPickedClassId(null); setRentalBooked(false); }}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 rounded-control border px-2 py-2 text-caption font-semibold transition-colors',
                        active
                          ? 'border-purple-600 bg-purple-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-ink'
                          : 'surface-outline text-zinc-700 dark:text-zinc-200',
                      )}
                    >
                      <ServiceArt id={k} tone={active ? 'active' : 'idle'} className="h-6 w-9 shrink-0" />
                      <span className="truncate">{KIND_LABEL[k]}</span>
                    </button>
                  );
                })}
              </div>

              {kind === 'alugar' ? (
                /* — Sala de ensaio de Aluguer — */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    {DEMO_RENTALS.map((r) => {
                      const active = r.id === selectedRental.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => { setRentalId(r.id); setRentalBooked(false); }}
                          className={cn(
                            'rounded-card border p-3 text-left transition-all',
                            active
                              ? 'border-purple-600 bg-purple-600 text-white shadow-card dark:border-amber-400 dark:bg-amber-400 dark:text-ink'
                              : 'surface-card text-ink dark:text-white',
                          )}
                        >
                          <div className={cn(
                            'flex h-16 items-end justify-center rounded-control overflow-hidden',
                            active ? 'bg-purple-700/35 dark:bg-amber-500/25' : 'bg-zinc-100/90 dark:bg-white/[0.05]',
                          )}>
                            <VehicleArt kind={r.vehicleKind} tone={active ? 'active' : 'idle'} className="w-28 h-auto translate-y-1" />
                          </div>
                          <p className="mt-2 text-body font-semibold leading-tight">{r.title}</p>
                          <p className={cn('mt-0.5 text-label font-semibold', active ? 'text-purple-100 dark:text-ink/85' : 'text-purple-700 dark:text-amber-300')}>
                            {formatKz(r.priceDayKz)} / dia
                          </p>
                          <p className={cn('mt-0.5 text-caption', active ? 'text-purple-100/80 dark:text-ink/75' : 'text-zinc-500 dark:text-zinc-400')}>
                            {r.seats} lugares · caução {formatKz(r.depositKz)}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="surface-card rounded-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-body font-semibold text-ink dark:text-white">
                        <CalendarDays className="h-4 w-4 text-purple-600 dark:text-amber-400" /> Duração (dias)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRentalDays((d) => Math.max(1, d - 1))}
                          disabled={rentalDays <= 1}
                          aria-label="Menos um dia"
                          className={cn('h-9 w-9 rounded-control surface-outline font-bold', OFF_ATTR)}
                        >−</button>
                        <span className="w-8 text-center text-body font-semibold text-ink dark:text-white">{rentalDays}</span>
                        <button
                          type="button"
                          onClick={() => setRentalDays((d) => Math.min(30, d + 1))}
                          disabled={rentalDays >= 30}
                          aria-label="Mais um dia"
                          className={cn('h-9 w-9 rounded-control surface-outline font-bold', OFF_ATTR)}
                        >+</button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-[rgba(185,168,220,0.22)]">
                      <div>
                        <p className="text-body font-semibold text-ink dark:text-white">Com motorista incluído</p>
                        <p className="text-caption text-zinc-500 dark:text-zinc-400">
                          +{formatKz(selectedRental.withDriverFeeKz)} / dia
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rentalWithDriver}
                        aria-label="Com motorista incluído"
                        onClick={() => setRentalWithDriver((v) => !v)}
                        className={cn(
                          'tap-pad-lg relative h-8 w-14 shrink-0 rounded-full transition-colors',
                          rentalWithDriver ? 'bg-purple-600 dark:bg-amber-400' : 'bg-zinc-300/80 dark:bg-zinc-700',
                        )}
                      >
                        <span className={cn('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all', rentalWithDriver ? 'left-7' : 'left-1')} />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-card border border-purple-200 bg-purple-50 p-4 dark:border-amber-400/40 dark:bg-amber-400/[0.08]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-label font-medium text-zinc-600 dark:text-amber-200/80">
                        {selectedRental.title} · {rentalDays} {rentalDays === 1 ? 'dia' : 'dias'}
                      </span>
                      <span className="font-display text-lead font-semibold text-ink dark:text-white">
                        {formatKz(rentalTotal)}
                      </span>
                    </div>
                    <p className="mt-1 text-caption text-zinc-500 dark:text-amber-200/70">
                      Caução reembolsável: {formatKz(selectedRental.depositKz)} · valores de ensaio DEMO.
                    </p>
                  </div>

                  {rentalBooked ? (
                    <div className="surface-card rounded-card p-4 text-center space-y-2">
                      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-purple-600 text-white dark:bg-amber-400 dark:text-ink">
                        <Check className="h-5 w-5" />
                      </span>
                      <p className="text-body font-semibold text-ink dark:text-white">
                        Pedido DEMO registado
                      </p>
                      <p className="text-label text-zinc-500 dark:text-zinc-400">
                        Na app real, o proprietário recebe o pedido de {selectedRental.title} e confirma antes de qualquer pagamento.
                      </p>
                      <button
                        type="button"
                        onClick={() => setRentalBooked(false)}
                        className="mt-2 h-11 w-full rounded-control surface-outline text-label font-semibold"
                      >
                        Simular outro aluguer
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRentalBooked(true)}
                      className="btn-main h-14 w-full rounded-card text-control font-semibold"
                    >
                      Enviar pedido de aluguer (DEMO)
                    </button>
                  )}
                </div>
              ) : (
                /* — Formulário dos 5 serviços de rota — */
                <>
                  {/* Rotas rápidas em Luanda */}
                  {routePresets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {routePresets.map((rp) => (
                        <button
                          key={rp.label}
                          type="button"
                          onClick={() => { setFrom(rp.a); setTo(rp.b); }}
                          className="h-11 rounded-full surface-outline px-3 text-caption font-semibold text-zinc-700 dark:text-zinc-200"
                        >
                          {rp.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="surface-card space-y-3 rounded-card p-4">
                    <label className="block">
                      <span className="text-caption font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">De</span>
                      <select
                        value={fromId}
                        onChange={(e) => setFrom(e.target.value)}
                        className="mt-1 h-12 w-full rounded-control border border-zinc-200 bg-white px-3 text-body text-ink outline-none focus:border-purple-400 dark:border-[rgba(185,168,220,0.3)] dark:bg-zinc-900 dark:text-white"
                      >
                        {zs.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-caption font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Para</span>
                      <select
                        value={toId}
                        onChange={(e) => setTo(e.target.value)}
                        className="mt-1 h-12 w-full rounded-control border border-zinc-200 bg-white px-3 text-body text-ink outline-none focus:border-purple-400 dark:border-[rgba(185,168,220,0.3)] dark:bg-zinc-900 dark:text-white"
                      >
                        {zs.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                      </select>
                    </label>
                    {fromId === toId && (
                      <p className="text-label font-medium text-red-600 dark:text-red-400">
                        Escolha uma zona de destino diferente.
                      </p>
                    )}

                    {/* Selector visual da categoria com a nova arte vectorial */}
                    {activePool.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto h-rail pt-1">
                        {activePool.map((item) => {
                          const active = item.id === cls.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setPickedClassId(item.id)}
                              className={cn(
                                'shrink-0 w-32 rounded-control border p-2 text-left transition-colors',
                                active
                                  ? 'border-purple-600 bg-purple-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-ink'
                                  : 'surface-outline',
                              )}
                            >
                              {kind === 'entrega' ? (
                                <ParcelSizeArt level={item.id === 'moto' ? 0 : 1} tone={active ? 'active' : 'idle'} className="mx-auto h-11 w-auto" />
                              ) : (
                                <VehicleArt kind={vehicleKindFor(item.id, item.icon)} tone={active ? 'active' : 'idle'} className="mx-auto h-11 w-auto" />
                              )}
                              <p className="mt-1 truncate text-label font-semibold">{item.label}</p>
                              <p className={cn('text-caption', active ? 'text-purple-100 dark:text-ink/80' : 'text-zinc-500 dark:text-zinc-400')}>
                                desde {formatKz(item.min_kz)}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {kind === 'partilha' && (
                      <div className="flex items-center justify-between rounded-control bg-zinc-50 px-3 py-2 dark:bg-white/[0.05]">
                        <span className="flex items-center gap-1.5 text-label font-medium text-zinc-600 dark:text-zinc-300">
                          <Users className="h-4 w-4 text-purple-600 dark:text-amber-400" /> Quantos vão no carro
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setParty((p) => Math.max(2, p - 1))}
                            disabled={party <= 2}
                            aria-label="Menos uma pessoa"
                            className={cn('h-9 w-9 rounded-full border border-zinc-200 text-body font-bold text-ink dark:border-white/15 dark:text-white', OFF_ATTR)}
                          >−</button>
                          <span className="w-5 text-center text-body font-semibold text-ink dark:text-white">{party}</span>
                          <button
                            type="button"
                            onClick={() => setParty((p) => Math.min(6, p + 1))}
                            disabled={party >= 6}
                            aria-label="Mais uma pessoa"
                            className={cn('h-9 w-9 rounded-full border border-zinc-200 text-body font-bold text-ink dark:border-white/15 dark:text-white', OFF_ATTR)}
                          >+</button>
                        </div>
                      </div>
                    )}

                    {/* Pagamento e simulação nocturna */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {([['cash', 'Dinheiro', Banknote], ['multicaixa', 'Multicaixa', CreditCard]] as const).map(([id, label, Icon]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setPayment(id)}
                          aria-pressed={payment === id}
                          className={cn(
                            'h-11 rounded-control border flex items-center justify-center gap-2 text-label font-semibold transition-colors',
                            payment === id
                              ? 'border-purple-500 bg-purple-100 text-purple-800 dark:border-amber-400 dark:bg-amber-400/15 dark:text-amber-200'
                              : 'surface-outline text-zinc-600 dark:text-zinc-200',
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      aria-pressed={nightPreview}
                      onClick={() => setNightPreview((n) => !n)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-control border px-3 py-2 text-label font-semibold transition-colors',
                        nightPreview
                          ? 'border-purple-400 bg-purple-50 text-purple-800 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-200'
                          : 'surface-outline text-zinc-600 dark:text-zinc-300',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Moon className="h-4 w-4" aria-hidden="true" /> Simular aviso de viagem nocturna
                      </span>
                      <span className="text-caption">{nightPreview ? 'Ligado' : 'Desligado'}</span>
                    </button>
                  </div>

                  {/* Cartão de preço + pré-visualização da arte vectorial */}
                  <div className="rounded-card border border-purple-200 bg-purple-50 p-4 dark:border-amber-400/40 dark:bg-amber-400/[0.08]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-label font-medium text-zinc-600 dark:text-amber-200/80">
                          {cls.label} · {km} km · ≈{span(eta)}
                        </p>
                        <p className="mt-0.5 font-display text-title font-semibold text-ink dark:text-white">{formatKz(price)}</p>
                        {kind === 'partilha' && (
                          <p className="mt-1 text-label font-semibold text-purple-800 dark:text-amber-200">
                            Cada um põe {formatKz(each)} × {party}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {kind === 'entrega' ? (
                          <ParcelSizeArt level={1} className="h-14 w-auto" />
                        ) : (
                          <VehicleArt kind={vehicleKind} className="w-28 h-auto" />
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-caption text-zinc-500 dark:text-amber-200/70">
                      Preço de ensaio DEMO · pagamento {payment === 'cash' ? 'em dinheiro' : 'por Multicaixa'}.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={startLive}
                    disabled={fromId === toId}
                    className={cn('h-14 w-full rounded-card text-control font-semibold', fromId === toId ? OFF : 'btn-main')}
                  >
                    Pedir no simulador · {formatKz(price)}
                  </button>
                </>
              )}
            </div>
          ) : (
            <LiveTrip
              step={step}
              kind={kind as Exclude<Kind, 'alugar'>}
              vehicleKind={vehicleKind}
              fromName={fromZone.name}
              toName={toZone.name}
              km={km}
              eta={eta}
              price={price}
              each={each}
              party={party}
              payment={payment}
              nightPreview={nightPreview}
              messages={messages}
              draftMsg={draftMsg}
              onDraftMsg={setDraftMsg}
              onSendQuick={sendQuickReply}
              onSendCustom={sendCustomReply}
              pinInput={pinInput}
              pinError={pinError}
              onPinInput={(v) => { setPinInput(v.replace(/\D/g, '').slice(0, 4)); setPinError(null); }}
              onConfirmPin={confirmPin}
              stars={stars}
              compliments={compliments}
              rated={rated}
              onAdvance={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
              onRate={(s) => { setStars(s); setRated(true); }}
              onToggleCompliment={(id) => setCompliments((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
              onShare={share}
              onRestart={restart}
            />
          )}
        </div>

        <div className="sticky bottom-0 border-t border-zinc-200 bg-cream/[0.97] px-4 pb-safe pt-2 backdrop-blur-2xl dark:border-[rgba(185,168,220,0.25)] dark:bg-night/[0.97]">
          <button
            type="button"
            onClick={onExit}
            className="h-11 w-full rounded-control text-label font-semibold text-red-600 dark:text-red-300"
          >
            Sair do modo demonstração
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveTrip({
  step, kind, vehicleKind, fromName, toName, km, eta, price, each, party, payment, nightPreview,
  messages, draftMsg, onDraftMsg, onSendQuick, onSendCustom,
  pinInput, pinError, onPinInput, onConfirmPin,
  stars, compliments, rated, onAdvance, onRate, onToggleCompliment, onShare, onRestart,
}: {
  step: number;
  kind: Exclude<Kind, 'alugar'>;
  vehicleKind: ReturnType<typeof vehicleKindFor>;
  fromName: string;
  toName: string;
  km: number;
  eta: number;
  price: number;
  each: number;
  party: number;
  payment: Payment;
  nightPreview: boolean;
  messages: DemoMsg[];
  draftMsg: string;
  onDraftMsg: (v: string) => void;
  onSendQuick: (id: DemoReplyId, text: string) => void;
  onSendCustom: (e: React.FormEvent) => void;
  pinInput: string;
  pinError: string | null;
  onPinInput: (v: string) => void;
  onConfirmPin: () => void;
  stars: number;
  compliments: string[];
  rated: boolean;
  onAdvance: () => void;
  onRate: (n: number) => void;
  onToggleCompliment: (id: string) => void;
  onShare: () => void;
  onRestart: () => void;
}) {
  const done = step >= 5;
  const s = STEPS[step];
  const progress = demoStepProgress(step);
  const noteKz = suggestNote(price);
  const changeKz = noteKz ? changeOf(noteKz, price) : 0;

  return (
    <div className="space-y-4">
      {/* Cabeçalho de estado + pista SVG animada com o veículo em movimento */}
      <div className="rounded-card bg-purple-600 p-4 text-white shadow-card dark:bg-[#3a1a6e]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption font-semibold uppercase tracking-[0.18em] text-white/75">
            DEMO · {KIND_LABEL[kind]}
          </p>
          <span className="text-caption font-semibold text-white/80">
            {payment === 'cash' ? 'Dinheiro' : 'Multicaixa'}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          {!done && <Loader2 className={cn('h-4 w-4', step < 3 && 'animate-spin')} />}
          {done && <Check className="h-4 w-4" />}
          <p className="text-body font-semibold">{s.label}</p>
        </div>
        <p className="mt-1 text-label text-white/80">{s.hint}</p>

        {/* Pista vectorial interactiva com posição do veículo */}
        <div className="mt-4 rounded-control bg-white/10 px-3 py-3">
          <div className="relative h-12">
            <svg viewBox="0 0 320 44" className="h-full w-full overflow-visible" aria-hidden="true">
              <line x1="16" y1="34" x2="304" y2="34" stroke="rgba(255,255,255,0.28)" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 6" />
              <line
                x1="16"
                y1="34"
                x2={16 + (288 * progress) / 100}
                y2="34"
                stroke="#E7CFA6"
                strokeWidth="4"
                strokeLinecap="round"
                style={{ transition: 'all 700ms cubic-bezier(0.22, 0.68, 0.24, 1)' }}
              />
              <circle cx="16" cy="34" r="5" fill="#FFFFFF" />
              <rect x="299" y="29" width="10" height="10" rx="2.5" fill="#E7CFA6" />
            </svg>
            <div
              className="pointer-events-none absolute -top-1 w-16 transition-all duration-700"
              style={{ left: `clamp(0px, calc(${progress}% - 32px), calc(100% - 64px))` }}
            >
              <VehicleArt kind={vehicleKind} tone="active" className="w-16 h-auto" />
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between text-caption text-white/85">
            <span className="truncate max-w-[44%]">{fromName}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-400 dark:text-amber-300" />
            <span className="truncate max-w-[44%] text-right">{toName}</span>
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-white/20 pt-3">
          <span className="text-label text-white/85">{km} km · ≈{span(eta)}</span>
          <span className="shrink-0 font-display text-lead font-semibold">{formatKz(price)}</span>
        </div>
        {kind === 'partilha' && (
          <p className="mt-1 text-caption text-white/75">{formatKz(each)} por pessoa × {party}</p>
        )}
      </div>

      <Progress step={step} />

      {/* Aviso de troco em dinheiro */}
      {!done && payment === 'cash' && noteKz && (
        <div className="rounded-card border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950/35">
          <p className="text-label font-semibold text-amber-800 dark:text-amber-200">
            {changeKz === 0
              ? `Dica de troco: nota exacta de ${formatKz(noteKz)}.`
              : `Com nota de ${formatKz(noteKz)}, o motorista precisa de ${formatKz(changeKz)} em troco.`}
          </p>
        </div>
      )}

      {/* Aviso de viagem nocturna */}
      {!done && nightPreview && (
        <div className="surface-card rounded-card p-3.5">
          <p className="flex items-center gap-2 text-label font-semibold text-ink dark:text-white">
            <Moon className="h-4 w-4 text-purple-600 dark:text-amber-400" />
            Modo nocturno activo (21 h – 05 h)
          </p>
          <p className="mt-1 text-caption text-zinc-600 dark:text-zinc-300">
            Confirme a matrícula <strong className="text-ink dark:text-white">{DRIVER.plate}</strong> antes de entrar e partilhe a rota com um contacto de confiança.
          </p>
        </div>
      )}

      {/* Código de viagem + verificação interactiva no passo 3 */}
      {step >= 1 && step < 4 && (
        <div className="surface-card rounded-card p-4 text-center space-y-2.5">
          <p className="flex items-center justify-center gap-1.5 text-caption font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            <KeyRound className="h-3.5 w-3.5 text-purple-600 dark:text-amber-400" /> Código de viagem (DEMO)
          </p>
          <p className="font-display text-display font-semibold tracking-[0.3em] text-ink dark:text-white">
            {DRIVER.pin}
          </p>
          <p className="text-label text-zinc-500 dark:text-zinc-400">
            {step === 3
              ? 'O motorista está no ponto. Escreva o PIN abaixo para começar a viagem:'
              : 'Guarde-o — o motorista confirma-o consigo à porta do carro.'}
          </p>

          {step === 3 && (
            <div className="pt-1 space-y-2">
              <div className="flex items-center justify-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => onPinInput(e.target.value)}
                  placeholder="4821"
                  aria-label="Escrever código PIN de 4 dígitos"
                  className="h-12 w-36 rounded-control border border-zinc-200 bg-white text-center font-display text-lead font-semibold tracking-[0.28em] text-ink outline-none focus:border-purple-500 dark:border-[rgba(185,168,220,0.35)] dark:bg-zinc-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => onPinInput(DRIVER.pin)}
                  className="h-12 px-3 rounded-control surface-outline text-label font-semibold shrink-0"
                >
                  Usar {DRIVER.pin}
                </button>
              </div>
              {pinError && (
                <p role="alert" className="text-label font-semibold text-red-600 dark:text-red-300">
                  {pinError}
                </p>
              )}
              <button
                type="button"
                onClick={onConfirmPin}
                disabled={pinInput.length < 4}
                className={cn('h-12 w-full rounded-control text-body font-semibold', pinInput.length < 4 ? OFF : 'btn-main')}
              >
                Confirmar código e arrancar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Motorista e Chat interactivo */}
      {step >= 1 && (
        <div className="surface-card rounded-card p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-purple-100 text-body font-bold text-purple-700 dark:bg-amber-400/15 dark:text-amber-300">
              JM
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink dark:text-white">{DRIVER.name}</p>
              <p className="flex items-center gap-1.5 text-label text-zinc-500 dark:text-zinc-400">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {DRIVER.rating} · {DRIVER.trips} viagens
              </p>
              <p className="text-label text-zinc-500 dark:text-zinc-400">
                {DRIVER.car} · <span className="font-semibold text-ink dark:text-white">{DRIVER.plate}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onShare}
              aria-label="Partilhar viagem"
              className="tap-pad grid h-10 w-10 shrink-0 place-items-center rounded-full bg-purple-100 text-purple-700 dark:bg-white/[0.08] dark:text-amber-300"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          {/* Mensagens */}
          <div className="mt-3 space-y-1.5 border-t border-zinc-200 pt-3 dark:border-[rgba(185,168,220,0.2)]">
            <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              <MessageSquare className="h-3.5 w-3.5" /> Chat com o motorista (DEMO)
            </p>
            <div className="space-y-1.5 max-h-44 overflow-y-auto py-1">
              {messages.map((m, i) => (
                <p
                  key={i}
                  className={cn(
                    'max-w-[85%] rounded-control px-3 py-2 text-label leading-snug',
                    m.from === 'driver'
                      ? 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200'
                      : 'ml-auto bg-purple-600 text-white dark:bg-amber-400 dark:text-ink',
                  )}
                >
                  {m.text}
                </p>
              ))}
            </div>

            {!done && (
              <>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {DEMO_QUICK_REPLIES.map((qr) => (
                    <button
                      key={qr.id}
                      type="button"
                      onClick={() => onSendQuick(qr.id, qr.text)}
                      className="h-11 rounded-full surface-outline px-3 text-caption font-semibold text-purple-700 dark:text-amber-300"
                    >
                      {qr.label}
                    </button>
                  ))}
                </div>
                <form onSubmit={onSendCustom} className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={draftMsg}
                    onChange={(e) => onDraftMsg(e.target.value)}
                    placeholder="Escrever mensagem ao motorista…"
                    maxLength={120}
                    className="h-11 flex-1 rounded-control border border-zinc-200 bg-white px-3 text-body text-ink outline-none focus:border-purple-400 dark:border-[rgba(185,168,220,0.3)] dark:bg-zinc-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={!draftMsg.trim()}
                    aria-label="Enviar mensagem"
                    className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-control', !draftMsg.trim() ? OFF : 'btn-main')}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2">
          <p className="text-center text-label text-zinc-500 dark:text-zinc-400">≈{span(eta)} até {toName}</p>
          <button type="button" onClick={onAdvance} className="btn-main h-14 w-full rounded-card text-control font-semibold">
            <Flag className="mr-2 inline h-4 w-4" /> Terminar a viagem
          </button>
        </div>
      )}
      {step < 3 && (
        <button type="button" onClick={onAdvance} className="h-11 w-full rounded-control surface-outline text-label font-semibold text-purple-700 dark:text-amber-300">
          Avançar passo já
        </button>
      )}

      {done && (
        <div className="surface-card rounded-card p-4 text-center space-y-3">
          {rated ? (
            <div className="space-y-2">
              <p className="text-body font-semibold text-ink dark:text-white">
                Avaliação de {stars} ★ registada (só neste ensaio). Obrigado!
              </p>
              {stars >= 4 && (
                <div className="pt-1">
                  <p className="text-caption text-zinc-500 dark:text-zinc-400 mb-2">
                    Elogios opcionais ao motorista:
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {COMPLIMENTS.slice(0, 4).map((c) => {
                      const on = compliments.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => onToggleCompliment(c.id)}
                          className={cn(
                            'h-11 rounded-full border px-3 text-caption font-semibold transition-colors',
                            on
                              ? 'border-purple-600 bg-purple-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-ink'
                              : 'surface-outline',
                          )}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-body font-semibold text-ink dark:text-white">Como correu a viagem?</p>
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onRate(n)}
                    aria-label={`${n} estrelas`}
                    className="tap-pad grid h-11 w-11 place-items-center rounded-full active:scale-95"
                  >
                    <Star className={cn('h-7 w-7', n <= stars ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600')} />
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="text-label text-zinc-500 dark:text-zinc-400">
            {km} km · {formatKz(price)} · {kind === 'entrega' ? 'Entrega' : 'Viagem'} DEMO-{String(Math.round(price)).padStart(4, '0')}
          </p>
          <button
            type="button"
            onClick={onRestart}
            className="h-11 w-full rounded-control surface-outline text-label font-semibold text-ink dark:text-white"
          >
            Simular outra viagem
          </button>
        </div>
      )}
    </div>
  );
}

/** Quatro marcos: é o que a pessoa reconhece, não os nove estados internos. */
function Progress({ step }: { step: number }) {
  const marks = [
    { label: 'Pedido', on: true },
    { label: 'A caminho', on: step >= 1 },
    { label: 'Em viagem', on: step >= 4 },
    { label: 'Fim', on: step >= 5 },
  ];
  return (
    <div className="flex items-start gap-1">
      {marks.map((m, i) => (
        <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-center">
            <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : m.on ? 'bg-purple-600 dark:bg-amber-400' : 'bg-zinc-200 dark:bg-white/15')} />
            {m.on
              ? <Check className="h-4 w-4 shrink-0 text-purple-600 dark:text-amber-400" strokeWidth={2.4} />
              : <CircleDot className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />}
            <span className={cn('h-0.5 flex-1', i === marks.length - 1 ? 'bg-transparent' : marks[i + 1]?.on ? 'bg-purple-600 dark:bg-amber-400' : 'bg-zinc-200 dark:bg-white/15')} />
          </div>
          <span className={cn('text-caption', m.on ? 'font-semibold text-ink dark:text-white' : 'text-zinc-500 dark:text-zinc-400')}>
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}
