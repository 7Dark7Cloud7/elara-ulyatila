import { useEffect, useState } from 'react';
import {
  AlertTriangle, Check, Clipboard, Copy, Download, FileJson, Loader2, ShieldCheck,
} from 'lucide-react';
import { Sheet } from './Sheet';
import {
  copyText, downloadJson, exportFileName, exportMyData, exportText,
  openDeletionRequest, sendDeletionRequest, type MyExport,
} from '../lib/dataexport';
import { waLink, APOIO_PHONE, OFF } from '../lib/utils';
import type { SessionUser } from '../types';
import { MyReports } from './MyReports';

/**
 * «Os meus dados» — a folha onde a pessoa vê o que a app tem sobre ela e pede
 * que seja apagada. Nenhuma das duas coisas apaga nada sozinha: a exportação é
 * a leitura que o RLS já lhe dá, e o pedido de eliminação entra na mesma fila
 * de suporte que a equipa lê todos os dias.
 */

const BTN = 'h-12 rounded-2xl font-bold text-sm flex items-center gap-2 '
  + 'justify-center active:scale-[0.98] transition-transform';

const LABEL: Record<string, string> = {
  viagens: 'Viagens',
  carro_condutor: 'Carro e candidatura',
  movimentos_carteira: 'Movimentos da carteira',
  pedidos_dinheiro: 'Pedidos de dinheiro',
  reportes: 'Reportes e pedidos',
  pedidos_aluguer: 'Pedidos de aluguer',
  avaliacoes: 'Avaliações',
  lugares_guardados: 'Lugares guardados',
  documentos: 'Papéis do motorista',
  datas_neste_telemovel: 'Datas de validade só neste telemóvel',
};

/** Como se chamam as tabelas ainda por aplicar, em vez de um nome de servidor. */
const TABELA_LABEL: Record<string, string> = {
  tr_review: 'avaliações',
  tr_saved_place: 'lugares guardados',
  tr_driver_doc: 'papéis do motorista',
};

interface DataSheetProps {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
  /** A pessoa conduz? Muda só a etiqueta do bilhete de eliminação. */
  isDriver: boolean;
  onError: (message: string, tone?: 'ok' | 'err') => void;
}

