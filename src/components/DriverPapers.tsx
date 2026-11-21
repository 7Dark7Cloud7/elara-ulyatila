import { useEffect, useState } from 'react';
import { CalendarDays, Check, FileCheck2, Loader2, PenLine } from 'lucide-react';
import { Sheet } from './Sheet';
import { cn, OFF } from '../lib/utils';
import {
  PAPERS, WARN_DAYS, daysUntil, humanDate, loadPapers, missingCount, savePapers,
  statusOf, statusText, todayKey, worstPaper,
  type DateKey, type PaperMap,
} from '../lib/expiry';

/**
 * Os papéis do motorista e a data em que cada um vence.
 *
 * A linha na praça aparece em duas situações e em mais nenhuma: quando ainda
 * não há datas (o convite, uma vez) e quando algo está a 14 dias de vencer ou já
 * venceu. Um painel verde a dizer «está tudo em dia» taparia a praça a quem está
 * ao volante.
 *
 * O que esta peça não promete: renovação, verificação, nem que alguém da Elara
 * olhou para um papel. A data é escrita pela pessoa; a equipa só a vê quando a
 * migração 0008 estiver aplicada — e mesmo assim ela continua a ser uma
 * declaração até alguém conferir.
 */
export function DriverPapers({
  driverId, onError,
}: {
  driverId: string;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dates, setDates] = useState<PaperMap>({});
  const [live, setLive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Um toque por visita ao ecrã chega; o resto é reler quando o painel se abre.
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPapers(driverId).then((r) => {
      if (!alive) return;
      setDates(r.dates);
      setLive(r.live);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [driverId]);

  const reload = () => {
    loadPapers(driverId).then((r) => { setDates(r.dates); setLive(r.live); });
  };

  const alert = worstPaper(dates);
  const missing = missingCount(dates);
  const filled = PAPERS.length - missing;

  if (!loaded) return null;

  const showInvite = filled === 0 && !seen;
  if (!alert && !showInvite && !open) return null;

  return (
    <>
      {alert ? (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            'w-full animate-enter-sm rounded-2xl border p-3 flex items-start gap-3 text-left active:scale-[0.99] transition-transform',
            alert.status === 'expired'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
          )}
        >
          <FileCheck2
            className={cn(
              'w-5 h-5 shrink-0 mt-0.5',
              alert.status === 'expired' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
            )}
          />
          <span className="min-w-0 grow">
            <span className={cn(
              'block text-[13px] font-bold leading-snug',
              alert.status === 'expired' ? 'text-red-800 dark:text-red-200' : 'text-amber-900 dark:text-amber-200',
            )}>
              {alert.label}: {alert.text}.
            </span>
            <span className={cn(
              'block text-[12px] font-semibold mt-0.5',
              alert.status === 'expired' ? 'text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-300',
            )}>
              {alert.status === 'expired'
                ? 'Um carro com um papel vencido não devia sair da praça. Actualize as datas ou fale com a equipa.'
                : 'Vale a pena tratar da renovação já — dois tempos e um balcão.'}
            </span>
          </span>
          <PenLine className={cn(
            'w-4 h-4 shrink-0 self-center',
            alert.status === 'expired' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
          )} />
        </button>
      ) : (
        <button
          onClick={() => { setSeen(true); setOpen(true); }}
          className="w-full animate-enter-sm rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
        >
          <CalendarDays className="w-5 h-5 shrink-0 text-purple-600 dark:text-purple-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold text-zinc-900 dark:text-white">
              Os seus papéis não têm datas
            </span>
            <span className="block text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              Carta, seguro, inspeção e BI. A app avisa 14 dias antes de cada um vencer.
            </span>
          </span>
          <PenLine className="w-4 h-4 shrink-0 text-zinc-400" />
        </button>
      )}

      <Sheet open={open} title="Os seus papéis" onClose={() => { setOpen(false); reload(); }}>
        <PapersForm
          driverId={driverId}
          initial={dates}
          live={live}
          onDone={() => setOpen(false)}
          onSaved={(next, isLive) => { setDates(next); setLive(isLive); }}
          onError={onError}
        />
      </Sheet>
    </>
  );
}

