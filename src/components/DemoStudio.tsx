import { useEffect, useState } from 'react';
import {
  ArrowRight, Banknote, Check, CircleDot, Flag, Loader2, MessageSquare, Share2,
  Sparkles, Star, X,
} from 'lucide-react';
import type { VehicleClass, Zone } from '../types';
import { haversineKm } from '../lib/map';
import { driveMinutes } from '../lib/trips';
import { formatKz } from '../lib/money';
import { cn, OFF_ATTR, waLink } from '../lib/utils';

/**
 * O simulador: a viagem inteira — preço, motorista, código, chegada, fecho e
 * avaliação — sem servidor, sem conta e sem dinheiro. Corre no telemóvel, para
 * quem quer ver a app a andar antes de haver carros na rua.
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
  { id: 'carro', label: 'Carro', seats: 4, base_kz: 300, per_km_kz: 450, min_kz: 900, per_seat: false, blurb: '', icon: 'car', sort: 1 },
  { id: 'moto', label: 'Mota', seats: 1, base_kz: 200, per_km_kz: 300, min_kz: 600, per_seat: false, blurb: '', icon: 'moto', sort: 2 },
  { id: 'hiace', label: 'Hiace', seats: 14, base_kz: 500, per_km_kz: 700, min_kz: 1500, per_seat: true, blurb: '', icon: 'van', sort: 3 },
  { id: 'picape', label: 'Picape', seats: 3, base_kz: 900, per_km_kz: 900, min_kz: 2500, per_seat: false, blurb: '', icon: 'pickup', sort: 4, lane: 'carga' },
];

type Kind = 'carro' | 'moto' | 'partilha' | 'entrega' | 'mudanca';

const KIND_LABEL: Record<Kind, string> = {
  carro: 'Viagem',
  moto: 'Mota',
  partilha: 'Partilhar',
  entrega: 'Entrega',
  mudanca: 'Mudança',
};

const CLASS_FOR: Record<Kind, string[]> = {
  carro: ['carro', 'conforto', 'suv', 'hiace'],
  moto: ['moto'],
  partilha: ['hiace', 'carro'],
  entrega: ['moto', 'carro'],
  mudanca: ['picape', 'canter', 'camiao', 'carga'],
};

const STEPS = [
  { label: 'À procura de motorista', hint: 'O pedido está na praça. Assim que um motorista aceitar, aparece aqui.' },
  { label: 'Motorista a caminho', hint: 'João Manuel aceitou. Guarde o código — ele pergunta-o quando chegar.' },
  { label: 'Quase a chegar', hint: 'O carro está a 300 m do ponto de embarque.' },
  { label: 'À espera do código', hint: 'O motorista está no ponto. Diga-lhe o PIN de 4 dígitos.' },
  { label: 'Em viagem', hint: 'A caminho do destino. A rota segue a zona que escolheu.' },
  { label: 'Terminada', hint: 'Chegou ao destino. O recibo fica no histórico.' },
];

const DRIVER = {
  name: 'João Manuel',
  rating: 4.9,
  trips: 1284,
  plate: 'LD-24-71-AA',
  car: 'Toyota Corolla',
  pin: '4821',
};

const CHAT: Array<{ from: 'driver' | 'you'; text: string }> = [
  { from: 'driver', text: 'Boa tarde. Estou a chegar ao ponto — sou o Corolla prata.' },
  { from: 'you', text: 'Estou aqui, junto à paragem.' },
  { from: 'driver', text: 'Já o vejo. Pode entrar, o código é que confirma o início.' },
];

const AUTO_MS = [2600, 3200, 3000, 0, 9000, 0];

/** 840 min não se lê; 14 h lê-se. */
const span = (min: number) => (min >= 90 ? `${Math.round(min / 60)} h` : `${min} min`);

