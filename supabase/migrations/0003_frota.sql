-- Elara Trajectoria — 0003 (frota, carga e aluguer)
--
-- Três coisas que faltavam para a app parecer o que as pessoas já usam na
-- rua (Yango, Uber, Bolt) e para servir quem muda de casa ou leva mercadoria
-- de Luanda para o Huambo:
--
-- 1. Mais veículos na lista. A `yace` (Hiace, 15 lugares) é como meia de
--    Luanda anda; a carrinha de recolha (picape), o Canter de caixa fechada e
--    o camião são o que se aluga para uma mudança ou para levar carga de uma
--    província à outra. Ninguém inventa aqui o preço de mercado: são os
--    valores a que se fecha na rua, arredondados, e a equipa muda com um
--    UPDATE quando discordar.
--
-- 2. `lane` nas categorias. Uma picape não é um táxi: se as categorias de
--    carga estivessem misturadas com as de passageiros, alguém podia pedir
--    "4 lugares no camião". A app esconde as de carga no pedido de viagem e
--    mostra-as nas entregas e no aluguer.
--
-- 3. Aluguer por hora ou dia, com motorista ou para conduzir. Continua a
--    ser o modelo do Kende porque é o modelo da rua: o DONO do carro é que
--    sabe quanto vale o carro dele. A plataforma só faz as contas (hora =
--    18% do dia, semana = 6 dias, mês = 20 dias), guarda o pedido e mostra
--    as duas pontas.
--
-- Dinheiro: este ficheiro NÃO mexe em carteiras. Um aluguer é um pedido que
-- o dono aceita ou recusa; o pagamento combina-se entre eles, como sempre se
-- combinou. Preferimos isto a cobrar um pagamento que a equipa de 1 a 3
-- pessoas não consegue rever nem reembolsar.
--
-- Correr no editor SQL do projecto bkubhmovgojhutevgzvt, depois do 0002.

-- — Categorias de veículo ———————————————————————————————————————————————————

alter table public.tr_vehicle_class
  add column if not exists lane text not null default 'passageiro'
    constraint tr_class_lane check (lane in ('passageiro','carga'));

insert into public.tr_vehicle_class (id, label, seats, base_kz, per_km_kz, min_kz, per_seat, blurb, icon, sort, lane) values
  -- Lugar a preço homologado, como o candongueiro: 300 Kz dentro da cidade.
  ('hiace',    'Hiace (15 lugares)', 15, 300, 0,   300,   true,
    'Lugar a 300 Kz, o preço da rua. Para fechar a carrinha inteira use Alugar.', 'Bus', 6, 'passageiro'),
  ('picape',   'Carrinha de recolha', 0, 3500, 220, 5000, false,
    'Picape com caixa aberta: móveis soltos, electrodomésticos, mudança pequena.', 'Truck', 9, 'carga'),
  ('canter',   'Canter (caixa fechada)', 0, 6500, 280, 12000, false,
    'Caixa fechada com lona. Casa T2 ou T3, escritório, carga protegida.', 'Truck', 10, 'carga'),
  ('camiao',   'Camião / interprovincial', 0, 15000, 350, 25000, false,
    'Para mercadoria entre províncias. Combina portagens, combustível e espera com o motorista.', 'Truck', 11, 'carga')
on conflict (id) do nothing;

-- A carga deixa de se parecer com um táxi: sai do rail de passageiros.
update public.tr_vehicle_class set lane = 'carga' where id = 'carga' and lane <> 'carga';

-- Ordem única no rail (o 0001 deixava candongueiro e hiace no mesmo degrau).
update public.tr_vehicle_class set sort = s.n
  from (values
    ('economico', 1), ('moto', 2), ('taxi', 3), ('conforto', 4), ('xl', 5),
    ('hiace', 6), ('candongueiro', 7), ('autocarro', 8),
    ('picape', 9), ('canter', 10), ('camiao', 11), ('carga', 12)
  ) as s(id, n)
  where public.tr_vehicle_class.id = s.id and public.tr_vehicle_class.sort <> s.n;

-- — Tamanhos de encomenda ———————————————————————————————————————————————————

