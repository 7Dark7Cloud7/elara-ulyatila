import type { TripState, Trip, TripEvent } from '../types';

/** Nomes que a pessoa lê, por estado da viagem. */
export const STATE_LABEL: Record<TripState, string> = {
  searching: 'À procura de motorista',
  accepted: 'Motorista a caminho',
  arriving: 'Quase a chegar',
  waiting_pin: 'À espera do código',
  ongoing: 'Em viagem',
  waiting_drop: 'No ponto de entrega',
  ended: 'Terminada',
  rated: 'Avaliada',
  cancelled: 'Cancelada',
};

export const isTripActive = (t: Pick<Trip, 'state'>): boolean =>
  !['ended', 'rated', 'cancelled'].includes(t.state);

export const isTripMine = (t: Pick<Trip, 'passenger_id'>, uid: string | undefined): boolean =>
  !!uid && t.passenger_id === uid;

/** O que falta acontecer, em linguagem de rua. */
export const nextHint = (state: TripState, kind: Trip['kind'], shared = false): string => {
  if (state === 'searching') return 'O pedido está na praça. Assim que um motorista aceitar, aparece aqui.';
  // Um lugar comprado num carro que já está a encher (0004) não é um carro
  // fechado à espera: a referência da pessoa é a hora anunciada pela corrida.
  if (state === 'accepted') {
    return shared
      ? 'Lugar reservado: este carro parte à hora anunciada no quadro. Guarde o código — o motorista pergunta-o quando chegar.'
      : 'Guarde o código — o motorista pergunta-o quando chegar.';
  }
  if (state === 'arriving') return 'O motorista está a chegar ao ponto de partida.';
  if (state === 'waiting_pin') return 'Diga o código ao motorista para começar a viagem.';
  if (state === 'ongoing') {
    return kind === 'entrega'
      ? 'Encomenda a caminho. Quem recebe confirma com o código de entrega.'
      : 'Boa viagem. O código já foi confirmado.';
  }
  if (state === 'waiting_drop') return 'No ponto de entrega: peça o código a quem recebe a encomenda.';
  return '';
};

/** Número único de emergência de Angola. Sem centros fictícios: é o que existe. */
export const EMERGENCY_NUMBER = '111';

export const sosMessage = (code: string): string =>
  `EMERGÊNCIA — viagem Elara Ulyatila ${code}. Esta mensagem sai da app com o código da viagem.`;

/** Motivos que a equipa lê na caixa de reportes (tr_report.reason). O texto
 *  livre vai na coluna `text`; o motivo fica estável para se poder contar. */
export const REPORT_REASONS = [
  { id: 'nao_chegou', label: 'O motorista não chegou' },
  { id: 'preco', label: 'Quiseram pagar mais do que o preço da app' },
  { id: 'codigo_fora', label: 'Pediram o código ou documentos por fora' },
  { id: 'conducao', label: 'Condução ou comportamento perigoso' },
  { id: 'encomenda', label: 'A encomenda não foi entregue' },
  { id: 'objecto_perdido', label: 'Deixei algo no carro' },
  { id: 'outro', label: 'Outro assunto' },
] as const;

/** Motivos que a app escreve sozinha, sem serem escolha da pessoa. Vivem
 *  separados dos chips do reporte justamente para ninguém carregar por
 *  acidente num «aviso automático» quando queria queixar-se do preço. */
export const AUTO_REPORT_REASONS = [
  { id: 'verificacao_sem_resposta', label: 'Verificação de viagem sem resposta' },
] as const;

/** Falta um nome ao índice de lugares — não é uma queixa, é uma pergunta que a
 *  pessoa faz à equipa. Vai para a mesma fila (`tr_report`) porque é lá que a
 *  equipa já olha, e volta a aparecer na conta de quem pediu. */
export const PLACE_REPORT_REASONS = [
  { id: 'lugar_em_falta', label: 'Falta o nome de um lugar' },
] as const;

/** Os mesmos motivos vistos do banco da frente. `tr_report` aceita as duas
 *  pontas (by_role 'passenger' ou 'driver'), e os ids ficam estáveis para se
 *  poder contar quem denunciou o quê. */
