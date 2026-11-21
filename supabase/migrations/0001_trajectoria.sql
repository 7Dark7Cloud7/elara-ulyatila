-- Elara Trajectoria — 0001 (prefixo tr_)
--
-- Corridas e entregas com despacho real, na mesma base de dados e na mesma
-- conta do Elara Marketplace (projecto bkubhmovgojhutevgzvt). Um login Elara
-- serve os dois produtos; `profiles` continua a ser a tabela de pessoas.
--
-- O que este ficheiro corrige face ao rascunho do Kende (0001_kende.sql),
-- que nunca chegou a correr:
--
-- 1. Ninguém escreve no próprio saldo. O rascunho deixava qualquer utilizador
--    inserir linhas de carteira (`wallet_write_own`). Aqui a carteira e o
--    razão só recebem linhas de funções SECURITY DEFINER chamadas por RPC, e
--    a API não tem grant de insert/update/delete nessas tabelas.
-- 2. O preço nasce no servidor. `tr_create_trip` chama `tr_quote` dentro do
--    Postgres: zonas, categorias e taxas vivem em tabelas, e o cliente não
--    pode sugerir um `price_kz`.
-- 3. O feed de pedidos não mostra os códigos. Os PINs vivem em
--    `tr_trip_secret`, legível só pelo passageiro; o motorista confirma por
--    RPC (`tr_verify_pin`) e nunca chega a ler o número.
-- 4. Aceitar é um UPDATE atómico (`where state = 'searching' and driver_id is
--    null`). Dois motoristas no mesmo segundo: um passa, o outro recebe erro.
--    No rascunho aceitar era impossível (política circular) e sem atomicidade.
--
-- Convenções herdadas do Elara: ids de pessoa em texto (profiles.id é text),
-- Kwanza inteiro (nunca float), `is_admin()` do projeto (lê profiles.role,
-- protegido pelo trigger protect_profile_role). As horas de domínio são
-- bigint em milissegundos, mas escritas pelo relógio do servidor — em algo
-- que decide dinheiro, o aparelho de quem reclama não é testemunha.

-- — Zonas e tarifas —————————————————————————————————————————————————————————

create table if not exists public.tr_zone (
  id text primary key,
  name text not null,
  city text not null,
  province text not null,
  lat double precision not null,
  lon double precision not null,
  kind text not null default 'bairro'
    constraint tr_zone_kind check (kind in ('paragem','bairro','terminal','aeroporto','zona'))
);

create table if not exists public.tr_vehicle_class (
  id text primary key,
  label text not null,
  seats integer not null constraint tr_class_seats check (seats >= 0),
  base_kz integer not null constraint tr_class_base check (base_kz >= 0),
  per_km_kz integer not null constraint tr_class_perkm check (per_km_kz >= 0),
  min_kz integer not null constraint tr_class_min check (min_kz >= 0),
  per_seat boolean not null default false,
  blurb text not null default '',
  icon text not null default 'Car',
  sort integer not null default 0
);

create table if not exists public.tr_delivery_class (
  id text primary key,
  label text not null,
  example text not null default '',
  base_kz integer not null constraint tr_delivery_base check (base_kz >= 0),
  per_km_kz integer not null constraint tr_delivery_perkm check (per_km_kz >= 0),
  min_kz integer not null constraint tr_delivery_min check (min_kz >= 0),
  class_id text not null references public.tr_vehicle_class (id),
  blurb text not null default ''
);

create table if not exists public.tr_setting (
  id integer primary key default 1 constraint tr_setting_one_row check (id = 1),
  commission_pct integer not null default 15 constraint tr_setting_pct check (commission_pct between 0 and 40),
  booking_fee_kz integer not null default 150 constraint tr_setting_booking check (booking_fee_kz >= 0),
  cancel_fee_kz integer not null default 200 constraint tr_setting_cancel check (cancel_fee_kz >= 0),
  min_driver_balance_kz integer not null default 1500 constraint tr_setting_minbal check (min_driver_balance_kz >= 0),
  surge_cap numeric not null default 1.15 constraint tr_setting_surge check (surge_cap >= 1 and surge_cap <= 2),
  trial_trip_limit integer not null default 20 constraint tr_setting_trial check (trial_trip_limit >= 0),
  launch_commission_until bigint not null default 0,
  province text not null default 'Luanda',
  updated_at bigint not null default 0
);

-- — Motoristas ——————————————————————————————————————————————————————————————

-- Os documentos ficam fora da linha pública do motorista: no rascunho o jsonb
-- `docs` via junto do nome e da matrícula para qualquer leitor aprovado.
create table if not exists public.tr_driver (
  id text primary key default ('drv_' || replace(gen_random_uuid()::text, '-', '')),
  account_id text not null unique references public.profiles (id) on delete cascade,
  name text not null,
  public_name text not null,
  plate text not null,
  model text not null,
  year integer not null constraint tr_driver_year check (year between 1980 and 2100),
  class_id text not null references public.tr_vehicle_class (id),
  province text not null default 'Luanda',
  home_zone_id text not null references public.tr_zone (id),
  status text not null default 'pending'
    constraint tr_driver_status check (status in ('pending','approved','suspended','banned')),
  approved_at bigint,
  rating numeric(3, 2) not null default 0 constraint tr_driver_rating check (rating between 0 and 5),
  rating_count integer not null default 0,
  trips integer not null default 0,
  trial_trips_left integer not null default 20,
  online boolean not null default false,
  created_at bigint not null default 0
);

create index if not exists tr_driver_match_idx on public.tr_driver (class_id, status, online);

create table if not exists public.tr_driver_doc (
  driver_id text primary key references public.tr_driver (id) on delete cascade,
  bi boolean not null default false,
  licence boolean not null default false,
  logbook boolean not null default false,
  insurance boolean not null default false,
  criminal_record boolean not null default false,
  car_photos boolean not null default false,
  selfie_checked boolean not null default false,
  updated_at bigint not null default 0
);

-- Posição em directo: uma linha por motorista, reescrita de cada vez. O
-- passageiro só lê a do motorista que lhe foi atribuído (ver políticas).
create table if not exists public.tr_driver_presence (
  driver_id text primary key references public.tr_driver (id) on delete cascade,
  lat double precision not null constraint tr_presence_lat check (lat between -90 and 90),
  lon double precision not null constraint tr_presence_lon check (lon between -180 and 180),
  updated_at bigint not null default 0
);

-- — Viagens e entregas ———————————————————————————————————————————————————————

create table if not exists public.tr_trip (
  id text primary key default ('trp_' || replace(gen_random_uuid()::text, '-', '')),
  code text not null unique,
  passenger_id text not null references public.profiles (id),
  passenger_name text not null,
  kind text not null default 'passageiro'
    constraint tr_trip_kind check (kind in ('passageiro','entrega')),
  for_whom jsonb,
  parcel jsonb,
  from_zone_id text not null references public.tr_zone (id),
  to_zone_id text not null references public.tr_zone (id),
  class_id text not null references public.tr_vehicle_class (id),
  seats integer not null default 1 constraint tr_trip_seats check (seats >= 0),
  distance_km numeric(6, 2) not null default 0,
  price_kz integer not null constraint tr_trip_price check (price_kz > 0),
  commission_kz integer not null default 0 constraint tr_trip_commission check (commission_kz >= 0),
  driver_keeps_kz integer not null default 0 constraint tr_trip_keeps check (driver_keeps_kz >= 0),
  state text not null default 'searching'
    constraint tr_trip_state check (state in ('searching','accepted','arriving','waiting_pin','ongoing','waiting_drop','ended','rated','cancelled')),
  driver_id text references public.tr_driver (id),
  driver_name text,
  plate text,
  car_model text,
  payment text not null default 'cash'
    constraint tr_trip_payment check (payment in ('cash','multicaixa')),
  trial boolean not null default false,
  cancelled_by text constraint tr_trip_cancelled_by check (cancelled_by in ('passenger','driver','system','admin')),
  passenger_rating integer constraint tr_trip_prating check (passenger_rating between 1 and 5),
  driver_rating integer constraint tr_trip_drating check (driver_rating between 1 and 5),
  events jsonb not null default '[]',
  created_at bigint not null default 0,
  settled_at bigint
);

