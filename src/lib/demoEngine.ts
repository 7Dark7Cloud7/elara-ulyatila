import type {
  ChatMessage,
  DeliveryClass,
  Driver,
  MoneyRequest,
  OpenTrip,
  Payment,
  Pickup,
  Quote,
  Rental,
  RentalPlan,
  RentalQuote,
  RentalRequest,
  SessionUser,
  Trip,
  TripKind,
  TripState,
  VehicleClass,
  Zone,
} from '../types';
import type { NearbyCar } from './geo';
import { haversineKm } from './map';
import { driveMinutes } from './trips';

/**
 * Motor completo do Modo Demonstração dentro da própria app Elara Ulyatila.
 *
 * Em vez de abrir uma janela ou aba separada, o modo demonstração liga todas as
 * funções reais da app (conta autenticada, motorista aprovado com viatura,
 * zonas de Luanda, frota completa, cálculo de preço, corrida activa com mapa,
 * chat, PIN, recibo, histórico, carteira com saldo e aluguer) usando estado
 * guardado apenas no telemóvel, sem tocar no Supabase nem em dinheiro real.
 */

const DEMO_STORE_KEY = 'trajectoria_demo_state_v1';

export const DEMO_USER: SessionUser = {
  uid: 'demo-elara-user',
  name: 'Mateus Kianda (Demo)',
  email: 'mateus.demo@elara.ao',
  isAdmin: false,
};

export const DEMO_ZONES: Zone[] = [
  { id: 'd-talatona', name: 'Talatona', city: 'Luanda', province: 'Luanda', lat: -8.9243, lon: 13.1842, kind: 'bairro' },
  { id: 'd-praca', name: 'Praça da Independência', city: 'Luanda', province: 'Luanda', lat: -8.8121, lon: 13.2350, kind: 'paragem' },
  { id: 'd-ilha', name: 'Ilha de Luanda', city: 'Luanda', province: 'Luanda', lat: -8.7864, lon: 13.2186, kind: 'zona' },
  { id: 'd-mutamba', name: 'Mutamba', city: 'Luanda', province: 'Luanda', lat: -8.8147, lon: 13.2302, kind: 'terminal' },
  { id: 'd-ai', name: 'Aeroporto 4 de Fevereiro', city: 'Luanda', province: 'Luanda', lat: -8.8583, lon: 13.2312, kind: 'aeroporto' },
  { id: 'd-maianga', name: 'Maianga', city: 'Luanda', province: 'Luanda', lat: -8.8318, lon: 13.2325, kind: 'bairro' },
  { id: 'd-novavida', name: 'Nova Vida', city: 'Luanda', province: 'Luanda', lat: -8.9125, lon: 13.2255, kind: 'bairro' },
  { id: 'd-kilamba', name: 'Centralidade do Kilamba', city: 'Luanda', province: 'Luanda', lat: -9.0008, lon: 13.2688, kind: 'bairro' },
  { id: 'd-benfica', name: 'Benfica', city: 'Luanda', province: 'Luanda', lat: -8.9675, lon: 13.1538, kind: 'bairro' },
  { id: 'd-viana', name: 'Viana', city: 'Luanda', province: 'Luanda', lat: -8.9036, lon: 13.3742, kind: 'zona' },
  { id: 'd-cacuaco', name: 'Cacuaco', city: 'Luanda', province: 'Luanda', lat: -8.7779, lon: 13.3666, kind: 'zona' },
  { id: 'd-morrobento', name: 'Morro Bento', city: 'Luanda', province: 'Luanda', lat: -8.8981, lon: 13.1945, kind: 'bairro' },
];

export const DEMO_CLASSES: VehicleClass[] = [
  { id: 'economico', label: 'Económico', seats: 4, base_kz: 400, per_km_kz: 420, min_kz: 1000, per_seat: false, blurb: 'Carro confortável do dia-a-dia com ar condicionado.', icon: 'Car', sort: 1, lane: 'passageiro' },
  { id: 'conforto', label: 'Conforto', seats: 4, base_kz: 650, per_km_kz: 580, min_kz: 1600, per_seat: false, blurb: 'Sedan executivo espaçoso e silencioso.', icon: 'Armchair', sort: 2, lane: 'passageiro' },
  { id: 'xl', label: 'SUV · 7 lugares', seats: 7, base_kz: 900, per_km_kz: 720, min_kz: 2400, per_seat: false, blurb: 'Ideal para família, aeroporto e malas grandes.', icon: 'Users', sort: 3, lane: 'passageiro' },
  { id: 'moto', label: 'Moto', seats: 1, base_kz: 250, per_km_kz: 280, min_kz: 600, per_seat: false, blurb: 'Moto com capacete extra — a mais rápida no trânsito.', icon: 'Bike', sort: 4, lane: 'passageiro' },
  { id: 'hiace', label: 'Hiace', seats: 14, base_kz: 500, per_km_kz: 180, min_kz: 500, per_seat: true, blurb: 'Compra por lugar em carrinha de grupo.', icon: 'Van', sort: 5, lane: 'passageiro' },
  { id: 'picape', label: 'Picape', seats: 2, base_kz: 1500, per_km_kz: 750, min_kz: 3500, per_seat: false, blurb: 'Caixa aberta para móveis médios e electrodomésticos.', icon: 'Truck', sort: 6, lane: 'carga' },
  { id: 'canter', label: 'Canter', seats: 2, base_kz: 2800, per_km_kz: 1050, min_kz: 6500, per_seat: false, blurb: 'Carrinha de mudança de casa ou escritório.', icon: 'Truck', sort: 7, lane: 'carga' },
];

