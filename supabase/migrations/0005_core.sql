-- Elara Trajectoria — 0005 (recibo, elogios, atalhos, partilha e o dinheiro em dinheiro)
--
-- Este ficheiro NÃO está aplicado. Está escrito para ser revisto e corrido uma
-- vez, quando houver 10 minutos para o fazer com a app aberta ao lado.
--
-- Duas metades:
--
-- A) Correções ao que já corre (0001). São bugs reais, encontrados ao auditar o
--    app contra o servidor, e todos decidem dinheiro ou segurança:
--
--   1. `tr_quote` nas entregas: o preço final era calculado ANTES de juntar
--      «Paragem de entrega» (200) e «Taxa de pedido» às linhas. A pessoa via
--      linhas que somavam mais do que o preço cobrado. Agora o preço é sempre
--      a soma das linhas mostradas — o que se vê é o que se paga.
--   2. A comissão deixava de fora a taxa de pedido mesmo em categorias onde
--      essa taxa nunca entrou no preço (tarifa homologada por lugar). Passa a
--      abater só quando a taxa está efectivamente nas linhas.
--   3. `tr_verify_pin` aceitava código em qualquer estado antes do início
--      (`accepted`, `arriving`, `waiting_pin`), sem bloquear a linha e sem
--      limite de tentativas. Um motorista com má fé testava códigos à vontade.
--      Agora: só em `waiting_pin`, com bloqueio de linha, e 5 tentativas com
--      5 minutos de espera.
--   4. `tr_finish_trip` não media nada: aceitar e fechar em 3 segundos contava
--      como viagem. Agora exige o tempo mínimo plausível para a distância
--      anunciada (a 60 km/h médias — o melhor que se faz em cidade), nunca
--      menos de 1 minuto.
--   5. `tr_settle` creditava a carteira do motorista também nas viagens a
--      dinheiro. O motorista já tinha o dinheiro na mão; creditar era inventar
--      saldo. Agora: dinheiro a bordo não move saldo, e a comissão da
--      plataforma fica registada como dívida (`owes_kz`) para acertar com a
--      equipa. Multicaixa fica como estava.
--   6. `tr_rate` não bloqueava a linha: dois toques no mesmo segundo
--      duplicavam a contagem da média do motorista. Agora com `for update`.
--   7. Um motorista podia aceitar um pedido privado enquanto tinha uma corrida
--      de lugares aberta (a 0004) — dois passageiros com «o motorista
--      aceitou», um carro. `tr_claim_trip` e `tr_nearby_drivers` passam a
--      consultar `tr_driver_busy()`, e o pino no mapa volta a significar
--      «este carro pode ir ter consigo».
--
-- B) O extra que a app já sabe mostrar, e que se esconde sozinho enquanto esta
--    migração não existir (as sondas estão em `src/lib/extras.ts`):
--
--   · `tr_review` — elogios depois das estrelas. As estrelas já vivem na
--     `tr_trip`; aqui só fica a escolha feita em lista, com o papel de quem a escreveu.
--   · `tr_saved_place` — atalhos com emoji, da pessoa para a pessoa.
--   · `tr_trip_pref` — o ambiente que se quer dentro do carro. Nota, não promessa.
--   · `tr_referral` — fila de convites PARA CONFIRMAR. Nada aqui dá crédito:
--     o crédito é sempre confirmado pela equipa no fluxo que já existe
--     (`tr_money_request`). O estado `pending` é o ponto, não um passo intermédio.
--   · `tr_share_token` — a ligação pública de «partilhar a minha viagem»: um
--     token com 24 h de vida, que mostra rota, estado e carro, e nunca mostra
--     PIN, telefone, e-mail nem a conta de ninguém.
--   · `tr_leaderboard` — quem fez mais corridas na semana. Sem dinheiro: uma
--      equipa de 1 a 3 pessoas não consegue verificar ganhos, e um quadro com
--      valores errados destrói a confiança dos motoristas.
--
-- RLS em todas as tabelas novas: o passageiro só vê as linhas dele; o motorista
-- só vê linhas de viagens que lhe foram atribuídas; a equipa vê tudo. Nos
-- atalhos guardados a equipa NÃO lê: é um caderno de moradas pessoais — casa,
-- escola, trabalho — e a app prometeu não andar a espiá-las.
--
-- Convenções herdadas: ids de texto com prefixo, horas bigint em ms pelo
-- relógio do servidor (`tr_now_ms()`), Kwanza inteiro, RPCs `security definer`
-- com `set search_path = public, pg_temp`, `public.current_uid()` e
-- `public.is_admin()` como únicas fontes de identidade.

