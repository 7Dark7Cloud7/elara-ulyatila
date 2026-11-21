import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircleIcon, CloseIcon, ReceiptIcon, SearchIcon, SpinnerIcon,
  TopUpIcon, TrendDownIcon, TrendUpIcon, WalletGlyphIcon, WithdrawIcon,
} from '../components/ElaraIcons';
import { supabase, rpcError } from '../lib/supabase';
import type { MoneyRequest, SessionUser, WalletTx } from '../types';
import { filterWalletTxs, summarizeWalletMonth, type WalletDirectionFilter } from '../lib/localExtras';
import { useDemo } from '../lib/demoContext';
import { confirmDemoMoneyRequest, requestDemoMoney } from '../lib/demoEngine';
import { cn, OFF, when } from '../lib/utils';
import { formatKz } from '../lib/money';
import { Sheet } from '../components/Sheet';
import { NavWalletIcon } from '../components/NavIcons';

interface WalletViewProps {
  user: SessionUser | null;
  onLogin: () => void;
  onError: (message: string) => void;
}

const TX_LABEL: Record<WalletTx['kind'], string> = {
  earning: 'Corrida', commission: 'Comissão', topup: 'Recarga',
  payout: 'Levantamento', fee: 'Taxa', refund: 'Devolução',
};

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];
const QUICK_METHODS_IN = ['Multicaixa Express', 'Transferência bancária', 'Agente Elara'];
const QUICK_METHODS_OUT = ['Multicaixa Express', 'IBAN / Transferência', 'Agente Elara'];

const DIR_FILTERS: Array<{ id: WalletDirectionFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'in', label: 'Entradas' },
  { id: 'out', label: 'Saídas' },
];

/** O que a carteira faz, dito antes de haver conta — três gestos, sem promessas
 *  que a operação ainda não cumpra (o saldo só muda com confirmação da equipa). */
const WALLET_PERKS: Array<{ Icon: typeof TopUpIcon; title: string; text: string }> = [
  {
    Icon: TopUpIcon,
    title: 'Recarregar em kwanzas',
    text: 'Multicaixa Express, transferência ou agente — o saldo entra quando a equipa confirma.',
  },
  {
    Icon: ReceiptIcon,
    title: 'Um recibo por viagem',
    text: 'Preço, código e avaliação ficam guardados, prontos a partilhar.',
  },
  {
    Icon: WithdrawIcon,
    title: 'Levantar quando quiser',
    text: 'Peça a transferência para a sua conta; sem filas e sem letra pequena.',
  },
];

/**
 * A carteira: o saldo só muda quando alguém da equipa confirma o dinheiro que
 * realmente entrou ou saiu. Recarregar aqui é um pedido, não um clique mágico.
 */