export const DEMO_DELIVERY_CLASSES: DeliveryClass[] = [
  { id: 'documento', label: 'Documento', example: 'Envelope, chaves, contrato', base_kz: 400, per_km_kz: 250, min_kz: 800, class_id: 'moto', blurb: 'Estafeta em moto com entrega directa.' },
  { id: 'pequeno', label: 'Pequeno', example: 'Saco de loja, telemóvel, refeição', base_kz: 550, per_km_kz: 300, min_kz: 1000, class_id: 'moto', blurb: 'Cabe na mochila térmica ou baú da moto.' },
  { id: 'caixa', label: 'Caixa', example: 'Caixa de compras ou material de escritório', base_kz: 800, per_km_kz: 420, min_kz: 1600, class_id: 'economico', blurb: 'Viaja segura na bagageira de carro fechado.' },
  { id: 'volume', label: 'Volume grande', example: '2–4 caixas, televisor, bicicleta', base_kz: 1200, per_km_kz: 560, min_kz: 2500, class_id: 'xl', blurb: 'SUV ou carrinha fechada com espaço amplo.' },
  { id: 'moveis', label: 'Móveis', example: 'Sofá, frigorífico, máquina de lavar', base_kz: 1800, per_km_kz: 760, min_kz: 4000, class_id: 'picape', blurb: 'Picape dedicada para electrodomésticos e mobília.' },
  { id: 'canter', label: 'Mudança (Canter)', example: 'Apartamento T1/T2 ou carga comercial', base_kz: 3000, per_km_kz: 1050, min_kz: 7000, class_id: 'canter', blurb: 'Canter fechada para mudanças completas em Luanda.' },
];

export interface DemoWalletState {
  balanceKz: number;
  txs: Array<{
    id: string;
    who: string;
    kind: 'earning' | 'commission' | 'topup' | 'payout' | 'fee' | 'refund';
    amount_kz: number;
    balance_after_kz: number;
    trip_id?: string | null;
    note: string;
    at: number;
  }>;
  requests: MoneyRequest[];
}

export interface DemoState {
  driver: Driver;
  trips: Trip[];
  pins: Record<string, { pin: string; dropPin?: string | null }>;
  chats: Record<string, ChatMessage[]>;
  wallet: DemoWalletState;
  rentals: Rental[];
  rentalRequests: RentalRequest[];
  openDriverTrips: OpenTrip[];
  driverActiveTrip: Trip | null;
  driverToday: { trips: number; kz: number };
}

const DEFAULT_DEMO_DRIVER_INFO = {
  id: 'demo-drv-joao',
  name: 'João Manuel',
  plate: 'LD-24-71-AA',
  model: 'Toyota Corolla Prata',
  rating: 4.9,
  trips: 1284,
};

