import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowRight, CheckCircle2, Flag, Loader2, Share2, XCircle } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
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
  onError: (message: string, tone?: 'ok' | 'err') => void;
}

/**
 * O fecho da corrida: o que se percorreu, o que se pagou, e as estrelas que
 * ficam. Abre-se do histórico e no momento em que a viagem termina — é ali que
 * a pessoa ainda tem o motorista na cabeça, não três dias depois.
 */
export function TripReceipt({ trip, zones, onRated, onReport, onError }: TripReceiptProps) {
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
    let alive = true;
    reviewsLive().then((v) => { if (alive) setReviewsOn(v); });
    shareLinksLive().then((v) => { if (alive) setShareOn(v); });
    return () => { alive = false; };
  }, []);

  // O link de partilha é um token de leitura: mostra a viagem a quem está fora
  // sem sessão, sem código de embarque e sem telefone de ninguém.
  useEffect(() => {
    if (!shareOn || cancelled) return;
    let alive = true;
    createShareToken(trip.id).then((token) => {
      if (alive && token) setLink(`${window.location.origin}${window.location.pathname}#/viagem/${token}`);
    });
    return () => { alive = false; };
  }, [shareOn, cancelled, trip.id]);

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
    setBusy(true);
    const { error } = await supabase.rpc('tr_rate', { p_trip_id: trip.id, p_score: n });
    setBusy(false);
    if (error) { onError(rpcError(error)); return; }
    setScore(n);
    onRated();
  };

  const sendTags = async () => {
    if (!tags.length || sendingTags) return;
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
              style={{ left: b.left, animationDelay: b.delay, '--drift': b.drift } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      <div className={cn(
        'rounded-3xl p-5 text-white shadow-card',
        cancelled ? 'bg-zinc-700' : 'bg-purple-600',
      )}>
        <p className="text-[12px] font-medium text-white/70">
          {trip.kind === 'entrega' ? 'Entrega' : 'Viagem'} {trip.code} · {when(trip.created_at)}
        </p>
        <h3 className="text-xl font-bold tracking-tight leading-tight mt-0.5 flex items-center gap-2">
          {cancelled ? <XCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          {STATE_LABEL[trip.state]}
        </h3>
        <div className="mt-3 flex items-center gap-2 text-sm font-bold">
          <span className="truncate">{from}</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
          <span className="truncate">{to}</span>
        </div>
      </div>

      {!cancelled && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Distância" value={`${trip.distance_km} km`} />
          <Stat label="Dentro do carro" value={minutes ? `${minutes} min` : '—'} />
          <Stat label="Pago" value={formatKz(trip.price_kz)} accent />
        </div>
      )}

      {cancelled && (
        <p className="text-sm text-zinc-600 dark:text-zinc-300 rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-4">
          {cancelNote(trip) ?? 'Viagem cancelada.'} Nenhuma viagem lhe é cobrada por ter pedido.
        </p>
      )}

      {!cancelled && trip.driver_name && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
          <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
            {trip.kind === 'entrega' ? 'Motorista' : 'Quem o levou'}
          </p>
          <p className="font-semibold text-zinc-900 dark:text-white mt-1">
            {trip.driver_name} · {trip.car_model ?? ''} {trip.plate ?? ''}
          </p>
          {score === null ? (
            <>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-3">Como correu a viagem?</p>
              <div className="mt-2 flex items-center gap-3">
                <RateStars score={null} busy={busy} onPick={rate} />
                {busy && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
              </div>
            </>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <RateStars score={score} busy={false} size="sm" />
              <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">A sua avaliação</span>
            </div>
          )}
          {score !== null && reviewsOn && score >= 4 && (
            <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                O que se há-de dizer dele?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {COMPLIMENTS.map((c) => {
                  const on = tags.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setTags((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
                      aria-pressed={on}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-[12px] font-semibold border transition-colors',
                        on
                          ? 'bg-purple-600 border-purple-600 text-white'
                          : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200',
                      )}
                    >{c.label}</button>
                  );
                })}
              </div>
              {tags.length > 0 && (
                <button
                  onClick={sendTags}
                  disabled={sendingTags}
                  className="mt-3 h-11 px-4 rounded-2xl font-bold text-sm text-white bg-purple-600 active:bg-purple-700 flex items-center gap-2"
                >
                  {sendingTags && <Loader2 className="w-4 h-4 animate-spin" />}
                  Enviar elogio
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a
          href={waLink('', shareText)}
          target="_blank"
          rel="noreferrer"
          className="h-12 rounded-2xl font-bold text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <Share2 className="w-4 h-4" /> Partilhar recibo
        </a>
        <a
          href={waLink(APOIO_PHONE, `Viagem ${trip.code}: preciso de ajuda com este fecho.`)}
          target="_blank"
          rel="noreferrer"
          className="h-12 rounded-2xl font-bold text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 text-red-600 dark:text-red-400 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <Flag className="w-4 h-4" /> Falar com a equipa
        </a>
      </div>

      <ReportButton
        onOpen={onReport}
        label="Reportar problema ou objecto perdido"
        className="w-full"
      />

      {!cancelled && trip.payment === 'cash' && (
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Pagamento em dinheiro fecha-se dentro do carro. Se ficou por pagar, use «Falar com a
          equipa» antes de qualquer acordo por fora — é o registo que protege os dois lados.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 p-3">
      <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={cn('font-semibold mt-0.5 leading-tight', accent ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-900 dark:text-white')}>
        {value}
      </p>
    </div>
  );
}

const cancelNote = (trip: Trip): string | null => {
  const ev = ((trip.events ?? []) as TripEvent[]).find((e) => e?.state === 'cancelled');
  return ev?.note ?? null;
};