export function DataSheet({ open, onClose, user, isDriver, onError }: DataSheetProps) {
  const [doc, setDoc] = useState<MyExport | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState(false);

  // `null` = ainda a verificar; `'cega'` = não se conseguiu verificar. Distinguir
  // os dois evita dizer «já tem um pedido» a quem não tem, e evita o contrário.
  const [pending, setPending] = useState<boolean | 'cega' | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // A cada abertura de folha: limpa a cópia antiga (os dados mudam) e vai
  // saber se já existe um pedido de eliminação à espera.
  useEffect(() => {
    if (!open) return;
    setDoc(null); setFailed(null); setCopied(false); setPaste(false);
    setPending(null); setUnderstood(false); setNote(''); setSent(false);
    let alive = true;
    openDeletionRequest(user.uid).then((v) => {
      if (alive) setPending(v === null ? 'cega' : v);
    });
    return () => { alive = false; };
  }, [open, user.uid]);

  const load = async () => {
    if (loading) return;
    setLoading(true);
    setFailed(null);
    try {
      const d = await exportMyData(user);
      setDoc(d);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Não foi possível ler os seus dados.');
    }
    setLoading(false);
  };

  const copy = async () => {
    if (!doc) return;
    const err = await copyText(exportText(doc));
    if (err) { setPaste(true); return; }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const send = async () => {
    if (sending || !understood) return;
    setSending(true);
    const msg = await sendDeletionRequest(user.uid, isDriver ? 'driver' : 'passenger', note);
    setSending(false);
    if (msg) { onError(msg); return; }
    setPending(true);
    setSent(true);
    onError('Pedido enviado. A equipa Elara vê a fila de reportes.', 'ok');
  };

  const linhas = doc?.total_linhas ?? 0;
  const texto = doc ? exportText(doc) : '';

  return (
    <Sheet open={open} title="Os meus dados" onClose={onClose} tall>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          A Ulyatila guarda o mínimo para fechar uma corrida: quem pediu, de onde
          para onde, o preço e o estado. Aqui vê exactamente isso, e pode pedir que
          a conta seja apagada.
        </p>

        {/* ---------------- exportação ---------------- */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-white">
            <FileJson className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            Exportar os meus dados
          </p>

          {!doc && !loading && !failed && (
            <button
              onClick={load}
              className={`${BTN} btn-main mt-3 w-full`}
            >
              <Download className="w-4 h-4" /> Mostrar o que temos sobre mim
            </button>
          )}

          {loading && (
            <p className="mt-3 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" /> a ler a sua conta…
            </p>
          )}

          {failed && (
            <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3">
              <p className="flex items-start gap-2 text-[12px] font-semibold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                {failed}
              </p>
              <button onClick={load} className={`${BTN} mt-2 h-10 bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200`}>
                Tentar de novo
              </button>
            </div>
          )}

          {doc && (
            <div className="mt-3 space-y-3">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {Object.entries(doc.dados).map(([chave, rows]) => (
                  <li key={chave} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">
                      {LABEL[chave] ?? chave}
                    </span>
                    <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {rows.length} {rows.length === 1 ? 'linha' : 'linhas'}
                    </span>
                  </li>
                ))}
              </ul>

              {!linhas && (
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                  Não há nada com o seu nome nesta app. Se já fez viagens e vê isto
                  vazio, diga-nos pelo WhatsApp de apoio.
                </p>
              )}

              {!!doc.em_falta.length && (
                <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                  Ainda não existem no servidor:{' '}
                  {doc.em_falta.map((t) => TABELA_LABEL[t] ?? t).join(', ')}. Não é uma
                  recusa — é funcionalidade ainda não ligada.
                </p>
              )}

              {!!Object.keys(doc.erros).length && (
                <p className="flex items-start gap-2 text-[12px] font-semibold text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  Falhou a leitura de: {Object.keys(doc.erros).map((t) => TABELA_LABEL[t] ?? t).join(', ')}.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!downloadJson(exportFileName(user.uid), texto)) setPaste(true);
                  }}
                  className={`${BTN} btn-main grow`}
                >
                  <Download className="w-4 h-4" /> Transferir
                </button>
                <button
                  onClick={copy}
                  aria-label="Copiar os dados"
                  className={`${BTN} shrink-0 px-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200`}
                >
                  {copied ? <Check className="w-4 h-4 text-purple-600 dark:text-purple-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>

              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                No telemóvel, se o ficheiro não descer, use «Copiar» e cole numa nota
                ou num e-mail seu.
              </p>

              {paste && (
                <textarea
                  readOnly
                  value={texto}
                  onFocus={(e) => e.target.select()}
                  aria-label="Dados em texto, para copiar à mão"
                  className="w-full h-40 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-700 p-3 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 outline-none focus:border-purple-500"
                />
              )}
            </div>
          )}
        </div>

        {/* ---------------- eliminação ---------------- */}
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-red-800 dark:text-red-200">
            <ShieldCheck className="w-4 h-4" />
            Apagar a minha conta
          </p>

          {sent || pending === true ? (
            <div className="mt-2 space-y-2">
              <p className="text-[13px] font-semibold text-red-900 dark:text-red-100">
                {sent
                  ? 'O seu pedido ficou na fila da equipa Elara.'
                  : 'Já tem um pedido de eliminação à espera.'}
              </p>
              <p className="text-[12px] text-red-800 dark:text-red-200">
                Quem vê a fila confirma consigo antes de apagar seja o que for. Para
                ir mais depressa, escreva para o apoio com o código da sua conta.
              </p>
              <a
                href={waLink(APOIO_PHONE, `Peço a eliminação da minha conta Elara (id ${user.uid}).`)}
                target="_blank"
                rel="noreferrer"
                className={`${BTN} w-full h-11 bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200`}
              >
                <Clipboard className="w-4 h-4" /> Falar com o apoio
              </a>
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              <p className="text-[12px] text-red-800 dark:text-red-200">
                Este botão <strong>não apaga nada</strong>: escreve um pedido que a
                equipa lê. A eliminação a sério é feita por uma pessoa, e é na conta
                Elara — a mesma conta serve o Marketplace, por isso apagar aqui
                apaga o acesso às duas apps.
              </p>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-0.5 w-5 h-5 shrink-0 rounded accent-purple-600"
                />
                <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200">
                  Percebo que é um pedido, que a conta é partilhada com o Elara
                  Marketplace e que as viagens já fechadas ficam no registo
                  financeiro que a lei obriga a guardar.
                </span>
              </label>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 400))}
                placeholder="Quer dizer-nos porquê? (opcional)"
                rows={2}
                className="w-full rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none focus:border-purple-500"
              />

              <button
                onClick={send}
                disabled={!understood || sending}
                className={`${BTN} w-full ${(!understood || sending) ? OFF : 'bg-red-600 text-white active:bg-red-700'}`}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Enviar o pedido
              </button>

              {pending === 'cega' && (
                <p className="text-[12px] text-red-800 dark:text-red-200">
                  Não conseguimos verificar se já tem um pedido aberto — se já pediu,
                  não peça outra vez: fale com o apoio.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ---------------- a fila, do lado de quem pediu ---------------- */}
        <MyReports uid={user.uid} refreshKey={sent ? 1 : 0} />

        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Hospedagem: Supabase (base de dados) e Vercel (a app). Mapas: OpenFreeMap.
          Os telefones de passageiro e motorista nunca aparecem um ao outro.
        </p>
      </div>
    </Sheet>
  );
}
