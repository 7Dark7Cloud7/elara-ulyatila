/**
 * Números só aparecem quando há corpo para eles. Uma equipa de uma a três
 * pessoas não modera nada, e uma conta nova pode encher-se de estrelas numa
 * tarde — por isso a app empresta credibilidade a ninguém: mostra a contagem
 * quando a amostra é pequena, e diz «poucas para contar» quando não há taxa
 * possível. É o contrário de um badge inventado.
 */

/** Abaixo disto não se mostra média: mostra-se que ainda não há média. */
export const MIN_RATINGS = 3;

export interface Scored {
  rating: number;
  rating_count: number;
}

/** O texto que vai ao lado da estrela. Nunca um 5,0 de uma avaliação. */
export const ratingBadge = (d: Scored): string => {
  if (d.rating_count >= MIN_RATINGS && d.rating > 0) return d.rating.toFixed(1);
  if (!d.rating_count) return 'novo';
  return `novo · ${d.rating_count} nota${d.rating_count > 1 ? 's' : ''}`;
};

/** Abaixo disto, uma taxa de cancelamento é um número ao acaso. */
export const MIN_TRIPS_FOR_RATE = 5;

export const cancelBadge = (accepted: number, mine: number): string => {
  const corridas = `${accepted} corrida${accepted === 1 ? '' : 's'}`;
  if (accepted < MIN_TRIPS_FOR_RATE) return `${corridas} — poucas para contar`;
  if (!mine) return `${corridas} · sem cancelamentos`;
  return `${corridas} · cancelou ${mine} (${Math.round((mine / accepted) * 100)} %)`;
};
