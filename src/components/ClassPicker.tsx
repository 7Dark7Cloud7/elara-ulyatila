import { CheckIcon } from './ElaraIcons';
import type { VehicleClass } from '../types';
import { VehicleArt, vehicleKindFor, type VehicleKind } from './VehicleArt';
import { formatKz } from '../lib/money';
import { cn } from '../lib/utils';

/** Quanto tempo até o carro chegar, por categoria. É uma estimativa de praça
 *  (2–3 km de despacho ao andamento de Luanda), não um tempo medido na rua —
 *  daí o «≈». Uma Hiace manobra mais devagar do que uma moto. */
const PICKUP_MIN: Record<VehicleKind, number> = {
  moto: 3, sedan: 4, hatch: 4, premium: 5, suv: 5, candongueiro: 6,
  minibus: 6, van: 7, bus: 8, pickup: 7, boxtruck: 8, lorry: 9,
};

interface ClassPickerProps {
  classes: VehicleClass[];
  value: string | null;
  onChange: (classId: string) => void;
  wide?: boolean;
}

export function ClassPicker({ classes, value, onChange, wide }: ClassPickerProps) {
  const selected = classes.find((c) => c.id === value);
  return (
    <div className="space-y-2">
      <div className="h-rail flex gap-2.5 -mx-4 px-4 pb-1" role="group" aria-label="Categorias de veículo">
        {classes.map((c, index) => {
          const active = value === c.id;
          const kind = vehicleKindFor(c.id, c.icon);
          return (
            <button
              key={c.id}
              type="button"
              aria-label={`${c.label}, ${c.per_seat ? `${formatKz(c.base_kz)} por lugar` : `desde ${formatKz(c.min_kz)}`}${c.seats > 0 ? `, ${c.seats} lugares` : ''}, chega em cerca de ${PICKUP_MIN[kind]} minutos`}
              aria-pressed={active}
              onClick={() => onChange(c.id)}
              onKeyDown={(e) => {
                const next = e.key === 'ArrowRight' ? (index + 1) % classes.length
                  : e.key === 'ArrowLeft' ? (index - 1 + classes.length) % classes.length
                  : e.key === 'Home' ? 0 : e.key === 'End' ? classes.length - 1 : null;
                if (next === null) return;
                e.preventDefault();
                onChange(classes[next].id);
                const button = e.currentTarget.parentElement?.children[next] as HTMLButtonElement;
                button.focus({ preventScroll: true });
                button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }}
              className={cn(
                'rail-item shrink-0 rounded-card border overflow-hidden text-left',
                'transition-[background-color,box-shadow,transform,border-color] duration-200 active:scale-[0.97]',
                wide ? 'w-40' : 'w-36',
                active
                  ? 'bg-purple-600 border-purple-600 text-white shadow-card dark:bg-amber-400 dark:border-amber-400 dark:text-ink'
                  : 'bg-white border-zinc-200 text-ink hover:border-purple-300 dark:bg-white/[0.07] dark:border-[rgba(185,168,220,0.3)] dark:text-white dark:hover:border-amber-400/50',
              )}
            >
              <span className={cn(
                'relative flex h-[74px] items-end justify-center overflow-hidden',
                active ? 'bg-purple-700/35 dark:bg-amber-500/25' : 'bg-gradient-to-b from-zinc-100/90 to-zinc-50/70 dark:from-white/[0.08] dark:to-white/[0.02]',
              )}>
                <VehicleArt
                  kind={kind}
                  tone={active ? 'active' : 'idle'}
                  label={c.label}
                  className={cn('w-[118px] h-auto translate-y-[6px]', active && 'animate-drive')}
                />
                <span
                  className={cn(
                    'absolute top-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                    active
                      ? 'bg-white/95 text-purple-700 dark:bg-ink dark:text-amber-300'
                      : 'bg-white/90 text-zinc-700 dark:bg-night/85 dark:text-zinc-200',
                  )}
                >
                  ≈{PICKUP_MIN[kind]} min
                </span>
                {active && (
                  <span className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-purple-700 shadow-hair dark:bg-ink dark:text-amber-400">
                    <CheckIcon className="w-3 h-3" strokeWidth={2.6} />
                  </span>
                )}
              </span>
              <span className="block p-3 pt-2">
                <span className="block min-h-10 text-body font-semibold break-words">{c.label}</span>
                <span className={cn('block text-label font-semibold mt-1', active ? 'text-purple-100 dark:text-ink/85' : 'text-purple-700 dark:text-amber-300')}>
                  {c.per_seat ? `${formatKz(c.base_kz)} / lugar` : `desde ${formatKz(c.min_kz)}`}
                </span>
                {c.seats > 0 && (
                  <span className={cn('block text-caption mt-1', active ? 'text-purple-100/90 dark:text-ink/75' : 'text-zinc-500 dark:text-zinc-400')}>
                    {c.seats} lugares
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {selected?.blurb && (
        <p className="text-label leading-relaxed text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-ink dark:text-zinc-200">{selected.label}: </span>
          {selected.blurb}
        </p>
      )}
    </div>
  );
}
