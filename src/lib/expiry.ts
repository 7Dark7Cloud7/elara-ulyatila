import { supabase } from './supabase';

/**
 * A validade dos papéis do motorista — o item 4 da auditoria (GOALS §6-C).
 *
 * Dois planos, e a app diz sempre em qual está:
 *
 * 1. **Sem a 0008** (o estado de hoje): as datas vivem só neste aparelho, como a
 *    conta de horas do `shift.ts`. A equipa não as vê, e a app diz isso.
 * 2. **Com a 0008 aplicada**: as mesmas datas vão para `tr_driver_doc`, na ficha
 *    do próprio motorista, e passam a ser lidas de lá. Continuam a ser o que o
 *    motorista escreveu: uma **declaração**. A 0007 abre os campos de verificação
 *    da equipa; nada aqui escreve «verificado».
 *
 * O que esta peça deliberadamente NÃO faz: auto-suspender ninguém. Um papel
 * vencido é uma conversa com a equipa, não um botão que desliga um motorista que
 * está na rua — e o brief não permite ligar o `tr_violation` enquanto não houver
 * maneira de levantar a suspensão.
 */

export type PaperId = 'licence' | 'insurance' | 'inspection' | 'bi';

export interface Paper {
  id: PaperId;
  label: string;
  /** Nome como o documento se chama na rua, para a pessoa não hesitar. */
  street: string;
  /** A coluna da 0008. Sem ela, o servidor não tem onde isto viver. */
  column: string;
}

export const PAPERS: Paper[] = [
  { id: 'licence', label: 'Carta de condução', street: 'Carta', column: 'licence_until' },
  { id: 'insurance', label: 'Seguro do carro', street: 'Seguro', column: 'insurance_until' },
  { id: 'inspection', label: 'Inspeção técnica', street: 'Inspeção', column: 'inspection_until' },
  { id: 'bi', label: 'Bilhete de identidade', street: 'BI', column: 'bi_until' },
];

/** Avisar duas semanas antes: é o tempo de ir ao balcão sem perder o dia de trabalho. */
export const WARN_DAYS = 14;

const DAY = 86_400_000;
const LUANDA_OFFSET = 3600000;

/** Uma data só, sem horas: «2027-03-14». É o que o `<input type="date">` dá. */
export type DateKey = string;

const KEY = 'tr.papers.v1';

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Componentes de uma data, conferidos com o calendário de verdade: «31 de
 *  Fevereiro» passa num `Date.UTC` à toa (vira 3 de Março), e uma data dessas
 *  numa ficha de motorista é pior que nenhuma data. */
function dayParts(key: DateKey): { y: number; m: number; d: number } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (y < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(y, month - 1, day);
  if (Number.isNaN(ms)) return null;
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return { y, m: month, d: day };
}

/** `true` só para datas que existem. É o filtro de tudo o que vem do formulário. */
export const isDateKey = (s: string): boolean => dayParts(s) !== null;

/** Dia do calendário contado desde 1970-01-01. Sem fuso: é só aritmética de dias. */
export function dayNumber(key: DateKey): number | null {
  const p = dayParts(key);
  return p === null ? null : Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY);
}

