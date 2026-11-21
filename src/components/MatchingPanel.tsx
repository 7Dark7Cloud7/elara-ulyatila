import { useEffect, useState } from 'react';
import { ClockIcon, RadioIcon } from './ElaraIcons';
import { cn } from '../lib/utils';

interface MatchingPanelProps {
  /** Momento do pedido, no relógio do servidor (tr_trip.created_at). */
  createdAt: number;
  fromLabel: string;
  classLabel: string;
  kind: 'passageiro' | 'entrega';
  /** Carros online dentro do raio — número real, nunca inventado. */
  cars: number;
  radiusKm: number;
  maxRadiusKm: number;
  canWiden: boolean;
  onWiden: () => void;
  failed: boolean;
  onRetry: () => void;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * O "à procura" dos apps deste género, com uma regra: tudo o que aqui se vê
 * aconteceu mesmo. O cronómetro conta desde o `created_at` que o servidor pôs
 * na viagem, o número de carros vem do `tr_nearby_drivers`, e quando não há
 * carros diz-se que não há — em vez de um spinner bonito a fingir que está
 * quase a aparecer alguém.
 */
export function MatchingPanel({
  createdAt, fromLabel, classLabel, kind, cars, radiusKm, maxRadiusKm,
  canWiden, onWiden, failed, onRetry,
}: MatchingPanelProps) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.round((Date.now() - createdAt) / 1000)));

  useEffect(() => {
    const tick = window.setInterval(
      () => setSeconds(Math.max(0, Math.round((Date.now() - createdAt) / 1000))),
      1000,
    );
    return () => window.clearInterval(tick);
  }, [createdAt]);

  const slow = seconds >= 90;
  const waitLong = seconds >= 20;

  return (
    <div className="rounded-card border border-purple-200 dark:border-amber-400/30 bg-purple-50/80 dark:bg-white/[0.05] p-4">
      <div className="flex items-start gap-3">
        {/* Ícone radar com anéis concêntricos SVG da Elara */}
        <span className="relative flex w-12 h-12 shrink-0 items-center justify-center rounded-control bg-white dark:bg-vault border border-purple-200 dark:border-amber-400/35 overflow-hidden">
          <svg
            viewBox="0 0 48 48"
            className="absolute inset-0 w-full h-full text-purple-500/35 dark:text-amber-400/35"
            aria-hidden="true"
          >
            <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
            <circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" strokeWidth="1.2" className="map-pulse" />
          </svg>
          <RadioIcon className="relative w-5 h-5 text-purple-600 dark:text-amber-400" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink dark:text-white leading-tight">
            {kind === 'entrega' ? 'À procura de quem leve a encomenda' : 'À procura de motorista'}
          </p>
          <p className="text-label text-zinc-600 dark:text-zinc-300 mt-0.5 tabular-nums">
            {clock(seconds)}
            {' · '}
            {failed
              ? 'sem conseguir ver os carros'
              : cars === 0
                ? `ainda nenhum carro online a ${radiusKm} km de ${fromLabel}`
                : `${cars} ${cars === 1 ? 'carro online' : 'carros online'} a ${radiusKm} km`}
          </p>
          <p className="text-caption text-zinc-500 dark:text-zinc-400 mt-1">
            {classLabel} · quem aceitar aparece aqui e o carro começa a mexer-se no mapa.
          </p>
        </div>
      </div>

      {!failed && (
        <div className="mt-3 h-1.5 rounded-full bg-purple-200/70 dark:bg-white/10 overflow-hidden">
          {/* Encolhe exactamente durante o tempo que falta para a espera longa:
              o que se vê é o relógio, não um spinner a fingir trabalho. */}
          <span
            className="block h-full w-full origin-left rounded-full bg-purple-600 dark:bg-amber-400 animate-timer"
            style={{ animationDuration: `${Math.max(4, 90 - seconds)}s` }}
          />
        </div>
      )}

      {failed && (
        <button
          onClick={onRetry}
          className="surface-outline mt-3 w-full h-11 rounded-control font-semibold text-label text-purple-700 dark:text-amber-300 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <ClockIcon className="w-4 h-4" /> Tentar ver os carros de novo
        </button>
      )}

      {!failed && canWiden && waitLong && (
        <button
          onClick={onWiden}
          className={cn(
            'surface-outline mt-3 w-full h-11 rounded-control font-semibold text-label flex items-center justify-center gap-2',
            'text-purple-700 dark:text-amber-300 active:scale-[0.98] transition-transform',
          )}
        >
          <RadioIcon className="w-4 h-4" />
          Alargar a procura até {maxRadiusKm} km
        </button>
      )}

      {slow && !failed && (
        <div className="surface-card mt-3 rounded-card p-3.5">
          <p className="text-label font-semibold text-ink dark:text-white">Já espera há {clock(seconds)}</p>
          <p className="text-caption text-zinc-600 dark:text-zinc-300 mt-1">
            Nesta hora há poucos motoristas nessa zona. Enquanto espera, pode:
          </p>
          <ul className="mt-2 space-y-1 text-caption text-zinc-600 dark:text-zinc-300">
            <li>· alargar a procura, se ainda não alargou;</li>
            <li>· mudar o ponto de partida para uma paragem maior ({fromLabel} tem outras perto);</li>
            <li>· pedir táxi ou Hiace, que vão quase sempre cheios e custam menos;</li>
            <li>· cancelar abaixo, sem taxa enquanto ninguém aceitou, e tentar mais tarde.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
