import { supabase } from './supabase';
import {
  AUTO_REPORT_REASONS, DRIVER_REPORT_REASONS, PLACE_REPORT_REASONS, REPORT_REASONS,
} from './trips';
import { ACCOUNT_REASONS } from './dataexport';

/**
 * O ciclo de um pedido: quem escreve vê o estado, quem decide escreve-o.
 *
 * Não há nada de novo aqui — `tr_report.state` e `tr_report.outcome` existem
 * desde a migração 0001, e a política da mesma migração já deixa o autor ler as
 * linhas dele e a equipa actualizar as de todos. O que faltava era a app ler a
 * primeira metade e escrever a segunda: a pessoa denunciava e não voltava a
 * saber do assunto, e a equipa resolvia sem que a decisão chegasse a alguém.
 */

export type ReportState = 'open' | 'review' | 'resolved';

export interface MyRequest {
  id: string;
  reason: string;
  text: string;
  state: ReportState;
  at: number;
  resolved_at: number | null;
  outcome: string | null;
  by_role: 'passenger' | 'driver';
}

const ALL_REASONS = [
  ...REPORT_REASONS, ...DRIVER_REPORT_REASONS, ...AUTO_REPORT_REASONS,
  ...PLACE_REPORT_REASONS, ...ACCOUNT_REASONS,
];

/** Nunca uma chave crua na cara de quem não escolheu essa palavra. */
export const reportLabel = (id: string): string =>
  ALL_REASONS.find((r) => r.id === id)?.label ?? id;

export const REPORT_STATE_LABEL: Record<ReportState, string> = {
  open: 'Aberta',
  review: 'Em análise',
  resolved: 'Resolvida',
};

export const REPORT_STATE_TONE: Record<ReportState, string> = {
  open: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
  review: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
  resolved: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
};

/**
 * Os pedidos desta conta, do mais recente para o mais antigo. Devolve `null`
 * quando a leitura falha — um vazio e uma falha são coisas diferentes no ecrã,
 * e dizer «não pediu nada» a quem pediu seria uma mentira sobre a fila.
 */
/**
 * A leitura é `select('*')` de propósito: se uma coluna ainda não estiver no
 * servidor, simplesmente não vem, e o ecrã continua a mostrar o estado. Com a
 * lista de colunas escrita à mão, a falta de uma delas tapava a fila toda.
 */
export async function myRequests(uid: string): Promise<MyRequest[] | null> {
  const { data, error } = await supabase
    .from('tr_report')
    .select('*')
    .eq('by_id', uid)
    .order('at', { ascending: false })
    .limit(20);
  if (error) return null;
  return (data as MyRequest[]) ?? [];
}

/** `outcome` é a única coluna deste ficheiro que a app nunca escreveu: está na
 *  0001 do repo, mas se o servidor vier de um rascunho sem ela, a *decisão* da
 *  equipa tem de ficar na mesma. Uma nota perdida não pode arrastar um estado. */export const isMissingColumn = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === 'PGRST204' || /could not find the .* column/i.test(e.message ?? ''));

/** A nota de quem decidiu. Vai à coluna `outcome`; 200 caracteres é o que o
 *  ecrã de um telemóvel mostra sem engolir o resto. */
export const OUTCOME_MAX = 200;

export const cleanOutcome = (s: string): string | null => {
  const t = s.trim().replace(/\s+/g, ' ').slice(0, OUTCOME_MAX);
  return t.length ? t : null;
};

const DAY = 86_400_000;

/**
 * «Falta o nome do meu bairro.» O índice de lugares é grande mas não é o país
 * inteiro, e quem está no terreno sabe de nomes que o mapa ainda não tem
 * (micro-nomes como «Mbondo Chapéu» vivem nas ruas e nas igrejas, não nas
 * etiquetas `place`). Em vez de a pessoa desistir, manda o bilhete para a
 * mesma fila que a equipa já lê, com a palavra exacta que procurou.
 *
 * Não cria tabela nem coluna: `tr_report` aceita `reason` à letra desde a 0001.
 */
export type MissingPlace = 'enviado' | 'ja_pedido' | 'vazio' | 'falhou';

const cleanQuery = (s: string): string => s.trim().replace(/\s+/g, ' ').slice(0, 120);

export async function reportMissingPlace(
  uid: string,
  role: 'passenger' | 'driver',
  query: string,
): Promise<MissingPlace> {
  const text = cleanQuery(query);
  if (!text) return 'vazio';
  // Um dia de silêncio para a mesma palavra: quem procura teimosamente e volta
  // a carregar não enche a fila da equipa com bilhetes repetidos. Se esta
  // leitura falhar, segue-se na mesma — um bilhete repetido é barato, um nome
  // que a equipa nunca vê não é.
  const { data: same } = await supabase
    .from('tr_report')
    .select('id')
    .eq('by_id', uid)
    .eq('reason', 'lugar_em_falta')
    .eq('text', text)
    .gte('at', Date.now() - DAY)
    .limit(1);
  if (same && same.length) return 'ja_pedido';
  const { error } = await supabase.from('tr_report').insert({
    trip_id: null,
    by_id: uid,
    by_role: role,
    reason: 'lugar_em_falta',
    text,
    at: Date.now(),
  });
  return error ? 'falhou' : 'enviado';
}
