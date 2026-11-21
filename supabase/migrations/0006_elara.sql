-- Elara Trajectoria — 0006 (a ligação entre a encomenda do Elara e a viagem)
--
-- Este ficheiro NÃO está aplicado. Está escrito para ser revisto e corrido uma
-- vez, ao lado do Elara Market aberto, quando houver 15 minutos.
--
-- — O problema ————————————————————————————————————————————————————————————————————————
--
-- Quem compra no Elara Market e quem move a caixa são duas apps, mas é sempre
-- a mesma pessoa e a mesma conta. Hoje a pessoa copia o código da encomenda,
-- abre a Trajectoria, escreve de novo o que vai dentro, o nome de quem recebe,
-- o telefone e o bairro — e no fim nenhuma das duas sabe que aquela corrida
-- era aquela encomenda.
--
-- — O que isto resolve, e o que de propósito NÃO resolve ———————————————————————————————
--
-- 1. A leitura da encomenda NÃO precisa desta migração. O Elara já tem
--    `orders_select_participants` e `order_items_select_participants`: o
--    comprador lê a *dele* com a sessão dele, e mais ninguém. Por isso a app
--    Trajectoria já preenche o formulário de entrega só com o código, sem
--    aqui se criar nenhuma porta nova.
-- 2. Esta migração acrescenta só o registo: a viagem fica ligada ao código da
--    encomenda, com dupla prova de propriedade. `tr_link_order` só escreve se
--    a viagem pertence a quem chama E a encomenda pertence a quem chama. Nem o
--    código de outra pessoa, nem uma viagem de outra pessoa.
-- 3. A morada é texto livre no Elara («rua, bairro, cidade»). Não é um ponto no
--    mapa. Por isso a Trajectoria mostra a zona que *parece* ser a da morada e
--    deixa a pessoa tocar para a aplicar: a sugestão nunca é o destino.
-- 4. Não se liga a loja como origem. `profiles_public` não publica morada
--    nenhuma e `profiles` só é legível pelo dono e pela equipa — é decisão do
--    Elara, e esta migração não a contorna por trás.
-- 5. Não circula dinheiro. A corrida paga-se na Trajectoria, como qualquer
--    entrega; o que se pagou no Elara fica no Elara. Uma linha na app diz isso
--    à pessoa antes de ela pedir a corrida.
--
-- — RLS —————————————————————————————————————————————————————————————————————————————————
--
-- O passageiro vê a ligação da viagem dele; o motorista vê a ligação das
-- viagens atribuídas ao seu conta; a equipa vê tudo. Não há política de
-- escrita — escrever é só pela RPC, que é quem faz as duas verificações.
--
-- Convenções herdadas: id de texto com prefixo, hora bigint em ms pelo relógio
-- do servidor (`tr_now_ms()`), RPCs `security definer` com
-- `set search_path = public, pg_temp`, `public.current_uid()` e `public.is_admin()`
-- como únicas fontes de identidade.

create table if not exists public.tr_order_link (
  id text primary key default ('olk_' || replace(gen_random_uuid()::text, '-', '')),
  trip_id text not null unique references public.tr_trip (id) on delete cascade,
  -- O código do Elara, tal como aparece ao comprador. Sem chave estrangeira:
  -- são dois produtos no mesmo servidor, com ciclos de migração próprios, e
  -- uma FK faria esta tabela depender de um esquema que pode não estar aqui.
  order_code text not null constraint tr_order_link_code_shape
    check (order_code ~ '^[A-Za-z0-9_-]{6,48}$'),
  buyer_id text not null references public.profiles (id) on delete cascade,
  at bigint not null default 0,
  constraint tr_order_link_one_link_per_order_trip unique (order_code, trip_id)
);

create index if not exists tr_order_link_order_idx on public.tr_order_link (order_code);
create index if not exists tr_order_link_buyer_idx on public.tr_order_link (buyer_id, at desc);

-- — A escrita ————————————————————————————————————————————————————————————————————————————