export function createInitialDemoState(now = Date.now()): DemoState {
  const hour = 3_600_000;
  const day = 86_400_000;

  const driver: Driver = {
    id: 'demo-my-driver',
    account_id: DEMO_USER.uid,
    name: 'Mateus Kianda',
    public_name: 'Mateus Kianda',
    plate: 'LD-48-19-BA',
    model: 'Toyota Corolla 2021',
    year: 2021,
    class_id: 'economico',
    province: 'Luanda',
    home_zone_id: 'd-talatona',
    status: 'approved',
    approved_at: now - 30 * day,
    rating: 4.9,
    rating_count: 142,
    trips: 186,
    trial_trips_left: 0,
    online: true,
    created_at: now - 45 * day,
  };

  const trips: Trip[] = [
    {
      id: 'demo-trip-1',
      code: 'ELT-8412',
      passenger_id: DEMO_USER.uid,
      passenger_name: DEMO_USER.name,
      kind: 'passageiro',
      from_zone_id: 'd-talatona',
      to_zone_id: 'd-ilha',
      class_id: 'conforto',
      seats: 1,
      distance_km: 15.8,
      price_kz: 9800,
      commission_kz: 1175,
      driver_keeps_kz: 8625,
      state: 'rated',
      driver_id: DEFAULT_DEMO_DRIVER_INFO.id,
      driver_name: DEFAULT_DEMO_DRIVER_INFO.name,
      plate: DEFAULT_DEMO_DRIVER_INFO.plate,
      car_model: DEFAULT_DEMO_DRIVER_INFO.model,
      payment: 'multicaixa',
      trial: false,
      passenger_rating: 5,
      driver_rating: 5,
      events: [
        { at: now - 1 * day - 25 * 60_000, state: 'searching' },
        { at: now - 1 * day - 22 * 60_000, state: 'accepted' },
        { at: now - 1 * day - 18 * 60_000, state: 'ongoing' },
        { at: now - 1 * day, state: 'ended' },
      ],
      created_at: now - 1 * day - 25 * 60_000,
      settled_at: now - 1 * day,
    },
    {
      id: 'demo-trip-2',
      code: 'ELT-8395',
      passenger_id: DEMO_USER.uid,
      passenger_name: DEMO_USER.name,
      kind: 'entrega',
      parcel: { size: 'pequeno', what: 'Encomenda Elara Marketplace', toName: 'Carla Neto', toPhone: '923 410 880', payBy: 'remetente' },
      from_zone_id: 'd-mutamba',
      to_zone_id: 'd-maianga',
      class_id: 'moto',
      seats: 1,
      distance_km: 2.4,
      price_kz: 1300,
      commission_kz: 155,
      driver_keeps_kz: 1145,
      state: 'ended',
      driver_id: 'demo-drv-pedro',
      driver_name: 'Pedro Domingos',
      plate: 'LD-19-04-MC',
      car_model: 'Honda CB 125',
      payment: 'cash',
      trial: false,
      passenger_rating: null,
      driver_rating: 5,
      events: [
        { at: now - 3 * day - 18 * 60_000, state: 'searching' },
        { at: now - 3 * day - 12 * 60_000, state: 'ongoing' },
        { at: now - 3 * day, state: 'ended' },
      ],
      created_at: now - 3 * day - 18 * 60_000,
      settled_at: now - 3 * day,
    },
    {
      id: 'demo-trip-3',
      code: 'ELT-8320',
      passenger_id: DEMO_USER.uid,
      passenger_name: DEMO_USER.name,
      kind: 'passageiro',
      from_zone_id: 'd-ai',
      to_zone_id: 'd-novavida',
      class_id: 'xl',
      seats: 3,
      distance_km: 6.2,
      price_kz: 5400,
      commission_kz: 650,
      driver_keeps_kz: 4750,
      state: 'rated',
      driver_id: 'demo-drv-sergio',
      driver_name: 'Sérgio Benguela',
      plate: 'LD-62-88-CA',
      car_model: 'Toyota Fortuner',
      payment: 'multicaixa',
      trial: false,
      passenger_rating: 5,
      driver_rating: 5,
      events: [
        { at: now - 5 * day - 20 * 60_000, state: 'searching' },
        { at: now - 5 * day, state: 'ended' },
      ],
      created_at: now - 5 * day - 20 * 60_000,
      settled_at: now - 5 * day,
    },
    {
      id: 'demo-trip-4',
      code: 'ELT-8271',
      passenger_id: DEMO_USER.uid,
      passenger_name: DEMO_USER.name,
      kind: 'passageiro',
      from_zone_id: 'd-praca',
      to_zone_id: 'd-benfica',
      class_id: 'economico',
      seats: 1,
      distance_km: 19.2,
      price_kz: 8500,
      commission_kz: 1020,
      driver_keeps_kz: 7480,
      state: 'cancelled',
      payment: 'cash',
      trial: false,
      cancelled_by: 'passenger',
      events: [
        { at: now - 7 * day - 2 * 60_000, state: 'searching' },
        { at: now - 7 * day, state: 'cancelled', note: 'Cancelada antes de atribuir motorista.' },
      ],
      created_at: now - 7 * day - 2 * 60_000,
    },
  ];

  const wallet: DemoWalletState = {
    balanceKz: 24500,
    txs: [
      {
        id: 'dtx-1',
        who: DEMO_USER.uid,
        kind: 'earning',
        amount_kz: 6200,
        balance_after_kz: 24500,
        trip_id: 'ELT-8409',
        note: 'Corrida Talatona → Mutamba (DEMO)',
        at: now - 3 * hour,
      },
      {
        id: 'dtx-2',
        who: DEMO_USER.uid,
        kind: 'topup',
        amount_kz: 15000,
        balance_after_kz: 18300,
        note: 'Recarga Multicaixa Express (DEMO)',
        at: now - 2 * day,
      },
      {
        id: 'dtx-3',
        who: DEMO_USER.uid,
        kind: 'commission',
        amount_kz: -1200,
        balance_after_kz: 3300,
        trip_id: 'ELT-8390',
        note: 'Comissão Elara 12% (DEMO)',
        at: now - 4 * day,
      },
      {
        id: 'dtx-4',
        who: DEMO_USER.uid,
        kind: 'earning',
        amount_kz: 4500,
        balance_after_kz: 4500,
        trip_id: 'ELT-8377',
        note: 'Corrida Maianga → Aeroporto (DEMO)',
        at: now - 6 * day,
      },
    ],
    requests: [],
  };

  const rentals: Rental[] = [
    {
      id: 'd-rent-corolla',
      driver_id: 'demo-drv-joao',
      class_id: 'economico',
      title: 'Toyota Corolla 2022',
      blurb: 'Económico, AC gelado e revisão em dia para cidade e trabalho.',
      price_day_kz: 38000,
      driver_fee_kz: 10000,
      with_driver: true,
      allows_self_drive: true,
      deposit_kz: 50000,
      min_hours: 3,
      zone_id: 'd-talatona',
      state: 'active',
      created_at: now - 15 * day,
      updated_at: now - 2 * day,
      tr_driver: { public_name: 'João Manuel', rating: 4.9, rating_count: 128, model: 'Toyota Corolla', plate: 'LD-24-71-AA' },
    },
    {
      id: 'd-rent-prado',
      driver_id: 'demo-drv-sergio',
      class_id: 'xl',
      title: 'Toyota Prado TX · 7 lugares',
      blurb: 'SUV executivo para reuniões, aeroporto e viagens de fim-de-semana.',
      price_day_kz: 85000,
      driver_fee_kz: 15000,
      with_driver: true,
      allows_self_drive: false,
      deposit_kz: 120000,
      min_hours: 4,
      zone_id: 'd-ilha',
      state: 'active',
      created_at: now - 20 * day,
      updated_at: now - 1 * day,
      tr_driver: { public_name: 'Sérgio Benguela', rating: 4.95, rating_count: 84, model: 'Toyota Prado TX', plate: 'LD-62-88-CA' },
    },
    {
      id: 'd-rent-hiace',
      driver_id: 'demo-drv-lopes',
      class_id: 'hiace',
      title: 'Toyota Hiace · 14 lugares',
      blurb: 'Ideal para eventos, equipas empresariais e excursões.',
      price_day_kz: 65000,
      driver_fee_kz: 12000,
      with_driver: true,
      allows_self_drive: false,
      deposit_kz: 80000,
      min_hours: 4,
      zone_id: 'd-mutamba',
      state: 'active',
      created_at: now - 10 * day,
      updated_at: now - 3 * day,
      tr_driver: { public_name: 'António Lopes', rating: 4.8, rating_count: 61, model: 'Toyota Hiace', plate: 'LD-31-55-HA' },
    },
    {
      id: 'd-rent-canter',
      driver_id: 'demo-drv-kiala',
      class_id: 'canter',
      title: 'Mitsubishi Canter · Mudanças',
      blurb: 'Caixa fechada para transporte de mobília ou mercadoria em Luanda.',
      price_day_kz: 72000,
      driver_fee_kz: 14000,
      with_driver: true,
      allows_self_drive: false,
      deposit_kz: 70000,
      min_hours: 3,
      zone_id: 'd-viana',
      state: 'active',
      created_at: now - 12 * day,
      updated_at: now - 4 * day,
      tr_driver: { public_name: 'Carlos Kiala', rating: 4.85, rating_count: 47, model: 'Mitsubishi Canter', plate: 'LD-77-12-CA' },
    },
  ];

  const openDriverTrips: OpenTrip[] = [
    {
      id: 'd-open-1',
      code: 'ELT-9104',
      kind: 'passageiro',
      from_zone_id: 'd-talatona',
      to_zone_id: 'd-mutamba',
      class_id: 'economico',
      seats: 1,
      distance_km: 13.4,
      price_kz: 6000,
      payment: 'multicaixa',
      created_at: now - 2 * 60_000,
    },
    {
      id: 'd-open-2',
      code: 'ELT-9108',
      kind: 'passageiro',
      from_zone_id: 'd-maianga',
      to_zone_id: 'd-ai',
      class_id: 'economico',
      seats: 2,
      distance_km: 4.2,
      price_kz: 2200,
      payment: 'cash',
      created_at: now - 4 * 60_000,
    },
    {
      id: 'd-open-3',
      code: 'ELT-9111',
      kind: 'entrega',
      from_zone_id: 'd-novavida',
      to_zone_id: 'd-benfica',
      class_id: 'economico',
      seats: 1,
      distance_km: 9.8,
      price_kz: 4600,
      payment: 'cash',
      created_at: now - 6 * 60_000,
      parcel: { size: 'caixa', what: 'Caixa de peças auto' },
    },
  ];

  return {
    driver,
    trips,
    pins: {},
    chats: {},
    wallet,
    rentals,
    rentalRequests: [],
    openDriverTrips,
    driverActiveTrip: null,
    driverToday: { trips: 5, kz: 18400 },
  };
}

