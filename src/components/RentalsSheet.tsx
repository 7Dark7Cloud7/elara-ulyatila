import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CarFrontIcon, CloseIcon, DemoFlaskIcon, KeyIcon, PinIcon, SearchIcon, SpinnerIcon, StarIcon,
} from './ElaraIcons';
import { supabase, rpcError } from '../lib/supabase';
import { useDemo } from '../lib/demoContext';
import type { Driver, Rental, RentalRequest, SessionUser, VehicleClass, Zone } from '../types';
import { Sheet } from './Sheet';
import { VehicleArt, vehicleKindFor } from './VehicleArt';
import { RentalBooking } from './RentalBooking';
import { RentalDesk } from './RentalDesk';
import { REQUEST_STATE, fetchMyRequests, fetchOwnerRequests, fetchRentals, planText } from '../lib/rentals';
import { filterRentals, type RentalFilterMode } from '../lib/localExtras';
import { formatKz } from '../lib/money';
import { ratingBadge } from '../lib/reputation';
import { cn, when } from '../lib/utils';

interface RentalsSheetProps {
  open: boolean;
  onClose: () => void;
  user: SessionUser | null;
  zones: Zone[];
  classes: VehicleClass[];
  driver: Driver | null;
  onLogin: () => void;
  onOpenDemo?: () => void;
  onError: (message: string) => void;
}

type Panel = 'browse' | 'mine' | 'desk';

/**
 * A sala do aluguer: por hora, dia, semana ou mês — com motorista ou para a
 * pessoa própria conduzir. Não é um tipo de viagem, por isso não vai na barra
 * de baixo (cinco botões não cabem em 360 px); abre-se a partir do pedido.
 */
