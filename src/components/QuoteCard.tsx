import { Loader2, RotateCcw } from 'lucide-react';
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
 * O orçamento linha a linha, exatamente como o servidor o calculou. Mostrar de
 * onde vem o número é o que faz a pessoa confiar no preço em Angola.
 */
export function QuoteCard({ quote, quoting, flush, note, failed, onRetry, each }: QuoteCardProps) {
  return (
    <div className={cn(
      !flush && 'rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-5 shadow-sm',
    )}>
      <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
        O seu preço — fechado agora, não muda no fim
      </p>

      {quoting && (
        <p className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mt-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> a calcular…
        </p>
      )}

      {!quoting && failed && (
        <div className="mt-2">
          <p className="text-body text-amber-800 dark:text-amber-200">Não foi possível calcular o preço. Verifique a ligação e tente de novo.</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 min-h-11 px-3 rounded-control inline-flex items-center gap-2 text-body font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 active:bg-purple-200 dark:active:bg-purple-900"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" /> Calcular novamente
            </button>
          )}
        </div>
      )}

      {!quoting && !quote && !failed && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
          Escolha a partida, o destino e a categoria.
        </p>
      )}

      {!quoting && quote && (
        <>
          <div className="mt-2 space-y-1">
            {quote.lines.map((l) => (
              <div key={l.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-zinc-500 dark:text-zinc-400">{l.label}</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{formatKz(l.amountKz)}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-zinc-100 dark:border-zinc-800">
              <span className="font-bold text-zinc-900 dark:text-white">Total</span>
              <span className="font-bold tracking-tight text-xl text-purple-600 dark:text-purple-400">{formatKz(quote.priceKz)}</span>
            </div>
            {each && (
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <span className="text-label font-medium text-zinc-600 dark:text-zinc-300">Cada um põe</span>
                <span className="text-body font-bold text-purple-700 dark:text-amber-300">
                  {formatKz(each.amountKz)} × {each.count}
                </span>
              </div>
            )}
          </div>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1.5">
            {quote.distanceKm} km · cerca de {quote.etaMin} min · o motorista fica com {formatKz(quote.driverKeepsKz)}
          </p>
          {note && (
            <p className="text-[12px] font-medium text-amber-800 dark:text-amber-400 mt-2 leading-snug">
              {note}
            </p>
          )}
        </>
      )}
    </div>
  );
}