create index if not exists tr_trip_open_idx on public.tr_trip (state, class_id, created_at desc);
create index if not exists tr_trip_passenger_idx on public.tr_trip (passenger_id, created_at desc);
create index if not exists tr_trip_driver_idx on public.tr_trip (driver_id, created_at desc);

-- Os PINs nunca viajam na linha da viagem: assim a política de leitura do
-- motorista (necessária para o realtime funcionar) não precisa de esconder
-- colunas — não há colunas para esconder.
create table if not exists public.tr_trip_secret (
  trip_id text primary key references public.tr_trip (id) on delete cascade,
  pin text not null,
  drop_pin text
);

-- — Carteira ————————————————————————————————————————————————————————————————

-- Uma linha por pessoa. Não tem política de insert/update para o papel
-- `authenticated`: só as funções de liquidação escrevem aqui.
create table if not exists public.tr_wallet (
  who text primary key references public.profiles (id) on delete cascade,
  role text not null constraint tr_wallet_role check (role in ('passenger','driver')),
  balance_kz integer not null default 0 constraint tr_wallet_balance check (balance_kz >= 0),
  updated_at bigint not null default 0
);

-- Razão imutável: sem política de update/delete e sem grant. O que está
-- escrito, ficou escrito.
create table if not exists public.tr_wallet_tx (
  id text primary key default ('wtx_' || replace(gen_random_uuid()::text, '-', '')),
  who text not null references public.profiles (id) on delete cascade,
  kind text not null constraint tr_wallet_tx_kind check (kind in ('earning','commission','topup','payout','fee','refund')),
  amount_kz integer not null,
  balance_after_kz integer not null,
  trip_id text,
  note text not null default '',
  at bigint not null default 0
);

create index if not exists tr_wallet_tx_who_idx on public.tr_wallet_tx (who, at desc);

-- Recarga e levantamento continuam a ser pedidos: a app não processa
-- pagamentos, por isso o saldo só muda quando a equipa confirma o dinheiro.
create table if not exists public.tr_money_request (
  id text primary key default ('mreq_' || replace(gen_random_uuid()::text, '-', '')),
  who text not null references public.profiles (id),
  role text not null constraint tr_money_role check (role in ('passenger','driver')),
  direction text not null constraint tr_money_direction check (direction in ('in','out')),
  amount_kz integer not null constraint tr_money_amount check (amount_kz > 0),
  method text not null,
  state text not null default 'pending'
    constraint tr_money_state check (state in ('pending','confirmed','rejected')),
  reason text,
  at bigint not null default 0,
  resolved_at bigint
);

create index if not exists tr_money_request_who_idx on public.tr_money_request (who, at desc);
create index if not exists tr_money_request_pending_idx on public.tr_money_request (state, at);

-- — Chat, denúncias e sanções ————————————————————————————————————————————————

create table if not exists public.tr_chat_message (
  id text primary key default ('msg_' || replace(gen_random_uuid()::text, '-', '')),
  trip_id text not null references public.tr_trip (id) on delete cascade,
  sender_role text not null constraint tr_chat_sender check (sender_role in ('passenger','driver','system')),
  text text not null constraint tr_chat_len check (char_length(text) between 1 and 1000),
  blocked text,
  at bigint not null default 0
);

create index if not exists tr_chat_trip_idx on public.tr_chat_message (trip_id, at);

create table if not exists public.tr_report (
  id text primary key default ('rep_' || replace(gen_random_uuid()::text, '-', '')),
  trip_id text references public.tr_trip (id) on delete set null,
  by_id text not null references public.profiles (id),
  by_role text not null constraint tr_report_by_role check (by_role in ('passenger','driver')),
  reason text not null,
  text text not null,
  state text not null default 'open'
    constraint tr_report_state check (state in ('open','review','resolved')),
  resolved_at bigint,
  outcome text,
  at bigint not null default 0
);

create table if not exists public.tr_violation (
  id text primary key default ('vio_' || replace(gen_random_uuid()::text, '-', '')),
  who text not null references public.profiles (id),
  who_role text not null constraint tr_violation_role check (who_role in ('passenger','driver')),
  kind text not null,
  evidence text not null,
  trip_id text,
  sanction text not null constraint tr_violation_sanction check (sanction in ('aviso','suspensao_24h','ban')),
  at bigint not null default 0
);

-- — Sementes ————————————————————————————————————————————————————————————————

insert into public.tr_zone (id, name, city, province, lat, lon, kind) values
  ('z-ingombota', 'Ingombota / Baixa', 'Luanda', 'Luanda', -8.8117, 13.2311, 'paragem'),
  ('z-praca-pt', 'Praça da República', 'Luanda', 'Luanda', -8.8233, 13.2172, 'paragem'),
  ('z-mutamba', 'Mutamba', 'Luanda', 'Luanda', -8.8151, 13.2324, 'bairro'),
  ('z-maianga', 'Maianga / Estação', 'Luanda', 'Luanda', -8.8286, 13.2355, 'terminal'),
  ('z-kinaxixi', 'Kinaxixi', 'Luanda', 'Luanda', -8.8246, 13.2386, 'paragem'),
  ('z-rotonda-china', 'Rotunda da China', 'Luanda', 'Luanda', -8.8236, 13.2364, 'paragem'),
  ('z-sambizanga', 'Sambizanga', 'Luanda', 'Luanda', -8.8044, 13.2715, 'bairro'),
  ('z-sao-paulo', 'São Paulo', 'Luanda', 'Luanda', -8.8135, 13.2559, 'bairro'),
  ('z-boavista', 'Boavista', 'Luanda', 'Luanda', -8.8017, 13.2634, 'bairro'),
  ('z-rangel', 'Rangel', 'Luanda', 'Luanda', -8.8218, 13.2700, 'bairro'),
  ('z-kilamba-kiaxe', 'Kilamba Kiaxe', 'Luanda', 'Luanda', -8.8661, 13.2588, 'bairro'),
  ('z-neves-bendinha', 'Neves Bendinha', 'Luanda', 'Luanda', -8.8420, 13.2632, 'bairro'),
  ('z-samba', 'Samba', 'Luanda', 'Luanda', -8.8450, 13.2500, 'bairro'),
  ('z-palanca', 'Palanca', 'Luanda', 'Luanda', -8.8607, 13.2661, 'bairro'),
  ('z-castelo', 'Castelo / Castro', 'Luanda', 'Luanda', -8.8350, 13.2250, 'bairro'),
  ('z-porto', 'Porto de Luanda', 'Luanda', 'Luanda', -8.7913, 13.2720, 'terminal'),
  ('z-ilha', 'Ilha de Luanda', 'Luanda', 'Luanda', -8.7922, 13.2285, 'zona'),
  ('z-miramar', 'Miramar', 'Luanda', 'Luanda', -8.8093, 13.2490, 'bairro'),
  ('z-pedreiros', 'Pedreiros', 'Luanda', 'Luanda', -8.8367, 13.2180, 'bairro'),
  ('z-preto', 'Preto', 'Luanda', 'Luanda', -8.9500, 13.2000, 'bairro'),
  ('z-benfica', 'Benfica', 'Luanda', 'Luanda', -8.9443, 13.1640, 'bairro'),
  ('z-kikolo', 'Kikolo', 'Cacuaco', 'Luanda', -8.7897, 13.3327, 'bairro'),
  ('z-talatona', 'Talatona', 'Luanda', 'Luanda', -8.9167, 13.2333, 'zona'),
  ('z-zona-verde', 'Zona Verde', 'Luanda', 'Luanda', -8.9857, 13.1790, 'bairro'),
  ('z-kilamba', 'Kilamba', 'Luanda', 'Luanda', -8.9985, 13.2664, 'bairro'),
  ('z-belas', 'Belas', 'Luanda', 'Luanda', -8.8833, 13.2000, 'bairro'),
  ('z-camama', 'Camama', 'Luanda', 'Luanda', -8.9402, 13.2647, 'bairro'),
  ('z-morro-bento', 'Morro Bento', 'Luanda', 'Luanda', -8.8964, 13.2011, 'bairro'),
  ('z-songa', 'Songa', 'Luanda', 'Luanda', -8.8450, 13.2579, 'bairro'),
  ('z-cacuaco', 'Cacuaco', 'Cacuaco', 'Luanda', -8.8282, 13.4338, 'bairro'),
  ('z-zango', 'Zango', 'Viana', 'Luanda', -9.0481, 13.4119, 'bairro'),
  ('z-cazenga', 'Cazenga', 'Luanda', 'Luanda', -8.8167, 13.2833, 'bairro'),
  ('z-viana', 'Viana', 'Viana', 'Luanda', -8.9054, 13.3711, 'terminal'),
  ('z-comarca', 'Comarca (Viana)', 'Viana', 'Luanda', -8.8939, 13.3573, 'paragem'),
  ('z-nbj', 'Aeroporto Agostinho Neto (NBJ)', 'Bom Jesus', 'Luanda', -9.0536, 13.5035, 'aeroporto'),
  ('z-lad', 'Aeroporto 4 de Fevereiro', 'Luanda', 'Luanda', -8.8614, 13.2288, 'aeroporto'),
  ('z-benguela', 'Benguela', 'Benguela', 'Benguela', -12.5790, 13.4037, 'terminal'),
  ('z-lobito', 'Lobito', 'Lobito', 'Benguela', -12.3507, 13.5464, 'terminal'),
  ('z-huambo', 'Huambo', 'Huambo', 'Huambo', -12.7772, 15.7347, 'terminal'),
  ('z-caala', 'Caála', 'Caála', 'Huambo', -12.8484, 15.5582, 'zona'),
  ('z-lubango', 'Lubango', 'Lubango', 'Huíla', -14.9196, 13.4898, 'terminal'),
  ('z-malanje', 'Malanje', 'Malanje', 'Malanje', -9.5402, 16.3409, 'terminal'),
  ('z-cabinda', 'Cabinda', 'Cabinda', 'Cabinda', -5.5500, 12.2000, 'terminal'),
  ('z-soyo', 'Soyo', 'Soyo', 'Zaire', -6.1388, 12.3690, 'terminal'),
  ('z-mbanza', 'Mbanza Kongo', 'Mbanza Kongo', 'Zaire', -6.2678, 14.2418, 'terminal'),
  ('z-uis', 'Uíge', 'Uíge', 'Uíge', -7.6087, 15.0613, 'terminal'),
  ('z-namibe', 'Namibe', 'Moçâmedes', 'Namibe', -15.1951, 12.1458, 'terminal'),
  ('z-ondjiva', 'Ondjiva', 'Ondjiva', 'Cunene', -17.0705, 15.7280, 'terminal'),
  ('z-cuito', 'Cuito', 'Cuito', 'Bié', -12.3849, 16.9390, 'terminal'),
  ('z-menongue', 'Menongue', 'Menongue', 'Cuando Cubango', -14.6611, 17.6820, 'terminal'),
  ('z-luena', 'Luena', 'Luena', 'Moxico', -11.7790, 19.9123, 'terminal'),
  ('z-saurimo', 'Saurimo', 'Saurimo', 'Lunda Sul', -9.6589, 20.3981, 'terminal'),
  ('z-sumbe', 'Sumbe', 'Sumbe', 'Cuanza Sul', -11.2019, 13.8397, 'terminal')