export const DRIVER_REPORT_REASONS = [
  { id: 'nao_apareceu', label: 'A pessoa não apareceu no ponto' },
  { id: 'nao_pagou', label: 'Não pagou a viagem' },
  { id: 'fora_da_app', label: 'Pediu para fechar por fora da app' },
  { id: 'comportamento', label: 'Comportamento perigoso ou agressivo' },
  { id: 'mercadoria', label: 'A encomenda não era o que foi descrito' },
  { id: 'objecto_no_carro', label: 'Encontrei algo deixado no carro' },
  { id: 'outro', label: 'Outro assunto' },
] as const;

/**
 * O campo de texto diz o que escrever, conforme o motivo escolhido. Um reporte
 * de «deixei algo no carro» sem descrição do objecto obriga a equipa a voltar
 * a perguntar, e quem já saiu do carro já não sabe onde ficou.
 */
export const REPORT_HINT: Record<string, string> = {
  objecto_perdido: 'Descreva o objecto (cor, marca, o que vai dentro) e onde no carro ficou.',
  objecto_no_carro: 'Descreva o que encontrou e em que parte do carro. Guarde-o até a equipa o contactar.',
  encomenda: 'Diga o que ia na caixa, para quem era e onde devia ficar.',
  mercadoria: 'Diga o que foi descrito no pedido e o que encontrou de facto.',
  preco: 'Diga o preço da app e o que pediram no fim, com a hora.',
  nao_apareceu: 'Diga a hora em que chegou ao ponto e quanto tempo esperou.',
};

export const reportHint = (reason: string | null, fallback: string): string =>
  (reason && REPORT_HINT[reason]) || fallback;

/**
 * Mensagem para partilhar com alguém de confiança durante a viagem.
 * O código de viagem NUNCA entra aqui: quem o lê pode começar a viagem no
 * lugar do passageiro. Vai o que é público — código de referência da corrida,
 * motorista, matrículas e zonas.
 */
export const shareMessage = (trip: Trip, from: string, to: string): string =>
  [
    `Viagem Elara Ulyatila ${trip.code}, em curso (${STATE_LABEL[trip.state]}).`,
    `De ${from} para ${to}.`,
    trip.driver_name ? `Motorista: ${trip.driver_name} · ${trip.car_model ?? ''} ${trip.plate ?? ''}`.trimEnd() : 'Motorista por atribuir.',
    `Preço ${trip.price_kz} Kz. Se algo correr mal, posso ligar 111.`,
  ].join('\n');

/**
 * Duração real da corrida, a partir do carimbo que o servidor deixou no
 * historial quando o código foi confirmado e quando fechou. Sem esses dois
 * momentos o recibo não tem tempo nenhum — preferimos não inventar.
 */
export const tripMinutes = (t: Pick<Trip, 'events' | 'created_at'>): number | null => {
  const events = (t.events ?? []) as TripEvent[];
  const at = (state: string) => events.find((e) => e?.state === state)?.at ?? null;
  const start = at('ongoing');
  const end = at('ended');
  if (!start || !end || end < start) return null;
  return Math.max(1, Math.round((end - start) / 60000));
};

/**
 * Estimativa de chegada do carro: distância a ~28 km/h, a média urbana que se
 * vê em Luanda. É um arredondamento honesto, não um tempo medido — por isso
 * vem com «≈» e nunca como promessa.
 */
export const driveMinutes = (km: number): number => Math.max(1, Math.round((km / 28) * 60));

/** O minuto em que a viagem começou de verdade: o carimbo que o servidor deixou
 *  no estado «em viagem». Sem esse carimbo não há verificação possível, e a app
 *  não inventa um início. */
export const ongoingSince = (t: Pick<Trip, 'events' | 'state'>): number | null => {
  if (t.state !== 'ongoing') return null;
  const e = (t.events ?? []).find((x) => x?.state === 'ongoing');
  return e ? e.at : null;
};

/**
 * A fasquia da verificação de viagem: o tempo previsto mais uma margem larga.
 * Não é desvio de rota medido — é tempo, o único sinal que existe sem vigiar
 * ninguém. Trânsito em Luanda atrasa de verdade, por isso a fasquia é folgada:
 * perguntar cedo de mais ensina a pessoa a ignorar o aviso.
 *
 * À noite a margem encurta (não dispara: encurta) porque há menos carros na rua
 * para explicar um atraso, e a pessoa está mais longe de quem a pode ajudar.
 */
