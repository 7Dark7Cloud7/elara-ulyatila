import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Pause, Pencil, Plus, Send, X } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import type { Driver, Rental, RentalRequest, VehicleClass, Zone } from '../types';
import { ClassPicker } from './ClassPicker';
import { VehicleArt, vehicleKindFor } from './VehicleArt';
import { ZonePicker } from './ZonePicker';
import { REQUEST_STATE, fetchMyRentals, fetchOwnerRequests, planText } from '../lib/rentals';
import { formatKz } from '../lib/money';
import { cn, when, OFF } from '../lib/utils';

interface RentalDeskProps {
  driver: Driver;
  classes: VehicleClass[];
  zones: Zone[];
  onError: (message: string) => void;
}

const digits = (s: string, max: number) => s.replace(/\D/g, '').slice(0, max);

/**
 * A mesa do dono: publicar o carro (preço por dia, caução, com ou sem
 * motorista) e responder aos pedidos. O preço-base é sempre o dia — a hora, a
 * semana e o mês calcula-os o servidor com as regras da rua.
 */
export function RentalDesk({ driver, classes, zones, onError }: RentalDeskProps) {
  const [offers, setOffers] = useState<Rental[]>([]);
  const [requests, setRequests] = useState<RentalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answerId, setAnswerId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [blurb, setBlurb] = useState('');
  const [classId, setClassId] = useState<string>(driver.class_id);
  const [priceDay, setPriceDay] = useState('25000');
  const [driverFee, setDriverFee] = useState('8000');
  const [deposit, setDeposit] = useState('20000');
  const [minHours, setMinHours] = useState('3');
  const [zoneId, setZoneId] = useState<string | null>(driver.home_zone_id);
  const [withDriver, setWithDriver] = useState(true);
  const [selfDrive, setSelfDrive] = useState(false);
  const [paused, setPaused] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [own, asks] = await Promise.all([
      fetchMyRentals(driver.id),
      fetchOwnerRequests(driver.id),
    ]);
    setOffers(own);
    setRequests(asks.rows);
    setLoading(false);
  }, [driver.id]);

  useEffect(() => { load(); }, [load]);

  const fill = (r: Rental) => {
    setEditing(r.id);
    setTitle(r.title); setBlurb(r.blurb); setClassId(r.class_id);
    setPriceDay(String(r.price_day_kz)); setDriverFee(String(r.driver_fee_kz));
    setDeposit(String(r.deposit_kz)); setMinHours(String(r.min_hours));
    setZoneId(r.zone_id ?? driver.home_zone_id);
    setWithDriver(r.with_driver); setSelfDrive(r.allows_self_drive);
    setPaused(r.state === 'paused');
  };

  const publish = async () => {
    if (title.trim().length < 3) { onError('Dê um título ao anúncio'); return; }
    if (!withDriver && !selfDrive) { onError('Escolha pelo menos uma das duas opções'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('tr_set_rental', {
      p_id: editing,
      p_class_id: classId,
      p_title: title.trim(),
      p_blurb: blurb.trim(),
      p_price_day_kz: Number(priceDay || 0),
      p_driver_fee_kz: Number(driverFee || 0),
      p_with_driver: withDriver,
      p_allows_self_drive: selfDrive,
      p_deposit_kz: Number(deposit || 0),
      p_min_hours: Number(minHours || 1),
      p_zone_id: zoneId,
      p_state: paused ? 'paused' : 'active',
    });
    setBusy(false);
    if (error) { onError(rpcError(error)); return; }
    setEditing(null); setTitle(''); setBlurb('');
    load();
  };

  const decide = async (req: RentalRequest, accept: boolean) => {
    if (answerId) return;
    setAnswerId(req.id);
    const { error } = await supabase.rpc('tr_rental_decision', {
      p_request_id: req.id, p_accept: accept, p_reason: null,
    });
    setAnswerId(null);
    if (error) { onError(rpcError(error)); return; }
    load();
  };

  const pending = requests.filter((r) => r.state === 'sent');
  const past = requests.filter((r) => r.state !== 'sent');

  return (
    <div className="animate-enter space-y-4">
      {/* Publicar / editar */}
      <div className="rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">
            {editing ? 'Editar o anúncio' : 'Pôr um carro para alugar'}
          </h3>
          {editing && (
            <button onClick={() => { setEditing(null); setTitle(''); setBlurb(''); }}
              className="tap-pad flex items-center gap-1 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
              <X className="w-4 h-4" /> novo
            </button>
          )}
        </div>

        <div className="relative flex items-end justify-center h-[92px] mt-2 rounded-2xl bg-gradient-to-b from-purple-100 to-white dark:from-purple-950/60 dark:to-zinc-900 overflow-hidden">
          <VehicleArt kind={vehicleKindFor(classId)} label={title || 'Carro'} className="w-[200px] h-auto translate-y-[8px]" />
        </div>

        <input
          value={title} onChange={(e) => setTitle(e.target.value.slice(0, 70))}
          placeholder="Título (ex.: Hiace 15 lugares para mudanças)" className={cn(fieldCls, 'mt-3')}
        />
        <textarea
          value={blurb} onChange={(e) => setBlurb(e.target.value.slice(0, 300))} rows={2}
          placeholder="O que quem aluga precisa de saber (combustível, quilómetros, onde entrega)"
          className={cn(fieldCls, 'mt-2 h-auto py-3')}
        />

        <div className="grid grid-cols-2 gap-2 mt-2">
          <Num label="Preço por dia (Kz)" value={priceDay} onChange={setPriceDay} max={7} />
          <Num label="Motorista / dia (Kz)" value={driverFee} onChange={setDriverFee} max={6} />
          <Num label="Caução (Kz)" value={deposit} onChange={setDeposit} max={7} />
          <Num label="Mínimo de horas" value={minHours} onChange={setMinHours} max={2} />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <Toggle on={withDriver} onClick={() => setWithDriver((v) => !v)} label="Com motorista" />
          <Toggle on={selfDrive} onClick={() => setSelfDrive((v) => !v)} label="Para conduzir" />
        </div>

        <div className="mt-2">
          <ZonePicker label="Onde se levanta" value={zoneId} zones={zones} onChange={setZoneId} />
        </div>

        <Toggle className="mt-2" on={!paused} onClick={() => setPaused((v) => !v)}
          label={paused ? 'Pausado (não aparece na montra)' : 'Publicado — visível na montra'} />

        <button
          onClick={publish}
          disabled={busy}
          className={cn(
            'btn-main mt-3 w-full h-12 rounded-2xl font-bold flex items-center justify-center gap-2',
            busy && OFF,
          )}
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : editing ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          {editing ? 'Guardar mudanças' : 'Publicar carro'}
        </button>
      </div>

      <ClassPicker classes={classes} value={classId} onChange={setClassId} />

      {/* Pedidos recebidos */}
      <div>
        <h3 className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 px-1">
          Pedidos recebidos
        </h3>
        {loading && <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">a carregar…</p>}
        {!loading && pending.length === 0 && (
          <p className="text-[13px] font-bold text-zinc-500 dark:text-zinc-400 mt-2 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
            Ainda não chegou nenhum pedido. Assim que publicar um carro, ele aparece na montra de quem aluga.
          </p>
        )}
        <div className="space-y-2.5 mt-2">
          {pending.map((r) => (
            <div key={r.id} className="animate-alert rounded-2xl bg-white dark:bg-zinc-900 border border-purple-300 dark:border-purple-800 p-4">
              <p className="font-bold text-zinc-900 dark:text-white">{r.renter_name}</p>
              <p className="text-[12px] font-bold text-zinc-600 dark:text-zinc-300 mt-0.5">
                {r.rental?.title ?? 'Carro'} · {planText(r.plan, r.qty)} · {r.with_driver ? 'com motorista' : 'para conduzir'}
              </p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {when(r.start_at)} · {zoneName(zones, r.pickup_zone_id)}
              </p>
              {r.note && <p className="text-[12px] text-zinc-600 dark:text-zinc-300 mt-2 italic">"{r.note}"</p>}
              <div className="flex items-center gap-2 mt-3">
                <span className="flex-1 font-semibold text-purple-600 dark:text-purple-400">{formatKz(r.price_kz)}</span>
                <button
                  onClick={() => decide(r, false)} disabled={answerId === r.id}
                  className="h-10 px-3 rounded-xl font-semibold text-[13px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                >
                  Recusar
                </button>
                <button
                  onClick={() => decide(r, true)} disabled={answerId === r.id}
                  className="h-10 px-4 rounded-xl font-semibold text-[13px] text-white bg-purple-600 active:bg-purple-700 flex items-center gap-1.5"
                >
                  {answerId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Aceitar
                </button>
              </div>
            </div>
          ))}
        </div>

        {past.length > 0 && (
          <div className="mt-3 space-y-2">
            {past.map((r) => (
              <p key={r.id} className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400 flex justify-between gap-2">
                <span className="truncate">{r.renter_name} · {r.rental?.title ?? ''}</span>
                <span className={cn('shrink-0', r.state === 'accepted' && 'text-purple-600 dark:text-purple-400')}>
                  {REQUEST_STATE[r.state]}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Meus anúncios */}
      {offers.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 px-1">
            Os meus anúncios
          </h3>
          <div className="space-y-2 mt-2">
            {offers.map((o) => (
              <div key={o.id} className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 flex items-center gap-3">
                <VehicleArt kind={vehicleKindFor(o.class_id)} className="w-[64px] h-auto shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[13px] text-zinc-900 dark:text-white truncate">{o.title}</p>
                  <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                    {formatKz(o.price_day_kz)} / dia · {o.state === 'paused' ? 'pausado' : 'na montra'}
                  </p>
                </div>
                <button onClick={() => fill(o)} aria-label="Editar anúncio"
                  className="tap-pad p-1.5 text-purple-600 dark:text-purple-400">
                  {o.state === 'paused' ? <Pause className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const zoneName = (zones: Zone[], id?: string | null) =>
  zones.find((z) => z.id === id)?.name ?? 'onde combinar';

function Num({ label, value, onChange, max }: { label: string; value: string; onChange: (v: string) => void; max: number }) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        value={value} onChange={(e) => onChange(digits(e.target.value, max))} inputMode="numeric"
        className={cn(fieldCls, 'mt-1')}
      />
    </label>
  );
}

function Toggle({ on, onClick, label, className }: {
  on: boolean; onClick: () => void; label: string; className?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      className={cn(
        'h-11 rounded-2xl border font-semibold text-[13px] flex items-center justify-center gap-2 transition-colors',
        on ? 'bg-purple-100 dark:bg-purple-900/40 border-purple-400 text-purple-800 dark:text-purple-200'
          : 'bg-white dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400',
        className,
      )}
    >
      <span className={cn('w-2.5 h-2.5 rounded-full', on ? 'bg-purple-600 dark:bg-purple-400' : 'bg-zinc-300 dark:bg-zinc-600')} />
      {label}
    </button>
  );
}

const fieldCls =
  'w-full h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 outline-none focus:border-purple-400 placeholder:text-zinc-500 dark:placeholder:text-zinc-400';