on conflict (id) do nothing;

insert into public.tr_vehicle_class (id, label, seats, base_kz, per_km_kz, min_kz, per_seat, blurb, icon, sort) values
  ('economico', 'Económico', 4, 500, 130, 700, false, 'Carro simples, o mais barato. Vai 4 pessoas.', 'Car', 1),
  ('moto', 'Moto', 1, 300, 90, 400, false, 'O mais rápido no trânsito. Capacete extra obrigatório para o passageiro.', 'Bike', 2),
  ('taxi', 'Táxi colectivo', 4, 300, 0, 300, true, 'Lugar ao preço homologado pela ANTT (300 Kz).', 'Taxi', 3),
  ('conforto', 'Conforto', 4, 750, 185, 1000, false, 'Carro mais novo, ar condicionado a funcionar bem.', 'Armchair', 4),
  ('xl', 'Família / XL', 7, 900, 210, 1300, false, '6 a 7 lugares, para família ou grupo.', 'Users', 5),
  ('candongueiro', 'Candongueiro', 12, 300, 0, 300, true, 'Rota fixa, lugar reservado. Mesmo preço da rua.', 'Van', 6),
  ('autocarro', 'Autocarro urbano', 40, 200, 0, 200, true, 'Lugar a 200 Kz, a tarifa homologada para a cidade.', 'Bus', 7),
  ('carga', 'Carga e mudanças', 0, 2500, 250, 4000, false, 'Carrinha ou camião para encomendas e mudanças.', 'Truck', 8)
on conflict (id) do nothing;

insert into public.tr_delivery_class (id, label, example, base_kz, per_km_kz, min_kz, class_id, blurb) values
  ('documento', 'Documento', 'pasta, envelope, chave', 800, 110, 1000, 'moto', 'Vai na mota, na mochila. O mais rápido da cidade.'),
  ('pequeno', 'Pequeno', 'saco de compras, caixa de sapatos', 900, 120, 1200, 'moto', 'Uma caixa que cabe na retaguarda da mota ou no colo.'),
  ('caixa', 'Caixa / fardo', '2 a 4 caixas, electrodoméstico pequeno', 1800, 160, 2500, 'economico', 'Precisa de carro: bagageira ou lugar de trás dobrado.'),
  ('volume', 'Volumoso', 'móvel desmontado, saco de cimento', 3500, 220, 5000, 'carga', 'Carrinha aberta. Pede ajuda de quem carrega: o motorista conduz.'),
  ('moveis', 'Mudança', 'casa pequena, escritório', 9000, 320, 14000, 'carga', 'Camião com duas pessoas para carregar. Combina a hora com o motorista.')
on conflict (id) do nothing;

-- Lançamento: comissão 0% durante os primeiros 60 dias a contar da instalação.
-- O 86400000 tem de ser bigint à nascença: 60 × 86.400.000 em integer rebenta.
insert into public.tr_setting (id, launch_commission_until, updated_at)
values (1, (extract(epoch from now()) * 1000)::bigint + 60 * 86400000::bigint, (extract(epoch from now()) * 1000)::bigint)
on conflict (id) do nothing;

-- — Helpers ————————————————————————————————————————————————————————————————

create or replace function public.tr_round_kz(v numeric)
returns integer
language sql
immutable
as $$
  select greatest(0, (round(v / 5) * 5))::int
$$;

-- Haversine × 1,3 (factor de estrada de Luanda), arredondado a 0,5 km.
-- Serve para tarifa, nunca para navegação.
create or replace function public.tr_distance_km(p_from text, p_to text)
returns numeric
language sql
stable
as $$
  select coalesce((
    select greatest(0.5, round(
      2 * 6371 * asin(sqrt(
        power(sin(radians(b.lat - a.lat) / 2), 2) +
        cos(radians(a.lat)) * cos(radians(b.lat)) * power(sin(radians(b.lon - a.lon) / 2), 2)
      )) * 1.3 * 2
    ) / 2)
    from public.tr_zone a, public.tr_zone b
    where a.id = p_from and b.id = p_to
  ), 0)
$$;

create or replace function public.tr_now_ms()
returns bigint
language sql
stable
as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

-- — Feed público de pedidos ————————————————————————————————————————————————
--
-- Vista de dono postgres (contorna o RLS a propósito): mostra só o anúncio —
-- zona, categoria, preço — nunca os PINs (estão noutra tabela) nem o nome ou
-- telefone do passageiro (ficam na tr_trip, que o motorista só lê depois de
-- aceitar). O `parcel` entra cortado do destinatário e da referência.

create or replace view public.tr_trips_open as
select
  t.id,
  t.code,
  t.kind,
  t.from_zone_id,
  t.to_zone_id,
  t.class_id,
  t.seats,
  t.distance_km,
  t.price_kz,
  t.payment,
  t.created_at,
  jsonb_strip_nulls(coalesce(t.parcel, '{}'::jsonb) - 'toName' - 'toPhone' - 'ref') as parcel