export function loadDemoState(): DemoState {
  try {
    const raw = localStorage.getItem(DEMO_STORE_KEY);
    if (!raw) return createInitialDemoState();
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    const base = createInitialDemoState();
    return {
      ...base,
      ...parsed,
      driver: parsed.driver ?? base.driver,
      trips: Array.isArray(parsed.trips) ? parsed.trips : base.trips,
      pins: parsed.pins ?? base.pins,
      chats: parsed.chats ?? base.chats,
      wallet: parsed.wallet ?? base.wallet,
      rentals: Array.isArray(parsed.rentals) && parsed.rentals.length ? parsed.rentals : base.rentals,
      rentalRequests: Array.isArray(parsed.rentalRequests) ? parsed.rentalRequests : base.rentalRequests,
      openDriverTrips: Array.isArray(parsed.openDriverTrips) ? parsed.openDriverTrips : base.openDriverTrips,
      driverActiveTrip: parsed.driverActiveTrip ?? null,
      driverToday: parsed.driverToday ?? base.driverToday,
    };
  } catch {
    return createInitialDemoState();
  }
}

export function saveDemoState(state: DemoState): void {
  try {
    localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(state));
  } catch {
    // modo privado / quota excedida
  }
}

export function resetDemoState(): DemoState {
  const fresh = createInitialDemoState();
  saveDemoState(fresh);
  return fresh;
}

