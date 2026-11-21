import { RepeatIcon, SpinnerIcon } from './ElaraIcons';
import type { Quote } from '../types';
import { formatKz } from '../lib/money';
import { cn } from '../lib/utils';

interface QuoteCardProps {
  quote: Quote | null;
  quoting: boolean;
  /** Sem cartões dentro do painel do mapa: o preço é uma faixa, não uma caixa. */
  flush?: boolean;
  /** O que o preço não cobre — dito antes do pedido, nunca depois. */
  note?: string | null;
  failed?: boolean;
  onRetry?: () => void;
  /** Partilha: quanto põe cada pessoa. O preço é do carro inteiro. */
  each?: { count: number; amountKz: number } | null;
}

/**
 * O orçamento linha a linha, exactamente como o servidor o calculou. Mostrar de
 * onde vem o número é o que faz a pessoa confiar no preço em Angola.
 */
export function QuoteCard({ quote, quoting, flush, note, failed, onRetry, each }: QuoteCardProps) {
  return (
    <div
      className={cn(
        !flush && 'surface-card rounded-card p-4',
      )}
    >
      <p className="text-label font-medium text-zinc-500 dark:text-zinc-400">
        O seu preço — fechado agora, não muda no fim
      </p>

      {quoting && (
        <p className="mt-2 flex items-center gap-2 text-body text-zinc-500 dark:text-zinc-400">
          <SpinnerIcon className="w-4 h-4 animate-spin text-purple-600 dark:text-amber-400" /> a calcular…
        </p>
      )}

      {!quoting && failed && (
        <div className="mt-2">
          <p className="text-body text-amber-800 dark:text-amber-200">
            Não foi possível calcular o preço. Verifique a ligação e tente de novo.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 min-h-11 px-3.5 rounded-control inline-flex items-center gap-2 text-body font-semibold bg-purple-100 text-purple-700 active:bg-purple-200 dark:bg-amber-400/15 dark:text-amber-300"
            >
              <RepeatIcon className="w-4 h-4" /> Calcular novamente
            </button>
          )}
        </div>
      )}

      {!quoting && !quote && !failed && (
        <p className="mt-2 text-body text-zinc-500 dark:text-zinc-400">
          Escolha a partida, o destino e a categoria.
        </p>
      )}

      {!quoting && quote && (
        <>
          <div className="mt-2.5 space-y-1.5">
            {quote.lines.map((l) => (
              <div key={l.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-zinc-500 dark:text-zinc-400">{l.label}</span>
                <span className="font-semibold text-ink dark:text-zinc-200">{formatKz(l.amountKz)}</span>
              </div>
            ))}
            <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-zinc-200 pt-2.5 dark:border-[rgba(185,168,220,0.22)]">
              <span className="text-body font-semibold text-ink dark:text-white">Total</span>
              <span className="font-display text-lead font-semibold tracking-tight text-purple-700 dark:text-amber-400">
                {formatKz(quote.priceKz)}
              </span>
            </div>
            {each && (
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <span className="text-label font-medium text-zinc-600 dark:text-zinc-300">Cada um põe</span>
                <span className="text-body font-semibold text-purple-700 dark:text-amber-300">
                  {formatKz(each.amountKz)} × {each.count}
                </span>
              </div>
            )}
          </div>
          <p className="mt-2 text-caption text-zinc-500 dark:text-zinc-400">
            {quote.distanceKm} km · cerca de {quote.etaMin} min · o motorista fica com {formatKz(quote.driverKeepsKz)}
          </p>
          {note && (
            <p className="mt-2 text-label font-medium leading-snug text-amber-800 dark:text-amber-300">
              {note}
            </p>
          )}
        </>
      )}
    </div>
  );
}
