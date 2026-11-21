import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { shiftLabel, shiftNow, snoozeShift, syncShift, touchShift } from '../lib/shift';
import { cn } from '../lib/utils';

const TICK_MS = 60_000;

/**
 * O aviso de dez horas ligado. Falamos claro de propósito: a app não sabe
 * quanto tempo ninguém passou ao volante, sabe só quanto tempo este aparelho
 * esteve online na praça. Um condutor cansado não é apanhado por um número —
 * por isso isto não bloqueia nada, só pergunta, uma vez, se vale a pena parar.
 */
export function ShiftNotice({ uid, online }: { uid: string; online: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!uid) return;
    syncShift(uid, online);
    if (!online) return;
    const interval = window.setInterval(() => {
      const at = Date.now();
      touchShift(uid, at);
      setNow(at);
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [uid, online]);

  const shift = shiftNow(uid, now);
  if (!online || !shift.due) return null;

  return (
    <div
      role="status"
      className={cn(
        'animate-enter-sm rounded-2xl border p-3 flex items-start gap-3',
        'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
      )}>
      <Clock className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
      <div className="grow space-y-1.5">
        <p className="text-[12px] font-bold text-amber-800 dark:text-amber-200">
          {shiftLabel(shift.minutes)} com a app ligada neste telemóvel. Isso não é
          tempo ao volante, e a app não lhe vai tirar o trabalho: está só a lembrar
          que ninguém faz uma corrida segura ao fim de um dia destes.
        </p>
        <button
          onClick={() => { snoozeShift(uid); setNow(Date.now()); }}
          className="tap-pad h-9 px-3 rounded-xl text-[12px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 active:scale-[0.98] transition-transform"
        >
          Vou fazer uma pausa
          <span className="ml-1 font-normal">silencia 30 min</span>
        </button>
      </div>
    </div>
  );
}