/** Calcula um orçamento realista linha a linha no modo demonstração. */
export function computeDemoQuote(params: {
  classId: string;
  fromZoneId: string;
  toZoneId: string;
  seats: number;
  kind: TripKind;
  parcelSize?: string | null;
  zones: Zone[];
  classes: VehicleClass[];
  deliveryClasses: DeliveryClass[];
}): Quote | null {
  const fromZone = params.zones.find((z) => z.id === params.fromZoneId);
  const toZone = params.zones.find((z) => z.id === params.toZoneId);
  if (!fromZone || !toZone || fromZone.id === toZone.id) return null;

  const rawKm = haversineKm(fromZone.lat, fromZone.lon, toZone.lat, toZone.lon);
  const distanceKm = Math.max(1.2, Math.round(rawKm * 1.25 * 10) / 10);
  const etaMin = Math.max(4, driveMinutes(distanceKm));

  const delivery = params.kind === 'entrega'
    ? params.deliveryClasses.find((d) => d.id === params.parcelSize)
    : undefined;
  const cls = params.classes.find((c) => c.id === (delivery?.class_id ?? params.classId)) ?? params.classes[0];
  if (!cls) return null;

  const baseKz = delivery ? delivery.base_kz : cls.base_kz;
  const perKmKz = delivery ? delivery.per_km_kz : cls.per_km_kz;
  const minKz = delivery ? delivery.min_kz : cls.min_kz;
  const distKz = Math.round((distanceKm * perKmKz) / 50) * 50;
  const seatsMult = params.kind === 'passageiro' && cls.per_seat ? Math.max(1, params.seats) : 1;

  const rawTotal = (baseKz + distKz) * seatsMult;
  const priceKz = Math.max(minKz * seatsMult, Math.round(rawTotal / 100) * 100);
  const commissionKz = Math.round((priceKz * 0.12) / 5) * 5;
  const driverKeepsKz = Math.max(0, priceKz - commissionKz);

  const lines: { label: string; amountKz: number }[] = [
    { label: delivery ? `Base (${delivery.label})` : `Tarifa base (${cls.label})`, amountKz: baseKz * seatsMult },
    { label: `Distância (${distanceKm} km)`, amountKz: Math.max(0, priceKz - baseKz * seatsMult) },
  ];

  return {
    classId: cls.id,
    distanceKm,
    seats: Math.max(1, params.seats),
    priceKz,
    lines,
    commissionKz,
    driverKeepsKz,
    etaMin,
    fromZoneId: fromZone.id,
    toZoneId: toZone.id,
  };
}

