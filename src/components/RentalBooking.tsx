import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, SpinnerIcon, StarIcon, WalletGlyphIcon } from './ElaraIcons';
import { NavUserIcon } from './NavIcons';
import { supabase, rpcError } from '../lib/supabase';
import { useDemo } from '../lib/demoContext';
import { computeDemoRentalQuote } from '../lib/demoEngine';
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
  // O aviso é guardado num ref: se o pai mandar uma função nova a cada render,
  // o efeito do preço não se remonta e não fica a calcular sem parar.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const demoCtx = useDemo();
  const isDemo = !!demoCtx?.isDemo;
  const both = rental.with_driver && rental.allows_self_drive;
  const [plan, setPlan] = useState<RentalPlan>('day');
  const [qty, setQty] = useState(1);
  const [withDriver, setWithDriver] = useState(rental.with_driver || !rental.allows_self_drive);
  const [start, setStart] = useState(defaultStart());
  const [pickup, setPickup] = useState<string | null>(isDemo ? (rental.zone_id ?? zones[0]?.id ?? null) : null);
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<RentalQuote | null>(null);
  const [quoting, setQuoting] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isDemo) {
      setQuote(computeDemoRentalQuote(rental, plan, qty, withDriver));
      setQuoting(false);
      return;
    }
    let alive = true;
    setQuoting(true);
    const t = window.setTimeout(async () => {
      try {
        const q = await quoteRental(rental.id, plan, qty, withDriver);
        if (alive) setQuote(q);
      } catch {
        // O preço vem sempre do servidor: não inventamos um número nem
        // deixamos o ecrã no «a calcular o preço» quando a rede cai.
        if (alive) { setQuote(null); onErrorRef.current('Não foi possível calcular o preço. Tente de novo.'); }
      } finally {
        if (alive) setQuoting(false);
      }
    }, 260);
    return () => { alive = false; window.clearTimeout(t); };
  }, [rental, plan, qty, withDriver, isDemo]);

  const canBook = !!quote && !quoting && !busy && !!pickup && start.length >= 16;

  const book = async () => {
    if (!canBook || !quote) return;
    if (isDemo && demoCtx) {
      const now = Date.now();
      demoCtx.setDemoState((prev) => ({
        ...prev,
        rentalRequests: [
          {
            id: `dreq-rent-${now}`,
            rental_id: rental.id,
            driver_id: rental.driver_id,
            renter_id: user.uid,
            renter_name: user.name,
            plan,
            qty,
            with_driver: withDriver,
            start_at: toMs(start),
            pickup_zone_id: pickup,
            note: note.trim(),
            price_kz: quote.priceKz,
            state: 'sent',
            created_at: now,
            rental: { id: rental.id, title: rental.title, class_id: rental.class_id, price_day_kz: rental.price_day_kz },
          },
          ...prev.rentalRequests,
        ],
      }));
      onBooked();
      return;
    }
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
        className="flex items-center gap-1 text-label font-semibold text-purple-700 dark:text-amber-300 mb-3"
      >
        <ChevronLeftIcon className="w-4 h-4" /> Todos os carros
      </button>

      <div className="surface-card rounded-card overflow-hidden">
        <div className="relative flex items-end justify-center h-[120px] bg-gradient-to-b from-purple-100 to-white dark:from-purple-950/60 dark:to-vault">
          <VehicleArt
            kind={vehicleKindFor(rental.class_id)}
            label={rental.title}
            className="w-[240px] h-auto translate-y-[10px] animate-drive"
          />
          <span className="absolute top-3 right-3 rounded-full bg-white/95 dark:bg-vault/95 border border-zinc-200/80 dark:border-white/15 px-2.5 py-1 text-caption font-semibold text-purple-700 dark:text-amber-300 shadow-card">
            {formatKz(rental.price_day_kz)} / dia
          </span>
        </div>
        <div className="p-4">
          <h3 className="font-display text-lg font-medium tracking-tight text-ink dark:text-white leading-tight">{rental.title}</h3>
          {rental.blurb && (
            <p className="text-label text-zinc-500 dark:text-zinc-400 mt-1">{rental.blurb}</p>
          )}
          {owner && (
            <p className="flex items-center gap-2 text-caption font-semibold text-zinc-600 dark:text-zinc-300 mt-2">
              <NavUserIcon className="w-4 h-4 text-purple-600 dark:text-amber-400" />
              {owner.public_name}
              <span className="flex items-center gap-0.5">
                <StarIcon filled className="w-3.5 h-3.5 text-amber-500" />
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
              'rounded-control border py-2 text-center transition-colors',
              plan === p
                ? 'bg-purple-600 border-purple-600 text-white shadow-card dark:bg-amber-400 dark:border-amber-400 dark:text-ink'
                : 'surface-card text-zinc-600 dark:text-zinc-300',
            )}
          >
            <span className="block text-label font-semibold capitalize">{PLAN_LABEL[p]}</span>
            <span className={cn('block text-[11px] font-medium', plan === p ? 'text-purple-100 dark:text-ink/80' : 'text-zinc-500 dark:text-zinc-400')}>
              {ladder.find((l) => l.p === p)?.hint}
            </span>
          </button>
        ))}
      </div>

      <div className="surface-card flex items-center justify-between mt-3 rounded-card p-3">
        <span className="font-semibold text-label text-ink dark:text-zinc-200">{QTY_LABEL[plan]}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos"
            className="surface-outline tap-pad w-9 h-9 rounded-control font-bold tracking-tight text-lg text-ink dark:text-white">−</button>
          <span className="font-bold tracking-tight text-lg w-7 text-center tabular-nums text-ink dark:text-white">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="Mais"
            className="surface-outline tap-pad w-9 h-9 rounded-control font-bold tracking-tight text-lg text-ink dark:text-white">+</button>
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
              'h-12 rounded-control border font-semibold text-label transition-colors',
              !rental.with_driver
                ? OFF
                : withDriver
                  ? 'bg-purple-100 border-purple-500 text-purple-800 dark:bg-amber-400/[0.14] dark:border-amber-400 dark:text-amber-200'
                  : 'surface-card text-zinc-600 dark:text-zinc-300',
            )}
          >
            Com motorista
          </button>
          <button
            onClick={() => rental.allows_self_drive && setWithDriver(false)}
            disabled={!rental.allows_self_drive}
            aria-pressed={!withDriver}
            className={cn(
              'h-12 rounded-control border font-semibold text-label transition-colors',
              !rental.allows_self_drive
                ? OFF
                : !withDriver
                  ? 'bg-purple-100 border-purple-500 text-purple-800 dark:bg-amber-400/[0.14] dark:border-amber-400 dark:text-amber-200'
                  : 'surface-card text-zinc-600 dark:text-zinc-300',
            )}
          >
            Para eu conduzir
          </button>
        </div>
      )}

      <div className="surface-card mt-3 rounded-card p-3.5 space-y-3">
        <label className="block">
          <span className="text-caption font-medium text-zinc-500 dark:text-zinc-400">Começa a</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 w-full h-12 rounded-control bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/15 px-3 text-ink dark:text-white outline-none focus:border-purple-500 dark:focus:border-amber-400"
          />
        </label>
        <ZonePicker label="Onde levanta o carro" value={pickup} zones={zones} onChange={setPickup} />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 400))}
          rows={2}
          placeholder="Para que é? (ex.: mudança de casa para o Kilamba, preciso às 8h)"
          className="w-full rounded-control bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/15 p-3 text-body text-ink dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none focus:border-purple-500 dark:focus:border-amber-400"
        />
      </div>

      {/* O preço do servidor, com as linhas de onde ele vem. */}
      <div className="surface-card mt-3 rounded-card overflow-hidden">
        {quoting || !quote ? (
          <p className="p-4 text-label font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            <SpinnerIcon className="w-4 h-4 animate-spin" /> a calcular o preço…
          </p>
        ) : (
          <>
            <div className="px-4 py-3 space-y-1">
              {quote.lines.map((l) => (
                <p key={l.label} className="flex justify-between text-label font-semibold text-zinc-600 dark:text-zinc-300">
                  <span>{l.label}</span><span className="tabular-nums">{formatKz(l.amountKz)}</span>
                </p>
              ))}
            </div>
            <div className="px-4 py-3 bg-purple-600 dark:bg-[#3a1a6e] text-white flex items-center justify-between">
              <span className="text-label font-semibold">{planText(plan, qty)} · {withDriver ? 'com motorista' : 'sem motorista'}</span>
              <span className="text-xl font-bold tracking-tight tabular-nums dark:text-amber-300">{formatKz(quote.priceKz)}</span>
            </div>
            <p className="px-4 py-2.5 text-caption font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <WalletGlyphIcon className="w-3.5 h-3.5 shrink-0" />
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
          'mt-4 w-full h-14 rounded-control font-semibold tracking-tight text-body flex items-center justify-center gap-2',
          canBook ? 'btn-main' : OFF,
        )}
      >
        {busy ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <WalletGlyphIcon className="w-5 h-5" />}
        {quote ? `Enviar pedido · ${formatKz(quote.priceKz)}` : 'Enviar pedido'}
      </button>
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 text-center mt-2">
        O dono recebe o pedido e aceita ou recusa. Só depois de aceite é que combinam a hora e a entrega das chaves — {user.name}.
      </p>
    </div>
  );
}
