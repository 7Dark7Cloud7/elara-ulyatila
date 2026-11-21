-- Elara Trajectoria — 0004 (corridas com lugares partilhados)
--
-- Como meia Luanda anda: a Hiace não espera por um cliente inteiro, enche
-- lugar a lugar e sai. Até agora a app só sabia fechar uma carrinha inteira
-- (`tr_trip` = um passageiro, um motorista, o carro todo). Este ficheiro acrescenta
-- a outra metade da rua: comprar UM lugar (ou dois) numa corrida que já está a
-- encher, e marcar no mapa o sítio exacto onde se quer ser apanhado.
--
-- O modelo, e o porquê de cada escolha:
--
-- 1. `tr_ride` é a corrida do VEÍCULO, anunciada por um motorista aprovado:
--    rota, hora de saída, lugares livres e preço POR LUGAR. Não é uma reserva
--    de carro nem um transporte fictício — só existe porque um motorista real
--    a abriu, e fecha quando ele parte.
--
-- 2. Quem entra compra lugares NUMA corrida já aberta (`tr_join_ride`). Cada
--    compra cria um `tr_trip` normal, já com o motorista da corrida atribuído,
--    PIN próprio, preço próprio, chat próprio e liquidação própria. Assim nada
--    de 0001 se reinventa: a viagem partilhada é a máquina de estados que já
--    existe, vista por cima como um carro com mais do que um cliente.
--
-- 3. O preço é CONGELADO quando a corrida é aberta e vem do `tr_quote` (0001).
--    O motorista NÃO escreve preços: se pudesse, duas pessoas no mesmo carro
--    pagavam valores diferentes e ninguém conseguia explicar porquê. O preço do
--    lugar é o da tarifa homologada para esse traço; a hora de pico que a
--    corrida apanhou à abertura é a que se mantém até ao fim.
--
-- 4. A lotação é atómica: `seats_taken + N <= capacity` dentro do mesmo UPDATE
--    que bloqueia a linha. Uma Hiace de 15 lugares nunca vende o décimo
--    sexto. Não há "quase cheio" nem contadores bonitos — há o número que
--    resultou das compras reais.
--
-- 5. `pickup` é o ponto marcado no mapa (lat/lon + nota). As zonas de 0001 são
--    centróides: servem para o preço e para a rota, mas a pessoa é apanhada à
--    porta de casa, não no meio do bairro.
--
-- Dinheiro: nada de saldos novos. Cada lugar líquido por `tr_settle` como
-- qualquer viagem; a comissão segue a mesma regra da 0001 (0 até ao fim do
-- período de lançamento).

-- — A corrida ————————————————————————————————————————————————————————————————

create table if not exists public.tr_ride (
  id text primary key default ('rid_' || replace(gen_random_uuid()::text, '-', '')),
  driver_id text not null references public.tr_driver (id) on delete cascade,
  class_id text not null references public.tr_vehicle_class (id),
  from_zone_id text not null references public.tr_zone (id),
  to_zone_id text not null references public.tr_zone (id),
  -- Capacidade é sempre a da categoria: quem abre a corrida não escolhe
  -- quantos lugares tem o carro que disse ter na candidatura.
  capacity integer not null constraint tr_ride_capacity check (capacity between 1 and 60),
  seats_taken integer not null default 0 constraint tr_ride_seats check (seats_taken >= 0),
  -- Preço do LUGAR, calculado por tr_quote à abertura e nunca mais alterado.
  seat_price_kz integer not null constraint tr_ride_price check (seat_price_kz > 0),
  distance_km numeric(6, 2) not null default 0,
  eta_min integer not null default 0,
  lines jsonb not null default '[]'::jsonb,
  -- Quando sai. A app mostra a hora; não promete que espera ninguém.
  depart_at bigint not null,
  note text not null default '' constraint tr_ride_note check (char_length(note) <= 140),
  state text not null default 'open'
    constraint tr_ride_state check (state in ('open','departed','closed','cancelled')),
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  constraint tr_ride_seats_fit check (seats_taken <= capacity),
  constraint tr_ride_two_stops check (from_zone_id <> to_zone_id)
);