/** O dia de hoje em Luanda (UTC+1), quer o telefone esteja noutro fuso quer não. */
export function todayKey(now = Date.now()): DateKey {
  const d = new Date(now + LUANDA_OFFSET);
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

/** `key` como milissegundos ao meio-dia UTC do dia. É o que a 0008 guarda. */
export const keyToMs = (key: DateKey): number | null => {
  const n = dayNumber(key);
  return n === null ? null : n * DAY + DAY / 2;
};

/** O contrário: o número da coluna `*_until` de volta a uma data legível. */
export const msToKey = (ms: number): DateKey | null => {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms - DAY / 2);
  const key = `${d.getUTCFullYear().toString().padStart(4, '0')}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
  return isDateKey(key) ? key : null;
};

/** Dias de diferença. Negativo = já venceu. No próprio dia ainda é válido: conta 0. */
export function daysUntil(key: DateKey, now = Date.now()): number | null {
  const a = dayNumber(key);
  const b = dayNumber(todayKey(now));
  if (a === null || b === null) return null;
  return a - b;
}

export type PaperStatus = 'none' | 'ok' | 'soon' | 'expired';

export const statusOf = (days: number | null): PaperStatus => {
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= WARN_DAYS) return 'soon';
  return 'ok';
};

/** A frase do estado. `null` quando não há data — e «sem data» não é «válido».
 *  A data em si mostra-se na linha do papel: aqui só o que ainda resta. */
export function statusText(status: PaperStatus, days: number | null): string {
  if (status === 'none') return 'sem data';
  if (status === 'expired') {
    const late = days === null ? null : Math.abs(days);
    if (late === null) return 'vencido';
    if (late === 1) return 'venceu ontem';
    return `vencido há ${late} dias`;
  }
  if (status === 'ok') return 'em dia';
  if (days === 0) return 'vence hoje';
  return days === 1 ? 'falta 1 dia' : `faltam ${days} dias`;
}

/** 14 de março de 2027 — a data em palavras, no formato que se lê de uma vez. */
export function humanDate(key: DateKey): string {
  const n = dayNumber(key);
  if (n === null) return key;
  return new Date(n * DAY).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
}

export interface PaperMap {
  [id: string]: DateKey | undefined;
}

const readBook = (): Record<string, PaperMap> => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, PaperMap>) : {};
  } catch {
    return {};
  }
};

const writeBook = (book: Record<string, PaperMap>): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch { /* modo privado: as datas simplesmente não ficam neste aparelho */ }
};

/** O que está guardado neste telemóvel. Sempre existe, com ou sem servidor. */
export function localPapers(driverId: string): PaperMap {
  const book = readBook();
  const map = book[driverId] ?? {};
  const out: PaperMap = {};
  for (const p of PAPERS) if (isDateKey(String(map[p.id] ?? ''))) out[p.id] = map[p.id];
  return out;
}

/** Juntar ao que já está guardado (a leitura do servidor). */
const mergeLocal = (driverId: string, map: PaperMap): void => {
  const book = readBook();
  book[driverId] = { ...(book[driverId] ?? {}), ...map };
  writeBook(book);
};

/** Substituir o estado (a gravação do formulário): limpar uma data apaga-a. */
const putLocal = (driverId: string, map: PaperMap): void => {
  const book = readBook();
  book[driverId] = map;
  writeBook(book);
};

/**
 * As colunas da 0008. Se a migração não foi aplicada, a PostgREST responde «não
 * conheço essa coluna» e isto fica `false` para a sessão inteira: uma tentativa
 * por visita ao ecrã, não uma por tecla.
 */
let serverColumns: boolean | null = null;

const columnMissing = (message: string | null | undefined): boolean =>
  /_until|42703|does not exist|Could not find the .* column/i.test(message ?? '');

export const papersLive = async (): Promise<boolean> => {
  if (serverColumns !== null) return serverColumns;
  const { error } = await supabase.from('tr_driver_doc').select(PAPERS[0].column).limit(1);
  serverColumns = !error || !columnMissing(error.message);
  return serverColumns;
};

export interface LoadedPapers {
  dates: PaperMap;
  /** `true` quando as datas vivem na ficha, no servidor. */
  live: boolean;
  /** `true` quando a leitura do servidor falhou mas o telemóvel tem datas. */
  stale: boolean;
}

/**
 * Ler as datas. Com a 0008, a ficha manda (é o que a equipa pode um dia
 * conferir); sem ela, manda o telemóvel. Uma leitura que falha não apaga o que
 * está guardado — um 2G não pode fazer um motorista perder a data do seguro.
 */
export async function loadPapers(driverId: string): Promise<LoadedPapers> {
  const local = localPapers(driverId);
  const live = await papersLive();
  if (!live) return { dates: local, live: false, stale: false };

  const cols = PAPERS.map((p) => p.column).join(', ');
  const { data, error } = await supabase
    .from('tr_driver_doc')
    .select(cols)
    .eq('driver_id', driverId)
    .maybeSingle();
  if (error) {
    if (columnMissing(error.message)) {
      serverColumns = false;
      return { dates: local, live: false, stale: false };
    }
    return { dates: local, live: true, stale: true };
  }

  const row = (data ?? {}) as Record<string, number>;
  const dates: PaperMap = {};
  for (const p of PAPERS) {
    const fromServer = msToKey(Number(row[p.column] ?? 0));
    if (fromServer) dates[p.id] = fromServer;
  }
  // O servidor não tem nada ainda: o telemóvel serve de ponte até a pessoa gravar.
  const merged = Object.keys(dates).length ? dates : local;
  mergeLocal(driverId, merged);
  return { dates: merged, live: true, stale: false };
}

/**
 * Gravar. O telemóvel escreve sempre; o servidor escreve quando tem colunas.
 * Devolve `live` para o ecrã poder dizer a verdade sobre onde a data ficou.
 */
export async function savePapers(driverId: string, map: PaperMap): Promise<{ live: boolean; error: string | null }> {
  const clean: PaperMap = {};
  for (const p of PAPERS) {
    const v = map[p.id];
    if (v && isDateKey(v)) clean[p.id] = v;
  }
  putLocal(driverId, clean);
  if (!(await papersLive())) return { live: false, error: null };

  const patch: Record<string, number | string> = {
    expiry_updated_at: Date.now(),
    expiry_entered_by: 'motorista',
  };
  for (const p of PAPERS) patch[p.column] = clean[p.id] ? keyToMs(clean[p.id]!) ?? 0 : 0;
  const { error } = await supabase.from('tr_driver_doc').update(patch).eq('driver_id', driverId);
  if (error && columnMissing(error.message)) {
    serverColumns = false;
    return { live: false, error: null };
  }
  if (error) return { live: true, error: error.message.replace(/^ERROR:\s*/i, '') };
  return { live: true, error: null };
}

/** O resumo que a praça mostra: só o que ainda pode apanhar alguém na rua com o
 *  papel vencido. Um ecrã verde a dizer «está tudo em dia» seria ruído. */
export interface PapersAlert {
  status: Extract<PaperStatus, 'soon' | 'expired'>;
  label: string;
  text: string;
}

export function worstPaper(dates: PaperMap, now = Date.now()): PapersAlert | null {
  let worst: PapersAlert | null = null;
  for (const p of PAPERS) {
    const key = dates[p.id];
    if (!key) continue;
    const days = daysUntil(key, now);
    const status = statusOf(days);
    if (status !== 'soon' && status !== 'expired') continue;
    if (!worst || (worst.status !== 'expired' && status === 'expired')) {
      worst = { status, label: p.street, text: statusText(status, days) };
    }
  }
  return worst;
}

/** Contar os papéis sem data: é o estado vazio, e diz-se como tal. */
export const missingCount = (dates: PaperMap): number =>
  PAPERS.filter((p) => !dates[p.id]).length;
