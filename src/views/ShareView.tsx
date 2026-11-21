import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Clock, Moon, ShieldCheck, Sun } from 'lucide-react';
import { readSharedTrip, type SharedTrip } from '../lib/extras';
import { usePrefs } from '../lib/alerts';
import { setTheme, useTheme } from '../lib/theme';
import { STATE_LABEL } from '../lib/trips';
import { formatKz } from '../lib/money';
import { cn, when } from '../lib/utils';
import type { TripState } from '../types';

/**
 * A página pública de «partilhar a minha viagem».
 *
 * Abre-se sem sessão a partir de `#/viagem/<token>`. O token é uma chave de
 * leitura: mostra o que já ia na mensagem de partilha — rota, estado, carro —
 * e nunca mostra código de embarque, telefone, e-mail nem conta de ninguém.
 */
export function ShareView({ token, onExit }: { token: string; onExit: () => void }) {
  const dark = useTheme();
  const prefs = usePrefs();
  const [trip, setTrip] = useState<SharedTrip | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'gone' | 'missing'>('loading');

  const load = useCallback(async () => {
    const r = await readSharedTrip(token);
    if (r === 'missing') { setState('missing'); return; }
    if (r === 'gone') { setState('gone'); return; }
    setTrip(r);
    setState('ok');
  }, [token]);

  useEffect(() => {
    setState('loading');
    load();
  }, [load]);

  // A viagem mexe-se enquanto a pessoa olha. Em modo dados móveis a leitura é
  // mais espaçada; o que se perde é um minuto de atraso, não a viagem.
  useEffect(() => {
    if (state !== 'ok') return;
    const every = prefs.lowData ? 60000 : 20000;
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, every);
    return () => window.clearInterval(tick);
  }, [state, load, prefs.lowData]);

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl border-b border-zinc-200 dark:border-zinc-800 pt-safe">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-14">
          <img
            src={dark ? '/elara-mark-dark.png' : '/elara-mark.png'}
            alt="Elara"
            className="w-8 h-8 rounded-xl shrink-0"
          />
          <div className="min-w-0">
            <p className="text-[14px] font-bold leading-none text-zinc-900 dark:text-white">
              Elara <span className="text-purple-600 dark:text-purple-400">Ulyatila</span>
            </p>
            <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
              Viagem partilhada
            </p>
          </div>
          <div className="grow" />
          <button
            onClick={() => setTheme(!dark)}
            aria-label={dark ? 'Modo claro' : 'Modo escuro'}
            className="tap-pad p-1.5 text-zinc-500 dark:text-zinc-400"
          >
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4 pb-10">
        {state === 'loading' && <Loading />}
        {state === 'missing' && (
          <Notice
            title="Esta ligação ainda não mostra viagens"
            body="A partilha pública de viagens é uma leitura nova. Quem criou a ligação recebeu-a, mas o servidor ainda não a sabe servir."
          />
        )}
        {state === 'gone' && (
          <Notice
            title="Esta ligação já não é válida"
            body="As ligações de partilha duram 24 horas e deixam de funcionar quando a viagem termina ou é cancelada. Peça a quem partilhou para enviar de novo."
          />
        )}
        {state === 'ok' && trip && <Body trip={trip} />}

        <button
          onClick={onExit}
          className="mt-4 w-full h-12 rounded-2xl font-bold text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          Abrir a Elara Ulyatila <ArrowRight className="w-4 h-4" />
        </button>
      </main>
    </div>
  );
}

const Body = ({ trip }: { trip: SharedTrip }) => {
  const live = !['ended', 'rated', 'cancelled'].includes(trip.state);
  return (
    <div className="space-y-4">
      <div className={cn(
        'rounded-3xl p-5 text-white shadow-card',
        trip.state === 'cancelled' ? 'bg-zinc-700' : 'bg-purple-600',
      )}>
        <p className="text-[12px] font-medium text-white/70">
          {trip.kind === 'entrega' ? 'Entrega' : 'Viagem'} {trip.code} · {when(trip.created_at)}
        </p>
        <h1 className="text-xl font-bold tracking-tight leading-tight mt-0.5">
          {STATE_LABEL[trip.state as TripState] ?? trip.state}
        </h1>
        <div className="mt-3 flex items-center gap-2 text-sm font-bold">
          <span className="truncate">{trip.from}</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
          <span className="truncate">{trip.to}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Distância" value={`${trip.distance_km} km`} />
        <Stat label="Valor" value={formatKz(trip.price_kz)} accent />
        <Stat label="Estado" value={live ? 'Em curso' : 'Fechada'} />
      </div>

      {trip.driver_name && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
            Motorista
          </p>
          <p className="font-semibold text-zinc-900 dark:text-white mt-1">
            {trip.driver_name}{trip.car_model ? ` · ${trip.car_model}` : ''}{trip.plate ? ` · ${trip.plate}` : ''}
          </p>
        </div>
      )}

      <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 space-y-2">
        <p className="flex items-start gap-2 text-[12px] font-bold text-zinc-600 dark:text-zinc-300">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-px text-purple-600 dark:text-purple-400" />
          Esta página não mostra o código de embarque nem o telefone de ninguém. Serve só para
          acompanhar a viagem.
        </p>
        <p className="flex items-start gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
          <Clock className="w-4 h-4 shrink-0 mt-px" />
          A ligação deixa de funcionar {expiresIn(trip.expires_at)}.
        </p>
      </div>
    </div>
  );
};

const Loading = () => (
  <div className="space-y-4" role="status" aria-live="polite">
    <p className="sr-only">A carregar a viagem partilhada.</p>
    <div className="h-32 rounded-3xl bg-zinc-200/70 dark:bg-zinc-800 animate-pulse" />
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-zinc-200/70 dark:bg-zinc-800 animate-pulse" />)}
    </div>
    <div className="h-20 rounded-2xl bg-zinc-200/70 dark:bg-zinc-800 animate-pulse" />
  </div>
);

const Notice = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-5">
    <h1 className="text-lg font-bold tracking-tight leading-tight text-zinc-900 dark:text-white">{title}</h1>
    <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-2">{body}</p>
  </div>
);

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="rounded-2xl bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 p-3">
    <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
    <p className={cn(
      'font-bold mt-0.5 leading-tight text-sm',
      accent ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-900 dark:text-white',
    )}>{value}</p>
  </div>
);

/** Tempo que falta para a ligação morrer, em palavras que se lêem de uma vez. */
function expiresIn(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'agora';
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `daqui a ${h} h`;
  const m = Math.max(1, Math.round(ms / 60000));
  return `daqui a ${m} min`;
}
