-- Elara Trajectoria — 0002 (mapa e frota)
--
-- O que faltava para o ecrã do Uber/bolt funcionar: ver carros por perto e
-- seguir o motorista que nos foi atribuído. Nada aqui troca de lugar com a
-- 0001; são três capacidades novas, todas deliberadas.
--
-- 1. `tr_haversine_km(lat, lon, lat, lon)` — linha pura entre coordenadas,
--    para o cliente saber a que distância está o carro. Não é navegação e não
--    multiplica por 1,3: o factor de estrada só existe na tarifa (0001).
--
-- 2. `tr_nearby_drivers(lat, lon, raio)` — os pontos de carros no ecrã de
--    quem pede. É SECURITY DEFINER porque os motoristas só podem ler a sua
--    própria presença (política de 0001), e aqui é preciso ver a dos outros.
--    Em troca, a função devolve de propósito o mínimo possível:
--      · só quem está aprovado E ligado;
--      · só quem atualizou a posição nos últimos 3 minutos (um carro que
--        ficou com o telemóvel fechado desaparece do mapa);
--      · posição arredondada a ~110 m — ninguém é seguido ao metro;
--      · só dentro do raio pedido, e no máximo 15 km;
--      · sem nome, sem matrícula, sem telefone: só a categoria, para o ícone.
--    Anónimos não chamam isto. Só quem entrou.
--
-- 3. `tr_review_driver` — aprovar, suspender ou banir uma candidatura. É o
--    único caminho para `status = 'approved'`, e só a equipa o pode fazer.
--    Sem isto o mapa estaria sempre vazio e nenhuma viagem seria aceite.

-- — Helpers ——————————————————————————————————————————————————————————————————

create or replace function public.tr_haversine_km(
  p_lat_a double precision,
  p_lon_a double precision,
  p_lat_b double precision,
  p_lon_b double precision
)
returns numeric
language sql
immutable
as $$
  select case
    when p_lat_a is null or p_lon_a is null or p_lat_b is null or p_lon_b is null then 0
    else round((
      2 * 6371 * asin(sqrt(
        power(sin(radians(p_lat_b - p_lat_a) / 2), 2) +
        cos(radians(p_lat_a)) * cos(radians(p_lat_b)) *
        power(sin(radians(p_lon_b - p_lon_a) / 2), 2)
      )) * 10
    ) / 10)
  end
$$;

create index if not exists tr_presence_recent_idx on public.tr_driver_presence (updated_at desc);

-- — Carros por perto —————————————————————————————————————————————————————————

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

-- — Aprovar motoristas ———————————————————————————————————————————————————————

create or replace function public.tr_review_driver(
  p_driver_id text,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver public.tr_driver;
begin
  if not public.is_admin() then
    raise exception 'Só a equipa Elara pode decidir sobre candidaturas';
  end if;
  if p_decision not in ('approved', 'suspended', 'banned') then
    raise exception 'Decisão não reconhecida';
  end if;

  select * into v_driver from public.tr_driver where id = p_driver_id;
  if not found then
    raise exception 'Motorista não encontrado';
  end if;
  if p_decision = 'banned' and v_driver.status = 'approved' then
    raise exception 'Suspenda primeiro: um motorista aprovado não pode ser banido à frente de viagens em curso';
  end if;

  update public.tr_driver
     set status = p_decision,
         -- Quem entra em trabalho liga-se ele próprio; a equipa não o liga.
         online = false,
         approved_at = case
           when p_decision = 'approved' and v_driver.approved_at is null
             then public.tr_now_ms()
           else v_driver.approved_at
         end,
         trial_trips_left = case
           when p_decision = 'approved' and v_driver.approved_at is null
             then (select st.trial_trip_limit from public.tr_setting st where st.id = 1)
           else v_driver.trial_trips_left
         end
   where id = p_driver_id;

  -- Um motorista suspenso ou banido deixa de aparecer no mapa.
  if p_decision <> 'approved' then
    delete from public.tr_driver_presence where driver_id = p_driver_id;
  end if;

  return jsonb_build_object('ok', true, 'id', p_driver_id, 'status', p_decision);
end;
$$;

-- — Grants ———————————————————————————————————————————————————————————————————

revoke execute on function public.tr_nearby_drivers(double precision, double precision, double precision)
  from public, anon;
revoke execute on function public.tr_review_driver(text, text) from public, anon;

grant execute on function public.tr_nearby_drivers(double precision, double precision, double precision)
  to authenticated;
grant execute on function public.tr_review_driver(text, text) to authenticated;

-- O `tr_review_driver` já se protege com is_admin(); a update directa de
-- tr_driver continua a ser só da equipa (política tr_driver_admin_write).
