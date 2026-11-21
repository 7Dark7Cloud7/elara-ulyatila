-- Elara Trajectoria — 0007 (tarifas editáveis pela equipa, documentos
-- declarados vs. conferidos, e os lugares com nome)
--
-- Este ficheiro NÃO está aplicado. Está escrito para ser revisto e corrido uma
-- vez, quando houver 15 minutos com a app aberta ao lado — depois da 0004 e da
-- 0005, que já estão à espera há mais tempo que esta.
--
-- É idempotente: correr duas vezes não dói. `if not exists`, `drop policy if
-- exists` antes de criar, `add column if not exists`. Nada aqui reescreve
-- linhas existentes nem muda preços em vigor.
--
-- — Porque existe ——————————————————————————————————————————————————————————————————————
--
-- A auditoria de completude (GOALS.md, secção 6-C) passou a app contra o que
-- o Yango, o Heetch, o Bolt e os apps angolanos de carrinha/lotação fazem.
-- Quase tudo o que faltava era código de cliente, e foi feito sem DDL. Isto é
-- o que NÃO se podia fazer sem tocar no servidor, e são três coisas:
--
--   1. **O tarifário não se edita na consola.** `tr_zone`, `tr_vehicle_class`
--      e `tr_delivery_class` têm só política de `select` desde a 0001 — a
--      equipa muda preços no editor SQL. Uma percentagem de comissão já se
--      escrevia pela política `tr_setting_admin`; as classes de carro e de
--      entrega não. Enquanto não houver escrita, um preço errado só se corrige
--      com alguém a escrever SQL, que é exactamente o género de coisa que uma
--      equipa de três pessoas faz às onze da noite.
--   2. **A ficha do motorista não distingue «ele disse» de «nós vimos».**
--      `tr_driver_doc` é sete `boolean` desde a 0001, todos declarados pela
--      própria pessoa. A app já diz isso à letra (e diz que em Angola não há
--      registo público de matrículas, por isso nenhuma app pode escrever
--      «verificámos no registro»). Mas quando a equipa começar a conferir
--      documentos a sério, não há onde guardar o resultado — e a única coisa
--      pior do que não conferir é conferir e não registar quem conferiu.
--   3. **Os nomes dos lugares vivem no bundle.** `src/lib/places.ts` traz 62
--      lugares de Luanda apanhados no OpenStreetMap e conferidos um a um. É
--      rápido, funciona em 2G e não pede chave a ninguém, mas acrescentar um
--      lugar é recompilar e publicar. Uma tabela deixa a equipa acrescentar
--      paragens e marcos sem mexer no código.
--
-- — O que de propósito NÃO faz —————————————————————————————————————————————————————————
--
-- 1. **Nada de geocodificador.** Não há tabela de endereços, não há import de
--    OSM, não há coluna de «morada» em `tr_trip`. Um lugar é um ponto com um
--    nome e uma zona; o resto continua a ser a nota de embarque que a pessoa
--    escreve.
-- 2. **Nada se auto-marca como verificado.** As colunas `*_verified` só se
--    escrevem por política de administrador. A app do motorista não tem
--    nenhuma política de escrita para elas, por isso uma candidatura não pode
--    fabricar o próprio selo — que é a única forma de «Verificado» que uma
--    cidade onde a burla é risco real permite.
-- 3. **Nenhum preço muda aqui.** Esta migração abre a porta à escrita; os
--    `insert` de tarifa continuam os da 0001/0003. Correr este ficheiro não
--    altera uma única linha de `tr_vehicle_class`.
-- 4. **`tr_place` não substitui `tr_zone`.** O preço é sempre o da zona onde o
--    ponto cai (regra que a app já mostra à pessoa). A zona é a unidade
--    comercial; o lugar é só um nome com coordenada. Por isso `zone_id` é
--    `not null` e `on delete restrict`: não se apaga uma zona que ainda dá
--    nome a um lugar.
--
-- — RLS —————————————————————————————————————————————————————————————————————————————————
--
-- Leitura: tudo o que é tabela de praça (zonas, classes, lugares) é legível por
-- qualquer conta autenticada, porque é o que o passageiro precisa de ver antes
-- de pedir. Escritas de tarifário e de verificação: só `public.is_admin()`, com
-- `using` E `with check` — sem o `with check` a pessoa reatribuiria a linha a
-- outro id.
--
-- Onde há linhas pessoais (`tr_driver_doc`), a política é a da 0001: o motorista
-- da linha ou a equipa. Onde há decisão de equipa (`tr_place`), é administrador.
-- Não há nenhuma tabela nova com linhas de passageiro nesta migração, por isso
-- não há política «passageiro vê só as dele» a escrever aqui — e se alguém
-- acrescentar uma, escreve-a.