create index if not exists tr_ride_board_idx on public.tr_ride (state, from_zone_id, depart_at);
create index if not exists tr_ride_driver_idx on public.tr_ride (driver_id, state);

-- Uma corrida por motorista aberto: ninguém pode estar em dois carros ao
-- mesmo tempo, e dois anúncios iguais do mesmo carro são poluição no quadro.
create unique index if not exists tr_ride_one_open_per_driver
  on public.tr_ride (driver_id)
  where state in ('open','departed');

-- — O lugar e o ponto de embarque —————————————————————————————————————————————

alter table public.tr_trip
  add column if not exists ride_id text references public.tr_ride (id);

-- { "lat": -8.83, "lon": 13.23, "note": "portão azul, ao lado da farmácia" }
alter table public.tr_trip
  add column if not exists pickup jsonb;

create index if not exists tr_trip_ride_idx on public.tr_trip (ride_id) where ride_id is not null;

-- A praça do motorista (0001) é uma vista, e uma vista mostra as colunas que
-- foram declaradas: sem isto o carro aprovado veria a zona e nunca o ponto que
-- a pessoa marcou. Só entra o embarque — o PIN, o nome e o telefone continuam
-- fora desta vista, como sempre estiveram.
--
-- O `pickup` entra por último: o Postgres não aceita uma vista nova com uma
-- coluna metida no meio das que já lá estavam (daria «cannot change name of
-- view column»), e a ordem aqui é a ordem das colunas da vista.
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
  jsonb_strip_nulls(coalesce(t.parcel, '{}'::jsonb) - 'toName' - 'toPhone' - 'ref') as parcel,
  t.pickup
from public.tr_trip t
where t.state = 'searching';

revoke all on public.tr_trips_open from anon;
grant select on public.tr_trips_open to authenticated;

-- A distância «a 800 m de si» usa o tr_haversine_km que já existe (0002): linha
-- recta, em quilómetros verdadeiros. O preço continua a vir do tr_distance_km
-- (0001), que é o único com o factor de estrada de Luanda. Dois números, dois
-- empregos — e um só sítio onde cada um é calculado.

