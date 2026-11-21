import { useMemo, useState } from 'react';
import { ChevronRight, Share2, Star } from 'lucide-react';
import type { SessionUser, Trip, VehicleClass, Zone } from '../types';
import { STATE_LABEL, isTripActive, shareMessage } from '../lib/trips';
import { cn, waLink, when } from '../lib/utils';
import { formatKz } from '../lib/money';

interface TripsViewProps {
  user: SessionUser | null;
  trips: Trip[];
  zones: Zone[];
  classes: VehicleClass[];
  loading: boolean;
  onOpenTrip: (trip: Trip) => void;
  onLogin: () => void;
  onError: (message: string) => void;
}

type Filter = 'all' | 'done' | 'cancelled';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'done', label: 'Concluídas' },
  { id: 'cancelled', label: 'Canceladas' },
];

const stateChip = (state: Trip['state']) => {
  if (state === 'cancelled') return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300';
  if (state === 'rated' || state === 'ended') return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
  return 'bg-purple-100 text-purple-700 dark:bg-amber-400/15 dark:text-amber-300';
};

const matches = (t: Trip, f: Filter): boolean => {
  if (f === 'all') return true;
  if (f === 'cancelled') return t.state === 'cancelled';
  return t.state === 'ended' || t.state === 'rated';
};

/**
 * O histórico: o que foi pedido, o que custou, e como correu. O resumo do mês
 * é o primeiro número que a pessoa procura; os filtros existem porque «onde
 * está aquela viagem cancelada» é a segunda coisa.
 *
 * Partilhar vive aqui, na aba normal das viagens — é o gesto que se faz com o
 * carro à porta, não um ecrã à parte. O código de viagem nunca vai na
 * mensagem: quem o lê poderia começar a viagem no lugar da pessoa.
 */