export function RentalsSheet({
  open, onClose, user, zones, classes, driver, onLogin, onOpenDemo, onError,
}: RentalsSheetProps) {
  const demoCtx = useDemo();
  const isDemo = !!demoCtx?.isDemo;
  const [panel, setPanel] = useState<Panel>('browse');
  const [rows, setRows] = useState<Rental[]>([]);
  const [mine, setMine] = useState<RentalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [picked, setPicked] = useState<Rental | null>(null);
  const [pendingDesk, setPendingDesk] = useState(0);
  const [modeFilter, setModeFilter] = useState<RentalFilterMode>('all');
  const [query, setQuery] = useState('');

  const atWork = driver?.status === 'approved' ? driver : null;

  const load = useCallback(async () => {
    if (isDemo && demoCtx) {
      setRows(demoCtx.demoState.rentals);
      setMine(demoCtx.demoState.rentalRequests);
      setMissing(false);
      setPendingDesk(0);
      setLoading(false);
      return;
    }
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const [list, asks, owner] = await Promise.all([
      fetchRentals(),
      fetchMyRequests(user.uid),
      atWork ? fetchOwnerRequests(atWork.id) : Promise.resolve({ rows: [], missing: false }),
    ]);
    setRows(list.rows);
    setMissing(list.missing);
    setMine(asks.rows);
    setPendingDesk(owner.rows.filter((q) => q.state === 'sent').length);
    setLoading(false);
  }, [user, atWork, isDemo, demoCtx]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const cancel = async (req: RentalRequest) => {
    if (isDemo && demoCtx) {
      demoCtx.setDemoState((prev) => ({
        ...prev,
        rentalRequests: prev.rentalRequests.map((q) => (q.id === req.id ? { ...q, state: 'cancelled' } : q)),
      }));
      return;
    }
    const { error } = await supabase.rpc('tr_cancel_rental_request', { p_request_id: req.id });
    if (error) { onError(rpcError(error)); return; }
    load();
  };

  const pendingMine = mine.filter((r) => r.state === 'sent').length;

  const filteredRows = useMemo(
    () => filterRentals(rows, { mode: modeFilter, query, zoneName: (id) => zoneName(zones, id) }),
    [rows, modeFilter, query, zones],
  );

  return (
    <Sheet open={open} title="Alugar um carro" onClose={() => { setPicked(null); onClose(); }} tall>
      {!user ? (
        <div className="py-4 space-y-4 text-center">
          <div className="surface-card rounded-card overflow-hidden">
            <div className="flex items-end justify-center h-[126px] bg-gradient-to-b from-purple-100/80 to-white dark:from-purple-950/60 dark:to-vault px-4">
              <VehicleArt kind="suv" label="Aluguer de carro Elara" className="w-[220px] h-auto translate-y-[6px]" />
            </div>
            <div className="p-4">
              <p className="font-display text-lg font-medium text-ink dark:text-white">
                Aluguer por hora, dia ou semana
              </p>
              <p className="text-label text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Com motorista ou para conduzir. Entre na sua conta Elara para ver os carros disponíveis e combinar directamente com o dono.
              </p>
            </div>
          </div>
          <div className="space-y-2.5">
            <button onClick={onLogin} className="btn-main w-full h-12 rounded-control font-semibold">
              Entrar na conta Elara
            </button>
            {onOpenDemo && (
              <button
                type="button"
                onClick={() => { onClose(); onOpenDemo(); }}
                className="surface-outline w-full h-11 rounded-control text-label font-semibold text-purple-700 dark:text-amber-300 flex items-center justify-center gap-2"
              >
                <DemoFlaskIcon className="w-4 h-4 shrink-0" />
                Ligar modo demonstração nesta app
              </button>
            )}
          </div>
        </div>
      ) : picked ? (
        <RentalBooking
          rental={picked}
          user={user}
          zones={zones}
          onBack={() => setPicked(null)}
          onBooked={() => { setPicked(null); setPanel('mine'); load(); }}
          onError={onError}
        />
      ) : (
        <div className="pb-2">
          {missing ? (
            <div className="rounded-card border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4">
              <p className="font-bold text-amber-800 dark:text-amber-200">O aluguer ainda não está ligado</p>
              <p className="text-[13px] font-medium text-amber-800/90 dark:text-amber-200/90 mt-1">
                A migração 0003 (frota, Hiace, Canter e aluguer) tem de ser aplicada no Supabase antes desta montra existir.
              </p>
            </div>
          ) : (
            <>
              <div className={cn('grid gap-1.5 rounded-control bg-zinc-100 dark:bg-white/[0.06] p-1', atWork ? 'grid-cols-3' : 'grid-cols-2')}>
                {([['browse', 'Carros'], ...(atWork ? [['desk', 'Meu carro'] as const] : []), ['mine', 'Meus pedidos']] as const).map((t) => {
                  const [id, label] = t as [Panel, string];
                  return (
                    <button
                      key={id}
                      onClick={() => setPanel(id)}
                      aria-pressed={panel === id}
                      className={cn(
                        'h-10 rounded-[12px] font-semibold text-label transition-colors flex items-center justify-center',
                        panel === id
                          ? 'bg-purple-600 text-white shadow-card dark:bg-amber-400 dark:text-ink'
                          : 'text-zinc-600 dark:text-zinc-300',
                      )}
                    >
                      {label}
                      {id === 'mine' && pendingMine > 0 && (
                        <span className="ml-1.5 inline-flex min-w-5 h-5 px-1 rounded-full bg-amber-400 text-ink text-[11px] font-bold items-center justify-center">
                          {pendingMine}
                        </span>
                      )}
                      {id === 'desk' && pendingDesk > 0 && (
                        <span className="ml-1.5 inline-flex min-w-5 h-5 px-1 rounded-full bg-purple-600 text-white text-[11px] font-bold items-center justify-center">
                          {pendingDesk}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {loading && (
                <p className="text-center text-zinc-500 dark:text-zinc-400 py-10 text-sm flex items-center justify-center gap-2">
                  <SpinnerIcon className="w-4 h-4 animate-spin" /> a procurar carros…
                </p>
              )}

              {!loading && panel === 'browse' && (
                rows.length === 0 ? (
                  <Empty
                    title="Ainda não há carros para alugar"
                    text={atWork
                      ? 'Comece pela aba «Meu carro» e publique o seu — ele aparece aqui para toda a gente.'
                      : 'Assim que um motorista aprovado publicar um carro, ele aparece nesta lista.'}
                  />
                ) : (
                  <div className="space-y-3 mt-3">
                    {/* Filtros rápidos e pesquisa */}
                    <div className="space-y-2">
                      <div className="relative">
                        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Procurar modelo, zona ou dono…"
                          aria-label="Procurar carros para alugar"
                          className="w-full h-11 rounded-control bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/15 pl-10 pr-10 text-label text-ink dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none focus:border-purple-500 dark:focus:border-amber-400 [&::-webkit-search-cancel-button]:appearance-none"
                        />
                        {query && (
                          <button
                            type="button"
                            onClick={() => setQuery('')}
                            aria-label="Limpar pesquisa"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400"
                          >
                            <CloseIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([['all', 'Todos'], ['driver', 'Com motorista'], ['self', 'Para conduzir']] as const).map(([m, label]) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setModeFilter(m)}
                            aria-pressed={modeFilter === m}
                            className={cn(
                              'h-9 rounded-control border text-caption font-semibold transition-colors',
                              modeFilter === m
                                ? 'border-purple-500 bg-purple-50 text-purple-700 dark:border-amber-400 dark:bg-amber-400/[0.14] dark:text-amber-200'
                                : 'border-zinc-200 dark:border-white/15 bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredRows.length === 0 ? (
                      <div className="surface-card rounded-card p-5 text-center space-y-2">
                        <p className="text-body font-semibold text-ink dark:text-white">
                          Nenhum carro corresponde ao filtro
                        </p>
                        <button
                          type="button"
                          onClick={() => { setModeFilter('all'); setQuery(''); }}
                          className="text-label font-semibold text-purple-600 dark:text-amber-400"
                        >
                          Mostrar todos ({rows.length})
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {filteredRows.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setPicked(r)}
                            className="surface-card w-full text-left rounded-card p-3 flex gap-3 transition-transform active:scale-[0.99]"
                          >
                            <span className="flex items-end justify-center w-[96px] h-[68px] shrink-0 rounded-control bg-purple-50/70 dark:bg-white/[0.05] overflow-hidden">
                              <VehicleArt kind={vehicleKindFor(r.class_id)} className="w-[92px] h-auto translate-y-[6px]" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-body text-ink dark:text-white truncate">{r.title}</span>
                              <span className="block text-caption font-medium text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                                {r.tr_driver?.public_name ?? 'Motorista'} · {r.zone_id ? zoneName(zones, r.zone_id) : 'zona a combinar'}
                              </span>
                              <span className="flex flex-wrap gap-1 mt-1.5">
                                {r.with_driver && <Badge>com motorista</Badge>}
                                {r.allows_self_drive && <Badge>para conduzir</Badge>}
                                {r.min_hours > 1 && <Badge>mín. {r.min_hours}h</Badge>}
                              </span>
                            </span>
                            <span className="text-right shrink-0">
                              <span className="block font-bold text-purple-700 dark:text-amber-300 tabular-nums">{formatKz(r.price_day_kz)}</span>
                              <span className="block text-caption font-medium text-zinc-500 dark:text-zinc-400">/ dia</span>
                              {r.tr_driver && (
                                <span className="flex items-center justify-end gap-0.5 text-caption font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                  <StarIcon filled className="w-3 h-3 text-amber-500" /> {ratingBadge(r.tr_driver)}
                                </span>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}

              {!loading && panel === 'mine' && (
                mine.length === 0 ? (
                  <Empty title="Sem pedidos enviados" text="Escolha um carro na aba «Carros» e envie o pedido ao dono." />
                ) : (
                  <div className="space-y-2.5 mt-3">
                    {mine.map((q) => (
                      <div key={q.id} className="surface-card rounded-card p-3.5">
                        <p className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-body text-ink dark:text-white truncate">
                            {q.rental?.title ?? 'Carro'}
                          </span>
                          <span className={cn('text-caption font-semibold shrink-0',
                            q.state === 'accepted' ? 'text-purple-700 dark:text-amber-300'
                              : q.state === 'sent' ? 'text-amber-700 dark:text-amber-400'
                              : 'text-zinc-500 dark:text-zinc-400')}>
                            {REQUEST_STATE[q.state]}
                          </span>
                        </p>
                        <p className="text-caption font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {planText(q.plan, q.qty)} · {q.with_driver ? 'com motorista' : 'para conduzir'} · {when(q.start_at)}
                        </p>
                        <p className="flex items-center justify-between mt-2">
                          <span className="text-caption font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                            <PinIcon className="w-3.5 h-3.5" /> {q.pickup_zone_id ? zoneName(zones, q.pickup_zone_id) : 'a combinar'}
                          </span>
                          <span className="font-semibold text-purple-700 dark:text-amber-300 tabular-nums">{formatKz(q.price_kz)}</span>
                        </p>
                        {q.state === 'sent' && (
                          <button
                            onClick={() => cancel(q)}
                            className="mt-2.5 w-full h-10 rounded-control font-semibold text-label text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-center justify-center gap-1.5"
                          >
                            <CloseIcon className="w-4 h-4" /> Desistir do pedido
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {!loading && panel === 'desk' && atWork && (
                <div className="mt-3">
                  <RentalDesk driver={atWork} classes={classes} zones={zones} onError={onError} />
                </div>
              )}

              {!loading && panel === 'browse' && rows.length > 0 && (
                <p className="text-caption font-medium text-zinc-500 dark:text-zinc-400 text-center mt-4 flex items-center justify-center gap-1.5">
                  <KeyIcon className="w-3.5 h-3.5 shrink-0" />
                  O preço é do dono do carro. O pagamento combina-se com ele — a app não cobra nem guarda.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

const zoneName = (zones: Zone[], id?: string | null) =>
  zones.find((z) => z.id === id)?.name ?? 'zona a combinar';

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md bg-purple-100/90 dark:bg-amber-400/[0.14] px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:text-amber-200">
    {children}
  </span>
);

const Empty = ({ title, text }: { title: string; text: string }) => (
  <div className="rounded-card border border-dashed border-zinc-300 dark:border-white/20 p-6 text-center mt-3">
    <CarFrontIcon className="w-7 h-7 text-zinc-400 dark:text-zinc-500 mx-auto" />
    <p className="font-semibold text-ink dark:text-white mt-2">{title}</p>
    <p className="text-label text-zinc-500 dark:text-zinc-400 mt-1">{text}</p>
  </div>
);
