/**
 * Camada de mapa.
 *
 * MapLibre + estilos vectoriais do OpenFreeMap: sem chave de API, sem cookie,
 * sem registo e sem contas — os pedidos de tiles vão só para a rede aberta de
 * tiles (com dados do OpenStreetMap e do OpenMapTiles, ambos attribution
 * obrigatória, que o MapLibre mostra sozinho). Nada de chave da Google: um
 * mapa pago por visualização num produto que ainda não factura não é opção.
 *
 * O MapLibre entra por import dinâmico. São ~300 KB de JS gzip e um WebWorker:
 * carregá-los no arranque custaria segundos a quem abre a app com dados
 * móveis, e há ecrãs (carteira, histórico) que nunca mostram mapa nenhum.
 */
export type MapLibre = typeof import('maplibre-gl');
/** Ordem do MapLibre: [longitude, latitude]. */
export type LngLat = [number, number];

export const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const STYLE_DARK = 'https://tiles.openfreemap.org/styles/fiord';

/** Centro de Luanda — o ponto para onde se vai quando não há GPS nem zona. */
export const LUANDA = { lat: -8.8383, lon: 13.2344 };

let libPromise: Promise<MapLibre> | null = null;

export function loadMapLibre(): Promise<MapLibre> {
  if (!libPromise) {
    libPromise = (async () => {
      // O pacote é UMD: com bundlers o namespace pode vir todo ou sob `default`.
      const mod = (await import('maplibre-gl')) as unknown as Record<string, unknown>;
      const lib = (typeof mod.Map === 'function' ? mod : mod.default) as MapLibre;
      await import('maplibre-gl/dist/maplibre-gl.css');
      return lib;
    })();
  }
  return libPromise;
}

/** Linha recta em km. Serve para "a 1,2 km de si", nunca para a tarifa. */
export function haversineKm(
  aLat: number, aLon: number, bLat: number, bLon: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * O bairro mais próximo de um ponto marcado no mapa.
 *
 * Serve só para dizer a pessoa e ao motorista em que zona da cidade o pin caiu
 * («no bairro Palanca, a 400 m da paragem»). Não é morada, não é geocodificação,
 * e não substitui a referência que se escreve à mão.
 */
export function nearestZone<T extends { name: string; lat: number; lon: number }>(
  zones: T[], lat: number, lon: number,
): { zone: T; km: number } | null {
  if (!zones.length) return null;
  let best = zones[0];
  let bestKm = haversineKm(lat, lon, best.lat, best.lon);
  for (const z of zones) {
    const km = haversineKm(lat, lon, z.lat, z.lon);
    if (km < bestKm) { best = z; bestKm = km; }
  }
  return { zone: best, km: bestKm };
}

export function boundsOf(points: LngLat[]): [LngLat, LngLat] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

/**
 * Anel de um círculo com raio real (km) à volta de um ponto, em [lon, lat]
 * fechado. Fórmula do ponto de destino numa esfera: basta para desenhar o raio
 * de procura — não é preciso um router nem um motor de geometria.
 */
export function circlePolygonKm(
  lat: number, lon: number, km: number, segments = 72,
): LngLat[] {
  const R = 6371;
  const d = km / R; // raio angular em radianos
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const ring: LngLat[] = [];
  for (let i = 0; i <= segments; i++) {
    const brg = ((i / segments) * 360 * Math.PI) / 180;
    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(brg),
    );
    const λ2 = λ1 + Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * Math.sin(φ2),
    );
    ring.push([(((λ2 * 180) / Math.PI) + 540) % 360 - 180, (φ2 * 180) / Math.PI]);
  }
  return ring;
}

// — Marcadores ————————————————————————————————————————————————————————————————
//
// Feitos como elementos DOM com as classes Tailwind da app: os pinos do mapa
// obedecem ao .dark do mesmo jeito que o resto do ecrã. O texto entra sempre
// por textContent — nunca interpolado em HTML.

const CAR_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">' +
  '<path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 6h7a2 2 0 0 1 1.9 1.3L19 11"/>' +
  '<rect x="3.5" y="11" width="17" height="6.5" rx="2.2"/>' +
  '<path d="M7 17.5v1.9M17 17.5v1.9"/>' +
  '</svg>';

