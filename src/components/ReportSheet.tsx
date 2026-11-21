import { useId, useRef, useState } from 'react';
import { FlagIcon, SpinnerIcon } from './ElaraIcons';
import type { Trip } from '../types';
import { supabase, rpcError } from '../lib/supabase';
import { useDemo } from '../lib/demoContext';
import { DRIVER_REPORT_REASONS, EMERGENCY_NUMBER, REPORT_REASONS, reportHint } from '../lib/trips';
import { cn, when, OFF } from '../lib/utils';
import { Sheet } from './Sheet';

export type ReportTarget = Pick<Trip, 'id' | 'code' | 'created_at'>;

interface ReportSheetProps {
  onClose: () => void;
  trip: ReportTarget;
  uid: string;
  role: 'passenger' | 'driver';
  onError: (message: string, tone?: 'ok' | 'err') => void;
}

export function ReportSheet({ onClose, trip, uid, role, onError }: ReportSheetProps) {
  const demoCtx = useDemo();
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const fieldId = useId();
  const reasons = role === 'driver' ? DRIVER_REPORT_REASONS : REPORT_REASONS;
  const hint = reportHint(reason, 'Conte o que aconteceu, com horas e o que foi dito.');
  const ready = !!reason && detail.trim().length >= 5 && !sending;

  const send = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      if (demoCtx?.isDemo) {
        onClose();
        onError('Reporte registado (modo demonstração — guardado apenas neste aparelho).', 'ok');
        return;
      }
      const { error: failure } = await supabase.from('tr_report').insert({
        trip_id: trip.id,
        by_id: uid,
        by_role: role,
        reason,
        text: detail.trim().slice(0, 800),
        at: Date.now(),
      });
      if (failure) { setError(rpcError(failure)); return; }
      onClose();
      onError('Reporte enviado. Acompanhe o estado em «Os meus dados e a conta».', 'ok');
    } catch {
      setError('Não conseguimos confirmar o envio. Verifique «Os meus dados e a conta» antes de tentar novamente.');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <Sheet open title="Reportar um problema" onClose={() => { if (!inFlight.current) onClose(); }}>
      <p className="report-copy">
        Viagem {trip.code} · {when(trip.created_at)}. A equipa lê o pedido;
        se estiver em risco agora, ligue {EMERGENCY_NUMBER}.
      </p>
      <fieldset className="mt-4" disabled={sending}>
        <legend className="text-body font-semibold">O que aconteceu?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {reasons.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => setReason(r.id)}
              aria-pressed={reason === r.id}
              className="report-choice"
            >{r.label}</button>
          ))}
        </div>
        <label htmlFor={fieldId} className="mt-4 block text-body font-semibold">Detalhes do reporte</label>
        <p id={`${fieldId}-hint`} className="report-copy mt-1">{hint}</p>
        <textarea
          id={fieldId}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={4}
          maxLength={800}
          placeholder={hint}
          aria-describedby={`${fieldId}-hint ${fieldId}-length`}
          className="report-input mt-2"
        />
        <p id={`${fieldId}-length`} className="report-copy mt-1">{detail.length}/800 caracteres · mínimo 5</p>
      </fieldset>
      {error && <p role="alert" className="report-copy mt-3">{error}</p>}
      <button
        onClick={send}
        disabled={!ready}
        aria-busy={sending}
        className={cn('mt-4 w-full h-14 rounded-control font-semibold text-body flex items-center justify-center gap-2', ready ? 'btn-main' : OFF)}
      >
        {sending ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <FlagIcon className="w-5 h-5" />}
        {sending ? 'A enviar…' : 'Enviar reporte'}
      </button>
    </Sheet>
  );
}

export function ReportButton({
  onOpen, label = 'Reportar problema', className,
}: { onOpen: () => void; label?: string; className?: string }) {
  return (
    <button
      onClick={onOpen}
      className={cn('surface-outline min-h-12 rounded-control px-3 py-2 font-semibold text-label flex items-center justify-center gap-2', className)}
    >
      <FlagIcon className="w-4 h-4 shrink-0" /> {label}
    </button>
  );
}
