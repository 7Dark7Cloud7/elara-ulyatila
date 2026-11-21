import { ClockIcon } from './ElaraIcons';
import type { Trip, TripKind, Zone } from '../types';
import { cn } from '../lib/utils';

export interface RecentDestination {
  zoneId: string;
  name: string;
  count: number;
}

/**
 * Os destinos a que a pessoa já foi, neste tipo de viagem, pelo mais recente
 * primeiro (a lista de viagens chega do servidor ordenada por data).
 *
 * Três regras que só se vêem quando alguém erra: uma viagem cancelada não é
 * um sítio para onde se foi; uma zona que desapareceu da base nunca se oferece
 * como atalho (a fila não inventa nomes); e uma entrega não empresta o destino
 * a uma corrida de passageiros.
 */
export function recentDestinations(
  trips: Trip[], zones: Zone[], kind: TripKind, limit = 6,
): RecentDestination[] {
  const byZone = new Map<string, RecentDestination>();
  for (const t of trips) {
    if (t.kind !== kind || t.state === 'cancelled') continue;
    const z = zones.find((x) => x.id === t.to_zone_id);
    if (!z) continue;
    const seen = byZone.get(z.id);
    if (seen) seen.count += 1;
    else byZone.set(z.id, { zoneId: z.id, name: z.name, count: 1 });
  }
  return [...byZone.values()].slice(0, limit);
}

interface RecentPlacesProps {
  items: RecentDestination[];
  activeZoneId: string | null;
  onPick: (zoneId: string) => void;
}

/**
 * Os destinos a que a pessoa já foi. Não é uma lista para gerir — é o atalho
 * para o que ela faz todas as semanas, e por isso vem da memória da app, sem
 * servidor nem migração: quem nunca andou de Elara não vê fila nenhuma.
 */
export function RecentPlaces({ items, activeZoneId, onPick }: RecentPlacesProps) {
  if (!items.length) return null;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-label font-medium text-zinc-500 dark:text-zinc-400">
        <ClockIcon className="w-3.5 h-3.5" />
        Onde foi da última vez
      </p>
      <div className="h-rail flex gap-2 overflow-x-auto">
        {items.map((r) => {
          const on = r.zoneId === activeZoneId;
          return (
            <button
              key={r.zoneId}
              type="button"
              onClick={() => onPick(r.zoneId)}
              aria-pressed={on}
              className={cn(
                'shrink-0 h-10 rounded-full px-3 flex items-center gap-1.5 border text-[13px] font-semibold',
                'transition-colors active:bg-zinc-100 dark:active:bg-zinc-700',
                on
                  ? 'bg-purple-600 dark:bg-purple-400 border-transparent text-white dark:text-purple-950'
                  : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100',
              )}
            >
              <span className="max-w-[132px] truncate">{r.name}</span>
              {r.count > 1 && (
                <span className={cn('text-[11px] font-bold', on ? 'opacity-80' : 'text-zinc-500 dark:text-zinc-400')}>
                  {r.count}×
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
