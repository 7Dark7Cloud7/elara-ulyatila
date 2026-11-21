import { Star } from 'lucide-react';
import { cn } from '../lib/utils';

interface RateStarsProps {
  /** Estrela já dada, quando existe. */
  score?: number | null;
  busy: boolean;
  onPick?: (n: number) => void;
  size?: 'sm' | 'lg';
}

/** As cinco estrelas, dos dois lados do vidro. Sem toque, é só leitura. */
export function RateStars({ score, busy, onPick, size = 'lg' }: RateStarsProps) {
  const star = size === 'lg' ? 'w-9 h-9' : 'w-4 h-4';
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = !!score && n <= score;
        const icon = (
          <Star className={cn(star, 'transition-colors', filled ? 'text-amber-400 fill-amber-400' : 'text-zinc-300 dark:text-zinc-600')} />
        );
        if (!onPick || score) return <span key={n}>{icon}</span>;
        return (
          <button
            key={n}
            onClick={() => onPick(n)}
            disabled={busy}
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            className="tap-pad p-0.5"
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
