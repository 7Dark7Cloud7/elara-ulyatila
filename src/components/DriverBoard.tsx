import { useEffect, useState } from 'react';
import { Award, Loader2, Trophy } from 'lucide-react';
import { fetchLeaderboard, type BoardRow } from '../lib/extras';
import type { Driver } from '../types';
import { cn } from '../lib/utils';

/**
 * Quadro da semana e marcos do motorista.
 *
 * Só corridas fechadas e nota — nunca valores em Kwanza. Uma equipa de uma a
 * três pessoas não audita ganhos alheios, e um quadro com números errados sobre
 * dinheiro estragaria a confiança de quem conduz todos os dias.
 *
 * Aparece só com a migração 0005 aplicada; sem ela, some.
 */
export function DriverBoard({ driver }: { driver: Driver }) {
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    let alive = true;
    fetchLeaderboard(7).then((r) => {
      if (!alive) return;
      setRows(r);
      setState('ready');
    });
    return () => { alive = false; };
  }, []);

  // Sem tabela, nada a mostrar: nem skeleton pendurado, nem uma lista vazia a
  // prometer um quadro que ainda não existe.
  if (state === 'loading') {
    return (
      <div className="animate-enter-sm rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400 shrink-0" />
        <p className="text-[13px] font-bold text-zinc-500 dark:text-zinc-400">a ler o quadro da semana…</p>
      </div>
    );
  }
  if (!rows) return null;

  const medals = [
    'bg-purple-600 text-white',
    'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
    'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
  ];

  return (
    <div className="animate-enter rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <p className="flex items-center gap-2 px-4 pt-4 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
        <Trophy className="w-3.5 h-3.5" /> Mais corridas esta semana
      </p>

      {!rows.length ? (
        <p className="px-4 py-3 text-[13px] font-bold text-zinc-500 dark:text-zinc-400">
          Ainda não há corridas fechadas nos últimos 7 dias. Assim que fechar a primeira, aparece aqui.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.slice(0, 8).map((r, i) => (
            <li
              key={r.id}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5',
                r.id === driver.id && 'bg-purple-50 dark:bg-purple-950/40',
              )}
            >
              <span className={cn(
                'w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[12px] font-semibold',
                medals[Math.min(i, 2)],
              )}>{i + 1}</span>
              <div className="min-w-0 grow">
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white truncate">
                  {r.public_name}{r.id === driver.id ? ' · você' : ''}
                </p>
                <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                  {r.vehicle} · {r.plate}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{r.trips}</p>
                <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                  {r.rating ? `${r.rating.toFixed(1)} ★` : 'sem nota'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Milestones driver={driver} />
    </div>
  );
}

/**
 * Marcos contados a partir do que já existe na conta: corridas fechadas e
 * média de nota. Nada de promessas — um marco só aparece quando aconteceu.
 */
const MILESTONES: { at: number; label: string }[] = [
  { at: 10, label: '10 corridas' },
  { at: 50, label: '50 corridas' },
  { at: 100, label: '100 corridas' },
  { at: 250, label: '250 corridas' },
];

function Milestones({ driver }: { driver: Driver }) {
  const earned = MILESTONES.filter((m) => driver.trips >= m.at);
  const next = MILESTONES.find((m) => driver.trips < m.at) ?? null;
  if (!earned.length && !next) return null;

  return (
    <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
      <p className="flex items-center gap-2 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
        <Award className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
        {earned.length
          ? <>Já fechou <strong className="font-semibold text-zinc-900 dark:text-white">{earned.map((e) => e.label).join(' · ')}</strong>.</>
          : 'Ainda sem marcos.'}
      </p>
      {next && (
        <p className="text-[12px] font-semibold text-purple-700 dark:text-purple-300 mt-1">
          {next.at - driver.trips} corrida{next.at - driver.trips > 1 ? 's' : ''} para {next.label}.
        </p>
      )}
    </div>
  );
}
