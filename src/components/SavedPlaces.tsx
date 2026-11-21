import { useState } from 'react';
import { Bookmark, Check, X } from 'lucide-react';
import { PLACE_EMOJIS, type SavedPlace } from '../lib/extras';
import { cn } from '../lib/utils';

interface SavedPlacesProps {
  places: SavedPlace[];
  /** O destino escolhido no momento, para poder ser guardado como atalho. */
  targetZoneId: string | null;
  targetLabel: string | null;
  busy?: boolean;
  onPick: (place: SavedPlace) => void;
  onSave: (place: { emoji: string }) => void;
  onRemove: (id: string) => void;
}

/**
 * Atalhos com emoji: «🏠 Casa», «🏫 Escola». São só destinos que a pessoa já
 * escolheu — o preço e a rota continuam a vir do servidor quando ela toca.
 *
 * Só existe com a migração 0005 aplicada; quem a não tem nunca vê esta fila.
 */
export function SavedPlaces({ places, targetZoneId, targetLabel, busy, onPick, onSave, onRemove }: SavedPlacesProps) {
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);

  const alreadySaved = !!targetZoneId && places.some((p) => p.zone_id === targetZoneId);
  const canSave = !!targetZoneId && !alreadySaved && !!targetLabel;
  const shortLabel = (targetLabel ?? '').slice(0, 18);

  if (!places.length && !canSave) return null;

  return (
    <div className="space-y-2">
      <div className="h-rail flex gap-2 overflow-x-auto">
        {places.map((p) => (
          <div key={p.id} className="relative shrink-0">
            <button
              onClick={() => onPick(p)}
              disabled={busy}
              className={cn(
                'h-10 rounded-full px-3 flex items-center gap-1.5 border text-[13px] font-semibold',
                'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100',
                'active:bg-zinc-100 dark:active:bg-zinc-700 transition-colors',
                managing && 'pr-8 opacity-70',
              )}
            >
              <span aria-hidden className="text-[14px] leading-none">{p.emoji}</span>
              <span className="max-w-[124px] truncate">{p.label}</span>
            </button>
            {managing && (
              <button
                onClick={() => onRemove(p.id)}
                disabled={busy}
                aria-label={`Remover ${p.label}`}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {canSave && !adding && (
          <button
            onClick={() => setAdding(true)}
            disabled={busy}
            className={cn(
              'shrink-0 h-10 rounded-full px-3 flex items-center gap-1.5 border text-[13px] font-semibold',
              'border-dashed border-purple-400 text-purple-700 dark:text-purple-300',
              'bg-purple-50/60 dark:bg-purple-900/20 active:bg-purple-100 dark:active:bg-purple-900/40',
            )}
          >
            <Bookmark className="w-3.5 h-3.5" /> Guardar «{shortLabel}»
          </button>
        )}

        {!!places.length && (
          <button
            onClick={() => { setManaging((m) => !m); if (adding) setAdding(false); }}
            className={cn(
              'shrink-0 h-10 rounded-full px-3 flex items-center gap-1.5 text-[12px] font-semibold border',
              managing
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400',
            )}
          >
            {managing ? <><Check className="w-3.5 h-3.5" /> Pronto</> : 'Gerir'}
          </button>
        )}
      </div>

      {/* Um toque no emoji guarda o destino com o nome da zona. Sem formulário:
          quem está à porta de casa não quer encher campos. */}
      {adding && canSave && (
        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-2.5">
          <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">
            Guardar <span className="font-semibold text-zinc-700 dark:text-zinc-200">{targetLabel}</span> com que sinal?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PLACE_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => { onSave({ emoji: e }); setAdding(false); }}
                disabled={busy}
                aria-label={`Guardar com ${e}`}
                className={cn(
                  'w-11 h-11 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700',
                  'text-[20px] flex items-center justify-center active:bg-purple-50 dark:active:bg-purple-900/30',
                )}
              >
                <span aria-hidden>{e}</span>
              </button>
            ))}
            <button
              onClick={() => setAdding(false)}
              className="w-11 h-11 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 flex items-center justify-center"
              aria-label="Cancelar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
