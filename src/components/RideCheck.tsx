import { useEffect, useState } from 'react';
import { LifeBuoy, PhoneCall } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Trip } from '../types';
import {
  AUTO_REPORT_REASONS, EMERGENCY_NUMBER, checkAfterMinutes, driveMinutes, isNight, ongoingSince,
} from '../lib/trips';
import { buzz, chime, usePrefs } from '../lib/alerts';
import { cn } from '../lib/utils';

/**
 * A verificação de viagem. O sinal é o tempo: uma corrida em curso muito para
 * além do que a distância permite já foi um carro parado no meio da rua ou uma
 * rota longa a mais. Não há vigilância nenhuma aqui — só o carimbo do
 * servidor no «em viagem» e o relógio do telemóvel de quem pediu.
 *
 * Sem resposta em cinco minutos escreve-se um reporte em `tr_report`, a fila
 * que a equipa Elara já lê hoje. É a única coisa que podemos prometer: não há
 * central de monitorização, e dizemos isso.
 */

const KEY = 'tr.ridecheck.v1';
const NO_ANSWER_MS = 5 * 60_000;
/** Sete dias de memória: marcas de viagens antigas não ficam no telefone. */
const KEEP_MS = 7 * 24 * 60 * 60_000;

type Mark = { asked_at?: number; answered_at?: number; sent_at?: number };
type Marks = Record<string, Mark & { at?: number }>;

const readAll = (): Marks => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Marks) : {};
  } catch {
    return {};
  }
};

const writeMark = (tripId: string, patch: Mark): Mark => {
  const all = readAll();
  const next = { ...(all[tripId] ?? {}), ...patch, at: Date.now() };
  const cutoff = Date.now() - KEEP_MS;
  const pruned: Marks = {};
  Object.entries(all).forEach(([id, m]) => {
    if (id !== tripId && (m.at ?? 0) < cutoff) return;
    pruned[id] = m;
  });
  pruned[tripId] = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(pruned));
  } catch { /* modo privado: o aviso acontece na mesma, só não lembra */ }
  return next;
};

const BTN = 'h-12 rounded-control font-semibold text-label flex items-center gap-2 '
  + 'justify-center active:scale-[0.98] transition-transform';

interface RideCheckProps {
  trip: Trip;
  uid: string;
  /** Abre o painel SOS que já existe na app — não há dois caminhos de emergência. */
  onHelp: () => void;
}

export function RideCheck({ trip, uid, onHelp }: RideCheckProps) {
  const [mark, setMark] = useState<Mark>(() => readAll()[trip.id] ?? {});
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const prefs = usePrefs();

  useEffect(() => setMark(readAll()[trip.id] ?? {}), [trip.id]);

  // Um batimento a cada quinze segundos, e só enquanto a corrida está a rolar.
  useEffect(() => {
    if (trip.state !== 'ongoing') return;
    const i = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => { window.clearInterval(i); };
  }, [trip.state]);

  const start = ongoingSince(trip);
  const waitedMin = start ? Math.max(0, Math.round((now - start) / 60_000)) : 0;
  // À noite a margem encurta, se a pessoa quiser avisos de noite.
  const night = prefs.night && isNight(now);
  const limit = checkAfterMinutes(trip.distance_km, night);
  const due = !!start && trip.state === 'ongoing' && waitedMin >= limit && !mark.answered_at;

  // Primeiro toque: uma vez só, mesmo que a app feche e abra outra vez.
  useEffect(() => {
    if (!due || mark.asked_at) return;
    setMark(writeMark(trip.id, { asked_at: now }));
    buzz([110, 70, 110, 70, 150]);
    chime('request');
  }, [due, mark.asked_at, trip.id, now]);

  const notify = async () => {
    if (sending || mark.sent_at) return;
    setSending(true);
    setFailed(false);
    const { error } = await supabase.from('tr_report').insert({
      trip_id: trip.id,
      by_id: uid,
      by_role: 'passenger',
      reason: AUTO_REPORT_REASONS[0].id,
      text: [
        `Verificação de viagem: ${trip.code} vai há ${waitedMin} min`,
        `quando o previsto era ≈${driveMinutes(trip.distance_km)} min para`,
        `${trip.distance_km} km${night ? ' (viagem à noite)' : ''}.`,
        'A pessoa não respondeu ao aviso da app.',
      ].join(' '),
      at: Date.now(),
    });
    setSending(false);
    if (error) { setFailed(true); return; }
    setMark(writeMark(trip.id, { sent_at: Date.now() }));
  };

  // Ninguém respondeu ao aviso: avisamos a equipa, e dizemos antes de o fazer.
  useEffect(() => {
    if (!due || !mark.asked_at || mark.answered_at || mark.sent_at) return;
    if (now - mark.asked_at < NO_ANSWER_MS) return;
    void notify();
  }, [due, mark, now]);

  if (!due || !mark.asked_at) return null;

  const ok = () => setMark(writeMark(trip.id, { answered_at: Date.now() }));

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'animate-enter rounded-card border p-4 shadow-card',
        'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900',
      )}
    >
      <p className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
        <LifeBuoy className="w-5 h-5 shrink-0" /> Está tudo bem?
      </p>
      <p className="text-label text-red-700/85 dark:text-red-200/85 mt-1.5 leading-relaxed">
        A viagem {trip.code} já vai há {waitedMin} min — para {trip.distance_km} km
        estavam previstos ≈{driveMinutes(trip.distance_km)} min. Se apanhou
        trânsito, carregue em «Sim» e não voltamos a perguntar nesta viagem.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={ok}
          className={cn(BTN, 'surface-outline text-ink dark:text-zinc-100')}
        >
          Sim, está tudo bem
        </button>
        <button
          onClick={onHelp}
          className={cn(BTN, 'text-white bg-red-600 active:bg-red-700')}
        >
          <PhoneCall className="w-4 h-4" /> Preciso de ajuda
        </button>
      </div>

      {mark.sent_at ? (
        <p className="text-[12px] font-medium text-red-700 dark:text-red-300 mt-2.5">
          Avisámos a equipa Elara com o código e o tempo da viagem.
          Se o perigo for agora, ligue {EMERGENCY_NUMBER} — não espere por nós.
        </p>
      ) : failed ? (
        <div className="mt-2.5 flex items-center gap-2">
          <p className="flex-1 text-[12px] font-medium text-red-700 dark:text-red-300">
            Não conseguimos avisar a equipa.
          </p>
          <button
            onClick={() => void notify()}
            disabled={sending}
            className={cn(
              'h-9 shrink-0 px-3 rounded-xl text-[12px] font-bold active:scale-95',
              'border border-red-300 dark:border-red-800 transition',
              'text-red-700 dark:text-red-300',
            )}
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <p className="text-[12px] text-red-700 dark:text-red-300 mt-2.5 leading-relaxed">
          Sem resposta em cinco minutos, este telefone envia um aviso à equipa
          Elara com o código e o tempo da viagem. Mais nada sai daqui.
        </p>
      )}
    </div>
  );
}