export const checkAfterMinutes = (km: number, night = false): number => {
  const expected = driveMinutes(km);
  const margin = night ? Math.max(8, Math.round(expected * 0.35))
    : Math.max(12, Math.round(expected * 0.6));
  return expected + margin;
};

/**
 * A janela da noite. É a hora do aparelho, sem GPS nem fuso à mistura: a app não
 * sabe em que província a pessoa está, e perguntar-lhe o fuso seria mais um
 * diálogo que ninguém quer.
 */
export const isNight = (at: number | Date = Date.now()): boolean => {
  const h = (at instanceof Date ? at : new Date(at)).getHours();
  return h >= 21 || h < 5;
};

export const NIGHT_WINDOW = '21 h – 05 h';

/** Abre o mapa que a pessoa já tem no telemóvel. Não calculamos rotas: o
 *  motorista é quem conhece a rua, a app só entrega o ponto. */
export const mapsUrl = (lat: number, lon: number, label?: string): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
  + (label ? `&destination_label=${encodeURIComponent(label)}` : '');

export const wazeUrl = (lat: number, lon: number): string =>
  `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;

/** Só a hora do dia é que se sabe sem perguntar a ninguém. */
export const greeting = (now = new Date()): string => {
  const h = now.getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

/**
 * A hora de ponta em Luanda é o que se pode dizer sem dados em directo: não é
 * trânsito medido, é o costume. Dizer «há chuva» ou «há 4 km de fila» sem o
 * saber seria uma mentira com ar de app.
 */
export const hourTip = (now = new Date()): string | null => {
  const h = now.getHours();
  const weekday = now.getDay() !== 0 && now.getDay() !== 6;
  if (weekday && h >= 7 && h < 9) return 'Hora de ponta de manhã: os carros custam mais tempo. Peça com antecedência e combine o ponto pelo chat.';
  if (weekday && h >= 17 && h < 19) return 'Hora de ponta de tarde: pela ilha o trânsito pára. Tenha o código à mão e nota trocada se paga em dinheiro.';
  if (h >= 21) return 'Ao fim da noite: confirme a matrícula e o código antes de entrar, e partilhe a viagem com alguém.';
  return null;
};

/**
 * Respostas rápidas: o que se repete em toda a corrida, escrito uma vez.
 * Nunca um telefone — o filtro do servidor remove números, e o encontro tem
 * de ficar dentro da app para haver registo.
 */
export const QUICK_REPLIES: Record<'passenger' | 'driver', string[]> = {
  passenger: [
    'Já cá estou',
    'Estou a 5 minutos',
    'Vou pagar com nota de 5.000 Kz',
    'Prefiro silêncio, se não se importar',
  ],
  driver: [
    'Estou a chegar',
    'Cheguei ao ponto de embarque',
    'Sou o carro com a matrícula do painel',
    'Entrei no estacionamento, vejo-o no ponto marcado',
  ],
};

/**
 * O elogio que fica depois das estrelas. São palavras da pessoa para a outra
 * ponta, e a equipa lê-os nos reportes — não são pontuação nem recompensa.
 */
export const COMPLIMENTS = [
  { id: 'pontual', label: 'Pontual' },
  { id: 'conducao_segura', label: 'Condução segura' },
  { id: 'amavel', label: 'Amável' },
  { id: 'carro_limpo', label: 'Carro limpo' },
  { id: 'ajudou_bagagem', label: 'Ajudou com a bagagem' },
  { id: 'cuidado_encomenda', label: 'Cuidou da encomenda' },
] as const;

/** Cartão do recibo: o resumo para enviar a alguém, sem códigos nem telefones. */
export const receiptMessage = (
  trip: Pick<Trip, 'code' | 'kind' | 'state' | 'price_kz' | 'distance_km' | 'payment'>,
  from: string,
  to: string,
  minutes: number | null,
  score: number | null,
): string =>
  [
    `${trip.kind === 'entrega' ? 'Entrega' : 'Viagem'} Elara Ulyatila ${trip.code}.`,
    `De ${from} para ${to} · ${trip.distance_km} km${minutes ? ` · ${minutes} min` : ''}.`,
    `Pago ${trip.price_kz} Kz em ${trip.payment === 'cash' ? 'dinheiro' : 'Multicaixa'}.`,
    score ? `Avaliação: ${score} de 5.` : 'Sem avaliação ainda.',
  ].join('\n');
