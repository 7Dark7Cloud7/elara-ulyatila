import { useCallback, useEffect, useState } from 'react';
import { haversineKm } from './map';
import type { Zone } from '../types';

/**
 * Índice de nomes de lugares: os bairros e marcos de Luanda, e as vilas das
 * províncias onde há paragens. Vem do OpenStreetMap em bloco — o Overpass
 * devolve todos os lugares nomeados da região, com o identificador OSM de cada
 * um (`.pkg/fetch_wide.sh` → `.pkg/wide_cache.cjs` → `.pkg/build_places.cjs`) —
 * e viaja dentro da app. Por isso a pessoa escreve «Fubu» e aparece «Fubu ·
 * Município do Talatona» sem enviar a posição dela a um terceiro: a pergunta
 * nunca sai do aparelho.
 *
 * É o maior ficheiro da app, por isso chega a seguir ao primeiro ecrã e não
 * antes: `ensurePlaces()` busca-o em segundo plano, logo que a tela está
 * desenhada. Enquanto não chega, a zona (que vem do servidor) é a única palavra
 * que se pode dar; o bairro fino e a procura juntam-se-lhe quando o índice
 * aterrar, e quem está a escrever vê a lista encher-se sem recarregar nada.
 *
 * O bloco não traz só `place`: traz também os marcos que a pessoa usa para se
 * explicar («o Sonangol», «a Farmácia Kinaxixi», «o largo da Corimba», «a
 * igreja», «o mercado», «a escola») e as 70 avenidas e estradas de passagem que
 * dão nome a um sítio. Ficaram de fora os bancos e as ATMs — e os nomes que são
 * apenas a categoria, «Farmácia», «Cantina» — porque não desambiguam um
 * encontro: há trinta deles na cidade.
 *
 * Uma coisa não mudou com o índice maior: **o que o OSM não conhece não entra**.
 * Os poucos nomes que a equipa acrescentou vêm de `.pkg/places_team.json`, cada
 * um com a prova de onde saiu, e marcam-se no ecrã como ditos pela equipa —
 * nunca disfarçados de dados do mapa. Faltou um nome? A pessoa diz, e o pedido
 * entra na mesma fila que a equipa já lê (`reportMissingPlace`).
 *
 * O índice também não muda o preço: a viagem continua a nascer entre duas
 * `tr_zone`, porque é a zona que o servidor usa para calcular. O lugar fino é o
 * **ponto no mapa e o nome que o motorista lê**, não uma nova moeda de preço.
 */

export interface Place {
  name: string;
  kind: string;
  lat: number;
  lon: number;
  parent: string;
  zoneId: string;
  zoneName: string;
  zoneKm: number;
  /** 'equipa' = nome dito por alguém da Elara, com prova; não é do mapa. */
  via?: string;
}

/** O OSM dá-nos tipos crús; aqui ganham uma palavra que a pessoa entende. */
const KIND_LABEL: Record<string, string> = {
  suburb: 'bairro', neighbourhood: 'bairro', quarter: 'bairro', district: 'distrito', residential: 'bairro',
  reported: 'lugar', locality: 'lugar',
  village: 'povoação', hamlet: 'povoação', town: 'vila', city: 'cidade', county: 'município',
  primary: 'avenida', trunk: 'estrada', secondary: 'rua', road: 'rua',
  retail: 'centro comercial', shop: 'loja', construction: 'obra',
  leisure: 'equipamento', tourism: 'marco', amenity: 'equipamento',
  office: 'instituição', military: 'marco', harbour: 'porto', bay: 'baía', island: 'ilha',
  islet: 'ilhéu',
  square: 'largo', mall: 'centro comercial', supermarket: 'supermercado',
  convenience: 'loja',
  hospital: 'hospital', clinic: 'clínica', pharmacy: 'farmácia',
  school: 'escola', college: 'faculdade', university: 'universidade',
  kindergarten: 'creche', place_of_worship: 'igreja', marketplace: 'mercado',
  fuel: 'posto de combustível', police: 'esquadra', fire_station: 'bombeiros',
  post_office: 'correios', townhall: 'administração', community_centre: 'centro comunitário',
  hotel: 'hotel', park: 'parque', stadium: 'estádio', sports_centre: 'complexo desportivo',
  museum: 'museu', attraction: 'marco', viewpoint: 'miradouro', city_block: 'quarteirão',
  isolated_dwelling: 'povoação', farm: 'quinta',
};

export const placeKindLabel = (kind: string): string => KIND_LABEL[kind] ?? 'lugar';

/**
 * O que é *um bairro* e o que é *um ponto dentro de um bairro*. Um posto de
 * combustível a 80 m não pode ganhar o nome à pessoa: o que ela diz ao
 * motorista é «estou no Fubu», e o posto é a referência fina.
 */
const RANK: Record<string, number> = {
  suburb: 3, neighbourhood: 3, quarter: 3, residential: 3, reported: 3,
  village: 2, hamlet: 2, town: 2, city: 2, district: 2, county: 2,
};
const rankOf = (kind: string): number => RANK[kind] ?? 1;
const isBairro = (p: Place): boolean => rankOf(p.kind) >= 2;

