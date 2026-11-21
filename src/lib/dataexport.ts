import { supabase } from './supabase';
import { isNotReady } from './rentals';
import { PAPERS, humanDate, localPapers, msToKey, type PaperMap } from './expiry';
import type { SessionUser } from '../types';

/**
 * A cópia dos dados de uma conta, feita sem migração nenhuma.
 *
 * Não existe (nem vai existir) uma função no servidor que deite a conta cá
 * para fora: o que aqui está é exactamente aquilo que o Row Level Security já
 * deixa esta pessoa ler, tabela a tabela. Isso tem duas consequências que
 * este ficheiro assume — ele não precisa de autorização nova, e ele mostra
 * também o que não veio, porque um vazio silencioso faria dele uma promessa
 * falsa.
 *
 * A única coisa que não vem do servidor são as datas de validade que este
 * telemóvel guarda enquanto a `0008` não for aplicada: vêm à parte e com o
 * nome à vista, porque uma cópia que esconde o que a app escreveu já não é a
 * cópia dos dados da pessoa.
 */

export interface MyExport {
  ficheiro: 'elara-ulyatila-dados';
  gerado_em: string;
  app: { nome: string; versao: string };
  conta: { id: string; nome: string; email: string };
  aviso: string;
  dados: Record<string, unknown[]>;
  /** Tabelas que o servidor ainda não tem (migrações por aplicar). */
  em_falta: string[];
  /** Tabelas que falharam de outra forma — rede, permissão. */
  erros: Record<string, string>;
  total_linhas: number;
}

interface Job {
  chave: string;
  tabela: string;
  colunas: string;
  filtro: [string, string];
  ordem: string;
}

/** As tabelas em que esta conta tem linhas próprias. `tr_report` entra porque
 *  é a pessoa que escreve; `tr_trip_secret` fica de fora de propósito — o PIN
 *  já não serve para nada depois da viagem e não é dado pessoal útil. */
const jobs = (uid: string): Job[] => [
  { chave: 'viagens', tabela: 'tr_trip', colunas: '*', filtro: ['passenger_id', uid], ordem: 'created_at' },
  { chave: 'carro_condutor', tabela: 'tr_driver', colunas: '*', filtro: ['account_id', uid], ordem: 'created_at' },
  { chave: 'movimentos_carteira', tabela: 'tr_wallet_tx', colunas: '*', filtro: ['who', uid], ordem: 'at' },
  { chave: 'pedidos_dinheiro', tabela: 'tr_money_request', colunas: '*', filtro: ['who', uid], ordem: 'at' },
  { chave: 'reportes', tabela: 'tr_report', colunas: '*', filtro: ['by_id', uid], ordem: 'at' },
  { chave: 'pedidos_aluguer', tabela: 'tr_rental_request', colunas: '*', filtro: ['renter_id', uid], ordem: 'created_at' },
  { chave: 'avaliacoes', tabela: 'tr_review', colunas: '*', filtro: ['by_id', uid], ordem: 'at' },
  { chave: 'lugares_guardados', tabela: 'tr_saved_place', colunas: '*', filtro: ['owner_id', uid], ordem: 'created_at' },
];

/** Uma data em millis não é um dado que a pessoa consiga ler no próprio
 *  ficheiro; sai também por extenso, na ordem em que a app mostra os papéis. */
function readableDates(dates: PaperMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PAPERS) {
    const key = dates[p.id];
    if (key) out[p.label] = humanDate(key);
  }
  return out;
}

const datesFromRow = (row: Record<string, unknown>): PaperMap => {
  const map: PaperMap = {};
  for (const p of PAPERS) {
    const key = typeof row[p.column] === 'number' ? msToKey(row[p.column] as number) : null;
    if (key) map[p.id] = key;
  }
  return map;
};

/**
 * A ficha de documentos é a única tabela do motorista sem `account_id`: as
 * linhas dela encontram-se pelos `id` que a leitura de `tr_driver` acabou de
 * dar, e `.in()` é precisamente o predicado da política `tr_driver_doc_read`
 * da 0001. Uma conta que nunca se inscreveu como motorista não tem ficha — e
 * por isso não tem nada em falta, o que é diferente de «falhou».
 */
async function addDocs(doc: MyExport, driverIds: string[]): Promise<void> {
  if (!driverIds.length) return;
  const { data, error } = await supabase
    .from('tr_driver_doc')
    .select('*')
    .in('driver_id', driverIds);
  if (error) {
    if (isNotReady(error)) doc.em_falta.push('tr_driver_doc');
    else doc.erros.tr_driver_doc = error.message.replace(/^ERROR:\s*/i, '');
    return;
  }
  const rows = (data as Record<string, unknown>[]) ?? [];
  doc.dados.documentos = rows.map((r) => ({ ...r, datas: readableDates(datesFromRow(r)) }));
  doc.total_linhas += rows.length;
  const soAparelho = driverIds
    .map((id) => ({ motorista: id, datas: readableDates(localPapers(id)) }))
    .filter((x) => Object.keys(x.datas).length > 0);
  if (soAparelho.length) doc.dados.datas_neste_telemovel = soAparelho;
}