-- — A1/A2: o preço volta a ser a soma do que se mostra ————————————————————————

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
  v_has_fee boolean := false;
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
    v_gross := public.tr_lines_total(v_lines);
    if v_gross < v_delivery.min_kz then
      v_lines := v_lines || jsonb_build_object('label', 'Complemento até ao mínimo de ' || v_delivery.min_kz || ' Kz', 'amountKz', v_delivery.min_kz - v_gross);
    end if;
    v_lines := v_lines || jsonb_build_object('label', 'Paragem de entrega', 'amountKz', 200);
    if v_setting.booking_fee_kz > 0 then
      v_lines := v_lines || jsonb_build_object('label', 'Taxa de pedido', 'amountKz', v_setting.booking_fee_kz);
      v_has_fee := true;
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
      -- Mais do que um lugar entra como linha própria, ao mesmo preço por
      -- lugar: é isso que torna o total explicável a duas pessoas no carro.
      if greatest(1, p_seats) > 1 then
        v_lines := v_lines || jsonb_build_object(
          'label', (greatest(1, p_seats) - 1) || ' lugares adicionais',
          'amountKz', v_per_seat_price * (greatest(1, p_seats) - 1));
      end if;
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
      v_gross := public.tr_lines_total(v_lines);
      if v_gross < v_class.min_kz then
        v_lines := v_lines || jsonb_build_object('label', 'Complemento até ao mínimo de ' || v_class.min_kz || ' Kz', 'amountKz', v_class.min_kz - v_gross);
      end if;
    end if;
    -- A taxa de pedido não se aplica a lugar a preço homologado: acrescentá-la
    -- mudava a tarifa legal do táxi e do autocarro.
    if v_setting.booking_fee_kz > 0 and not v_class.per_seat then
      v_lines := v_lines || jsonb_build_object('label', 'Taxa de pedido', 'amountKz', v_setting.booking_fee_kz);
      v_has_fee := true;
    end if;
    v_eta := round(v_km / case when v_km > 12 then 55 else 22 end * 60)::int;
  else
    raise exception 'Tipo de viagem desconhecido: %', p_kind;
  end if;

  -- Uma só regra para os dois ramos: o preço É a soma das linhas mostradas.
  v_gross := public.tr_lines_total(v_lines);
  v_price := public.tr_round_kz(v_gross);

  if public.tr_now_ms() < v_setting.launch_commission_until then
    v_commission := 0;
  else
    -- A taxa de pedido é receita da plataforma desde o primeiro cêntimo, por
    -- isso sai da base de cálculo — mas só quando está mesmo no preço.
    v_commission := greatest(0, round(
      (v_price - case when v_has_fee then v_setting.booking_fee_kz else 0 end)
      * v_setting.commission_pct / 100
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

-- Somar as linhas num só sítio, para o preço e a montra não se separarem nunca.
create or replace function public.tr_lines_total(p_lines jsonb)
returns integer
language sql
immutable
as $$
  select coalesce((select sum((l ->> 'amountKz')::int) from jsonb_array_elements(p_lines) l), 0)::int
$$;

-- — A3: o código só vale no momento em que é código ———————————————————————————

-- Onde se conta o código errado. O PIN em si não se move daqui.
alter table public.tr_trip_secret
  add column if not exists attempts integer not null default 0
    constraint tr_secret_attempts check (attempts between 0 and 20),
  add column if not exists locked_until bigint not null default 0;

create or replace function public.tr_verify_pin(p_trip_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_secret public.tr_trip_secret;
  v_now bigint;
  v_state text;
begin
  v_now := public.tr_now_ms();

  -- A linha da viagem bloqueada primeiro: dois motoristas (ou o mesmo duas
  -- vezes) não podem ver o mesmo código confirmado em duas transacções.
  select * into v_trip from public.tr_trip where id = p_trip_id for update;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  if v_trip.driver_id not in (select id from public.tr_driver where account_id = public.current_uid()) then
    raise exception 'Só o motorista desta viagem confirma o código';
  end if;
  -- O código só se pede quando o motorista disse que chegou. Aceitar código no
  -- 'accepted' dava início de viagem sem ninguém no ponto — e falsificava o
  -- tempo de viagem que serve para fechar a corrida.
  if v_trip.state <> 'waiting_pin' then
    raise exception 'A viagem ainda não está à espera do código';
  end if;

  select * into v_secret from public.tr_trip_secret where trip_id = p_trip_id for update;
  if not found then
    raise exception 'Viagem sem código';
  end if;
  if v_secret.locked_until > v_now then
    raise exception 'Demasiadas tentativas com este código. Volte a tentar daqui a % minutos.',
      greatest(1, ceil((v_secret.locked_until - v_now) / 60000.0)::int);
  end if;

  if btrim(coalesce(p_pin, '')) <> v_secret.pin then
    -- Ao quinto erro a contagem recomeça do zero e a linha fecha 5 minutos: é
    -- o preço de deixar o ecrã aberto a tentar combinações.
    update public.tr_trip_secret
      set attempts = case when attempts + 1 >= 5 then 0 else attempts + 1 end,
          locked_until = case when attempts + 1 >= 5
            then v_now + 5 * 60000 else locked_until end
    where trip_id = p_trip_id;
    raise exception 'Este código não corresponde ao pedido. Confirma com %',
      case when v_trip.kind = 'entrega' then 'quem entrega a encomenda' else 'o passageiro' end;
  end if;

  update public.tr_trip_secret set attempts = 0, locked_until = 0 where trip_id = p_trip_id;

  update public.tr_trip t
  set state = 'ongoing',
      events = t.events || jsonb_build_object('at', v_now, 'state', 'ongoing', 'note', 'Código confirmado — viagem iniciada')
  where t.id = p_trip_id
  returning t.state into v_state;

  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- O mesmo código de entrega, com as mesmas regras de estado e de tentativas.
alter table public.tr_trip_secret
  add column if not exists drop_attempts integer not null default 0
    constraint tr_secret_drop_attempts check (drop_attempts between 0 and 20);

create or replace function public.tr_verify_drop_pin(p_trip_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_secret public.tr_trip_secret;
  v_now bigint;
  v_state text;
begin
  v_now := public.tr_now_ms();

  select * into v_trip from public.tr_trip where id = p_trip_id for update;
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

  select * into v_secret from public.tr_trip_secret where trip_id = p_trip_id for update;
  if not found then
    raise exception 'Viagem sem código';
  end if;
  if v_secret.locked_until > v_now then
    raise exception 'Demasiadas tentativas com este código. Volte a tentar daqui a % minutos.',
      greatest(1, ceil((v_secret.locked_until - v_now) / 60000.0)::int);
  end if;
  if v_secret.drop_pin is null then
    raise exception 'Esta entrega não tem código de destino';
  end if;

  if btrim(coalesce(p_pin, '')) <> v_secret.drop_pin then
    update public.tr_trip_secret
      set drop_attempts = case when drop_attempts + 1 >= 5 then 0 else drop_attempts + 1 end,
          locked_until = case when drop_attempts + 1 >= 5
            then v_now + 5 * 60000 else locked_until end
    where trip_id = p_trip_id;
    raise exception 'O código não bate certo. Pede a quem recebeu para ler de novo';
  end if;

  update public.tr_trip_secret set drop_attempts = 0, locked_until = 0, attempts = 0 where trip_id = p_trip_id;

  update public.tr_trip t
  set state = 'ended',
      events = t.events || jsonb_build_object('at', v_now, 'state', 'ended', 'note', 'Entregue — código confirmado por quem recebeu')
  where t.id = p_trip_id
  returning t.state into v_state;

  perform public.tr_settle(p_trip_id);
  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- — A4: ninguém fecha uma corrida em três segundos ————————————————————————————

/**
 * O piso de tempo, em minutos, para uma viagem de `p_km` quilómetros.
 * 60 km/h de média é o melhor que se faz em Luanda fora de um traço de
 * expresso: abaixo disso a viagem não aconteceu, foi carregada num botão.
 * Nunca menos de 1 minuto.
 */
create or replace function public.tr_min_travel_min(p_km numeric)
returns integer
language sql
immutable
as $$
  select greatest(1, ceil(coalesce(p_km, 0) / 60.0 * 60))::int
$$;

create or replace function public.tr_trip_start_ms(p_trip public.tr_trip)
returns bigint
language sql
stable
as $$
  -- O instante em que o código foi confirmado (viagem em curso). Se a viagem
  -- for antiga demais para ter esse evento, usa-se a criação: é sempre mais
  -- cedo, portanto mais exigente, nunca menos.
  select coalesce(
    (select max((e ->> 'at')::bigint)
       from jsonb_array_elements(p_trip.events) e
      where e ->> 'state' = 'ongoing'),
    p_trip.created_at
  )
$$;

create or replace function public.tr_finish_trip(p_trip_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_now bigint;
  v_needed integer;
  v_since bigint;
  v_state text;
begin
  v_now := public.tr_now_ms();

  select * into v_trip from public.tr_trip where id = p_trip_id for update;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  if v_trip.state <> 'ongoing' or v_trip.kind <> 'passageiro' then
    raise exception 'Só se fecha uma corrida de passageiro que esteja em viagem';
  end if;
  if v_trip.driver_id not in (select id from public.tr_driver where account_id = public.current_uid()) then
    raise exception 'Só o motorista desta viagem a fecha';
  end if;

  v_needed := public.tr_min_travel_min(v_trip.distance_km);
  v_since := public.tr_trip_start_ms(v_trip);
  if (v_now - v_since) / 60000.0 < v_needed then
    raise exception 'Ainda não pode fechar esta corrida: começou há pouco tempo. Aguarde cerca de % min.',
      greatest(1, v_needed - floor((v_now - v_since) / 60000.0)::int);
  end if;

  update public.tr_trip t
  set state = 'ended',
      events = t.events || jsonb_build_object('at', v_now, 'state', 'ended')
  where t.id = p_trip_id
  returning t.state into v_state;

  perform public.tr_settle(p_trip_id);
  return jsonb_build_object('ok', true, 'state', v_state);
end;
$$;

-- — A5: dinheiro na mão não é saldo ——————————————————————————————————————————

-- O que o motorista fica a dever à plataforma pelas corridas pagas a bordo.
-- Não é saldo negativo: a carteira continua só com o que se pode levantar.
alter table public.tr_wallet
  add column if not exists owes_kz integer not null default 0
    constraint tr_wallet_owes check (owes_kz >= 0);

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
  if not found then
    return;
  end if;
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

  if v_trip.payment = 'cash' then
    -- O dinheiro entrou no bolso do motorista dentro do carro. Creditar-lhe o
    -- saldo seria pagar duas vezes; a única conta em falta é a comissão, e
    -- essa acerta-se com a equipa (levantamento, ou entrega em mão).
    update public.tr_wallet
    set owes_kz = owes_kz + v_trip.commission_kz, updated_at = v_now
    where who = v_driver.account_id
    returning balance_kz into v_balance;

    if v_trip.commission_kz > 0 then
      insert into public.tr_wallet_tx (who, kind, amount_kz, balance_after_kz, trip_id, note, at)
      values (
        v_driver.account_id, 'commission', -v_trip.commission_kz, coalesce(v_balance, 0), v_trip.id,
        'Comissão de ' || case when v_trip.kind = 'entrega' then 'entrega ' else 'viagem ' end || v_trip.code || ' (dinheiro a bordo)',
        v_now
      );
    end if;
  else
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
  end if;

  update public.tr_driver
  set trips = trips + 1,
      trial_trips_left = greatest(0, trial_trips_left - case when v_trip.trial then 1 else 0 end)
  where id = v_driver.id;
end;
$$;

-- — A6: a média do motorista não se duplica com dois toques ——————————————————————

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

  -- Bloqueio de linha: sem isto, dois toques no mesmo segundo liam
  -- `passenger_rating is null` os dois e a média contava a mesma pessoa duas
  -- vezes.
  select * into v_trip from public.tr_trip where id = p_trip_id for update;
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

-- — A7: um carro, um trabalho de cada vez ——————————————————————————————————————
--
-- O painel do motorista esconde a praça enquanto tem uma viagem em curso, e a
-- 0004 não deixa ninguém abrir duas corridas de lugares. O buraco é o meio dos
-- dois: um motorista com uma corrida de lugares aberta ainda vê pedidos privados
-- e pode aceitar um que o leva para o lado contrário no mesmo minuto. Ficariam
-- duas pessoas com «o motorista aceitou» e um carro só — e aqui, onde qualquer
-- erro se lê como burla, isso não é um detalhe técnico. A regra passa a viver
-- no servidor, que é o único sítio onde os dois lados não podem mentir.

-- Disponível = aprovado, online, e sem nada em curso. Uma viagem privada em
-- qualquer estado depois de aceite, ou uma corrida de lugares ainda por fechar,
-- tiram o carro da lista. Nota: é uma leitura, não um estado guardado — assim
-- não há `busy` que fique pendurado quando uma viagem é cancelada à força.
create or replace function public.tr_driver_busy(p_driver_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_driver_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.tr_trip t
    where t.driver_id = p_driver_id
      and t.state in ('accepted','arriving','waiting_pin','ongoing','waiting_drop')
  ) then
    return true;
  end if;

  -- Sem a 0004 aplicada não existem corridas de lugares: a pergunta não tem
  -- de saber respondê-la.
  if to_regclass('public.tr_ride') is null then
    return false;
  end if;

  return exists (
    select 1 from public.tr_ride r
    where r.driver_id = p_driver_id
      and r.state in ('open','departed')
  );
end;
$$;

-- Aceitar um pedido passa a exigir o carro livre. Todo o resto é a função que
-- já corre (0001), palavra a palavra.
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
  if public.tr_driver_busy(v_driver.id) then
    raise exception 'Já tem um trabalho em curso — feche-o antes de aceitar outro';
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

-- Os pinos no mapa são uma promessa discreta: «há carros por perto». Um carro
-- a cumprir outra corrida já não é um carro que possa ir buscar a pessoa, e é
-- isso que faz alguém confiar num pino. A mesma selecção de sempre (0002), com
-- os ocupados de fora.
create or replace function public.tr_nearby_drivers(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision default 8
)
returns table (
  driver_id text,
  class_id text,
  lat double precision,
  lon double precision,
  seen_min integer,
  distance_km numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_radius double precision;
  v_cutoff bigint;
begin
  if public.current_uid() is null then
    raise exception 'Entre para ver os motoristas por perto';
  end if;
  if p_lat is null or p_lon is null then
    return;
  end if;

  v_radius := least(greatest(coalesce(p_radius_km, 8), 1), 15);
  v_cutoff := public.tr_now_ms() - 180000;

  return query
  with seen as (
    select
      d.id as drv,
      d.class_id as cls,
      round(pr.lat::numeric, 3)::double precision as rlat,
      round(pr.lon::numeric, 3)::double precision as rlon,
      pr.updated_at as at
    from public.tr_driver_presence pr
    join public.tr_driver d on d.id = pr.driver_id
    where d.status = 'approved'
      and d.online
      and pr.updated_at > v_cutoff
      and not public.tr_driver_busy(d.id)
  )
  select
    s.drv,
    s.cls,
    s.rlat,
    s.rlon,
    greatest(0, ((public.tr_now_ms() - s.at) / 60000)::int)::int,
    public.tr_haversine_km(p_lat, p_lon, s.rlat, s.rlon)
  from seen s
  where public.tr_haversine_km(p_lat, p_lon, s.rlat, s.rlon) <= v_radius
  order by 6
  limit 60;
end;
$$;

-- — B1: elogios ——————————————————————————————————————————————————————————————————

-- As estrelas vivem em `tr_trip`. Esta tabela é só a escolha feita em lista
-- por quem já deu estrelas — por isso cada papel só pode ter uma linha por viagem.
create table if not exists public.tr_review (
  id text primary key default ('rev_' || replace(gen_random_uuid()::text, '-', '')),
  trip_id text not null references public.tr_trip (id) on delete cascade,
  by_id text not null references public.profiles (id) on delete cascade,
  by_role text not null constraint tr_review_role check (by_role in ('passenger','driver')),
  -- Copiado da viagem no momento do elogio, para o quadro poder ser lido sem
  -- voltar a abrir a viagem.
  score integer not null constraint tr_review_score check (score between 1 and 5),
  tags jsonb not null default '[]'::jsonb constraint tr_review_tags_is_list jsonb_typeof(tags) = 'array',
  at bigint not null default 0,
  constraint tr_review_one_per_side unique (trip_id, by_role)
);

create index if not exists tr_review_trip_idx on public.tr_review (trip_id);
create index if not exists tr_review_driver_idx on public.tr_review (by_role, at desc);

-- Os únicos elogios que a app mostra. Um texto livre aqui seria a porta para
-- comentários que uma equipa de 1 a 3 pessoas não consegue moderar.
create or replace function public.tr_review_tag_allowed(p_tag text)
returns boolean
language sql
stable
as $$
  select p_tag in ('pontual','conducao_segura','amavel','carro_limpo','ajudou_bagagem','cuidado_encomenda')
$$;

create or replace function public.tr_add_review(p_trip_id text, p_tags jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_uid text;
  v_role text;
  v_score integer;
  v_tags jsonb := '[]'::jsonb;
  v_tag jsonb;
  v_id text;
begin
  v_uid := public.current_uid();
  if v_uid is null then
    raise exception 'Entre na sua conta para elogiar';
  end if;

  select * into v_trip from public.tr_trip where id = p_trip_id for update;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  if v_trip.state not in ('ended','rated') then
    raise exception 'Só se elogia uma viagem terminada';
  end if;

  if v_trip.passenger_id = v_uid then
    v_role := 'passenger';
    v_score := v_trip.passenger_rating;
  elsif v_trip.driver_id in (select id from public.tr_driver where account_id = v_uid) then
    v_role := 'driver';
    v_score := v_trip.driver_rating;
  else
    raise exception 'Só as duas pontas da viagem elogiam';
  end if;
  -- Primeiro as estrelas, depois os elogios: é a ordem da app, e garante que o
  -- elogio fica ligado a uma nota real.
  if v_score is null then
    raise exception 'Dê primeiro a sua nota de 1 a 5';
  end if;

  if jsonb_typeof(p_tags) <> 'array' then
    raise exception 'Elogios inválidos';
  end if;
  for v_tag in select * from jsonb_array_elements(p_tags)
  loop
    if jsonb_typeof(v_tag) <> 'string' or not public.tr_review_tag_allowed(v_tag #>> '{}') then
      raise exception 'Elogio desconhecido: %', v_tag #>> '{}';
    end if;
    -- Sem duplicados: «amável» duas vezes não é mais amável.
    if not exists (select 1 from jsonb_array_elements(v_tags) t where t = v_tag) then
      v_tags := v_tags || v_tag;
    end if;
  end loop;
  if jsonb_array_length(v_tags) > 6 then
    raise exception 'Demasiados elogios';
  end if;

  insert into public.tr_review (trip_id, by_id, by_role, score, tags, at)
  values (p_trip_id, v_uid, v_role, v_score, v_tags, public.tr_now_ms())
  on conflict (trip_id, by_role) do update
    set tags = excluded.tags,
        score = excluded.score
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'tags', v_tags);
end;
$$;

-- — B2: atalhos guardados ————————————————————————————————————————————————————————

create table if not exists public.tr_saved_place (
  id text primary key default ('plc_' || replace(gen_random_uuid()::text, '-', '')),
  owner_id text not null references public.profiles (id) on delete cascade,
  label text not null constraint tr_place_label check (char_length(label) between 1 and 40),
  emoji text not null constraint tr_place_emoji check (emoji in ('🏠','🏫','⛪','🛒','🏭','💼','🏥','⛽')),
  zone_id text references public.tr_zone (id) on delete set null,
  lat double precision not null constraint tr_place_lat check (lat between -90 and 90),
  lon double precision not null constraint tr_place_lon check (lon between -180 and 180),
  note text not null default '' constraint tr_place_note check (char_length(note) <= 80),
  created_at bigint not null default 0
);

create index if not exists tr_saved_place_owner_idx on public.tr_saved_place (owner_id, created_at);

-- — B3: o ambiente dentro do carro ———————————————————————————————————————————————

-- Uma nota que o motorista lê, não uma promessa de serviço. Sem tabela não há
-- «playlist da viagem»: a app não toca música, e nunca diria que toca.
create table if not exists public.tr_trip_pref (
  id text primary key default ('prf_' || replace(gen_random_uuid()::text, '-', '')),
  trip_id text not null references public.tr_trip (id) on delete cascade,
  vibe text not null constraint tr_pref_vibe check (vibe in ('silencio','calmo','kuduro','semba')),
  at bigint not null default 0,
  constraint tr_trip_pref_one unique (trip_id)
);

create or replace function public.tr_set_trip_pref(p_trip_id text, p_vibe text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_pref public.tr_trip_pref;
begin
  select * into v_trip from public.tr_trip where id = p_trip_id;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  -- Só quem chamou o carro é que pede o ambiente. O motorista vê a nota.
  if v_trip.passenger_id <> public.current_uid() then
    raise exception 'Só o passageiro escolhe o ambiente';
  end if;
  if v_trip.state in ('ended','rated','cancelled') then
    raise exception 'Esta viagem já terminou';
  end if;
  if p_vibe not in ('silencio','calmo','kuduro','semba') then
    raise exception 'Ambiente desconhecido: %', p_vibe;
  end if;

  insert into public.tr_trip_pref (trip_id, vibe, at)
  values (p_trip_id, p_vibe, public.tr_now_ms())
  on conflict (trip_id) do update set vibe = excluded.vibe, at = excluded.at
  returning * into v_pref;

  return jsonb_build_object('ok', true, 'vibe', v_pref.vibe);
end;
$$;

-- — B4: convites (só a equipa confirma) —————————————————————————————————————————————

-- Um convite é uma fila de revisão, não um saldo. Nada neste ficheiro escreve
-- em `tr_wallet` ou `tr_wallet_tx`: o crédito é confirmado pela equipa no
-- fluxo de pedidos de dinheiro que já existe.
create table if not exists public.tr_referral (
  id text primary key default ('ref_' || replace(gen_random_uuid()::text, '-', '')),
  code text not null constraint tr_referral_code_shape check (code ~ '^TR[A-Z0-9]{6}$'),
  who text not null references public.profiles (id) on delete cascade,
  owner_id text not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    constraint tr_referral_status check (status in ('pending','confirmed','rejected')),
  note text not null default '' constraint tr_referral_note check (char_length(note) <= 140),
  at bigint not null default 0,
  decided_at bigint,
  -- Uma pessoa só pode aproveitar um convite uma vez. Sem isto, o mesmo
  -- telemóvel reivindicava todos os códigos.
  constraint tr_referral_one_claim unique (who)
);

create index if not exists tr_referral_code_idx on public.tr_referral (code, status);

-- O código de cada pessoa nasce do próprio id: é estável, não se esgota, e não
-- precisa de tabela de sequências.
create or replace function public.tr_referral_code()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text;
  v_code text;
begin
  v_uid := public.current_uid();
  if v_uid is null then
    raise exception 'Entre na sua conta para ver o seu código';
  end if;
  v_code := 'TR' || upper(substr(encode(sha256(v_uid::bytea), 'hex'), 1, 6));
  return jsonb_build_object('code', v_code);
end;
$$;

create or replace function public.tr_claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text;
  v_code text;
  v_owner text;
  v_existing public.tr_referral;
begin
  v_uid := public.current_uid();
  if v_uid is null then
    raise exception 'Entre na sua conta para usar um código';
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));
  if v_code !~ '^TR[A-Z0-9]{6}$' then
    raise exception 'Código inválido. Tem de começar por TR e ter 8 caracteres';
  end if;
  -- O próprio código não se aplica a si próprio: verifica-se pelo dono, abaixo.

  -- O código é derivado do id da conta, por isso o dono encontra-se sempre nas
  -- contas que existem — nunca em tabelas de códigos que se perdem.
  v_owner := public.tr_owner_of_code(v_code);
  if v_owner is null then
    raise exception 'Este código não corresponde a ninguém da Elara';
  end if;
  if v_uid = v_owner then
    raise exception 'Esse é o seu próprio código';
  end if;

  select * into v_existing from public.tr_referral where who = v_uid;
  if found then
    if v_existing.code = v_code then
      return jsonb_build_object('ok', true, 'status', v_existing.status);
    end if;
    raise exception 'Já usou um código de convite';
  end if;

  insert into public.tr_referral (code, who, owner_id, status, at)
  values (v_code, v_uid, v_owner, 'pending', public.tr_now_ms());

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

-- De quem é este código? Calcula-se, não se guarda: o código é uma função do id
-- da conta, portanto só existe se a conta existir.
create or replace function public.tr_owner_of_code(p_code text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id from public.profiles p
  where 'TR' || upper(substr(encode(sha256(p.id::bytea), 'hex'), 1, 6)) = p_code
  limit 1
$$;

-- Confirmar ou recusar é trabalho da equipa, e não mexe em saldos: fica marcado
-- e a equipa paga pelo fluxo de dinheiro que já existe.
create or replace function public.tr_decide_referral(p_id text, p_confirm boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref public.tr_referral;
begin
  if not public.is_admin() then
    raise exception 'Só a equipa Elara confirma convites';
  end if;
  select * into v_ref from public.tr_referral where id = p_id for update;
  if not found then
    raise exception 'Convite desconhecido';
  end if;
  if v_ref.status <> 'pending' then
    raise exception 'Este convite já foi decidido';
  end if;

  update public.tr_referral
  set status = case when p_confirm then 'confirmed' else 'rejected' end,
      note = left(coalesce(p_note, ''), 140),
      decided_at = public.tr_now_ms()
  where id = p_id
  returning * into v_ref;

  return jsonb_build_object('ok', true, 'status', v_ref.status);
end;
$$;

-- — B5: partilhar a viagem com alguém ——————————————————————————————————————————————

-- O token é a única chave. Não dá acesso à conta, ao PIN, ao telefone nem ao
-- e-mail — dá acesso a uma leitura da viagem, durante 24 horas.
create table if not exists public.tr_share_token (
  id text primary key default ('shr_' || replace(gen_random_uuid()::text, '-', '')),
  token text not null unique constraint tr_share_token_shape check (token ~ '^[a-z0-9]{16,64}$'),
  trip_id text not null references public.tr_trip (id) on delete cascade,
  by_id text not null references public.profiles (id) on delete cascade,
  at bigint not null default 0,
  expires_at bigint not null,
  revoked boolean not null default false
);

create index if not exists tr_share_token_trip_idx on public.tr_share_token (trip_id, expires_at);

create or replace function public.tr_share_create(p_trip_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip public.tr_trip;
  v_share public.tr_share_token;
  v_now bigint;
begin
  v_now := public.tr_now_ms();

  select * into v_trip from public.tr_trip where id = p_trip_id;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  -- Só o passageiro partilha a sua própria viagem. O motorista tem a dele.
  if v_trip.passenger_id <> public.current_uid() then
    raise exception 'Só quem pediu a viagem a partilha';
  end if;
  if v_trip.state = 'cancelled' then
    raise exception 'Uma viagem cancelada não tem o que partilhar';
  end if;

  -- Um link por viagem enquanto ele for válido: o número que a pessoa copiou
  -- não muda a meio do trajecto.
  select * into v_share from public.tr_share_token
   where trip_id = p_trip_id and revoked = false and expires_at > v_now
   order by at desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'token', v_share.token, 'expires_at', v_share.expires_at);
  end if;

  insert into public.tr_share_token (token, trip_id, by_id, at, expires_at)
  values (
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),
    p_trip_id, public.current_uid(), v_now, v_now + 24 * 3600000
  )
  returning * into v_share;

  return jsonb_build_object('ok', true, 'token', v_share.token, 'expires_at', v_share.expires_at);
end;
$$;

-- Esta função é chamada por quem NÃO tem sessão — é para isso que existe a
-- chave no URL. Por isso `security definer`, por isso o token tem de bater
-- certo e estar vivo, e por isso a resposta não contém PIN nem contactos.
create or replace function public.tr_share_read(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_share public.tr_share_token;
  v_trip public.tr_trip;
begin
  select * into v_share from public.tr_share_token
   where token = lower(btrim(coalesce(p_token, '')))
     and revoked = false
     and expires_at > public.tr_now_ms();
  if not found then
    return null;
  end if;

  select * into v_trip from public.tr_trip where id = v_share.trip_id;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'code', v_trip.code,
    'state', v_trip.state,
    'kind', v_trip.kind,
    'from', (select name from public.tr_zone where id = v_trip.from_zone_id),
    'to', (select name from public.tr_zone where id = v_trip.to_zone_id),
    'distance_km', v_trip.distance_km,
    'price_kz', v_trip.price_kz,
    'driver_name', v_trip.driver_name,
    'car_model', v_trip.car_model,
    'plate', v_trip.plate,
    'created_at', v_trip.created_at,
    'expires_at', v_share.expires_at
  );
end;
$$;

-- — B6: quadro da semana ———————————————————————————————————————————————————————————

-- Só corridas fechadas, só o último punhado de dias, e SEM NENHUM VALOR em
-- Kwanza. Uma equipa de uma a três pessoas não audita ganhos; um quadro com
-- números errados sobre dinheiro seria pior do que não ter quadro.
create or replace function public.tr_leaderboard(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since bigint;
begin
  v_since := public.tr_now_ms() - greatest(1, least(31, coalesce(p_days, 7))) * 86400000;

  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.trips desc, x.rating desc, x.public_name)
    from (
      select
        d.id,
        d.public_name,
        c.label as vehicle,
        d.plate,
        count(t.id)::int as trips,
        round(avg(t.passenger_rating), 2) as rating
      from public.tr_trip t
      join public.tr_driver d on d.id = t.driver_id
      join public.tr_vehicle_class c on c.id = d.class_id
      where t.state in ('ended','rated')
        and t.settled_at is not null
        and t.created_at >= v_since
      group by d.id, d.public_name, c.label, d.plate
      order by trips desc
      limit 20
    ) x
  ), '[]'::jsonb);
end;
$$;

-- — RLS —————————————————————————————————————————————————————————————————————————————

alter table public.tr_review enable row level security;
alter table public.tr_saved_place enable row level security;
alter table public.tr_trip_pref enable row level security;
alter table public.tr_referral enable row level security;
alter table public.tr_share_token enable row level security;

drop policy if exists tr_review_read on public.tr_review;
create policy tr_review_read on public.tr_review
  for select to authenticated
  using (
    by_id = public.current_uid()
    or trip_id in (select id from public.tr_trip where passenger_id = public.current_uid())
    or trip_id in (
      select id from public.tr_trip
      where driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    )
    or public.is_admin()
  );

-- Nenhuma política de escrita: o elogio entra por `tr_add_review`, que é quem
-- valida as estrelas, o papel e a lista de elogios permitidos.

drop policy if exists tr_saved_place_owner on public.tr_saved_place;
create policy tr_saved_place_owner on public.tr_saved_place
  for all to authenticated
  using (owner_id = public.current_uid())
  with check (owner_id = public.current_uid());

drop policy if exists tr_trip_pref_read on public.tr_trip_pref;
create policy tr_trip_pref_read on public.tr_trip_pref
  for select to authenticated
  using (
    trip_id in (select id from public.tr_trip where passenger_id = public.current_uid())
    or trip_id in (
      select id from public.tr_trip
      where driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    )
    or public.is_admin()
  );

drop policy if exists tr_referral_read on public.tr_referral;
create policy tr_referral_read on public.tr_referral
  for select to authenticated
  using (
    who = public.current_uid()
    or owner_id = public.current_uid()
    or public.is_admin()
  );

-- Os tokens de partilha não se lêem pela API: só pela função, com a chave.
drop policy if exists tr_share_token_owner on public.tr_share_token;
create policy tr_share_token_owner on public.tr_share_token
  for select to authenticated
  using (by_id = public.current_uid() or public.is_admin());

-- — Grants ———————————————————————————————————————————————————————————————————————————

revoke all on public.tr_review, public.tr_saved_place, public.tr_trip_pref,
  public.tr_referral, public.tr_share_token
from anon;

-- Os atalhos escrevem-se directamente (a app é o único dono dos dados deles).
-- O resto entra por RPC.
grant select, insert, update, delete on public.tr_saved_place to authenticated;
grant select on public.tr_review, public.tr_trip_pref, public.tr_referral, public.tr_share_token to authenticated;

revoke execute on function
  public.tr_add_review(text, jsonb),
  public.tr_set_trip_pref(text, text),
  public.tr_referral_code(),
  public.tr_claim_referral(text),
  public.tr_decide_referral(text, boolean, text),
  public.tr_share_create(text),
  public.tr_owner_of_code(text),
  public.tr_leaderboard(integer)
from public, anon;

grant execute on function
  public.tr_add_review(text, jsonb),
  public.tr_set_trip_pref(text, text),
  public.tr_referral_code(),
  public.tr_claim_referral(text),
  public.tr_decide_referral(text, boolean, text),
  public.tr_share_create(text),
  public.tr_leaderboard(integer)
to authenticated;

-- A página pública de partilha não tem sessão: só `tr_share_read` pode ser
-- chamada sem estar ligado, e só devolve o que já ia na mensagem de partilha.
grant execute on function public.tr_share_read(text) to anon, authenticated;

-- Os auxiliares de cálculo não são porta de entrada: pertencem ao dono das
-- funções que os chamam, e ninguém mais precisa de os executar pela API.
revoke execute on function
  public.tr_lines_total(jsonb),
  public.tr_min_travel_min(numeric),
  public.tr_trip_start_ms(public.tr_trip),
  public.tr_review_tag_allowed(text),
  public.tr_driver_busy(text)
from public, anon, authenticated;

-- — Nota final —————————————————————————————————————————————————————————————————————————
--
-- Para aplicar:
--   1. Rever este ficheiro linha a linha (é dinheiro e é segurança).
--   2. Correr no editor SQL do projecto, ou `supabase db push`.
--   3. `supabase db advisors` e confirmar que as sondas de `src/lib/extras.ts`
--      passam a responder `true`.
-- Sem aplicar nada disto, a app continua a funcionar exactamente como hoje:
-- os elogios, os atalhos, o ambiente, o convite e a ligação de partilha
-- escondem-se sozinhos.
--
-- ordem: a 0004 antes desta. O `tr_driver_busy()` da A7 lê `tr_ride`, mas fá-lo
-- depois de perguntar se a tabela existe (`to_regclass`), por isso correr só
-- este ficheiro também funciona: sem a 0004 não há corridas de lugares, e a
-- regra fica a aplicar-se só às viagens privadas — que é o que existe.