/** «São Paulo» e «sao paulo» são a mesma busca. */
const fold = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

type RawPlace = {
  name: string; kind: string; lat: number; lon: number; parent?: string; via?: string;
};

/**
 * O índice chega vazio e enche-se com `ensurePlaces()`. Não é uma avaria nem
 * uma poupança de ecrã: é o preço de deixar a tela desenhar-se antes de um
 * milhar e meio de nomes.
 */
let OSM: RawPlace[] = [];
let DOC_DATE = '';
let cache: { key: Zone[]; places: Place[]; folds: string[][] } | null = null;
const landed = new Set<() => void>();
let fetching: Promise<void> | null = null;
/** O bloco de nomes é grande; se a rede o deixar pelo caminho, dizemos isso
 *  em vez de deixar a pesquisa «A carregar…» para sempre. */
let loadFailed = false;

/** A data em que os nomes foram conferidos no OSM; vazia até o índice chegar. */
export const dataDate = (): string => DOC_DATE;

/** Verdade quando a última tentativa de trazer os nomes falhou. */
export const placesFailed = (): boolean => loadFailed;

const placesReady = (): boolean => OSM.length > 0;

/**
 * Busca o índice uma única vez e avisa quem está a olhar quando ele chega.
 * Uma falha de rede não fica gravada como resposta: a próxima tentativa volta
 * a bater à porta.
 */
export function ensurePlaces(): Promise<void> {
  if (placesReady()) return Promise.resolve();
  if (!fetching) {
    fetching = import('../data/luanda-places.json').then((m) => {
      const doc = m.default as unknown as { places?: RawPlace[]; fetched_at?: string };
      OSM = doc.places ?? [];
      DOC_DATE = doc.fetched_at ?? '';
      cache = null;
      loadFailed = false;
      fetching = null;
      landed.forEach((cb) => cb());
    }, () => {
      fetching = null;
      loadFailed = true;
      landed.forEach((cb) => cb());
    });
  }
  return fetching;
}

/** Estado do índice para a interface: chegou, falhou, e tentar de novo. */
export function usePlacesState(): { ready: boolean; failed: boolean; retry: () => void } {
  const [state, setState] = useState(() => ({ ready: placesReady(), failed: placesFailed() }));
  useEffect(() => {
    const cb = () => setState({ ready: placesReady(), failed: placesFailed() });
    landed.add(cb);
    void ensurePlaces();
    return () => { landed.delete(cb); };
  }, []);
  const retry = useCallback(() => {
    setState((s) => ({ ...s, failed: false }));
    void ensurePlaces();
  }, []);
  return { ...state, retry };
}

/** Verdade quando o índice está no aparelho; faz o componente renderizar de novo. */
export function usePlacesReady(): boolean {
  return usePlacesState().ready;
}

/**
 * Um lugar a 30 km da paragem mais próxima não é uma paragem possível: está
 * fora do que a app cobra. A porta é medida às `tr_zone` que o servidor dá, por
 * isso adicionar uma zona no Uíge faz as povoações à volta aparecerem sozinhas
 * — sem reconstruir o índice.
 */
const ZONE_MAX_KM = 30;

