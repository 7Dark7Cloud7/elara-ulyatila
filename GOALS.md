# GOALS — arquivo completo do que foi pedido

Os objectivos chegaram em seis vagas, todas em mensagens do dono do projecto:

| vaga | quando | o que é |
|---|---|---|
| **A — o brief** | 2026-10-21 | regras de trabalho que mandam em tudo (secção 1) e o enquadramento de segurança (secção 2) |
| **B — Yango / Uber / inDrive** | 2026-10-21 | comparação com o que os outros fazem, e o pedido de «fun features» + «features diferenciadoras úteis para Angola» (secção 5) |
| **C — a spec completa** | 2026-10-21 | `Trajectória (Elara) — Ride-Hailing Feature Spec for Qoder`, P0/P1/P2, 12 secções (secção 6) |
| **D — localização exacta, ficha de motorista, lucro e auditoria** | 2026-10-25 | pedido em português corrente, reproduzido à letra na secção 4-A (localização com nome do bairro **e do lugar**, inscrição de motorista «mais formal e testada» com validação da matrícula e «uma opção de teste para mostrar ao motorista como vai ser», «o nosso lucro imbutido nas viagens», e «uma auditoria do que falta para ser completo» comparada com apps de Angola e do exterior) |
| **E — identificação de bairro** | 2026-10-25 | reproduzida à letra na secção 4-B: o dono está fisicamente no **Mbondo Chapéu**, vê **Fubu / Mbondo / Dangeres** ao lado, e pergunta duas coisas — se a identificação de bairros pode ser melhorada e **de onde vieram os nomes** («voce pegou info da yango?»). Resposta: não; e o índice foi refeito em bloco a partir do OpenStreetMap |
| **F — todos os bairros que se puder** | 2026-10-25 | «PONHA A TODOS BAIROS QUE PODER E FOR IMPORTANTE GET INFO»: o índice deixa de ser uma lista de bairros e passa a ser **o que o OSM sabe sobre Angola** — secção 4-C, com o que ficou de fora e porquê, e com a correcção de que «Dangereux» existe no mapa (a 4-B dizia o contrário) |

Este ficheiro é o registo. **Não é uma lista de desejos**: cada linha diz se
está na app, se está escrita à espera de migração, ou se **não está**.

Legenda — ✅ na app (servidor aplicado) · 🟡 escrito, escondido até a migração
ser aplicada · ❌ não está · 🔒 precisa de algo fora do código (o painel, um
parceiro de pagamentos, uma decisão da equipa, uma lei).

Última verificação: 2026-10-26, contra o bundle **publicado**
(`index-C_lnEzCC.js`, `cksum 2732604144 639003`, byte a byte igual ao `dist`) e
contra o `trajectoria-codigo.zip` refeito (165 ficheiros, 1 119 KB, com os
2 391 lugares lá dentro). A verificação por SQL ao servidor vivo
(`to_regclass`, políticas, colunas) é a de 2026-10-25 e não foi refeita hoje:
nenhuma migração foi aplicada nesta vaga.

---

## 1. O brief, escrito por extenso

> Add features **without breaking the live bundle**.

**Feita como método.** Nada entra em produção sem: `tsc --noEmit` limpo, build
limpo, e o texto novo confirmado dentro do `dist` (grep ao bundle). Quando a
app não pode correr, verifica-se por estática e por REST, não por fé.

> Put all new tables in one new idempotent migration … and don't apply it.

**Feita.** As tabelas novas vivem em `0004_lugares.sql`, `0005_core.sql` e
`0006_elara.sql` — todas idempotentes (`create table if not exists`,
`create or replace function`, `drop policy if exists`). A 0004 e a 0005 **não
foram aplicadas**; a 0006 está no servidor (vista por SQL). Aplicar é decisão da
equipa no painel, com a app aberta ao lado.

> Row Level Security on every new table. Passengers see only their own rows;
> drivers see only rows of trips assigned to them; staff see all.

**Feita** nas três migrações. O padrão é sempre o mesmo (`tr_order_link` como
exemplo, `0006_elara.sql`):

```sql
create policy tr_order_link_read on public.tr_order_link
  for select to authenticated
  using (
    buyer_id = public.current_uid()
    or trip_id in (select id from public.tr_trip where passenger_id = public.current_uid())
    or trip_id in (select id from public.tr_trip
                   where driver_id in (select id from public.tr_driver
                                       where account_id = public.current_uid()))
    or public.is_admin()
  );
```

E nunca se resolve um erro de permissões com `security definer` à toa: as RPCs
são `definer` quando têm de escrever em tabela alheia, e **todas** têm o par
`revoke … from public, anon` + `grant execute … to authenticated`.

> Never show phone numbers between passenger and driver.

**Feita.** O telefone de quem recebe uma encomenda só existe no formulário e na
linha da viagem; o feed da praça não o mostra e o motorista só o lê depois de
aceitar. Entre passageiro e motorista a comunicação é por chat, código e
morada — nunca por número.

> Don't add anything that promises a reward the app can't deliver.

**Feita, e é a regra que mais cortou.** Concretamente:
- O **quadro da semana** (`tr_leaderboard`) não mostra Kwanza nenhum. Uma equipa
  de 1–3 pessoas não audita ganhos, e um quadro errado sobre dinheiro estragaria
  a confiança de quem conduz.
- O **convite** (`tr_referral`) fica `pending` para a fila da equipa. A app não
  dá crédito a ninguém, nem promete que o vai dar.
- O **ambiente dentro do carro** (`tr_trip_pref`) é uma nota que o motorista lê,
  não um serviço contratado.
- As **estrelas/elogios** não alteram preço nem dão prioridade.
- O **SOS** marca o 111 e prepara uma mensagem de WhatsApp com o código da
  viagem. Não promete «central 24 h», porque não há central 24 h.

> Credit must be confirmed by the existing admin flow, never auto-issued.

**Feita.** Todo o saldo passa por `tr_money_request` e pela decisão de quem está
na consola. Nenhuma função desta app insere saldo sozinha.

> Every new screen needs a loading, empty and error state.

**Feita** nos ecrãs novos (`OrderNotice`, painel «Lugar», consola da equipa,
página pública de partilha, fila de pedidos, faixa de ligação). O estado de
erro nunca é um `alert`: é uma linha discreta com o que a pessoa pode fazer a
seguir.

> Don't wire `tr_violation`.

**Feita.** A tabela existe no esquema de rascunho e nenhum botão da app escreve
nela. A denúncia do motorista vive no processo da viagem, que a equipa vê.

> Don't mess anything that is already good.

**Feita como disciplina.** As correcções reais (dinheiro e segurança) estão
listadas na cabeça da `0005_core.sql`, cada uma com o bug que fecha. Tudo o
restante foi passagem de maturidade visual: sombras, raios, tamanhos, contraste
— sem tocar em comportamento.

---

## 2. O enquadramento de segurança (as palavras do dono do projecto)

> «for this phase present safe for me and for the client option because our team
> or elara team is made of 1 or 3 person which study and etc — if we became
> millionaires of course we will increase the team — and also here in Angola
> there is a lot of scamming and burla, so take that into account as well.»

Isto não é um anexo: é o filtro. Traduzido em decisões concretas da app:

- **Nada de dinheiro automático.** Pin de 4 dígitos verificado no servidor com
  bloqueio de linha e 5 tentativas em 5 minutos; `tr_finish_trip` exige o tempo
  mínimo plausível para a distância (a 60 km/h de média, nunca menos de 1
  minuto), para «aceitar e fechar em 3 segundos» não contar como viagem.
- **Dinheiro a bordo não cria saldo.** Se o passageiro paga em notas, o
  motorista já tem as notas; creditar-lhe a carteira era inventar dinheiro. A
  comissão da plataforma fica registada como dívida (`owes_kz`) para acertar
  com a equipa.
- **Comissão e preço voltam a bater certo.** O preço mostrado é a soma das
  linhas mostradas (correcção A1/A2 da `0005`), e a taxa de pedido só é abatida
  onde efectivamente entrou.
- **Confiança sem exposição.** O link público de partilha (`#/viagem/<token>`)
  mostra rota, estado e carro durante 24 h — nunca PIN, telefone, e-mail ou a
  conta de alguém. Os atalhos guardados (casa, escola, trabalho) nem a equipa
  os lê: é o único sítio da app onde a política «staff vê tudo» foi cortada,
  porque a app prometeu não espiar moradas pessoais.
- **Nada que exija uma equipa que não existe.** Sem PostGIS, sem canal de
  realtime próprio, sem chat interno de suporte, sem fila de suporte. Uma
  equipa de 1–3 pessoas tem de conseguir correr isto ao fim de uma tarde, por
  isso os mecanismos de confiança são verificáveis em SQL e a rede móvel é
  tratada como hostil (polling de 25 s por cima do subscribe).

---

## 3. Os quatro pilares do Elara e onde a Trajectoria serve cada um

Do dossier do Elara Marketplace — é a razão de ser do roadmap, não uma lista de
funcionalidades:

1. **Dependência do vendedor** — logística controlada pela plataforma,
   reputação não transferível, contactos reais escondidos.
   *Trajectoria:* é a peça de logística que falta (secção 4). O vendedor
   continua a ver o pedido dele; a entrega passa a ter prova (código, estado,
   tempo).
2. **Painel do vendedor** — alertas de stock, preços, relatórios de lucro.
   *Trajectoria:* não é trabalho nosso; só não o atrapalha.
3. **Social commerce** — perfis seguidores, prova de compra em tempo real,
   partilhas para o WhatsApp Status.
   *Trajectoria:* a partilha de viagem (`#/viagem/<token>`) e o comprovativo
   são a mesma ideia aplicada a quem se move.
4. **Fit Angola** — Multicaixa/Expresso, marcos em vez de códigos postais,
   baixo consumo de dados em 3G.
   *Trajectoria:* Kwanza inteiro, zonas por nome em vez de coordenadas postais,
   SVG vectorial em vez de fotografias, modo «poupar dados», e o maplibre em
   chunk separado para a app abrir em 3G.

---

## 4. A ligação com o Elara Marketplace (pedido de 2026-10-20)

> «continue improving the app database and etc and somehow make it connect to
> elara marketplace app and archive the goals i send»

Foi feita **sem precisar de migração aplicada**, porque o RLS do Elara já o
permitia: `orders_select_participants` e `order_items_select_participants`
(migração 014 do Market) deixam o comprador ler a encomenda dele. Verificado no
servidor vivo: `orders` e `order_items` respondem `[]` a um pedido anónimo e só
mostram linhas com sessão do dono.

O caminho do utilizador:

1. No Elara, pedido do comprador em `held` ou `shipped` → botão
   **«Entregar com a Trajectoria»** (`OrdersView.tsx`), só para contas reais.
2. Abre `https://trajectoria-ao.vercel.app/#/encomenda/<código>` em novo
   separador. **Só viaja o código** — nunca o telefone nem a morada.
3. As duas apps partilham base de dados, chave e sessão de `auth.users`; a
   pessoa entra com a conta dela, e `src/lib/orders.ts` lê a encomenda.
4. O `OrderNotice` mostra o que está a ser entregue e sugere a zona pelo nome do
   bairro. **A sugestão nunca é o destino**: é um toque para aplicar, porque a
   morada do Market é texto livre.
5. Ao criar a viagem, `linkOrder()` grava o par viagem↔encomenda (`0006`).

Três coisas que ficam de fora de propósito: a **origem** (a loja) não se
auto-preenche, porque `profiles_public` não publica morada nenhuma e `profiles`
só é legível pelo dono e pela equipa; o **telefone** não vai no URL; e
**nenhum dinheiro circula** entre as duas apps por esta via — o aviso está no
ecrã, antes de a pessoa pedir a corrida.

**Sessões não partilham entre origens** (`elara-ao` ≠ `trajectoria-ao`): quem
ainda não entrou é mandado entrar primeiro, com uma linha a dizer porquê, e o
código fica em espera até lá — não se perde o link.

---

## 4-A. Vaga D — localização exacta, ficha de motorista, lucro, auditoria (2026-10-25)

> «agora melhore o systema de lolizacao para ser uma localizacao exata e com
> nome do bairro e do local exto ve exemplos como yango que eu enviei e heetch de
> angola egoogle maps e torne o processo de inscricao de motorista mais formal e
> testar ter informacoes tipo algo melhor mesmo que testa valida se a info e certa
> testando a matricula e etc e uma opcao de teste para mostrar ao motorisata como
> vai ser e tambem poe ja o nosso lucro imbutido nas veiajens etc e etc e melhore
> o app em geral faca uma aditoria do que falta para ser completo e observe outros
> apps em angola e exterior e veja oque falta oque pode ser acrescentado e etc»

Quatro pedidos, e um filtro que atravessa os quatro: **«valida se a info é certa
testando a matricula»** só pode ser cumprido até onde Angola permite, e a app
escreve esse limite em vez de o esconder.

