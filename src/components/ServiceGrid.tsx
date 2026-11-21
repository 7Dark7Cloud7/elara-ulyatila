import { useState } from 'react';
import { CheckIcon } from './ElaraIcons';
import { cn } from '../lib/utils';
import { ServiceArt, type ServiceArtId } from './ServiceArt';

/** Os seis serviços da porta principal. */
export type Service = 'carro' | 'moto' | 'partilha' | 'entrega' | 'mudanca';

export const SERVICE_HINT: Record<Service, string> = {
  carro: 'Carro fechado só para si. O preço fecha antes do pedido.',
  moto: 'Moto com capacete extra. O mais rápido no trânsito.',
  partilha: 'Um carro, várias pessoas que vão para o mesmo lado. O preço é do carro inteiro — dividem entre vocês.',
  entrega: 'De um documento a uma caixa. Quem recebe mostra o código.',
  mudanca: 'Canter, camião ou carro de recolha para mudar de casa ou escritório.',
};

interface ServiceGridProps {
  /** `null` no ecrã sem sessão: nenhuma porta está escolhida. */
  value: Service | null;
  onPick: (service: Service) => void;
  /** Alugar não é um tipo de viagem: abre a sala do aluguer. */
  onRent: () => void;
}

const TILES: Array<{ id: Service | 'alugar'; label: string; art: ServiceArtId; micro: string }> = [
  { id: 'carro', label: 'Viagens', art: 'carro', micro: 'Carro só para si' },
  { id: 'moto', label: 'Moto', art: 'moto', micro: 'O mais rápido' },
  { id: 'partilha', label: 'Partilhar', art: 'partilha', micro: 'Dividir o carro' },
  { id: 'entrega', label: 'Entrega', art: 'entrega', micro: 'Enviar uma caixa' },
  { id: 'mudanca', label: 'Mudanças', art: 'mudanca', micro: 'Carga e mobília' },
  { id: 'alugar', label: 'Alugar', art: 'alugar', micro: 'Carro por dias' },
];

/**
 * Seis portas em duas colunas com ilustrações 3D de estúdio (vestidas na paleta
 * Elara: branco pérola, roxo real e ouro champanhe) e fallback vectorial
 * automático em `ServiceArt` caso uma imagem não carregue.
 */
export function ServiceGrid({ value, onPick, onRent }: ServiceGridProps) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  return (
    <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Serviços">
      {TILES.map(({ id, label, art, micro }) => {
        const active = id === value;
        const useVector = !!failed[art];
        return (
          <button
            key={id}
            type="button"
            aria-pressed={id === 'alugar' ? undefined : active}
            onClick={() => (id === 'alugar' ? onRent() : onPick(id))}
            className={cn(
              'group relative flex min-h-[134px] flex-col rounded-card border p-2 text-left',
              'transition-all duration-200 active:scale-[0.98]',
              active
                ? 'border-purple-500 bg-gradient-to-br from-purple-100 to-purple-50 shadow-float ring-2 ring-purple-500/25 dark:border-amber-400/70 dark:from-amber-400/[0.16] dark:to-amber-400/[0.04] dark:ring-amber-400/25'
                : 'border-zinc-200 bg-white hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-card dark:border-[rgba(185,168,220,0.28)] dark:bg-white/[0.05] dark:hover:border-amber-400/50',
            )}
          >
            <span
              className={cn(
                'service-stage relative flex h-[78px] w-full items-center justify-center overflow-hidden rounded-[14px] px-1.5',
                active
                  ? 'bg-white/90 dark:bg-white/[0.11]'
                  : 'bg-gradient-to-b from-zinc-100/90 to-zinc-50/70 dark:from-white/[0.09] dark:to-white/[0.03]',
              )}
            >
              {useVector ? (
                <ServiceArt
                  id={art}
                  className="relative z-10 h-[66px] w-auto max-w-full transition-transform duration-200 group-hover:scale-[1.06] group-active:scale-95"
                />
              ) : (
                <img
                  src={`/icons-3d/${art}.png`}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  onError={() => setFailed((prev) => ({ ...prev, [art]: true }))}
                  className="relative z-10 h-[72px] w-auto max-w-full object-contain drop-shadow-[0_6px_10px_rgba(20,8,38,0.18)] transition-transform duration-200 group-hover:scale-[1.06] group-active:scale-95"
                />
              )}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-purple-600 text-white shadow-hair dark:bg-amber-400 dark:text-ink"
                >
                  <CheckIcon className="h-3 w-3" strokeWidth={2.6} />
                </span>
              )}
            </span>
            <span
              className={cn(
                'mt-2 px-0.5 truncate text-[13.5px] font-semibold leading-tight',
                active ? 'text-purple-900 dark:text-amber-200' : 'text-ink dark:text-white',
              )}
            >
              {label}
            </span>
            <span
              className={cn(
                'mt-0.5 px-0.5 truncate text-[11px] leading-tight',
                active ? 'text-purple-800/80 dark:text-amber-100/80' : 'text-zinc-500 dark:text-zinc-400',
              )}
            >
              {micro}
            </span>
          </button>
        );
      })}
    </div>
  );
}
