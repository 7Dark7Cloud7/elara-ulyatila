import type { ReactNode } from 'react';
import {
  CarFrontIcon, ChevronUpIcon, LocateIcon, NavigationIcon, PinIcon, RefreshIcon, SpinnerIcon,
} from './ElaraIcons';
import { cn, meters, minutesAgo } from '../lib/utils';
import { formatKz } from '../lib/money';
import type { GpsStatus, NearbyCar } from '../lib/geo';

/** Cartão de vidro que flutua por cima do mapa. */
export function FloatPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mx-auto w-fit max-w-[94%] rounded-control px-3.5 py-2 shadow-card backdrop-blur-xl',
        'bg-white/95 dark:bg-vault/95 border border-zinc-200/80 dark:border-white/15',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface NearbyPillProps {
  cars: NearbyCar[];
  gps: GpsStatus;
  loading: boolean;
  failed: boolean;
  onAskGps: () => void;
  onRetry: () => void;
}

/**
 * A frase mais delicada do ecrã: dizer quantos carros há sem inventar. Quando
 * não há nenhum, diz que não há nenhum — é essa honestidade que distingue a
 * Elara de um app que mostra 12 carros que não existem.
 */
export function NearbyPill({ cars, gps, loading, failed, onAskGps, onRetry }: NearbyPillProps) {
  const nearest = cars.length ? Math.min(...cars.map((c) => Number(c.distance_km))) : null;

  if (gps === 'asking') {
    return (
      <FloatPill>
        <span className="flex items-center gap-2 text-[13px] font-bold text-zinc-600 dark:text-zinc-300">
          <SpinnerIcon className="w-4 h-4 animate-spin text-purple-600" /> A procurar a sua posição…
        </span>
      </FloatPill>
    );
  }

  if (gps === 'denied') {
    return (
      <FloatPill>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-zinc-600 dark:text-zinc-300">
            Não sabemos onde está — escolha a zona de partida
          </span>
          <button
            type="button"
            onClick={onAskGps}
            className="text-[12px] font-semibold text-purple-600 dark:text-purple-400 tap-pad"
          >
            Tentar de novo
          </button>
        </div>
      </FloatPill>
    );
  }

  if (failed) {
    return (
      <FloatPill>
        <span className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-zinc-600 dark:text-zinc-300">
            Não foi possível ver os carros agora
          </span>
          <button type="button" onClick={onRetry} className="text-[12px] font-semibold text-purple-600 dark:text-purple-400 tap-pad">
            Tentar de novo
          </button>
        </span>
      </FloatPill>
    );
  }

  if (cars.length === 0) {
    return (
      <FloatPill>
        <span className="flex items-center gap-2 text-[13px] font-bold text-zinc-600 dark:text-zinc-300">
          <CarFrontIcon className="w-4 h-4 text-zinc-400" />
          {loading ? 'A procurar carros…' : 'Ainda sem motoristas ligados por aqui'}
        </span>
      </FloatPill>
    );
  }

  return (
    <FloatPill>
      <span className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-white">
        <span className="relative flex w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-purple-500 map-pulse" />
          <span className="relative w-2 h-2 rounded-full bg-purple-600 dark:bg-purple-400" />
        </span>
        {cars.length === 1 ? '1 motorista' : `${cars.length} motoristas`}
        <span className="font-bold text-zinc-500 dark:text-zinc-400">
          perto de si{nearest !== null ? ` — o mais próximo a ${nearest < 1 ? `${Math.round(nearest * 1000)} m` : `${nearest.toFixed(1)} km`}` : ''}
        </span>
      </span>
    </FloatPill>
  );
}

/**
 * O botão que promete «o meu ponto». Prometer e não fazer é o que faz uma
 * pessoa desistir de um app: por isso ele diz o que está a acontecer — a
 * procurar, sem permissão, sem GPS — e dá um anel quando a posição chega.
 */