export function WalletView({ user, onLogin, onError }: WalletViewProps) {
  const demoCtx = useDemo();
  const isDemo = !!demoCtx?.isDemo;
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [liveTxs, setLiveTxs] = useState<WalletTx[]>([]);
  const [liveRequests, setLiveRequests] = useState<MoneyRequest[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [sheet, setSheet] = useState<'in' | 'out' | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirFilter, setDirFilter] = useState<WalletDirectionFilter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!user || isDemo) return;
    const [w, t, r] = await Promise.all([
      supabase.from('tr_wallet').select('balance_kz').eq('who', user.uid).maybeSingle(),
      supabase.from('tr_wallet_tx').select('*').eq('who', user.uid).order('at', { ascending: false }).limit(60),
      supabase.from('tr_money_request').select('*').eq('who', user.uid).order('at', { ascending: false }).limit(10),
    ]);
    setLiveBalance(w.data ? (w.data as { balance_kz: number }).balance_kz : 0);
    setLiveTxs((t.data as WalletTx[]) ?? []);
    setLiveRequests((r.data as MoneyRequest[]) ?? []);
    setLiveLoading(false);
  }, [user, isDemo]);

  useEffect(() => {
    if (!user || isDemo) return;
    load();
    const channel = supabase
      .channel(`tr-wallet-${user.uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tr_wallet', filter: `who=eq.${user.uid}` },
        () => { load(); },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tr_wallet_tx', filter: `who=eq.${user.uid}` },
        () => { load(); },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tr_money_request', filter: `who=eq.${user.uid}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isDemo, load]);

  const balance = isDemo && demoCtx ? demoCtx.demoState.wallet.balanceKz : liveBalance;
  const txs = isDemo && demoCtx ? demoCtx.demoState.wallet.txs : liveTxs;
  const requests = isDemo && demoCtx ? demoCtx.demoState.wallet.requests : liveRequests;
  const loading = isDemo ? false : liveLoading;

  const month = useMemo(() => summarizeWalletMonth(txs), [txs]);
  const visibleTxs = useMemo(
    () => filterWalletTxs(txs, { direction: dirFilter, query }),
    [txs, dirFilter, query],
  );

  if (!user) {
    return (
      <div className="animate-enter space-y-4 pb-8">
        <div>
          <p className="eyebrow text-purple-700 dark:text-amber-400">O seu saldo Elara</p>
          <h1 className="mt-1 font-display text-title font-medium leading-tight text-ink dark:text-white">
            Carteira
          </h1>
        </div>
        <Empty
          icon={<NavWalletIcon active className="h-7 w-7" />}
          title="A sua carteira"
          text="Entre na conta para acompanhar o saldo das corridas, pedir recargas e levantamentos em Kwanzas."
          action={<button type="button" onClick={onLogin} className={btnCls}>Entrar na minha conta</button>}
        />

        {/* Sem sessão não há números para mostrar; mostramos o que a carteira
            faz. É a diferença entre um ecrã fechado e uma porta com placa. */}
        <section className="surface-card rounded-card p-4" aria-label="O que a carteira faz">
          <p className="eyebrow text-zinc-500 dark:text-[#B9A8DC]">O que a carteira faz</p>
          <ul className="mt-3 space-y-3">
            {WALLET_PERKS.map(({ Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-100 text-purple-700 dark:bg-amber-400/15 dark:text-amber-300">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-body font-semibold text-ink dark:text-white">{title}</span>
                  <span className="mt-0.5 block text-label leading-snug text-zinc-500 dark:text-zinc-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const submitRequest = async () => {
    if (!sheet || busy) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { onError('Escreva um valor válido em kwanzas.'); return; }
    if (!method.trim()) { onError('Diga como pretende pagar ou receber (ex.: Multicaixa Express, agente).'); return; }
    if (isDemo && demoCtx) {
      demoCtx.setDemoState((prev) => requestDemoMoney(prev, sheet, value, method));
      setSheet(null); setAmount(''); setMethod('');
      onError('Pedido demo registado — toque em «Confirmar agora (DEMO)» abaixo para actualizar o saldo.');
      return;
    }
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
  const quickMethods = sheet === 'out' ? QUICK_METHODS_OUT : QUICK_METHODS_IN;

  return (
    <div className="animate-enter space-y-4 pb-8">
      <div>
        <p className="eyebrow text-purple-700 dark:text-amber-400">O seu saldo Elara</p>
        <h1 className="mt-1 font-display text-title font-medium leading-tight text-ink dark:text-white">
          Carteira
        </h1>
      </div>

      {/* Cartão de saldo unificado */}
      <div className="rounded-card bg-purple-600 p-5 text-white shadow-card dark:bg-[#3a1a6e]">
        <p className="flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.14em] text-purple-100">
          <WalletGlyphIcon className="w-4 h-4" /> Saldo disponível
        </p>
        {loading ? (
          <SpinnerIcon className="w-6 h-6 animate-spin text-purple-100 mt-3" />
        ) : (
          <p className="mt-1.5 font-display text-display font-medium leading-none text-white">
            {formatKz(balance ?? 0)}
          </p>
        )}
        <p className="mt-2 text-label text-purple-100">
          {isDemo
            ? 'Carteira de demonstração — teste recargas, levantamentos e ganhos de corrida.'
            : 'Recargas e levantamentos confirmados pela equipa Elara.'}
        </p>
        <div className="grid grid-cols-2 gap-2.5 mt-5">
          <button
            type="button"
            onClick={() => { setSheet('in'); setAmount(''); setMethod(''); }}
            className="h-12 rounded-control bg-white text-purple-700 dark:bg-amber-400 dark:text-ink font-semibold flex items-center justify-center gap-2 text-body active:scale-[0.98] transition-transform"
          >
            <TopUpIcon className="w-5 h-5" /> Recarregar
          </button>
          <button
            type="button"
            onClick={() => { setSheet('out'); setAmount(''); setMethod(''); }}
            className="h-12 rounded-control border border-white/30 bg-white/10 text-white font-semibold flex items-center justify-center gap-2 text-body active:scale-[0.98] transition-transform"
          >
            <WithdrawIcon className="w-5 h-5" /> Levantar
          </button>
        </div>
      </div>

      {/* Resumo mensal de entradas e saídas */}
      {!loading && txs.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="surface-card rounded-card p-3.5">
            <p className="flex items-center gap-1.5 text-caption font-medium text-zinc-500 dark:text-zinc-400">
              <TrendUpIcon className="h-3.5 w-3.5 text-purple-600 dark:text-amber-400" /> Entradas este mês
            </p>
            <p className="mt-1 font-display text-lead font-semibold text-purple-700 dark:text-amber-300">
              +{formatKz(month.inKz)}
            </p>
          </div>
          <div className="surface-card rounded-card p-3.5">
            <p className="flex items-center gap-1.5 text-caption font-medium text-zinc-500 dark:text-zinc-400">
              <TrendDownIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" /> Saídas este mês
            </p>
            <p className="mt-1 font-display text-lead font-semibold text-ink dark:text-white">
              {month.outKz > 0 ? `-${formatKz(month.outKz)}` : formatKz(0)}
            </p>
          </div>
        </div>
      )}

      {/* Pedidos à espera de confirmação */}
      {pending.length > 0 && (
        <div className="rounded-card bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900 p-4 space-y-2.5">
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300">
            À espera da equipa
          </p>
          {pending.map((r) => (
            <div key={r.id} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-body">
                <span className="text-amber-800 dark:text-amber-200 font-medium">
                  {r.direction === 'in' ? 'Recarga' : 'Levantamento'} · {r.method}
                </span>
                <span className="font-semibold text-amber-900 dark:text-amber-100">{formatKz(r.amount_kz)}</span>
              </div>
              {isDemo && demoCtx && (
                <button
                  type="button"
                  onClick={() => {
                    demoCtx.setDemoState((prev) => confirmDemoMoneyRequest(prev, r.id));
                    onError('Pedido demo confirmado — saldo actualizado.');
                  }}
                  className="btn-main flex h-10 w-full items-center justify-center gap-1.5 rounded-control text-label font-semibold"
                >
                  <CheckCircleIcon className="h-4 w-4" /> Confirmar agora (DEMO)
                </button>
              )}
            </div>
          ))}
          <p className="text-caption text-amber-800/80 dark:text-amber-300/80">
            O saldo só muda quando confirmarmos que o dinheiro entrou ou saiu mesmo.
          </p>
        </div>
      )}

      {/* Pedidos recusados */}
      {refused.length > 0 && (
        <div className="surface-card rounded-card p-4">
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Não avançou
          </p>
          {refused.slice(0, 3).map((r) => (
            <div key={r.id} className="mt-2">
              <p className="flex items-baseline gap-2 text-body">
                <span className="min-w-0 flex-1 truncate font-semibold text-ink dark:text-zinc-200">
                  {r.direction === 'in' ? 'Recarga' : 'Levantamento'} · {r.method}
                </span>
                <span className="shrink-0 font-semibold text-ink dark:text-white">
                  {formatKz(r.amount_kz)}
                </span>
              </p>
              <p className="text-caption text-zinc-500 dark:text-zinc-400 mt-0.5">
                {r.reason?.trim() || 'Sem motivo indicado'} · {when(r.resolved_at ?? r.at)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Cabeçalho e filtros dos movimentos */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <ReceiptIcon className="w-4 h-4 text-purple-600 dark:text-amber-400" />
          <p className="eyebrow text-zinc-500 dark:text-zinc-400">
            Movimentos ({txs.length})
          </p>
        </div>
      </div>

      {!loading && txs.length > 0 && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/[0.06]">
            {DIR_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setDirFilter(f.id)}
                aria-pressed={dirFilter === f.id}
                className={cn(
                  'h-11 rounded-full text-label font-semibold transition-colors',
                  dirFilter === f.id
                    ? 'bg-white text-ink shadow-sm dark:bg-white/15 dark:text-white'
                    : 'text-zinc-500 dark:text-zinc-400',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar por nota ou referência…"
              aria-label="Filtrar movimentos da carteira"
              className="surface-outline h-11 w-full rounded-control pl-10 pr-10 text-body outline-none focus:border-purple-400 placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Limpar filtro"
                className="tap-pad absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full text-zinc-400"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && visibleTxs.length === 0 && (
        <Empty
          icon={<ReceiptIcon className="h-6 w-6" />}
          title={txs.length === 0 ? 'Sem movimentos' : 'Nada neste filtro'}
          text={txs.length === 0
            ? 'As corridas que fechar e as recargas confirmadas aparecem aqui, com o saldo a seguir a cada movimento.'
            : 'Não há movimentos com este filtro. Toque em «Todos» para ver a lista completa.'}
        />
      )}

      <div className="space-y-2.5">
        {visibleTxs.map((t) => (
          <div key={t.id} className="surface-card rounded-card p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-body text-ink dark:text-white">{TX_LABEL[t.kind]}</p>
              <p className="text-caption text-zinc-500 dark:text-zinc-400 truncate">{t.note || t.trip_id || ''}</p>
              <p className="text-caption text-zinc-500 dark:text-zinc-400">{when(t.at)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn('font-semibold text-body', t.amount_kz >= 0 ? 'text-purple-700 dark:text-amber-300' : 'text-red-600 dark:text-red-400')}>
                {t.amount_kz >= 0 ? '+' : ''}{formatKz(t.amount_kz)}
              </p>
              <p className="text-caption text-zinc-500 dark:text-zinc-400">
                ficou {formatKz(t.balance_after_kz)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Sheet de pedido com valores rápidos e métodos frequentes */}
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

        {/* Valores rápidos em Kwanzas */}
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Valores rápidos">
          {QUICK_AMOUNTS.map((val) => {
            const active = Number(amount) === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(String(val))}
                aria-pressed={active}
                className={cn(
                  'h-10 rounded-full border px-3.5 text-label font-semibold transition-colors',
                  active
                    ? 'border-purple-600 bg-purple-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-ink'
                    : 'surface-outline',
                )}
              >
                {formatKz(val)}
              </button>
            );
          })}
        </div>

        <div className="mt-3 space-y-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="Valor em kwanzas (ex.: 5000)"
            inputMode="numeric"
            className={fieldCls}
          />

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Métodos habituais">
            {quickMethods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                aria-pressed={method === m}
                className={cn(
                  'h-11 rounded-full border px-3 text-caption font-semibold transition-colors',
                  method === m
                    ? 'border-purple-600 bg-purple-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-ink'
                    : 'surface-outline',
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder={sheet === 'in' ? 'Como vai pagar (ex.: Multicaixa Express)' : 'Como quer receber (ex.: agente, Multicaixa)'}
            className={fieldCls}
          />
        </div>

        <button
          type="button"
          onClick={submitRequest}
          disabled={busy || !amount || !method.trim()}
          className={cn(
            'w-full h-12 rounded-control font-semibold text-body mt-4 flex items-center justify-center gap-2',
            busy || !amount || !method.trim() ? OFF : 'btn-main',
          )}
        >
          {busy ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : null}
          Enviar pedido
        </button>
      </Sheet>
    </div>
  );
}

function Empty({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="animate-enter surface-card rounded-card p-8 text-center">
      {icon && (
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-card bg-purple-100 text-purple-700 dark:bg-amber-400/15 dark:text-amber-300">
          {icon}
        </div>
      )}
      <h2 className="text-lead font-semibold tracking-tight text-ink dark:text-white">{title}</h2>
      <p className="text-label text-zinc-500 dark:text-zinc-400 mt-2">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const btnCls =
  'btn-main w-full h-12 rounded-control font-semibold text-body';

const fieldCls =
  'w-full h-12 rounded-control surface-outline px-4 outline-none focus:border-purple-400 placeholder:text-zinc-500 dark:placeholder:text-zinc-400';
