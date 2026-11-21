-- Elara Trajectoria — 0008 (a validade dos papéis do motorista)
--
-- Este ficheiro NÃO está aplicado. Vai atrás da 0004, da 0005 e da 0007, nessa
-- ordem, quando houver tempo de as correr todas com a app aberta ao lado.
--
-- Idempotente: `add column if not exists`, nenhuma reescrita de linhas, nenhuma
-- policy nova. Correr duas vezes não dói.
--
-- — Porque existe ——————————————————————————————————————————————————————————————————————
--
-- É o item 4 da auditoria de completude (GOALS.md, secção 6-C): «documentos do
-- motorista com validade». Em Luanda o seguro vence a cada ano, a inspeção
-- técnica também, a carta de condução tem prazo e o BI idem. Um motorista com o
-- seguro vencido é o carro que a polícia para e o passageiro que fica à porta
-- sem saber porquê — e a Elara, que vende confiança, não tem hoje onde guardar
-- uma única data.
--
-- A `0001` deu-nos sete `boolean`: «tem», «não tem». Serve para a candidatura,
-- não serve para a rua. O que falta ao boolean é o dia.
--
-- — O que de propósito NÃO faz —————————————————————————————————————————————————————————
--
--   * **Não suspende ninguém.** Um papel vencido não desliga uma conta, não é
--     callback nem trigger. A razão é a mesma do `tr_violation`: sem um
--     mecanismo para *levantar* uma suspensão, automaticamente desligar alguém
--     é tirar o trabalho a uma pessoa com um botão que ninguém sabe anular. A
--     app avisa o motorista, e a conversa com a equipa acontece depois.
--   * **Não guarda ficheiros.** Não há coluna de URL, não há storage, não há
--     foto do seguro. O que está aqui é uma data.
--   * **Não finge verificação.** Estas quatro datas escreve-as o motorista, e
--     `expiry_entered_by` fica `'motorista'`. Quando a equipa conferir um papel
--     no balcão, é ela que passa esse campo para `'equipa'` — a 0007 já abriu
--     os `*_verified` para isso mesmo.
--   * **Não há registo público em Angola** a que a app possa chamar para saber
--     se o seguro existe. Nenhuma linha daqui passa por cima dessa verdade.
--
-- — Porque é tão curto —————————————————————————————————————————————————————————————————
--
-- As policies de `tr_driver_doc` já estão certas desde a 0001: o motorista lê e
-- escreve a própria linha (juntando por `tr_driver.account_id`), e `is_admin()`
-- lê e escreve todas. Coluna nova herda a política da tabela — por isto não há
-- nada a criar aqui. É literalmente só o `ALTER TABLE`.
--
-- O `check` do teto (2100-01-01) existe porque a PostgREST aceita o que se
-- escrever: um `2526-05-20` digitado ao telemóvel entraria sem barulho, e a
-- consola passaria a mostrar um papel válido para o neto do motorista.

-- — As datas —————————————————————————————————————————————————————————————————————————————
--
-- `0` quer dizer «sem data», e é o `default`. Nunca `null` e nunca «hoje»: uma
-- coluna à toa faria o cliente escolher entre dois significados, e «hoje» é a
-- data que mais se escreve por engano. Meia-noite de quem escreve, meia-noite de
-- quem lê — a app guarda o dia ao **meio-dia UTC** precisamente para que nenhum
-- fuso mova o dia de calendário.

alter table public.tr_driver_doc
  add column if not exists licence_until bigint not null default 0
    constraint tr_doc_licence_until check (licence_until between 0 and 4102444800000);

alter table public.tr_driver_doc
  add column if not exists insurance_until bigint not null default 0
    constraint tr_doc_insurance_until check (insurance_until between 0 and 4102444800000);

alter table public.tr_driver_doc
  add column if not exists inspection_until bigint not null default 0
    constraint tr_doc_inspection_until check (inspection_until between 0 and 4102444800000);

alter table public.tr_driver_doc
  add column if not exists bi_until bigint not null default 0
    constraint tr_doc_bi_until check (bi_until between 0 and 4102444800000);

