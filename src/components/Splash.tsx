import { useEffect, useState } from 'react';
import { reduceMotion } from '../lib/alerts';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/utils';
import { ElaraCarMark } from './ElaraCarMark';

interface SplashProps {
  onDone: () => void;
}

/**
 * A primeira coisa que a app diz: a marca, uma linha e mais nada. Fica o tempo
 * de uma respiração — não é um ecrã de espera, é uma assinatura. Uma vez por
 * sessão, e nunca para quem pediu menos movimento.
 */
export function Splash({ onDone }: SplashProps) {
  const dark = useTheme();
  const [leaving, setLeaving] = useState(false);
  const still = reduceMotion();

  useEffect(() => {
    const hold = still ? 400 : 1050;
    const out = window.setTimeout(() => setLeaving(true), hold);
    const done = window.setTimeout(onDone, hold + (still ? 0 : 320));
    return () => { window.clearTimeout(out); window.clearTimeout(done); };
  }, [onDone, still]);

  return (
    <div
      role="status"
      aria-label="A abrir a Elara Ulyatila"
      className={cn(
        'fixed inset-0 z-[80] grid place-items-center overflow-hidden bg-cream dark:bg-night',
        'transition-opacity duration-300',
        leaving && 'pointer-events-none opacity-0',
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-purple-300/30 blur-3xl dark:bg-amber-400/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-purple-400/20 blur-3xl dark:bg-purple-600/25" />

      <div className="relative px-8 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] bg-white/80 p-2.5 shadow-card ring-1 ring-black/5 dark:bg-white/[0.06] dark:ring-white/15">
          <ElaraCarMark dark={dark} />
        </div>
        <p className="mt-6 text-[11px] font-semibold tracking-[0.42em] text-purple-700 dark:text-amber-400">
          ELARA
        </p>
        <h1 className="mt-1 font-display text-display text-ink dark:text-white">
          Ulyatila
        </h1>
        <p className="mt-3 text-body text-zinc-500 dark:text-[#B9A8DC]">
          Os melhores preços, o caminho.
        </p>
        <div className="mx-auto mt-7 h-0.5 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
          <span className={cn('block h-full w-1/2 rounded-full bg-purple-600 dark:bg-amber-400', !still && 'animate-splash')} />
        </div>
      </div>
    </div>
  );
}
