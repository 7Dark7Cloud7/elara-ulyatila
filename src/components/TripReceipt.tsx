import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRightIcon, CheckCircleIcon, FlagIcon, RepeatIcon, ShareIcon, SpinnerIcon, XCircleIcon,
} from './ElaraIcons';
import { supabase, rpcError } from '../lib/supabase';
import { useDemo } from '../lib/demoContext';
import { rateDemoTrip } from '../lib/demoEngine';
import type { Trip, TripEvent, Zone } from '../types';
import { RateStars } from './RateStars';
import { ReportButton } from './ReportSheet';
import { COMPLIMENTS, STATE_LABEL, receiptMessage, tripMinutes } from '../lib/trips';
import { addReview, createShareToken, reviewsLive, shareLinksLive } from '../lib/extras';
import { reduceMotion } from '../lib/alerts';
import { cn, waLink, when, APOIO_PHONE } from '../lib/utils';
import { formatKz } from '../lib/money';

interface TripReceiptProps {
  trip: Trip;
  zones: Zone[];
  onRated: () => void;
  onReport: () => void;
  /** Repetir esta viagem num toque: preenche partida, destino e categoria no Início. */
  onRepeat?: () => void;
  onError: (message: string, tone?: 'ok' | 'err') => void;
}

/**
 * O fecho da corrida: o que se percorreu, o que se pagou, e as estrelas que
 * ficam. Abre-se do histórico e no momento em que a viagem termina — é ali que
 * a pessoa ainda tem o motorista na cabeça, não três dias depois.
 */