| pedido | o que ficou feito | o que não podia ficar |
|---|---|---|
| Localização exacta com nome do bairro **e** do lugar | `src/lib/places.ts` com um índice construído em bloco a partir do OpenStreetMap: **2 391 lugares** (300 bairros distintos com nome, 72 vias de passagem, e os marcos que a pessoa usa para se explicar — 42 hospitais, 147 escolas, 167 lugares de culto, 36 mercados, 104 postos de combustível, 51 largos), cada um com coordenada própria, município (`parent` em 2 388) e o id OSM de origem, com a zona de preço mais próxima junta em `placesFor` quando as `tr_zone` chegam e uma porta de **30 km** que não deixa aparecer nada fora do que a app cobra. A procura exige **todos** os tokens, tolera uma tecla a mais, e ordena por hierarquia (bairro antes de povoação) e depois por distância; `nameAt()` nomeia um pin arrastado com duas regras à vista — ponto até **700 m**, bairro até **2 km**, e, à mesma distância, o bairro ganha ao marco. `ZonePicker` põe o pin no ponto na **partida** e escreve o nome no **destino** | um geocodificador ao vivo: pediria a chave de terceiros, custava dados em 2G, e enviaria a posição de alguém para fora. Um POI inventado é pior que nenhum — e «Dangeres», que o dono viu da rua, ficou de fora na primeira apanha porque **se procurou com a grafia ouvida, não com a do mapa** («Dangereux», `node/1634902967`); ver a correcção em 4-C. Enquanto um nome não tem prova, a app pede-o (ver 4-B) |
| Inscrição «mais formal e testada», a validar a matrícula | `DriverFicha.tsx` em 4 passos + `src/lib/plates.ts`: forma do Decreto Presidencial 202/16, as 19 províncias, séries de 1975-1996 / 1996-2023 / em vigor, `00-00` da lei rejeitado, chapa ↔ província da praça, chapa ↔ ano do carro, duplicidade lida do `tr_driver` (índice `unique` da 0003) + `src/lib/drivers.ts` | «verificámos no registro»: **não existe registo público de matrículas em Angola**. Também não se mostra documento «confirmado» — as quatro caixas são declaradas, e a tabela chama-as `declared_at` |
| Opção de teste para mostrar ao motorista como vai ser | `DriverRehearsal.tsx`: o cartão que o passageiro vê, a fila de estados reais, «Quanto fica para si» com a comissão verdadeira, o `trial_trip_limit`; faixa «SIMULAÇÃO — nada aqui foi gravado nem enviado»; também acessível a quem já se inscreveu | gravar seja o que for durante o ensaio; e uma comissão de cabeça quando a leitura de `tr_setting` falha — aí diz «não conseguimos ler» |
| Lucro da Elara embutido nas viagens | uma percentagem só, `tr_setting.commission_pct` (0003), lida por `MarginPanel` (equipa), pelo painel do motorista (`driver_keeps_kz`) e pelo ensaio; recibo do passageiro | duplicar a taxa no cliente, ou apresentar a comissão como «taxa escondida»: o preço mostrado é a soma das linhas mostradas |
| Auditoria de completude, com apps de Angola e do exterior | secção 6-C, e a `0007` escrita para as três coisas que a auditoria mostrou precisarem de DDL | aplicar a `0007`: continua à espera do dono, como 0004, 0005 e 0006 |

**Como a vaga D foi verificada:** `tsc --noEmit` limpo; `vite build` limpo; os
12 casos de forma de matrícula e os 5 de cruzamento província/ano testados com
`.pkg/plates_test.cjs` (bundle real, não fonte); a bateria de `.pkg/contrast.cjs`,
agora com **143 pares** em todos os ecrãs e os novos todos medidos nos dois
temas (pior **4,83:1**, zero
falhas AA — um `zinc-400` sobre branco a 2,58:1 foi corrigido para `zinc-600`
antes de publicar); texto novo confirmado dentro do `index-*.js`; bundle
publicado comparado byte a byte com o `dist` (cksum); APK refeito e os `assets`
interiores conferidos contra o `dist`. A vaga fechou com `index-CadFj9zf.js` +
`index-BFFCBiTu.css` servidos idênticos ao `dist` (cksum `2796695093` /
`2294646702`) — o destino com nome entrou na última publicação, depois da
auditoria ter mostrado que só a partida tinha lugar exacto.

**E a peça que a auditoria mandou atacar a seguir** (mesmo dia, item 4): os
papéis com validade. Verificada do mesmo jeito, com uma camada a mais porque
aqui há aritmética de datas: `.pkg/expiry_test.cjs` compila o `expiry.ts`
**verdadeiro** com o `./supabase` substituído por um servidor morto que responde
sempre «column does not exist» — que é exactamente o estado da production hoje,
com a `0008` por aplicar — e os ~45 casos cobrem calendários impossíveis, as
fronteiras do dia de Luanda, o ano bissexto, todas as frases de estado, a
degradação para «só neste telemóvel» e o apagamento de uma data (que obrigou a
separar a *leitura* que junta do `savePapers` que *substitui*: fundir apagava
silenciosamente uma data que o motorista tinha limparado). `tsc --noEmit` e
`vite build` limpos; bateria de contraste agora com **175 pares** (pior
**4,83:1**, zero falhas AA); publicado e conferido byte a byte — os bundles
servidos são `index-DeXZGxXG.js` (`cksum 1692030832 355555`) +
`index-DutHuXs_.css` (`1966559603 48024`), e os `assets` dentro do APK são os
mesmos bytes (`sha1 1a630686e552` / `54651d044b65`).

A mesma peça abriu uma falha e a mesma vaga fechou-a (a cópia dos dados não ia
buscar a ficha do motorista — ver §7), e o bundle daquela segunda publicação foi
`index-B262PUwD.js` (`cksum 2181886750 356572`) com o
`index-DutHuXs_.css` **inalterado** (`1966559603 48024`) — o que é, ele próprio,
uma verificação: uma mudança só de lógica não deve mexer no CSS. Os dois
conferidos byte a byte contra o `dist` e outra vez dentro do APK
(`sha1 d0b63095ab10` / `54651d044b65`, APK 4 083 632 B). O bundle **servido hoje**
é o da vaga E, logo abaixo.

---

## 4-B. Vaga E — identificação de bairro e de onde vieram os nomes (2026-10-25)

> «olha melhore ai os systema de identificacao de bairo porque euestou no mbondo
> chapeu e ao meu lado bairros fubu mbondo dangereux e etc voce pegou info da
> yango e bairros de angola no maps ?»

Dois pedidos numa frase, e o segundo é uma **pergunta sobre a origem dos dados**
— por isso a resposta não pode ser um adjectivo.

**De onde vieram os nomes: do OpenStreetMap, e nada do Yango.** A prova está no
facto de a app nunca ter pedido nada a terceiros (zero chaves, zero endpoints no
bundle) e de **2 390 dos 2 391** nomes trazerem o identificador OSM com que foram
apanhados (`node/1637418066`); o que falta é o da equipa, e traz `proof` em vez de
`osm`. (À data desta vaga eram 240 de 241 — a proporção é a mesma, o que mudou foi
o tamanho da apanha: ver 4-C.) As ferramentas em `.pkg/` são a outra metade da prova: a recolha larga
(`fetch_wide.sh` → `wide_cache.cjs`), que traz os **bairros**, os marcos e as vias
em seis perguntas Overpass sobre a caixa de Luanda e a de Angola; o `reverse`
Nominatim por célula
de ~1,1 km (`cellOf`, `toFixed(2)`), uma vez por célula e não uma vez por lugar,
que dá o município a cada um; os 62 nomes finos que já estavam conferidos um a um
(avenidas, shoppings, hospitais), que o bloco não traz porque o OSM os etiqueta
como `amenity`/`shop`/`primary` e não como `place`; e, por último, os nomes da
equipa com prova. Tudo a um pedido por segundo, com User-Agent nosso e
`accept-language=pt`. O Yango não foi consultado, e o código privado dele não
seria consultável mesmo que a ideia surgisse — seria exactamente a coisa que o
brief proíbe.

**O que a pergunta trouxe à luz:** os nomes que a app mostrava eram 62, escolhidos
à mão por categoria (shopping, hospital, avenida), e um bairro é precisamente o
que essa lista não tem. Medido hoje, contra o índice reconstruído:

| lugar dito pelo dono | estado | o que se fez |
|---|---|---|
| **Fubu** | só como um dos 62 | está agora **dobrado** como `Fubu` (suburb) **e** `Fubú` (neighbourhood) — o OSM traz as duas grafias e as duas ficam, porque «o meu bairro» e «a paragem ao meu lado» são coisas diferentes |
| **Mbondo / Mbondo Chapéu** | **não existia como lugar de Luanda** — o OSM só tinha `node/6282394678` «Igreja Bom Deus mbondo chapeu», dentro de Fubú, Município do Talatona; e quando se procura «Mbondo» a sério, o que vem é **Mbondo, Malanje**, outro lugar com o mesmo nome, noutra província | entrou como o único `kind: reported` do índice, `via: 'equipa'`, com a `proof` escrita no JSON. As coordenadas são as da igreja, **não** o centro do bairro, e o texto diz isso. No ecrã: «dito pela equipa» e «Nome dito pela equipa, não pelo mapa.» |
| **Dangeres** | **estava no OSM e a app não o viu**: a sonda de 25-10 foi feita com a grafia ouvida à rua (`?q=Dangeres`, `?q=Bairro Dangeres`), que devolve efectivamente zero; o nome no mapa é **«Dangereux»**, `node/1634902967`, `place=suburb`, no Município do Talatona. Corrigido e confirmado a 25-10 à noite com uma pergunta ao Overpass por `name~"Danger"` — ver 4-C | o que se manteve firme: não foi inventado nem copiado de um concorrente. Quem escreve «dangeres» recebe agora o Dangereux do mapa (a procura tolera a tecla a mais); só quando não há nada com aquele nome é que aparece «Falta o nome de «X» — diga-nos», que escreve `tr_report` com `reason: lugar_em_falta` e entra na fila que a equipa lê |

| pedido | o que ficou feito | o que não podia ficar |
|---|---|---|
| Melhorar a identificação de bairro | índice de **2 391** nomes (62 → 241 → 2 391, a última apanha em 4-C) colhidos em bloco; hierarquia de tipos (`RANK`) para um bairro ganhar de uma loja com o mesmo nome; procura que exige **todos** os tokens, tolera acentos, ordem e uma tecla a mais, e ignora buscas de uma letra; `nameAt()` com duas regras (ponto ≤ 700 m, bairro ≤ 2 km) em vez de uma; `parent` real (Município de Luanda 963, Talatona 489, Belas 193, Ícolo e Bengo 53, Cacuaco 41, Cazenga 40…) em **99,9 %** dos nomes | escrever um nome porque «a pessoa disse», sem prova; dar o nome de um bairro a 6 km do pin |
| Dizer a verdade sobre a origem | rodapé do `ZonePicker` com OSM + ODbL + a data em que o índice foi apanhado (`fetched_at` → `DATA_DATE`, nunca à mão), etiqueta «dito pela equipa» nos nomes fora do mapa, e esta secção | «dados do Google Maps» / «como o Yango»: a app não fala com nenhum deles |
| Caminho para a equipa acrescentar nomes **sem recompilar a lógica** | `.pkg/places_team.json` — um nome por linha, com `lat/lon` e `proof` obrigatórios (o builder **rebenta** se faltem), `via: 'equipa'` posto por ele, e o JSON reconstruído em dois minutos sem tocar em código (a pasta `.pkg/` não viaja no zip; pede-se ao dono — está dito no `HANDOFF.md` §0) | nomes sem prova; e um `tr_place` gerível pela equipa, que é a 0007 e continua à espera do dono |
| Fechar o ciclo quando falta um nome | `reportMissingPlace()` (`lib/reports.ts`) com `PLACE_REPORT_REASONS` (`lugar_em_falta`), dedupe de 24 h por conta e texto, e quatro respostas em palavras («Guardámos a palavra que procurou», «Já pediu esse nome hoje», «Escreva primeiro…», «Agora não conseguiu enviar»); passa a ir ter com a fila que a `TeamConsole` já lê | DDL: `tr_report.reason` é `text not null` **sem CHECK** (0001, linha 241), por isso uma chave nova é uma string, não uma migração — e a `0007` (`tr_place`) não é pré-requisito disto |

**Como a vaga E foi verificada:** `tsc --noEmit` limpo; `vite build` limpo.
`.pkg/places_test.cjs` (**23 asserções na altura, todas «tudo certo»** — a vaga F
levou-o para 49, ver 4-C) compila o
`places.ts` **verdadeiro** contra o **JSON real** e cobre: o pin no Mbondo Chapéu
nomeia-se a si mesmo e diz `via === 'equipa'`; «fubu» devolve o bairro antes de
uma loja; «mbondo chapeu» = «chapéu mbondo»; um município no meio da pergunta não
estraga a busca; nome inexistente → 0; uma letra → 0, duas já ajudam; os bairros
passaram de 18 para mais de 120; >80 % dos nomes têm pai; nenhum nome ficou sem
zona de preço; no mato **não se inventa** ponto nem bairro, mas a paragem vem com
os metros; no meio do Fubu o bairro é nomeado e nunca além de 2 km; `zones` vazio
degrada sem rebentar. `.pkg/reports_test.cjs` (**11 asserções**) bundliza o
`reports.ts` com o `./supabase` substituído por um Proxy thenable e verifica a
tabela, a razão, o texto limpo, `trip_id: null`, o carimpe em ms, o duplicate →
`ja_pedido` **sem insert**, a leitura de duplicate a falhar → ainda tenta, o erro
do servidor → `falhou`, e a busca vazia → `vazio` com **zero chamadas**. A
bateria de `.pkg/contrast.cjs` cresceu de 175 para **189 pares** (os 14 novos são
as strings de «lugares»: o botão de pedir, as quatro respostas, «dito pela
equipa», a distância em palavras, o rodapé), medidos nos dois temas por cima de
camadas `over()` reais — pior **4,83:1**, zero falhas AA.
Custo medido, não previsto: o ficheiro de dados passou de 11 012 B para
41 221 B (**+30 209 B crus, +4 859 B gzip**, os dois com o mesmo `zlib` nível
por omissão) e o chunk principal ficou em 381 107 B / **103 705 B gzip**.
Publicado e conferido byte a byte:
`index-CO-DAfym.js` (`cksum 2406150277 381107`) com o
`index-DutHuXs_.css` **outra vez inalterado** (`1966559603 48024`) — segunda
mudança consecutiva que não toca no CSS, o que é a verificação de que foi só
dados e lógica. APK 4 090 028 B com os mesmos bytes lá dentro
(`sha1 67a5c067f070` / `54651d044b65`).

