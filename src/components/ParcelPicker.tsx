import { Check } from 'lucide-react';
import type { DeliveryClass } from '../types';
import { ParcelSizeArt, parcelLevelFor } from './ParcelSizeArt';
import { VehicleArt, vehicleKindFor } from './VehicleArt';
import { formatKz } from '../lib/money';
import { cn } from '../lib/utils';

/** Quem leva a encomenda. O tamanho diz o quanto; isto diz o como. */
const CARRIER: Record<string, string> = {
  moto: 'Moto',
  economico: 'Carro',
  carga: 'Carrinha',
  picape: 'Picape',
  canter: 'Canter',
  camiao: 'Camião',
};

interface ParcelPickerProps {
  classes: DeliveryClass[];
  value: string;
  onChange: (id: string) => void;
  /**
   * Mudança: o que se escolhe ali é o veículo que carrega (picape, canter,
   * camião), não o tamanho da caixa — por isso a arte é a do veículo.
   */
  vehicles?: boolean;
}

/**
 * A fila de tamanhos de encomenda, irmã da `ClassPicker`.
 *
 * As duas partilham a mesma prancha (cartão de 144 px, palco de 72 px, arte
 * apoiada no chão), para que a pessoa reconheça «escolher uma opção» sem
 * reparar que são ficheiros diferentes. O que muda é o desenho: aqui é a
 * encomenda — envelope, caixa, dois volumes — porque é isso que se está a
 * escolher; na mudança, o veículo, porque é ele que vai à porta.
 *
 * O tamanho vem do id (`parcelLevelFor`) e não da posição na fila: acrescentar
 * uma categoria no servidor não muda o desenho das outras.
 */
export function ParcelPicker({ classes, value, onChange, vehicles }: ParcelPickerProps) {
  return (
    <div className="h-rail flex gap-2.5 -mx-4 px-4 pb-1" role="group" aria-label="Tipo de carga">
      {classes.map((d, index) => {
        const active = value === d.id;
        return (
          <button
            key={d.id}
            type="button"
            aria-label={`${d.label}, ${d.example}, base ${formatKz(d.base_kz)}`}
            aria-pressed={active}
            onClick={() => onChange(d.id)}
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
              'rail-item shrink-0 w-36 rounded-card border overflow-hidden text-left',
              'transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.97]',
              active
                ? 'bg-purple-600 border-purple-600 text-white shadow-card dark:bg-amber-400 dark:border-amber-400 dark:text-ink'
                : 'bg-white dark:bg-white/[0.07] border-zinc-200 dark:border-[rgba(185,168,220,0.3)] text-zinc-800 dark:text-white',
            )}
          >
            <span className={cn(
              'relative flex h-[72px] items-end justify-center overflow-hidden',
              active ? 'bg-purple-700/30 dark:bg-amber-500/25' : 'bg-zinc-100 dark:bg-white/[0.04]',
            )}>
              {vehicles ? (
                <VehicleArt
                  kind={vehicleKindFor(d.class_id)}
                  tone={active ? 'active' : 'idle'}
                  label={d.label}
                  className={cn('w-[116px] h-auto translate-y-[6px]', active && 'animate-drive')}
                />
              ) : (
                <ParcelSizeArt
                  level={parcelLevelFor(d.id)}
                  tone={active ? 'active' : 'idle'}
                  label={d.label}
                  className={cn('h-[58px] w-auto translate-y-[6px]', active && 'animate-drive')}
                />
              )}
              {!vehicles && CARRIER[d.class_id] && (
                <span
                  className={cn(
                    'absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold',
                    active
                      ? 'bg-white text-purple-700 dark:bg-ink dark:text-amber-400'
                      : 'bg-white/90 text-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200',
                  )}
                >
                  {CARRIER[d.class_id]}
                </span>
              )}
              {active && (
                <span className="absolute top-2 right-2 rounded-full bg-white p-1 text-purple-700 dark:bg-ink dark:text-amber-400">
                  <Check className="w-3 h-3" aria-hidden="true" />
                </span>
              )}
            </span>
            <span className="block p-3 pt-2">
              <span className="block min-h-10 text-body font-semibold break-words">{d.label}</span>
              <span className={cn(
                'mt-1 block min-h-8 line-clamp-2 text-label leading-snug',
                active ? 'text-purple-100 dark:text-ink/80' : 'text-zinc-500 dark:text-zinc-400',
              )}>
                {d.example}
              </span>
              <span className={cn('mt-1 block text-[12px] font-semibold', active ? 'text-white dark:text-ink' : 'text-purple-600 dark:text-amber-400')}>
                base {formatKz(d.base_kz)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
