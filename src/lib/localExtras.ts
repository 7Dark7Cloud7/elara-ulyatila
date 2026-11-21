/**
 * Funções puras e camada local-first da Elara Ulyatila.
 *
 * Tudo o que é guardado aqui vive exclusivamente no telemóvel do utilizador
 * (localStorage) — nunca promete sincronização que o servidor ainda não tem.
 * Quando as migrações do servidor (ex.: tr_saved_place) estiverem activas,
 * a camada de leitura junta os dois lados sem duplicar zonas.
 */
import type { OpenTrip, Payment, Trip, VehicleClass, WalletTx, Zone } from '../types';
import type { SavedPlace } from './extras';
import { haversineKm } from './map';
import type { LatLon } from './geo';

const LOCAL_PLACE_EMOJIS = ['🏠', '🏫', '⛪', '🛒', '🏭', '💼', '🏥', '⛽'];

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const getStorage = (storage?: StorageLike | null): StorageLike | null => {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

// — Locais guardados no telemóvel ————————————————————————————————————————————

export const MAX_LOCAL_PLACES = 12;

export const PLACE_PRESETS: Array<{ label: string; emoji: string }> = [
  { label: 'Casa', emoji: '🏠' },
  { label: 'Trabalho', emoji: '💼' },
  { label: 'Faculdade', emoji: '🏫' },
  { label: 'Igreja', emoji: '⛪' },
  { label: 'Mercado', emoji: '🛒' },
  { label: 'Clínica', emoji: '🏥' },
];

const localPlacesKey = (uid: string) => `elara_local_places_${uid}`;

export function loadLocalPlaces(uid: string, storage?: StorageLike | null): SavedPlace[] {
  const s = getStorage(storage);
  if (!s || !uid) return [];
  try {
    const raw = s.getItem(localPlacesKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is SavedPlace => !!p && typeof p.id === 'string' && typeof p.label === 'string')
      .slice(0, MAX_LOCAL_PLACES);
  } catch {
    return [];
  }
}

export function saveLocalPlace(
  uid: string,
  input: Omit<SavedPlace, 'id'>,
  storage?: StorageLike | null,
): SavedPlace[] {
  const s = getStorage(storage);
  const existing = loadLocalPlaces(uid, s);
  const label = input.label.trim().slice(0, 40) || 'Local guardado';
  const emoji = LOCAL_PLACE_EMOJIS.includes(input.emoji) ? input.emoji : LOCAL_PLACE_EMOJIS[0];
  // Evita duplicar a mesma zona com o mesmo rótulo.
  const filtered = existing.filter(
    (p) => !(p.zone_id && input.zone_id && p.zone_id === input.zone_id && p.label.toLowerCase() === label.toLowerCase()),
  );
  const nextItem: SavedPlace = {
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label,
    emoji,
    zone_id: input.zone_id,
    lat: input.lat,
    lon: input.lon,
    note: input.note.trim().slice(0, 80),
  };
  const next = [...filtered, nextItem].slice(-MAX_LOCAL_PLACES);
  try {
    s?.setItem(localPlacesKey(uid), JSON.stringify(next));
  } catch {
    // Modo privado ou quota cheia: mantém em memória na sessão actual.
  }
  return next;
}

export function removeLocalPlace(uid: string, id: string, storage?: StorageLike | null): SavedPlace[] {
  const s = getStorage(storage);
  const next = loadLocalPlaces(uid, s).filter((p) => p.id !== id);
  try {
    s?.setItem(localPlacesKey(uid), JSON.stringify(next));
  } catch {
    // ignora falha de escrita
  }
  return next;
}

/**
 * Combina locais do servidor (quando a 0005 existe) com locais deste telemóvel.
 * Os do servidor têm precedência se apontarem para a mesma zona + rótulo.
 */
export function mergeSavedPlaces(remote: SavedPlace[], local: SavedPlace[]): SavedPlace[] {
  const seen = new Set(remote.map((p) => `${p.zone_id ?? ''}|${p.label.trim().toLowerCase()}`));
  const merged = [...remote];
  for (const p of local) {
    const key = `${p.zone_id ?? ''}|${p.label.trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(p);
    }
  }
  return merged.slice(0, MAX_LOCAL_PLACES);
}

// — Contactos de confiança (SOS e partilha rápida) ———————————————————————————

export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
  relation: string;
}

export const MAX_TRUSTED_CONTACTS = 5;
const TRUSTED_KEY = 'elara_trusted_contacts_v1';

/** Limpa espaços e pontuação; normaliza números locais de 9 dígitos para 244… */
export function normalizeAngolaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('9')) return `244${digits}`;
  return digits;
}

export function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('244')) {
    return `+244 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  }
  return phone;
}

export function validateTrustedContact(input: { name: string; phone: string; relation?: string }): string | null {
  const name = input.name.trim();
  if (name.length < 2) return 'Escreva o nome do contacto (mínimo 2 letras).';
  const digits = normalizeAngolaPhone(input.phone);
  if (digits.length < 9 || digits.length > 15) return 'Escreva um número de telefone válido (ex.: 923 000 000).';
  return null;
}

export function loadTrustedContacts(storage?: StorageLike | null): TrustedContact[] {
  const s = getStorage(storage);
  if (!s) return [];
  try {
    const raw = s.getItem(TRUSTED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is TrustedContact => !!c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.phone === 'string')
      .slice(0, MAX_TRUSTED_CONTACTS);
  } catch {
    return [];
  }
}

export function addTrustedContact(
  input: { name: string; phone: string; relation?: string },
  storage?: StorageLike | null,
): { ok: true; contacts: TrustedContact[] } | { ok: false; error: string } {
  const err = validateTrustedContact(input);
  if (err) return { ok: false, error: err };
  const s = getStorage(storage);
  const existing = loadTrustedContacts(s);
  if (existing.length >= MAX_TRUSTED_CONTACTS) {
    return { ok: false, error: `Pode guardar até ${MAX_TRUSTED_CONTACTS} contactos de confiança.` };
  }
  const phone = normalizeAngolaPhone(input.phone);
  if (existing.some((c) => normalizeAngolaPhone(c.phone) === phone)) {
    return { ok: false, error: 'Esse número já está nos seus contactos de confiança.' };
  }
  const next: TrustedContact[] = [
    ...existing,
    {
      id: `tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name: input.name.trim().slice(0, 40),
      phone,
      relation: (input.relation ?? '').trim().slice(0, 24) || 'Família',
    },
  ];
  try {
    s?.setItem(TRUSTED_KEY, JSON.stringify(next));
  } catch {
    // modo privado
  }
  return { ok: true, contacts: next };
}

export function removeTrustedContact(id: string, storage?: StorageLike | null): TrustedContact[] {
  const s = getStorage(storage);
  const next = loadTrustedContacts(s).filter((c) => c.id !== id);
  try {
    s?.setItem(TRUSTED_KEY, JSON.stringify(next));
  } catch {
    // modo privado
  }
  return next;
}

/**
 * Mensagem de segurança para um contacto de confiança.
 * REGRA DE INTEGRIDADE: nunca inclui código PIN de embarque ou entrega.
 */
export function trustedShareMessage(opts: {
  contactName: string;
  trip?: Pick<Trip, 'code' | 'driver_name' | 'car_model' | 'plate' | 'price_kz'> | null;
  fromName?: string | null;
  toName?: string | null;
  emergency?: boolean;
}): string {
  const greeting = `Olá ${opts.contactName},`;
  if (opts.emergency) {
    const tripPart = opts.trip
      ? ` Viagem Elara Ulyatila ${opts.trip.code}${opts.fromName && opts.toName ? ` (${opts.fromName} → ${opts.toName})` : ''}${opts.trip.plate ? ` · Matrícula ${opts.trip.plate}` : ''}.`
      : '';
    return `${greeting} preciso de ajuda agora.${tripPart} Estou a contactar os meus contactos de confiança pela Elara Ulyatila.`;
  }
  if (!opts.trip) {
    return `${greeting} estou a usar a Elara Ulyatila. Partilho este contacto caso precise de acompanhar o meu trajecto.`;
  }
  const parts = [
    `${greeting} estou numa viagem Elara Ulyatila (${opts.trip.code}).`,
    opts.fromName && opts.toName ? `Trajecto: ${opts.fromName} → ${opts.toName}.` : null,
    opts.trip.driver_name
      ? `Motorista: ${opts.trip.driver_name}${opts.trip.car_model ? ` · ${opts.trip.car_model}` : ''}${opts.trip.plate ? ` (${opts.trip.plate})` : ''}.`
      : null,
  ].filter(Boolean);
  return parts.join(' ');
}

// — Repetir viagem num toque —————————————————————————————————————————————————

export type RepeatService = 'carro' | 'moto' | 'partilha' | 'entrega' | 'mudanca';

export interface RepeatTripSeed {
  token: string;
  service: RepeatService;
  fromZoneId: string;
  toZoneId: string;
  classId: string;
  payment: Payment;
  seats: number;
  parcelSize?: string;
}

const CARGO_CLASS_IDS = new Set(['picape', 'canter', 'camiao', 'carga']);

export function buildRepeatSeed(trip: Trip, classes: VehicleClass[]): RepeatTripSeed {
  const cls = classes.find((c) => c.id === trip.class_id);
  let service: RepeatService = 'carro';
  if (trip.kind === 'entrega') {
    const isCargo = cls?.lane === 'carga' || CARGO_CLASS_IDS.has(trip.class_id);
    service = isCargo ? 'mudanca' : 'entrega';
  } else if (trip.class_id === 'moto') {
    service = 'moto';
  } else if (trip.seats > 1 && !cls?.per_seat) {
    service = 'partilha';
  }

  return {
    token: `${trip.id}-${Date.now()}`,
    service,
    fromZoneId: trip.from_zone_id,
    toZoneId: trip.to_zone_id,
    classId: trip.class_id,
    payment: trip.payment,
    seats: Math.max(1, trip.seats || 1),
    parcelSize: trip.parcel?.size,
  };
}

// — Filtros e resumos puros (Viagens, Carteira, Praça do Motorista) ——————————

export type TripStatusFilter = 'all' | 'done' | 'cancelled';
export type TripKindFilter = 'all' | 'passageiro' | 'entrega';

export function filterTrips(
  trips: Trip[],
  opts: {
    status: TripStatusFilter;
    kind: TripKindFilter;
    query: string;
    zoneName: (id: string) => string;
  },
): Trip[] {
  const q = opts.query.trim().toLowerCase();
  return trips.filter((t) => {
    if (opts.status === 'cancelled' && t.state !== 'cancelled') return false;
    if (opts.status === 'done' && t.state !== 'ended' && t.state !== 'rated') return false;
    if (opts.kind !== 'all' && t.kind !== opts.kind) return false;
    if (!q) return true;
    const from = opts.zoneName(t.from_zone_id).toLowerCase();
    const to = opts.zoneName(t.to_zone_id).toLowerCase();
    const code = t.code.toLowerCase();
    const driver = (t.driver_name ?? '').toLowerCase();
    return from.includes(q) || to.includes(q) || code.includes(q) || driver.includes(q);
  });
}

export type WalletDirectionFilter = 'all' | 'in' | 'out';

export function filterWalletTxs(
  txs: WalletTx[],
  opts: { direction: WalletDirectionFilter; query: string },
): WalletTx[] {
  const q = opts.query.trim().toLowerCase();
  return txs.filter((tx) => {
    if (opts.direction === 'in' && tx.amount_kz < 0) return false;
    if (opts.direction === 'out' && tx.amount_kz >= 0) return false;
    if (!q) return true;
    const note = (tx.note || '').toLowerCase();
    const trip = (tx.trip_id || '').toLowerCase();
    return note.includes(q) || trip.includes(q) || tx.kind.toLowerCase().includes(q);
  });
}

export function summarizeWalletMonth(txs: WalletTx[], now = new Date()): {
  inKz: number;
  outKz: number;
  count: number;
} {
  let inKz = 0;
  let outKz = 0;
  let count = 0;
  for (const tx of txs) {
    const d = new Date(tx.at);
    if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
    count += 1;
    if (tx.amount_kz >= 0) inKz += tx.amount_kz;
    else outKz += Math.abs(tx.amount_kz);
  }
  return { inKz, outKz, count };
}

export type DriverFeedFilter = 'all' | 'cash' | 'multicaixa' | 'nearest';

export function filterOpenDriverFeed(
  feed: OpenTrip[],
  opts: {
    filter: DriverFeedFilter;
    selectedId: string | null;
    myPos: LatLon | null;
    zoneOf: (id: string) => Zone | null;
  },
): OpenTrip[] {
  let list = feed.filter((t) => {
    if (opts.filter === 'cash') return t.payment === 'cash';
    if (opts.filter === 'multicaixa') return t.payment === 'multicaixa';
    return true;
  });

  if (opts.filter === 'nearest' && opts.myPos) {
    const pos = opts.myPos;
    list = [...list].sort((a, b) => {
      const za = opts.zoneOf(a.from_zone_id);
      const zb = opts.zoneOf(b.from_zone_id);
      const da = za ? haversineKm(pos.lat, pos.lon, za.lat, za.lon) : Number.POSITIVE_INFINITY;
      const db = zb ? haversineKm(pos.lat, pos.lon, zb.lat, zb.lon) : Number.POSITIVE_INFINITY;
      return da - db;
    });
  }

  if (opts.selectedId) {
    const picked = list.find((t) => t.id === opts.selectedId);
    if (picked) list = [picked, ...list.filter((t) => t.id !== opts.selectedId)];
  }
  return list;
}

// — Simulador interactivo (DemoStudio) ———————————————————————————————————————

export interface DemoRentalOption {
  id: string;
  title: string;
  vehicleKind: 'sedan' | 'suv' | 'minibus' | 'pickup';
  priceDayKz: number;
  withDriverFeeKz: number;
  depositKz: number;
  seats: number;
  blurb: string;
}

export const DEMO_RENTALS: DemoRentalOption[] = [
  {
    id: 'rent-sedan',
    title: 'Toyota Corolla Executivo',
    vehicleKind: 'sedan',
    priceDayKz: 35000,
    withDriverFeeKz: 12000,
    depositKz: 50000,
    seats: 4,
    blurb: 'Ar condicionado · ideal para reuniões em Luanda e Talatona.',
  },
  {
    id: 'rent-suv',
    title: 'Toyota Fortuner 4×4',
    vehicleKind: 'suv',
    priceDayKz: 75000,
    withDriverFeeKz: 18000,
    depositKz: 100000,
    seats: 7,
    blurb: '7 lugares · viagens de família ou deslocações para fora da cidade.',
  },
  {
    id: 'rent-van',
    title: 'Toyota Hiace 14 Lugares',
    vehicleKind: 'minibus',
    priceDayKz: 85000,
    withDriverFeeKz: 20000,
    depositKz: 100000,
    seats: 14,
    blurb: 'Eventos, equipas e transferes de aeroporto.',
  },
];

export const DEMO_QUICK_REPLIES = [
  { id: 'here', label: 'Estou junto à paragem', text: 'Estou aqui, junto à paragem principal.' },
  { id: 'cash', label: 'Tenho nota de 5.000 Kz', text: 'Vou pagar com nota de 5.000 Kz, consegue troco?' },
  { id: 'wait', label: 'Desço em 1 minuto', text: 'Já estou a sair do portão, chego em 1 minuto.' },
] as const;

export type DemoReplyId = (typeof DEMO_QUICK_REPLIES)[number]['id'];

export function demoDriverReply(id: DemoReplyId, car: string, plate: string): string {
  if (id === 'here') return `Perfeito, já o avistei. Sou o ${car} (${plate}) com piscas ligados.`;
  if (id === 'cash') return 'Tranquilo, tenho troco comigo no carro.';
  return 'Sem problema, aguardo aqui com calma até descer.';
}

export function verifyDemoPin(input: string, expected: string): boolean {
  return input.replace(/\D/g, '') === expected;
}

/** Progresso visual (0..100) para a pista SVG animada do simulador. */
export function demoStepProgress(step: number): number {
  const map = [8, 28, 46, 54, 82, 100];
  return map[Math.max(0, Math.min(step, map.length - 1))];
}

// — Pesquisa e filtros puros (Ajuda, Aluguer, Zonas, Autenticação) ———————————

/** Normaliza texto para pesquisa sem acentos nem maiúsculas. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Filtra itens da Ajuda por todas as palavras escritas (título ou resposta). */
export function filterHelpItems<T extends { q: string; a: string[] }>(items: T[], query: string): T[] {
  const q = normalizeSearch(query);
  if (!q) return items;
  const terms = q.split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const haystack = normalizeSearch(`${item.q} ${item.a.join(' ')}`);
    return terms.every((term) => haystack.includes(term));
  });
}

export type RentalFilterMode = 'all' | 'driver' | 'self';

export interface FilterableRental {
  title: string;
  blurb?: string | null;
  with_driver: boolean;
  allows_self_drive: boolean;
  zone_id?: string | null;
  tr_driver?: { public_name?: string | null; model?: string | null } | null;
}

/** Filtra carros de aluguer por modalidade (com motorista / self-drive) e texto. */
export function filterRentals<T extends FilterableRental>(
  rentals: T[],
  opts: {
    mode: RentalFilterMode;
    query: string;
    zoneName?: (id?: string | null) => string;
  },
): T[] {
  const q = normalizeSearch(opts.query);
  return rentals.filter((r) => {
    if (opts.mode === 'driver' && !r.with_driver) return false;
    if (opts.mode === 'self' && !r.allows_self_drive) return false;
    if (!q) return true;
    const zone = opts.zoneName ? opts.zoneName(r.zone_id) : '';
    const hay = normalizeSearch(
      `${r.title} ${r.blurb ?? ''} ${r.tr_driver?.public_name ?? ''} ${r.tr_driver?.model ?? ''} ${zone}`,
    );
    return hay.includes(q);
  });
}

const POPULAR_ZONE_HINTS = [
  'talatona',
  'mutamba',
  'aeroporto',
  'kilamba',
  'maianga',
  'ingombota',
  'benfica',
  'viana',
];

/**
 * Escolhe até `limit` zonas frequentes que realmente existem na lista carregada.
 * Nunca inventa zonas que não estejam na base de dados.
 */
export function pickPopularZones(zones: Zone[], limit = 6): Zone[] {
  if (!zones.length || limit <= 0) return [];
  const picked: Zone[] = [];
  const seen = new Set<string>();

  for (const hint of POPULAR_ZONE_HINTS) {
    if (picked.length >= limit) break;
    const match = zones.find((z) => !seen.has(z.id) && normalizeSearch(z.name).includes(hint));
    if (match) {
      seen.add(match.id);
      picked.push(match);
    }
  }

  for (const z of zones) {
    if (picked.length >= limit) break;
    if (!seen.has(z.id)) {
      seen.add(z.id);
      picked.push(z);
    }
  }
  return picked;
}

/** Validação simples de endereço de email no cliente antes de chamar o Supabase. */
export function isValidEmail(email: string): boolean {
  const v = email.trim();
  if (v.length < 5 || v.length > 254 || /\s/.test(v)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

