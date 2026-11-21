import { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Loader2, Receipt, Wallet as WalletIcon } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import type { MoneyRequest, SessionUser, WalletTx } from '../types';
import { cn, when } from '../lib/utils';
import { formatKz } from '../lib/money';
import { Sheet } from '../components/Sheet';

interface WalletViewProps {
  user: SessionUser | null;
  onLogin: () => void;
  onError: (message: string) => void;
}

const TX_LABEL: Record<WalletTx['kind'], string> = {
  earning: 'Corrida', commission: 'Comissão', topup: 'Recarga',
  payout: 'Levantamento', fee: 'Taxa', refund: 'Devolução',
};

/**
 * A carteira: o saldo só muda quando alguém da equipa confirma o dinheiro que
 * realmente entrou ou saiu. Recarregar aqui é um pedido, não um clique mágico.
 */
export function WalletView({ user, onLogin, onError }: WalletViewProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [requests, setRequests] = useState<MoneyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<'in' | 'out' | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [w, t, r] = await Promise.all([
      supabase.from('tr_wallet').select('balance_kz').eq('who', user.uid).maybeSingle(),
      supabase.from('tr_wallet_tx').select('*').eq('who', user.uid).order('at', { ascending: false }).limit(40),
      supabase.from('tr_money_request').select('*').eq('who', user.uid).order('at', { ascending: false }).limit(10),
    ]);
    setBalance(w.data ? (w.data as { balance_kz: number }).balance_kz : 0);
    setTxs((t.data as WalletTx[]) ?? []);
    setRequests((r.data as MoneyRequest[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase
      .channel(`tr-wallet-${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: '*', schema: 'public', table: 'tr_wallet',
          filter: `who=eq.${user.uid}`,
        },
        () => { load(); },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'tr_wallet_tx',
          filter: `who=eq.${user.uid}`,
        },
        () => { load(); },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', schema: 'public', table: 'tr_money_request',
          filter: `who=eq.${user.uid}`,
        },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  if (!user) {
    return (
      <Empty
        title="A sua carteira"
        text="Entre na conta para ver o saldo das corridas, recarregar e pedir levantamentos."
        action={<button onClick={onLogin} className={btnCls}>Entrar</button>}
      />
    );
  }

  const submitRequest = async () => {
    if (!sheet || busy) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { onError('Escreva um valor válido em kwanzas.'); return; }
    if (!method.trim()) { onError('Diga como pretende pagar ou receber (ex.: Multicaixa Express, agente).'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('tr_request_money', {
      p_direction: sheet,
      p_amount_kz: Math.round(value),
      p_method: method.trim(),
    });
    setBusy(false);
    if (error) { onError(rpcError(error)); return; }
    setSheet(null); setAmount(''); setMethod('');
    load();
    onError(sheet === 'in'
      ? 'Pedido enviado. O saldo entra quando a equipa confirmar o pagamento.'
      : 'Pedido de levantamento enviado. A equipa confirma e o dinheiro sai.');
  };

  const pending = requests.filter((r) => r.state === 'pending');
  const refused = requests.filter((r) => r.state === 'rejected');

  return (
    <div className="animate-enter space-y-4 pb-8">
      <div>
        <p className="eyebrow text-purple-700 dark:text-amber-400">O seu saldo Elara</p>
        <h1 className="mt-1 font-display text-title font-medium leading-tight text-ink dark:text-white">
          Carteira
        </h1>
      </div>

      {/* Saldo em cartão principal alinhado com Viagens e Perfil */}
      <div className="rounded-card bg-purple-600 p-5 text-white shadow-card dark:bg-[#3a1a6e]">
        <p className="flex items-center gap-2 text-caption font-semibold tracking-[0.12em] text-purple-100">
          <WalletIcon className="w-4 h-4" /> Saldo disponível
        </p>
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-purple-100 mt-3" />
        ) : (
          <p className="mt-1.5 font-display text-stat font-medium leading-none text-white">
            {formatKz(balance ?? 0)}
          </p>
        )}
        <p className="mt-2 text-label text-purple-100">
          Recargas e levantamentos confirmados pela equipa Elara.
        </p>
        <div className="grid grid-cols-2 gap-2.5 mt-5">
          <button
            onClick={() => setSheet('in')}
            className="h-12 rounded-control bg-white text-purple-700 dark:bg-amber-400 dark:text-ink font-semibold flex items-center justify-center gap-2 text-sm active:scale-[0.98] transition-transform"
          >
            <ArrowDownCircle className="w-5 h-5" /> Recarregar
          </button>
          <button
            onClick={() => setSheet('out')}
            className="h-12 rounded-control border border-white/30 bg-white/10 text-white font-semibold flex items-center justify-center gap-2 text-sm active:scale-[0.98] transition-transform"
          >
            <ArrowUpCircle className="w-5 h-5" /> Levantar
          </button>
        </div>
      </div>

      {/* Pedidos a espera de confirmação */}
      {pending.length > 0 && (
        <div className="rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
            À espera da equipa
          </p>
          {pending.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 mt-2 text-sm">
              <span className="text-amber-800 dark:text-amber-200 font-medium">
                {r.direction === 'in' ? 'Recarga' : 'Levantamento'} · {r.method}
              </span>
              <span className="font-bold text-amber-900 dark:text-amber-100">{formatKz(r.amount_kz)}</span>
            </div>
          ))}
          <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-2">
            O saldo só muda quando confirmarmos que o dinheiro entrou ou saiu mesmo.
          </p>
        </div>
      )}

      {/* Recusado não pode ser silêncio: sem esta linha a pessoa fica à espera
          de um dinheiro que já não vem. */}
      {refused.length > 0 && (
        <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-4">
          <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
            Não avançou
          </p>
          {refused.slice(0, 3).map((r) => (
            <div key={r.id} className="mt-2">
              <p className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-bold text-zinc-700 dark:text-zinc-200">
                  {r.direction === 'in' ? 'Recarga' : 'Levantamento'} · {r.method}
                </span>
                <span className="shrink-0 font-bold text-zinc-900 dark:text-white">
                  {formatKz(r.amount_kz)}
                </span>
              </p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {r.reason?.trim() || 'Sem motivo indicado'} · {when(r.resolved_at ?? r.at)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Razão de movimentos */}
      <div className="flex items-center gap-2 px-1">
        <Receipt className="w-4 h-4 text-zinc-400" />
        <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
          Movimentos
        </p>
      </div>

      {!loading && txs.length === 0 && (
        <Empty
          title="Sem movimentos"
          text="As corridas que fechar e as recargas confirmadas aparecem aqui, com o saldo a seguir a cada movimento."
        />
      )}

      <div className="space-y-2.5">
        {txs.map((t) => (
          <div key={t.id} className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-sm text-zinc-900 dark:text-white">{TX_LABEL[t.kind]}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{t.note || t.trip_id || ''}</p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{when(t.at)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn('font-semibold', t.amount_kz >= 0 ? 'text-purple-600 dark:text-purple-400' : 'text-red-600 dark:text-red-400')}>
                {t.amount_kz >= 0 ? '+' : ''}{formatKz(t.amount_kz)}
              </p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                ficou {formatKz(t.balance_after_kz)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Sheet de pedido */}
      <Sheet
        open={sheet !== null}
        title={sheet === 'in' ? 'Recarregar a carteira' : 'Pedir levantamento'}
        onClose={() => setSheet(null)}
      >
        <p className="text-body text-zinc-600 dark:text-zinc-300">
          {sheet === 'in'
            ? 'Enviamos os dados para a equipa confirmar o pagamento. Só depois o saldo sobe.'
            : `Tem ${formatKz(balance ?? 0)} disponível. A equipa confirma e o dinheiro sai.`}
        </p>
        <div className="mt-4 space-y-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="Valor em kwanzas (ex.: 5000)"
            inputMode="numeric"
            className={fieldCls}
          />
          <input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder={sheet === 'in' ? 'Como vai pagar (ex.: Multicaixa Express)' : 'Como quer receber (ex.: agente, Multicaixa)'}
            className={fieldCls}
          />
        </div>
        <button
          onClick={submitRequest}
          disabled={busy}
          className={cn(btnCls, 'mt-4 flex items-center justify-center gap-2')}
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          Enviar pedido
        </button>
      </Sheet>
    </div>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="animate-enter rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-8 text-center shadow-sm">
      <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">{title}</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const btnCls =
  'btn-main w-full h-12 rounded-2xl font-bold';

const fieldCls =
  'w-full h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 outline-none focus:border-purple-400 placeholder:text-zinc-500 dark:placeholder:text-zinc-400';