from public.tr_trip t
where t.state = 'searching';

-- — RLS —————————————————————————————————————————————————————————————————————

alter table public.tr_zone enable row level security;
alter table public.tr_vehicle_class enable row level security;
alter table public.tr_delivery_class enable row level security;
alter table public.tr_setting enable row level security;
alter table public.tr_driver enable row level security;
alter table public.tr_driver_doc enable row level security;
alter table public.tr_driver_presence enable row level security;
alter table public.tr_trip enable row level security;
alter table public.tr_trip_secret enable row level security;
alter table public.tr_wallet enable row level security;
alter table public.tr_wallet_tx enable row level security;
alter table public.tr_money_request enable row level security;
alter table public.tr_chat_message enable row level security;
alter table public.tr_report enable row level security;
alter table public.tr_violation enable row level security;

create policy tr_zone_read on public.tr_zone
  for select to authenticated using (true);

create policy tr_class_read on public.tr_vehicle_class
  for select to authenticated using (true);

create policy tr_delivery_class_read on public.tr_delivery_class
  for select to authenticated using (true);

-- Preço e comissão são informação pública da plataforma.
create policy tr_setting_read on public.tr_setting
  for select to authenticated using (true);

create policy tr_setting_admin on public.tr_setting
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Motorista: a praça vê os aprovados; a candidatura vê-a quem a escreveu.
-- Nenhuma escrita directa: candidatura, online/offline e estado passam por RPC.
create policy tr_driver_read on public.tr_driver
  for select to authenticated
  using (
    status = 'approved'
    or account_id = public.current_uid()
    or public.is_admin()
  );

create policy tr_driver_admin_write on public.tr_driver
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy tr_driver_doc_read on public.tr_driver_doc
  for select to authenticated
  using (
    driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    or public.is_admin()
  );

-- Declarações auto-prestadas: o motorista pode marcar o que já entregou.
create policy tr_driver_doc_write on public.tr_driver_doc
  for update to authenticated
  using (
    driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    or public.is_admin()
  )
  with check (
    driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    or public.is_admin()
  );

-- Posição: o próprio, a equipa, e o passageiro da viagem em curso atribuída
-- a este motorista. Mais ninguém segue ninguém.
create policy tr_presence_read on public.tr_driver_presence
  for select to authenticated
  using (
    driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    or public.is_admin()
    or exists (
      select 1 from public.tr_trip t
      where t.driver_id = tr_driver_presence.driver_id
        and t.passenger_id = public.current_uid()
        and t.state in ('accepted','arriving','waiting_pin','ongoing','waiting_drop')
    )
  );

-- Viagem: as duas pontas, sempre. Sem PINs na linha, esta leitura é segura
-- para o realtime (o motorista subscreve a viagem que aceitou).
create policy tr_trip_read on public.tr_trip
  for select to authenticated
  using (
    passenger_id = public.current_uid()
    or driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    or public.is_admin()
  );

-- Só a equipa escreve directamente; participante nenhum. Todas as transições
-- passam por funções que validam quem chama e o estado actual.
create policy tr_trip_admin_write on public.tr_trip
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy tr_trip_secret_read on public.tr_trip_secret
  for select to authenticated
  using (
    exists (
      select 1 from public.tr_trip t
      where t.id = trip_id and t.passenger_id = public.current_uid()
    )
    or public.is_admin()
  );

create policy tr_wallet_read on public.tr_wallet
  for select to authenticated
  using (who = public.current_uid() or public.is_admin());

create policy tr_wallet_tx_read on public.tr_wallet_tx
  for select to authenticated
  using (who = public.current_uid() or public.is_admin());

create policy tr_money_request_read on public.tr_money_request
  for select to authenticated
  using (who = public.current_uid() or public.is_admin());

-- Chat: as duas pontas da viagem.
create policy tr_chat_read on public.tr_chat_message
  for select to authenticated
  using (
    exists (
      select 1 from public.tr_trip t
      where t.id = trip_id
        and (
          t.passenger_id = public.current_uid()
          or t.driver_id in (select id from public.tr_driver where account_id = public.current_uid())
          or public.is_admin()
        )
    )
  );

create policy tr_chat_write on public.tr_chat_message
  for insert to authenticated
  with check (
    sender_role in ('passenger','driver')
    and exists (
      select 1 from public.tr_trip t
      where t.id = trip_id
        and (
          (sender_role = 'passenger' and t.passenger_id = public.current_uid())
          or (sender_role = 'driver' and t.driver_id in (select id from public.tr_driver where account_id = public.current_uid()))
        )
    )
  );

create policy tr_report_read on public.tr_report
  for select to authenticated
  using (by_id = public.current_uid() or public.is_admin());

create policy tr_report_write on public.tr_report
  for insert to authenticated
  with check (by_id = public.current_uid());

create policy tr_report_admin on public.tr_report
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy tr_violation_read on public.tr_violation
  for select to authenticated
  using (who = public.current_uid() or public.is_admin());

create policy tr_violation_admin on public.tr_violation
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- — Grants explícitos ——————————————————————————————————————————————————————
--
-- Nada para o anon, e por tabela: o `grant … on all tables` do rascunho do
-- Kende dava insert/update/delete ao authenticated em tudo. Aqui cada
-- capability é escolhida.

revoke all on public.tr_zone, public.tr_vehicle_class, public.tr_delivery_class,
  public.tr_setting, public.tr_driver, public.tr_driver_doc, public.tr_driver_presence,
  public.tr_trip, public.tr_trip_secret, public.tr_wallet, public.tr_wallet_tx,
  public.tr_money_request, public.tr_chat_message, public.tr_report, public.tr_violation
from anon;

-- Os default privileges do Supabase concedem ALL ao authenticated em tabelas
-- novas. Estas quatro só se escrevem por RPC (SECURITY DEFINER): a escrita
-- directa é revogada para a defesa não depender só do RLS.
revoke insert, update, delete on public.tr_wallet, public.tr_wallet_tx,
  public.tr_trip_secret, public.tr_driver_presence from authenticated;

grant select on public.tr_zone, public.tr_vehicle_class, public.tr_delivery_class, public.tr_setting to authenticated;
grant select, update on public.tr_driver to authenticated;
grant select, update on public.tr_driver_doc to authenticated;
grant select on public.tr_driver_presence to authenticated;
grant select, update on public.tr_trip to authenticated;
grant select on public.tr_trip_secret to authenticated;
grant select on public.tr_wallet to authenticated;
grant select on public.tr_wallet_tx to authenticated;
grant select on public.tr_money_request to authenticated;
grant select, insert on public.tr_chat_message to authenticated;
grant select, insert, update on public.tr_report to authenticated;
grant select, insert, update, delete on public.tr_violation to authenticated;

revoke all on public.tr_trips_open from anon;
grant select on public.tr_trips_open to authenticated;

-- — RPCs ————————————————————————————————————————————————————————————————————