/**
 * Lê a conta inteira. Nunca rebenta: uma tabela em falta é anotada e o
 * ficheiro segue com o resto, porque receber um erro vermelho no meio de um
 * pedido destes seria pior do que não pedir nada.
 */
export async function exportMyData(user: SessionUser): Promise<MyExport> {
  const doc: MyExport = {
    ficheiro: 'elara-ulyatila-dados',
    gerado_em: new Date().toISOString(),
    app: { nome: 'Elara Ulyatila', versao: __APP_VERSION__ },
    conta: { id: user.uid, nome: user.name, email: user.email },
    aviso: 'Esta é a leitura que a sua própria conta tem no servidor da Ulyatila.'
      + ' Não é um espelho da base de dados: ficam de fora os registos de sessão'
      + ' e o que a equipa guarda fora desta app. As tabelas que não apareceram'
      + ' estão listas em «em_falta» ou «erros». As datas dos papéis que só este'
      + ' telemóvel guarda vêm à parte, em «datas_neste_telemovel».',
    dados: {},
    em_falta: [],
    erros: {},
    total_linhas: 0,
  };

  const results = await Promise.all(jobs(user.uid).map(async (job) => {
    const { data, error } = await supabase
      .from(job.tabela)
      .select(job.colunas)
      .eq(job.filtro[0], job.filtro[1])
      .order(job.ordem, { ascending: false })
      .limit(500);
    return { job, rows: (data as unknown[]) ?? null, error };
  }));

  for (const r of results) {
    if (r.error) {
      if (isNotReady(r.error)) doc.em_falta.push(r.job.tabela);
      else doc.erros[r.job.tabela] = r.error.message.replace(/^ERROR:\s*/i, '');
      continue;
    }
    doc.dados[r.job.chave] = r.rows ?? [];
    doc.total_linhas += (r.rows ?? []).length;
  }

  const motoristas = ((doc.dados.carro_condutor ?? []) as { id?: string }[])
    .map((d) => d.id)
    .filter((x): x is string => typeof x === 'string');
  await addDocs(doc, motoristas);

  return doc;
}

export const exportText = (doc: MyExport): string => JSON.stringify(doc, null, 2);

/** Nome curto e sem espaços: uma data à frente e o resto é ruído. */
export const exportFileName = (uid: string): string =>
  `elara-ulyatila-${new Date().toISOString().slice(0, 10)}-${uid.slice(0, 8)}.json`;

/**
 * Transferir o ficheiro. No site funciona; na WebView do APK o `download` é
 * muitas vezes ignorado em silêncio — por isso a folha oferece sempre «Copiar»
 * ao lado, e o texto à vista se a área de transferência também falhar.
 */
export function downloadJson(name: string, text: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<string | null> {
  try {
    await navigator.clipboard.writeText(text);
    return null;
  } catch {
    return 'A área de transferência não respondeu.';
  }
}

/**
 * O pedido de eliminação. É um bilhete na fila que a equipa lê, não um botão
 * que apaga: a mesma conta Elara serve o Marketplace, e deitar abaixo o login
 * de alguém com um toque era estragar-lhe a outra app sem lha perguntar. A
 * eliminação a sério acontece do lado da conta, confirmada por uma pessoa.
 */
export const ACCOUNT_REASONS = [
  { id: 'apagar_conta', label: 'Pedido de eliminação de conta' },
] as const;

const ACCOUNT_REASON_IDS: string[] = ACCOUNT_REASONS.map((r) => r.id);

export const isAccountRequest = (reason: string): boolean =>
  ACCOUNT_REASON_IDS.includes(reason);

/** Já há um pedido desta conta à espera? Evita dois bilhetes para o mesmo.
 *  `null` quando não se consegue saber — a folha então pergunta à pessoa. */
export async function openDeletionRequest(uid: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('tr_report')
    .select('id')
    .eq('by_id', uid)
    .eq('reason', 'apagar_conta')
    .neq('state', 'resolved')
    .limit(1);
  if (error) return null;
  return !!data && data.length > 0;
}

/** `note` é o que a pessoa escreveu. Vai à coluna `text`, como nos reportes. */
export async function sendDeletionRequest(
  uid: string,
  role: 'passenger' | 'driver',
  note: string,
): Promise<string | null> {
  const { error } = await supabase.from('tr_report').insert({
    trip_id: null,
    by_id: uid,
    by_role: role,
    reason: 'apagar_conta',
    text: note.trim().slice(0, 800),
    at: Date.now(),
  });
  return error ? error.message.replace(/^ERROR:\s*/i, '') : null;
}