insert into public.tr_delivery_class (id, label, example, base_kz, per_km_kz, min_kz, class_id, blurb) values
  ('recolha',    'Carro de recolha', 'móveis soltos, frigorífico, mudança de T1', 3500, 220, 5000, 'picape',
    'Picape com caixa aberta. Quem carrega combina-se com o motorista.'),
  ('canter',     'Caixa fechada / mudança', 'casa T2 ou T3, escritório completo', 6500, 280, 12000, 'canter',
    'Canter com lona. Duas pessoas para carregar; a carga protegida da chuva.'),
  ('mercadoria', 'Mercadoria entre províncias', 'paletes, sacaria, carga solta', 15000, 350, 25000, 'camiao',
    'Camião de uma província à outra. O preço cresce com os quilómetros: é mesmo assim.')
on conflict (id) do nothing;

-- — Aluguer ——————————————————————————————————————————————————————————————————

create table if not exists public.tr_rental (
  id text primary key default ('rnt_' || replace(gen_random_uuid()::text, '-', '')),
  driver_id text not null references public.tr_driver (id) on delete cascade,
  class_id text not null references public.tr_vehicle_class (id),
  title text not null constraint tr_rental_title check (char_length(title) between 3 and 70),
  blurb text not null default '' constraint tr_rental_blurb check (char_length(blurb) <= 300),
  -- O preço-base é sempre o DIA. A hora, a semana e o mês derivam daqui, no
  -- servidor, para o cliente não poder mostrar um número diferente do que o
  -- dono escreveu.
  price_day_kz integer not null constraint tr_rental_price check (price_day_kz between 5000 and 5000000),
  driver_fee_kz integer not null default 0 constraint tr_rental_fee check (driver_fee_kz >= 0),
  with_driver boolean not null default true,
  allows_self_drive boolean not null default false,
  deposit_kz integer not null default 0 constraint tr_rental_deposit check (deposit_kz >= 0),
  min_hours integer not null default 4 constraint tr_rental_minhours check (min_hours between 1 and 24),
  zone_id text references public.tr_zone (id),
  state text not null default 'active' constraint tr_rental_state check (state in ('active','paused')),
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

create index if not exists tr_rental_active_idx on public.tr_rental (state, class_id, price_day_kz);
create index if not exists tr_rental_driver_idx on public.tr_rental (driver_id);

create table if not exists public.tr_rental_request (
  id text primary key default ('rq_' || replace(gen_random_uuid()::text, '-', '')),
  rental_id text not null references public.tr_rental (id) on delete cascade,
  driver_id text not null references public.tr_driver (id) on delete cascade,
  renter_id text not null references public.profiles (id) on delete cascade,
  renter_name text not null,
  plan text not null constraint tr_rental_req_plan check (plan in ('hour','day','week','month')),
  qty integer not null constraint tr_rental_req_qty check (qty between 1 and 60),
  with_driver boolean not null default true,
  start_at bigint not null,
  pickup_zone_id text references public.tr_zone (id),
  note text not null default '' constraint tr_rental_req_note check (char_length(note) <= 400),
  -- Nunca vem do cliente: é o tr_rental_quote que o calcula no insert.
  price_kz integer not null constraint tr_rental_req_price check (price_kz > 0),
  state text not null default 'sent'
    constraint tr_rental_req_state check (state in ('sent','accepted','declined','cancelled')),
  reason text,
  created_at bigint not null default 0,
  resolved_at bigint
);

create index if not exists tr_rental_request_driver_idx on public.tr_rental_request (driver_id, state, created_at desc);
create index if not exists tr_rental_request_renter_idx on public.tr_rental_request (renter_id, created_at desc);

-- — RLS ———————————————————————————————————————————————————————————————————————

alter table public.tr_rental enable row level security;
alter table public.tr_rental_request enable row level security;

-- Uma oferta só é pública se o dono for motorista aprovado. Um candidato à
-- espera de aprovação não aparece na montra.
drop policy if exists tr_rental_read on public.tr_rental;
create policy tr_rental_read on public.tr_rental
  for select to authenticated
  using (
    exists (
      select 1 from public.tr_driver d
      where d.id = tr_rental.driver_id and d.status = 'approved'
    )
    or tr_rental.driver_id in (
      select id from public.tr_driver where account_id = public.current_uid()
    )
    or public.is_admin()
  );

-- Só a equipa escreve directamente. O dono publica por tr_set_rental, quem
-- pede por tr_book_rental, e o dono decide por tr_rental_decision: assim o
-- passageiro não pode marcar o próprio pedido como aceite, nem mudar o plano
-- depois de o dono o ver.
drop policy if exists tr_rental_write on public.tr_rental;
create policy tr_rental_write on public.tr_rental
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Pedidos: cada lado vê os seus; a equipa vê todos.
drop policy if exists tr_rental_request_read on public.tr_rental_request;
create policy tr_rental_request_read on public.tr_rental_request
  for select to authenticated
  using (
    renter_id = public.current_uid()
    or driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    or public.is_admin()
  );

drop policy if exists tr_rental_request_write on public.tr_rental_request;
create policy tr_rental_request_write on public.tr_rental_request
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.tr_rental, public.tr_rental_request from anon, public;
grant select on public.tr_rental to authenticated;
grant select on public.tr_rental_request to authenticated;
-- Insert e decisão passam por RPC: o preço e o estado nunca vêm do cliente.

-- — RPCs ———————————————————————————————————————————————————————————————————————

-- As mesmas famílias de preço do Kende, porque é assim que a rua conta:
-- uma hora vale mais que o dia dividido por 24 — um carro que sai três horas
-- não volta a estar livre para o resto do dia.
create or replace function public.tr_rental_quote(
  p_rental_id text,
  p_plan text default 'day',
  p_qty integer default 1,
  p_with_driver boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rental public.tr_rental;
  v_setting public.tr_setting;
  v_class public.tr_vehicle_class;
  v_units integer;
  v_unit integer;
  v_fee_unit integer;
  v_vehicle integer;
  v_driver integer := 0;
  v_gross integer;
  v_price integer;
  v_commission integer;
  v_lines jsonb := '[]'::jsonb;
begin
  select * into v_rental from public.tr_rental where id = p_rental_id;
  if not found then
    raise exception 'Anúncio de aluguer não encontrado';
  end if;
  if v_rental.state <> 'active' then
    raise exception 'Este veículo não está disponível para aluguer agora';
  end if;

  select * into v_setting from public.tr_setting where id = 1;
  if not found then
    raise exception 'A configuração da plataforma não existe';
  end if;
  select * into v_class from public.tr_vehicle_class where id = v_rental.class_id;

  if p_plan = 'hour' then
    v_units := greatest(1, p_qty);
    if v_units < v_rental.min_hours then
      raise exception 'Este aluguer exige no mínimo % horas', v_rental.min_hours;
    end if;
  elsif p_plan = 'day' then
    v_units := greatest(1, p_qty);
  elsif p_plan = 'week' then
    v_units := greatest(1, p_qty);
  elsif p_plan = 'month' then
    v_units := greatest(1, p_qty);
  else
    raise exception 'Plano de aluguer desconhecido: %', p_plan;
  end if;

  v_unit := case p_plan
    when 'hour' then public.tr_round_kz(v_rental.price_day_kz * 0.18)
    when 'day'  then v_rental.price_day_kz
    when 'week' then public.tr_round_kz(v_rental.price_day_kz * 6)
    else            public.tr_round_kz(v_rental.price_day_kz * 20)
  end;

  v_lines := v_lines || jsonb_build_object(
    'label', v_units::text || ' ' || case p_plan
      when 'hour' then 'hora' when 'day' then 'dia' when 'week' then 'semana' else 'mês' end
        || case when v_units > 1 then 's' else '' end
      || ' × ' || v_unit || ' Kz',
    'amountKz', public.tr_round_kz(v_unit::numeric * v_units)
  );
  v_vehicle := public.tr_round_kz(v_unit::numeric * v_units);

  if p_with_driver then
    if not v_rental.with_driver then
      raise exception 'Este anúncio não inclui motorista';
    end if;
    v_fee_unit := case p_plan
      when 'hour' then public.tr_round_kz(v_rental.driver_fee_kz * 0.18)
      when 'day'  then v_rental.driver_fee_kz
      when 'week' then public.tr_round_kz(v_rental.driver_fee_kz * 6)
      else             public.tr_round_kz(v_rental.driver_fee_kz * 20)
    end;
    if v_fee_unit > 0 then
      v_driver := public.tr_round_kz(v_fee_unit::numeric * v_units);
      v_lines := v_lines || jsonb_build_object('label', 'Motorista', 'amountKz', v_driver);
    end if;
  elsif not v_rental.allows_self_drive then
    raise exception 'Este veículo só se aluga com motorista';
  end if;

  v_gross := v_vehicle + v_driver;
  v_price := public.tr_round_kz(v_gross);

  if public.tr_now_ms() < v_setting.launch_commission_until then
    v_commission := 0;
  else
    v_commission := greatest(0, round(v_price * v_setting.commission_pct / 100)::int);
  end if;

  return jsonb_build_object(
    'rentalId', v_rental.id,
    'classId', v_rental.class_id,
    'lane', coalesce(v_class.lane, 'passageiro'),
    'plan', p_plan,
    'qty', v_units,
    'unitKz', v_unit,
    'priceKz', v_price,
    'lines', v_lines,
    'depositKz', v_rental.deposit_kz,
    'minHours', v_rental.min_hours,
    -- Dito à pessoa: a partir de ~5 horas já compensa pedir o dia inteiro.
    'hoursToDay', case
      when p_plan = 'hour' and v_unit > 0
        then greatest(1, floor(v_rental.price_day_kz / v_unit)::int)
      else null end,
    'commissionKz', v_commission,
    'ownerKeepsKz', v_price - v_commission
  );
end;
$$;

-- O dono publica (ou corrige) a sua oferta. O preço é dele; as contas são
-- da plataforma; a aprovação do motorista é condição.
create or replace function public.tr_set_rental(
  p_id text,
  p_class_id text,
  p_title text,
  p_blurb text,
  p_price_day_kz integer,
  p_driver_fee_kz integer,
  p_with_driver boolean,
  p_allows_self_drive boolean,
  p_deposit_kz integer,
  p_min_hours integer,
  p_zone_id text,
  p_state text default 'active'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver public.tr_driver;
  v_rental public.tr_rental;
  v_now bigint := public.tr_now_ms();
begin
  select * into v_driver from public.tr_driver
    where account_id = public.current_uid() and status = 'approved';
  if not found then
    raise exception 'Só um motorista aprovado pode publicar um carro para alugar';
  end if;

  if not exists (select 1 from public.tr_vehicle_class where id = p_class_id) then
    raise exception 'Categoria desconhecida: %', p_class_id;
  end if;
  if p_price_day_kz < 5000 or p_price_day_kz > 5000000 then
    raise exception 'O preço do dia tem de estar entre 5.000 e 5.000.000 Kz';
  end if;
  if p_driver_fee_kz < 0 or p_deposit_kz < 0 then
    raise exception 'O valor do motorista e a caução não podem ser negativos';
  end if;
  if not p_with_driver and not p_allows_self_drive then
    raise exception 'Escolha pelo menos uma das duas opções: com motorista ou para conduzir';
  end if;
  if p_state not in ('active','paused') then
    raise exception 'Estado inválido: %', p_state;
  end if;

  if p_id is null or p_id = '' then
    insert into public.tr_rental (
      driver_id, class_id, title, blurb, price_day_kz, driver_fee_kz,
      with_driver, allows_self_drive, deposit_kz, min_hours, zone_id, state,
      created_at, updated_at
    ) values (
      v_driver.id, p_class_id, btrim(p_title), btrim(coalesce(p_blurb, '')),
      p_price_day_kz, p_driver_fee_kz, p_with_driver, p_allows_self_drive,
      p_deposit_kz, greatest(1, least(24, p_min_hours)), p_zone_id, p_state,
      v_now, v_now
    ) returning * into v_rental;
  else
    update public.tr_rental set
      class_id = p_class_id, title = btrim(p_title), blurb = btrim(coalesce(p_blurb, '')),
      price_day_kz = p_price_day_kz, driver_fee_kz = p_driver_fee_kz,
      with_driver = p_with_driver, allows_self_drive = p_allows_self_drive,
      deposit_kz = p_deposit_kz, min_hours = greatest(1, least(24, p_min_hours)),
      zone_id = p_zone_id, state = p_state, updated_at = v_now
      where id = p_id and driver_id = v_driver.id
    returning * into v_rental;
    if not found then
      raise exception 'Este anúncio não é seu ou não existe';
    end if;
  end if;

  return jsonb_build_object('id', v_rental.id, 'title', v_rental.title, 'state', v_rental.state);
end;
$$;

-- Pedido de aluguer. A pessoa escolhe plano e quantidade; o preço volta a
-- ser calculado aqui, e é esse que o dono vê.
create or replace function public.tr_book_rental(
  p_rental_id text,
  p_plan text,
  p_qty integer,
  p_with_driver boolean,
  p_start_at bigint,
  p_pickup_zone_id text,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := public.current_uid();
  v_rental public.tr_rental;
  v_quote jsonb;
  v_price integer;
  v_request public.tr_rental_request;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Precisa de entrar para alugar';
  end if;

  select * into v_rental from public.tr_rental where id = p_rental_id;
  if not found then
    raise exception 'Anúncio de aluguer não encontrado';
  end if;

  v_quote := public.tr_rental_quote(p_rental_id, p_plan, p_qty, p_with_driver);
  v_price := (v_quote ->> 'priceKz')::int;

  select coalesce(nullif(btrim(full_name), ''), 'Passageiro Elara') into v_name
    from public.profiles where id = v_uid;

  insert into public.tr_rental_request (
    rental_id, driver_id, renter_id, renter_name, plan, qty, with_driver,
    start_at, pickup_zone_id, note, price_kz, state, created_at
  ) values (
    v_rental.id, v_rental.driver_id, v_uid, v_name, p_plan,
    (v_quote ->> 'qty')::int, p_with_driver, p_start_at,
    nullif(p_pickup_zone_id, ''), left(btrim(coalesce(p_note, '')), 400),
    v_price, 'sent', public.tr_now_ms()
  ) returning * into v_request;

  return jsonb_build_object(
    'id', v_request.id,
    'priceKz', v_request.price_kz,
    'quote', v_quote
  );
end;
$$;

-- Aceitar ou recusar: só o dono do carro, e só enquanto está 'sent'.
create or replace function public.tr_rental_decision(
  p_request_id text,
  p_accept boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver public.tr_driver;
  v_request public.tr_rental_request;
begin
  select * into v_driver from public.tr_driver
    where account_id = public.current_uid() and status = 'approved';
  if not found then
    raise exception 'Apenas um motorista aprovado decide pedidos';
  end if;

  update public.tr_rental_request set
    state = case when p_accept then 'accepted' else 'declined' end,
    reason = left(btrim(coalesce(p_reason, '')), 200),
    resolved_at = public.tr_now_ms()
    where id = p_request_id and driver_id = v_driver.id and state = 'sent'
  returning * into v_request;

  if not found then
    raise exception 'Pedido inexiste, já foi decidido, ou não é do seu carro';
  end if;

  return jsonb_build_object('id', v_request.id, 'state', v_request.state);
end;
$$;

-- Quem pede também pode desistir, enquanto o dono não respondeu.
create or replace function public.tr_cancel_rental_request(p_request_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.tr_rental_request;
begin
  update public.tr_rental_request set
    state = 'cancelled', resolved_at = public.tr_now_ms()
    where id = p_request_id and renter_id = public.current_uid() and state = 'sent'
  returning * into v_request;
  if not found then
    raise exception 'Só se pode desistir de um pedido ainda sem resposta';
  end if;
  return jsonb_build_object('id', v_request.id, 'state', v_request.state);
end;
$$;

revoke execute on function
  public.tr_rental_quote(text,text,integer,boolean),
  public.tr_set_rental(text,text,text,text,integer,integer,boolean,boolean,integer,integer,text,text),
  public.tr_book_rental(text,text,integer,boolean,bigint,text,text),
  public.tr_rental_decision(text,boolean,text),
  public.tr_cancel_rental_request(text)
  from public, anon;

-- Sem este grant o `revoke ... from public` deixa o authenticated sem EXECUTE:
-- o preço do aluguer é calculado no servidor, e o servidor tem de o poder chamar.
grant execute on function
  public.tr_rental_quote(text,text,integer,boolean),
  public.tr_set_rental(text,text,text,text,integer,integer,boolean,boolean,integer,integer,text,text),
  public.tr_book_rental(text,text,integer,boolean,bigint,text,text),
  public.tr_rental_decision(text,boolean,text),
  public.tr_cancel_rental_request(text)
  to authenticated;

-- — 4. Candidatura de motorista: simples e automática ————————————————————————
--
-- Era o gargalo: a pessoa candidatava-se e ficava à espera que alguém da equipa
-- abrisse o painel. Com uma equipa de 1 a 3 pessoas isso eram dias. Passa a
-- entrar na app, dizer o carro, declarar que os documentos são válidos, e
-- começar a receber pedidos no mesmo minuto.
--
-- A segurança não desaparece — muda de sítio:
--   · uma matrícula = uma conta (índice único): ninguém se registra duas vezes
--     com o mesmo carro nem volta depois de suspenso;
--   · o período de teste continua (tr_trial_trips_left): as primeiras viagens
--     ficam marcadas como trial e a equipa revê-las antes de o motorista sair
--     do teste;
--   · tr_review_driver mantém o poder de suspender ou banir, e suspensão tira
--     o carro do mapa na hora;
--   · a declaração escrita (declared_at) fica na conta de quem a fez — é com
--     isso que se fala quando algo não bate certo.
-- O interruptor auto_approve_drivers fica na tr_setting: se um dia houver
-- burla em massa, a equipa fecha-o com um UPDATE e volta à revisão manual.

alter table public.tr_setting
  add column if not exists auto_approve_drivers boolean not null default true;

create unique index if not exists tr_driver_plate_key
  on public.tr_driver (plate);

alter table public.tr_driver_doc
  add column if not exists declared_at bigint not null default 0;

drop function if exists public.tr_apply_driver(text, text, text, integer, text, text);

create or replace function public.tr_apply_driver(
  p_name text,
  p_plate text,
  p_model text,
  p_year integer,
  p_class_id text,
  p_home_zone_id text,
  p_declares boolean
)
returns jsonb
language plpgsql
volatile
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
  v_plate text;
  v_status text;
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
  v_plate := upper(btrim(coalesce(p_plate, '')));
  if char_length(v_plate) < 4 then
    raise exception 'A matrícula parece incompleta';
  end if;
  if exists (select 1 from public.tr_driver d where d.plate = v_plate) then
    raise exception 'Essa matrícula já está noutra conta. Se o carro é seu, fale com o suporte Elara.';
  end if;
  if nullif(btrim(p_model), '') is null then
    raise exception 'Falta o modelo do carro';
  end if;
  if p_year is null or p_year not between 1980 and 2100 then
    raise exception 'O ano do carro não faz sentido';
  end if;
  if coalesce(p_declares, false) is not true then
    raise exception 'Confirme que tem licença, livrete e seguro válidos';
  end if;
  select * into v_class from public.tr_vehicle_class where id = p_class_id;
  if not found then
    raise exception 'Categoria desconhecida';
  end if;
  -- Uma picape, um Canter ou um camião também são motoristas: é quem faz as
  -- mudanças e a carga entre províncias. O `lane` esconde essas categorias no
  -- pedido de passageiro, nunca na candidatura.
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

  v_status := case when v_setting.auto_approve_drivers then 'approved' else 'pending' end;
  v_id := 'drv_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.tr_driver (
    id, account_id, name, public_name, plate, model, year, class_id,
    province, home_zone_id, status, approved_at, trial_trips_left, created_at
  ) values (
    v_id, v_uid, btrim(p_name), v_public, v_plate, btrim(p_model), p_year, p_class_id,
    v_zone.province, p_home_zone_id, v_status,
    case when v_status = 'approved' then public.tr_now_ms() else null end,
    case when v_status = 'approved' then v_setting.trial_trip_limit else 0 end,
    public.tr_now_ms()
  );
  insert into public.tr_driver_doc (driver_id, declared_at, updated_at)
  values (v_id, public.tr_now_ms(), public.tr_now_ms());

  return jsonb_build_object(
    'id', v_id,
    'status', v_status,
    'public_name', v_public,
    'trial_trips_left', case when v_status = 'approved' then v_setting.trial_trip_limit else 0 end
  );
end;
$$;

revoke execute on function
  public.tr_apply_driver(text, text, text, integer, text, text, boolean)
  from public, anon;
grant execute on function
  public.tr_apply_driver(text, text, text, integer, text, text, boolean)
  to authenticated;