// A partida é o ponto violeta do referencial: halo suave, anel branco e o
// centro cheio. O destino é um quadrado arredondado — ouro no escuro, ameixa
// no claro. São a mesma gramática do mapa desenhado à mão.
const DOT_SVG =
  '<svg viewBox="0 0 24 24" class="w-7 h-7 drop-shadow" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".22"/>' +
  '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="white" stroke-width="2.5"/>' +
  '</svg>';

const SQUARE_SVG =
  '<svg viewBox="0 0 24 24" class="w-6 h-6 drop-shadow" aria-hidden="true">' +
  '<rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor"/>' +
  '</svg>';

// O ponto marcado por alguém para ser apanhado não é uma zona nem um destino:
// é um sítio exacto. An tracejado + centro cheio lê-se «é aqui, à porta».
const PICK_SVG =
  '<svg viewBox="0 0 24 24" class="w-9 h-9 drop-shadow" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="4.5 3.2"/>' +
  '<circle cx="12" cy="12" r="3.4" fill="currentColor"/>' +
  '</svg>';

export function carMarkerEl(opts: { assigned?: boolean } = {}): HTMLElement {
  const el = document.createElement('div');
  el.className = [
    'border-2 flex items-center justify-center shadow-card',
    opts.assigned
      ? 'w-9 h-9 rounded-[10px] bg-[#2A1254] border-[#E7CFA6] text-[#E7CFA6]'
      : 'w-8 h-8 rounded-full bg-purple-600 border-white/90 text-white',
  ].join(' ');
  el.innerHTML = CAR_SVG;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function pinMarkerEl(label: string, tone: 'from' | 'to' | 'pick', scan = false): HTMLElement {
  const el = document.createElement('div');
  // O pino tem a ponta em baixo (anchor 'bottom'): a etiqueta fica acima, para
  // não tapar o ponto exacto do encontro.
  el.className = [
    'flex flex-col items-center gap-0.5',
    tone === 'from' ? 'text-[#7C5CE6]'
      : tone === 'pick' ? 'text-amber-500 dark:text-amber-400'
      : 'text-[#2A1050] dark:text-[#E7CFA6]',
  ].join(' ');

  const chip = document.createElement('span');
  chip.className = [
    'max-w-[9rem] truncate rounded-full px-2 py-0.5 text-[12px] font-semibold shadow',
    'bg-white/95 dark:bg-zinc-900/95',
    tone === 'from'
      ? 'text-purple-700 dark:text-purple-300'
      : tone === 'pick'
        ? 'text-amber-800 dark:text-amber-300'
        : 'text-zinc-800 dark:text-zinc-100',
  ].join(' ');
  chip.textContent = label;
  el.appendChild(chip);

  const icon = document.createElement('span');
  icon.className = 'relative block';
  icon.innerHTML = tone === 'pick' ? PICK_SVG : tone === 'from' ? DOT_SVG : SQUARE_SVG;
  if (scan) {
    // Os anéis nascem na ponta do pino e abrem-se até ao tamanho do raio de
    // procura desenhado no mapa. Dois, com meio ciclo de distância: é o que faz
    // o ecrã parecer estar a ouvir, e não a esperar.
    for (const cls of ['map-scan', 'map-scan map-scan-late']) {
      const ring = document.createElement('span');
      ring.className = [
        'pointer-events-none absolute rounded-full border-2 border-purple-500/70',
        'left-1/2 top-[72%] -translate-x-1/2 -translate-y-1/2 w-24 h-24',
        cls,
      ].join(' ');
      icon.appendChild(ring);
    }
  }
  el.appendChild(icon);
  return el;
}

/** Bolha de preço da praça do motorista — é o que se toca para escolher. */
export function bubbleEl(text: string, active: boolean): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = [
    'rounded-full px-2.5 py-1 text-[12px] font-semibold shadow-card border transition-colors',
    active
      ? 'bg-purple-600 border-purple-700 text-white -translate-y-0.5'
      : 'bg-white/95 dark:bg-zinc-900/95 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white',
  ].join(' ');
  el.textContent = text;
  return el;
}

export function meMarkerEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'relative w-[18px] h-[18px]';
  const halo = document.createElement('span');
  halo.className = 'absolute -inset-3 rounded-full bg-[#7C5CE6]/30 map-pulse';
  const dot = document.createElement('span');
  dot.className = 'absolute inset-0 rounded-full bg-[#7C5CE6] border-[3px] border-white shadow';
  el.append(halo, dot);
  el.setAttribute('aria-hidden', 'true');
  return el;
}