/** Carros simulados próximos do centro do mapa em modo demonstração. */
export function buildDemoNearbyCars(center: { lat: number; lon: number }): NearbyCar[] {
  const offsets = [
    { id: 'demo-car-1', dLat: 0.0052, dLon: -0.0041, class_id: 'economico' },
    { id: 'demo-car-2', dLat: -0.0068, dLon: 0.0055, class_id: 'conforto' },
    { id: 'demo-car-3', dLat: 0.0091, dLon: 0.0074, class_id: 'moto' },
    { id: 'demo-car-4', dLat: -0.0035, dLon: -0.0089, class_id: 'xl' },
    { id: 'demo-car-5', dLat: 0.0115, dLon: -0.0018, class_id: 'economico' },
  ];
  return offsets.map((o) => {
    const lat = center.lat + o.dLat;
    const lon = center.lon + o.dLon;
    return {
      driver_id: o.id,
      class_id: o.class_id,
      lat,
      lon,
      distance_km: Math.round(haversineKm(center.lat, center.lon, lat, lon) * 10) / 10,
      seen_min: 1,
    };
  });
}

/** Cria uma viagem de demonstração pronta a correr no ecrã real. */
export function createDemoTrip(
  state: DemoState,
  input: {
    quote: Quote;
    kind: TripKind;
    payment: Payment;
    parcel?: Trip['parcel'];
    pickup?: Pickup | null;
    landmark?: string;
    destNote?: string;
  },
  now = Date.now(),
): { state: DemoState; trip: Trip; pin: string; dropPin: string | null } {
  const num = String(Math.floor(1000 + (now % 8999)));
  const pin = '4821';
  const dropPin = input.kind === 'entrega' ? '7390' : null;
  const id = `demo-live-${now}`;
  const trip: Trip = {
    id,
    code: `DEMO-${num}`,
    passenger_id: DEMO_USER.uid,
    passenger_name: DEMO_USER.name,
    kind: input.kind,
    parcel: input.parcel ?? null,
    from_zone_id: input.quote.fromZoneId,
    to_zone_id: input.quote.toZoneId,
    class_id: input.quote.classId,
    seats: input.quote.seats,
    distance_km: input.quote.distanceKm,
    price_kz: input.quote.priceKz,
    commission_kz: input.quote.commissionKz,
    driver_keeps_kz: input.quote.driverKeepsKz,
    state: 'searching',
    payment: input.payment,
    trial: false,
    pickup: input.pickup ?? null,
    events: [{ at: now, state: 'searching' }],
    created_at: now,
  };

  const initialMessages: ChatMessage[] = [];
  if (input.landmark?.trim()) {
    initialMessages.push({
      id: `dmsg-${now}-1`,
      trip_id: id,
      sender_role: 'passenger',
      text: `O meu ponto de encontro: ${input.landmark.trim()}`,
      at: now,
    });
  }
  if (input.destNote?.trim()) {
    initialMessages.push({
      id: `dmsg-${now}-2`,
      trip_id: id,
      sender_role: 'passenger',
      text: input.destNote.trim(),
      at: now + 100,
    });
  }

  const next: DemoState = {
    ...state,
    trips: [trip, ...state.trips],
    pins: { ...state.pins, [id]: { pin, dropPin } },
    chats: { ...state.chats, [id]: initialMessages },
  };
  return { state: next, trip, pin, dropPin };
}

/** Avança a viagem activa em modo demonstração para a fase seguinte realista. */
export function advanceDemoTrip(state: DemoState, tripId: string, now = Date.now()): DemoState {
  const target = state.trips.find((t) => t.id === tripId);
  if (!target) return state;

  const order: TripState[] = target.kind === 'entrega'
    ? ['searching', 'accepted', 'arriving', 'waiting_pin', 'ongoing', 'waiting_drop', 'ended']
    : ['searching', 'accepted', 'arriving', 'waiting_pin', 'ongoing', 'ended'];
  const idx = order.indexOf(target.state);
  if (idx < 0 || idx >= order.length - 1) return state;

  const nextState = order[idx + 1];
  const updated: Trip = {
    ...target,
    state: nextState,
    driver_id: target.driver_id ?? DEFAULT_DEMO_DRIVER_INFO.id,
    driver_name: target.driver_name ?? DEFAULT_DEMO_DRIVER_INFO.name,
    plate: target.plate ?? DEFAULT_DEMO_DRIVER_INFO.plate,
    car_model: target.car_model ?? DEFAULT_DEMO_DRIVER_INFO.model,
    events: [...(target.events ?? []), { at: now, state: nextState }],
    settled_at: nextState === 'ended' ? now : target.settled_at,
  };

  const prevChat = state.chats[tripId] ?? [];
  const nextChat = [...prevChat];
  if (nextState === 'accepted' && !prevChat.some((m) => m.sender_role === 'driver')) {
    nextChat.push({
      id: `dmsg-drv-${now}`,
      trip_id: tripId,
      sender_role: 'driver',
      text: `Boa tarde! Aceitei o pedido — estou a caminho no ${DEFAULT_DEMO_DRIVER_INFO.model} (${DEFAULT_DEMO_DRIVER_INFO.plate}).`,
      at: now,
    });
  } else if (nextState === 'waiting_pin') {
    nextChat.push({
      id: `dmsg-arr-${now}`,
      trip_id: tripId,
      sender_role: 'driver',
      text: 'Cheguei ao ponto de embarque! Diga-me o código de 4 dígitos para começarmos.',
      at: now,
    });
  }

  return {
    ...state,
    trips: state.trips.map((t) => (t.id === tripId ? updated : t)),
    chats: { ...state.chats, [tripId]: nextChat },
  };
}

