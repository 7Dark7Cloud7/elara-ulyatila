import { useCallback, useEffect, useState } from 'react';
import { Inbox, Loader2, RefreshCw } from 'lucide-react';
import { myRequests, REPORT_STATE_LABEL, REPORT_STATE_TONE, reportLabel, type MyRequest } from '../lib/reports';
import { isAccountRequest } from '../lib/dataexport';
import { cn, when } from '../lib/utils';

/**
 * O que a pessoa pediu, e em que ponto está.
 *
 * É a outra metade do que a consola da equipa já fazia: ela escreve
 * `tr_report.state`, e aqui ela lê-se. O resto é honesto por omissão — não há
 * prazo prometido, nem contagem de «dias em análise», porque a única coisa que
 * este ecrã sabe é o que uma pessoa da equipa carimbou.
 */

const LINE = 'text-[12px] font-medium text-zinc-500 dark:text-zinc-400';

interface MyReportsProps {
  uid: string;
  /** Muda quando a pessoa acaba de enviar um pedido, para a lista o mostrar. */
  refreshKey?: number;
}

export function MyReports({ uid, refreshKey = 0 }: MyReportsProps) {
  const [rows, setRows] = useState<MyRequest[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await myRequests(uid);
    setRows(r);
    setLoading(false);
  }, [uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-white">
        <Inbox className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        Os meus pedidos e denúncias
      </p>

      {loading && (
        <p className={cn(LINE, 'mt-3 flex items-center gap-2')}>
          <Loader2 className="w-4 h-4 animate-spin" /> a ler a sua fila…
        </p>
      )}

      {!loading && rows === null && (
        <div className="mt-3">
          <p className={cn(LINE, 'flex items-start gap-2')}>
            Não conseguimos ler os seus pedidos. O que já pediu continua na fila.
          </p>
          <button
            onClick={load}
            className="mt-2 flex h-10 items-center gap-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 text-[12px] font-bold text-zinc-700 dark:text-zinc-200 tap-pad"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
        </div>
      )}

      {!loading && rows && !rows.length && (
        <p className={cn(LINE, 'mt-2')}>
          Ainda não pediu nada. Denúncias, avisos da app e pedidos de conta
          aparecem aqui com o estado que a equipa lhes der.
        </p>
      )}

      {!!rows?.length && (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/60 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[13px] font-semibold text-zinc-900 dark:text-white">
                  {reportLabel(r.reason)}
                </p>
                <span className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold',
                  REPORT_STATE_TONE[r.state],
                )}>
                  {REPORT_STATE_LABEL[r.state]}
                </span>
              </div>
              <p className={cn(LINE, 'mt-0.5')}>
                {isAccountRequest(r.reason)
                  ? 'Pedido da conta'
                  : r.by_role === 'driver' ? 'Feito como motorista' : 'Feito como passageiro'}{' '}
                · {when(r.at)}
              </p>
              {r.text && (
                <p className="mt-1.5 text-[12px] font-medium text-zinc-600 dark:text-zinc-300 break-words">
                  {r.text}
                </p>
              )}
              {r.state === 'resolved' && (
                <p className={cn(LINE, 'mt-1.5')}>
                  {r.resolved_at ? `Fechado ${when(r.resolved_at)}` : 'Fechado'}
                </p>
              )}
              {r.outcome && (
                <p className="mt-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900 p-2 text-[12px] font-semibold text-purple-800 dark:text-purple-200 break-words">
                  Resposta da equipa: {r.outcome}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!!rows?.length && (
        <p className={cn(LINE, 'mt-3')}>
          Quem muda estas etiquetas é a equipa Elara ao decidir, e a resposta
          escrita é o que essa pessoa digitou. Não há prazo automático.
        </p>
      )}
    </div>
  );
}