## 4-C. Vaga F — «todos os bairros que puder», e o que o OSM sabia e a app não
sabia (2026-10-25)

> «PONHA A TODOS BAIROS QUE PODER E FOR IMPORTANTE GET INFO»

Escrita assim, a pedido tem duas partes: ** recolher o que estiver disponível** e
**ir buscá-lo a sério** em vez de o imaginar. Fez-se a primeira e, com ela,
descobriu-se que a segunda tinha um erro enterrado: a 4-B escreveu que «Dangeres»
não existia no OpenStreetMap. **Existe.** É `node/1634902967`, `place=suburb`,
`name=Dangereux`, no Município do Talatona — a sonda de 25-10 tinha sido feita
com a grafia ouvida à rua e, como é natural, `?q=Dangeres` devolve mesmo zero. O
que estava errado não foi o critério (não se escreve um nome no índice porque a
pessoa o disse); foi ter dado a pergunta errada ao mapa e ter chamado «o mapa não
conhece» à minha própria pesquisa. Confirmado com `name~"Danger"` no Overpass, e
correcció no sitio: a linha da 4-B diz agora o que se sabia e o que se sabe.

**A apanha, em três passos com ficheiro próprio** (`.pkg/`, que não viaja no zip
e se pede ao dono): `fetch_wide.sh` faz seis perguntas Overpass — todos os
`place` nomeados da caixa de Luanda e os `place~city|town` de Angola inteira,
`landuse=residential`, treze `amenity`, três `shop`, `tourism`, `leisure`, e as
`highway` `trunk|primary` com nome — e grava a cru; `wide_cache.cjs` trata e
filtra; `build_places.cjs` pergunta o município e escreve o índice da app. São
três passos porque o Overpass público anda saturado: `overpass-api.de` e
`kumi.systems` responderam 502, `openstreetmap.fr` respondeu sempre, e um 502 a
meio já não custa o trabalho todo.

**Os números, todos impressos pelo próprio pipeline, none escritos à mão:**

| conta | valor |
|---|---|
| colhido cru | **2 907** lugares + **1 413** troços de via (70 nomes de via distintos) |
| ficou de fora | **436** bancos e ATMs · **82** nomes que são só a categoria · **28** sem letras · **1** de uma letra · **1** via fora de Angola |
| bloco tratado | **2 418** |
| índice publicado | **2 391** lugares, **2 388** com município (**99,9 %**, eram 46,2 %), **2 390** com id OSM, **1** dito pela equipa com `proof` |
| perguntas ao Nominatim | **792** células de ~1,1 km (640 novas), 1 pedido/s, `zoom=10`, User-Agent declarado |
| o que a pessoa vê | **2 021** de 2 391 com as 53 `tr_zone` da seed (84,5 %); 370 cortados por caírem a mais de **30 km** da paragem que dá o preço; o mais longe admitido está a 29,4 km |
| bairros com nome | **296** visíveis (300 no índice), contra os 18 da primeira versão que motivou a vaga E |
| custo de procurar | `searchPlaces` **2,45 ms**, `nameAt` **0,55 ms** com as 53 zonas |

**Ficou de fora porque não serve um encontro, não por capricho.** A regra vive
num ficheiro só, `.pkg/place_rules.cjs`, e é uma frase: *um nome só entra se
servir para dizer a alguém onde se está*. 436 bancos e ATMs das mesmas quatro
marcas afogariam os bairros na procura e ninguém diz «estou no Banco BIC» sem
dizer qual; «Farmácia», «Cantina», «Condomínio» a secas são trinta na cidade; e
um quarteirão chamado «H» não é um nome. **Os filtros correm nos dois sítios** —
no bloco e ao escrever — porque o builder readmite o índice anterior para não
perder os nomes finos que a primeira versão conferiu um a um; aplicá-los só ao
bloco deixaria para sempre no ficheiro o que lá entrou uma vez. Foi assim que o
«H» saiu e que cinco avenidas duplicadas se fundiram: uma avenida é uma linha, e
dois pontos dela com o mesmo nome a 400 m um do outro, ambos «Município de
Luanda», são um enigma sem resposta. Terceira chave de dedupe, só para vias,
apenas pelo nome.

**O erro que custou três noites e uma percentagem.** 640 perguntas ao Nominatim
correram e não perguntaram nada: um `catch { /* sem município */ }` engolia
`fetch failed`, que neste Windows é o Avast a fazer MITM do TLS e o Node a não
confiar na CA dele (`NODE_EXTRA_CA_CERTS=~/.elara/avast-shield-root.pem` — a
regra já estava escrita para o `vercel`, e o `fetch` do Node obedece-lhe da mesma
forma). O sintoma foi uma percentagem: 46,2 % dos nomes com pai, quando a resposta
real do mapa é 99,9 %. Um `catch` que engole um erro de rede precisa de (a) um
contador, (b) a primeira mensagem de erro guardada, e (c) uma frase que diga o
que fazer — hoje o builder imprime `ATENÇÃO: N/M células sem resposta. Primeiro
erro: «…`. A segunda correcció no mesmo sítio foi o `zoom`: 14 devolvia a rua e
não deixava adivinhar o município; 10 devolve o município, que é o campo.

**O que o índice maior obrigou a mudar na app**, para não ser só dados:

- **A porta dos 30 km** (`ZONE_MAX_KM`, em `indexed()`). A caixa de Angola inteira
  traz povoações do Uíge, da Lunda e — literalmente — do Kasaï. Uma lista de
  paragens possíveis não pode ter uma vila a 700 km, e o corte **não** é uma
  caixa gravada no JSON: é a distância à `tr_zone` mais próxima, medida quando as
  zonas chegam do servidor. O dia em que a equipa puser um terminal no Uíge, as
  povoações à volta aparecem sozinhas, sem reconstruir nada. Verificado: com as
  53 paragens da seed, **todas** têm pelo menos um lugar; com quatro, o índice
  ainda mostra 1 957.
- **Pré-normalização.** Com 2 391 nomes e a procura a correr a cada tecla,
  `fold()` de cada nome x cada tecla deixou de ser de graça. `indexed()` calcula
  as strings dobradas **uma vez** por conjunto de zonas e guarda-as ao lado das
  linhas; os 2,45 ms medidos são isso, não sorte.
- **Uma tecla a mais não esconde um bairro.** `tokenScore` aceita o radical de um
  token de seis letras ou mais: `dangeres` → `Dangereux`, `bairros` → `bairro`. Só
  com seis letras, para não adivinhar em nomes curtos.
- **Ao mesmo distância, o bairro ganha ao marco.** Com milhares de pontos, o pin
  do Mbondo Chapéu passou a calhar em cima da `Igreja Bom Deus mbondo chapeu`, que
  o OSM põe na coordenada exacta do bairro, e a app respondeu o nome da igreja. A
  pessoa diz «estou no Mbondo Chapéu»; `nearest()` desempata por `RANK` e o marco
  ficou na segunda palavra, onde sempre devia ter estado.
- **«Lugares no mapa» em vez de «Lugares exactos»**, e o mesmo nos conselhos do
  `ZonePicker`: com 72 vias dentro, vender tudo como ponto exacto seria mentir.
  Uma avenida diz por onde se passa.

**O preço, medido antes de decidir, e pago de propósito.** O ficheiro de dados
passou de 41 221 B para **401 339 B crus**; o chunk principal de 381 107 B /
103 705 B para **639 003 B crus / 161 292 B comprimidos** — **+360 118 B crus**
no JSON e **+257 896 B crus / ≈57 500 B comprimidos** no chunk (`zlib.compress`
de Python, nível 6 por omissão; os 103 705 B da vaga E mediram-se da mesma
forma). Três alternativas
foram medidas e rejeitadas: (a) tirar o `osm` de cada linha poupava ~17 KB gzip e
custava a única coisa que prova que um nome veio do mapa em vez de ter sido
escrito — fica; (b) formato compacto (linhas em array) poupava ~3 KB gzip e
custava a legibilidade do JSON que alguém vai ler no sítio — não fica; (c)
carregar o índice com `import()` só quando o `ZonePicker` abrisse poupava os
57 KB ao *primeiro* ecrã, mas o `ZonePicker` é o primeiro ecrã de quem quer uma
corrida, quebrava a promessa de «zero pedidos em 2G» e obrigava a tornar
síncrono o que `nameAt()` tem de ser enquanto se arrasta o pin. Fica no bundle.
Em 2G são ~3 s a mais numa ligação ruim, uma vez, e o HTML fica em cache.

**Verificado:** `tsc --noEmit` limpo; `vite build` limpo;
`.pkg/places_test.cjs` cresceu de 23 para **49 asserções**, todas «tudo certo»,
contra o **JSON que viaja na app** — incluindo as novas: nenhum nome publicado
viola as regras, nada no índice está fora de Angola, nenhuma via aparece duas
vezes, cada tipo do índice tem palavra no ecrã (foram precisos `largo`, `ilha`,
`ilhéu`, `creche`, `esquadra`, `bombeiros`, `correios`, `faculdade`, `posto de
combustível`, `quinta`…), o Dangereux está lá e acha-se escrito «dangeres»,
«corimba» devolve bairro + largo + estrada, e a porta dos 30 km é medida contra as
53 paragens **lidas do SQL**, não de memória. `.pkg/contrast.cjs`: **189 pares**,
pior **4,83:1**, zero falhas AA, nos dois temas. Publicado e conferido byte a
byte: `index-C_lnEzCC.js` (`cksum 2732604144 639003`) servido em
https://trajectoria-ao.vercel.app, com `index-DutHuXs_.css` **inalterado**
(`1966559603 48024`) — foi só dados e lógica, outra vez — e grep ao texto novo
dentro do ficheiro servido (`Dangereux`, `Avenida 21`, `Fub`, `ilhéu`), e ainda
2 390 chaves `osm:` dentro do `index-*.js` baixado do site, que é a conta do
índice menos o único nome dito pela equipa. Reempacotado e **medido** (não
estimado, como estava no `HANDOFF.md` §0): `trajectoria-codigo.zip` com
**165 ficheiros, 1 119 KB**, `python -m zipfile` sem `\` nos caminhos, com os
2 391 lugares e as migrações 0001–0008 lá dentro, e sem `.env.local`,
`node_modules`, `dist` nem keystore.

---

## 5. Vaga B — o que os outros fazem e o que foi pedido «divertido / Angola»

Do anexo de 2026-10-21 (comparação Yango / Uber / inDrive + lista de features).

### O brief «fun features» (client-only primeiro, resto na 0005)

| # | pedido | estado | onde |
|---|---|---|---|
| 1 | Trip PIN de 4 dígitos, o motorista introduz para começar | ✅ | `tr_verify_pin` (0001) + `TripConsole`/`DriverConsole` |
| 2 | Link de partilha com vista só-de-leitura (rota, matrícula) | 🟡 | `tr_share_token` na 0005; a página `#/viagem/<token>` já está publicada e esconde-se sozinha |
| 3 | Animação do carro a correr na rota + «faltam X min» | ✅ | `MapView`/`RideBoard` com o pino do carro e ETA |
| 4 | Ecrã de fim de viagem com resumo e cartão «partilhar» | ✅ | `TripReceipt` (km, tempo, preço, WhatsApp) |
| 5 | Som + vibração quando o motorista chega, com banner | ✅ | `lib/alerts.ts` (`chime`, `vibrate`), `DriverDashboard`, preferências na conta |
| 6 | Copy com sotaque de Luanda (saudação por hora, dica de chuva) | ✅ | saudações e dicas por hora do dia na praça e no painel do passageiro |
| 7 | Elogios rápidos («simpático», «carro limpo», «boa música», «condução segura») | 🟡 | `tr_review` na 0005, lista fechada de etiquetas validada no servidor |
| 8 | Sequências e insígnias («5 viagens esta semana», «Madrugador») | ✅ | `DriverBoard` com marcas de contagem real |
| 9 | Código de convite, crédito confirmado pela equipa | 🟡 | `tr_referral` na 0005; nunca escreve saldo |
| 10 | Quadro semanal de motoristas, sem dinheiro | 🟡 | `tr_leaderboard` na 0005 |
| 11 | «Playlist da viagem» (calmo, kuduro, semba, silêncio) | 🟡 | `tr_trip_pref` na 0005 — nota, não promessa |
| 12 | Atalhos com emoji (Casa, Trabalho, Igreja, Praia) | 🟡 | `tr_saved_place` na 0005, só do dono |