export function cancelDemoTrip(state: DemoState, tripId: string, now = Date.now()): DemoState {
  return {
    ...state,
    trips: state.trips.map((t) =>
      t.id === tripId
        ? {
            ...t,
            state: 'cancelled',
            cancelled_by: 'passenger',
            events: [...(t.events ?? []), { at: now, state: 'cancelled', note: 'Cancelada em modo demonstração.' }],
          }
        : t,
    ),
  };
}

export function rateDemoTrip(state: DemoState, tripId: string, score: number): DemoState {
  return {
    ...state,
    trips: state.trips.map((t) =>
      t.id === tripId ? { ...t, state: 'rated', passenger_rating: score } : t,
    ),
  };
}

export function appendDemoChatMessage(
  state: DemoState,
  tripId: string,
  senderRole: 'passenger' | 'driver',
  text: string,
  now = Date.now(),
): DemoState {
  const prev = state.chats[tripId] ?? [];
  const msg: ChatMessage = {
    id: `dmsg-${now}-${prev.length}`,
    trip_id: tripId,
    sender_role: senderRole,
    text,
    at: now,
  };
  const next = [...prev, msg];
  if (senderRole === 'passenger') {
    const lower = text.toLowerCase();
    const reply = lower.includes('nota') || lower.includes('troco')
      ? 'Perfeito, tenho troco comigo — sem problema.'
      : lower.includes('portão') || lower.includes('chegar') || lower.includes('já vou')
        ? 'Combinado! Fico à espera aqui com os piscas ligados.'
        : 'Recebido! Estou atento aqui no trajecto.';
    next.push({
      id: `dmsg-reply-${now}-${prev.length + 1}`,
      trip_id: tripId,
      sender_role: 'driver',
      text: reply,
      at: now + 600,
    });
  }
  return { ...state, chats: { ...state.chats, [tripId]: next } };
}

/** Posição simulada do motorista no mapa de acordo com a fase da viagem. */
export function demoDriverPosition(
  trip: Trip,
  zones: Zone[],
): { lat: number; lon: number } | null {
  if (trip.state === 'searching') return null;
  const from = zones.find((z) => z.id === trip.from_zone_id);
  const to = zones.find((z) => z.id === trip.to_zone_id);
  if (!from || !to) return null;

  if (trip.state === 'accepted') {
    return { lat: from.lat + 0.011, lon: from.lon - 0.009 };
  }
  if (trip.state === 'arriving') {
    return { lat: from.lat + 0.0032, lon: from.lon - 0.0024 };
  }
  if (trip.state === 'waiting_pin') {
    return { lat: from.lat + 0.0004, lon: from.lon + 0.0004 };
  }
  if (trip.state === 'ongoing') {
    return { lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 };
  }
  return { lat: to.lat, lon: to.lon };
}

/** Calcula orçamento de aluguer em modo demonstração. */
export function computeDemoRentalQuote(
  rental: Rental,
  plan: RentalPlan,
  qty: number,
  withDriver: boolean,
): RentalQuote {
  const dayRate = rental.price_day_kz;
  const driverExtra = withDriver ? rental.driver_fee_kz : 0;
  const unitKz = plan === 'hour'
    ? Math.round((dayRate / 6) / 100) * 100
    : plan === 'day'
      ? dayRate
      : plan === 'week'
        ? dayRate * 6
        : dayRate * 20;
  const driverUnit = plan === 'hour'
    ? Math.round((driverExtra / 6) / 100) * 100
    : plan === 'day'
      ? driverExtra
      : plan === 'week'
        ? driverExtra * 6
        : driverExtra * 20;
  const carSubtotal = unitKz * qty;
  const driverSubtotal = driverUnit * qty;
  const priceKz = carSubtotal + driverSubtotal;
  const commissionKz = Math.round(priceKz * 0.1);
  const lines = [
    { label: `${rental.title} (${qty}×)`, amountKz: carSubtotal },
    ...(driverSubtotal > 0 ? [{ label: 'Motorista incluído', amountKz: driverSubtotal }] : []),
  ];
  return {
    rentalId: rental.id,
    classId: rental.class_id,
    lane: rental.class_id === 'canter' || rental.class_id === 'picape' ? 'carga' : 'passageiro',
    plan,
    qty,
    unitKz,
    priceKz,
    lines,
    depositKz: rental.deposit_kz,
    minHours: rental.min_hours,
    hoursToDay: plan === 'hour' && qty >= 6 ? 6 : null,
    commissionKz,
    ownerKeepsKz: Math.max(0, priceKz - commissionKz),
  };
}

