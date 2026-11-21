/**
 * Elara Ulyatila — modelo de dados do cliente.
 *
 * O mesmo contrato das tabelas tr_* no Supabase: o preço é fechado no servidor
 * (tr_quote), os PINs vivem em tr_trip_secret e nunca chegam ao motorista, e a
 * carteira só muda quando a equipa confirma dinheiro que entrou ou saiu.
 */

export type TripKind = 'passageiro' | 'entrega';

export type TripState =
  | 'searching' | 'accepted' | 'arriving' | 'waiting_pin' | 'ongoing'
  | 'waiting_drop' | 'ended' | 'rated' | 'cancelled';

export type Payment = 'cash' | 'multicaixa';

export type ParcelSize =
  | 'documento' | 'pequeno' | 'caixa' | 'volume' | 'moveis'
  | 'recolha' | 'canter' | 'mercadoria';

export interface Zone {
  id: string;
  name: string;
  city: string;
  province: string;
  lat: number;
  lon: number;
  kind: 'paragem' | 'bairro' | 'terminal' | 'aeroporto' | 'zona';
}

export interface VehicleClass {
  id: string;
  label: string;
  seats: number;
  base_kz: number;
  per_km_kz: number;
  min_kz: number;
  per_seat: boolean;
  blurb: string;
  icon: string;
  sort: number;
  /**
   * 'carga' fica fora do rail de passageiros: uma picape ou um camião não são
   * um táxi com mais lugares. Opcional porque a coluna chega com a migração
   * 0003 — sem ela, tudo se comporta como passageiro e nada se esconde.
   */
  lane?: 'passageiro' | 'carga';
}

export interface DeliveryClass {
  id: ParcelSize;
  label: string;
  example: string;
  base_kz: number;
  per_km_kz: number;
  min_kz: number;
  class_id: string;
  blurb: string;
}

export interface TripEvent {
  at: number;
  state: TripState;
  note?: string;
}

/**
 * O ponto exacto onde a pessoa quer ser apanhada, marcado no mapa. As zonas são
 * centróides — servem para o preço e para a rota; o encontro é aqui.
 * Chega de 0004 (tr_trip.pickup); sem a migração aplicada é sempre undefined.
 */
export interface Pickup {
  lat: number;
  lon: number;
  note?: string;
}

export interface Trip {
  id: string;
  code: string;
  passenger_id: string;
  passenger_name: string;
  kind: TripKind;
  for_whom?: { name: string; phone: string } | null;
  parcel?: {
    size: ParcelSize;
    what: string;
    toName?: string;
    toPhone?: string;
    payBy?: 'remetente' | 'destinatario';
    ref?: string;
  } | null;
  from_zone_id: string;
  to_zone_id: string;
  class_id: string;
  seats: number;
  distance_km: number;
  price_kz: number;
  commission_kz: number;
  driver_keeps_kz: number;
  state: TripState;
  driver_id?: string | null;
  driver_name?: string | null;
  plate?: string | null;
  car_model?: string | null;
  payment: Payment;
  trial: boolean;
  /**
   * Lugar comprado numa corrida partilhada (0004). A viagem continua a ser a
   * máquina de estados de sempre — só passa a haver mais do que uma no mesmo
   * carro, com o mesmo motorista atribuído desde o primeiro segundo.
   */
  ride_id?: string | null;
  pickup?: Pickup | null;
  cancelled_by?: string | null;
  passenger_rating?: number | null;
  driver_rating?: number | null;
  events: TripEvent[];
  created_at: number;
  settled_at?: number | null;
}

/** O que o motorista vê na praça: sem nomes nem telefones do destinatário. */
export interface OpenTrip {
  id: string;
  code: string;
  kind: TripKind;
  from_zone_id: string;
  to_zone_id: string;
  class_id: string;
  seats: number;
  distance_km: number;
  price_kz: number;
  payment: Payment;
  created_at: number;
  parcel?: { size: ParcelSize; what: string } | null;
  /** O ponto marcado no mapa (0004) — a praça mostra-o como referência, nunca o nome. */
  pickup?: Pickup | null;
}

export type DriverStatus = 'pending' | 'approved' | 'suspended' | 'banned';

export interface Driver {
  id: string;
  account_id: string;
  name: string;
  public_name: string;
  plate: string;
  model: string;
  year: number;
  class_id: string;
  province: string;
  home_zone_id: string;
  status: DriverStatus;
  approved_at?: number | null;
  rating: number;
  rating_count: number;
  trips: number;
  trial_trips_left: number;
  online: boolean;
  created_at: number;
}

export interface ChatMessage {
  id: string;
  trip_id: string;
  sender_role: 'passenger' | 'driver' | 'system';
  text: string;
  blocked?: string | null;
  at: number;
}

export type WalletTxKind = 'earning' | 'commission' | 'topup' | 'payout' | 'fee' | 'refund';

