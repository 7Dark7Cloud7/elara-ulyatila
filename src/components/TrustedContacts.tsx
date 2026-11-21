import { useState } from 'react';
import { PhoneIcon, PlusIcon, ShieldCheckIcon, TrashIcon, UserPlusIcon } from './ElaraIcons';
import {
  addTrustedContact,
  formatPhoneDisplay,
  loadTrustedContacts,
  MAX_TRUSTED_CONTACTS,
  removeTrustedContact,
  trustedShareMessage,
  type TrustedContact,
} from '../lib/localExtras';
import { cn, OFF, waLink } from '../lib/utils';

interface TrustedContactsProps {
  onChanged?: (contacts: TrustedContact[]) => void;
  onNotify?: (message: string, tone?: 'ok' | 'err') => void;
}

const RELATIONS = ['Família', 'Amigo', 'Trabalho', 'Casa'] as const;

/**
 * Contactos de confiança guardados apenas neste telemóvel.
 * Aparecem no painel SOS e na viagem em curso para partilhar a rota num toque
 * pelo WhatsApp (sem nunca levar o código PIN de embarque).
 */
export function TrustedContacts({ onChanged, onNotify }: TrustedContactsProps) {
  const [contacts, setContacts] = useState<TrustedContact[]>(() => loadTrustedContacts());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState<string>('Família');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = addTrustedContact({ name, phone, relation });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setContacts(res.contacts);
    onChanged?.(res.contacts);
    onNotify?.(`${name.trim()} guardado nos contactos de confiança.`, 'ok');
    setName('');
    setPhone('');
    setRelation('Família');
    setError(null);
    setAdding(false);
  };

  const remove = (c: TrustedContact) => {
    const next = removeTrustedContact(c.id);
    setContacts(next);
    onChanged?.(next);
    onNotify?.(`${c.name} removido dos contactos de confiança.`, 'ok');
  };

  return (
    <div className="surface-card rounded-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-purple-100 text-purple-700 dark:bg-amber-400/15 dark:text-amber-300">
            <ShieldCheckIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-body font-semibold text-ink dark:text-white">
              Contactos de confiança ({contacts.length}/{MAX_TRUSTED_CONTACTS})
            </p>
            <p className="mt-0.5 text-label leading-snug text-zinc-500 dark:text-zinc-400">
              Para partilhar a viagem ou avisar no SOS num toque. Guardados só neste telemóvel.
            </p>
          </div>
        </div>
        {!adding && contacts.length < MAX_TRUSTED_CONTACTS && (
          <button
            type="button"
            onClick={() => { setAdding(true); setError(null); }}
            aria-label="Adicionar contacto de confiança"
            className="shrink-0 min-h-11 px-3 rounded-control border border-purple-300 bg-purple-50 text-label font-semibold text-purple-700 inline-flex items-center gap-1.5 active:scale-[0.98] dark:border-amber-400/40 dark:bg-amber-400/[0.12] dark:text-amber-200"
          >
            <PlusIcon className="h-4 w-4" /> Adicionar
          </button>
        )}
      </div>

      {contacts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2.5 rounded-control border border-zinc-200 bg-zinc-50/70 px-3 py-2.5 dark:border-[rgba(185,168,220,0.22)] dark:bg-white/[0.04]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-ink dark:text-white">
                  {c.name} <span className="font-medium text-label text-zinc-500 dark:text-zinc-400">· {c.relation}</span>
                </p>
                <p className="text-caption text-zinc-500 dark:text-zinc-400">
                  {formatPhoneDisplay(c.phone)}
                </p>
              </div>
              <a
                href={waLink(c.phone, trustedShareMessage({ contactName: c.name }))}
                target="_blank"
                rel="noreferrer"
                aria-label={`Enviar mensagem a ${c.name}`}
                className="tap-pad grid h-9 w-9 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-purple-700 dark:border-[rgba(185,168,220,0.3)] dark:bg-white/[0.08] dark:text-amber-300"
              >
                <PhoneIcon className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => remove(c)}
                aria-label={`Remover ${c.name}`}
                className="tap-pad grid h-9 w-9 shrink-0 place-items-center rounded-full border border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <form onSubmit={submit} className="mt-3 space-y-2.5 border-t border-zinc-200 pt-3 dark:border-[rgba(185,168,220,0.22)]">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="block">
              <span className="text-caption font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Nome
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
                placeholder="Ex.: Ana Silva"
                maxLength={40}
                className="mt-1 h-11 w-full rounded-control border border-zinc-200 bg-white px-3 text-body text-ink outline-none focus:border-purple-400 dark:border-[rgba(185,168,220,0.3)] dark:bg-zinc-900 dark:text-white"
              />
            </label>
            <label className="block">
              <span className="text-caption font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                Telefone (Angola)
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); if (error) setError(null); }}
                placeholder="923 000 000"
                maxLength={20}
                className="mt-1 h-11 w-full rounded-control border border-zinc-200 bg-white px-3 text-body text-ink outline-none focus:border-purple-400 dark:border-[rgba(185,168,220,0.3)] dark:bg-zinc-900 dark:text-white"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Relação">
            {RELATIONS.map((rel) => (
              <button
                key={rel}
                type="button"
                aria-pressed={relation === rel}
                onClick={() => setRelation(rel)}
                className={cn(
                  'h-9 rounded-full border px-3 text-label font-semibold transition-colors',
                  relation === rel
                    ? 'border-purple-600 bg-purple-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-ink'
                    : 'surface-outline text-zinc-600 dark:text-zinc-200',
                )}
              >
                {rel}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="text-label font-semibold text-red-600 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              className="h-11 flex-1 rounded-control surface-outline text-label font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !phone.trim()}
              className={cn(
                'h-11 flex-1 rounded-control text-label font-semibold inline-flex items-center justify-center gap-1.5',
                !name.trim() || !phone.trim() ? OFF : 'btn-main',
              )}
            >
              <UserPlusIcon className="h-4 w-4" /> Guardar contacto
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
