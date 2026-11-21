import { useEffect, useState } from 'react';
import { Check, Copy, Loader2, Ticket, UserPlus } from 'lucide-react';
import { claimReferral, listReferrals, myReferralCode, referralsLive, type Referral } from '../lib/extras';
import { cn, OFF } from '../lib/utils';

/**
 * O convite. O código é só um código: o crédito de quem o usa fica à espera da
 * equipa, e nada nesta app dá saldo sozinho — por isso é que aqui se diz
 * «a equipa confirma», e não «ganhe X Kz».
 *
 * Só aparece com a migração 0005 aplicada.
 */
export function ReferralCard({ onError }: { onError: (message: string, tone?: 'ok' | 'err') => void }) {
  const [live, setLive] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [mine, setMine] = useState<Referral | null>(null);
  const [usedBy, setUsedBy] = useState(0);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    referralsLive().then(async (v) => {
      if (!alive || !v) return;
      setLive(true);
      const [c, rows] = await Promise.all([myReferralCode(), listReferrals()]);
      if (!alive) return;
      setCode(c);
      const all = rows ?? [];
      // RLS: aqui só chegam linhas em que a pessoa é quem convidou ou quem
      // usou o código. As duas coisas que lhe dizem respeito.
      setUsedBy(all.filter((r) => r.code === c && r.status === 'confirmed').length);
      setMine((c ? all.find((r) => r.code !== c) : undefined) ?? null);
    });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!live) return null;

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onError('Não foi possível copiar — escreva o código a quem vai usar.');
    }
  };

  const claim = async () => {
    const value = input.trim().toUpperCase();
    if (value.length < 8 || busy) return;
    setBusy(true);
    const r = await claimReferral(value);
    setBusy(false);
    if (!r.ok) { onError(r.error ?? 'Não foi possível registar o código.'); return; }
    setInput('');
    setMine({ id: '', code: value, status: 'pending', who: '', at: Date.now() });
    onError('Código registado. A equipa Elara confirma antes de qualquer crédito.', 'ok');
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
      <p className="flex items-center gap-2 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
        <Ticket className="w-3.5 h-3.5" /> O seu código de convite
      </p>

      {code ? (
        <div className="mt-2 flex items-center gap-2">
          <p className="grow font-bold text-xl tracking-[0.18em] text-zinc-900 dark:text-white">{code}</p>
          <button
            onClick={copy}
            aria-label={`Copiar o código ${code}`}
            className={cn(
              'h-11 w-11 shrink-0 rounded-2xl border flex items-center justify-center transition-colors',
              copied
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300',
            )}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" /> a carregar o seu código…
        </p>
      )}

      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-2">
        Dê este código a quem ainda não usa a Ulyatila.{' '}
        {usedBy > 0
          ? `${usedBy} pessoa${usedBy > 1 ? 's' : ''} já ${usedBy > 1 ? 'usaram' : 'usou'} — confirmado pela equipa.`
          : 'A equipa confirma cada convite antes de qualquer crédito entrar na carteira.'}
      </p>

      {/* O que a pessoa usou, se usou. Nunca se promete valor: diz-se o estado. */}
      {mine && mine.code !== code && (
        <p className={cn(
          'mt-2 rounded-xl px-3 py-2 text-[12px] font-semibold',
          mine.status === 'confirmed'
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
            : mine.status === 'rejected'
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
        )}>
          Usou o código {mine.code} ·{' '}
          {mine.status === 'pending' ? 'à espera da equipa' : mine.status === 'confirmed' ? 'confirmado' : 'não confirmado'}
        </p>
      )}

      {!mine && (
        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            placeholder="Tem código de alguém?"
            inputMode="text"
            autoCapitalize="characters"
            maxLength={8}
            className="grow h-11 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 text-sm font-bold text-zinc-900 dark:text-white placeholder:font-bold placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none focus:border-purple-500"
          />
          <button
            onClick={claim}
            disabled={busy || input.length < 8}
            className={cn(
              'btn-main h-11 px-4 rounded-2xl text-sm font-bold flex items-center gap-2 shrink-0',
              (busy || input.length < 8) && OFF,
            )}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Usar
          </button>
        </div>
      )}
    </div>
  );
}
