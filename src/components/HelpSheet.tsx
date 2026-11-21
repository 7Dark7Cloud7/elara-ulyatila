import { useMemo, useState } from 'react';
import { ChevronDownIcon, CloseIcon, HelpRingIcon, PhoneIcon, SearchIcon, ShieldCheckIcon } from './ElaraIcons';
import { Sheet } from './Sheet';
import { APOIO_DISPLAY, APOIO_PHONE, cn, waLink } from '../lib/utils';
import { EMERGENCY_NUMBER } from '../lib/trips';
import { filterHelpItems } from '../lib/localExtras';

/**
 * O centro de ajuda. Uma regra manda aqui: **só entra texto que a app cumpre de
 * verdade**. Nada de «central 24 h», nada de «objectos perdidos garantidos»,
 * nada de vigilância — porque numa cidade onde a burla é o risco real, uma
 * promessa falsa na app é o que o burlão usa.
 *
 * Não lê nada ao servidor: é texto fixo, por isso não tem estado de carregamento
 * nem de erro. O que muda é o que a pessoa faz a seguir, e cada secção diz-lo.
 */

interface Item {
  id: string;
  q: string;
  a: string[];
  /** Só aparece para quem conduz. */
  motorista?: boolean;
}

const ITEMS: Item[] = [
  {
    id: 'preco',
    q: 'O preço que vejo é o que pago?',
    a: [
      'Sim. O preço é calculado no servidor antes de pedir a corrida, linha a linha (distância, tempo, taxa), e o que aparece no recibo é a soma dessas mesmas linhas.',
      'Não há aumento automático por hora de ponta nem por chuva. Se um motorista pedir mais do que o preço da app, isso é um reporte — «Quiseram pagar mais do que o preço da app».',
    ],
  },
  {
    id: 'codigo',
    q: 'O código de 4 dígitos: quando se dá?',
    a: [
      'O código começa a viagem. É o motorista que o pede, dentro do carro, quando já está ao pé de si.',
      'Ninguém da Elara lhe pede o código por telefone, SMS ou WhatsApp. Se isso acontecer, não dê: faça um reporte com «Pediram o código ou documentos por fora».',
      'O código é verificado no servidor, e só vale enquanto a viagem estiver à espera dele: um código de uma viagem já fechada não põe outro carro a andar.',
    ],
  },
  {
    id: 'telefone',
    q: 'O motorista vê o meu número de telefone?',
    a: [
      'Não. Passageiro e motorista nunca vêem o número um do outro — isto é regra desde a primeira versão, e é por isso que não há chamada na app.',
      'Falam pelo chat da viagem, pelo código e pela morada. Se alguém disser que «precisa do número para confirmar», isso é um burlão, não é a app.',
    ],
  },
  {
    id: 'dinheiro',
    q: 'Pagamento em notas, carteira e troco',
    a: [
      'A corrida paga-se ao motorista, em dinheiro ou Multicaixa. A app não passa dinheiro nenhum por si.',
      'Carteira: serve para recargas e levantamentos, e só tem saldo depois de a equipa Elara confirmar que o dinheiro mudou de mão de verdade. Nenhuma viagem põe saldo a ninguém sozinha.',
      'Troco: pode dizer na nota «vou pagar com uma nota de 5.000 Kz» antes de pedir; o motorista lê isso antes de aceitar.',
    ],
  },
  {
    id: 'sos',
    q: 'Se me sentir em perigo',
    a: [
      `O botão SOS marca o ${EMERGENCY_NUMBER} — o número de emergência de Angola — e prepara uma mensagem de WhatsApp com o código da viagem, a zona e o estado. Não há uma central da Elara a vigiar a app: o que existe é o 111 e a sua mensagem com o código.`,
      'Ao entrar no carro, confirme a matrícula e o nome do motorista que estão no ecrã. À noite a app lembra-o, e faz a verificação «Está tudo bem?» mais cedo.',
    ],
  },
  {
    id: 'verificacao',
    q: '«Está tudo bem?» — o que significa',
    a: [
      'A app sabe por quanto tempo uma viagem daquela distância devia demorar. Se ela se alongar muito, pergunta. É tempo, não um sensor nem uma câmara.',
      'Se não responder em 5 minutos, fica escrito um aviso na fila que a equipa lê. Um atraso com trânsito não é um perigo — responder «está tudo bem» fecha a pergunta.',
    ],
  },
  {
    id: 'denuncia',
    q: 'Fiz um reporte: o que acontece?',
    a: [
      'O seu reporte entra numa fila que a equipa Elara lê. Em «Os meus dados e a conta» vê o estado de cada pedido — Aberta, Em análise, Resolvida — e a nota escrita por quem decidiu.',
      'Não há prazo automático prometido: uma equipa pequena não assina um SLA que não pode cumprir. O que há é o estado a mexer-se quando uma pessoa decide.',
    ],
  },
  {
    id: 'perdidos',
    q: 'Deixei alguma coisa no carro',
    a: [
      'Na viagem, abra «Reportar» e escolha «Deixei algo no carro». O campo pede a descrição do objecto e onde no carro ficou — é essa frase que permite à equipa distinguir a sua mala de outras malas.',
      'Se foi motorista e encontrou algo, o mesmo ciclo existe do lado dele: «Encontrei algo deixado no carro», com a indicação de guardar o objecto até a equipa o contactar. Os dois bilhetes caem na mesma fila, por isso é possível cruzá-los.',
      'Isto é uma fila lida por pessoas, não um cofre de achados e perdidos: a app não guarda objectos nem promete que aparecem. O número do motorista não aparece a nenhuma das pontas — é a equipa que contacta quem precisa de saber.',
    ],
  },
  {
    id: 'dados',
    q: 'Os meus dados e a minha conta',
    a: [
      'Em «Os meus dados e a conta» pode exportar o que a app tem sobre si — é a mesma leitura que as regras da base de dados já lhe deixam fazer — e pedir a eliminação da conta.',
      'O pedido de eliminação não apaga nada sozinho: a conta Elara serve também o Marketplace, por isso apaga-a uma pessoa, depois de confirmar consigo.',
      'Hospedagem: Supabase (base de dados) e Vercel (a app). Mapas: OpenFreeMap. Não vendemos nem enviamos os seus dados a terceiros.',
    ],
  },
  {
    id: 'motorista',
    q: 'Sou motorista: o que preciso de saber',
    motorista: true,
    a: [
      'A candidatura é aprovada no momento em que entra, e as primeiras viagens ficam em período de teste — a equipa vê-las antes de sair do teste. Por isso «aprovado» hoje quer dizer «aprovado pelas regras da app», não «os documentos foram vistos por uma pessoa»; quando a equipa começar a conferir documentos, a ficha completa passa a ser condição.',
      'Na ficha, a app confere a forma da sua chapa com o Decreto Presidencial 202/16 (as três letras da província, os quatro algarismos, as duas letras), se ela bate com a província da sua praça e se já está noutra conta da Elara. Não há registo público de matrículas em Angola, por isso nenhum app pode dizer «verificámos no registro» — os papéis conferem-se com olhos, e a sua declaração fica marcada como declaração sua.',
      'O aviso das 10 horas conta o tempo com a app aberta neste telemóvel, nunca «horas conduzidas»: não mede movimento nenhum e não bloqueia ninguém. É um lembrete.',
      'Se um passageiro não aparece, marque «a pessoa não apareceu no ponto» — fica com prova de proximidade. Cancelar antes de alguém aceitar não tem taxa.',
    ],
  },
];

