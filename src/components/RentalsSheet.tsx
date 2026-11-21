import { useCallback, useEffect, useState } from 'react';
import { CarFront, KeyRound, Loader2, MapPin, Star, X } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import type { Driver, Rental, RentalRequest, SessionUser, VehicleClass, Zone } from '../types';
import { Sheet } from './Sheet';
import { VehicleArt, vehicleKindFor } from './VehicleArt';
import { RentalBooking } from './RentalBooking';
import { RentalDesk } from './RentalDesk';
import { REQUEST_STATE, fetchMyRequests, fetchOwnerRequests, fetchRentals, planText } from '../lib/rentals';
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
  onError: (message: string) => void;
}

type Panel = 'browse' | 'mine' | 'desk';

/**
 * A sala do aluguer: por hora, dia, semana ou mês — com motorista ou para a
 * pessoa própria conduzir. Não é um tipo de viagem, por isso não vai na barra
 * de baixo (cinco botões não cabem em 360 px); abre-se a partir do pedido.
 */
export function RentalsSheet({
  open, onClose, user, zones, classes, driver, onLogin, onError,
}: RentalsSheetProps) {
  const [panel, setPanel] = useState<Panel>('browse');
  const [rows, setRows] = useState<Rental[]>([]);
  const [mine, setMine] = useState<RentalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [picked, setPicked] = useState<Rental | null>(null);
  const [pendingDesk, setPendingDesk] = useState(0);

  const atWork = driver?.status === 'approved' ? driver : null;

  const load = useCallback(async () => {
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
  }, [user, atWork]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const cancel = async (req: RentalRequest) => {
    const { error } = await supabase.rpc('tr_cancel_rental_request', { p_request_id: req.id });
    if (error) { onError(rpcError(error)); return; }
    load();
  };

  const pendingMine = mine.filter((r) => r.state === 'sent').length;

  return (
    <Sheet open={open} title="Alugar um carro" onClose={() => { setPicked(null); onClose(); }} tall>
      {!user ? (
        <div className="py-6 text-center">
          <CarFront className="w-9 h-9 text-purple-600 dark:text-purple-400 mx-auto" />
          <p className="font-bold text-zinc-900 dark:text-white mt-2">Aluguer por hora ou dia</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 px-4">
            Entre na conta Elara para ver os carros disponíveis e enviar o pedido ao dono.
          </p>
          <button onClick={onLogin} className="btn-main mt-4 w-full h-12 rounded-2xl font-bold">
            Entrar
          </button>
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
            <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4">
              <p className="font-bold text-amber-800 dark:text-amber-200">O aluguer ainda não está ligado</p>
              <p className="text-[13px] font-bold text-amber-800/90 dark:text-amber-200/90 mt-1">
                A migração 0003 (frota, Hiace, Canter e aluguer) tem de ser aplicada no Supabase antes desta montra existir.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-1.5">
                {([['browse', 'Carros'], ...(atWork ? [['desk', 'Meu carro'] as const] : []), ['mine', 'Meus pedidos']] as const).map((t) => {
                  const [id, label] = t as [Panel, string];
                  return (
                    <button
                      key={id}
                      onClick={() => setPanel(id)}
                      aria-pressed={panel === id}
                      className={cn(
                        'h-10 rounded-xl font-bold text-sm transition-colors',
                        panel === id ? 'bg-purple-600 text-white shadow-card'
                          : 'text-zinc-500 dark:text-zinc-400',
                      )}
                    >
                      {label}
                      {id === 'mine' && pendingMine > 0 && (
                        <span className="ml-1.5 inline-flex min-w-5 h-5 px-1 rounded-full bg-amber-400 text-amber-950 text-[12px] items-center justify-center">
                          {pendingMine}
                        </span>
                      )}
                      {id === 'desk' && pendingDesk > 0 && (
                        <span className="ml-1.5 inline-flex min-w-5 h-5 px-1 rounded-full bg-purple-600 text-white text-[12px] items-center justify-center">
                          {pendingDesk}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {loading && (
                <p className="text-center text-zinc-500 dark:text-zinc-400 py-10 text-sm flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> a procurar carros…
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
                  <div className="space-y-2.5 mt-3">
                    {rows.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setPicked(r)}
                        className="w-full text-left rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 flex gap-3 transition-transform active:scale-[0.99]"
                      >
                        <span className="flex items-end justify-center w-[96px] h-[68px] shrink-0 rounded-xl bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <VehicleArt kind={vehicleKindFor(r.class_id)} className="w-[92px] h-auto translate-y-[6px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-[14px] text-zinc-900 dark:text-white truncate">{r.title}</span>
                          <span className="block text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                            {r.tr_driver?.public_name ?? 'Motorista'} · {r.zone_id ? zoneName(zones, r.zone_id) : 'zona a combinar'}
                          </span>
                          <span className="flex flex-wrap gap-1 mt-1.5">
                            {r.with_driver && <Badge>com motorista</Badge>}
                            {r.allows_self_drive && <Badge>para conduzir</Badge>}
                            {r.min_hours > 1 && <Badge>mín. {r.min_hours}h</Badge>}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <span className="block font-bold text-purple-600 dark:text-purple-400">{formatKz(r.price_day_kz)}</span>
                          <span className="block text-[12px] font-medium text-zinc-500 dark:text-zinc-400">/ dia</span>
                          {r.tr_driver && (
                            <span className="flex items-center justify-end gap-0.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                              <Star className="w-3 h-3 fill-current text-amber-500" /> {ratingBadge(r.tr_driver)}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              )}

              {!loading && panel === 'mine' && (
                mine.length === 0 ? (
                  <Empty title="Sem pedidos enviados" text="Escolha um carro na aba «Carros» e envie o pedido ao dono." />
                ) : (
                  <div className="space-y-2.5 mt-3">
                    {mine.map((q) => (
                      <div key={q.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
                        <p className="flex items-start justify-between gap-2">
                          <span className="font-bold text-[14px] text-zinc-900 dark:text-white truncate">
                            {q.rental?.title ?? 'Carro'}
                          </span>
                          <span className={cn('text-[12px] font-semibold shrink-0',
                            q.state === 'accepted' ? 'text-purple-600 dark:text-purple-400'
                              : q.state === 'sent' ? 'text-amber-600 dark:text-amber-400'
                              : 'text-zinc-500 dark:text-zinc-400')}>
                            {REQUEST_STATE[q.state]}
                          </span>
                        </p>
                        <p className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {planText(q.plan, q.qty)} · {q.with_driver ? 'com motorista' : 'para conduzir'} · {when(q.start_at)}
                        </p>
                        <p className="flex items-center justify-between mt-2">
                          <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> {q.pickup_zone_id ? zoneName(zones, q.pickup_zone_id) : 'a combinar'}
                          </span>
                          <span className="font-semibold text-purple-600 dark:text-purple-400">{formatKz(q.price_kz)}</span>
                        </p>
                        {q.state === 'sent' && (
                          <button
                            onClick={() => cancel(q)}
                            className="mt-2 w-full h-10 rounded-xl font-semibold text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-center justify-center gap-1.5"
                          >
                            <X className="w-4 h-4" /> Desistir do pedido
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
                <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 text-center mt-4 flex items-center justify-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
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
  <span className="rounded-full bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 text-[12px] font-semibold text-purple-700 dark:text-purple-300">
    {children}
  </span>
);

const Empty = ({ title, text }: { title: string; text: string }) => (
  <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center mt-3">
    <CarFront className="w-7 h-7 text-zinc-300 dark:text-zinc-600 mx-auto" />
    <p className="font-bold text-zinc-900 dark:text-white mt-2">{title}</p>
    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">{text}</p>
  </div>
);