-- Uma viagem leva uma encomenda. Se a pessoa quiser mover a mesma compra em
-- duas viagens (recolha e entrega, por exemplo), pede a segunda viagem sem
-- ligação — a ligação serve para saber *o que* está a caminho, não para
-- contar viagens.
create or replace function public.tr_link_order(p_trip_id text, p_order_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text;
  v_code text;
  v_trip public.tr_trip;
  v_link public.tr_order_link;
  v_exists boolean;
begin
  v_uid := public.current_uid();
  if v_uid = '' then
    raise exception 'Entra primeiro com a conta do Elara';
  end if;

  v_code := btrim(coalesce(p_order_code, ''));
  -- Os códigos do Elara são maiúsculos (`ELR-000000-AAAA`); outros formatos
  -- ficam como vieram.
  if v_code ~* '^elr-' then
    v_code := upper(v_code);
  end if;
  if v_code !~ '^[A-Za-z0-9_-]{6,48}$' then
    raise exception 'Código de encomenda inválido';
  end if;

  select * into v_trip from public.tr_trip where id = p_trip_id;
  if not found then
    raise exception 'Viagem desconhecida';
  end if;
  if v_trip.passenger_id <> v_uid then
    raise exception 'Só quem pediu a viagem a liga à encomenda';
  end if;
  if v_trip.state = 'cancelled' then
    raise exception 'Uma viagem cancelada não leva encomenda';
  end if;

  -- A segunda prova, e a que importa: a encomenda tem de ser desta conta.
  -- No Elara o `buyer_id` é texto e é comparável ao uid; se as tabelas do
  -- Market não estiverem neste servidor, dizemos isso em vez de rebentar.
  if to_regclass('public.orders') is null then
    raise exception 'O Elara Market não está neste servidor';
  end if;
  select exists (
    select 1 from public.orders
     where id = v_code and buyer_id = v_uid and status <> 'cancelled'
  ) into v_exists;
  if not v_exists then
    raise exception 'Essa encomenda não está nesta conta';
  end if;

  select * into v_link from public.tr_order_link where trip_id = p_trip_id;
  if found then
    if v_link.order_code = v_code then
      return jsonb_build_object('ok', true, 'id', v_link.id, 'already', true);
    end if;
    raise exception 'Esta viagem já está ligada a outra encomenda';
  end if;

  insert into public.tr_order_link (trip_id, order_code, buyer_id, at)
  values (p_trip_id, v_code, v_uid, public.tr_now_ms())
  returning * into v_link;

  return jsonb_build_object('ok', true, 'id', v_link.id, 'already', false);
exception
  when foreign_key_violation then
    -- `profiles` sem linha para esta conta: o registo fica com a prova a mais,
    -- nunca com a viagem por criar. A ligação é um extra, não um bloqueio.
    return jsonb_build_object('ok', false, 'error', 'Conta sem perfil no Elara');
end;
$$;

-- — RLS —————————————————————————————————————————————————————————————————————————————————

alter table public.tr_order_link enable row level security;

drop policy if exists tr_order_link_read on public.tr_order_link;
create policy tr_order_link_read on public.tr_order_link
  for select to authenticated
  using (
    buyer_id = public.current_uid()
    or trip_id in (select id from public.tr_trip where passenger_id = public.current_uid())
    or trip_id in (
      select id from public.tr_trip
      where driver_id in (select id from public.tr_driver where account_id = public.current_uid())
    )
    or public.is_admin()
  );

-- — Grants ———————————————————————————————————————————————————————————————————————————————

revoke all on public.tr_order_link from anon;
grant select on public.tr_order_link to authenticated;

revoke execute on function public.tr_link_order(text, text) from public, anon;
grant execute on function public.tr_link_order(text, text) to authenticated;

-- — Nota final —————————————————————————————————————————————————————————————————————————
--
-- Para aplicar:
--   1. Rever esta linha a linha: é a única coisa escrita entre dois produtos.
--   2. Correr no editor SQL do projecto `bkubhmovgojhutevgzvt`, ou `supabase db push`.
--   3. `supabase db advisors`, e testar com uma conta que tenha uma encomenda
--      real no Market: o botão «Entregar com a Trajectoria» abre
--      `#/encomenda/<código>`, a app lê a encomenda, e ao criar a viagem a
--      linha aparece em `tr_order_link`.
--
-- Sem aplicar este ficheiro, tudo o que já funciona continua a funcionar: a
-- encomenda lê-se e preenche-se da mesma forma (é o RLS do Elara, não isto), e
-- `src/lib/orders.ts` trata o erro de a função não existir como «não ligado»,
-- sem mostrar nada a quem está a pedir a corrida.