/** Pedido de recarga ou levantamento na carteira em modo demonstração. */
export function requestDemoMoney(
  state: DemoState,
  direction: 'in' | 'out',
  amountKz: number,
  method: string,
  now = Date.now(),
): DemoState {
  const req: MoneyRequest = {
    id: `dreq-${now}`,
    who: DEMO_USER.uid,
    role: 'passenger',
    direction,
    amount_kz: Math.round(amountKz),
    method: method.trim(),
    state: 'pending',
    at: now,
  };
  return {
    ...state,
    wallet: {
      ...state.wallet,
      requests: [req, ...state.wallet.requests],
    },
  };
}

/** Confirma instantaneamente um pedido pendente da carteira em modo demonstração. */
export function confirmDemoMoneyRequest(
  state: DemoState,
  requestId: string,
  now = Date.now(),
): DemoState {
  const req = state.wallet.requests.find((r) => r.id === requestId && r.state === 'pending');
  if (!req) return state;
  const delta = req.direction === 'in' ? req.amount_kz : -req.amount_kz;
  const nextBal = Math.max(0, state.wallet.balanceKz + delta);
  return {
    ...state,
    wallet: {
      balanceKz: nextBal,
      requests: state.wallet.requests.map((r) =>
        r.id === requestId ? { ...r, state: 'confirmed', resolved_at: now } : r,
      ),
      txs: [
        {
          id: `dtx-${now}`,
          who: DEMO_USER.uid,
          kind: req.direction === 'in' ? 'topup' : 'payout',
          amount_kz: delta,
          balance_after_kz: nextBal,
          note: `${req.method} (DEMO)`,
          at: now,
        },
        ...state.wallet.txs,
      ],
    },
  };
}

/** Aceita um pedido da praça no painel do motorista em modo demonstração. */
export function claimDemoDriverTrip(state: DemoState, openTripId: string, now = Date.now()): DemoState {
  const open = state.openDriverTrips.find((t) => t.id === openTripId);
  if (!open) return state;
  const commissionKz = Math.round(open.price_kz * 0.12);
  const active: Trip = {
    id: open.id,
    code: open.code,
    passenger_id: 'demo-passenger-ext',
    passenger_name: 'Nádia Fernandes',
    kind: open.kind,
    parcel: open.parcel ? { size: open.parcel.size, what: open.parcel.what } : null,
    from_zone_id: open.from_zone_id,
    to_zone_id: open.to_zone_id,
    class_id: open.class_id,
    seats: open.seats,
    distance_km: open.distance_km,
    price_kz: open.price_kz,
    commission_kz: commissionKz,
    driver_keeps_kz: open.price_kz - commissionKz,
    state: 'accepted',
    driver_id: state.driver.id,
    driver_name: state.driver.public_name,
    plate: state.driver.plate,
    car_model: state.driver.model,
    payment: open.payment,
    trial: false,
    events: [{ at: open.created_at, state: 'searching' }, { at: now, state: 'accepted' }],
    created_at: open.created_at,
  };
  return {
    ...state,
    openDriverTrips: state.openDriverTrips.filter((t) => t.id !== openTripId),
    driverActiveTrip: active,
  };
}

/** Avança a corrida activa do motorista em modo demonstração até concluir e somar ganhos. */
export function advanceDemoDriverTrip(state: DemoState, now = Date.now()): DemoState {
  const active = state.driverActiveTrip;
  if (!active) return state;
  const order: TripState[] = ['accepted', 'arriving', 'waiting_pin', 'ongoing', 'ended'];
  const idx = order.indexOf(active.state);
  if (idx < 0) return state;
  const nextState = order[idx + 1] ?? 'ended';
  if (nextState === 'ended') {
    const earned = active.driver_keeps_kz;
    const nextBal = state.wallet.balanceKz + earned;
    return {
      ...state,
      driverActiveTrip: null,
      driver: { ...state.driver, trips: state.driver.trips + 1 },
      driverToday: {
        trips: state.driverToday.trips + 1,
        kz: state.driverToday.kz + earned,
      },
      wallet: {
        ...state.wallet,
        balanceKz: nextBal,
        txs: [
          {
            id: `dtx-drv-${now}`,
            who: DEMO_USER.uid,
            kind: 'earning',
            amount_kz: earned,
            balance_after_kz: nextBal,
            trip_id: active.code,
            note: `Corrida motorista ${active.code} (DEMO)`,
            at: now,
          },
          ...state.wallet.txs,
        ],
      },
    };
  }
  return {
    ...state,
    driverActiveTrip: {
      ...active,
      state: nextState,
      events: [...active.events, { at: now, state: nextState }],
    },
  };
}