-- — O ponto de embarque, uma só vez ———————————————————————————————————————————
--
-- `pickup` chega do mapa (lat/lon + nota livre). É texto de origem pública, por
-- isso passa por aqui: só entra um par de coordenadas verdadeiro dentro de
-- Angola, com a nota cortada. Todo o resto vira NULL — e a pessoa é apanhada na
-- zona, que é sempre melhor do que um motorista conduzir atrás de uma
-- coordenada inventada.
create or replace function public.tr_clean_pickup(p_pickup jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  if jsonb_typeof(p_pickup) <> 'object' then
    return null;
  end if;
  -- O regex vem antes do cast: um texto malformado faria o cast rebentar, e
  -- aqui um lixo do cliente não é razão para deitar abaixo uma compra.
  if (p_pickup ->> 'lat') ~ '^-?[0-9]{1,2}(\.[0-9]{1,6})$'
     and (p_pickup ->> 'lon') ~ '^-?[0-9]{1,2}(\.[0-9]{1,6})$'
     and (p_pickup ->> 'lat')::numeric between -18.5 and -3.0
     and (p_pickup ->> 'lon')::numeric between 8.0 and 25.5
  then
    return jsonb_build_object(
      'lat', (p_pickup ->> 'lat')::numeric(9, 6),
      'lon', (p_pickup ->> 'lon')::numeric(9, 6),
      'note', left(btrim(coalesce(p_pickup ->> 'note', '')), 90)
    );
  end if;
  return null;
end;
$$;

-- — RLS ———————————————————————————————————————————————————————————————————————

alter table public.tr_ride enable row level security;

-- O quadro de saídas é público para quem tem conta: ver para onde vai uma
-- carrinha e quantos lugares faltam é o coração desta funcionalidade. O dono
-- vê a sua em qualquer estado; a equipa vê tudo.
drop policy if exists tr_ride_read on public.tr_ride;
create policy tr_ride_read on public.tr_ride
  for select to authenticated
  using (
    state in ('open','departed')
    or driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    or public.is_admin()
  );

-- Nenhuma escrita directa: abrir, entrar, partir e fechar passam todos por
-- RPC, porque é aí que a lotação e o preço se defendem.
drop policy if exists tr_ride_write on public.tr_ride;
create policy tr_ride_write on public.tr_ride
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.tr_ride from anon, public;
grant select on public.tr_ride to authenticated;

-- — 1. Abrir corrida (motorista) ———————————————————————————————————————————————

create or replace function public.tr_open_ride(
  p_from_zone_id text,
  p_to_zone_id text,
  p_depart_at bigint,
  p_note text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver public.tr_driver;
  v_class public.tr_vehicle_class;
  v_quote jsonb;
  v_now bigint := public.tr_now_ms();
  v_ride public.tr_ride;
begin
  select * into v_driver from public.tr_driver
    where account_id = public.current_uid() and status = 'approved';
  if not found then
    raise exception 'Só um motorista aprovado pode anunciar uma corrida';
  end if;

  select * into v_class from public.tr_vehicle_class where id = v_driver.class_id;
  if not found then
    raise exception 'A sua categoria de veículo não existe';
  end if;
  -- Faz sentido só onde a rua conta por lugar. Um económico ou um XL fecha-se
  -- inteiro; anunciar "lugares" nele seria fingir partilha onde não há.
  if not v_class.per_seat then
    raise exception 'Lugares partilhados só existem nas categorias por lugar (táxi, Hiace, candongueiro, autocarro)';
  end if;

  if p_from_zone_id = p_to_zone_id then
    raise exception 'A partida e o destino têm de ser sítios diferentes';
  end if;
  if p_depart_at < v_now - 600000 or p_depart_at > v_now + 86400000 then
    raise exception 'A hora de saída tem de ser nas próximas 24 horas';
  end if;
  if exists (
    select 1 from public.tr_ride
    where driver_id = v_driver.id and state in ('open','departed')
  ) then
    raise exception 'Já tem uma corrida aberta. Feche-a antes de anunciar outra.';
  end if;
  -- O índice único acima fecha corrida-vs-corrida; falta corrida-vs-viagem. Um
  -- motorista a meio de um serviço privado não pode anunciar uma carrinha a sair
  -- daqui a quinze minutos: o carro é um só.
  if exists (
    select 1 from public.tr_trip
    where driver_id = v_driver.id
      and state in ('accepted','arriving','waiting_pin','ongoing','waiting_drop')
  ) then
    raise exception 'Termine a viagem em curso antes de anunciar uma corrida.';
  end if;

  -- O preço da tarifa, uma vez, no momento em que a corrida nasce.
  v_quote := public.tr_quote(v_class.id, p_from_zone_id, p_to_zone_id, 1, 'passageiro', null);

  insert into public.tr_ride (
    driver_id, class_id, from_zone_id, to_zone_id, capacity, seat_price_kz,
    distance_km, eta_min, lines, depart_at, note, created_at, updated_at
  ) values (
    v_driver.id, v_class.id, p_from_zone_id, p_to_zone_id, v_class.seats,
    (v_quote ->> 'priceKz')::int,
    (v_quote ->> 'distanceKm')::numeric,
    (v_quote ->> 'etaMin')::int,
    v_quote -> 'lines',
    p_depart_at, left(btrim(coalesce(p_note, '')), 140),
    v_now, v_now
  ) returning * into v_ride;

  return jsonb_build_object(
    'id', v_ride.id,
    'seat_price_kz', v_ride.seat_price_kz,
    'capacity', v_ride.capacity,
    'depart_at', v_ride.depart_at,
    'class_id', v_ride.class_id
  );
end;
$$;

-- — 2. Comprar lugares (passageiro) ————————————————————————————————————————————

create or replace function public.tr_join_ride(
  p_ride_id text,
  p_seats integer,
  p_payment text,
  p_pickup jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := public.current_uid();
  v_passenger public.profiles;
  v_setting public.tr_setting;
  v_ride public.tr_ride;
  v_driver public.tr_driver;
  v_now bigint := public.tr_now_ms();
  v_seats integer;
  v_price integer;
  v_commission integer;
  v_id text;
  v_code text;
  v_pin text;
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_i integer;
  v_try integer;
  v_lines jsonb := '[]'::jsonb;
  v_l jsonb;
  v_pickup jsonb;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta Elara primeiro';
  end if;
  if p_payment not in ('cash','multicaixa') then
    raise exception 'Pagamento por carteira ainda não está activo';
  end if;
  v_seats := greatest(1, least(6, coalesce(p_seats, 1)));

  select * into v_passenger from public.profiles where id = v_uid;
  if not found then
    raise exception 'Só quem tem conta Elara pode comprar lugares';
  end if;
  select * into v_setting from public.tr_setting where id = 1;
  if not found then
    raise exception 'A configuração da plataforma não existe';
  end if;

  -- A fechadura: um só UPDATE bloqueia a linha e decide se os lugares livres
  -- chegam. Duas pessoas a comprar no mesmo segundo — uma entra, outra ouve
  -- a verdade.
  update public.tr_ride
     set seats_taken = seats_taken + v_seats, updated_at = v_now
   where id = p_ride_id
     and state = 'open'
     and seats_taken + v_seats <= capacity
     and depart_at > v_now - 300000
  returning * into v_ride;

  if not found then
    raise exception 'Esses lugares já não estão livres nesta corrida';
  end if;

  select * into v_driver from public.tr_driver where id = v_ride.driver_id;

  v_price := public.tr_round_kz(v_ride.seat_price_kz * v_seats);
  if v_now < v_setting.launch_commission_until then
    v_commission := 0;
  else
    -- A mesma fórmula da 0001, com o mesmo desconto da taxa de pedido: um lugar
    -- comprado num carro cheio e uma viagem fechada no mesmo carro têm de dar
    -- ao motorista o mesmo líquido. Mudar a regra aqui criaria duas tabelas de
    -- comissão na mesma app.
    v_commission := greatest(0, round(
      (v_price - v_setting.booking_fee_kz) * v_setting.commission_pct / 100
    )::int);
  end if;

  -- As linhas do quadro do preço: o mesmo detalhe do tr_quote, multiplicado
  -- pelos lugares, para a pessoa ver de onde vem o número.
  for v_l in select * from jsonb_array_elements(v_ride.lines) loop
    v_lines := v_lines || jsonb_build_object(
      'label', v_l ->> 'label',
      'amountKz', public.tr_round_kz(((v_l ->> 'amountKz')::int) * v_seats)
    );
  end loop;
  if v_seats > 1 then
    v_lines := jsonb_build_object(
      'label', v_seats || ' lugares × ' || v_ride.seat_price_kz || ' Kz',
      'amountKz', v_price
    ) || v_lines;
  end if;

  -- O ponto marcado no mapa; se não for um ponto verdadeiro, fica NULL e a
  -- pessoa é apanhada na zona (tr_clean_pickup explica porquê).
  v_pickup := public.tr_clean_pickup(p_pickup);

  for v_try in 1..5 loop
    v_code := 'ELT-';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, (random() * 31)::int + 1, 1);
    end loop;
    v_pin := (1000 + (random() * 8999)::int)::text;
    v_id := 'trp_' || replace(gen_random_uuid()::text, '-', '');
    begin
      insert into public.tr_trip (
        id, code, passenger_id, passenger_name, kind,
        from_zone_id, to_zone_id, class_id, seats, distance_km,
        price_kz, commission_kz, driver_keeps_kz, state,
        driver_id, driver_name, plate, car_model,
        payment, ride_id, pickup, events, created_at
      ) values (
        v_id, v_code, v_uid,
        coalesce(nullif(btrim(v_passenger.full_name), ''), 'Passageiro Elara'),
        'passageiro',
        v_ride.from_zone_id, v_ride.to_zone_id, v_ride.class_id, v_seats,
        v_ride.distance_km, v_price, v_commission, v_price - v_commission,
        'accepted',
        v_driver.id, v_driver.public_name, v_driver.plate,
        v_driver.model || ' ' || v_driver.year,
        p_payment, v_ride.id, v_pickup,
        jsonb_build_array(
          jsonb_build_object('at', v_now, 'state', 'accepted',
            'note', 'Lugar comprado na corrida de ' || v_driver.public_name)
        ),
        v_now
      );
      exit;
    exception when unique_violation then
      if v_try = 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.tr_trip_secret (trip_id, pin) values (v_id, v_pin);

  return jsonb_build_object(
    'id', v_id,
    'code', v_code,
    'pin', v_pin,
    'dropPin', null,
    'rideId', v_ride.id,
    'seatsLeft', v_ride.capacity - v_ride.seats_taken,
    'quote', jsonb_build_object(
      'classId', v_ride.class_id,
      'distanceKm', v_ride.distance_km,
      'seats', v_seats,
      'priceKz', v_price,
      'lines', v_lines,
      'commissionKz', v_commission,
      'driverKeepsKz', v_price - v_commission,
      'etaMin', v_ride.eta_min,
      'fromZoneId', v_ride.from_zone_id,
      'toZoneId', v_ride.to_zone_id
    )
  );
end;
$$;

-- — 3. Marcar (ou afinar) o ponto de embarque ———————————————————————————————————
--
-- As zonas de 0001 são centróides: servem para o preço e para a rota, mas a
-- pessoa é apanhada à porta de casa. Isto serve para TODA a viagem — fechada ou
-- de lugar — e só enquanto ninguém está dentro do carro: depois de 'ongoing' o
-- ponto de embarque é história, e mudar-lhe seria reescrever o passado.
create or replace function public.tr_set_pickup(p_trip_id text, p_pickup jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_clean jsonb;
begin
  select * into v_trip from public.tr_trip where id = p_trip_id for update;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  if v_trip.passenger_id <> public.current_uid() and not public.is_admin() then
    raise exception 'Só quem vai nesta viagem marca o ponto de embarque';
  end if;
  if v_trip.state not in ('searching','accepted','arriving','waiting_pin') then
    raise exception 'A viagem já começou — o ponto de embarque já não se muda';
  end if;

  v_clean := public.tr_clean_pickup(p_pickup);
  if v_clean is null then
    raise exception 'Toque no mapa para marcar um ponto válido';
  end if;

  update public.tr_trip
     set pickup = v_clean,
         events = events || jsonb_build_object(
           'at', public.tr_now_ms(), 'state', state, 'note', 'Ponto de embarque marcado no mapa')
   where id = p_trip_id;

  return jsonb_build_object('ok', true, 'pickup', v_clean);
end;
$$;

-- — 4. O quadro de saídas ———————————————————————————————————————————————————————

-- Os carros que vão para o lado da pessoa, com lugares livres. Devolve o
-- mínimo que serve para decidir: rota, preço, hora, quantos faltam e quem
-- conduz. Nunca matrícula para o público, nunca telefone.
create or replace function public.tr_nearby_rides(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision default 12,
  p_to_zone_id text default null
)
returns table (
  ride_id text,
  class_id text,
  from_zone_id text,
  to_zone_id text,
  depart_at bigint,
  seats_left integer,
  capacity integer,
  seat_price_kz integer,
  distance_km numeric,
  eta_min integer,
  public_name text,
  rating numeric,
  away_km numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_radius double precision;
begin
  if public.current_uid() is null then
    raise exception 'Entre para ver as corridas à sua volta';
  end if;
  if p_lat is null or p_lon is null then
    return;
  end if;

  v_radius := least(greatest(coalesce(p_radius_km, 12), 1), 30);

  return query
  select
    r.id,
    r.class_id,
    r.from_zone_id,
    r.to_zone_id,
    r.depart_at,
    (r.capacity - r.seats_taken)::int,
    r.capacity,
    r.seat_price_kz,
    r.distance_km,
    r.eta_min,
    d.public_name,
    d.rating,
    public.tr_haversine_km(p_lat, p_lon, z.lat, z.lon)
  from public.tr_ride r
  join public.tr_driver d on d.id = r.driver_id
  join public.tr_zone z on z.id = r.from_zone_id
  where r.state = 'open'
    and r.seats_taken < r.capacity
    and r.depart_at > public.tr_now_ms() - 300000
    and (p_to_zone_id is null or r.to_zone_id = p_to_zone_id)
    and public.tr_haversine_km(p_lat, p_lon, z.lat, z.lon) <= v_radius
  order by r.depart_at, 13
  limit 40;
end;
$$;

-- — 5. O motorista a ver os clientes ——————————————————————————————————————————

-- Quem está na corrida, para onde vai cada um e onde o querem apanhar. É a
-- lista que faltava para conduzir uma carrinha cheia sem group chat no
-- WhatsApp: nome público, lugares, preço, ponto marcado e o estado do PIN.
create or replace function public.tr_ride_manifest(p_ride_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ride public.tr_ride;
  v_driver public.tr_driver;
  v_uid text := public.current_uid();
  v_rows jsonb;
begin
  select * into v_ride from public.tr_ride where id = p_ride_id;
  if not found then
    raise exception 'Corrida não encontrada';
  end if;
  select * into v_driver from public.tr_driver
    where account_id = v_uid and status = 'approved';
  if not found or (v_driver.id <> v_ride.driver_id and not public.is_admin()) then
    raise exception 'Só o motorista da corrida vê esta lista';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'trip_id', t.id,
    'code', t.code,
    'name', t.passenger_name,
    'seats', t.seats,
    'price_kz', t.price_kz,
    'state', t.state,
    'pickup', t.pickup,
    'created_at', t.created_at
  ) order by t.created_at), '[]'::jsonb)
    into v_rows
  from public.tr_trip t
  where t.ride_id = p_ride_id
    and t.state not in ('cancelled');

  return jsonb_build_object(
    'ride', to_jsonb(v_ride),
    'seats_left', v_ride.capacity - v_ride.seats_taken,
    'passengers', v_rows
  );
end;
$$;

-- — 6. Partir, fechar, desistir —————————————————————————————————————————————————

create or replace function public.tr_depart_ride(p_ride_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ride public.tr_ride;
  v_driver public.tr_driver;
begin
  select * into v_driver from public.tr_driver
    where account_id = public.current_uid() and status = 'approved';
  if not found then
    raise exception 'Só um motorista aprovado conduz';
  end if;

  update public.tr_ride set state = 'departed', updated_at = public.tr_now_ms()
   where id = p_ride_id and driver_id = v_driver.id and state = 'open'
     and seats_taken > 0
  returning * into v_ride;

  if not found then
    raise exception 'Só se parte com pelo menos um lugar vendido';
  end if;
  return jsonb_build_object('ok', true, 'state', v_ride.state, 'seats_taken', v_ride.seats_taken);
end;
$$;

-- Fechar é a prova de que a corrida terminou de facto: todos os lugares têm
-- de estar liquidados ou cancelados. Sem isto fica um carro fantasma no quadro.
create or replace function public.tr_close_ride(p_ride_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ride public.tr_ride;
  v_driver public.tr_driver;
  v_open integer;
begin
  select * into v_driver from public.tr_driver
    where account_id = public.current_uid() and status = 'approved';
  if not found then
    raise exception 'Só um motorista aprovado conduz';
  end if;
  select * into v_ride from public.tr_ride where id = p_ride_id;
  if not found or (v_ride.driver_id <> v_driver.id and not public.is_admin()) then
    raise exception 'Esta corrida não é sua';
  end if;
  if v_ride.state <> 'departed' then
    raise exception 'A corrida ainda não partiu';
  end if;

  select count(*) into v_open from public.tr_trip
   where ride_id = p_ride_id and state not in ('ended','rated','cancelled');
  if v_open > 0 then
    raise exception 'Ainda há % viagem(es) por terminar nesta corrida', v_open;
  end if;

  update public.tr_ride set state = 'closed', updated_at = public.tr_now_ms()
    where id = p_ride_id;

  return jsonb_build_object('ok', true, 'state', 'closed');
end;
$$;

-- Fechar uma corrida sem ninguém é honesto: saiu vazia, não há reembolsos
-- porque não houve cobrança.
create or replace function public.tr_cancel_ride(p_ride_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ride public.tr_ride;
  v_driver public.tr_driver;
begin
  select * into v_driver from public.tr_driver
    where account_id = public.current_uid() and status = 'approved';
  if not found then
    raise exception 'Só um motorista aprovado conduz';
  end if;

  update public.tr_ride set state = 'cancelled', updated_at = public.tr_now_ms()
   where id = p_ride_id and driver_id = v_driver.id and state = 'open' and seats_taken = 0
  returning * into v_ride;

  if not found then
    raise exception 'Só se cancela uma corrida ainda sem lugares vendidos — cancele as viagens uma a uma';
  end if;
  return jsonb_build_object('ok', true, 'state', v_ride.state);
end;
$$;

-- — 7. Se alguém desistir, o lugar volta a estar livre —————————————————————————

-- dispara no cancelamento de uma viagem ligada a uma corrida ainda aberta.
create or replace function public.tr_trip_release_seat()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.state = 'cancelled' and old.state is distinct from 'cancelled'
     and new.ride_id is not null then
    update public.tr_ride
       set seats_taken = greatest(0, seats_taken - new.seats),
           updated_at = public.tr_now_ms()
     where id = new.ride_id and state = 'open';
  end if;
  return new;
end;
$$;

drop trigger if exists tr_trip_release_seat_on_cancel on public.tr_trip;
create trigger tr_trip_release_seat_on_cancel
  after update of state on public.tr_trip
  for each row execute function public.tr_trip_release_seat();

-- — Grants ———————————————————————————————————————————————————————————————————————
-- A mesma lição da 0003: revoke sem grant de volta deixa o authenticated
-- sem EXECUTE e a app apanha 42501.

revoke execute on function
  public.tr_open_ride(text, text, bigint, text),
  public.tr_join_ride(text, integer, text, jsonb),
  public.tr_set_pickup(text, jsonb),
  public.tr_nearby_rides(double precision, double precision, double precision, text),
  public.tr_ride_manifest(text),
  public.tr_depart_ride(text),
  public.tr_close_ride(text),
  public.tr_cancel_ride(text)
  from public, anon;

grant execute on function
  public.tr_open_ride(text, text, bigint, text),
  public.tr_join_ride(text, integer, text, jsonb),
  public.tr_set_pickup(text, jsonb),
  public.tr_nearby_rides(double precision, double precision, double precision, text),
  public.tr_ride_manifest(text),
  public.tr_depart_ride(text),
  public.tr_close_ride(text),
  public.tr_cancel_ride(text)
  to authenticated;

-- O quadro de saídas renova-se sozinho: quem está à paragem vê os lugares a
-- encher sem carregar em nada.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tr_ride'
  ) then
    alter publication supabase_realtime add table public.tr_ride;
  end if;
end;
$$;
