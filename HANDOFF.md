# Handoff — Elara Trajectoria

Para quem continua este código noutro PC. Leste inteiro antes de mexer: metade
das coisas que parecem bugs são decisões já tomadas, e estão explicadas aqui.

O que é: app de corridas e entregas em Angola (estilo Uber), com lugares
partilhados por carrinha, carga interprovincial e aluguer. Web primeiro
(React + Vite), Android pelo Capacitor, backend Supabase.

- Produção: https://trajectoria-ao.vercel.app
- Dev: `npm run dev` → http://localhost:5180
- Supabase: project `bkubhmovgojhutevgzvt` (partilhado com o Elara Marketplace;
  tudo o que é nosso usa o prefixo `tr_`)
- Irmãos mais velhos (mesma equipa, código separado): `elara-marketplace`
  (design system) e `kende-app` (lógica de domínio de mobilidade)

---

## 0. o pacote

Código completo em `trajectoria-codigo.zip` (1 132 KB, 165 ficheiros — medidos com
`python -m zipfile`, não estimados). Dentro tem
`src/` (com o índice de **2 391 lugares** em `src/data/luanda-places.json`),
`supabase/migrations/` (0001 a 0008), `android/` (só fontes do projecto
Capacitor), `scripts/`, `public/`, a config (`tailwind.config.js`,
`vite.config.ts`, `tsconfig*`), `package-lock.json`, este ficheiro, `GOALS.md`,
`.gitignore` e `.env.example`.

Fora do pacote, de propósito: `node_modules/` (fazer `npm ci`), `dist/` (build),
`android/app/src/main/assets/public/` (o bundle sincronizado, sempre velho),
`build-artifacts/*.apk`, caches do Gradle, `android/local.properties` (o caminho
do SDK é de cada máquina) e `.env.local` (as chaves). **As chaves não viajam em
zip nem em chat** — quem recebe entra no dashboard do Supabase e copia a
publishable key para `.env.local`.

Fora do pacote está também **a pasta `../.pkg/`, e este HANDOFF cita-a a sério**:
o builder do índice de lugares (`build_places.cjs`), os nomes da equipa com prova
(`places_team.json`), as sondas (`places_probe*.cjs`, `places_show.cjs`) e os
testes que correm contra os ficheiros reais (`places_test.cjs`,
`reports_test.cjs`, `plates_test.cjs`, `expiry_test.cjs`, `dataexport_test.cjs`,
`where_test.cjs`, `design_test.cjs`, `contrast.cjs`) vivem ali, ao lado da pasta
do projecto, e
**pedem-se ao dono**.
Sem eles continua a poder-se construir e correr a app; o que não se pode é
acrescentar um bairro ao índice nem provar uma mudança sem eles.

