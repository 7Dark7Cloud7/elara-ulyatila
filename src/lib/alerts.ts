import { useEffect, useState } from 'react';

/**
 * Sons, vibração e consumo de dados — as três coisas que se decidem no telemóvel
 * de quem conduz ou espera na paragem. Nada disto vai ao servidor: é uma
 * preferência do aparelho, guardada no storage local.
 */
export interface Prefs {
  sound: boolean;
  vibrate: boolean;
  /** Modo dados móveis: pára a varanda de carros no mapa e abranda as leituras.
   *  A viagem em si continua a chegar — isso é o que a pessoa pediu. */
  lowData: boolean;
  /** Avisos de noite (21 h – 05 h): a verificação de viagem pergunta mais cedo
   *  e a consola lembra o que já se sabe — confirmar a matrícula e partilhar.
   *  Não liga nada sozinha: muda só a hora a que a app abre a boca. */
  night: boolean;
}

const KEY = 'tr.prefs.v1';
const DEFAULTS: Prefs = { sound: true, vibrate: true, lowData: false, night: true };

let cache: Prefs | null = null;
const listeners = new Set<(p: Prefs) => void>();

function read(): Prefs {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

export function getPrefs(): Prefs {
  return read();
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  const next = { ...read(), [key]: value };
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* modo privado */ }
  listeners.forEach((l) => l(next));
}

export function usePrefs(): Prefs {
  const [prefs, setPrefs] = useState<Prefs>(read);
  useEffect(() => {
    const l = (p: Prefs) => setPrefs(p);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return prefs;
}

/** O browser só deixa tocar som depois de um gesto; se não puder, falamos em
 *  silêncio em vez de encher a consola de erros. */
let audioCtx: AudioContext | null = null;

const tones = (kind: 'arrival' | 'request') => (kind === 'arrival' ? [880, 1174] : [659]);

export function chime(kind: 'arrival' | 'request'): void {
  if (!read().sound) return;
  try {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    tones(kind).forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.18;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.14, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.2);
    });
  } catch { /* sem áudio neste browser */ }
}

export function buzz(pattern: number | number[]): void {
  if (!read().vibrate) return;
  try { navigator.vibrate?.(pattern); } catch { /* iOS não tem */ }
}

export const reduceMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
