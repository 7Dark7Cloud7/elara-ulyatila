import { useEffect, useState } from 'react';

const THEME_KEY = 'trajectoria_theme';
const listeners = new Set<(dark: boolean) => void>();

let current = false;
let read = false;

/** A barra de estado do Android segue a folha, não o aparelho: o escuro é
 *  ameixa, o claro é creme. */
const paintChrome = (dark: boolean): void => {
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#1b0b38' : '#faf7f0');
};

/** Lê o tema do aparelho uma única vez e aplica a classe antes do primeiro
 *  desenho — sem isto o ecrã pisca branco para quem usa modo escuro.
 *  Quem nunca escolheu abre no escuro: é o desenho da tela principal. */
export function initTheme(): boolean {
  if (read) return current;
  read = true;
  const saved = localStorage.getItem(THEME_KEY);
  // Escuro por omissão: é o desenho da tela principal. Claro é uma escolha,
  // não o que o aparelho calhar de ter — e fica guardada.
  current = saved ? saved === 'dark' : true;
  document.documentElement.classList.toggle('dark', current);
  paintChrome(current);
  return current;
}

export function setTheme(dark: boolean): void {
  initTheme();
  current = dark;
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', dark);
  paintChrome(dark);
  listeners.forEach((f) => f(dark));
}

/** Um store minúsculo: o mapa precisa do tema para trocar o estilo dos tiles,
 *  e levá-lo por props desceria por quatro camadas de componentes. */
export function useTheme(): boolean {
  const [dark, setDark] = useState(initTheme);
  useEffect(() => {
    listeners.add(setDark);
    return () => { listeners.delete(setDark); };
  }, []);
  return dark;
}