-- — 1. Escritas de tarifário para a equipa —————————————————————————————————————————————

-- `tr_setting_admin` (0001) já fazia isto para a comissão e as taxas. Faltavam
-- as três tabelas que decidem quanto custa uma corrida.
drop policy if exists tr_zone_admin_write on public.tr_zone;
create policy tr_zone_admin_write on public.tr_zone
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists tr_class_admin_write on public.tr_vehicle_class;
create policy tr_class_admin_write on public.tr_vehicle_class
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists tr_delivery_class_admin_write on public.tr_delivery_class;
create policy tr_delivery_class_admin_write on public.tr_delivery_class
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Um erro de vírgula num `per_km_kz` é dinheiro cobrado a toda a gente, por
-- isso a coluna tem de continuar com as checagens da 0001 (`base_kz >= 0`,
-- `min_kz >= 0`, `seats >= 0`) e a consola tem de mostrar a data da última
-- mudança. Não há trigger de auditoria na app — a equipa é três pessoas e uma
-- linha com `updated_at` já é uma conversa possível.
alter table public.tr_vehicle_class add column if not exists updated_at bigint not null default 0;
alter table public.tr_delivery_class add column if not exists updated_at bigint not null default 0;
alter table public.tr_zone add column if not exists updated_at bigint not null default 0;

-- — 2. Declarado vs. conferido —————————————————————————————————————————————————————————

-- A 0001 tem: bi, licence, logbook, insurance, criminal_record, car_photos,
-- selfie_checked. Todos `boolean` de auto-declaração, escritos pelo próprio
-- motorista (`tr_driver_doc_write`). Nada aqui muda isso — acrescenta a
-- metade que falta: o que uma pessoa da equipa viu, quando, e quem.
--
-- Três estados, não dois: uma declaração pode estar `null` (ainda ninguém
-- olhou), `true` (conferido e bom) ou `false` (conferido e mau). Um `boolean`
-- sem `null` obrigar-me-ia a dizer «não verificado» para «rejeitado», que são
-- coisas que a equipa tem de saber distinguir no ecrã.
alter table public.tr_driver_doc add column if not exists bi_verified boolean;
alter table public.tr_driver_doc add column if not exists licence_verified boolean;
alter table public.tr_driver_doc add column if not exists logbook_verified boolean;
alter table public.tr_driver_doc add column if not exists insurance_verified boolean;
alter table public.tr_driver_doc add column if not exists criminal_record_verified boolean;
alter table public.tr_driver_doc add column if not exists car_photos_verified boolean;

-- A data em que a pessoa declarou é a que já existe (`declared_at`, 0003). A de
-- agora é a da conferência, mais quem a fez, para uma discussão posterior com
-- uma linha em vez de com uma memória.
alter table public.tr_driver_doc add column if not exists verified_at bigint not null default 0;
alter table public.tr_driver_doc add column if not exists verified_by text;

-- «Verificado» só quer dizer «uma pessoa da equipa abriu o PDF e comparou com a
-- matrícula escrita». Não quer dizer que exista um registo público onde
-- comparar — em Angola não há — por isso o texto vive aqui, no comentário, e a
-- app mostra a data e o nome de quem conferiu em vez de um selo sem origem.

-- Só a equipa escreve estas colunas, e só com `update` de coluna escolhida: um
-- `insert` permitiria criar a ficha de outra pessoa.
drop policy if exists tr_driver_doc_verify on public.tr_driver_doc;
create policy tr_driver_doc_verify on public.tr_driver_doc
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A leitura já está aberta à equipa pela `tr_driver_doc_read` da 0001, por isso
-- não se repete. O motorista continua a ver a ficha dele — e a ver que um
-- campo é `null` é diferente de ver `false`, que é o que a coluna permite.

-- — 3. Lugares com nome —————————————————————————————————————————————————————————————————

