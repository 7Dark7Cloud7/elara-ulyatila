/**
 * Preço em kwanzas: "Kz 1.500.000". Formato manual e não
 * `toLocaleString('pt-AO')` — esse separador depende do ICU instalado na
 * WebView do telemóvel, e uma montra não pode mostrar preços que mudam de
 * aspecto conforme o aparelho.
 */
const group = (n: number): string =>
  Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const formatKz = (value: number | string | null | undefined): string => {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `Kz ${group(n)}`;
};

/** As notas que andam no bolso em Angola. Não é um catálogo de luxo: é o que o
 *  motorista costuma ter para troco, e é por isso que a app avisa antes da
 *  corrida começar em vez de discutir o assunto no destino. */
export const NOTES = [500, 1000, 2000, 5000, 10000] as const;

/** A menor nota que cobre o preço — o troco mais pequeno possível. */
export const suggestNote = (priceKz: number): number | null =>
  NOTES.find((n) => n >= priceKz) ?? null;

export const changeOf = (noteKz: number, priceKz: number): number =>
  Math.max(0, noteKz - priceKz);
