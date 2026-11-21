import { useMemo, useState } from 'react';
import {
  ChevronRightIcon, CloseIcon, RepeatIcon, SearchIcon, ShareIcon, StarIcon,
} from '../components/ElaraIcons';
import type { SessionUser, Trip, VehicleClass, Zone } from '../types';
import { STATE_LABEL, isTripActive, shareMessage } from '../lib/trips';
import { filterTrips, type TripKindFilter, type TripStatusFilter } from '../lib/localExtras';
import { VehicleArt, vehicleKindFor } from '../components/VehicleArt';
import { cn, waLink, when } from '../lib/utils';
import { formatKz } from '../lib/money';

interface TripsViewProps {
  user: SessionUser | null;
  trips: Trip[];
  zones: Zone[];
  classes: VehicleClass[];
  loading: boolean;
  onOpenTrip: (trip: Trip) => void;
  onRepeatTrip?: (trip: Trip) => void;
  onLogin: () => void;
  onError: (message: string) => void;
}

const STATUS_FILTERS: Array<{ id: TripStatusFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'done', label: 'Concluídas' },
  { id: 'cancelled', label: 'Canceladas' },
];

const KIND_FILTERS: Array<{ id: TripKindFilter; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'passageiro', label: 'Viagens' },
  { id: 'entrega', label: 'Entregas' },
];

const stateChip = (state: Trip['state']) => {
  if (state === 'cancelled') return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300';
  if (state === 'rated' || state === 'ended') return 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300';
  return 'bg-purple-100 text-purple-700 dark:bg-amber-400/15 dark:text-amber-300';
};

/**
 * O histórico: o que foi pedido, o que custou, e como correu. Inclui pesquisa
 * rápida por zona/código, filtro por tipo (Viagens / Entregas) e botão
 * «Repetir» num toque para voltar a pedir a mesma rota.
 */
