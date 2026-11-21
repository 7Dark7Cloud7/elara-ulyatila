import { SignalLow, WifiOff } from 'lucide-react';
import { setPref, usePrefs } from '../lib/alerts';
import { useNet } from '../lib/netinfo';
import { cn } from '../lib/utils';

const MSG = {
  offline: 'Sem ligação. A app continua a tentar sozinha — '
    + 'assim que voltar, as suas viagens aparecem.',
  // Não se afirma «vamos poupar» antes de a pessoa aceitar: é uma oferta,
  // não o estado actual da app.
  slow: 'Ligação fraca (2G). Podemos abrandar as pesquisas à volta.',
};

/**
 * A faixa que diz o que a rede está a fazer. Não é um diálogo do browser e não
 * promete o que não pode cumprir: quando está «sem ligação», a app continua a
 * tentar sozinha, e é isso que aqui se diz.
 */
export function NetBanner() {
  const { online, slow } = useNet();
  const prefs = usePrefs();

  if (online && !(slow && !prefs.lowData)) return null;

  const semLigacao = !online;
  // No PC a faixa é uma tira do tamanho do ecrã: por cima de um mapa que ocupa
  // a largura toda, uma coluna de 512 px a fluturar no meio ler-se-ia como um
  // cartão solto, não como o estado da ligação.
  return (
    <div className="max-w-lg mx-auto px-4 pt-3 lg:max-w-none lg:px-8">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'animate-enter flex items-start gap-3 rounded-2xl border p-3 shadow-float',
          semLigacao
            ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900'
            : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700',
        )}
      >
        {semLigacao
          ? <WifiOff className="w-4 h-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
          : <SignalLow className="w-4 h-4 mt-0.5 shrink-0 text-purple-600 dark:text-purple-400" />}

        <p className={cn(
          'flex-1 text-[12px] font-medium leading-relaxed',
          semLigacao ? 'text-red-800 dark:text-red-200' : 'text-zinc-600 dark:text-zinc-300',
        )}>
          {semLigacao ? MSG.offline : MSG.slow}
        </p>

        {!semLigacao && (
          <button
            onClick={() => setPref('lowData', true)}
            className="shrink-0 h-11 px-4 rounded-xl bg-purple-50 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800 text-[13px] font-bold text-purple-700 dark:text-purple-300 active:scale-95 transition self-center"
          >
            Poupar dados
          </button>
        )}
      </div>
    </div>
  );
}
