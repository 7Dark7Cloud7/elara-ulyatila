import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, Star, UserRound, Wallet } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import type { Rental, RentalPlan, RentalQuote, SessionUser, Zone } from '../types';
import { VehicleArt, vehicleKindFor } from './VehicleArt';
import { ZonePicker } from './ZonePicker';
import { PLANS, PLAN_LABEL, QTY_LABEL, defaultStart, planText, quoteRental, toMs } from '../lib/rentals';
import { formatKz } from '../lib/money';
import { ratingBadge } from '../lib/reputation';
import { cn, OFF } from '../lib/utils';

interface RentalBookingProps {
  rental: Rental;
  user: SessionUser;
  zones: Zone[];
  onBack: () => void;
  onBooked: () => void;
  onError: (message: string) => void;
}

/**
 * Fechar um aluguer. O preço nunca sai daqui — vem do tr_rental_quote, porque
 * é o servidor que sabe quanto vale uma hora de um carro e quanto fica para o
 * dono. O que a pessoa vê no ecrã é o número que o dono recebe.
 */
export function RentalBooking({ rental, user, zones, onBack, onBooked, onError }: RentalBookingProps) {
  const both = rental.with_driver && rental.allows_self_drive;
  const [plan, setPlan] = useState<RentalPlan>('day');
  const [qty, setQty] = useState(1);
  const [withDriver, setWithDriver] = useState(rental.with_driver || !rental.allows_self_drive);
  const [start, setStart] = useState(defaultStart());
  const [pickup, setPickup] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<RentalQuote | null>(null);
  const [quoting, setQuoting] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setQuoting(true);
    const t = window.setTimeout(async () => {
      const q = await quoteRental(rental.id, plan, qty, withDriver);
      if (!alive) return;
      setQuote(q);
      setQuoting(false);
    }, 260);
    return () => { alive = false; window.clearTimeout(t); };
  }, [rental.id, plan, qty, withDriver]);

  const canBook = !!quote && !quoting && !busy && !!pickup && start.length >= 16;

  const book = async () => {
    if (!canBook) return;
    setBusy(true);
    const { error } = await supabase.rpc('tr_book_rental', {
      p_rental_id: rental.id,
      p_plan: plan,
      p_qty: qty,
      p_with_driver: withDriver,
      p_start_at: toMs(start),
      p_pickup_zone_id: pickup,
      p_note: note.trim(),
    });
    setBusy(false);
    if (error) { onError(rpcError(error)); return; }
    onBooked();
  };

  const owner = rental.tr_driver;
  const maxQty = plan === 'hour' ? 24 : plan === 'day' ? 30 : plan === 'week' ? 8 : 6;

  const ladder = useMemo(() => [
    { p: 'hour' as RentalPlan, hint: 'mínimo ' + rental.min_hours + 'h' },
    { p: 'day' as RentalPlan, hint: formatKz(rental.price_day_kz) },
    { p: 'week' as RentalPlan, hint: '6 dias' },
    { p: 'month' as RentalPlan, hint: '20 dias' },
  ], [rental.min_hours, rental.price_day_kz]);

  return (
    <div className="animate-enter">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-[13px] font-semibold text-purple-700 dark:text-purple-300 mb-3"
      >
        <ChevronLeft className="w-4 h-4" /> Todos os carros
      </button>

      <div className={cn(
        'rounded-3xl overflow-hidden border shadow-sm',
        'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700',
      )}>
        <div className="relative flex items-end justify-center h-[120px] bg-gradient-to-b from-purple-100 to-white dark:from-purple-950/60 dark:to-zinc-900">
          <VehicleArt
            kind={vehicleKindFor(rental.class_id)}
            label={rental.title}
            className="w-[240px] h-auto translate-y-[10px] animate-drive"
          />
          <span className="absolute top-3 right-3 rounded-full bg-white/90 dark:bg-zinc-900/90 px-2.5 py-1 text-[12px] font-semibold text-purple-700 dark:text-purple-300 shadow">
            {formatKz(rental.price_day_kz)} / dia
          </span>
        </div>
        <div className="p-4">
          <h3 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white leading-tight">{rental.title}</h3>
          {rental.blurb && (
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">{rental.blurb}</p>
          )}
          {owner && (
            <p className="flex items-center gap-2 text-[12px] font-bold text-zinc-600 dark:text-zinc-300 mt-2">
              <UserRound className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              {owner.public_name}
              <span className="flex items-center gap-0.5">
                <Star className="w-3.5 h-3.5 fill-current text-amber-500" />
                {ratingBadge(owner)}
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">· {owner.model}</span>
            </p>
          )}
        </div>
      </div>

      {/* Plano */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        {PLANS.map((p) => (
          <button
            key={p}
            onClick={() => { setPlan(p); setQty(p === 'hour' ? Math.max(rental.min_hours, 3) : 1); }}
            aria-pressed={plan === p}
            className={cn(
              'rounded-2xl border py-2 text-center transition-colors',
              plan === p
                ? 'bg-purple-600 border-purple-600 text-white shadow-card'
                : 'bg-white dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300',
            )}
          >
            <span className="block text-[13px] font-semibold capitalize">{PLAN_LABEL[p]}</span>
            <span className={cn('block text-[12px] font-medium', plan === p ? 'text-purple-100' : 'text-zinc-500 dark:text-zinc-400')}>
              {ladder.find((l) => l.p === p)?.hint}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3">
        <span className="font-bold text-sm text-zinc-700 dark:text-zinc-200">{QTY_LABEL[plan]}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos"
            className="tap-pad w-9 h-9 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-bold tracking-tight text-lg">−</button>
          <span className="font-bold tracking-tight text-lg w-7 text-center">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="Mais"
            className="tap-pad w-9 h-9 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-bold tracking-tight text-lg">+</button>
        </div>
      </div>

      {/* Conduz quem? */}
      {(both || rental.with_driver || rental.allows_self_drive) && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            onClick={() => rental.with_driver && setWithDriver(true)}
            disabled={!rental.with_driver}
            aria-pressed={withDriver}
            className={cn(
              'h-12 rounded-2xl border font-bold text-sm transition-colors',
              withDriver ? 'bg-purple-100 dark:bg-purple-900/40 border-purple-400 text-purple-800 dark:text-purple-200'
                : 'bg-white dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300',
              !rental.with_driver && 'opacity-40',
            )}
          >
            Com motorista
          </button>
          <button
            onClick={() => rental.allows_self_drive && setWithDriver(false)}
            disabled={!rental.allows_self_drive}
            aria-pressed={!withDriver}
            className={cn(
              'h-12 rounded-2xl border font-bold text-sm transition-colors',
              !withDriver ? 'bg-purple-100 dark:bg-purple-900/40 border-purple-400 text-purple-800 dark:text-purple-200'
                : 'bg-white dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300',
              !rental.allows_self_drive && 'opacity-40',
            )}
          >
            Para eu conduzir
          </button>
        </div>
      )}

      <div className="mt-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 space-y-3">
        <label className="block">
          <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">Começa a</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 w-full h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 outline-none focus:border-purple-400"
          />
        </label>
        <ZonePicker label="Onde levanta o carro" value={pickup} zones={zones} onChange={setPickup} />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 400))}
          rows={2}
          placeholder="Para que é? (ex.: mudança de casa para o Kilamba, preciso às 8h)"
          className="w-full rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 outline-none focus:border-purple-400"
        />
      </div>

      {/* O preço do servidor, com as linhas de onde ele vem. */}
      <div className="mt-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        {quoting || !quote ? (
          <p className="p-4 text-sm font-bold text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> a calcular o preço…
          </p>
        ) : (
          <>
            <div className="px-4 py-3 space-y-1 bg-white dark:bg-zinc-900">
              {quote.lines.map((l) => (
                <p key={l.label} className="flex justify-between text-[13px] font-bold text-zinc-600 dark:text-zinc-300">
                  <span>{l.label}</span><span>{formatKz(l.amountKz)}</span>
                </p>
              ))}
            </div>
            <div className="px-4 py-3 bg-purple-600 text-white flex items-center justify-between">
              <span className="text-[13px] font-semibold">{planText(plan, qty)} · {withDriver ? 'com motorista' : 'self-drive'}</span>
              <span className="text-xl font-bold tracking-tight">{formatKz(quote.priceKz)}</span>
            </div>
            <p className="px-4 py-2 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 shrink-0" />
              Caução {formatKz(quote.depositKz)} · paga-se ao dono, combinado entre vocês. A app não cobra nem guarda este dinheiro.
              {quote.hoursToDay ? ` · ${quote.hoursToDay}h já vale um dia.` : ''}
            </p>
          </>
        )}
      </div>

      <button
        onClick={book}
        disabled={!canBook}
        className={cn(
          'btn-main mt-4 w-full h-14 rounded-2xl font-bold tracking-tight text-lg flex items-center justify-center gap-2',
          !canBook && OFF,
        )}
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
        {quote ? `Enviar pedido · ${formatKz(quote.priceKz)}` : 'Enviar pedido'}
      </button>
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 text-center mt-2">
        O dono recebe o pedido e aceita ou recusa. Só depois de aceite é que combinam a hora e a entrega das chaves — {user.name}.
      </p>
    </div>
  );
}