export function LocateFab({
  onClick, gps = 'idle', justFixed, className,
}: {
  onClick: () => void;
  gps?: GpsStatus;
  justFixed?: boolean;
  className?: string;
}) {
  const broken = gps === 'denied' || gps === 'unavailable';
  const label =
    gps === 'asking' ? 'A procurar a sua posição…'
      : gps === 'denied' ? 'Sem permissão de localização — toque para tentar de novo'
        : gps === 'unavailable' ? 'Este aparelho não deu localização — toque para tentar'
          : 'Ver o meu ponto no mapa';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'w-11 h-11 rounded-control flex items-center justify-center shadow-card border transition-transform active:scale-90',
        'bg-white/95 dark:bg-vault/95 backdrop-blur-xl',
        broken
          ? 'border-amber-400 text-amber-600 dark:text-amber-400'
          : 'border-zinc-200 dark:border-white/15 text-purple-600 dark:text-amber-400',
        justFixed && 'animate-fix',
        className,
      )}
    >
      {gps === 'asking' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <LocateIcon className="w-5 h-5" />}
    </button>
  );
}

interface RoutePeekProps {
  /** A partida em palavras. `null` é a pessoa ainda não a ter escolhido. */
  from: string | null;
  to: string | null;
  /** A viagem já existe: o nome da fase, dito aqui e não só na pílula de cima. */
  status?: string | null;
  /** O que está escolhido além da rota — categoria, lugares, tipo de carga. */
  detail?: string | null;
  /** O preço já calculado. Sem preço não se inventa um número: a linha de
   *  baixo do rodapé já diz o que falta. */
  priceKz?: number | null;
  onOpen: () => void;
}

/**
 * O que fica na folha quando ela está fechada.
 *
 * Fechar a folha é o gesto de quem quer ver o mapa, não de quem quer perder a
 * rota de vista. Até aqui, meio cartão cortado ficava a mostrar o título e
 * nada do que a pessoa escolheu — e o preço só aparecia no botão. Aqui ficam
 * as três palavras que importam: de onde, para onde, quanto.
 */
export function RoutePeek({ from, to, status, detail, priceKz, onOpen }: RoutePeekProps) {
  const names = [from ?? 'escolher partida', to ?? 'escolher destino'].join(', ');
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      aria-label={`Abrir o painel: ${names}`}
      className={cn(
        'w-full rounded-card border bg-white dark:bg-white/[0.06] px-3.5 py-3 text-left',
        'border-zinc-200 dark:border-[rgba(185,168,220,0.3)]',
        'transition-colors active:bg-zinc-50 dark:active:bg-white/[0.1]',
      )}
    >
      <span className="flex items-start gap-3">
        {/* As mesmas formas do mapa e do formulário: círculo violeta onde se
            entra, quadrado dourado onde se sai. */}
        <span aria-hidden="true" className="mt-1 flex shrink-0 flex-col items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-purple-500 ring-2 ring-white/70 dark:bg-purple-400 dark:ring-white/20" />
          <span className="h-3 w-px bg-zinc-300 dark:bg-white/25" />
          <span className="h-2.5 w-2.5 rounded-[3px] bg-ink dark:bg-amber-400" />
        </span>

        <span className="min-w-0 flex-1">
          <span className={cn(
            'block truncate text-control font-semibold',
            from ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400',
          )}>{from ?? 'Escolher partida'}</span>
          <span className={cn(
            'block truncate text-control font-semibold',
            to ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400',
          )}>{to ?? 'Escolher destino'}</span>
        </span>

        {typeof priceKz === 'number' && (
          <span className="shrink-0 pt-0.5 text-right">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {status ? 'Total' : 'Preço'}
            </span>
            <span className="block text-lead font-bold tracking-tight text-purple-700 dark:text-amber-300">
              {formatKz(priceKz)}
            </span>
          </span>
        )}
      </span>

      {(status || detail) && (
        <p className="mt-2 flex items-baseline gap-2 border-t border-zinc-100 pt-2 text-label dark:border-white/10">
          {status && <span className="font-semibold text-zinc-900 dark:text-white">{status}</span>}
          {detail && <span className="min-w-0 flex-1 truncate text-zinc-500 dark:text-zinc-400">{detail}</span>}
        </p>
      )}

      <span className="mt-2 flex items-center justify-center gap-1 text-label font-semibold text-purple-700 dark:text-amber-300">
        <ChevronUpIcon className="w-3.5 h-3.5 shrink-0" />
        {status ? 'Abrir a viagem' : from && to ? 'Tocar para mudar' : 'Tocar para escolher'}
      </span>
    </button>
  );
}