/**
 * O formulário. As datas vivem num mapa local enquanto se escreve e só vão para
 * o sítio certo no «Guardar».
 */
function PapersForm({
  driverId, initial, live, onSaved, onDone, onError,
}: {
  driverId: string;
  initial: PaperMap;
  live: boolean;
  onSaved: (dates: PaperMap, live: boolean) => void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<PaperMap>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const today = todayKey();

  useEffect(() => { setDraft(initial); }, [initial]);

  const change = (id: string, value: string) => {
    setSaved(false);
    setDraft((d) => {
      const next = { ...d };
      if (!value) delete next[id];
      else next[id] = value as DateKey;
      return next;
    });
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const r = await savePapers(driverId, draft);
    setBusy(false);
    if (r.error) { onError(r.error); return; }
    onSaved(draft, r.live);
    setSaved(true);
    if (Object.keys(draft).length === 0) onDone();
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium leading-snug text-zinc-600 dark:text-zinc-300">
        Escreva a data que está em cada documento — a mesma que se lê no papel.
        Não fotografamos nem pedimos nada: isto é uma memória sua, e a renovação
        faz-se no seguro e no balcão que emitiu o documento, não aqui.
      </p>

      {PAPERS.map((p) => {
        const key = draft[p.id];
        const days = key ? daysUntil(key) : null;
        const status = key ? statusOf(days) : 'none';
        return (
          <div key={p.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`paper-${p.id}`} className="min-w-0 text-[13px] font-bold text-zinc-900 dark:text-white">
                {p.label}
              </label>
              <span className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold',
                status === 'expired' && 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300',
                status === 'soon' && 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300',
                status === 'ok' && 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300',
                status === 'none' && 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
              )}>
                {key ? statusText(status, days) : 'sem data'}
              </span>
            </div>
            <input
              id={`paper-${p.id}`}
              type="date"
              value={key ?? ''}
              onChange={(e) => change(p.id, e.target.value)}
              className={cn(
                'mt-2 w-full h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border px-4 text-[14px] font-semibold',
                'text-zinc-900 dark:text-white outline-none focus:border-purple-400',
                'placeholder:text-zinc-500 dark:placeholder:text-zinc-400',
                status === 'expired' ? 'border-red-300 dark:border-red-800' : 'border-zinc-200 dark:border-zinc-700',
              )}
            />
            {key && (
              <p className="mt-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                {humanDate(key)}
                {status === 'ok' ? ` — avisa a ${WARN_DAYS} dias` : ''}
              </p>
            )}
            {/* A data de hoje é o único «Ontem não pode ser»: um papel vence no
                dia, não no dia anterior, e escrever uma data antiga à toa faria
                a app gritar vencido por nada. */}
            {key && key < today && status === 'expired' && (
              <button
                onClick={() => change(p.id, '')}
                className="tap-pad mt-1 text-[12px] font-bold text-purple-700 dark:text-purple-300 underline underline-offset-2"
              >
                Limpar esta data
              </button>
            )}
          </div>
        );
      })}

      <button
        onClick={submit}
        disabled={busy}
        className={cn(
          'btn-main w-full h-14 rounded-2xl font-bold tracking-tight text-lg flex items-center justify-center gap-2',
          busy && OFF,
        )}
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        Guardar datas
      </button>

      <p role="status" aria-live="polite" className="text-[12px] font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
        {live
          ? 'Estas datas ficam na sua ficha de motorista, no servidor, e a equipa pode lê-las. Continua a ser o que você escreveu: ninguém conferiu um papel.'
          : 'Estas datas ficam só neste telemóvel. A equipa da Elara ainda não as vê — o lado do servidor precisa da migração dos documentos, e enquanto ela não existir nada daqui sai deste aparelho.'}
        {saved && (
          <span className="block mt-1 font-bold text-purple-700 dark:text-purple-300">
            Guardado.
          </span>
        )}
      </p>

      <p className="text-[12px] font-medium leading-relaxed text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-3">
        Um papel vencido não desliga a sua conta automaticamente. A Elara não
        vigia balcões nem seguradoras: o que existe é este aviso, e a conversa
        consigo quando a equipa olhar para a ficha.
      </p>
    </div>
  );
}