export function DemoStudio({ open, zones, classes, onClose, onExit }: DemoStudioProps) {
  const zs = zones.length >= 2 ? zones : FALLBACK_ZONES;
  const cs = classes.length ? classes : FALLBACK_CLASSES;

  const [kind, setKind] = useState<Kind>('carro');
  const [from, setFrom] = useState<string>(zs[0].id);
  const [to, setTo] = useState<string>(zs[1].id);
  const [party, setParty] = useState(2);
  const [phase, setPhase] = useState<'form' | 'live'>('form');
  const [step, setStep] = useState(0);
  const [chat, setChat] = useState(0);
  const [stars, setStars] = useState(0);
  const [rated, setRated] = useState(false);

  // Os estados nascem com as zonas de recurso; quando as zonas a sério chegam,
  // esses ids deixam de existir. Resolver aqui — e não num efeito — evita que
  // os dois selects mostrem a primeira opção enquanto o preço é de outra rota.
  // O ensaio é urbano: Luanda primeiro, e não um Benguela→Luanda de 392 km.
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
  const cls = cs.find((c) => CLASS_FOR[kind].includes(c.id)) ?? cs[0];
  const price = Math.max(cls.min_kz, Math.round((cls.base_kz + cls.per_km_kz * km) / 100) * 100);
  const each = Math.ceil(price / Math.max(2, party));
  const eta = driveMinutes(km);

  // O tempo faz a viagem andar sozinha; os botões deixam-na saltar à frente.
  // O PIN e o fecho são manuais de propósito: são os dois momentos em que a
  // pessoa faz alguma coisa na vida real.
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
        setPhase('form'); setStep(0); setChat(0); setStars(0); setRated(false);
      }, 260);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  const shareText = [
    `Viagem Elara Ulyatila DEMO-${String(Math.round(price)).padStart(4, '0')}, em curso.`,
    `De ${fromZone.name} para ${toZone.name} · ${km} km.`,
    `Motorista: ${DRIVER.name} · ${DRIVER.car} ${DRIVER.plate}.`,
    `Preço ${price} Kz. Se algo correr mal, posso ligar 111.`,
  ].join('\n');

  const share = () => {
    if (navigator.share) {
      void navigator.share({ title: 'Viagem Elara Ulyatila', text: shareText }).catch(() => {});
      return;
    }
    window.open(waLink('', shareText), '_blank', 'noopener');
  };

  const restart = () => { setPhase('form'); setStep(0); setChat(0); setStars(0); setRated(false); };

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-cream dark:bg-night">
      {/* No PC o simulador é uma sala, não um telemóvel a flutuar: alarga com
          o ecrã até ao largo de leitura da app (672 px) e fica por aí. */}
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-0 lg:max-w-2xl lg:px-6">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-cream/[0.97] px-4 pb-2 pt-safe backdrop-blur-2xl dark:border-[rgba(185,168,220,0.25)] dark:bg-night/[0.97]">
          <div className="flex h-12 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-purple-600 text-white dark:bg-amber-400 dark:text-ink">
              <Sparkles className="h-4 w-4" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-label font-semibold leading-tight text-ink dark:text-white">Simulador Elara</p>
              <p className="text-caption text-zinc-500 dark:text-zinc-400">Sem servidor · sem dinheiro · leva a marca DEMO</p>
            </div>
            <button
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
                <p className="eyebrow text-purple-700 dark:text-amber-400">Ensaio</p>
                <h1 className="mt-1 font-display text-title font-medium leading-tight text-ink dark:text-white">
                  Ver a app a andar
                </h1>
                <p className="mt-1 text-label text-zinc-500 dark:text-zinc-400">
                  Escolha o serviço e a rota. O resto é a viagem toda, com carro a chegar a fingir.
                </p>
              </div>

              <div className="flex gap-2 overflow-x-auto h-rail pb-1">
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    aria-pressed={kind === k}
                    className={cn(
                      'shrink-0 rounded-full border px-3.5 py-2 text-label font-semibold transition-colors',
                      kind === k
                        ? 'border-purple-600 bg-purple-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-ink'
                        : 'border-zinc-200 bg-white text-zinc-700 dark:border-[rgba(185,168,220,0.3)] dark:bg-white/[0.07] dark:text-zinc-200',
                    )}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>

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
                {kind === 'partilha' && (
                  <div className="flex items-center justify-between rounded-control bg-zinc-50 px-3 py-2 dark:bg-white/[0.05]">
                    <span className="text-label font-medium text-zinc-600 dark:text-zinc-300">Quantos vão no carro</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setParty((p) => Math.max(2, p - 1))}
                        disabled={party <= 2}
                        aria-label="Menos uma pessoa"
                        className={cn('h-9 w-9 rounded-full border border-zinc-200 text-body font-bold text-ink dark:border-white/15 dark:text-white', party <= 2 && OFF_ATTR)}
                      >−</button>
                      <span className="w-5 text-center text-body font-semibold text-ink dark:text-white">{party}</span>
                      <button
                        onClick={() => setParty((p) => Math.min(6, p + 1))}
                        disabled={party >= 6}
                        aria-label="Mais uma pessoa"
                        className={cn('h-9 w-9 rounded-full border border-zinc-200 text-body font-bold text-ink dark:border-white/15 dark:text-white', party >= 6 && OFF_ATTR)}
                      >+</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-card border border-purple-200 bg-purple-50 p-4 dark:border-amber-400/40 dark:bg-amber-400/[0.08]">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-label font-medium text-zinc-600 dark:text-amber-200/80">
                      {cls.label} · {km} km · viagem ≈{span(eta)}
                    </p>
                    <p className="mt-0.5 text-title font-semibold text-ink dark:text-white">{formatKz(price)}</p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-caption font-semibold text-purple-700 dark:bg-white/10 dark:text-amber-300">
                    <Banknote className="h-3.5 w-3.5" /> {kind === 'partilha' ? 'carro inteiro' : 'fechado'}
                  </span>
                </div>
                {kind === 'partilha' && (
                  <p className="mt-1.5 text-label font-medium text-purple-800 dark:text-amber-200">
                    Cada um põe {formatKz(each)} × {party}
                  </p>
                )}
                <p className="mt-2 text-caption text-zinc-500 dark:text-amber-200/70">
                  Preço de ensaio: sai da tabela base, não do servidor.
                </p>
              </div>

              <button
                onClick={() => { setPhase('live'); setStep(0); }}
                disabled={fromId === toId}
                className={cn('btn-main h-14 w-full rounded-control text-control font-semibold', fromId === toId && OFF_ATTR)}
              >
                Pedir no simulador
              </button>
            </div>
          ) : (
            <LiveTrip
              step={step}
              kind={kind}
              fromName={fromZone.name}
              toName={toZone.name}
              km={km}
              eta={eta}
              price={price}
              each={each}
              party={party}
              chat={chat}
              stars={stars}
              rated={rated}
              onChat={() => setChat((c) => Math.min(c + 1, CHAT.length))}
              onAdvance={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
              onRate={(s) => { setStars(s); setRated(true); }}
              onShare={share}
              onRestart={restart}
            />
          )}
        </div>

        <div className="sticky bottom-0 border-t border-zinc-200 bg-cream/[0.97] px-4 pb-safe pt-2 backdrop-blur-2xl dark:border-[rgba(185,168,220,0.25)] dark:bg-night/[0.97]">
          <button
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