-- Preço. Chama-se antes do pedido e de novo dentro de tr_create_trip: o
-- número que a pessoa viu é o número que a viagem guarda, calculado no
-- servidor com as tabelas de zonas e tarifas.
create or replace function public.tr_quote(
  p_class_id text,
  p_from_zone_id text,
  p_to_zone_id text,
  p_seats integer default 1,
  p_kind text default 'passageiro',
  p_parcel_size text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_setting public.tr_setting;
  v_class public.tr_vehicle_class;
  v_delivery public.tr_delivery_class;
  v_km numeric;
  v_class_id text;
  v_sections integer;
  v_per_seat_price integer;
  v_distance integer;
  v_extra integer := 0;
  v_gross integer;
  v_price integer;
  v_commission integer;
  v_eta integer;
  v_hour integer;
  v_peak numeric;
  v_lines jsonb := '[]'::jsonb;
begin
  select * into v_setting from public.tr_setting where id = 1;
  if not found then
    raise exception 'A configuração da plataforma não existe';
  end if;

  v_km := public.tr_distance_km(p_from_zone_id, p_to_zone_id);
  if v_km <= 0 then
    raise exception 'Zona desconhecida: % ou %', p_from_zone_id, p_to_zone_id;
  end if;

  -- Hora de pico de Luanda, no fuso de Luanda — não no do servidor.
  v_hour := extract(hour from clock_timestamp() at time zone 'Africa/Luanda')::int;
  v_peak := case
    when (v_hour >= 7 and v_hour < 9) or (v_hour >= 17 and v_hour < 20)
      then least(1.1, v_setting.surge_cap)
    else 1
  end;

  if p_kind = 'entrega' then
    if p_parcel_size is null then
      raise exception 'Falta o tamanho da encomenda';
    end if;
    select * into v_delivery from public.tr_delivery_class where id = p_parcel_size;
    if not found then
      raise exception 'Tamanho de encomenda desconhecido: %', p_parcel_size;
    end if;
    v_class_id := v_delivery.class_id;
    v_distance := public.tr_round_kz(v_delivery.per_km_kz * v_km);
    v_lines := v_lines || jsonb_build_object('label', 'Saída (' || lower(v_delivery.label) || ')', 'amountKz', v_delivery.base_kz);
    if v_distance > 0 then
      v_lines := v_lines || jsonb_build_object('label', v_km::text || ' km × ' || v_delivery.per_km_kz || ' Kz', 'amountKz', v_distance);
    end if;
    v_gross := coalesce((select sum((l ->> 'amountKz')::int) from jsonb_array_elements(v_lines) l), 0);
    if v_gross < v_delivery.min_kz then
      v_lines := v_lines || jsonb_build_object('label', 'Complemento até ao mínimo de ' || v_delivery.min_kz || ' Kz', 'amountKz', v_delivery.min_kz - v_gross);
      v_gross := v_delivery.min_kz;
    end if;
    v_lines := v_lines || jsonb_build_object('label', 'Paragem de entrega', 'amountKz', 200);
    if v_setting.booking_fee_kz > 0 then
      v_lines := v_lines || jsonb_build_object('label', 'Taxa de pedido', 'amountKz', v_setting.booking_fee_kz);
    end if;
    v_eta := round(v_km / case when v_km > 12 then 55 else 22 end * 60)::int + 12;
  elsif p_kind = 'passageiro' then
    select * into v_class from public.tr_vehicle_class where id = p_class_id;
    if not found then
      raise exception 'Categoria desconhecida: %', p_class_id;
    end if;
    v_class_id := v_class.id;
    if v_class.per_seat then
      v_sections := greatest(1, ceil(v_km / 12)::int);
      v_per_seat_price := public.tr_round_kz(v_class.base_kz * v_sections);
      v_lines := v_lines || jsonb_build_object(
        'label', case when v_sections > 1
          then v_sections || ' secções × ' || v_class.base_kz || ' Kz por lugar'
          else 'Lugar (' || v_class.label || ')' end,
        'amountKz', v_per_seat_price
      );
      v_gross := public.tr_round_kz(v_per_seat_price * greatest(1, p_seats));
    else
      if p_seats < 1 or p_seats > greatest(1, v_class.seats) then
        raise exception 'Número de lugares inválido para %', v_class.label;
      end if;
      v_distance := public.tr_round_kz(v_class.per_km_kz * v_km);
      v_lines := v_lines || jsonb_build_object('label', 'Tarifa base', 'amountKz', v_class.base_kz);
      if v_distance > 0 then
        v_lines := v_lines || jsonb_build_object('label', v_km::text || ' km × ' || v_class.per_km_kz || ' Kz', 'amountKz', v_distance);
      end if;
      if v_peak > 1 then
        v_extra := public.tr_round_kz((v_class.base_kz + v_distance) * (v_peak - 1));
        v_lines := v_lines || jsonb_build_object('label', 'Hora de pico (teto ' || round((v_peak - 1) * 100)::int || '%)', 'amountKz', v_extra);
      end if;
      v_gross := coalesce((select sum((l ->> 'amountKz')::int) from jsonb_array_elements(v_lines) l), 0);
      if v_gross < v_class.min_kz then
        v_lines := v_lines || jsonb_build_object('label', 'Complemento até ao mínimo de ' || v_class.min_kz || ' Kz', 'amountKz', v_class.min_kz - v_gross);
        v_gross := v_class.min_kz;
      end if;
    end if;
    -- A taxa de pedido não se aplica a lugar a preço homologado: acrescentá-la
    -- mudava a tarifa legal do táxi e do autocarro.
    if v_setting.booking_fee_kz > 0 and not v_class.per_seat then
      v_lines := v_lines || jsonb_build_object('label', 'Taxa de pedido', 'amountKz', v_setting.booking_fee_kz);
      v_gross := v_gross + v_setting.booking_fee_kz;
    end if;
    v_eta := round(v_km / case when v_km > 12 then 55 else 22 end * 60)::int;
  else
    raise exception 'Tipo de viagem desconhecido: %', p_kind;
  end if;

  v_price := public.tr_round_kz(v_gross);
  if public.tr_now_ms() < v_setting.launch_commission_until then
    v_commission := 0;
  else
    v_commission := greatest(0, round(
      (v_price - v_setting.booking_fee_kz) * v_setting.commission_pct / 100
    )::int);
  end if;

  return jsonb_build_object(
    'classId', v_class_id,
    'distanceKm', v_km,
    'seats', case when p_kind = 'entrega' then 0 else greatest(1, p_seats) end,
    'priceKz', v_price,
    'lines', v_lines,
    'commissionKz', v_commission,
    'driverKeepsKz', v_price - v_commission,
    'etaMin', v_eta,
    'fromZoneId', p_from_zone_id,
    'toZoneId', p_to_zone_id
  );
end;
$$;

-- Pedido. O cliente manda zonas e categoria; o preço é calculado aqui dentro.
-- A resposta devolve os códigos uma única vez, ao criador.
create or replace function public.tr_create_trip(
  p_class_id text,
  p_from_zone_id text,
  p_to_zone_id text,
  p_seats integer,
  p_payment text,
  p_kind text default 'passageiro',
  p_for_whom jsonb default null,
  p_parcel jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_setting public.tr_setting;
  v_passenger public.profiles;
  v_quote jsonb;
  v_id text;
  v_code text;
  v_pin text;
  v_drop_pin text;
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_i integer;
  v_try integer;
  v_now bigint;
begin
  v_now := public.tr_now_ms();
  if p_payment not in ('cash','multicaixa') then
    raise exception 'Pagamento por carteira ainda não está activo';
  end if;
  if p_kind not in ('passageiro','entrega') then
    raise exception 'Tipo de viagem desconhecido';
  end if;

  select * into v_passenger from public.profiles where id = public.current_uid();
  if not found then
    raise exception 'Só quem tem conta Elara pode pedir viagem';
  end if;
  select * into v_setting from public.tr_setting where id = 1;

  if p_kind = 'entrega' then
    if p_parcel is null
       or nullif(btrim(p_parcel ->> 'size'), '') is null then
      raise exception 'Falta o tamanho da encomenda';
    end if;
    if nullif(btrim(p_parcel ->> 'what'), '') is null then
      raise exception 'Falta dizer o que vai dentro da encomenda';
    end if;
    if nullif(btrim(p_parcel ->> 'toName'), '') is null
       or nullif(btrim(p_parcel ->> 'toPhone'), '') is null then
      raise exception 'Falta quem recebe a encomenda';
    end if;
  end if;
  if p_kind = 'passageiro' and p_for_whom is not null then
    if nullif(btrim(p_for_whom ->> 'name'), '') is null
       or nullif(btrim(p_for_whom ->> 'phone'), '') is null then
      raise exception 'Falta o nome e o telefone de quem vai viajar';
    end if;
  end if;

  v_quote := public.tr_quote(p_class_id, p_from_zone_id, p_to_zone_id, p_seats, p_kind, p_parcel ->> 'size');

  for v_try in 1..5 loop
    v_code := 'ELT-';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, (random() * 31)::int + 1, 1);
    end loop;
    v_pin := (1000 + (random() * 8999)::int)::text;
    v_drop_pin := case when p_kind = 'entrega' then (1000 + (random() * 8999)::int)::text else null end;
    v_id := 'trp_' || replace(gen_random_uuid()::text, '-', '');
    begin
      insert into public.tr_trip (
        id, code, passenger_id, passenger_name, kind, for_whom, parcel,
        from_zone_id, to_zone_id, class_id, seats, distance_km,
        price_kz, commission_kz, driver_keeps_kz, state, payment, events, created_at
      ) values (
        v_id, v_code, public.current_uid(),
        coalesce(nullif(btrim(v_passenger.full_name), ''), 'Passageiro Elara'),
        p_kind, p_for_whom, p_parcel,
        p_from_zone_id, p_to_zone_id, v_quote ->> 'classId', (v_quote ->> 'seats')::int,
        (v_quote ->> 'distanceKm')::numeric,
        (v_quote ->> 'priceKz')::int, (v_quote ->> 'commissionKz')::int, (v_quote ->> 'driverKeepsKz')::int,
        'searching', p_payment,
        jsonb_build_array(jsonb_build_object('at', v_now, 'state', 'searching')),
        v_now
      );
      exit;
    exception when unique_violation then
      if v_try = 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.tr_trip_secret (trip_id, pin, drop_pin) values (v_id, v_pin, v_drop_pin);

  return jsonb_build_object('id', v_id, 'code', v_code, 'pin', v_pin, 'dropPin', v_drop_pin, 'quote', v_quote);
end;
$$;

-- Aceitar. Um único UPDATE decide: `state = 'searching' and driver_id is null`
-- é a fechadura — dois motoristas no mesmo milissegundo, um passa.
create or replace function public.tr_claim_trip(p_trip_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver public.tr_driver;
  v_trip public.tr_trip;
  v_now bigint;
begin
  select * into v_driver from public.tr_driver where account_id = public.current_uid();
  if not found then
    raise exception 'Não tem candidatura de motorista';
  end if;
  if v_driver.status <> 'approved' then
    raise exception 'A sua candidatura ainda não foi aprovada';
  end if;
  if not v_driver.online then
    raise exception 'Está offline — active o modo online primeiro';
  end if;

  v_now := public.tr_now_ms();
  update public.tr_trip t
  set driver_id = v_driver.id,
      driver_name = v_driver.public_name,
      plate = v_driver.plate,
      car_model = v_driver.model || ' ' || v_driver.year,
      trial = v_driver.trial_trips_left > 0,
      state = 'accepted',
      events = t.events || jsonb_build_object('at', v_now, 'state', 'accepted', 'note', 'Motorista ' || v_driver.public_name || ' aceitou')
  where t.id = p_trip_id
    and t.state = 'searching'
    and t.driver_id is null
    and t.class_id = v_driver.class_id
  returning t.* into v_trip;

  if not found then
    raise exception 'Este pedido já não está disponível';
  end if;

  return jsonb_build_object('ok', true, 'trip', to_jsonb(v_trip));
end;
$$;

-- Avanços simples do motorista: a caminho → no local → (PIN) → em viagem →
-- no destino (entrega). Cada salto só é válido a partir do estado anterior.
create or replace function public.tr_advance(p_trip_id text, p_to text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state text;
begin
  update public.tr_trip t
  set state = p_to,
      events = t.events || jsonb_build_object('at', public.tr_now_ms(), 'state', p_to)
  where t.id = p_trip_id
    and t.driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    and (
      (t.state = 'accepted' and p_to = 'arriving')
      or (t.state = 'arriving' and p_to = 'waiting_pin')
      or (t.state = 'ongoing' and p_to = 'waiting_drop')
    )
  returning t.state into v_state;

  if not found then
    raise exception 'Não é possível avançar para %', p_to;
  end if;
  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- O PIN é a prova de que a viagem começou. O motorista nunca lê o número:
-- escreve o que o passageiro lhe disse e o servidor compara.
create or replace function public.tr_verify_pin(p_trip_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_secret public.tr_trip_secret;
  v_state text;
begin
  select * into v_trip from public.tr_trip where id = p_trip_id;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  if v_trip.driver_id not in (select id from public.tr_driver where account_id = public.current_uid()) then
    raise exception 'Só o motorista desta viagem confirma o código';
  end if;
  if v_trip.state not in ('accepted','arriving','waiting_pin') then
    raise exception 'A viagem já não está à espera do código';
  end if;
  select * into v_secret from public.tr_trip_secret where trip_id = p_trip_id;
  if btrim(coalesce(p_pin, '')) <> v_secret.pin then
    raise exception 'Este código não corresponde ao pedido. Confirma com %',
      case when v_trip.kind = 'entrega' then 'quem entrega a encomenda' else 'o passageiro' end;
  end if;

  update public.tr_trip t
  set state = 'ongoing',
      events = t.events || jsonb_build_object('at', public.tr_now_ms(), 'state', 'ongoing', 'note', 'Código confirmado — viagem iniciada')
  where t.id = p_trip_id
  returning t.state into v_state;

  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- Liquidação: carteira, razão e contadores do motorista. Idempotente e com
-- lock de linha — chamada pelo fim da viagem, seja por PIN de entrega ou por
-- fecho do motorista.
create or replace function public.tr_settle(p_trip_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_driver public.tr_driver;
  v_balance integer;
  v_now bigint;
begin
  select * into v_trip from public.tr_trip where id = p_trip_id for update;
  if v_trip.settled_at is not null then
    return;
  end if;
  v_now := public.tr_now_ms();
  update public.tr_trip set settled_at = v_now where id = p_trip_id;

  if v_trip.driver_id is null then
    return;
  end if;
  select * into v_driver from public.tr_driver where id = v_trip.driver_id;

  insert into public.tr_wallet (who, role, balance_kz, updated_at)
  values (v_driver.account_id, 'driver', 0, v_now)
  on conflict (who) do nothing;

  update public.tr_wallet
  set balance_kz = balance_kz + v_trip.driver_keeps_kz, updated_at = v_now
  where who = v_driver.account_id
  returning balance_kz into v_balance;

  -- O motorista nunca teve o bruto na mão: a carteira regista só o que ele
  -- fica a receber. A comissão é receita da plataforma, não débito dele.
  insert into public.tr_wallet_tx (who, kind, amount_kz, balance_after_kz, trip_id, note, at)
  values (
    v_driver.account_id, 'earning', v_trip.driver_keeps_kz, v_balance, v_trip.id,
    case when v_trip.kind = 'entrega' then 'Entrega ' else 'Viagem ' end || v_trip.code,
    v_now
  );

  update public.tr_driver
  set trips = trips + 1,
      trial_trips_left = greatest(0, trial_trips_left - case when v_trip.trial then 1 else 0 end)
  where id = v_driver.id;
end;
$$;

-- Fim de corrida de passageiro: PIN já confirmado, o motorista fecha.
create or replace function public.tr_finish_trip(p_trip_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state text;
begin
  update public.tr_trip t
  set state = 'ended',
      events = t.events || jsonb_build_object('at', public.tr_now_ms(), 'state', 'ended')
  where t.id = p_trip_id
    and t.state = 'ongoing'
    and t.kind = 'passageiro'
    and t.driver_id in (select id from public.tr_driver where account_id = public.current_uid())
  returning t.state into v_state;

  if not found then
    raise exception 'Só se fecha uma corrida de passageiro que esteja em viagem';
  end if;
  perform public.tr_settle(p_trip_id);
  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- Prova de entrega: quem recebe lê o segundo código ao motorista.
create or replace function public.tr_verify_drop_pin(p_trip_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_secret public.tr_trip_secret;
  v_state text;
begin
  select * into v_trip from public.tr_trip where id = p_trip_id;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  if v_trip.kind <> 'entrega' then
    raise exception 'Este código é só de entregas';
  end if;
  if v_trip.driver_id not in (select id from public.tr_driver where account_id = public.current_uid()) then
    raise exception 'Só o motorista desta entrega confirma o código';
  end if;
  if v_trip.state not in ('waiting_drop','ongoing') then
    raise exception 'Esta entrega já não está à espera de código';
  end if;
  select * into v_secret from public.tr_trip_secret where trip_id = p_trip_id;
  if v_secret.drop_pin is null or btrim(coalesce(p_pin, '')) <> v_secret.drop_pin then
    raise exception 'O código não bate certo. Pede a quem recebeu para ler de novo';
  end if;

  update public.tr_trip t
  set state = 'ended',
      events = t.events || jsonb_build_object('at', public.tr_now_ms(), 'state', 'ended', 'note', 'Entregue — código confirmado por quem recebeu')
  where t.id = p_trip_id
  returning t.state into v_state;

  perform public.tr_settle(p_trip_id);
  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- Avaliação: quem chamou identifica o papel; as duas pontas têm de avaliar
-- antes de a viagem ficar 'rated'.
create or replace function public.tr_rate(p_trip_id text, p_score integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_state text;
begin
  if p_score not between 1 and 5 then
    raise exception 'A avaliação é de 1 a 5';
  end if;
  select * into v_trip from public.tr_trip where id = p_trip_id;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  if v_trip.state not in ('ended','rated') then
    raise exception 'Só se avalia uma viagem terminada';
  end if;

  if v_trip.passenger_id = public.current_uid() then
    if v_trip.passenger_rating is not null then
      raise exception 'Já avaliou esta viagem';
    end if;
    update public.tr_trip t
    set passenger_rating = p_score,
        state = case when t.driver_rating is not null then 'rated' else t.state end,
        events = t.events || jsonb_build_object('at', public.tr_now_ms(), 'state', 'avaliada pelo passageiro')
    where t.id = p_trip_id
    returning t.state into v_state;

    if v_trip.driver_id is not null then
      update public.tr_driver
      set rating = round(((rating * rating_count) + p_score) / (rating_count + 1), 2),
          rating_count = rating_count + 1
      where id = v_trip.driver_id;
    end if;
  elsif v_trip.driver_id in (select id from public.tr_driver where account_id = public.current_uid()) then
    if v_trip.driver_rating is not null then
      raise exception 'Já avaliou esta viagem';
    end if;
    update public.tr_trip t
    set driver_rating = p_score,
        state = case when t.passenger_rating is not null then 'rated' else t.state end,
        events = t.events || jsonb_build_object('at', public.tr_now_ms(), 'state', 'avaliada pelo motorista')
    where t.id = p_trip_id
    returning t.state into v_state;
  else
    raise exception 'Só as duas pontas da viagem a avaliam';
  end if;

  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- Cancelar. A taxa fica registada no historial, não cobrada: o saldo não se
-- mexe sozinho e cobrar a alguém exige a equipa ver o caso.
create or replace function public.tr_cancel_trip(p_trip_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_setting public.tr_setting;
  v_by text;
  v_note text;
begin
  select * into v_setting from public.tr_setting where id = 1;
  select * into v_trip from public.tr_trip where id = p_trip_id for update;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  if v_trip.state in ('ended','rated','cancelled') then
    raise exception 'Esta viagem já terminou';
  end if;

  if v_trip.passenger_id = public.current_uid()
     and v_trip.state in ('searching','accepted','arriving') then
    v_by := 'passenger';
    if v_trip.state = 'searching' then
      v_note := 'Cancelado antes de alguém aceitar';
    else
      v_note := 'Cancelamento depois da aceitação (taxa de ' || v_setting.cancel_fee_kz || ' Kz registada)';
    end if;
  elsif v_trip.driver_id in (select id from public.tr_driver where account_id = public.current_uid())
     and v_trip.state in ('accepted','arriving','waiting_pin') then
    v_by := 'driver';
    v_note := 'Cancelado pelo motorista';
  elsif public.is_admin() then
    v_by := 'admin';
    v_note := 'Cancelado pela equipa';
  else
    raise exception 'Só quem está nesta viagem a cancela';
  end if;

  update public.tr_trip t
  set state = 'cancelled',
      cancelled_by = v_by,
      events = t.events || jsonb_build_object('at', public.tr_now_ms(), 'state', 'cancelled', 'note', v_note)
  where t.id = p_trip_id;

  return jsonb_build_object('ok', true, 'cancelledBy', v_by);
end;
$$;

-- Candidatura de motorista. Uma por conta; o estado nasce 'pending' e só a
-- equipa o muda (política tr_driver_admin_write).
create or replace function public.tr_apply_driver(
  p_name text,
  p_plate text,
  p_model text,
  p_year integer,
  p_class_id text,
  p_home_zone_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := public.current_uid();
  v_setting public.tr_setting;
  v_existing public.tr_driver;
  v_class public.tr_vehicle_class;
  v_zone public.tr_zone;
  v_public text;
  v_words text[];
  v_id text;
begin
  if v_uid = '' then
    raise exception 'Entre na sua conta Elara primeiro';
  end if;
  select * into v_setting from public.tr_setting where id = 1;
  select * into v_existing from public.tr_driver where account_id = v_uid;
  if found then
    raise exception 'Já tem candidatura de motorista (%)', v_existing.status;
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Falta o seu nome';
  end if;
  if char_length(btrim(p_plate)) < 4 then
    raise exception 'A matrícula parece incompleta';
  end if;
  if nullif(btrim(p_model), '') is null then
    raise exception 'Falta o modelo do carro';
  end if;
  if p_year is null or p_year not between 1980 and 2100 then
    raise exception 'O ano do carro não faz sentido';
  end if;
  select * into v_class from public.tr_vehicle_class where id = p_class_id;
  if not found then
    raise exception 'Categoria desconhecida';
  end if;
  select * into v_zone from public.tr_zone where id = p_home_zone_id;
  if not found then
    raise exception 'Zona desconhecida';
  end if;

  -- «João Silva» passa a «João S.» para o passageiro: nome verdadeiro para a
  -- equipa, apelido de trabalho para a rua.
  v_words := string_to_array(btrim(p_name), ' ');
  v_public := v_words[1] || case
    when array_length(v_words, 1) > 1 then ' ' || left(v_words[array_length(v_words, 1)], 1) || '.'
    else ''
  end;

  v_id := 'drv_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.tr_driver (
    id, account_id, name, public_name, plate, model, year, class_id,
    province, home_zone_id, status, trial_trips_left, created_at
  ) values (
    v_id, v_uid, btrim(p_name), v_public, upper(btrim(p_plate)), btrim(p_model), p_year, p_class_id,
    v_zone.province, p_home_zone_id, 'pending', v_setting.trial_trip_limit, public.tr_now_ms()
  );
  insert into public.tr_driver_doc (driver_id, updated_at) values (v_id, public.tr_now_ms());

  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$$;

-- Modo online. Ao desligar, a posição publicada apaga-se: um carro parado
-- não pode continuar a aparecer no mapa de ninguém.
create or replace function public.tr_set_online(p_online boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  update public.tr_driver d
  set online = p_online
  where d.account_id = public.current_uid()
  returning d.status into v_status;

  if not found then
    raise exception 'Não tem candidatura de motorista';
  end if;
  if v_status <> 'approved' then
    raise exception 'A sua candidatura ainda não foi aprovada';
  end if;
  if not p_online then
    delete from public.tr_driver_presence
    where driver_id in (select id from public.tr_driver where account_id = public.current_uid());
  end if;
  return jsonb_build_object('ok', true, 'online', p_online);
end;
$$;

-- Publicar posição. Limites de Angola recusados à nascença: coordenada fora
-- do país é teleporte, e teleporte é fraude de GPS.
create or replace function public.tr_set_presence(p_lat double precision, p_lon double precision)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver public.tr_driver;
begin
  select * into v_driver from public.tr_driver where account_id = public.current_uid();
  if not found then
    raise exception 'Não tem candidatura de motorista';
  end if;
  if v_driver.status <> 'approved' then
    raise exception 'A sua candidatura ainda não foi aprovada';
  end if;
  if not v_driver.online then
    raise exception 'Está offline — active o modo online primeiro';
  end if;
  if p_lat is null or p_lon is null
     or p_lat not between -18.1 and -3.9
     or p_lon not between 11.0 and 24.2 then
    raise exception 'Posição fora de Angola — o GPS parece estar a enganar';
  end if;

  insert into public.tr_driver_presence (driver_id, lat, lon, updated_at)
  values (v_driver.id, p_lat, p_lon, public.tr_now_ms())
  on conflict (driver_id) do update
  set lat = excluded.lat, lon = excluded.lon, updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true);
end;
$$;

-- Pedido de recarga ou levantamento.
create or replace function public.tr_request_money(
  p_direction text,
  p_amount_kz integer,
  p_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := public.current_uid();
  v_role text;
  v_balance integer;
  v_id text;
begin
  if v_uid = '' then
    raise exception 'Entre na sua conta Elara primeiro';
  end if;
  if p_direction not in ('in','out') then
    raise exception 'Direcção desconhecida';
  end if;
  if p_amount_kz is null or p_amount_kz <= 0 or p_amount_kz > 10000000 then
    raise exception 'Valor inválido';
  end if;
  if nullif(btrim(coalesce(p_method, '')), '') is null then
    raise exception 'Diga como pretende pagar ou receber';
  end if;

  if exists (select 1 from public.tr_driver where account_id = v_uid) then
    v_role := 'driver';
  else
    v_role := 'passenger';
  end if;

  if p_direction = 'out' then
    select balance_kz into v_balance from public.tr_wallet where who = v_uid;
    if coalesce(v_balance, 0) < p_amount_kz then
      raise exception 'Saldo insuficiente para esse levantamento';
    end if;
  end if;

  v_id := 'mreq_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.tr_money_request (id, who, role, direction, amount_kz, method, state, at)
  values (v_id, v_uid, v_role, p_direction, p_amount_kz, btrim(p_method), 'pending', public.tr_now_ms());

  return jsonb_build_object('id', v_id, 'state', 'pending');
end;
$$;

-- Resolver pedido de dinheiro. O único caminho por onde um saldo muda.
create or replace function public.tr_resolve_money_request(
  p_request_id text,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.tr_money_request;
  v_balance integer;
begin
  if not public.is_admin() then
    raise exception 'Só a equipa resolve pedidos de dinheiro';
  end if;
  select * into v_req from public.tr_money_request where id = p_request_id for update;
  if not found then
    raise exception 'Pedido desconhecido';
  end if;
  if v_req.state <> 'pending' then
    raise exception 'Este pedido já foi resolvido';
  end if;

  if p_approve then
    insert into public.tr_wallet (who, role, balance_kz, updated_at)
    values (v_req.who, v_req.role, 0, public.tr_now_ms())
    on conflict (who) do nothing;

    if v_req.direction = 'in' then
      update public.tr_wallet
      set balance_kz = balance_kz + v_req.amount_kz, updated_at = public.tr_now_ms()
      where who = v_req.who
      returning balance_kz into v_balance;
      insert into public.tr_wallet_tx (who, kind, amount_kz, balance_after_kz, note, at)
      values (v_req.who, 'topup', v_req.amount_kz, v_balance, 'Recarga confirmada — ' || v_req.method, public.tr_now_ms());
    else
      select balance_kz into v_balance from public.tr_wallet where who = v_req.who;
      if coalesce(v_balance, 0) < v_req.amount_kz then
        raise exception 'O saldo já não cobre este levantamento';
      end if;
      update public.tr_wallet
      set balance_kz = balance_kz - v_req.amount_kz, updated_at = public.tr_now_ms()
      where who = v_req.who
      returning balance_kz into v_balance;
      insert into public.tr_wallet_tx (who, kind, amount_kz, balance_after_kz, note, at)
      values (v_req.who, 'payout', -v_req.amount_kz, v_balance, 'Levantamento confirmado — ' || v_req.method, public.tr_now_ms());
    end if;
    update public.tr_money_request set state = 'confirmed', resolved_at = public.tr_now_ms() where id = p_request_id;
  else
    update public.tr_money_request
    set state = 'rejected',
        reason = coalesce(nullif(btrim(p_reason), ''), 'Sem razão indicada'),
        resolved_at = public.tr_now_ms()
    where id = p_request_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Moderar o chat da viagem: reutiliza o filtro do Elara (telefones, ligações,
-- desvio para fora da app) com a nota adaptada a encontros.
create or replace function public.tr_moderate_trip_chat()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clean text;
  v_reasons text[];
begin
  if public.current_session_role() <> 'authenticated' or public.is_admin() then
    return new;
  end if;
  select clean, reasons into v_clean, v_reasons
  from public.moderate_chat_text(new.text);
  -- A nota automática do Elara fala de compras; aqui fala-se de encontros.
  v_clean := replace(v_clean, 'no chat da Elara', 'no chat da Trajectoria');
  v_clean := replace(v_clean, 'a compra fica registada', 'a viagem fica registada');
  v_clean := replace(v_clean, 'Combine a entrega e o pagamento por aqui.', 'Combine o encontro e o pagamento por aqui.');
  new.text := v_clean;
  new.blocked := case when coalesce(array_length(v_reasons, 1), 0) > 0 then array_to_string(v_reasons, ',') else null end;
  return new;
end;
$$;

create trigger tr_moderate_trip_chat
before insert on public.tr_chat_message
for each row execute function public.tr_moderate_trip_chat();

-- Execução: nada disto se chama sem sessão.
revoke execute on function public.tr_create_trip(text,text,text,integer,text,text,jsonb,jsonb) from public, anon;
revoke execute on function public.tr_claim_trip(text) from public, anon;
revoke execute on function public.tr_advance(text,text) from public, anon;
revoke execute on function public.tr_verify_pin(text,text) from public, anon;
revoke execute on function public.tr_verify_drop_pin(text,text) from public, anon;
revoke execute on function public.tr_finish_trip(text) from public, anon;
revoke execute on function public.tr_rate(text,integer) from public, anon;
revoke execute on function public.tr_cancel_trip(text) from public, anon;
revoke execute on function public.tr_apply_driver(text,text,text,integer,text,text) from public, anon;
revoke execute on function public.tr_set_online(boolean) from public, anon;
revoke execute on function public.tr_set_presence(double precision,double precision) from public, anon;
revoke execute on function public.tr_request_money(text,integer,text) from public, anon;
revoke execute on function public.tr_resolve_money_request(text,boolean,text) from public, anon;
-- Interna: ninguém a chama da API, nem o authenticated.
revoke execute on function public.tr_settle(text) from public, anon, authenticated;

grant execute on function public.tr_quote(text,text,text,integer,text,text) to authenticated;
grant execute on function public.tr_create_trip(text,text,text,integer,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.tr_claim_trip(text) to authenticated;
grant execute on function public.tr_advance(text,text) to authenticated;
grant execute on function public.tr_verify_pin(text,text) to authenticated;
grant execute on function public.tr_verify_drop_pin(text,text) to authenticated;
grant execute on function public.tr_finish_trip(text) to authenticated;
grant execute on function public.tr_rate(text,integer) to authenticated;
grant execute on function public.tr_cancel_trip(text) to authenticated;
grant execute on function public.tr_apply_driver(text,text,text,integer,text,text) to authenticated;
grant execute on function public.tr_set_online(boolean) to authenticated;
grant execute on function public.tr_set_presence(double precision,double precision) to authenticated;
grant execute on function public.tr_request_money(text,integer,text) to authenticated;
grant execute on function public.tr_resolve_money_request(text,boolean,text) to authenticated;

-- — Realtime ——————————————————————————————————————————————————————————————
-- O passageiro vê o seu pedido encontrar motorista; o motorista vê os pedidos
-- da praça; a carteira mexe no ecrã de quem a possui.

do $$
begin
  alter publication supabase_realtime add table public.tr_trip;
exception when duplicate_object then null; end
$$;

do $$
begin
  alter publication supabase_realtime add table public.tr_driver_presence;
exception when duplicate_object then null; end
$$;

do $$
begin
  alter publication supabase_realtime add table public.tr_chat_message;
exception when duplicate_object then null; end
$$;

do $$
begin
  alter publication supabase_realtime add table public.tr_money_request;
exception when duplicate_object then null; end
$$;

do $$
begin
  alter publication supabase_realtime add table public.tr_wallet;
exception when duplicate_object then null; end
$$;

do $$
begin
  alter publication supabase_realtime add table public.tr_wallet_tx;
exception when duplicate_object then null; end
$$;
