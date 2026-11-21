import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption', 'label', 'body', 'control', 'lead', 'stat', 'title', 'hero', 'display'] }],
    },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const when = (at: number): string => {
  const d = new Date(at);
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return hm;
  const yesterday = new Date(today.getTime() - 864e5);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return `ontem ${hm}`;
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`;
};

export const minutesAgo = (at: number): string => {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (m < 1) return 'agora mesmo';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
};

/** Metros até ao centímetro que interessa: ninguém diz «0,4 km» na rua. */
export const meters = (m: number): string => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

export const waLink = (phone: string, text: string): string =>
  `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

/** O número que a equipa lê. Vive aqui porque cinco ecrãs diferentes chamam a
 *  pessoa para o mesmo sítio, e um número errado em dois deles é pior do que
 *  nenhum. */
export const APOIO_PHONE = '244921044212';

/** O mesmo número, escrito como a pessoa o lê num ecrã. */
export const APOIO_DISPLAY = '+244 921 044 212';

/**
 * Botão desligado — o cinzento da app inteira, num só sítio.
 *
 * Antes era `opacity-50` sobre o roxo com texto branco: 3,0:1, ou seja, a
 * frase que diz à pessoa *o que falta* para o botão acender era justamente a
 * que se não conseguia ler. Aqui o fundo desliga-se e o texto não: zinco 600
 * sobre zinco 200 no claro (6,1:1) e zinco 400 sobre zinco 800 no escuro
 * (5,8:1). Continua a parecer o que é — um botão que ainda não pega.
 */
export const OFF =
  'pointer-events-none bg-zinc-200 text-zinc-600 shadow-none active:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:active:bg-zinc-800';

/**
 * O mesmo desligado, para os botões que se apagam com o atributo `disabled`
 * em vez de uma classe condicional. Tem de ser escrito com o prefixo `disabled:`
 * no literal — o Tailwind só vê o que está escrito no código, não o que é
 * composto em runtime.
 */
export const OFF_ATTR =
  'disabled:bg-zinc-200 disabled:text-zinc-600 disabled:shadow-none disabled:border-zinc-300 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400 dark:disabled:border-zinc-700';