-- — De quem é a data, e quando foi escrita ———————————————————————————————————————————————
--
-- É isto que separa «o motorista diz que o seguro dura até…」 de «a equipa viu o
-- certificado e anotou a data». Sem este par, as duas coisas ficam misturadas na
-- mesma coluna e a ficha perde o único valor que tem.

alter table public.tr_driver_doc
  add column if not exists expiry_updated_at bigint not null default 0;

alter table public.tr_driver_doc
  add column if not exists expiry_entered_by text not null default 'motorista'
    constraint tr_doc_expiry_entered_by check (expiry_entered_by in ('motorista', 'equipa'));

comment on column public.tr_driver_doc.inspection_until is
  'Data no certificado de inspeção técnica. 0 = ainda ninguém escreveu nada.';
comment on column public.tr_driver_doc.expiry_entered_by is
  'Quem pôs as datas: ''motorista'' é uma declaração, ''equipa'' é quem olhou para o papel.';

-- — O que a app já faz com isto ——————————————————————————————————————————————————————————
--
-- `src/lib/expiry.ts` escreve estas colunas quando elas existem e, quando não
-- existem, guarda as datas no telemóvel da própria pessoa. A detecção é a
-- ausência da coluna: enquanto este ficheiro não correr, `papersLive()` responde
-- `false` e o ecrã diz «ficam só neste telemóvel». Aplicada a 0008, a mesma
-- interface passa a dizer «ficam na sua ficha» sem uma linha de código mudar.
--
-- Nota para quem for aplicar: a ordem das colunas em `select` não importa, mas a
-- 0007 tem de vir antes se se quiser os `*_verified` na mesma leitura — as duas
-- mexem na mesma tabela e não se contradizem em nada.

-- — Verificação depois de correr —————————————————————————————————————————————————————————
--
-- 1. `select licence_until, insurance_until, inspection_until, bi_until,
--      expiry_entered_by from public.tr_driver_doc limit 1;`
--    → quatro zeros e `motorista`. Se antes desta linha a query dava «column
--    does not exist», é precisamente assim que a app sabia que não estava
--    aplicada.
-- 2. Com uma conta de motorista: `update public.tr_driver_doc set
--    insurance_until = 1792929600000 where driver_id = '<id dele>';` → 1 linha.
--    É a policy da 0001 a fazer o trabalho, não uma policy nova.
-- 3. Com a mesma conta, noutro `driver_id` → **0 linhas**, sem erro. Se devolveu
--    1, parar tudo: é o RLS da tabela que se perdeu, não este ficheiro.
-- 4. `select count(*) from pg_policies where tablename = 'tr_driver_doc';` → a
--    mesma contagem de antes. Este ficheiro não cria políticas; se criou, foi
--    copiado a mais alguma coisa.
-- 5. Na app: abrir a praça do motorista com a 0004/0005/0007 já corridas. O
--    cartão «Os seus papéis» passa a gravar na ficha, e a frase em baixo do
--    formulário muda sozinho para «ficam na sua ficha de motorista».
--
-- — A prova de que este ficheiro falta (medida, não presumida) ————————————————————————
--
-- No dia em que este ficheiro foi escrito, 2026-10-25, com a publishable key e
-- sem sessão, pela REST:
--
--   GET /rest/v1/tr_driver_doc?select=licence_until  -> 400 {"code":"42703",
--       "message":"column tr_driver_doc.licence_until does not exist"}
--   GET /rest/v1/tr_driver_doc?select=declared_at    -> 401 {"code":"42501",
--       "message":"permission denied for table tr_driver_doc"}
--
-- Os dois números juntos dizem tudo: a tabela existe (a coluna dela devolve
-- 401), a desta migração não existe (devolve 42703), e a PostgREST valida a
-- coluna ANTES de dar a licença — por isso a sonda da app (`papersLive()`) não
-- precisa de sessão para distinguir «falta a migração» de «falta-me a
-- permissão». Depois de correr este ficheiro, a primeira linha passa a dar o
-- mesmo 401 da segunda. É essa a mudança que a app lê.