### O que a comparação dizia ser bloqueante para lançar

| pedido | estado |
|---|---|
| Preço fixo mostrado antes de pedir | ✅ `tr_quote` no servidor; o que se vê é o que se paga (corrigido na 0005) |
| Sem números de telefone entre as partes | ✅ desde a 0001 |
| Badge «Verificado» do motorista | ❌ — e **não se pode inventar**: exige verificação de documentos com revisão humana. Hoje a app diz a verdade: «candidatura aprovada automaticamente» enquanto `auto_approve_drivers` estiver ligado. 🟡 desde esta vaga a ficha separa **declaração** de **verificação** (quatro caixas em `tr_driver_doc`, com `declared_at`) e a `0007` prepara as colunas `*_verified` para quando houver revisão humana. 🔒 decisão + processo da equipa |
| Pagamento em cartão / in-app | 🔒 nenhum parceiro (Multicaixa Express / PayPay / Stripe) — hoje é dinheiro, carteira com a equipa a confirmar |
| SOS, partilha e contacto de confiança | SOS ✅ (111 + mensagem com código); partilha 🟡; **contactos de confiança guardados ❌** (precisa de tabela) |
| Rotas/paragens fixas («Linhas» Cacuaco→Baixa) | 🟡 constrói sobre a 0004; a tabela de corredores ainda não existe |
| Nota de troco («vou pagar com nota de 5.000 Kz») | ✅ `TripConsole` + `lib/trips.ts`, mostrada ao motorista antes de aceitar |
| Modo baixo consumo de dados | ✅ `lowData` (abrande a varanda de carros e o polling) + faixa «ligação fraca» |
| Marcos no mapa em vez de morada | ✅ `src/lib/places.ts`: **2 391 lugares** de Luanda e das vilas servidas, colhidos em bloco no OSM, com nome, tipo (bairro/povoação/loja/avenida/igreja/mercado…), coordenada e município; escolhidos por coordenada e não por centro de bairro; o pin arrastado devolve o ponto até 700 m, o bairro até 2 km, e «a X m da paragem» fora disso. Zero pedidos a terceiros (ver 4-B e 4-C) |
| Reportar estado das estradas (cheias, buracos) | ❌ precisa de tabela e de alguém que olhe |
| Pagamento por terceiros / recarga de familiar | 🔒 parceiro de pagamentos e compliance |
| Viagens recorrentes (escola, trabalho) | ❌ precisa de agenda no servidor |

---

## 6. Vaga C — a spec completa (12 secções, P0/P1/P2)

### Regras de base da spec (secção 0)
Stack, prefixo `tr_`, tsc/build limpos, dois temas, pt-AO, Kwanza inteiro — ✅ a
cumprir. «Anything needing new tables goes into ONE new idempotent migration,
do not apply it» ✅ (0005; a 0006 ficou em ficheiro separado porque chegou
depois — e essa já está no servidor, vista hoje por SQL: `tr_order_link` existe,
com RLS). RLS em todas as tabelas novas ✅.
Nunca mostrar telefones ✅. Não prometer o que não se pode dar ✅. Não ligar
`tr_violation` ✅. Estados de loading/vazio/erro ✅. **Prioridades P0/P1/P2** —
é o que se segue.

