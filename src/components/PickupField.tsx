import { Loader2, MapPin, X } from 'lucide-react';
import type { Pickup, Zone } from '../types';
import type { LatLon } from '../lib/geo';
import { distanceText } from '../lib/geo';
import { nameAt } from '../lib/places';
import { cn } from '../lib/utils';

interface PickupFieldProps {
  pickup: Pickup | null;
  /** A pessoa tocou em marcar: o próximo toque no mapa é o ponto. */
  picking: boolean;
  /** A gravar no servidor (viagem já criada). */
  busy?: boolean;
  /** De onde se mede a distância («a 300 m de si»). */
  at?: LatLon | null;
  /** A zona escolhida, para a frase por omissão não ser vaga. */
  zoneName?: string | null;
  /** Bairros conhecidos, para dizer em qual caiu o pin. */
  zones?: Zone[];
  onAskPick: () => void;
  onNote?: (note: string) => void;
  /** A nota escreve-se devagar e grava-se de uma vez: cada tecla não é um pedido ao servidor. */
  onNoteDone?: () => void;
  /** Um toque no nome que a app reconheceu: substitui a referência e grava. */
  onName?: (name: string) => void;
  onClear?: () => void;
}

/**
 * O ponto exacto onde a pessoa quer ser apanhada.
 *
 * As zonas são centróides: servem para o preço e para a rota, mas ninguém é
 * apanhado no meio do bairro. Um toque no mapa e uma linha de referência
 * («portão azul, ao lado da farmácia») é o que faz o motorista chegar à porta.
 */
export function PickupField({ pickup, picking, busy, at, zoneName, zones, onAskPick, onNote, onNoteDone, onName, onClear }: PickupFieldProps) {
  const near = pickup && at ? distanceText(at, pickup) : null;
  const where = pickup && zones?.length ? nameAt(pickup.lat, pickup.lon, zones) : null;
  const metros = (m: number): string => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
  const point = where?.place ?? null;
  const bairro = where?.bairro ?? null;
  // Primeiro o ponto fino (a loja, a avenida, o mercado); se o pin caiu no
  // meio do bairro sem nada nomeado a 700 m, é o bairro que se diz — e com a
  // distância, porque um nome sem distância é uma adivinhação.
  const named = point ?? bairro ?? where?.zone ?? null;
  const tail = !where
    ? ''
    : point
      ? (bairro && bairro !== point ? `· ${bairro}` : `· ${where.zone}`)
      : bairro
        ? `· a ${metros(where.bairroMetres)} · ${where.zone}`
        : `· a ${metros(where.metres)} da paragem`;
  const note = pickup?.note?.trim() ?? '';

  return (
    <div
      className={cn(
        'rounded-2xl border transition-colors',
        picking
          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400'
          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700',
      )}
    >
      <button
        type="button"
        onClick={onAskPick}
        aria-pressed={picking}
        className="w-full text-left p-3 flex items-center gap-3"
      >
        <MapPin className={cn('w-5 h-5 shrink-0', pickup ? 'text-amber-500' : 'text-purple-600 dark:text-purple-400')} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-zinc-900 dark:text-white truncate">
            {pickup ? 'O seu ponto de embarque' : 'Onde quer ser apanhado?'}
          </span>
          <span className="block text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
            {picking
              ? 'Toque no mapa, no sítio exacto da rua onde vai estar.'
              : pickup
                ? `${pickup.note?.trim() ? `${pickup.note.trim()} · ` : ''}${near ? `${near} da sua posição` : 'marcado no mapa'}`
                : `Por omissão é a paragem de ${zoneName ?? 'si'} — pode marcar o portão, a esquina, o sítio.`}
          </span>
        </span>
        <span className={cn(
          'shrink-0 text-[12px] font-semibold flex items-center gap-1',
          picking ? 'text-amber-800 dark:text-amber-300' : 'text-purple-600 dark:text-purple-400',
        )}>
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {picking ? 'a marcar' : busy ? 'a gravar' : pickup ? 'mudar' : 'marcar'}
        </span>
      </button>

      {/* O nome do sítio, para se dizer ao motorista em uma palavra. Um lugar
          fino só vale até 700 m e um bairro até 2 km: para lá disso damos a
          paragem de preço e os metros, porque um nome colado a 3 km é uma
          adivinhação — e adivinhação num encontro é como a pessoa se perde. */}
      {where && !picking && (
        <div className="px-3 pb-2">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-purple-700 dark:text-purple-300">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span title={named ?? undefined} className="min-w-0 truncate">{named}</span>
            <span title={tail || undefined} className="min-w-0 truncate font-medium text-zinc-500 dark:text-zinc-400">{tail}</span>
          </p>
          {where.via === 'equipa' && (
            <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Nome dito pela equipa Elara, não pelo mapa.
            </p>
          )}
          {named && named.toLowerCase() !== note.toLowerCase() && onName && (
            <button
              type="button"
              onClick={() => onName(named)}
              className="mt-1.5 h-11 px-3 rounded-control bg-purple-100 dark:bg-purple-900/40 border border-purple-300 dark:border-purple-700 text-[12px] font-bold text-purple-700 dark:text-purple-200"
            >
              Usar «{named}» como referência
            </button>
          )}
        </div>
      )}

      {pickup && !picking && onNote && (
        <div className="px-3 pb-3 flex items-center gap-2">
          <input
            value={pickup.note ?? ''}
            onChange={(e) => onNote(e.target.value.slice(0, 90))}
            onBlur={onNoteDone}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            aria-label="Referência do ponto de embarque"
            placeholder="Referência: portão azul, ao lado da farmácia"
            className="min-w-0 flex-1 h-11 rounded-control bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 text-[13px] font-bold outline-none focus:border-purple-400 placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
          />
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Tirar o ponto marcado"
              className="tap-pad w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
