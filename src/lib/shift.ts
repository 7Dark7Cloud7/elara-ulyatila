/**
 * A única conta de horas que esta app pode fazer sem ninguém no servidor:
 * quanto tempo este aparelho passou com o carro ligado na praça.
 *
 * Não é tempo ao volante. A app não mede movimento nenhum, não sabe se o carro
 * está a andar ou parado num entroncamento, e por isso nunca diz «conduzidas»:
 * diz «ligado». E não trava ninguém — um condutor com 10 h contadas pode
 * continuar ligado; o que existe aqui é o aviso, uma vez por vez.
 */

const KEY = 'tr.shift.v1';

/** Dez horas seguidas ligado. É a fasquia do objectivo 6.1, não uma lei. */
export const SHIFT_LIMIT_MIN = 600;

interface Stretch {
  since: number;
  /** O último batimento visto por este aparelho. Serve para uma coisa: se o
   *  telemóvel foi fechado à força, o tempo que ele não observou não conta. */
  seen: number;
  /** «Vou fazer uma pausa»: silencia por um bocado, sem apagar a contagem. */
  snooze_until?: number;
}

type Book = Record<string, Stretch>;

/** Mais de 15 minutos sem batimento = a app esteve fechada, não só atrasada. */
const GAP_MS = 15 * 60_000;

const read = (): Book => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Book) : {};
  } catch {
    return {};
  }
};

const write = (book: Book): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch { /* modo privado: a conta simplesmente não existe */ }
};

/** Acabámos de ver este aparelho à hora `at`. Se entre o último batimento e
 *  agora houve mais de um quarto de hora de silêncio, esse tempo não foi
 *  observado por ninguém: a app estava fechada no bolso. Não se conta. */
const observed = (s: Stretch | undefined, at: number): Stretch =>
  (!s?.since || at - s.seen > GAP_MS) ? { since: at, seen: at } : { ...s, seen: at };

/** Começa a contar quando o carro fica online. */
export function beginShift(uid: string, at = Date.now()): void {
  const book = read();
  book[uid] = observed(book[uid], at);
  write(book);
}

/** O batimento que mantém a contagem viva — e que desfaz a meia-noite: um
 *  telemóvel suspenso na gaveta não fez dez horas de trabalho. */
export function touchShift(uid: string, at = Date.now()): void {
  const book = read();
  if (!book[uid]?.since) return;
  book[uid] = observed(book[uid], at);
  write(book);
}

/** Ficar offline fecha a contagem: a pausa aconteceu, e amanhã é outra vez zero. */
export function endShift(uid: string): void {
  const book = read();
  if (book[uid]) {
    delete book[uid];
    write(book);
  }
}

/** O aparelho pode ter sido fechado à força com o carro «online». Sem este
 *  ajuste, a volta a abrir amanhã contaria ontem à noite. */
export function syncShift(uid: string, online: boolean): void {
  if (!online) endShift(uid);
  else beginShift(uid);
}

export interface ShiftNow {
  minutes: number;
  /** Passou a fasquia e não está em silêncio. */
  due: boolean;
}

export function shiftNow(uid: string, now = Date.now()): ShiftNow {
  const s = read()[uid];
  if (!s?.since) return { minutes: 0, due: false };
  // Sem batimento recente não há contagem: o que se passou depois disso não
  // foi observado, e mostrar um número velho seria pior do que não mostrar.
  if (now - s.seen > GAP_MS) return { minutes: 0, due: false };
  const minutes = Math.max(0, Math.round((now - s.since) / 60_000));
  const sleeping = !!s.snooze_until && now < s.snooze_until;
  return { minutes, due: minutes >= SHIFT_LIMIT_MIN && !sleeping };
}

/** Uma pausa de 30 minutos de silêncio. A contagem continua: o tempo não passa. */
export function snoozeShift(uid: string, minutes = 30, at = Date.now()): void {
  const book = read();
  if (book[uid]) {
    book[uid] = { ...book[uid], snooze_until: at + minutes * 60_000 };
    write(book);
  }
}

export const shiftLabel = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`;
};