### 1. Contas e identidade
| item | estado |
|---|---|
| 1.1 Registo/entrada passageiro+motorista numa conta, com mudança de papel | ✅ mesmo `auth.users` do Elara; `DriverView` alterna papel |
| 1.1 **Telefone com código OTP (primário em Angola)**, email como recurso | ❌ 🔒 o provider de SMS no Supabase precisa de contrato e dinheiro; enquanto não houver, a app entra por email — e é isso que está escrito no ecrã |
| 1.1 Limite de 5 códigos por hora, tentativas, re-verificação de número | ❌ (vem com o OTP) |
| 1.2 Documento de identidade, carta, título de propriedade, seguro, fotos do carro | 🟡 a ficha de matrícula passou a pedir **quatro declarações separadas** (licença da categoria certa, livrete/autorização do dono, seguro, e «esta matrícula é mesmo a deste carro») e grava-as em `tr_driver_doc` com `declared_at` — com a etiqueta de **declaração**, porque é isso que são. A app confere a **forma** da chapa com o Decreto Presidencial 202/16 e a província da praça, e confere a duplicidade no `tr_driver`, onde a 0003 pôs índice `unique` na coluna `plate`. **Identidade e fotos do carro ❌** 🔒 revisão humana de documentos é trabalho de equipa, não de código — e sem registo público de matrículas em Angola nenhuma app pode dizer «verificámos no registro» |
| 1.2 «Assim vai ser»: pré-visualização da conta antes de enviar | ✅ `DriverRehearsal` — o cartão que o passageiro vê, a fila de estados reais, quanto fica para si com a comissão **verdadeira** do `tr_setting`, e o `trial_trip_limit`. Faixa permanente «SIMULAÇÃO — nada aqui foi gravado nem enviado». Nenhum concorrente (Yango/Bolt/Heetch) mostra isto |
| 1.2 Estado rascunho → submetido → em revisão → aprovado/rejeitado/**expirado** | 🟡 hoje existe `pending/approved/rejected`. As **datas de validade** já existem (`0008`, ainda não aplicada) e a app usa-as para avisar; o estado `expirado` na fila da consola **não** foi acrescentado de propósito — pôr uma conta em estado novo é uma decisão sobre gente, e sem revisão humana a app não tem em que se apoiar para dizer que alguém está fora |
| 1.2 Fila de revisão na consola, motivo obrigatório, readmissão | ✅ `TeamConsole` |
| 1.2 Aviso 14 dias antes de um documento expirar | ✅ `src/lib/expiry.ts` + `src/components/DriverPapers.tsx`: quatro datas (carta, seguro, inspecção técnica, BI) escritas pelo motorista, um cartão no painel da praça que aparece só quando algo **vence** ou **falta 14 dias ou menos**, e «sem data» tratada como terceira coisa (um carro sem datas escritas é convidado a escrevê-las, não acusado de vencido). Com a `0008` aplicada as datas vão para a ficha no servidor e a equipa lê-as; sem ela ficam só no telemóvel e **a própria frase no ecrã diz qual dos dois planos está activo**. Nada auto-suspende ninguém, e o texto diz isso |
| 1.2 Bucket privado com URLs assinadas só para motorista e equipa | ❌ 🔒 Storage ainda não usado por esta app |
| 1.3 Editar nome, foto, idioma, preferências de notificação, atalhos, contactos de emergência | 🟡 nome/foto/tema/atalhos(🟡)/som-vibração-dados ✅; **contactos de emergência ❌**; **idioma ❌** (a app é só pt-AO, decisão de produto) |
| 1.3 Botão in-app de eliminação de conta + exportação de dados | ✅ `DataSheet` — entrada «Os meus dados e a conta» na folha da conta. O pedido de eliminação **não apaga nada**: escreve `tr_report` com `reason: apagar_conta` (sem `trip_id`, coberto pela política da 0001) e a equipa confirma antes de mexer na conta, que é a mesma do Marketplace — e o estado desse bilhete lê-se agora na mesma folha («Aberta / Em análise / Resolvida»). A exportação é a leitura que o próprio RLS da pessoa já tem, tabela a tabela, e diz o que não veio — e desde a peça da validade **inclui a ficha de documentos**, com as datas por extenso ao lado dos millis e o que só vive neste telemóvel etiquetado à parte. |

### 2. Pedir uma viagem
| item | estado |
|---|---|
| 2.1 Localização actual com explicação, pin manual como recurso | ✅ |
| 2.1 Procura de lugares, recentes e guardados | 🟡 guardados na 0005; recentes ✅ (localStorage); **procura por nome de lugar ✅** (`lib/places.ts`: 2 391 lugares com coordenada própria, município e hierarquia — bairro antes de povoação, todos os tokens da busca têm de aparecer e uma tecla a mais não esconde um bairro; escolhe o ponto, não o centro do bairro) |
| 2.1 Nota de marco + foto opcional | 🟡 nota ✅ e **preenchida sozinha** quando o pin cai junto de um lugar conhecido (`nameAt`, regra dos 700 m à vista no código); **foto ❌** (Storage) |
| 2.1 Tiles leves em modo baixo consumo | ✅ |
| 2.2 Preço exacto antes de confirmar; igual ao cobrado | ✅ RPC no servidor |
| 2.2 Fórmula configurável pela equipa (`tr_pricing`), multiplicador por hora **manual**, nunca surge | ✅ tabela de tarifas na base de dados, editável pela equipa; sem surge |
| 2.2 Decomposição do preço (distância, tempo, taxa) | ✅ linhas mostradas = preço |
| 2.3 Classes: Económico, Conforto, Lugar, Entrega | ✅ (+ Hiace, Canter, carga, aluguer — pedido do dono de 2026-10-18) |
| 2.4 Dinheiro / Carteira, e nota de troco | ✅ tudo, incluindo «nota de 5.000 Kz» |
| 2.4 Carteira com reserva (hold) capturada no fim | ❌ hoje a carteira é saldo confirmado pela equipa; **reserva exige provider de pagamento** 🔒 |
| 2.5 Pedido com timeout total e oferta de repetir/alargar/agendar/cancelar | ✅ «ninguém aceitou» com ações, nunca fica pendurado |
| 2.5 Entrega a um motorista de cada vez (15 s) ou broadcast | ✅ broadcast com trava de motorista ocupado (A7, escrito na 0005) |
| 2.5 O motorista vê distância/ETA/preço/direcção antes de aceitar | ✅ |
| 2.5 Realtime com fallback de polling | ✅ |
| 2.6 Estados + `tr_ride_event` com carimbo e actor | 🟡 estados ✅; histórico de eventos por viagem ✅ no servidor; tabela separada por evento ❌ |

### 3. Durante a viagem
| item | estado |
|---|---|
| 3.1 Posição enviada a cada 4–5 s, mais lenta parado, fila local sem rede | 🟡 polling adaptativo ✅ (15→60 s no modo dados); **fila offline de posições ❌** |
| 3.1 Guardar pontos para disputas, purgar aos 90 dias, e dizê-lo | ❌ 🔒 precisa de decisão de retenção e de tabela |
| 3.2 Pin de embarque, foto do motorista, contagem de viagens, badge «Verificado» | 🟡 pin ✅ e **com nome** (o ponto escolhe-se por lugar, e um pin arrastado devolve o nome do lugar ou «a X m da paragem»), matrícula/nome/veículo/contagem ✅; **foto e badge ❌** (dependem de 1.2) |
| 3.3 «Abrir no Google Maps/Waze» | ✅ deep link no painel do motorista |
| 3.4 Chat por viagem, 30 min após o fim, respostas rápidas | ✅ `ChatPanel` com mensagens moderadas no servidor |
| 3.4 Chamada com número mascarado | 🔒 nenhum provider — por isso nem se mostra telefone |
| 3.5 Mudar destino / adicionar paragem a meio | ❌ (há paragens no momento do pedido, não a meio) |
| 3.6 Cancelamento gratuito dentro de 2 min; taxa depois, mostrada antes | 🟡 cancelamento com regras e tempo de espera ✅; a taxa de cancelamento **não é cobrada automaticamente a ninguém** |
| 3.6 «Passageiro não apareceu» com prova de proximidade | ✅ no painel do motorista |

### 4. Dinheiro
| item | estado |
|---|---|
| 4.1 Preço final = estimativa, com recibo partilhável | ✅ `TripReceipt` (imagem/texto para WhatsApp) |
| 4.2 Carteira de razão (ledger) com saldo calculado | ✅ `tr_wallet` + `tr_wallet_tx` (0001) |
| 4.2 Chave de idempotência em cada RPC de dinheiro | ❌ — os RPCs usam trava de linha e estados, que é o que evita o duplo toque; **a chave cliente-idempotente falta** |
| 4.3 Dívida de comissão em viagens a dinheiro, com limite para aceitar novas | 🟡 `owes_kz` entra na 0005; **o bloqueio por limite ❌** |
| 4.3 O lucro da plataforma está embutido e é visível para quem o paga | ✅ uma só percentagem no banco (`tr_setting.commission_pct`, 0003) e três sítios a lê-la: o recibo do passageiro, o painel do motorista (`driver_keeps_kz`) e o novo «Quanto fica para si» no ensaio do candidato, que usa o valor **real** e o período de tolerância em vez de um número de cabeça. A equipa propor outra percentagem é `MarginPanel` na consola. O que não mudou: a taxa continua a ser a que o servidor cobra — nenhum botão redesenha o tarifário |
| 4.4 Resumos diários/semanais do motorista + levantamento | ✅ painel do motorista + fila da equipa |
| 4.5 Gorjeta | ❌ (precisa de carteira real / provider) |
| 4.6 Reembolso total ou parcial, com motivo, visível ao passageiro | ❌ 🔒 sem parceiro de pagamento não há o que reembolsar — a equipa acerta à mão |
| 4.7 Códigos de promoção e convites | 🟡 convites na 0005 (fila para confirmar); **promo codes ❌** |

### 5. Segurança e confiança
| item | estado |
|---|---|
| 5.1 SOS com confirmação, partilha os dados da viagem, número local | ✅ (marca 111; texto pronto com código, zona e estado) |
| 5.2 Até 5 contactos de confiança guardados | ❌ precisa de tabela |
| 5.2 Link «partilhar viagem» que expira com a viagem + 1 h | 🟡 0005 (24 h, com revogação) |
| 5.3 Desvio de rota / paragem longa → «Está tudo bem?» | 🟡 **verificação de viagem** desde hoje (`src/components/RideCheck.tsx`): o sinal é o TEMPO — uma viagem «em viagem» muito além do que a distância permite pergunta, e sem resposta em 5 min escreve um reporte em `tr_report` que a equipa já lê. O que falta: desvio medido em rota e paragens curtos, que precisam do GPS do passageiro ou do feed do carro |
| 5.4 Estrelas 1–5 dos dois lados + etiquetas + comentário opcional | 🟡 estrelas ✅ na 0001; elogios na 0005; comentário livre ❌ (não se pode moderar com 1–3 pessoas) |
| 5.4 Média só depois de N avaliações; baixa média vai para revisão da equipa | 🟡 média com contagem real ✅; **limiar de mostra ✅** (abaixo de 3 notas a app mostra «novo · 2 notas», nunca um 5,0 de uma avaliação — `lib/reputation.ts`); esconder a média no servidor ❌ (coluna da 0005) e «vai para revisão» 🔒 trabalho de equipa |
| 5.5 Reportar com categoria, severidade, foto, estado visível (aberta → em análise → resolvida) | 🟡 categoria e motivo ✅, processo na consola ✅, **estado visível ✅ dos dois lados desde hoje**: quem reportou lê `tr_report.state` e a nota da equipa em «Os meus dados», e a consola escreve os dois (`lib/reports.ts` + `MyReports`); **severidade ❌** — `tr_report` só tem `state`, gravidade seria coluna nova; **foto ❌** (Storage) |
| 5.5 Centro de ajuda / objectos perdidos | 🟡 **centro de ajuda dentro da app** desde hoje (`src/components/HelpSheet.tsx`, em «A minha conta → Ajuda e segurança»): 10 perguntas com a resposta que a app cumpre de facto — preço, código de 4 dígitos, telefone invisível, dinheiro/troco, SOS, «Está tudo bem?», o que acontece a um reporte, objectos perdidos, dados/conta, e uma secção só de motorista. **Objectos perdidos continuam 🔒 fluxo humano**: a app diz isso por escrito em vez de fingir uma função que não existe. |
| 5.6 Preferências de segurança nocturna (21 h: pin, partilha, ride-check automáticos) | 🟡 o ride-check **pergunta mais cedo** entre as 21 h e as 05 h (3 km: 18 min → ~13 min; 12 km: 42 → ~30), o cartão «É de noite» na consola da viagem lembra a matrícula e a partilha, e há interruptor «Avisos de noite» na folha da conta (ligado por omissão). Automático de verdade continua ❌: partilha sozinha e PIN adaptativo precisam de contactos de confiança, que é tabela nova. Nada aqui finge vigilância que a app não tem. |
| 5.7 Morada exacta só revelada depois de começar | ✅ (o feed da praça mostra direcção/zona, não a morada). Continua verdade com o ponto nomeado: o nome do lugar vive em `pickup.note`, que só viaja para o motorista **atribuído**, e sem 0004 vai no chat, que abre depois de aceitar |

### 6. App do motorista
| item | estado |
|---|---|
| 6.1 Online/offline com heartbeat; 60 s sem battimento = offline | ✅ |
| 6.1 Aviso de sessão longa (10 h → pausa) | ✅ `ShiftNotice` conta o tempo **com a app ligada neste telemóvel** enquanto o carro está online, e avisa às 10 h. Não mede condução e não trava ninguém: uma corrida segura ao fim de um dia destes é coisa que o número não garante. «Vou fazer uma pausa» silencia 30 min sem apagar a conta; ficar offline zera; um aparelho fechado no bolso mais de 15 min recomeça, porque o tempo que a app não viu não se conta. |
| 6.2 Pedido a chegar em ecrã inteiro, som + vibração + contagem de 15 s, contador de ignorados | ✅ `MatchingPanel` |
| 6.3 Controlos grandes: a caminho / cheguei / iniciar (PIN) / terminar, com confirmação e pergunta do dinheiro | ✅ |
| 6.4 Taxa de aceitação, de cancelamento, insígnias, quadro semanal | 🟡 quadro e marcas ✅; **taxa de cancelamento ✅** (30 dias, duas contagens exactas ao `tr_trip` que o motorista já lê; só aparece com ≥5 corridas, e «poucas para contar» abaixo disso); taxa de aceitação ❌ (precisa de contar os pedidos ignorados, que hoje não ficam registados) |
| 6.5 Bloquear escrita de texto enquanto o carro circula | ✅ nas fases a andar (a caminho / quase a chegar / em viagem): o teclado fecha-se e ficam as respostas rápidas. É regra da app pelo estado da viagem, não velocidade medida |
| 6.6 Candidatura formal, com o carro e a praça conferidos | ✅ `DriverFicha.tsx` em quatro passos com barra de progresso e um passo por cada coisa que a equipa vai ler: o carro (matrícula ao formato do Decreto Presidencial 202/16, com a série e a província mostradas, `00-00` da lei rejeitado, e duplicidade conferida no `tr_driver`), a praça (zona + «{zona} · {cidade}, {província}», conferida com a província da chapa), a declaração (quatro caixas distintas, gravadas como declarações), e «Assim vai ser». Cada passo diz **o que falta** em âmbar em vez de desactivar um botão sem explicação |
| 6.6 «Assim vai ser»: o motorista vê a conta antes de a ter | ✅ `DriverRehearsal.tsx`, também acessível a quem já está inscrito («Ver como vai ser» no cartão de candidatura em análise). Nada escreve no servidor e diz isso numa faixa fixa |

### 7. Notificações
Push (OneSignal) para evento de viagem, motorista e carteira: ❌ 🔒 a
configuração de origens e o token do projecto estão no painel, e a Trajectoria
ainda não tem chave própria. Enquanto não houver push, a app **abre e lê** o
estado por polling e diz isso à pessoa — não promete avisos que não envia.
Centro de notificações in-app com lido/não lido: ❌.

### 8. Agendamento e extras
Viagens agendadas (15 min–7 dias) ❌ 🔒 precisa de scheduler. Recorrentes ❌.
Pedir por outra pessoa ✅ (`for_whom`). Lugares partilhados e «Linhas» 🟡 (0004
+ corredores por definir). Encomenda com PIN de quem recebe ✅ (é o código de
entrega da viagem). Lista de artigos proibidos antes de confirmar: 🟡 mostrada
no formulário de entrega.

### 9. Consola da equipa
Existe ✅: fila de dinheiro (confirmar/recusar com motivo), denúncias com
processo da viagem, leitura do chat, Aprovar motorista, a decisão de um reporte
chegar efectivamente a quem o fez (estado + nota, ✅ hoje), e agora a ligação
encomenda↔viagem (✅ 0006 aplicada; falta só o teste com uma encomenda real de
uma conta com encomendas). Desde hoje ✅ também o **painel «Agora»**
(`LiveBoard.tsx`): corridas activas com estado, zonas, preço, motorista ou
«sem motorista» e a idade no estado, os **pedidos sem correspondência** (em
`searching` há mais de 5 min, em âmbar) e quantos motoristas estão ligados —
uma leitura só de `tr_trip`, sem tabela nova e sem canal de tempo real. Desde a
vaga da localização e da ficha também ✅ **a comissão na UI**
(`MarginPanel.tsx`): a percentagem actual lida de `tr_setting`, proposta nova
com data de fim do período de tolerância escrita antes de gravar. Falta ❌:
mapa de motoristas online ao vivo, tabela de preços editável na UI (hoje
edita-se em SQL), SLAs de suporte, registo de auditoria por acção da equipa, e
papéis separados (staff / suporte / financeiro).

### 10. Qualidade de plataforma (não negociável)
Rede fraca e sem ligação: ✅ retry por polling, nada de ecrã branco, e desde
hoje a **faixa «Sem ligação / Ligação fraca»** (`NetBanner` + `lib/netinfo.ts`).
Retomar a viagem activa ao reabrir a app: ✅. Bateria: ✅ aviso de bateria
baixa; dados: ✅ modo `lowData`. Segurança: ✅ RLS + revoke/grant, sem segredos
no bundle; 🔒 scans de dependências e testes de RLS por papel. Desempenho: ✅
chunks separados (maplibre fora do bundle principal). Acessibilidade: ✅ alvos
de toque, contraste medido nos dois temas, `aria-live` nos avisos. Compliance:
🔒 aviso de privacidade correcto ✅, termos de serviço e contrato de motorista
por escrever, e **registo na ANTT antes de anunciar em grande**. Testes: 🔒
nenhum runner no projecto — a verificação é estática + REST + mão.

### 11 e 12 — ordem de construção e «definition of done»
A ordem sugerida pela spec está cumprida até ao passo 3 (0004 escrita, pin de
viagem, partilha, SOS, preços/recibo/dinheiro a dinheiro). Os passos 4 a 7
(chat ✅, cancelamentos 🟡, centro de suporte 🟡, agendamento ❌, promoções ❌)
ficam à espera do que a spec ela própria identificou como bloqueante: **um
parceiro de pagamento, um provider de SMS/push, e a revisão de documentos pelos
motoristas**.

O «definition of done» por feature é literalmente o que esta app faz hoje:
funciona com e sem a 0005 (sondas), RLS verificado por papel, estados de
loading/vazio/erro, copy em pt-AO sem promessas falsas, `tsc` e `vite build`
limpos, e uma nota no fim a dizer o que foi adicionado e o que precisa de
migração.

---

## 6-C. Auditoria de completude (vaga D, 2026-10-25) — contra os apps que cá estão

O pedido foi «faca uma auditoria do que falta para ser completo e observe outros
apps em angola e exterior». Feito a 2026-10-25 com pesquisa aberta (fontes no fim).
Concorrente real em Luanda, por ordem de presença: **Yango**, **inDrive**,
**Heetch** (confirmado em Angola), **Bolt** (mais pequeno, com produto de
aeroporto), os despachadores por telefone **UGO Taxi / Allo Taxi**, os táxis
«azuis e brancos» da **ANATA** que já aceitam Multicaixa Express, o app local
**Kubinga**, e o informal **candongueiro / hiace lotação** com tarifa ajustada
pela ANTT, em dinheiro, sem app. Para carga: **Real Express** e **Macon**, com
listas de preço por quilo e pontos de entrega em terminal. **Mamboo** e Yango
Food fazem comida — não é o nosso negócio, e diz-se porquê abaixo.

A primeira linha da auditoria é o que **já está** e que a comparação assumia que
faltava: código de entrega verificado no servidor (`drop_pin` — é a prova de
entrega que o Real Express faz em papel), nota de troco, matrícula + nome +
veículo mostrados antes de subir, ETA e distância no quadro do motorista, SOS,
partilha de viagem, exportação de dados, e um preço fixo que não sobe nunca.
Nada disto os apps angolanos informais têm.

### O que falta, por ordem do que trava lançamento

| # | falta | quem faz | o que é preciso |
|---|---|---|---|
| 1 | **Pagamento em cartão/Multicaixa Express dentro da app** | GPO da EMIS, por banco | 🔒 contrato de comerciante + empresa registada com NIF + conta bancária. Não é self-service, não há Stripe/PayPal em Kz, e a integração leva semanas de onboarding. É **o** bloqueio, não um deles. Enquanto não existe: a app aceita dinheiro e carteira confirmada pela equipa, e diz isso |
| 2 | **SMS/OTP para entrar** | provider (Unitel/Africell SMSC) | 🔒 idem. Sem isto o login é por email, e a copy do ecrã já diz isso |
| 3 | **Push para «o carro está à porta»** | OneSignal (já contratado no Market) | 🔒 falta a Trajectoria ter origem e chave próprias. É o único item desta lista que é configuração, não contrato |
| 4 | **Documentos do motorista com validade e auto-suspensão** (alvará, licença de veículo, seguro, ficha de inspecção) | tabela + processo da equipa | 🟡 **meio feito, a meio do caminho a que o brief obriga**: as datas de validade passaram a existir (`0008`: `licence_until`/`insurance_until`/`inspection_until`/`bi_until`) e o motorista recebe o **aviso a 14 dias** e o vermelho de vencido (spec 1.2 passou de ❌ para ✅ no aviso). **Auto-suspensão ❌ e fica de propósito** — o brief não permite ligar `tr_violation` enquanto não houver maneira de levantar a suspensão, e uma equipa de 1–3 pessoas não reabre contas a horas fixas. Resta a revisão humana do papel, que é 🔒 |
| 5 | **Viagem agendada e multi-destino** | tabela + scheduler | ❌ precisa de DDL e de ninguém que corra o scheduler; «recorrente» (escola/trabalho) idem |
| 6 | **Códigos de promoção e descontos** | tabela + decisão comercial | 🟡 o convite já está escrito na `0005` (fila para confirmar, nunca crédito automático); os promo codes não. O Yango opera com comissões reportadas de 15–30 % *(não verificado)*, por que descontar sem margem calculada é pagar do nosso bolso |
| 7 | **Classe mototáxi e «box»/camião pequeno** | `tr_vehicle_class` (SQL) | 🟡 dá para fazer com a política de escrita da `0007`; a classe existe como dado, não como código. Em Luanda a moto é real e não está na nossa frota |
| 8 | **Produto de aeroporto com tarifa fixa** | linha de tarifa + cliente | 🟡 `tr_zone.kind` já tem `aeroporto`; falta a tarifa fixa por terminal e o que fazer com um voo atrasado — sem dados de voo, a app não promete nada sobre atrasos |
| 9 | **Carga: preço por peso/volume, valor declarado, prova fotográfica** | tabela + parceiro de seguros | ❌ o Real Express publica listas por quilo; nós estimamos por distância e classe. Valor declarado e reclamação por dano precisam de um seguro que a Elara ainda não tem — prometer indemnização sem seguro é a promessa que o brief proíbe |
| 10 | **Rastreamento público de encomenda (link/código)** | token + página | 🟡 existe o mecanismo para viagem (`#/viagem/<token>`); replicá-lo para encomenda é trabalho de cliente sobre a 0006 |
| 11 | **Mapa de procura / campanhas de pico** | dados agregados | ❌ sem equipa que olhe, um heat-map é um enfeite que diz ao motorista «vá para lá» sem ninguém garantir carro |
| 12 | **Linha de apoio por WhatsApp com fila** | processo da equipa | 🔒 o número existe (`APOIO_PHONE`) e a app liga para ele; não há SLA nem histórico do lado da Elara, e a ajuda diz que quem responde é uma pessoa |

Etiquetas: 🔒 fora do código · 🟡 meio-caminho, escrito ou a uma decisão · ❌ não existe.

### O que os concorrentes fazem e nós NÃO vamos fazer

Não é modéstia, é o filtro do brief (equipa de 1–3 pessoas, dinheiro como base,
burla como risco real):

- **Cartão como padrão de pagamento** (Yango empurra-o). Em Angola a rua paga em
  notas; obrigar cartão era fechar a porta à maioria e dar ao motorista um motivo
  para sair da app.
- **Preço dinâmico / surge** (Uber, Yango). Já está na spec como decisão:
  multiplicador **manual** e nunca surge. Num Kz que muda de valor entre a segunda
  e a sexta-feira, um preço que sobe sozinho destrói exactamente a confiança que
  o preço fixo compra.
- **Leilão «ofereça o seu preço»** (inDrive, Heetch em algumas praças). Atira o
  motorista uns contra os outros e é incompatível com uma tarifa que o servidor
  calcula e um motorista que tem de saber quanto fica com ele.
- **Stream contínuo de GPS no mapa** (todos). Em 2G, o heartbeat adaptativo
  (15→60 s no modo dados) é a decisão certa e já está tomada; o mapa deles queima
  o crédito da pessoa.
- **Chamada VoIP com número mascarado** (Uber). Precisa de parceiro e de minutos
  pagos; aqui o canal é o chat da viagem, que é moderado no servidor, fica
  registado, e não revela telefone a ninguém.
- **Entrega de comida** (Yango Food, Mamboo). Exige uma frota comercial de
  vendas que ninguém aqui tem, e as sombras de restaurante custam mais do que o
  Marketplace que já temos para vender.

### Fontes da comparação

Yango Angola (yango.com/en_ao/rider) · Bolt (aeroporto de Luanda, bolt.eu/en/support/articles/68052) ·
Heetch (App Store; presença em Angola confirmada pela pesquisa, processo de
candidatura com formação e inspecção) · The Africa Report, «Bolt, inDrive, Yango:
who will win Africa's ride-hailing» · AngolaExpert, «Getting around: ride-hailing
services» · Appicial, «Navigating Angola with the best taxi apps» (UGO Taxi, Allo
Taxi, Kubinga) · ANTT — modal rodoviário, alvarás e o comunicado de ajuste de
tarifas de Julho de 2025 (antt.gov.ao) · Multicaixa/EMIS — Gateway de Pagamento
Online para comerciantes (multicaixa.ao) · Unitel Money, PayPay Africa ·
Real Express (realexpress.ao) e Macon para carga · Mamboo (comida).
Marcas *(não verificado)* na tabela acima vêm da pesquisa mas não tiveram fonte
primária confirmada — e é por isso que não estão na app.

**Ordem de ataque sugerida pela auditoria:** 3 (push — só configuração) → 4
(datas de documento, `0008`) → 8 e 10 (cliente sobre o que já existe) → 1 e 2
(pedem contrato e a decisão é do dono).

Estado dessa ordem depois da vaga: **4 está feito e publicado** (2026-10-25).
**3 continua 🔒** — é o único resto da lista que não precisa de código nem de
contrato novo, só da Trajectoria ter origem e chave próprias no painel do
OneSignal, e é por isso que é a próxima coisa que vale a pena pedir ao dono.
**10 está escrito mas invisível**: o token de partilha (`tr_share_token`) vive na
`0005`, que não está aplicada, portanto um ecrã público de encomenda não teria
onde se apoiar hoje. **8** (tarifa fixa de aeroporto) precisa de uma linha de
tarifa no `tr_pricing`/`tr_setting` que a equipa escreve — não é código, é
decisão comercial. **7** (mototáxi) é a mesma coisa com outro nome: a classe é
linha de `tr_vehicle_class`, escrita pela equipa. Restam 1, 2, 5, 6, 9, 11 e 12,
e nenhum deles se abre com mais uma feature neste PC.

---

## 7. Estado, peça a peça

### Feito e no servidor (0001 → 0003 aplicadas e verificadas)
Viagens, zonas, classes, carteiras, pedidos de dinheiro, PIN no servidor,
carros no mapa, aprovação de motorista, frota Hiace/Canter, aluguer, carga
interprovincial. Prova de hoje: `tr_trip`/`tr_zone`/`tr_driver` respondem 401 a
anonónimo (existem e estão protegidos).

### Escrito à espera do painel (0004, 0005, 0007, 0008 — **não aplicar sem rever**)
- `0004_lugares.sql`: corrida com lugares partilhados.
- `0005_core.sql`: as correcções de dinheiro/segurança (A1–A7) **mais** elogios,
  atalhos, ambiente, convites, partilha e quadro da semana.
- `0006_elara.sql`: a tabela `tr_order_link` e a RPC `tr_link_order`, com dupla
  prova de propriedade (a viagem é de quem chama **e** a encomenda é de quem
  chama). **Esta já está no servidor** — vista hoje por SQL: `tr_order_link`
  existe, com RLS e uma política.
- `0007_completude.sql`: abre as escritas da equipa (`*_verified`, tarifas por
  classe), acrescenta colunas `null` e cria `tr_place`.
- `0008_document_validity.sql`: cinco colunas em `tr_driver_doc` — quatro datas de
  validade (`licence_until`/`insurance_until`/`inspection_until`/`bi_until`) e
  quem as pôs (`expiry_updated_at`, `expiry_entered_by`). **Zero tabelas, zero
  policies, zero RPCs**: as políticas de leitura/escrita da `tr_driver_doc` já
  são certas desde a 0001 (a conta dona do motorista, ou `is_admin()`), e uma
  coluna nova herda a política da tabela. É a migração mais pequena do projecto
  porque a parte difícil já estava feita.
Prova de hoje (`to_regclass`, que é o que manda): `tr_ride`, `tr_review`,
`tr_saved_place`, `tr_trip_pref`, `tr_referral` e `tr_share_token` **não
existem**, e `tr_trip` não tem coluna `pickup` — por isso a app esconde esses
ecrãs sozinha (`src/lib/extras.ts`, `src/lib/orders.ts`) e corre exactamente como
antes. Não se pode confirmar uma função por REST: todas as RPCs `tr_*` respondem
404 a um pedido anónimo, inclusive `tr_claim_trip`, que a app usa todos os dias.

### Só cliente, sem migração
Passagem visual (sombras de acção, `tabular-nums`, raios, contraste 5,23:1 e
5,83:1 nos pares novos), travões de duplo toque, estados vazios, a rota
`#/encomenda/`, o botão no Market, e a faixa de ligação (`NetBanner`,
pares 12,79:1 / 8,66:1 / 7,60:1 nos fundos reais).

Na mesma vaga, e ainda sem tocar no servidor:
- **Verificação de viagem** (`src/components/RideCheck.tsx` + `ongoingSince` e
  `checkAfterMinutes` em `lib/trips.ts`). Lê o carimbo que o servidor já põe no
  estado «em viagem» e compara com `driveMinutes(distance_km)`; a fasquia é
  `previsto + máx(12 min, 60 % do previsto)` — 3 km pergunta aos 18 min, 12 km
  aos 42 min. Um toque, gravado em `localStorage` por viagem, para a app não
  perguntar duas vezes depois de reabrir. Sem resposta em 5 min insere
  `tr_report` com o motivo `verificacao_sem_resposta` (política de escrita da
  0001: só o próprio autor); a consola mostra a etiqueta, não a chave crua.
  Falhou a escrita → diz «Não conseguimos avisar a equipa» e dá «Tentar de
  novo». Contraste 5,91:1 claro / 9,98:1 escuro nos pares do cartão.
- **Teclado fechado ao volante** (`ChatPanel` com `lockNote`, ligado em
  `DriverConsole` para `accepted`/`arriving`/`ongoing`). As respostas rápidas
  ficam: são um toque, e é nelas que «estou a chegar» continua a poder ser
  dito. A app não mede velocidade — fecha o teclado pelo estado da viagem, e a
  copy diz isso em vez de fingir um sensor.
- **Os meus dados** (`src/lib/dataexport.ts` + `src/components/DataSheet.tsx`).
  A exportação não precisa de função no servidor: corre oito `select` filtrados
  pela `uid` da própria pessoa (`tr_trip`, `tr_driver`, `tr_wallet_tx`,
  `tr_money_request`, `tr_report`, `tr_rental_request` + as duas da 0005) e o
  RLS decide o resto. O JSON tem campos `em_falta` e `erros` para dizer o que não
  veio — uma tabela que ainda não existe é anotada, não escondida, porque um
  ficheiro silencioso seria uma promessa falsa. No browser desce o ficheiro; na
  WebView do APK o `download` costuma ser ignorado, por isso há «Copiar» e, se a
  área de transferência falhar, o texto à vista para seleccionar.
  O pedido de eliminação é um bilhete na fila de reportes, com uma caixa de
  confirmação obrigatória que diz as três coisas que a pessoa tem de perceber
  antes de carregar: que não apaga agora, que a conta Elara serve também o
  Marketplace, e que as viagens fechadas ficam no registo que a lei obriga a
  guardar. Já há pedido aberto → a folha mostra isso em vez de oferecer outro.
  Os motivos de conta vivem à parte (`ACCOUNT_REASONS`), para a consola nunca
  mostrar `apagar_conta` cru nem chamar «denúncia» a um pedido de conta.
- **Noite e horas feitas** (`isNight`/`NIGHT_WINDOW` e o 2.º argumento de
  `checkAfterMinutes` em `lib/trips.ts`; `Prefs.night` em `lib/alerts.ts`;
  `src/lib/shift.ts` + `src/components/ShiftNotice.tsx`). À noite a fasquia da
  verificação aperta para `máx(8 min, 35 % do previsto)` — o trânsito não muda,
  mas o risco muda, e perguntar mais cedo é a única coisa que se pode fazer sem
  tabela nova nem vigilância. `ShiftNotice` é o par do `BatteryNotice`: mesmo
  cartão âmbar, um gesto, `role="status"`. A conta de horas tem 17 casos
  verificados à parte (599/600 min, pausa de 30 min que não apaga nada, 3 h no
  bolso a recomeçar, offline a zerar) e a regra que a torna honesta: **o tempo
  que a app não observou não se conta**. Pares novos: 6,84:1 / 14,78:1 no texto
  do aviso e 6,37:1 / 10,08:1 no botão, já com os fundos compostos.
- **Reputação contada, não emprestada** (`src/lib/reputation.ts`). A média só
  aparece com 3 notas; abaixo disso lê-se «novo · 2 notas», porque um 5,0 feito
  numa tarde é exactamente o que uma conta nova fabrica, e moderação com 1–3
  pessoas não existe. A taxa de cancelamento do motorista vem de duas contagens
  exactas ao `tr_trip` que a RLS já lhe deixa ler (30 dias, `cancelled_by =
  'driver'`), e abaixo de 5 corridas diz «poucas para contar» em vez de uma
  percentagem. Uma contagem `null` — a PostgREST por vezes devolve-a sem erro —
  não é tratada como zero: mostra «Não conseguimos contar» e «Tentar de novo».
- **O ciclo do reporte** (`src/lib/reports.ts` + `src/components/MyReports.tsx`).
  Zero DDL: `tr_report.state` (`open`/`review`/`resolved`) e `tr_report.outcome`
  existem desde a 0001, e as políticas da mesma migração já deixavam o autor ler
  as linhas dele e a equipa actualizar as de todos — o que faltava era a app ler
  uma metade e escrever a outra. A folha «Os meus dados» passou a listar os
  pedidos da própria conta com a etiqueta do estado, a data, e a nota escrita por
  quem decidiu; a consola passou a ter a caixa dessa nota, o chip do estado, uma
  lista «N resolvidos» reabrível, e um reabrir que limpa a nota (um caso reaberto
  não pode chegar a casa de alguém com uma decisão antiga). Uma lista **vazia** e
  uma lista **ilegível** são coisas diferentes no ecrã: «Ainda não pediu nada»
  contra «Não conseguimos ler os seus pedidos — o que já pediu continua na fila»,
  com «Tentar de novo». Os rótulos dos motivos passaram a viver num sítio só, por
  isso a consola e a pessoa lêem exactamente as mesmas palavras. Pares medidos:
  4,83:1 / 6,91:1 na linha pequena, 7,09 / 12,29 no chip âmbar, 5,48 / 11,62 no
  verde, 8,72 / 13,01 na caixa da resposta. O rodapé diz a verdade: quem muda a
  etiqueta é uma pessoa da equipa, e não há prazo automático nenhum.
- **O painel «Agora»** (`src/components/LiveBoard.tsx`, montado no topo da
  consola). Fecha duas linhas que estavam em ❌ na secção 9 com **zero DDL**: uma
  só leitura de `tr_trip` nos estados activos, que a política `tr_trip_read` já
  abre à equipa. Os estados «activos» não são uma lista escrita à mão — saem de
  `Object.keys(STATE_LABEL).filter(isTripActive)`, os mesmos dois nomes que o
  passageiro e o motorista usam, por isso um estado novo não fica invisível à
  equipa. Cada corrida mostra o estado em primeiro lugar (é o que diz o que ainda
  não aconteceu), a idade no estado a partir do `events` do servidor, código +
  zonas + preço, e o motorista ou «sem motorista». Os **pedidos sem
  correspondência** ficam em âmbar a partir de 5 min — o mesmo tempo do
  `RideCheck`, e não os 90 s do painel do passageiro, porque 90 segundos não é
  nada que uma equipa de três pessoas possa accionar. A contagem de motoristas
  ligados reaproveita os `tr_driver` que a consola já carregou: zero pedidos
  extra. Sem tempo real, e dito: um botão «Actualizar» e «Lido há X min», nunca
  um «ao vivo» inventado. A lista **ilegível** não é a lista **vazia** — erro com
  «Tentar de novo» de um lado, «Nenhuma corrida em curso à última leitura» do
  outro, e quando não há ninguém ligado isso vai por escrito, porque «a praça
  está quieta» tem explicação. 30 pares de cor medidos nos dois temas (pior
  4,83:1); um deles, `zinc-500` sobre `zinc-100` a 4,40:1, foi corrigido para
  `zinc-600` antes de publicar.

- **O centro de ajuda** (`src/components/HelpSheet.tsx`, zero DDL). É texto fixo
  — por isso não tem estado de carregamento nem de erro, e isso é dito no
  comentário do ficheiro em vez de se fingir uma leitura. A regra que manda nele:
  **só entra texto que a app cumpre de verdade**, porque numa cidade onde a
  burla é o risco real, uma promessa falsa na app é argumento para o burlão.
  Escrever cada resposta obrigou a verificar cada afirmação contra o SQL, e
  cairam três antes de publicar: (1) não há bloqueio por erros no código — a
  `tr_verify_pin` aplicada só rejeita quando a viagem não está à espera do
  código ou o código difere, não conta tentativas; (2) a candidatura **é**
  aprovada no momento (`auto_approve_drivers default true`, na 0003 aplicada),
  por isso a ajuda diz «aprovado pelas regras da app» e que a ficha completa
  passa a condição quando a equipa começar a conferir documentos; (3) o código
  da viagem começa por `ELT`, não `TR`. O dinheiro continua dito como é: a
  corrida paga-se em dinheiro ou Multicaixa, a carteira é para recargas e
  levantamentos confirmados pela equipa — nunca um método de pagamento da
  viagem. O número de apoio estava escrito à mão em cinco sítios; passou a
  `APOIO_PHONE` / `APOIO_DISPLAY` em `lib/utils.ts`, que é o sítio onde a ajuda
  o lê. E a lista de estados activos do `App.tsx` passou a ser derivada de
  `STATE_LABEL` + `isTripActive`, a mesma regra do painel «Agora» — seis
  estados escritos à mão e a mesma lista viva em dois sítios é como um estado
  novo fica invisível ao retomar da viagem.

- **O lugar exacto, com nome** (`src/lib/places.ts` + `ZonePicker` + `PickupField`
  + `RideView`/`RideBoard`, zero DDL e zero chamada a terceiros). O pedido foi
  «localização exacta com nome do bairro e do lugar», ao jeito do Yango e do
  Heetch. O que existe: um índice de **2 391 nomes** de lugares — 300 nomes de
  bairro distintos (72 `suburb`, 77 `neighbourhood`, 163 `residential`, 4
  `quarter`, 1 dito pela equipa), 305 vilas, 37 povoações, 72 vias de passagem, e
  os marcos com que a pessoa se explica (167 lugares de culto, 147 escolas, 104
  postos de combustível, 94 clínicas, 51 largos, 42 hospitais, 36 mercados) —
  extraídos **em bloco** do OpenStreetMap pelo Overpass
  com o identificador OSM de cada um, e que viaja dentro do bundle estático.
  Escrever «sao paulo» devolve «São Paulo · bairro · Município de Luanda» e
  «Mercado de São Paulo» por baixo (o bairro primeiro, a loja depois), e a escolha
  põe o pin **na coordenada daquele lugar** — não no centro do bairro. `nameAt()` dá o nome ao
  contrário: arrastar o pin faz a app dizer onde está, com **duas** regras à
  vista — um ponto fino só vale até **700 m**, um bairro até **2 km**; para além
  disso a app diz a zona e os metros, e nunca inventa um marco distante (a
  primeira versão tinha só a regra dos 700 m, e por isso um pin caído em qualquer
  lado ficava mudo). O nome entra em `pickup.note` quando a 0004 estiver
  aplicada; sem 0004 vai no primeiro texto do chat, porque o motorista precisa
  de o ler de qualquer forma. **O destino também se nomeia** (a 25-10, depois da
  auditoria): escolher um lugar em «Para onde vai» põe a zona dele — que é a
  única coisa que o preço e a busca usam — e escreve o nome na mesma primeira
  mensagem («O meu destino é Shopping Vianodo (Viana).»); uma linha debaixo do
  cartão da rota mostra o nome escolhido e tem «só a zona» para o tirar. Não
  existe coluna de destino com nome na viagem, nem com a 0004 aplicada, por isso
  o chat é o único sítio honesto para o dizer — e a faixa de ajuda do `ZonePicker`
  do destino diz «o motorista lê onde o deixar» em vez de prometer um ponto no
  mapa. Preço continua a ser sempre o da `tr_zone` onde o
  ponto cai — o lugar nomeia, a zona cobra. Nada sai do browser para um serviço
  de mapas, não há key a gerir, e em 2G o custo é zero porque o índice já veio
  com o HTML. A atribuição está no ecrã: «Os nomes vêm do OpenStreetMap (licença
  ODbL), conferidos em 25 de outubro de 2026. Os marcados «dito pela equipa»
  vieram de pessoas no terreno, e dizem-no. O preço é sempre o da zona onde o
  ponto cai.» — e o `PickupField` repete a advertência debaixo do nome quando o
  pin cai num desses lugares: «Nome dito pela equipa, não pelo mapa.»
- **A ficha de motorista, e o que se pode verificar de verdade**
  (`src/lib/plates.ts` + `src/lib/drivers.ts` + `src/components/DriverFicha.tsx`,
  zero DDL). Quatro passos com barra de progresso — o carro, a praça, a
  declaração, «assim vai ser». A matrícula é tratada como documento: normaliza
  acentos/traços/a caixa «AO», reconhece as três séries legais (a em vigor
  `LDA-00-00-AA`, a de 1996→ Janeiro de 2024 `LD-00-00-AA`, e a anterior a 1996
  `AAA-00-00`), e compara com o **Decreto Presidencial 202/16, artigo 27.º**,
  cujos 19 códigos de província estão no ficheiro. Erro só quando a lei diz que
  é erro: forma impossível, `00-00` (que é o exemplo impresso na lei), e um código
  de província que não existe no decreto. Aviso — nunca bloqueio — para chapa do
  formato antigo («troca obrigatória»), série pré-1996, série pré-1996 com ano de
  fabrico posterior, e província da chapa diferente da província da praça («Não
  proíbe nada … a equipa vai perguntar porquê»). A única verificação real contra
  dados é a duplicidade: um `select` no `tr_driver`, onde a 0003 pôs índice
  `unique` na coluna `plate`, a dizer em voz alta o erro do servidor — «Essa
  matrícula já está noutra conta». O cabeçalho de `plates.ts` e o texto da ajuda
  dizem a coisa mais importante desta vaga: **não há registo público de
  matrículas em Angola, por isso nenhuma app pode escrever «verificámos no
  registro»**. Os quatro documentos passaram a ser quatro caixas separadas
  (licença da categoria certa, livrete/autorização do dono, seguro, e «a
  matrícula que escrevi é a do carro que está na rua — não é a de um primo, nem
  uma que inventei»), gravadas em `tr_driver_doc` como `licence`/`logbook`/
  `insurance` com `declared_at` — ou seja, **declaração**, com a etiqueta que a
  tabela usa, porque os campos são `boolean` de auto-declaração desde a 0003.
- **O ensaio: ver a conta antes de a ter** (`src/components/DriverRehearsal.tsx`,
  zero DDL e zero escrita). Nem o Yango nem o Bolt nem o Heetch mostram ao
  motorista como ele vai aparecer na rua antes de se inscrever; aqui há um
  passo «Assim vai ser» e um botão «Ver como vai ser» para quem já está dentro.
  Faixa fixa no topo — «SIMULAÇÃO — nada aqui foi gravado nem enviado» — e quatro
  blocos: o cartão exacto que o passageiro vê (o desenho do veículo, o nome
  público, a matrícula, e a linha «o seu telefone nunca aparece»); a fila de
  estados reais (`STATE_LABEL`, a mesma lista do painel «Agora») com a regra do
  código dentro do carro; «Quanto fica para si» com o `commission_pct` **verdadeiro**
  do `tr_setting`, o `driver_keeps_kz`, o período de tolerância e duas corridas de
  exemplo etiquetadas como exemplo; e «Depois de enviar» com o `trial_trip_limit`
  lido. O nome público é calculado com a fórmula do servidor em `publicNameOf`
  (primeira palavra + inicial da última com ponto) — sem embelezar, porque uma
  divergência entre a pré-visualização e o que se guarda é uma promessa partida.
  Se a leitura das definições falhar, o bloco diz «Não conseguimos ler as
  condições» e «Tentar de novo» em vez de mostrar uma comissão inventada.
- **As condições comerciais à vista da equipa** (`src/components/MarginPanel.tsx`
  na consola, zero DDL). O pedido «poe ja o nosso lucro imbutido nas viagens» não
  precisa de tabela nova: a 0003 já traz `tr_setting.commission_pct` e o
  `driver_keeps_kz` que o servidor calcula. O painel mostra a percentagem actual,
  permite propor outra com o valor e a data de fim do período de tolerância
  escritos antes de gravar, e **grava só `marginSplit`/`graceEnds` pedidos por
  uma pessoa autenticada** — a mudança de preço de verdade continua a ser
  `tr_setting` escrita pela equipa, não um botão que redesenha o tarifário às
  escondidas. O motorista lê as mesmas fontes no ensaio, o que fecha o ciclo:
  uma só percentagem no banco, três sítios a mostrá-la, e nenhuma conta de
  cabeça.

Na vaga seguinte, o item 4 da auditoria (2026-10-25, última peça desta linha de
trabalho):

- **A validade dos papéis do motorista** (`src/lib/expiry.ts` +
  `src/components/DriverPapers.tsx`, montado no `DriverDashboard` ao lado do
  `BatteryNotice` e do `ShiftNotice`). Quatro datas — carta, seguro, inspecção
  técnica e BI — e a regra do aviso: **14 dias**, o valor que a spec pedia e que
  agora vive numa constante com nome (`WARN_DAYS`). O cartão aparece na praça em
  três situações e em nenhuma outra: algo vencido (vermelho), algo a faltar 14
  dias ou menos (âmbar), ou **nenhuma data escrita** (branco, a convidar). Um
  painel verde a dizer «está tudo em dia» taparia a praça, por isso o estado
  `ok` não mostra nada.
  A aritmética é a peça inteira, e por isso foi testada à parte: as datas são
  `'YYYY-MM-DD'` validadas dígito a dígito (2026-02-29 e 2026-13-01 são
  **rejeitadas** — `Date.UTC` aceitava a segunda por rotação de mês), contadas
  em **dias desde o epoch**, com o **dia civil de Luanda** como referência
  (a mesma escolha do `startOfTodayAo()` que já existia), e guardadas no
  servidor como **meio-dia UTC** para que nenhum fuso corra o dia. No dia da
  validade conta `0` — «vence hoje» — e nunca «venceu há 0 dias».
  Onde isto é honesto é no que diz ao motorista sobre **onde** as datas vão:
  `papersLive()` testa uma vez por sessão se as colunas da `0008` existem, e o
  rodapé do formulário diz em voz alta qual dos dois planos está activo — «na
  sua ficha, no servidor, e a equipa pode lê-las» **ou** «só neste telemóvel; a
  equipa da Elara ainda não as vê». Aplicar a `0008` muda a frase, não o código.
  E as duas palavras que faltam na primeira frase são as que o brief manda não
  escrever: mesmo com datas no servidor continua a ser **o que o motorista
  escreveu** — ninguém conferiu papel nenhum.
  O que ficou de fora, e é de propósito: **auto-suspensão**. A `0007` já deu à
  equipa `licence_verified` etc., e mesmo assim nada desliga uma conta por um
  papel vencido, porque (a) o brief proíbe ligar `tr_violation` enquanto não
  houver maneira de levantar uma suspensão, e (b) uma equipa de 1–3 pessoas não
  reabre contas a horas fixas — um motorista suspenso por um algoritmo às 3 da
  manhã é um motorista perdido. O texto na tela diz exactamente isso: «Um papel
  vencido não desliga a sua conta automaticamente.»
  **A falha que esta peça abriu, e que a mesma vaga fechou**: `src/lib/dataexport.ts`
  exportava as corridas, a conta, a carteira e os reportes, mas **não exportava a
  `tr_driver_doc`** — portanto nem as quatro declarações da vaga D nem estas datas
  apareciam na cópia que o motorista pede em «Os meus dados». Uma peça que escreve
  dados numa tabela e não os devolve quando a pessoa pede a sua própria cópia é
  exactamente a assimetria que o brief não deixa existir. Fechado no mesmo dia:
  a ficha entra na cópia, lida com `.in('driver_id', …)` — que é literalmente o
  predicado da `tr_driver_doc_read` da 0001, portanto zero SQL novo —, os millis
  saem **também por extenso** (um `1805025600000` num ficheiro que a pessoa abre
  para ler os dados dela não é um dado legível), e as datas que só existem no
  telemóvel vêm etiquetadas à parte, em `datas_neste_telemovel`, porque dizer
  «isto ainda não está no servidor» obriga a que a cópia diga o que está no telemóvel. Uma conta sem
  candidatura de motorista **não** tem nada em falta: «não tenho ficha» e «a
  leitura falhou» continuam a ser duas frases diferentes. 19 casos em
  `.pkg/dataexport_test.cjs` contra o módulo compilado, com o mesmo truque do
  servidor falso.

- **Vaga G (2026-10-27) — «quando eu clico em mostrar a minha localização ainda
  mostra Mondo Chapéu» + «efeitos de UI giros mantendo as cores da marca».**
  A queixa era justa, e o culpado não era o índice de 2 391 lugares: eram **três
  cumplicidades no caminho do botão**. (1) O toque incrementava um contador que
  ia parar ao `fitKey`, e o `fitKey` enquadra os centróides das zonas — o ponto
  da pessoa nunca foi entrada da câmara, por acordo tácito com o problema de o
  GPS saltar a cada leitura. (2) A leitura vinha da cache do aparelho
  (`maximumAge: 30000`), portanto um minuto velha e noutro bairro sem ninguém
  dizer nada. (3) A folha só sabia dar nome ao embarque marcado ou à zona
  escolhida por defeito; a posição viva não tinha nome nenhum. Resultado: a
  câmara mexia-se para o sítio de sempre e repetia a palavra de sempre.
  Fechado em camadas, cada uma com a sua medida: `ask(true)` → `maximumAge: 0` e
  12 s (confirmado no browser — o `opts` que chega ao `getCurrentPosition` é
  mesmo `0`); um toque fresco deixou de ser engolido por uma leitura automática
  em curso; `useFixFlash` arma-se no toque e move a câmara **quando o ponto
  chega** (`zoom ≥ 15,5`), uma vez só — um botão que pulsa sempre deixa de dizer
  seja o que for. No emulator a 393×851 o pino passou de (2370, 1996) para
  (196, 332), o centro da área visível. O nome passou a ter casa própria
  (`WhereAmI`): título, segunda palavra, precisão dada pelo aparelho, idade da
  leitura quando passa de três minutos, e **uma** acção — âmbar «Mudar a partida
  para X» quando a zona por defeito não é onde a pessoa está, roxo «Usar como
  ponto de embarque» quando falta o embarque. A precisão deixou de ser texto e
  passou a geometry: círculo com o raio real do GPS, teto de 15 m a 2 km, roxo da
  marca, uma camada. Duas honestidades que a medição impôs: aparelho que responde
  precisão `0` não tem precisão (diz-se «não diz a precisão», não «cerca de 0
  m»), e um pedido que morre nos 12 s devolve o botão recuperado, âmbar e tocável.
  Um bug latente caído pelo caminho: `radarRef.current` nunca era re-escrito, e
  como o handler do `styledata` só existe uma vez, **o anel do raio de procura
  nunca se desenhou** desde que foi escrito. Na marca: fora o verde dos reportes
  e o azul do Waze — «Resolvida» é roxo (a cor com que a app já celebra), «Em
  análise» é zinco, a escada ficou âmbar → zinco → roxo — e a regra passou a ser
  mecânica: `where_test.cjs` (16 asserções) varre o `src/` e chumba qualquer
  família fora de `{purple, amber, red, zinc}`, além de assentar o cartão em
  `renderToStaticMarkup` porque sem conta não há como o ver no browser.
  Medido: `tsc` limpo, 6 suites passados, 205 pares de contraste com **0 falhas
  AA** nos dois temas (pior 4,83:1), `dist` publicado e **byte-idêntico** ao
  servido (`index-CmEDdjAI.js` 644 757 B, `index-C_vI3cvP.css` 48 401 B).
  O APK da vaga anterior (4 147 988 B, `index-C_lnEzCC.js`) já não era este
  código; refito `node scripts/apk.mjs` → **4 149 616 B** com os dois ficheiros
  de cima lá dentro, comparados byte a byte (`assets/public/`), e o
  `index.html` do APK aponta para eles. Verificado no production a 393×851: o
  toque mostra o spinner, o ponto vai para (196, 332) — o centro da área visível
  — e um pedido que falha devolve botão âmbar que torna a responder ao segundo
  toque.

- **Vaga H (2026-10-27) — «continue applying the design principles» / «the design
  changes and etc».** Os princípios da vaga G eram verdadeiros nas três telas onde
  foram inventados e não eram em resto nenhum. Esta vaga espalhou-os e, para não
  ter de voltar a olhar para eles, escreveu-os como código.
  **(1) O desligado é uma cor, não uma opacidade:** 24 botões em 14 ficheiros
  apagavam-se com `opacity-50` sobre roxo com texto branco — 3,0:1, e o rótulo é
  justamente a informação («Pedir viagem» ilegível não diz nada). Passou a um
  token em `src/lib/utils.ts`: `OFF` (classe) e `OFF_ATTR` (variante `disabled:`)
  — zinco sobre zinco, **5,81:1 no claro, 5,07:1 no escuro**, zero opacidade.
  **(2) 44 px ou o dedo erra:** `.tap-pad-lg` (inset −16 px) no manípulo do painel
  (14 px de alto → 46 de área tocável, sem crescer o desenho), no interruptor do
  motorista e nos interruptores da conta (32 → 48); as abas de tipo de viagem
  passaram de `h-10` a `h-11`, e a acção do «Onde está agora» a `h-10 + tap-pad`.
  Três excepções medidas e assumidas: pinos do MapLibre (não são interactivos),
  «Actualizar» do mapa (36 px efectivos, passa o AA de 24), input do ponto de
  referência (dentro de um `<label>` de 90 px — o alvo real é a linha).
  **(3) A auditoria mentia sobre a própria paleta:** o `contrast.cjs` media a
  rampa `zinc` do Tailwind (fria) enquanto a app pinta o `zinc` quente do
  `tailwind.config.js`, e assumia um fundo escuro que não existe. Hoje faz
  `import()` do config real, merge da rampa, e base `zinc-950` (#121211). Corrigida,
  217 pares passaram com piso 4,68:1. **(4) A varredura a 430×932 nos dois temas
  apanhou o que os 360 px não vêem** — defeitos que precisam de estado, não de
  largura: `text-purple-200` na hora das bolhas de conversa e `text-amber-200` no
  aviso do GPS, ambos sobre o roxo da marca (3,95:1 e 4,32:1), e um
  `text-amber-600` no aviso anti-burla do chat que era 1,69:1 sobre roxo e 3,19
  sobre branco. Ficam `purple-100` (4,56), um chip âmbar dentro do cartão roxo
  (6,37 medido no browser com as classes compiladas) e âmbar por bolha. Sobravam
  quatro hex de zinco frio escritos à mão (atribuição do mapa e capa do traçado
  da rota) — agora quentes, e a atribuição, único texto de 10 px da app, subida
  ao piso de 11 px da escala.
  **(5) Regra mecânica, não de humor:** `.pkg/design_test.cjs` (17 asserções)
  chumba `opacity-NN pointer-events-none` e `disabled:opacity-`, exige o token
  `OFF` em ≥12 ficheiros, o `inset` do `.tap-pad-lg` ≥ 16 px, `h-11` nas abas,
  que toda a animação `infinite` esteja no `prefers-reduced-motion`, que nenhum
  `text-(amber|red|purple)-(200|300)` apareça sem `dark:` à frente e que não
  reste um hex frio no `src/`.
  Medido: `tsc` limpo, 7 suites «tudo certo», **226 pares de contraste, 0 falhas
  AA**, texto mais baixo 4,56:1; varredura DOM (contraste, transbordo, área
  tocável, corpo < 11 px) a 360×800 e 430×932, nos dois temas, em corrida,
  aluguer, viagens, carteira, conta, ajuda, meus dados, consola da equipa,
  painel de margens e praça do motorista: **0 falhas**, com as três excepções
  acima. Uma nota para quem repetir isto: medir contraste 600 ms depois de
  alternar o tema devolve 23 falsos positivos — a app atravessa 500 ms de
  cross-fade; só se mede depois de assentar. Publicado e **byte-idêntico** ao
  servido (`index-C9RKKK8B.js` md5 `e02a5830`, `index-BKBzxU2T.css` `87994de9`),
  APK refeito → **4 149 808 B** com esses dois ficheiros lá dentro, comparados
  byte a byte, e `trajectoria-codigo.zip` reempacotado (1 132 KB, 165 ficheiros,
  sem `.pkg`, sem `.env.local`, sem keystore, sem APK).

### Bloqueado — precisa da pessoa, não do código
1. **MCP do Supabase** voltou a meias: leituras curtas respondem (foi assim que
   se viu o estado do servidor acima), mas `get_advisors` e as queries seguintes
   dão `-32603`. Continua por fazer o `supabase db advisors`, e a 0004/0005 não
   é aplicada daqui sem a palavra do dono.
2. **APK**: o `android/` está pronto (`ao.elara.trajectoria`) mas o ficheiro
   volta a ser gerado do `dist` novo; a chave de release nunca entra no repo.
3. **Git**: `git init` e empurrar para GitHub à espera de nome e visibilidade
   decididos pela equipa.
4. **Chaves**: a `publishable key` é pública e vai no `.env.example`; a
   `service_role` nunca entra em lado nenhum que não o painel do projecto.
5. **Pagamentos, SMS/OTP, push e revisão de documentos**: cada um precisa de um
   contrato ou de gente. Nada nisto se resolve com código neste PC, e a app não
   finge que resolve.

---

## 8. Quando houver 15 minutos no painel

Por esta ordem, com a app aberta ao lado:

1. Reverter `0004` → colar no editor SQL → `tr_ride` passa a responder.
2. O mesmo com `0005` (é a que mexe em dinheiro: ler a cabeça do ficheiro).
2b. Depois `0007` — é a mais inofensiva das três (não insere linhas, não muda
    preço nenhum: abre escritas à equipa, acrescenta colunas `null` e cria
    `tr_place`, que por agora nenhuma leitura da app faz). Verificação mínima
    depois de correr: com conta normal, `update public.tr_vehicle_class
    set min_kz = 1` → **0 linhas**; `select licence_verified from
    tr_driver_doc limit 1` → **null**.
2c. Depois `0008` (é a mais curta do projecto — cinco colunas, nada de tabelas).
    Verificação mínima depois de correr, pelas mesmas sondas do fim da `0007`:
    `select licence_until, insurance_until, inspection_until, bi_until,
    expiry_updated_at, expiry_entered_by from tr_driver_doc limit 1` → **zeros e
    `motorista`, não um erro**; `select count(*) from pg_policies where
    tablename = 'tr_driver_doc'` → **o mesmo número de antes** (coluna nova herda
    a política da tabela; se o número mudou, foi um erro); e — a prova que
    interessa — com a sessão de um motorista, um `update` que mire o `driver_id`
    **de outro** motorista devolve **0 linhas, sem mensagem**. Na app, o que se
    vê mudar é uma frase: o rodapé do formulário de papéis passa a dizer «na sua
    ficha, no servidor» em vez de «só neste telemóvel».
3. ~~`0006`~~ já está aplicada. Falta o teste que só se faz no painel: com uma
   conta que tenha encomenda real no Market — botão no Elara →
   `#/encomenda/<código>` → criar entrega → `select * from tr_order_link` com
   uma linha.
4. Confirmar que as sondas de `src/lib/extras.ts` passam a `true` e que os
   ecrãs escondidos aparecem.
5. Só depois: `npx vite build`, publicar, e verificar o hash servido.