/** Junta cada lugar à zona de preço mais próxima. Uma só vez por zonas. */
function indexed(zones: Zone[]): { places: Place[]; folds: string[][] } {
  if (cache && cache.key === zones) return cache;
  // Quem pergunta primeiro é quem chama pelo ficheiro: assim o índice chega
  // também quando a app entrou por outra porta que não a da pessoa.
  if (!OSM.length) void ensurePlaces();
  const seen = new Set<string>();
  const places: Place[] = [];
  const folds: string[][] = [];
  for (const p of OSM) {
    if (!p.name || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const fn = fold(p.name);
    const id = `${fn}|${p.kind}|${p.lat.toFixed(3)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    let best: Zone | null = null;
    let bestKm = Infinity;
    for (const z of zones) {
      const km = haversineKm(p.lat, p.lon, z.lat, z.lon);
      if (km < bestKm) { bestKm = km; best = z; }
    }
    if (!best || bestKm > ZONE_MAX_KM) continue;
    places.push({
      name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, parent: p.parent ?? '',
      zoneId: best.id, zoneName: best.name, zoneKm: Math.round(bestKm * 10) / 10,
      ...(p.via ? { via: p.via } : {}),
    });
    // O índice passou de duzentos para milhares de nomes e a procura corre a
    // cada tecla: cada nome é normalizado aqui, uma vez, e nunca mais.
    folds.push([fn, fold(p.parent ?? ''), fold(best.name)]);
  }
  cache = { key: zones, places, folds };
  return cache;
}

export function placesFor(zones: Zone[]): Place[] {
  return indexed(zones).places;
}

const tokenScore = (hay: string, t: string): number => {
  if (hay.startsWith(t) || hay.includes(` ${t}`)) return 3;
  if (hay.includes(t)) return 2;
  // Uma tecla a mais num telemóvel não pode esconder um bairro inteiro: «dangeres»
  // (escrito como se lê) tem de chegar ao «Dangereux» do mapa, e «bairros» ao
  // «bairro». Só com seis letras ou mais, para não adivinhar em nomes curtos.
  const stem = t.length >= 6 ? t.slice(0, -1) : '';
  return stem && (hay.startsWith(stem) || hay.includes(` ${stem}`)) ? 2 : 0;
};

/**
 * Todos os tokens da pergunta têm de aparecer — em qualquer ordem e em
 * qualquer parte do nome, do município ou da zona. É isso que faz
 * «mbondo chapéu», «chapéu mbondo» e «mbondo chapéu talatona» chegarem ao
 * mesmo sítio, que é como a pessoa realmente escreve.
 */
function matchScore(f: string[], ts: string[]): number {
  let s = 0;
  for (const t of ts) {
    const inName = tokenScore(f[0], t);
    const best = Math.max(inName, tokenScore(f[1], t), tokenScore(f[2], t));
    if (!best) return 0;
    s += inName ? inName + 1 : 1;
  }
  return s;
}

/** Procura por bairro, ponto de referência, avenida ou município. */
export function searchPlaces(q: string, zones: Zone[]): Place[] {
  const ts = fold(q).split(' ').filter((t) => t.length >= 2);
  if (!ts.length) return [];
  const { places, folds } = indexed(zones);
  const hits: { p: Place; s: number }[] = [];
  for (let i = 0; i < places.length; i++) {
    const s = matchScore(folds[i], ts);
    if (s) hits.push({ p: places[i], s });
  }
  return hits
    // Um nome que também é bairro vale mais que uma loja com o mesmo nome;
    // entre bairros, ganha o que está mais perto da paragem que dá o preço.
    .sort((a, b) => b.s - a.s || rankOf(b.p.kind) - rankOf(a.p.kind)
      || a.p.zoneKm - b.p.zoneKm || a.p.name.localeCompare(b.p.name, 'pt'))
    .slice(0, 20)
    .map((x) => x.p);
}

export interface WhereName {
  /** O ponto fino perto do pin (loja, avenida, mercado) — ou `null`. */
  place: string | null;
  /** O bairro, mesmo quando o pin caiu no meio dele a 900 m. */
  bairro: string | null;
  /** Metros até ao bairro: pode ser maior que o limite do ponto fino. */
  bairroMetres: number;
  /** O que aparece no ecrã: «Belas Shopping». */
  zone: string | null;
  /** Distância do ponto marcado ao nome mais próximo, em metros. */
  metres: number;
  /** A zona de preço a que este ponto pertence — o que a viagem usa. */
  zoneId: string | null;
  /** Nome dito pela equipa, não pelo mapa. Manda-se para o ecrã com esta palavra. */
  via: string | null;
}

/** Um ponto fino conta até 700 m; um bairro conta até 2 km. */
const POINT_M = 700;
const BAIRRO_M = 2000;

const nearest = (lat: number, lon: number, list: Place[]): { p: Place; km: number } | null => {
  let best: Place | null = null;
  let km = Infinity;
  for (const p of list) {
    const d = haversineKm(lat, lon, p.lat, p.lon);
    // À mesma distância, ganha o que é bairro: com o índice largo há marcos (a
    // igreja, o mercado) na coordenada exacta de um bairro, e o que a pessoa diz
    // ao motorista é «estou no Mbondo Chapéu» — o marco fica na segunda palavra.
    if (d < km || (d === km && best && rankOf(p.kind) > rankOf(best.kind))) { km = d; best = p; }
  }
  return best ? { p: best, km } : null;
};

/**
 * Dar nome a uma coordenada. Um lugar fino conta até 700 m; para lá disso
 * damos o bairro e dizemos o quão longe é, porque um nome colado a 3 km é uma
 * adivinhação — e uma adivinhação num encontro é como a pessoa se perde.
 */
export function nameAt(lat: number, lon: number, zones: Zone[]): WhereName {
  const places = placesFor(zones);
  const fine = nearest(lat, lon, places);
  const bairros = nearest(lat, lon, places.filter(isBairro));
  let zone: Zone | null = null;
  let zoneKm = Infinity;
  for (const z of zones) {
    const km = haversineKm(lat, lon, z.lat, z.lon);
    if (km < zoneKm) { zoneKm = km; zone = z; }
  }
  const near = fine && fine.km * 1000 <= POINT_M ? fine.p : null;
  const bairro = bairros && bairros.km * 1000 <= BAIRRO_M ? bairros.p : null;
  return {
    place: near ? near.name : null,
    bairro: bairro ? bairro.name : null,
    bairroMetres: Math.round((bairros ? bairros.km : 0) * 1000),
    zone: zone ? zone.name : null,
    metres: Math.round((near ? fine!.km : zoneKm) * 1000),
    zoneId: zone ? zone.id : null,
    via: near?.via ?? bairro?.via ?? null,
  };
}