-- Espelho do `src/lib/places.ts` que viaja no bundle. Enquanto a app lê os
-- 62 embutidos (rápido, offline, zero pedidos a terceiros), esta tabela deixa
-- a equipa acrescentar um lugar novo sem recompilar — e é aqui que uma paragem
-- de Cacuaco ou um terminal do Bengo entra quando a operação sair de Luanda.
create table if not exists public.tr_place (
  id text primary key default ('plc_' || replace(gen_random_uuid()::text, '-', '')),
  name text not null,
  -- O bairro / área a que o lugar pertence, em texto. É `parent`, não `zone_id`,
  -- porque «Via Sudeste» ou «Rotunda do Viajante» não são zonas tarifárias.
  parent text not null default '',
  kind text not null default 'lugar'
    constraint tr_place_kind check (kind in
      ('shopping','mercado','hospital','escola','universidade','avenida',
       'rotunda','praia','paragem','terminal','aeroporto','bairro','lugar')),
  lat double precision not null constraint tr_place_lat check (lat between -90 and 90),
  lon double precision not null constraint tr_place_lon check (lon between -180 and 180),
  zone_id text not null references public.tr_zone (id) on delete restrict,
  -- O ponto de paragem de autocarro mais próximo, em metros. É o que a app
  -- mostra («a 300 m da paragem») e a regra dos 700 m para dar um nome a um
  -- pin arrastado. `null` = ainda não medido, que se mostra como «—».
  stop_meters integer constraint tr_place_stop check (stop_meters >= 0),
  -- De onde vem o nome: 'osm' quando foi apanhado no OpenStreetMap e conferido,
  -- 'equipa' quando foi alguém da Elara que o pôs. Nunca se apaga esta
  -- proveniência: um nome inventado pela equipa vale menos que um verificado.
  source text not null default 'equipa'
    constraint tr_place_source check (source in ('osm','equipa')),
  checked_at bigint not null default 0,
  enabled boolean not null default true
);

-- Dois índices, não um: a pesquisa por nome é o que a pessoa faz, e o filtro
-- por zona é o que a praça faz quando a operação cresce para fora de Luanda.
create index if not exists tr_place_name_idx on public.tr_place (lower(name));
create index if not exists tr_place_zone_idx on public.tr_place (zone_id, enabled);

alter table public.tr_place enable row level security;

-- Legível por qualquer conta: é o que está no campo de procura antes de haver
-- viagem nenhuma. Não se abre a `anon` — a app só procura depois de ter sessão.
drop policy if exists tr_place_read on public.tr_place;
create policy tr_place_read on public.tr_place
  for select to authenticated using (true);

-- Escreve a equipa. `for all` com as duas checagens: sem `with check` uma
-- política de `all` deixaria mover uma linha para outro `id` e perder-lhe o rasto.
drop policy if exists tr_place_admin_write on public.tr_place;
create policy tr_place_admin_write on public.tr_place
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Uma linha por nome dentro da mesma zona: «Kero» repetido três vezes com três
-- coordenadas é o bug que faz a app escolher a pior. O índice é sobre o nome
-- normalizado (minúsculas, sem espaços nas pontas) porque a pessoa escreve
-- «kero» e a equipa escreve «Kero ».
create unique index if not exists tr_place_one_per_zone
  on public.tr_place (zone_id, lower(btrim(name)));

-- — Verificação depois de correr ————————————————————————————————————————————————————————
--
-- 1. `select count(*) from pg_policies where tablename like 'tr_%' and qual like '%FOR ALL%';`
--    → três de tarifário, uma de `tr_place`, mais as que já existiam.
-- 2. Com uma conta normal: `update public.tr_vehicle_class set min_kz = 1 where id = 'economico';`
--    → **0 linhas**, sem erro ruidoso. É o teste que interessa: a escrita tem
--    de ser invisível para quem não é da equipa, não devolver uma exceção que
--    a consola tenha de traduzir.
-- 3. Com a conta da equipa: o mesmo `update` → 1 linha, e `updated_at` fica a
--    zero até a consola o escrever de propósito (é por isso que a coluna tem
--    `default 0` — não finge que foi tocada).
-- 4. `select licence_verified from public.tr_driver_doc limit 1;` → `null`, não
--    `false`. A diferença é a razão de serem colunas novas.
-- 5. Na app: nada muda. `tr_place` ainda não é lida por lado nenhum — a
--    localização exacta hoje vem do bundle. Esta tabela é a porta, não a casa;
--    a casa é a vaga em que a consola tiver um ecrã de lugares.