const QUICK_TOPICS = ['Preço', 'Código', 'SOS', 'Troco', 'Perdidos'] as const;

interface HelpSheetProps {
  open: boolean;
  onClose: () => void;
  isDriver: boolean;
  /** Fecha a ajuda e abre «Os meus dados» — sem deixar duas folhas em cima. */
  onOpenData: () => void;
}

export function HelpSheet({ open, onClose, isDriver, onOpenData }: HelpSheetProps) {
  const [wide, setWide] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const available = useMemo(() => ITEMS.filter((i) => !i.motorista || isDriver), [isDriver]);
  const items = useMemo(() => filterHelpItems(available, query), [available, query]);
  const activeWide = wide && items.some((i) => i.id === wide)
    ? wide
    : query.trim() && items.length > 0
      ? items[0].id
      : null;

  return (
    <Sheet open={open} title="Ajuda e segurança" onClose={onClose} tall>
      <div className="space-y-4">
        <p className="text-label text-zinc-600 dark:text-zinc-300 leading-relaxed">
          Aqui só está escrito o que a app faz de verdade. Se algo correr mal, o
          seu código de viagem é a coisa mais útil que pode ter à mão.
        </p>

        <div className="rounded-card border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4">
          <p className="flex items-center gap-2 text-label font-semibold text-red-800 dark:text-red-200">
            <PhoneIcon className="w-4 h-4 shrink-0" />
            Em perigo, ligue {EMERGENCY_NUMBER}
          </p>
          <p className="text-caption text-red-800/90 dark:text-red-200/90 mt-1 leading-relaxed">
            O botão SOS dentro da viagem marca o {EMERGENCY_NUMBER} e prepara a
            mensagem com o código. Não prometemos uma central da Elara a vigiar
            a app — o que existe é o número de emergência e a sua mensagem.
          </p>
        </div>

        {/* Pesquisa instantânea sem acentos */}
        <div className="space-y-2">
          <div className="relative">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setWide(null); }}
              placeholder="Procurar dúvida (ex.: preço, código, troco, SOS)…"
              aria-label="Procurar na ajuda"
              className="w-full h-11 rounded-control bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/15 pl-10 pr-10 text-label text-ink dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none focus:border-purple-500 dark:focus:border-amber-400 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setWide(null); }}
                aria-label="Limpar pesquisa"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_TOPICS.map((topic) => {
              const selected = query.trim().toLowerCase() === topic.toLowerCase();
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => { setQuery(selected ? '' : topic); setWide(null); }}
                  aria-pressed={selected}
                  className={cn(
                    'h-8 px-3 rounded-control border text-caption font-semibold transition-colors',
                    selected
                      ? 'border-purple-500 bg-purple-50 text-purple-700 dark:border-amber-400 dark:bg-amber-400/[0.14] dark:text-amber-200'
                      : 'border-zinc-200 dark:border-white/15 bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300',
                  )}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="surface-card rounded-card p-5 text-center space-y-2">
            <p className="text-body font-semibold text-ink dark:text-white">
              Nenhuma resposta encontrada para «{query.trim()}»
            </p>
            <p className="text-caption text-zinc-500 dark:text-zinc-400">
              Tente outra palavra ou fale directamente com o apoio no WhatsApp abaixo.
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-label font-semibold text-purple-600 dark:text-amber-400"
            >
              Limpar pesquisa
            </button>
          </div>
        ) : (
          <div className="surface-card rounded-card divide-y divide-zinc-200/70 dark:divide-white/10 overflow-hidden">
            {items.map((it) => {
              const on = activeWide === it.id;
              return (
                <div key={it.id}>
                  <button
                    onClick={() => setWide(on ? null : it.id)}
                    aria-expanded={on}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-zinc-50 dark:active:bg-white/[0.05]"
                  >
                    <span className="text-body font-semibold text-ink dark:text-white">
                      {it.q}
                    </span>
                    <ChevronDownIcon className={cn(
                      'w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400 transition-transform',
                      on && 'rotate-180 text-purple-600 dark:text-amber-400',
                    )} />
                  </button>
                  {on && (
                    <div className="px-4 pb-4 space-y-2">
                      {it.a.map((p, i) => (
                        <p key={i} className="text-label leading-relaxed text-zinc-600 dark:text-zinc-300">
                          {p}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <a
            href={waLink(APOIO_PHONE, 'Olá, preciso de ajuda com a app Elara Ulyatila.')}
            target="_blank"
            rel="noreferrer"
            className="btn-main h-12 grow rounded-control font-semibold text-label flex items-center justify-center gap-2"
          >
            <HelpRingIcon className="w-4 h-4" /> Falar com o apoio
          </a>
          <button
            onClick={onOpenData}
            className="surface-outline h-12 px-4 rounded-control text-label font-semibold text-ink dark:text-zinc-200 flex items-center gap-2"
          >
            <ShieldCheckIcon className="w-4 h-4" /> Os meus dados
          </button>
        </div>

        <p className="text-caption text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Apoio pelo WhatsApp {APOIO_DISPLAY}. Escreva sempre o código da viagem
          (começa por <code className="font-mono">ELT</code>) — é assim que a
          equipa encontra o seu caso sem lhe pedir o telefone.
        </p>
      </div>
    </Sheet>
  );
}