Como se faz o pacote (a cópia é branca-listada em `../.pkg/mkzip.mjs`, o zip com
`python -m zipfile` — o `Compress-Archive` do PowerShell escreve os nomes com
`\`, que um `unzip` do Linux não entende):

```bash
node ../.pkg/mkzip.mjs                        # copia para ../.pkg/stage2/trajectoria
cd ../.pkg/stage2 && python -m zipfile -c ../../trajectoria-codigo.zip trajectoria
```


```bash
npm ci                     # usar o package-lock, não npm install
cp .env.example .env.local # pedir o valor real da chave ao dono
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js --port 5180
```

**Gotcha do Windows/Git Bash:** `npm run build` e `npx tsc` podem sair à custa
de zero sem fazer nada (o shim do npm falha neste shell). Daí os caminhos
`node node_modules/...` diretos. Se um comando de build "correu bem" mas nada
mudou, é isto. Verificar sempre: hash em `dist/assets/` e a data do ficheiro.

Node 24, React 18.3, Vite 5.4, Tailwind 3.4, TypeScript estrito. Sem router:
os ecrãs trocam por estado de tab. As únicas duas rotas são `#/viagem/<token>`
(a página pública de partilha, sem sessão) e `#/encomenda/<código>` (a ligação
que o Elara Marketplace gera — ver secção 3).

## 2. como o backend está feito (ler antes de escrever SQL)

Migrações em `supabase/migrations/`:

| ficheiro | estado | o que é |
|---|---|---|
| `0001_trajectoria.sql` | aplicada | tabelas, tarifas, RPCs do ciclo da viagem |
| `0002_mapa.sql` | aplicada | `tr_haversine_km`, `tr_nearby_drivers`, aprovar motorista |
| `0003_frota.sql` | aplicada | Hiace/carga/aluguer, candidatura de motorista |
| `0004_lugares.sql` | **NÃO aplicada** | `tr_ride` (corrida de lugares), ponto de embarque |
| `0005_core.sql` | **NÃO aplicada** | recibo honesto, elogios, atalhos, convite, partilha, travão de motorista ocupado |
| `0006_elara.sql` | **aplicada** (confirmada por SQL a 22-10: `tr_order_link` existe, com RLS) | `tr_order_link` + `tr_link_order`: a ligação encomenda↔viagem com o Marketplace |
| `0007_admin_places.sql` | **NÃO aplicada** | políticas de escrita de tarifário para a equipa (`tr_zone`/`tr_vehicle_class`/`tr_delivery_class` + `updated_at`), colunas `*_verified` em `tr_driver_doc` (só a equipa escreve), e `tr_place` (lugares com nome geríveis pela equipa) |
| `0008_document_validity.sql` | **NÃO aplicada** | cinco colunas em `tr_driver_doc`: quatro datas de validade (`licence_until`/`insurance_until`/`inspection_until`/`bi_until`, `bigint not null default 0`, `0` = ninguém escreveu) + `expiry_updated_at` + `expiry_entered_by` (`motorista` \| `equipa`). Zero tabelas, zero policies, zero RPCs — de propósito |

Convenções, não são sugestões:

- ids de texto com prefixo (`trp_`, `drv_`, `rid_`), horas `bigint` em ms só
  pelo relógio do servidor (`tr_now_ms()`), Kwanza `integer`.
- RPCs `security definer` com `set search_path = public, pg_temp`; identidade
  apenas por `public.current_uid()` / `public.is_admin()`.
- **Cada RPC precisa de `revoke ... from public, anon` E `grant execute ... to
  authenticated`.** Só revoke = 42501 na cara do utilizador.
- Helpers internos (nada de API): `revoke ... from public, anon, authenticated`.
- RLS em todas as tabelas: passageiro só vê linhas dele; motorista só linhas de
  viagens atribuídas a ele; equipa vê tudo. Excepção deliberada: `tr_saved_place`
  — a equipa NÃO lê, é um caderno de moradas pessoais.
- Nunca mostrar o telefone de um lado ao outro. Comunicação é pelo chat da
  viagem, moderado no servidor.
- Nada de crédito automático: o saldo de convite fica `pending` até a equipa
  confirmar pelo fluxo `tr_money_request` que já existe.

**Sondas (o padrão que permite publicar sem aplicar migrações):** em
`src/lib/extras.ts` e `src/lib/rides.ts`, cada tabela/função nova é sondada com
`select('id').limit(1)` e um `isNotReady(error)` que reconhece 42P01 / PGRST205 /
PGRST202. Se a 0005 não estiver aplicada, o ecrã simplesmente não aparece. Por
isso: **toda a tabela sondada tem de ter coluna `id`.**

## 3. o estado de hoje (25-10-2026)

**Objectivos, regras e estado por peça estão em `GOALS.md`**, ao lado deste
ficheiro — é o arquivo do que foi pedido pelo dono, com a palavra dele nas
regras de segurança. Este HANDOFF é o «como trabalhar nisto»; o GOALS é o «o que
tem de ficar verdade».

Frontend publicado e OK. As migrações 0004, 0005, 0007 e 0008 estão **escritas e
revisadas, mas não aplicadas**, por decisão do dono («não apliques»): quem aplica
é ele no painel, ou o MCP quando estiver estável. Verificado hoje por SQL no
projecto `bkubhmovgojhutevgzvt`: `tr_ride`, `tr_review`, `tr_saved_place`,
`tr_trip_pref`, `tr_referral`, `tr_share_token` não existem, `tr_trip` não tem
coluna `pickup` e `tr_driver_doc` não tem coluna `licence_until` (é exactamente
por isso que a leitura do motorista tenta `select` com e sem `pickup`, e é por
isso que `papersLive()` existe em `src/lib/expiry.ts`);
**0001–0003 e 0006 estão aplicadas** — `tr_order_link` existe, com RLS. Assim que
houver MCP firme: aplicar 0004 → 0005 → 0007 → 0008 por essa ordem, correr
`supabase db advisors`, e confirmar que as sondas passam a `true`.

**Como se verifica o estado do servidor**: o `execute_sql` do MCP responde a
leituras curtas (três de seguida hoje, e depois voltou a dar `-32603`;
`get_advisors` nunca respondeu). Sem MCP, com a publishable key do `.env.local`,
um `GET /rest/v1/<tabela>?select=id&limit=1` responde **401** quando a tabela
existe mas o `anon` não tem grant (é o caso de todas as `tr_*`), **404** quando
não existe (PGRST205), e **200 com `[]`** quando é legível e o RLS filtra tudo
(`orders`, `order_items`, `profiles`). **Um quarto número que vale a pena
conhecer: 400 com `code: 42703`** («column … does not exist») distingue a
*coluna* que falta do *grant* que falta — medido a 2026-10-25, `tr_driver_doc
?select=licence_until` deu 400/42703 enquanto `?select=declared_at` deu 401 na
mesma tabela. A PostgREST valida a coluna antes de dar a licença, por isso uma
sonda anónima chega para saber se uma migração de colunas foi aplicada: é assim
que `papersLive()` em `src/lib/expiry.ts` decide se as datas vivem no servidor ou
só no telemóvel, sem sessão e sem chave secreta.
Cuidado com o 404: ele também aparece
quando o cache de schema do PostgREST ainda não viu a tabela nova, por isso uma
tabela recém-aplicada pode parecer inexistente — `tr_order_link` deu 404 numa
sonda desta manhã e 401 à tarde, e a verdade só o SQL o mostrou (a tabela estava
lá; ou tinha sido criada entretanto no painel, ou o cache ainda não a tinha
visto). Na dúvida, o SQL (`to_regclass`) é que manda.

### A ligação com o Elara Marketplace

Mesma base de dados, mesma chave, mesma tabela `auth.users`. Quem compra no
Market pode entregar com a Trajectoria sem que nada passe pelo URL excepto o
código da encomenda:

1. `elara-marketplace/src/views/OrdersView.tsx` — botão **«Entregar com a
   Trajectoria»**, só para o comprador (`activeTab === 'purchases'`), só com
   conta real (uuid) e só nos estados `held`/`shipped`. Abre
   `trajectoria-ao.vercel.app/#/encomenda/<id do pedido>` em novo separador.
2. `src/App.tsx` — `orderCodeFromHash()` e o efeito que lê a encomenda. O
   `authKnown` existe porque a sessão chega tarde: sem ele, quem entra pela
   ligação antes do `getSession` responder ia para um login que já tinha.
   Sem sessão, o código fica em espera e a leitura acontece quando a pessoa
   entra — não se perde o link.
3. `src/lib/orders.ts` — a ponte. A leitura é feita com a **política do
   Market** (`orders_select_participants`, migração 014 do Marketplace): pedimos
   por código e não vem nada se o código não for nosso. Não é preciso migração
   nenhuma para isto funcionar, e é por isso que a 0006 só grava o par.
4. `src/components/OrderNotice.tsx` — os três estados, o preço pago no Elara
   explicado como separado da corrida, e a zona adivinhada da morada como
   **sugestão que só entra com um toque**. A morada do Market é texto livre;
   adivinhar-lhe o destino silenciosamente era estragar entregas.
5. `RideView.tsx` pré-preenche a entrega (`what`, quem recebe, telefone,
   tamanho) e, depois do `tr_create_trip`, chama `linkOrder()` — que é
   exatamente o `tr_link_order` da 0006 e **fallhá em silêncio** enquanto a
   migração não for aplicada: a entrega acontece, só não aparece ligada.

Três decisões que não se podem inverter sem perguntar ao dono: a **origem**
(loja) não se auto-preenche — `profiles_public` não publica morada e `profiles`
é só do dono e da equipa; o **telefone de quem recebe** nunca vai no URL; e
**nenhum dinheiro circula** entre as duas apps por esta via.

A 0005 fecha sete buracos reais da 0001 (todos decidem dinheiro ou segurança),
listados no cabeçalho do ficheiro. O sétimo é o **motorista ocupado**:
`tr_driver_busy()` impede alguém com uma viagem em curso, ou uma corrida de
lugares aberta, de aceitar outro pedido — e tira esses carros do mapa, para o
pino voltar a significar «este carro pode ir ter consigo».

E também hoje: **passagem de maturidade da UI**, com a folha de tokens da Yango
como referência (pesos 300/400/500/700, frase normal em vez de MAIÚSCULAS,
perseguição negativa nos tamanhos grandes, neutros quentes, sombras neutras):

- `tailwind.config.js`: rampa `zinc` reescrita para cinza quente, escala de tipo
  com nomes (`caption`…`display`), `rounded-control/card/sheet`, sombras
  `hair/float/sheet/card/action`.
- `src/index.css`: `--background`/`--foreground` quentes, anel de foco 2 px,
  `::selection` da marca.
- `scripts/uipass.mjs` correu uma vez sobre `src/` e mudou 351 linhas:
  `font-black`→peso conforme tamanho, `uppercase`/`tracking-wide*` fora,
  9/10 px→11 px (e depois 11→12 em texto de conteúdo), brilhos roxos→elevação.
  Resultado no bundle: **zero `font-weight:900`, zero `text-transform:uppercase`,
  zero `shadow-lg`**, sem falhas de contraste na primeira auditoria.
- Composição, depois da varredura mecânica: `shadow-action` nos 15 botões
  primários roxos (o `shadow-card` neutro que a varredura pôs em tudo achatava a
  acção principal); números tabulares no `body` inteiro (kwanza e tempo de
  espera mudam em andamento — sem `tnum` a linha tremura a cada actualização);
  tamanhos fora da escala (12,5 / 15 / 17 / 19) trazidos para 13 / 14 / 16 / 20;
  o cartão «Primeira vez aqui?» do motorista deixou de ser roxo e passou a
  superfície neutra com o acento só no ícone; o badge de contador âmbar passou a
  `text-amber-950` (texto cinzento sobre cor lava); `shadow-zinc-700/30` fora.
- Escala de raios verificada, não mudada: 8 (chip/checkbox) → 12 (controle) →
  16 (cartão) → 24 (sheet) → `full` (pílulas e avatares). Está consistente.
- Detector (`impeccable detect src`): dois apontamentos. O do texto cinzento foi
  corrigido; o de «Inter é uma fonte usada em todo o lado» é **decisão de
  marca** — o Trajectoria veste o design system do Elara Marketplace, por isso
  não se troca a fonte aqui.
- Contraste dos novos cartões, calculado sobre a rampa quente: mínimo 5,23:1
  (nota clara) e 5,83:1 (nota escura); título 17:1. Tudo acima de 4,5:1.
- Backup do que estava antes: `../.ui-backup-2210/` (fora do projeto).

### O que é só cliente, e como se lê no código

Dezasseis peças que não tocam no servidor e não precisam de migração nenhuma
para aparecerem (a conta está feita: as quinze anteriores mais a validade dos
papéis — que *usa* a 0008 quando ela existir, e funciona sem ela):

- **Faixa de ligação** — `src/lib/netinfo.ts` (`useNet`, com `navigator.connection`
  por detrás de um `interface Connection` próprio: a API só existe em Android) e
  `src/components/NetBanner.tsx`, montado em `App.tsx` logo abaixo do `Header`.
  Escreve o que a app está a *fazer*, não o que a pessoa tem de fazer: sem
  ligação diz que ela tenta sozinha; em 2G oferece «Poupar dados», que é o
  `setPref('lowData', true)` que já existia. Nunca afirma que abrandou antes de
  a pessoa carregar.
- **Verificação de viagem** — `src/components/RideCheck.tsx`. O único sinal é o
  tempo: `ongoingSince()` lê o carimbo do estado «em viagem» (posto por
  `tr_start_trip`, e `tr_advance` não consegue escrevê-lo), `checkAfterMinutes()`
  dá a fasquia `previsto + máx(12, 60 %)`. Um aviso por viagem fica em
  `localStorage` (`tr.ridecheck.v1`), para a app reaberta não voltar a perguntar
  nem a escrever dois reportes. A escalada escreve em `tr_report`, que é a única
  fila que a equipa realmente lê hoje — por isso o motivo `verificacao_sem_resposta`
  está em `AUTO_REPORT_REASONS` (em `lib/trips.ts`) e entra no `reportLabel` de
  `lib/reports.ts`: sem isso, a pessoa via uma chave crua no ecrã da equipa.
- **Teclado fechado ao volante** — `ChatPanel` aceita `lockNote`; `DriverConsole`
  passa-a em `accepted`/`arriving`/`ongoing`. As respostas rápidas ficam de fora
  do bloqueio: são um toque. A app não mede velocidade nenhuma, e a copy diz
  «ao volante não se escreve» em vez de fingir um sensor que não existe.
- **Os meus dados** — `src/lib/dataexport.ts` + `src/components/DataSheet.tsx`, a
  que se entra por «Os meus dados e a conta» na folha da conta. A exportação não
  é um RPC: são oito `select` filtrados pela `uid`, mais a ficha do motorista
  (`tr_driver_doc`, lida com `.in('driver_id', …)` a partir dos `id` que a
  leitura de `tr_driver` acabou de dar — é o predicado exacto da
  `tr_driver_doc_read` da 0001, portanto zero SQL novo), e o JSON declara
  `em_falta` e `erros` em vez de calar o que não veio. Contas sem candidatura de
  motorista não têm a ficha lida nem reportada como falta: «não tenho ficha» e
  «a leitura falhou» são frases diferentes, e misturá-las era inventurar alguém.
  As datas de validade saem **também por extenso** ao lado dos millis (um
  `1805025600000` num ficheiro que a pessoa abre para ler os dados dela não é um
  dado legível), e o que só existe neste telemóvel enquanto a `0008` não for
  aplicada vem etiquetado à parte em `datas_neste_telemovel` — dizer «as datas
  ainda não estão no servidor» obriga a que a cópia diga o que está no telemóvel. No site desce o ficheiro; na WebView do APK o `download` é
  muitas vezes ignorado, por isso há sempre «Copiar» e, se a área de
  transferência falhar, o texto seleccionável à vista. A eliminação é um bilhete
  na mesma fila: `tr_report` sem `trip_id`, motivo `apagar_conta`, com caixa de
  confirmação que diz que não apaga agora e que a conta serve também o
  Marketplace. `ACCOUNT_REASONS` entra no `reportLabel` de `lib/reports.ts`, e um
  pedido de conta deixa de se chamar «denúncia».
- **Noite** — `isNight()` e `NIGHT_WINDOW` em `lib/trips.ts`, `Prefs.night` em
  `lib/alerts.ts` (ligado por omissão), o 2.º argumento de `checkAfterMinutes()`
  e duas leituras: o cartão «É de noite» em `TripConsole`, montado **logo acima**
  dos botões de partilha porque a copy diz «logo abaixo», e a fasquia mais curta
  em `RideCheck`. A noite não muda o trânsito nem adiciona sensores; muda só a
  hora a que a app abre a boca (3 km: 18 → ~13 min). O interruptor está na folha
  da conta, com os outros três.
- **Dez horas ligado** — `src/lib/shift.ts` + `src/components/ShiftNotice.tsx`,
  montado ao lado do `BatteryNotice` em `DriverDashboard`, com o `uid` da conta e
  `driver.online`. É localStorage puro, sem tabela. A regra que manda em tudo:
  **não se conta o tempo que a app não observou** (`GAP_MS`, 15 min) — por isso um
  telemóvel suspenso na gaveta ou fechado à força recomeça, em vez de acusar
  ontem. Ficar offline apaga a ficha. «Vou fazer uma pausa» silencia 30 min e não
  apaga a contagem. Nunca diz «conduzidas», porque não mede movimento nenhum, e
  nunca bloqueia, porque travar um motorista ao fim de 10 h é uma decisão que não
  é da app. 17 casos verificados à mão, incluindo os 599/600 minutos.
- **Reputação** — `src/lib/reputation.ts`, lido em `DriverDashboard` (cartão do
  próprio motorista), `RentalsSheet` e `RentalBooking`. `ratingBadge()` só mostra
  média a partir de 3 notas (`MIN_RATINGS`); antes disso escreve «novo · 2 notas».
  Não é enfeite: um 5,0 de uma avaliação é o que uma conta nova faz numa tarde, e
  ninguém aqui modera. `cancelBadge()` mostra os 30 dias do motorista a partir de
  5 corridas; `loadRecord()` em `DriverDashboard` faz as duas contagens exactas
  por cabeçalho **uma vez por abertura** — não a cada pedido que muda de estado,
  porque em 2G três leituras por minuto não valem o número — e se vier
  `count: null` sem erro, que é como a PostgREST às vezes responde, a linha diz
  «Não conseguimos contar» com «Tentar de novo», nunca um zero. O
  `tr_leaderboard` da 0005 e o `tr_nearby_rides` da 0004 devolvem a média sem a
  contagem: enquanto essas migrações não estiverem aplicadas,
  `DriverBoard`/`RideBoard` ficam de fora.
- **Ciclo do reporte** — `src/lib/reports.ts` + `src/components/MyReports.tsx`,
  montado na folha «Os meus dados» (e `TeamConsole`, que é a outra metade). Também
  não há DDL nenhum: `tr_report.state` e `tr_report.outcome` existem desde a 0001,
  e as políticas `tr_report_read` / `tr_report_admin` já deixavam o autor ler as
  linhas dele e a equipa actualizar as de todos — a app é que só escrevia. Agora a
  pessoa vê «Aberta / Em análise / Resolvida», a data, e a nota de quem decidiu; a
  consola tem a caixa dessa nota, o chip do estado, e uma lista «N resolvidos»
  reabrível. **Reabrir limpa o `outcome`**: um caso reaberto não pode chegar a
  casa de alguém com uma decisão antiga. Vazio e ilegível são duas frases
  diferentes («Ainda não pediu nada» / «Não conseguimos ler os seus pedidos — o
  que já pediu continua na fila»), porque a segunda não autoriza ninguém a pedir
  outra vez. Os rótulos dos motivos passaram a viver num sítio só, por isso a
  consola e a pessoa lêem as mesmas palavras — e o rodapé da lista diz que quem
  muda a etiqueta é uma pessoa, não um prazo.
- **Painel «Agora»** — `src/components/LiveBoard.tsx`, montado no topo da
  `TeamConsole`, por baixo dos três números. Zero DDL: é **uma** leitura de
  `tr_trip`, e a política `tr_trip_read` já tem `is_admin()`. Não escrever a
  lista de estados à mão — `Object.keys(STATE_LABEL).filter(isTripActive)` são
  os mesmos dois nomes que o passageiro e o motorista usam, portanto um estado
  novo não fica invisível para a equipa. A primeira linha de cada corrida é o
  **estado**, não o código: o código está na linha 2 com as zonas. A idade sai
  do último carimbo de `events` (sem historial, é o `created_at` — que num
  pedido à espera é exactamente o que se quer). «Sem correspondência» são os
  `searching` com **5 min** ou mais, o tempo do `RideCheck` e não os 90 s do
  painel do passageiro: abaixo disso o que há é trânsito. A contagem de ligados
  vem dos `tr_driver` que `load()` já traz (`frota.filter(d => d.online)`), sem
  pedido extra. **Não há tempo real e a copy diz isso**: «Actualizar» manual +
  «Lido há X min», nunca «ao vivo» — e os minutos não congelam, porque um
  `setInterval` de 60 s só corre enquanto há linhas na tela.
- **Centro de ajuda** — `src/components/HelpSheet.tsx`, aberto em
  «A minha conta → Ajuda e segurança» (e o «Os meus dados» lá dentro fecha a
  ajuda antes de abrir a outra folha; duas folhas em cima uma da outra não é
  navegação, é labirinto). É **texto fixo**: não lê ao servidor, por isso não
  tem estados de carregamento/erro — e o comentário do ficheiro diz isso em vez
  de o esconder. A regra é a única coisa que o torna seguro: cada resposta foi
  verificada contra o SQL aplicado antes de entrar, e três frases caíram no
  processo (bloqueio por código errado — a `tr_verify_pin` não conta tentativas;
  «fica à espera de aprovação humana» — a 0003 aplica
  `auto_approve_drivers default true` e o `DriverView` já diz «aprovada no
  momento»; código «TR…» — o gerador da 0001 emite `ELT-` + 6 caracteres).
  Objectos perdidos estão escritos como o que são: **não há função**, por isso o
  caminho é um reporte ou o WhatsApp com o código da viagem. O número de apoio
  vive em `APOIO_PHONE` / `APOIO_DISPLAY` (`lib/utils.ts`) e substituiu os cinco
  literais espalhados por `App`, `DataSheet`, `TripReceipt` e `DriverView` —
  um número por mudar em cinco sítios é como se publica um número velho.
- **O lugar exacto** — `src/lib/places.ts` + `src/data/luanda-places.json`. Um
  índice de **2 391 nomes** de Luanda e das vilas onde há paragem (nome, `kind`,
  coordenada, `parent` = município para 2 388 deles, e o identificador OSM para
  2 390), apanhados **em bloco** no OpenStreetMap pela linha
  `.pkg/fetch_wide.sh` → `.pkg/wide_cache.cjs` → `.pkg/build_places.cjs`: seis
  perguntas Overpass (todos os `place` nomeados de Luanda e de Angola, os
  bairros `landuse=residential`, e os marcos — saúde, ensino, culto, polícia,
  correios, mercado, combustível, lojas, turismo, lazer — mais as avenidas e
  estradas de passagem), um `reverse` Nominatim por célula de ~1,1 km para o
  pai, e os 62 nomes finos que já estavam conferidos um a um e que o bloco não
  traz como os chama (a Baía de Luanda, o Belas Shopping, o Estádio dos
  Coqueiros). Viaja dentro do bundle, por isso não há geocodificador, não há
  chave, não há pedido ao vivo, e em 2G o custo é só o do HTML (**+257 896 B
  crus, ≈+57 500 B gzip** no chunk principal face ao índice de 241: ver GOALS
  §4-C). **Nada disto vem do
  Yango** — a pergunta foi feita à letra a 25-10, e a resposta é o que está no
  `_note` e no `_licence` do JSON.
  O que fica de fora é decidido por uma única regra, em
  `.pkg/place_rules.cjs`: um nome só entra se servir para **dizer a alguém onde
  se está**. Por isso ficaram de fora 436 bancos e ATMs, 82 nomes que são só a
  categoria («Farmácia», «Cantina», «Condomínio»), 28 sem letras e um
  quarteirão chamado «H». As regras correm no bloco **e** ao escrever, porque o
  builder readmite o índice anterior — aplicar os filtros só ao bloco deixaria
  para sempre no ficheiro o que lá entrou uma vez.
  `searchPlaces(q, zones)` exige que **todos** os tokens apareçam (um deles não é
  uma busca, é uma consoante), dobra acentos e a ordem das palavras, tolera uma
  tecla a mais (`dangeres` → `Dangereux`), e ordena por
  **hierarquia** (`RANK`: bairro > povoação > coisa) e depois por distância — é o
  que faz «fubu» devolver o bairro e não a loja ao lado. Todos os nomes vêm
  já normalizados (`indexed()`), porque a procura corre a cada tecla em 2 391
  linhas. `nameAt(lat, lon, zones)`
  faz o contrário com **duas** distâncias escritas à vista: um ponto fino só vale
  até **700 m** (`POINT_M`) e um bairro até **2 km** (`BAIRRO_M`); para além disso
  a app diz a zona e os metros, e não inventa nada. `DATA_DATE` é o `fetched_at`
  do JSON — a data em que os nomes foram lidos no OSM — e aparece no rodapé do
  `ZonePicker` com a licença ODbL; mudar o índice sem voltar a correr o builder é
  afirmar uma verificação que não houve.
  **Um nome que o OSM não conhece só entra com prova.** `.pkg/places_team.json` é
  o único caminho: `name`, `lat`, `lon`, `parent` e **`proof`** obrigatórios — o
  builder rebenta se faltar alguma coisa — e `via: 'equipa'` é posto por ele, nunca
  à mão. Hoje há um: «Mbondo Chapéu», com as coordenadas da igreja que o traz
  (`node/6282394678`) porque o OSM não tem o centro do bairro. No ecrã esses nomes
  dizem-no duas vezes: «dito pela equipa» na lista e «Nome dito pela equipa, não
  pelo mapa.» no cartão da rota. Um lugar sem prova não entra, mesmo que meia
  Luanda o use — entra o pedido dele (a seguir).
  **Falta um nome? A pessoa diz.** O ecrã de «nada encontrado» do `ZonePicker` tem
  «Falta o nome de «X» — diga-nos», que chama `reportMissingPlace()`
  (`lib/reports.ts`): escreve `tr_report` com `reason: lugar_em_falta`,
  `trip_id: null`, texto limpo a 120 caracteres, e dedupe de 24 h por conta.
  **Zero DDL** — `tr_report.reason` é `text not null` sem `CHECK` (0001, linha
  241), por isso uma chave nova é uma string; e a fila já é a que a `TeamConsole`
  lê, com estado visível para quem pediu (`MyReports`). Se a `report` prop não for
  passada (conta não carregada), o botão simplesmente não existe.
  A escolha põe o pin na coordenada do lugar e escreve o nome em `pickup.note`
  (0004) ou, sem 0004, no primeiro texto do chat (`ridesOn` decide qual).
  **O destino nomeia, não marca ponto**: `onExact` no `ZonePicker` de «Para onde
  vai» faz `setTo(p.zoneId)` + `setDestPlace(p)`, e o nome sai na **mesma**
  primeira mensagem do chat que leva a referência de embarca («O meu destino é
  X (bairro).») — uma inserção, um caminho de erro, não dois. Não há coluna de
  destino com nome na base de dados (nem com a 0004), por isso o chat é o único
  sítio onde isso pode viver; quem quiser destino com ponto tem de propor DDL.
  A linha de chip abaixo do cartão da rota tem «só a zona» para desfazer, e a
  faixa do `ZonePicker` muda de texto conforme `tone` — o do destino nunca
  promete um ponto no mapa.
  **O preço continua a ser o da `tr_zone`** — o lugar nomeia, a zona cobra; se
  alguém acrescentar um lugar sem `zoneId` válido, é aqui que rebenta.
- **A forma da matrícula** — `src/lib/plates.ts`. `normalizePlate` tira acentos,
  traços e a caixa «AO»; `parsePlate` reconhece as três séries legais e devolve
  `shape` (`nova` / `antiga` / `pre-1996` / `invalida`) + `region`; `plateIssues`
  separa **erro** de **aviso** e só é erro o que a lei diz que é erro: forma
  impossível, `00-00` (o exemplo impresso no Decreto Presidencial 202/16) e um
  código de província que não está nos 19 do artigo 27.º. Aviso (nunca bloqueio):
  série `antiga` («troca obrigatória desde Janeiro de 2024»), pré-1996, pré-1996
  com ano de fabrico posterior, e província da chapa ≠ província da praça.
  Os testes estão em `../.pkg/plates_test.cjs`, que bundliza o módulo com esbuild
  e corre contra o ficheiro real — quando mudarem uma expectativa e der FAIL,
  verificar se a expectativa é que está errada (aconteceu três vezes).
  O cabeçalho do ficheiro diz a coisa que não se pode esquecer: **não há registo
  público de matrículas em Angola**, por isso a app não pode escrever
  «verificámos no registro» em lado nenhum. A única conferência real é a
  duplicidade, em `src/lib/drivers.ts` → `plateTaken()`, um `select` no
  `tr_driver` onde a 0003 pôs índice `unique` em `plate`; devolve
  `{taken, checked}`, porque «a app não conseguiu verificar» e «não está
  repetida» são frases diferentes no ecrã.
- **A ficha em quatro passos** — `src/components/DriverFicha.tsx` (substituiu o
  `DriverApply` de um ecrã único). O passo 3 é «Assim vai ser» (`DriverRehearsal`)
  e o 4.º passo antes dele são **quatro caixas separadas** de declaração, porque
  uma única «declaro que tenho tudo» não obriga a ninguém a pensar em cada
  papel. A escrita continua a ser a `tr_apply_driver` da 0003 aplicada, com
  `p_declares: true` obrigatório, e depois um `update` em `tr_driver_doc` para
  marcar `licence`/`logbook`/`insurance` com `declared_at` — **se esse update
  falhar a candidatura já entrou**, e a mensagem diz exactamente isso em vez de
  fazer a pessoa recomeçar. Cada passo tem um «falta…» âmbar: um botão desactivado
  sem explicação é como uma aplicação se abandona.
- **O ensaio** — `src/components/DriverRehearsal.tsx`. Não escreve nada, e diz
  isso numa faixa fixa («SIMULAÇÃO — nada aqui foi gravado nem enviado»). Lê
  `loadSetting()` (`lib/settings.ts`) para mostrar o `commission_pct` verdadeiro,
  o período de tolerância e o `trial_trip_limit`; se a leitura falhar mostra
  «Não conseguimos ler as condições» + «Tentar de novo», **nunca uma comissão de
  cabeça**. `publicNameOf()` em `lib/drivers.ts` replica a fórmula do servidor
  (primeira palavra + inicial da última + ponto, **sem** passar a inicial para
  maiúsculas, que é o que o `tr_apply_driver` faz) — uma divergência entre o
  ensaio e a linha gravada é uma promessa partida. Também é acessível a quem já
  está inscrito: `DriverView` guarda `previewOf(driver, zones, classes)` e o
  cartão «candidatura em análise» tem «Ver como vai ser».
- **A comissão na consola** — `src/components/MarginPanel.tsx`, dentro da
  `TeamConsole`. Uma percentagem só no banco (`tr_setting.commission_pct`, com o
  `check (0 and 40)` da 0001 que a app não duplica nem contorna); o painel mostra
  a actual, a divisão `driver_keeps_kz`, o fim do período de tolerância, e propõe
  uma nova **escrevendo pela mesma política `tr_setting_admin`** que já existia.
  O passageiro, o motorista e o candidato lêem a mesma fonte. Não é um editor de
  tarifário: as classes continuam SQL até a `0007` ser aplicada.
- **A validade dos papéis** — `src/lib/expiry.ts` (a aritmética) +
  `src/components/DriverPapers.tsx` (o cartão e a folha), montado no
  `DriverDashboard` com o `BatteryNotice` e o `ShiftNotice`. Cinco decisões que
  quem mexer aqui tem de manter:
  1. **O dia, não o instante.** Uma data é `'YYYY-MM-DD'`; o `keyToMs()` guarda ao
     **meio-dia UTC** e o `todayKey()` conta sobre o **dia civil de Luanda**
     (`now + 3600000`, a mesma escolha do `startOfTodayAo()` do painel). Um
     `Date()` à meia-noite local atravessa o dia conforme o fuso de quem abre a
     app, e um «venceu ontem» no dia errado é exactamente o tipo de mentira que
     faz alguém desligar a app.
  2. **Validar o calendário, não só o formato.** `dayParts()` rejeita
     `2026-02-29`, `2026-13-01` e anos antes de 1900. Não é preciosismo:
     `Date.UTC(2026, 12, 1)` é *válido* (roda para Janeiro de 2027), portanto um
     regex de formato deixa passar datas que não existem.
  3. **Ler junta, escrever substitui.** `mergeLocal()` usa-se na leitura (o
     telemóvel complemente o servidor); `putLocal()` usa-se na gravação. Fundir
     na gravação fazia desaparecer o apagamento — o motorista limpa uma data no
     formulário e ela voltava no sítio. Está coberto por caso de teste.
  4. **Nada de verde.** `worstPaper()` só devolve `soon` ou `expired`; um painel
     «está tudo em dia» taparia a praça. A terceira coisa é «sem data», e convida
     em vez de acusar.
  5. **O texto diz em que plano estamos.** `expiry_entered_by` fica `'motorista'`
     — mesmo com a 0008 aplicada é uma **declaração**, e o rodapé diz «ninguém
     conferiu um papel». E nunca auto-suspende: o `tr_violation` continua
     desligado enquanto não houver maneira de *levantar* uma suspensão, porque
     desligar uma conta de uma pessoa sem botão de reabrir é pior que o papel
     vencido.

## 4. desenhar sem estragar

- Móvel primeiro: 360–430 px é o ecrã real; o desktop é bónus.
- Os dois temas contam. Correto em claro *e* escuro, a cada alteração.
- Copia em pt-AO, voz directa e honesta («Onde quer ser apanhado?»), mas o
  chrome é adulto: nada de emoji como ícone, nada de rótulo em maiúsculas por
  cima de um título, nada de gradiente no texto, nada de cartão dentro de cartão.
- Não prometer o que a app não entrega: sem frota inventada, sem procura
  inventada, sem «monitorizamos 24 h». O SOS é o 111 real + o WhatsApp da
  equipa (+244 921 044 212). O aluguer não move dinheiro. A regra aplica-se ao
  contrário também, e é a mais difícil: **a app não ameaça o que não executa**.
  Um papel vencido avisa e nunca suspende; uma data escrita pelo motorista chama-
  se declaração e nunca «verificado»; e a única verificação real que existe
  (matícula duplicada) é a que o `unique` do banco faz, com o erro dele mostrado
  na tela.
- Cada ecrã novo precisa de estado de carregamento, vazio e erro.

## 5. verificar sem screenshot

Neste ambiente o browser embutido não renderiza de forma fiável (1 quadro por
500 ms) e há um Chrome pessoal ligado ao MCP do devtools que não se deve tocar.
Por isso a verificação é por DOM: `evaluate_script` com `getComputedStyle`,
medindo pesos/tamanhos/cores, `scrollWidth` contra `innerWidth` para overflow, e
razão de contraste WCAG calculada a partir do fundo efectivo do ancestral.
Contraste mínimo: 4.5:1 em texto, 3:1 em texto grande (≥24 px) e ícones.

Quando o browser embute enguiça de vez (`evaluate_script` dá timeout enquanto
`curl` responde 200), a verificação passa a estar toda fora do browser, e ainda
assim fecha o ciclo:

1. `grep` no CSS compilado — o que importa é o que vai no bundle: zero
   `font-weight:900`, zero `text-transform:uppercase`, os utilitários novos
   presentes.
2. Matemática de contraste em node sobre os valores hex da rampa (claro e
   escuro, cada par texto/fundo do cartão alterado).
3. Auditoria de largura estática: nenhum `w-[NNNpx]` acima de ~260 px fora dos
   carris horizontais (`h-rail`), que fazem scroll por natureza.

Três coisas que só se aprenderam a fazer assim, e que valem mais que o resto:

- **Medir o que é escrito.** A bateria de contraste em `.pkg/contrast.cjs` lê
  classes *do ficheiro fonte*. Ela adivinhava: o chip «sem data» estava declarado
  no teste a `zinc-600` e no componente a `zinc-500` (2,58:1 sobre branco), e as
  sub-linhas do teste não tinham o `/80` que o componente tinha. Um par medido
  que não é o par escrito é uma auditoria a provar uma mentira — por isso a
  escrita e a medição têm de bater ao character, e o número de casos cresce
  (143 → 175 → 189 → **226**) com cada peça nova. A vaga H apanhou a própria
  auditoria a mentir: o `contrast.cjs` media a rampa `zinc` do Tailwind, que é
  fria, enquanto a app pinta o `zinc` quente do `tailwind.config.js`. Os pares
  todos mudaram de valor (o pior passou de 4,83 para 4,68) e continuaram a
  passar — mas medidos contra cores que nenhum ecrã pintou. Hoje o teste
  `import()` o config real e faz merge da rampa antes de calcular seja o que
  for, e a base do escuro é `zinc-950` (#121211), não o #09090b que ele assumia.
  Os 9 pares novos que a varredura de 430 px acrescentou (bolha de conversa e
  cartão do motorista, ambos sobre roxo) baixaram o piso do texto para
  **4,56:1** — passa, mas por margem apertada e sabida.
- **Aritmética testa-se fora do browser, com o servidor a mentir.**
  `.pkg/expiry_test.cjs` compila o `src/lib/expiry.ts` *verdadeiro* com o módulo
  `./supabase` substituído por um Proxy encadeável que responde sempre «column
  does not exist». É o estado real da production hoje, e não se consegue ver num
  screenshot: ~45 casos cobrem calendários impossíveis, fronteiras do dia de
  Luanda, ano bissexto, cada frase de estado e a degradação para «só neste
  telemóvel». O padrão serve para qualquer peça sondada por migração: em vez de
  fingir que a migração existe, testar as duas respostas.
- **Um índice de dados reconstrói-se com cache, e prova-se com o JSON real.**
  `.pkg/build_places.cjs` (62 → 241 → **2 391** nomes, a 25-10) teve de aprender
  quatro coisas à custa: o **Overpass público devolve 502** sem aviso, por isso a
  apanha vive fora do builder (`fetch_wide.sh` → `wide_raw.json` +
  `wide_roads.json` → `wide_cache.cjs` → `overpass_block.json`) e um 502 nunca
  custa o trabalho todo, com três terminações tentadas por ordem; o Nominatim é
  de **um pedido por segundo**, por isso o pai é perguntado por *célula* de
  ~1,1 km (`cellOf` = `toFixed(2)`) e guardado em `.pkg/places_parents.json`, não
  por lugar — 2 391 lugares viriam 2 391 pedidos, e foram **792 células** (≈ 3 lugares por célula), das quais 640 novas nesta recolha; a dedupe tem de
  ser **dupla** (o id OSM *e* nome+tipo+célula), senão «Fubu» (suburb) e «Fubú»
  (neighbourhood), que são dois objectos reais do OSM, se fundem num só — e as
  vias pedem uma **terceira** chave só pelo nome, porque uma avenida é uma linha e
  dois pontos dela com o mesmo nome na lista são um enigma; e o `catch {}` **mais
  barato desta casa**: 640 perguntas ao Nominatim correram três noites a devolver
  `fetch failed` em silêncio, porque o Avast faz MITM do TLS e o Node não confia
  na CA dele (`NODE_EXTRA_CA_CERTS`), e o `catch {}` sem palavra transformava isso
  num índice mudo — 46 % dos nomes sem município, quando a resposta real era
  99,8 %. Um `catch` que engole um erro de rede precisa de um contador e de uma
  frase. Os testes (`places_test.cjs`, 49 asserções; `reports_test.cjs`, 11)
  correm contra o **JSON que viaja na app**,
  nunca uma cópia inventada, e o custo é medido depois (`zlib`). Uma frase que a
  medição apanhou: os docs antigos diziam que
  escrever «Kero» devolvia um shopping — **nenhum dos 62 nomes tinha «Kero»**. Um
  exemplo nos docs é uma asserção: ou sai do `searchPlaces` verdadeiro (é para isso
  que serve `.pkg/places_show.cjs`), ou não se escreve. A segunda que a medição
  apanhou desta vez: os docs diziam que «Dangeres» **não existia no OSM** —
  existe, é `node/1634902967` (`place=suburb`); o que não existia era a grafia,
  porque o nome no mapa é «Dangereux» e a sonda tinha sido feita com o nome
  ouvido à rua. Corrigido em GOALS §4-C, com o `dangeres` → `Dangereux` a
  funcionar por tolerância a uma tecla a mais.

- **«Quando eu clico em mostrar a minha localização ainda mostra Mondo Chapéu».**
  A queixa era justa e o motivo não era o índice: o botão só incrementava um
  contador que ia parar ao `fitKey`, e o `fitKey` enquadra os *centróides das
  zonas* — nunca o ponto da pessoa. Somem-se duas cumplicidades: a leitura vinha
  da cache do aparelho (`maximumAge: 30000`, um minuto velho noutro bairro sem
  ninguém dizer nada), e a folha só tinha nome para o embarque marcado ou para a
  zona escolhida por defeito. Ou seja: o toque mexia a câmara para o sítio de
  sempre e repetia a palavra de sempre. Está fechado em três camadas, cada uma
  com a sua prova: `ask(true)` pede `maximumAge: 0` com 12 s (medido no browser —
  o `opts` que chega ao `getCurrentPosition` é mesmo `0`); um toque no botão já
  não é engolido por uma leitura automática em curso (`askingRef` só trava
  pedidos velhos, nunca o pedido fresco); e o `useFixFlash` arma-se no toque para
  levar a câmara ao ponto **quando ele chega**, uma vez (`zoom ≥ 15,5`). No
  emulator a 393×851 o pino passou de (2370, 1996) — fora do ecrã — para
  (196, 332), o centro da área visível do mapa. O nome vive agora num cartão
  próprio (`WhereAmI`), com a precisão que o aparelho deu, a idade da leitura
  quando passa de três minutos, e uma única acção: âmbar quando a zona escolhida
  por defeito não é onde a pessoa está («Mudar a partida para X»), roxo quando
  falta o embarque. A precisão também se desenha: um círculo com o raio real do
  GPS, teto de 15 m a 2 km, uma só camada de pintura, roxo da marca. Dois
  pormenores honestos que a medição obrigou: o aparelho que responde com
  precisão `0` não tem precisão nenhuma (diz-se, não se escreve «cerca de 0 m»),
  e um pedido que morre nos 12 s deixa o botão recuperado, com o aviso âmbar e
  ainda tocável — verificado no mesmo emulator. Achar e corrigir nisto: o
  `radarRef.current` nunca era re-escrito, pelo que o anel do raio de procura
  **nunca se desenhou** desde que existe — o handler do `styledata` só existe
  uma vez, e lia o `null` do primeiro render.

- **Uma paleta, não três.** O verde dos relatórios e o azul do Waze eram cor
  emprestada: «Resolvida» passou a roxo (a cor com que a app já celebra o resto),
  «Em análise» a zinco, e a escada ficou âmbar → zinco → roxo; o ícone do Waze
  passou a ser o roxo do irmão Google Maps. A regra agora é mecânica, não de
  humor: `where_test.cjs` (16 asserções) varre o `src/` inteiro e chumba
  qualquer família fora de `{purple, amber, red, zinc}` — e também assenta o
  cartão «Onde está agora» em `renderToStaticMarkup`, porque sem conta não há
  ecrã para o ver no browser. Contraste: 226 pares, 0 falhas AA nos dois temas,
  texto mais baixo 4,56:1.

- **O desligado é uma cor, não uma opacidade.** Havia 24 botões pela app que se
  apagavam com `opacity-50` por cima do roxo com texto branco: 3,0:1, ilegível,
  e o pior é que o rótulo é a informação — um botão que diz «Pedir viagem» e
  ninguém consegue ler não diz nada. Passou a um token só, `OFF` (e `OFF_ATTR`
  para os que usam o atributo `disabled`) em `src/lib/utils.ts`: zinco sobre
  zinco, 5,81:1 no claro e 5,07:1 no escuro, sem opacidade nenhuma. O
  `design_test.cjs` (17 asserções) chumba `opacity-NN pointer-events-none` e
  `disabled:opacity-` em qualquer ficheiro do `src/`, e exige que o token seja
  usado em ≥12 ficheiros — a regra já não vive na memória de quem escreveu.
- **44 px, ou o dedo erra.** O manípulo do painel (14 px de alto), os
  interruptores (32) e as abas de tipo de viagem (40) eram os únicos controlos
  sem desculpa. `.tap-pad-lg` (inset −16 px) dá 46 e 48 px de área tocável sem
  crescer o desenho um pixel; as abas passaram a `h-11`. Ficam três exceções
  assumidas e medidas: os pinos do MapLibre (16 px, não são interactivos), o
  «Actualizar» do mapa (75×18 + `tap-pad` = 36, passa o AA de 24) e o input do
  ponto de referência (302×21, mas vive dentro de um `<label>` de 90 px — o alvo
  real é a linha toda).
- **A varredura de 430 px apanhou três cores que só existem no escuro de dia.**
  O `text-purple-200` da hora nas bolhas de conversa e o `text-amber-200` do
  aviso do GPS caíam sobre o roxo da marca: 3,95:1 e 4,32:1. Eram invisíveis na
  varredura de 360 px porque exigem estado (conversa aberta, motorista online com
  GPS a mentir). Agora a hora é `purple-100` (4,56), o aviso do GPS é um chip
  âmbar dentro do cartão roxo (`bg-amber-100 text-amber-800`, 6,37 medido no
  browser com as classes reais) e o aviso «combinou por fora» do chat deixou de
  ser `text-amber-600` (1,69:1 sobre roxo, 3,19 sobre branco) — usa âmbar escuro
  na bolha branca e âmbar claro na roxa. Ficou regra mecânica: nenhum
  `text-(amber|red|purple)-(200|300)` aparece sem `dark:` à frente, e nenhum hex
  de zinco frio do Tailwind sobra no nosso código (a atribuição do mapa e a
  camada do wereiro do mapa pintavam `#52525b`/`#a1a1aa`/`#18181b`/`#09090b`);
  ambos os `contrast.cjs`-pares e o `design_test.cjs` os chumbam. A atribuição
  do MapLibre, que era o único texto de 10 px da app, passou ao piso dos 11 px
  da escala com o zinco quente, e a capa escura do traçado da rota (`line-color`
  no `MapView.tsx`) passou de `#09090b` para o `#121211` da app.

- O **APK em `build-artifacts/`** é sempre a peça mais velha desta casa, e esta
  vaga prova-o em vez de o supor: o que estava lá tinha `index-C_lnEzCC.js`, ou
  seja, código da vaga anterior. `node scripts/apk.mjs` → 4 149 808 B, e os dois
  ficheiros dentro de `assets/public/assets/` comparados **byte a byte** contra o
  `dist` (`index-C9RKKK8B.js`, `index-BKBzxU2T.css` — md5 `e02a5830` /
  `87994de9`, iguais nos três sítios: dist, APK e o que a Vercel serve). O
  recipe da comparação está em §6; o `unzip -l | grep index-` não serve, porque
  um nome solto falha em silêncio quando o bundle é outro — que foi exactamente
  o que aconteceu aqui.

## 6. publicar

```bash
export NODE_EXTRA_CA_CERTS=C:/Users/DELL/.elara/avast-shield-root.pem
VC=C:/Users/DELL/.elara/vercel-cli/node_modules/vercel/dist/vc.js
node $VC deploy dist --prod --yes --project trajectoria-ao
node $VC curl https://trajectoria-ao.vercel.app/   # sem --project aqui
```

O certificado é do escudo HTTPS do antivírus deste PC; noutro machine, sem
esse proxy, a variável não é precisa (e o caminho da CLI também não — instalar
`npm i -g vercel` e usar `vercel`). A autenticação fica em
`~/.config/com.vercel.cli`; `vercel login` noutro PC.

Confirmar que o production mudou: comparar o hash em
`node $VC curl https://trajectoria-ao.vercel.app/` com `dist/assets/index-*.css`.
E confirmar que o texto novo está mesmo no ficheiro servido — o atalho
`$URL` abaixo é a raiz do site, não o projecto:

```bash
URL=https://trajectoria-ao.vercel.app
node $VC curl $URL/assets/index-<hash>.js | grep '<texto novo>'
```

Porque um build antigo serve-se igual a um build novo.

O **Marketplace** é outro projecto no mesmo account: `elara-marketplace/dist`
→ `--project elara-ao` (https://elara-ao.vercel.app). Quando se mexe na ligação
entre as duas, publicam-se as duas na mesma tarde: o botão do Market chama uma
rota da Trajectoria, e uma das metade sozinha é um link morto.

APK: `node scripts/apk.mjs` (keystore e `release.properties` ficam fora do
repositório — pedir ao dono). O `unzip -l | grep index-` **não** prova nada aqui:
o Capacitor mete os assets em `assets/public/assets/`, e um `grep` pelo nome
solto falha em silêncio. Comparar os bytes de dentro contra o `dist`:

```bash
python - <<'EOF'
import zipfile, hashlib
z = zipfile.ZipFile('build-artifacts/trajectoria-0.1.0-release.apk')
for f in ['index-<hash>.js', 'index-<hash>.css']:
    a = z.read('assets/public/assets/' + f)
    d = open('dist/assets/' + f, 'rb').read()
    print(('IGUAL ' if a == d else 'DIFERE ') + f, len(a))
EOF
```

Os dois nomes têm de ser os mesmos que `node $VC curl https://…/` lista no HTML
servido — o bundle do APK, o do `dist` e o do production são três coisas
diferentes até se provar que são iguais.

## 7. nunca

- `service_role` ou palavra-passe em código de cliente, nem num commit.
- `.env.local` no git. Só `.env.example`.
- Forçar push, `git reset --hard` ou apagar migração já aplicada.
- `security definer` para tapar um erro de permissão — é o problema, não a solução.
- `apply_migration` para iterar: usar `execute_sql` e gerar a migração limpa no fim.
