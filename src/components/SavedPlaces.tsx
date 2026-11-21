import { useState } from 'react';
import { BookmarkIcon, CheckIcon, CloseIcon } from './ElaraIcons';
import { PLACE_EMOJIS, type SavedPlace } from '../lib/extras';
import { PLACE_PRESETS } from '../lib/localExtras';
import { cn, OFF_ATTR } from '../lib/utils';

interface SavedPlacesProps {
  places: SavedPlace[];
  /** O destino escolhido no momento, para poder ser guardado como atalho. */
  targetZoneId: string | null;
  targetLabel: string | null;
  /** Quando `true`, indica ao utilizador que os atalhos estão guardados só no aparelho. */
  localOnly?: boolean;
  busy?: boolean;
  onPick: (place: SavedPlace) => void;
  onSave: (place: { emoji: string; label: string }) => void;
  onRemove: (id: string) => void;
}

/**
 * Atalhos guardados («🏠 Casa», «💼 Trabalho»): um toque põe o destino na rota
 * e volta a pedir o preço ao servidor. Funciona tanto em modo local (no
 * telemóvel) como ligado ao servidor quando a migração 0005 estiver activa.
 */
export function SavedPlaces({
  places, targetZoneId, targetLabel, localOnly, busy, onPick, onSave, onRemove,
}: SavedPlacesProps) {
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [emoji, setEmoji] = useState(PLACE_EMOJIS[0]);

  const alreadySaved = !!targetZoneId && places.some((p) => p.zone_id === targetZoneId);
  const canSave = !!targetZoneId && !alreadySaved && !!targetLabel;
  const shortLabel = (targetLabel ?? '').slice(0, 18);

  if (!places.length && !canSave) return null;

  const commit = (chosenEmoji: string, chosenLabel: string) => {
    const clean = chosenLabel.trim() || targetLabel || 'Local';
    onSave({ emoji: chosenEmoji, label: clean.slice(0, 40) });
    setAdding(false);
    setCustomLabel('');
  };

  return (
    <div className="space-y-2">
      <div className="h-rail flex gap-2 overflow-x-auto pb-0.5">
        {places.map((p) => (
          <div key={p.id} className="relative shrink-0">
            <button
              type="button"
              onClick={() => onPick(p)}
              disabled={busy}
              className={cn(
                'h-11 rounded-full px-3.5 flex items-center gap-1.5 border text-[13px] font-semibold transition-colors',
                'surface-outline active:bg-purple-50 dark:active:bg-white/[0.12]',
                managing && 'pr-9',
              )}
            >
              <span aria-hidden className="text-[14px] leading-none">{p.emoji}</span>
              <span title={p.label} className="max-w-[128px] truncate">{p.label}</span>
            </button>
            {managing && (
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                disabled={busy}
                aria-label={`Remover ${p.label}`}
                className="tap-pad absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {canSave && !adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setCustomLabel(targetLabel ?? ''); setEmoji(PLACE_EMOJIS[0]); }}
            disabled={busy}
            className={cn(
              'shrink-0 h-11 rounded-full px-3.5 flex items-center gap-1.5 border text-[13px] font-semibold transition-colors',
              'border-dashed border-purple-400 text-purple-700 bg-purple-50/70',
              'dark:border-amber-400/50 dark:text-amber-300 dark:bg-amber-400/[0.08]',
            )}
          >
            <BookmarkIcon className="w-3.5 h-3.5" /> Guardar «{shortLabel}»
          </button>
        )}

        {!!places.length && (
          <button
            type="button"
            onClick={() => { setManaging((m) => !m); if (adding) setAdding(false); }}
            className={cn(
              'shrink-0 h-11 rounded-full px-3 flex items-center gap-1.5 text-[12px] font-semibold border transition-colors',
              managing
                ? 'bg-purple-600 text-white border-purple-600 dark:bg-amber-400 dark:text-ink dark:border-amber-400'
                : 'surface-outline text-zinc-500 dark:text-zinc-300',
            )}
          >
            {managing ? <><CheckIcon className="w-3.5 h-3.5" /> Pronto</> : 'Gerir'}
          </button>
        )}
      </div>

      {adding && canSave && (
        <div className="surface-card rounded-card p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-label font-semibold text-ink dark:text-white truncate">
              Guardar {targetLabel}
            </p>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="tap-pad grid h-8 w-8 place-items-center rounded-full text-zinc-500 dark:text-zinc-400"
              aria-label="Cancelar"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Rótulos rápidos de um toque */}
          <div className="flex flex-wrap gap-1.5">
            {PLACE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => commit(preset.emoji, preset.label)}
                disabled={busy}
                className="h-11 rounded-full border border-zinc-200 bg-zinc-50 px-3 text-label font-semibold text-ink inline-flex items-center gap-1.5 active:scale-[0.97] dark:border-[rgba(185,168,220,0.28)] dark:bg-white/[0.06] dark:text-white"
              >
                <span aria-hidden>{preset.emoji}</span> {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              maxLength={40}
              placeholder="Nome do atalho (ex.: Casa da mãe)"
              className="h-11 flex-1 rounded-control border border-zinc-200 bg-white px-3 text-body text-ink outline-none focus:border-purple-400 dark:border-[rgba(185,168,220,0.3)] dark:bg-zinc-900 dark:text-white"
            />
            <button
              type="button"
              disabled={busy || !customLabel.trim()}
              onClick={() => commit(emoji, customLabel)}
              className={cn('btn-main h-11 px-4 rounded-control text-label font-semibold shrink-0', OFF_ATTR)}
            >
              Guardar
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PLACE_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-pressed={emoji === e}
                aria-label={`Ícone ${e}`}
                className={cn(
                  'w-11 h-11 rounded-control border text-[18px] flex items-center justify-center transition-colors',
                  emoji === e
                    ? 'border-purple-500 bg-purple-100 dark:border-amber-400 dark:bg-amber-400/20'
                    : 'surface-outline',
                )}
              >
                <span aria-hidden>{e}</span>
              </button>
            ))}
          </div>

          {localOnly && (
            <p className="text-caption text-zinc-500 dark:text-zinc-400">
              Guardado só neste telemóvel. O preço volta sempre a ser calculado pelo servidor.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