export interface WalletTx {
  id: string;
  who: string;
  kind: WalletTxKind;
  amount_kz: number;
  balance_after_kz: number;
  trip_id?: string | null;
  note: string;
  at: number;
}

export interface MoneyRequest {
  id: string;
  who: string;
  role: 'passenger' | 'driver';
  direction: 'in' | 'out';
  amount_kz: number;
  method: string;
  state: 'pending' | 'confirmed' | 'rejected';
  at: number;
  resolved_at?: number | null;
  reason?: string | null;
}

/**
 * Aluguer. O preço-base é sempre o dia, escrito pelo DONO do carro; a hora, a
 * semana e o mês saem de lá no servidor (tr_rental_quote), pelo que o número
 * que a pessoa vê é o número que o dono recebe.
 */
export type RentalPlan = 'hour' | 'day' | 'week' | 'month';

export interface Rental {
  id: string;
  driver_id: string;
  class_id: string;
  title: string;
  blurb: string;
  price_day_kz: number;
  driver_fee_kz: number;
  with_driver: boolean;
  allows_self_drive: boolean;
  deposit_kz: number;
  min_hours: number;
  zone_id?: string | null;
  state: 'active' | 'paused';
  created_at: number;
  updated_at: number;
  /** PostgREST traz o dono junto; só existe quando a leitura é por embed. */
  tr_driver?: { public_name: string; rating: number; rating_count: number; model: string; plate: string } | null;
}

export interface RentalRequest {
  id: string;
  rental_id: string;
  driver_id: string;
  renter_id: string;
  renter_name: string;
  plan: RentalPlan;
  qty: number;
  with_driver: boolean;
  start_at: number;
  pickup_zone_id?: string | null;
  note: string;
  price_kz: number;
  state: 'sent' | 'accepted' | 'declined' | 'cancelled';
  reason?: string | null;
  created_at: number;
  resolved_at?: number | null;
  rental?: Pick<Rental, 'id' | 'title' | 'class_id' | 'price_day_kz'> | null;
}

/** Resposta do RPC tr_rental_quote. */
export interface RentalQuote {
  rentalId: string;
  classId: string;
  lane: 'passageiro' | 'carga';
  plan: RentalPlan;
  qty: number;
  unitKz: number;
  priceKz: number;
  lines: { label: string; amountKz: number }[];
  depositKz: number;
  minHours: number;
  hoursToDay: number | null;
  commissionKz: number;
  ownerKeepsKz: number;
}

/** Resposta do RPC tr_quote: linhas para mostrar de onde vem o número. */
export interface Quote {
  classId: string;
  distanceKm: number;
  seats: number;
  priceKz: number;
  lines: { label: string; amountKz: number }[];
  commissionKz: number;
  driverKeepsKz: number;
  etaMin: number;
  fromZoneId: string;
  toZoneId: string;
}

/** Resposta do RPC tr_create_trip: os códigos só aparecem a quem pediu. */
export interface CreatedTrip {
  id: string;
  code: string;
  pin: string;
  dropPin?: string | null;
  quote: Quote;
  /** Só quando os lugares foram comprados numa corrida partilhada (0004). */
  rideId?: string | null;
  seatsLeft?: number | null;
}

/**
 * Corrida partilhada (0004). A meia Luanda não aluga uma carrinha inteira:
 * compra UM lugar numa Hiace que já está a encher. `tr_ride` é o veículo e a
 * sua rota; cada lugar vendido é um `tr_trip` normal por baixo, com PIN próprio.
 */
export type RideState = 'open' | 'departed' | 'closed' | 'cancelled';

/** Uma linha do quadro de saídas — o que o passageiro vê antes de comprar. */
export interface BoardRow {
  ride_id: string;
  class_id: string;
  from_zone_id: string;
  to_zone_id: string;
  depart_at: number;
  seats_left: number;
  capacity: number;
  seat_price_kz: number;
  distance_km: number;
  eta_min: number;
  public_name: string;
  rating: number;
  away_km: number;
}

/** A corrida inteira, como a devolve tr_ride_manifest: só o motorista dela a vê. */
export interface RideManifest {
  ride: {
    id: string;
    driver_id: string;
    class_id: string;
    from_zone_id: string;
    to_zone_id: string;
    capacity: number;
    seats_taken: number;
    seat_price_kz: number;
    distance_km: number;
    eta_min: number;
    depart_at: number;
    note: string;
    state: RideState;
  };
  seats_left: number;
  passengers: {
    trip_id: string;
    code: string;
    name: string;
    seats: number;
    price_kz: number;
    state: TripState;
    pickup?: Pickup | null;
    created_at: number;
  }[];
}

export interface SessionUser {
  uid: string;
  name: string;
  email: string;
  isAdmin: boolean;
}