export function TripReceipt({ trip, zones, onRated, onReport, onRepeat, onError }: TripReceiptProps) {
  const demoCtx = useDemo();
  const isDemo = !!demoCtx?.isDemo;
  const [score, setScore] = useState<number | null>(trip.passenger_rating ?? null);
  const [busy, setBusy] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [reviewsOn, setReviewsOn] = useState(false);
  const [shareOn, setShareOn] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [sendingTags, setSendingTags] = useState(false);

  const from = zones.find((z) => z.id === trip.from_zone_id)?.name ?? trip.from_zone_id;
  const to = zones.find((z) => z.id === trip.to_zone_id)?.name ?? trip.to_zone_id;
  const minutes = tripMinutes(trip);
  const cancelled = trip.state === 'cancelled';
  const celebrate = !cancelled && score === null;

  useEffect(() => {
    if (isDemo) {
      setReviewsOn(true);
      setShareOn(false);
      return;
    }
    let alive = true;
    reviewsLive().then((v) => { if (alive) setReviewsOn(v); });
    shareLinksLive().then((v) => { if (alive) setShareOn(v); });
    return () => { alive = false; };
  }, [isDemo]);

  useEffect(() => {
    if (isDemo || !shareOn || cancelled) return;
    let alive = true;
    createShareToken(trip.id).then((token) => {
      if (alive && token) setLink(`${window.location.origin}${window.location.pathname}#/viagem/${token}`);
    });
    return () => { alive = false; };
  }, [isDemo, shareOn, cancelled, trip.id]);

  const bits = useMemo(() => (celebrate && !reduceMotion()
    ? Array.from({ length: 14 }, (_, i) => ({
      left: `${6 + i * 6.5}%`,
      drift: `${(i % 3) - 1}rem`,
      delay: `${(i % 5) * 90}ms`,
      tone: i % 3 === 0 ? 'bg-amber-400' : i % 3 === 1 ? 'bg-purple-400' : 'bg-purple-600',
    }))
    : []), [celebrate]);

  const rate = async (n: number) => {
    if (busy || score) return;
    if (isDemo && demoCtx) {
      demoCtx.setDemoState((prev) => rateDemoTrip(prev, trip.id, n));
      setScore(n);
      onRated();
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('tr_rate', { p_trip_id: trip.id, p_score: n });
    setBusy(false);
    if (error) { onError(rpcError(error)); return; }
    setScore(n);
    onRated();
  };

  const sendTags = async () => {
    if (!tags.length || sendingTags) return;
    if (isDemo) {
      setTags([]);
      onError('Elogio registado (modo demonstração).', 'ok');
      return;
    }
    setSendingTags(true);
    const msg = await addReview(trip.id, tags);
    setSendingTags(false);
    if (msg) { onError(msg); return; }
    setTags([]);
    onError('Elogio registado. A equipa Elara lê estes nomes.', 'ok');
  };

  const shareText = `${receiptMessage(trip, from, to, minutes, score)}${link ? `\nAcompanhar: ${link}` : ''}`;

  return (
    <div className="relative space-y-4">
      {bits.length > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-2 h-56 overflow-hidden">
          {bits.map((b, i) => (
            <span
              key={i}
              className={cn('confetti-bit', b.tone)}
              style={{ left: b.left, animationDelay: b.delay, '--drift': b.drift } as CSSProperties}
            />
          ))}
        </div>
      )}

      <div className={cn(
        'rounded-card p-5 text-white shadow-card',
        cancelled ? 'bg-zinc-700' : 'bg-purple-600 dark:bg-[#3a1a6e]',
      )}>
        <p className="text-caption font-medium text-white/75">
          {trip.kind === 'entrega' ? 'Entrega' : 'Viagem'} {trip.code} · {when(trip.created_at)}
        </p>
        <h3 className="font-display text-lead font-medium tracking-tight leading-tight mt-0.5 flex items-center gap-2">
          {cancelled ? <XCircleIcon className="w-5 h-5 shrink-0" /> : <CheckCircleIcon className="w-5 h-5 shrink-0" />}
          {STATE_LABEL[trip.state]}
        </h3>
        <div className="mt-3 flex items-center gap-2 text-body font-semibold">
          <span className="truncate">{from}</span>
          <ArrowRightIcon className="w-4 h-4 shrink-0 text-amber-400 dark:text-amber-300" />
          <span className="truncate">{to}</span>
        </div>
      </div>

      {!cancelled && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Distância" value={`${trip.distance_km} km`} />
          <Stat label="Duração" value={minutes ? `${minutes} min` : '—'} />
          <Stat label="Pago" value={formatKz(trip.price_kz)} accent />
        </div>
      )}

      {cancelled && (
        <p className="surface-card rounded-card p-4 text-body text-zinc-600 dark:text-zinc-300">
          {cancelNote(trip) ?? 'Viagem cancelada.'} Nenhuma viagem lhe é cobrada por ter pedido.
        </p>
      )}

      {!cancelled && trip.driver_name && (
        <div className="surface-card rounded-card p-4">
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            {trip.kind === 'entrega' ? 'Motorista' : 'Quem o levou'}
          </p>
          <p className="mt-1 text-body font-semibold text-ink dark:text-white">
            {trip.driver_name} · {trip.car_model ?? ''} {trip.plate ?? ''}
          </p>
          {score === null ? (
            <>
              <p className="mt-3 text-label text-zinc-500 dark:text-zinc-400">Como correu a viagem?</p>
              <div className="mt-2 flex items-center gap-3">
                <RateStars score={null} busy={busy} onPick={rate} />
                {busy && <SpinnerIcon className="w-4 h-4 animate-spin text-zinc-400" />}
              </div>
            </>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <RateStars score={score} busy={false} size="sm" />
              <span className="text-label font-medium text-zinc-500 dark:text-zinc-400">A sua avaliação</span>
            </div>
          )}
          {score !== null && reviewsOn && score >= 4 && (
            <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-[rgba(185,168,220,0.2)]">
              <p className="text-label font-medium text-zinc-500 dark:text-zinc-400">
                O que se há-de dizer dele?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {COMPLIMENTS.map((c) => {
                  const on = tags.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setTags((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
                      aria-pressed={on}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-label font-semibold border transition-colors',
                        on
                          ? 'bg-purple-600 border-purple-600 text-white dark:bg-amber-400 dark:border-amber-400 dark:text-ink'
                          : 'surface-outline text-zinc-700 dark:text-zinc-200',
                      )}
                    >{c.label}</button>
                  );
                })}
              </div>
              {tags.length > 0 && (
                <button
                  type="button"
                  onClick={sendTags}
                  disabled={sendingTags}
                  className="btn-main mt-3 h-11 px-4 rounded-control font-semibold text-label inline-flex items-center gap-2"
                >
                  {sendingTags && <SpinnerIcon className="w-4 h-4 animate-spin" />}
                  Enviar elogio
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {onRepeat && (
        <button
          type="button"
          onClick={onRepeat}
          className="btn-main w-full h-12 rounded-control font-semibold text-body flex items-center justify-center gap-2"
        >
          <RepeatIcon className="w-4 h-4" /> Repetir esta viagem
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a
          href={waLink('', shareText)}
          target="_blank"
          rel="noreferrer"
          className="h-12 rounded-control font-semibold text-label surface-outline flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <ShareIcon className="w-4 h-4" /> Partilhar recibo
        </a>
        <a
          href={waLink(APOIO_PHONE, `Viagem ${trip.code}: preciso de ajuda com este fecho.`)}
          target="_blank"
          rel="noreferrer"
          className="h-12 rounded-control font-semibold text-label surface-outline text-red-600 dark:text-red-300 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <FlagIcon className="w-4 h-4" /> Falar com a equipa
        </a>
      </div>

      <ReportButton
        onOpen={onReport}
        label="Reportar problema ou objecto perdido"
        className="w-full"
      />

      {!cancelled && trip.payment === 'cash' && (
        <p className="text-caption text-zinc-500 dark:text-zinc-400">
          Pagamento em dinheiro fecha-se dentro do carro. Se ficou por pagar, use «Falar com a
          equipa» antes de qualquer acordo por fora — é o registo que protege os dois lados.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="surface-card rounded-card p-3">
      <p className="text-caption font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={cn('mt-0.5 font-semibold leading-tight', accent ? 'text-purple-700 dark:text-amber-300' : 'text-ink dark:text-white')}>
        {value}
      </p>
    </div>
  );
}

const cancelNote = (trip: Trip): string | null => {
  const ev = ((trip.events ?? []) as TripEvent[]).find((e) => e?.state === 'cancelled');
  return ev?.note ?? null;
};