function LiveTrip({ step, kind, fromName, toName, km, eta, price, each, party, chat, stars, rated,
  onChat, onAdvance, onRate, onShare, onRestart }: {
  step: number; kind: Kind; fromName: string; toName: string; km: number; eta: number;
  price: number; each: number; party: number; chat: number; stars: number; rated: boolean;
  onChat: () => void; onAdvance: () => void; onRate: (n: number) => void;
  onShare: () => void; onRestart: () => void;
}) {
  const done = step >= 5;
  const s = STEPS[step];

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-purple-600 p-4 text-white shadow-card dark:bg-[#3a1a6e]">
        <p className="text-caption font-semibold uppercase tracking-[0.18em] text-white/70">
          DEMO · {KIND_LABEL[kind]}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {!done && <Loader2 className={cn('h-4 w-4', step < 3 && 'animate-spin')} />}
          {done && <Check className="h-4 w-4" />}
          <p className="text-body font-semibold">{s.label}</p>
        </div>
        <p className="mt-1 text-label text-white/80">{s.hint}</p>
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-white/20 pt-3">
          <span className="text-label text-white/80">
            {fromName} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {toName}
          </span>
          <span className="shrink-0 text-body font-semibold">{formatKz(price)}</span>
        </div>
        {kind === 'partilha' && (
          <p className="mt-1 text-caption text-white/70">{formatKz(each)} por pessoa × {party}</p>
        )}
      </div>

      <Progress step={step} />

      {/* O código só aparece a quem pediu, como na app a sério. */}
      {step >= 1 && step < 4 && (
        <div className="rounded-card border border-zinc-200 bg-white p-4 text-center dark:border-[rgba(185,168,220,0.3)] dark:bg-white/[0.07]">
          <p className="text-caption font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Código de viagem</p>
          <p className="mt-1 text-stat font-semibold tracking-[0.32em] text-ink dark:text-white">{DRIVER.pin}</p>
          <p className="mt-1 text-label text-zinc-500 dark:text-zinc-400">
            {step === 3 ? 'Diga este código ao motorista.' : 'Guarde-o — o motorista pergunta-o quando chegar.'}
          </p>
        </div>
      )}

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
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={onChat}
                aria-label="Enviar mensagem ao motorista"
                disabled={chat >= CHAT.length}
                className={cn('grid h-10 w-10 place-items-center rounded-full bg-purple-100 text-purple-700 dark:bg-white/[0.08] dark:text-amber-300', chat >= CHAT.length && OFF_ATTR)}
              >
                <MessageSquare className="h-4 w-4" />
              </button>
              <button
                onClick={onShare}
                aria-label="Partilhar viagem"
                className="grid h-10 w-10 place-items-center rounded-full bg-purple-100 text-purple-700 dark:bg-white/[0.08] dark:text-amber-300"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          {chat > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3 dark:border-white/10">
              {CHAT.slice(0, chat).map((m, i) => (
                <p
                  key={i}
                  className={cn(
                    'max-w-[85%] rounded-control px-3 py-2 text-label',
                    m.from === 'driver'
                      ? 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200'
                      : 'ml-auto bg-purple-600 text-white dark:bg-amber-400 dark:text-ink',
                  )}
                >
                  {m.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <button onClick={onAdvance} className="btn-main h-14 w-full rounded-control text-control font-semibold">
          Confirmar o código · começar viagem
        </button>
      )}
      {step === 4 && (
        <div className="space-y-2">
          <p className="text-center text-label text-zinc-500 dark:text-zinc-400">≈{span(eta)} até {toName}</p>
          <button onClick={onAdvance} className="btn-main h-14 w-full rounded-control text-control font-semibold">
            <Flag className="mr-2 inline h-4 w-4" /> Terminar a viagem
          </button>
        </div>
      )}
      {step < 3 && (
        <button onClick={onAdvance} className="h-11 w-full rounded-control text-label font-semibold text-purple-700 dark:text-amber-300">
          Avançar já
        </button>
      )}

      {done && (
        <div className="surface-card rounded-card p-4 text-center">
          {rated ? (
            <p className="text-body font-semibold text-ink dark:text-white">
              Avaliação registada (só neste ensaio). Obrigado!
            </p>
          ) : (
            <>
              <p className="text-body font-semibold text-ink dark:text-white">Como correu a viagem?</p>
              <div className="mt-2 flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
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
          <p className="mt-3 text-label text-zinc-500 dark:text-zinc-400">
            {km} km · {formatKz(price)} · {kind === 'entrega' ? 'Entrega' : 'Viagem'} DEMO-{String(Math.round(price)).padStart(4, '0')}
          </p>
          <button onClick={onRestart} className="mt-3 h-11 w-full rounded-control border border-zinc-200 text-label font-semibold text-ink dark:border-white/15 dark:text-white">
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
    { label: 'Em viagem', on: step >= 3 },
    { label: 'Fim', on: step >= 5 },
  ];
  return (
    <div className="flex items-start gap-1">
      {marks.map((m, i) => (
        <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-center">
            <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : m.on ? 'bg-purple-600 dark:bg-amber-400' : 'bg-zinc-200 dark:bg-white/15')} />
            {m.on && step >= i
              ? <Check className="h-4 w-4 shrink-0 text-purple-600 dark:text-amber-400" strokeWidth={2.4} />
              : <CircleDot className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />}
            <span className={cn('h-0.5 flex-1', i === marks.length - 1 ? 'bg-transparent' : 'bg-zinc-200 dark:bg-white/15')} />
          </div>
          <span className={cn('text-caption', m.on && step >= i ? 'font-semibold text-ink dark:text-white' : 'text-zinc-500 dark:text-zinc-400')}>
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}