interface WhereAmIProps {
  /** O nome que o índice dá à posição: o ponto fino, o bairro ou a paragem. */
  title: string;
  /** A segunda palavra — o bairro por baixo do ponto, a zona por baixo do bairro. */
  detail: string | null;
  /** Precisão anunciada pelo aparelho, em metros. */
  accuracy: number | null;
  /** Instante da leitura. Um ponto de há 10 minutos não pode fingir que é agora. */
  updatedAt: number | null;
  /** O nome veio da equipa, não do mapa — diz-se, não se disfarça. */
  viaTeam?: boolean;
  justFixed?: boolean;
  onRecenter: () => void;
  /** A única acção que faz sentido agora: mudar a partida, ou marcar o embarque.
   *  O `kind` diz ao ecrã se esta linha substitui outra. */
  action?: { kind: 'move' | 'use'; label: string; onClick: () => void } | null;
}

/**
 * A resposta ao «mostrar a minha localização»: um nome. Sem esta linha o toque
 * só mexia na câmara, e a pessoa continuava a ver o bairro antigo no formulário
 * — que é exactamente o que a faz desistir do GPS.
 */
export function WhereAmI({
  title, detail, accuracy, updatedAt, viaTeam, justFixed, onRecenter, action,
}: WhereAmIProps) {
  const ageMs = updatedAt == null ? null : Date.now() - updatedAt;
  const stale = ageMs !== null && ageMs >= 180000;
  return (
    <div
      className={cn(
        'surface-card rounded-card px-3.5 py-3 transition-colors',
        justFixed && 'border-purple-400 dark:border-amber-400 animate-fix',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex w-2.5 h-2.5 shrink-0">
          <span className="absolute inset-0 rounded-full bg-purple-500 dark:bg-amber-400 map-pulse" />
          <span className="relative w-2.5 h-2.5 rounded-full bg-purple-600 dark:bg-amber-400" />
        </span>
        <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Onde está agora
        </span>
        <button
          type="button"
          onClick={onRecenter}
          className="tap-pad ml-auto flex shrink-0 items-center gap-1 text-caption font-semibold text-purple-600 dark:text-amber-400"
        >
          <RefreshIcon className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      <p className="mt-1.5 flex min-w-0 items-baseline gap-1.5">
        <span title={title} className="truncate text-[15px] font-semibold tracking-tight text-ink dark:text-white">{title}</span>
        {detail && (
          <span title={detail} className="min-w-0 truncate text-caption font-medium text-zinc-500 dark:text-zinc-400">{detail}</span>
        )}
      </p>

      <p className="mt-0.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
        {accuracy !== null
          ? `Precisão do aparelho: cerca de ${meters(accuracy)}`
          : 'Este aparelho não diz a precisão da leitura'}
        {stale && updatedAt !== null && ` · leitura ${minutesAgo(updatedAt)}`}
      </p>

      {viaTeam && (
        <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          Nome dito pela equipa Elara, não pelo mapa.
        </p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            'tap-pad mt-2 h-10 w-full rounded-xl border flex items-center justify-center gap-1.5',
            action.kind === 'move'
              ? 'bg-amber-100 dark:bg-amber-900/35 border-amber-300 dark:border-amber-700/70 text-amber-800 dark:text-amber-200'
              : 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-200',
            'text-[12px] font-bold transition-transform active:scale-[0.98]',
          )}
        >
          {action.kind === 'move'
            ? <NavigationIcon className="w-3.5 h-3.5 shrink-0" />
            : <PinIcon className="w-3.5 h-3.5 shrink-0" />}
          <span title={action.label} className="truncate">{action.label}</span>
        </button>
      )}
    </div>
  );
}