export function TripsView({
  user, trips, zones, classes, loading, onOpenTrip, onRepeatTrip, onLogin, onError,
}: TripsViewProps) {
  const [filter, setFilter] = useState<TripStatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<TripKindFilter>('all');
  const [query, setQuery] = useState('');

  const zoneName = useMemo(() => {
    const map = new Map(zones.map((z) => [z.id, z.name]));
    return (id: string) => map.get(id) ?? id;
  }, [zones]);

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

  const visible = useMemo(
    () => filterTrips(trips, { status: filter, kind: kindFilter, query, zoneName }),
    [trips, filter, kindFilter, query, zoneName],
  );

  if (!user) {
    return (
      <div className="animate-enter space-y-4 pb-8">
        <div>
          <p className="eyebrow text-purple-700 dark:text-amber-400">O seu caminho</p>
          <h1 className="mt-1 font-display text-title font-medium leading-tight text-ink dark:text-white">
            Viagens
          </h1>
        </div>
        <Empty
          title="As suas viagens e entregas"
          text="Entre na conta Elara para consultar recibos, avaliar motoristas e repetir as suas rotas num toque."
          art={<VehicleArt kind="sedan" className="mx-auto w-36 h-auto mb-2" />}
          action={<button type="button" onClick={onLogin} className="btn-main mt-4 h-12 w-full rounded-control text-body font-semibold">Entrar na minha conta</button>}
        />
      </div>
    );
  }

  if (loading) {
    return <p className="py-16 text-center text-label text-zinc-500 dark:text-zinc-400">a carregar…</p>;
  }

  const active = trips.filter((t) => isTripActive(t));

  const share = async (t: Trip, from: string, to: string) => {
    const text = shareMessage(t, from, to);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Viagem ${t.code}`, text });
        return;
      } catch {
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
        <p className="text-caption font-semibold uppercase tracking-[0.18em] text-white/75">Este mês</p>
        <p className="mt-1 font-display text-stat font-medium leading-none">
          {summary.count} {summary.count === 1 ? 'viagem' : 'viagens'}
        </p>
        <p className="mt-1.5 text-label text-white/85">
          {summary.total > 0 ? `${formatKz(summary.total)} pagos` : 'Sem pagamentos este mês'}
          {summary.rated > 0 ? ` · ${summary.rated} avaliadas` : ''}
        </p>
      </div>

      {active.length > 0 && (
        <button
          type="button"
          onClick={() => onOpenTrip(active[0])}
          className="flex w-full items-center gap-3 rounded-card border border-purple-200 bg-purple-50 p-4 text-left dark:border-amber-400/40 dark:bg-amber-400/[0.08]"
        >
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-purple-600 text-white dark:bg-amber-400 dark:text-ink">
            <span className="absolute inset-0 rounded-full bg-purple-500/40 map-pulse dark:bg-amber-400/30" />
            <ChevronRightIcon className="relative h-5 w-5" />
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

      {/* Pesquisa e filtros */}
      {trips.length > 0 && (
        <div className="space-y-2.5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Procurar bairro, código ou motorista…"
              aria-label="Procurar no histórico de viagens"
              className="surface-outline h-11 w-full rounded-control pl-10 pr-10 text-body outline-none focus:border-purple-400 placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Limpar pesquisa"
                className="tap-pad absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full text-zinc-400"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/[0.06]">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
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

          <div className="flex gap-1.5" role="group" aria-label="Tipo de serviço">
            {KIND_FILTERS.map((kf) => (
              <button
                key={kf.id}
                type="button"
                onClick={() => setKindFilter(kf.id)}
                aria-pressed={kindFilter === kf.id}
                className={cn(
                  'h-9 rounded-full border px-3.5 text-label font-semibold transition-colors',
                  kindFilter === kf.id
                    ? 'border-purple-600 bg-purple-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-ink'
                    : 'surface-outline text-zinc-600 dark:text-zinc-300',
                )}
              >
                {kf.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <Empty
          title={trips.length === 0 ? 'Ainda sem viagens' : 'Nada nesta vista'}
          text={trips.length === 0
            ? 'Quando pedir a primeira viagem ou entrega, ela aparece aqui com preço, código e avaliação.'
            : 'Não há viagens com estes filtros. Limpe a pesquisa ou toque em «Todas».'}
        />
      ) : (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {visible.map((t) => {
            const from = zoneName(t.from_zone_id);
            const to = zoneName(t.to_zone_id);
            const cls = classes.find((c) => c.id === t.class_id);
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

                <button type="button" onClick={() => onOpenTrip(t)} className="mt-2.5 block w-full text-left">
                  <div className="flex items-center gap-2 text-body">
                    <span className="truncate font-semibold text-ink dark:text-white">{from}</span>
                    <span className="shrink-0 font-bold text-purple-600 dark:text-amber-400">→</span>
                    <span className="truncate font-semibold text-ink dark:text-white">{to}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate text-caption text-zinc-500 dark:text-zinc-400">
                      <VehicleArt kind={vehicleKindFor(t.class_id, cls?.icon)} className="h-4 w-7 shrink-0" />
                      {t.kind === 'entrega' ? 'Entrega' : 'Viagem'}
                      {cls?.label ? ` · ${cls.label}` : ''} · {t.code}
                    </span>
                    <span className="shrink-0 text-body font-semibold text-purple-700 dark:text-amber-300">{formatKz(t.price_kz)}</span>
                  </div>
                  {(t.passenger_rating || t.driver_rating) && (
                    <div className="mt-1.5 flex items-center gap-3 text-caption font-medium">
                      {t.passenger_rating ? (
                        <span className="flex items-center gap-0.5 text-zinc-600 dark:text-zinc-300">
                          <StarIcon filled className="h-3.5 w-3.5 text-amber-400" />
                          Você: {t.passenger_rating}
                        </span>
                      ) : null}
                      {t.driver_rating ? (
                        <span className="flex items-center gap-0.5 text-zinc-500 dark:text-zinc-400">
                          <StarIcon className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" />
                          Motorista: {t.driver_rating}
                        </span>
                      ) : null}
                    </div>
                  )}
                </button>

                <div className="mt-3 flex items-center gap-2 border-t border-zinc-200 pt-3 dark:border-[rgba(185,168,220,0.2)]">
                  <button
                    type="button"
                    onClick={() => onOpenTrip(t)}
                    className="h-10 flex-1 rounded-control text-label font-semibold text-purple-700 dark:text-amber-300"
                  >
                    {isTripActive(t) ? 'Acompanhar' : 'Recibo'}
                  </button>
                  {onRepeatTrip && !isTripActive(t) && (
                    <button
                      type="button"
                      onClick={() => onRepeatTrip(t)}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-control border border-purple-200 bg-purple-50 px-3 text-label font-semibold text-purple-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200"
                    >
                      <RepeatIcon className="h-3.5 w-3.5" /> Repetir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void share(t, from, to)}
                    aria-label={`Partilhar viagem ${t.code}`}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-control surface-outline px-3 text-label font-semibold"
                  >
                    <ShareIcon className="h-3.5 w-3.5" />
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

function Empty({ title, text, art, action }: { title: string; text: string; art?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="animate-enter surface-card rounded-card p-8 text-center">
      {art}
      <h2 className="text-lead font-semibold tracking-tight text-ink dark:text-white">{title}</h2>
      <p className="mt-2 text-label text-zinc-500 dark:text-zinc-400">{text}</p>
      {action}
    </div>
  );
}