export function TripsView({
  user, trips, zones, classes, loading, onOpenTrip, onLogin, onError,
}: TripsViewProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const summary = useMemo(() => {
    const now = new Date();
    const month = trips.filter((t) => {
      const d = new Date(t.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        && (t.state === 'ended' || t.state === 'rated');
    });
    return {
      count: month.length,
      total: month.reduce((sum, t) => sum + t.price_kz, 0),
      rated: month.filter((t) => (t.passenger_rating ?? 0) > 0).length,
    };
  }, [trips]);

  if (!user) {
    return (
      <Empty
        title="As suas viagens"
        text="Entre na conta para ver o histórico de viagens e entregas."
        action={<button onClick={onLogin} className="btn-main mt-4 h-12 w-full rounded-control text-body font-semibold">Entrar na minha conta</button>}
      />
    );
  }

  if (loading) {
    return <p className="py-16 text-center text-label text-zinc-500 dark:text-zinc-400">a carregar…</p>;
  }

  const visible = trips.filter((t) => matches(t, filter));
  const active = trips.filter((t) => isTripActive(t));

  const share = async (t: Trip, from: string, to: string) => {
    const text = shareMessage(t, from, to);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Viagem ${t.code}`, text });
        return;
      } catch {
        // O utilizador cancelou a folha do sistema: não é um erro a anunciar.
        return;
      }
    }
    window.open(waLink('', text), '_blank', 'noopener');
    onError('Abrimos o WhatsApp para enviar a viagem — a mensagem não leva o código.');
  };

  return (
    <div className="animate-enter space-y-4 pb-8">
      <div>
        <p className="eyebrow text-purple-700 dark:text-amber-400">O seu caminho</p>
        <h1 className="mt-1 font-display text-title font-medium leading-tight text-ink dark:text-white">
          Viagens
        </h1>
      </div>

      <div className="rounded-card bg-purple-600 p-5 text-white shadow-card dark:bg-[#3a1a6e]">
        <p className="text-caption font-semibold uppercase tracking-[0.18em] text-white/70">Este mês</p>
        <p className="mt-1 font-display text-stat font-medium leading-none">
          {summary.count} {summary.count === 1 ? 'viagem' : 'viagens'}
        </p>
        <p className="mt-1.5 text-label text-white/80">
          {summary.total > 0 ? `${formatKz(summary.total)} pagos` : 'Sem pagamentos este mês'}
          {summary.rated > 0 ? ` · ${summary.rated} avaliadas` : ''}
        </p>
      </div>

      {active.length > 0 && (
        <button
          onClick={() => onOpenTrip(active[0])}
          className="flex w-full items-center gap-3 rounded-card border border-purple-200 bg-purple-50 p-4 text-left dark:border-amber-400/40 dark:bg-amber-400/[0.08]"
        >
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-purple-600 text-white dark:bg-amber-400 dark:text-ink">
            <span className="absolute inset-0 rounded-full bg-purple-500/40 map-pulse dark:bg-amber-400/30" />
            <ChevronRight className="relative h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold text-ink dark:text-white">
              {active.length === 1 ? 'Viagem em curso' : `${active.length} viagens em curso`}
            </span>
            <span className="block text-label text-zinc-600 dark:text-amber-200/80">
              {STATE_LABEL[active[0].state]} · toque para voltar ao acompanhamento.
            </span>
          </span>
        </button>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/[0.06]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              'h-9 rounded-full text-label font-semibold transition-colors',
              filter === f.id
                ? 'bg-white text-ink shadow-sm dark:bg-white/15 dark:text-white'
                : 'text-zinc-500 dark:text-zinc-400',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Empty
          title={filter === 'all' ? 'Ainda sem viagens' : 'Nada nesta vista'}
          text={filter === 'all'
            ? 'Quando pedir a primeira viagem ou entrega, ela aparece aqui com preço, código e avaliação.'
            : 'Não há viagens neste filtro. Toque em «Todas» para ver o histórico completo.'}
        />
      ) : (
        // No PC a lista respira em duas colunas: um histórico é feito para ser
        // percorrido de olhos, e 672 px de cartões a um por linha obriga a
        // descer mais do que é preciso para ver uma semana.
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {visible.map((t) => {
            const from = zones.find((z) => z.id === t.from_zone_id)?.name ?? t.from_zone_id;
            const to = zones.find((z) => z.id === t.to_zone_id)?.name ?? t.to_zone_id;
            const cls = classes.find((c) => c.id === t.class_id)?.label;
            return (
              <div
                key={t.id}
                className="surface-card rounded-card p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('rounded-lg px-2 py-1 text-caption font-semibold', stateChip(t.state))}>
                    {STATE_LABEL[t.state]}
                  </span>
                  <span className="text-caption text-zinc-500 dark:text-zinc-400">{when(t.created_at)}</span>
                </div>

                <button onClick={() => onOpenTrip(t)} className="mt-2.5 block w-full text-left">
                  <div className="flex items-center gap-2 text-body">
                    <span className="truncate font-semibold text-ink dark:text-white">{from}</span>
                    <span className="shrink-0 font-bold text-purple-600 dark:text-amber-400">→</span>
                    <span className="truncate font-semibold text-ink dark:text-white">{to}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate text-caption text-zinc-500 dark:text-zinc-400">
                      {t.kind === 'entrega' ? 'Entrega' : 'Viagem'}
                      {cls ? ` · ${cls}` : ''} · {t.code}
                    </span>
                    <span className="shrink-0 text-body font-semibold text-purple-700 dark:text-amber-300">{formatKz(t.price_kz)}</span>
                  </div>
                  {(t.passenger_rating || t.driver_rating) && (
                    <div className="mt-1.5 flex items-center gap-3 text-caption font-medium">
                      {t.passenger_rating ? (
                        <span className="flex items-center gap-0.5 text-zinc-600 dark:text-zinc-300">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          Você: {t.passenger_rating}
                        </span>
                      ) : null}
                      {t.driver_rating ? (
                        <span className="flex items-center gap-0.5 text-zinc-500 dark:text-zinc-400">
                          <Star className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" />
                          Motorista: {t.driver_rating}
                        </span>
                      ) : null}
                    </div>
                  )}
                </button>

                <div className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-white/10">
                  <button
                    onClick={() => onOpenTrip(t)}
                    className="h-10 flex-1 rounded-control text-label font-semibold text-purple-700 dark:text-amber-300"
                  >
                    {isTripActive(t) ? 'Acompanhar' : 'Ver recibo'}
                  </button>
                  <button
                    onClick={() => void share(t, from, to)}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-control border border-zinc-200 px-3 text-label font-semibold text-ink dark:border-white/15 dark:text-white"
                  >
                    <Share2 className="h-4 w-4" /> Partilhar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="animate-enter rounded-card border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-[rgba(185,168,220,0.3)] dark:bg-white/[0.07]">
      <h2 className="text-lead font-semibold tracking-tight text-ink dark:text-white">{title}</h2>
      <p className="mt-2 text-label text-zinc-500 dark:text-zinc-400">{text}</p>
      {action}
    </div>
  );
}
