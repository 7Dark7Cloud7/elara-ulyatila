/**
 * As silhuetas da frota, desenhadas à mão nesta prancha.
 *
 * A regra da casa, a mesma em todas as figuras:
 *
 * - prancha de 220 × 120, chão a `y = 104`, frente para a DIREITA;
 * - a sola da carroçaria corre em `y = 88` e recorta-se sobre cada roda com um
 *   arco maior que o pneu — é o que faz um carro parecer um carro e não uma
 *   caixa pousada em dois círculos;
 * - todas as rodas do mesmo veículo tocam o mesmo chão, e o chão de todos os
 *   veículos é a mesma linha;
 * - o vidro é SEMPRE um polígono interior, desenhado 3 a 4 unidades dentro da
 *   linha do tejadilho: um vidro que toque a borda faz o carro perder o tecto;
 * - nada sai da silhueta. Retrovisor, antena e bagagem são manchas POR CIMA da
 *   carroçaria, não apêndices — a 24 px um apêndice lê-se como um defeito.
 *
 * Desenha-se primeiro a silhueta, porque é ela que sobrevive ao tamanho mais
 * pequeno desta app (24 px, no painel do motorista).
 */
import type { ReactNode } from 'react';

export type VehicleKind =
  | 'sedan' | 'premium' | 'suv' | 'hatch' | 'candongueiro' | 'moto'
  | 'minibus' | 'bus' | 'pickup' | 'boxtruck' | 'lorry' | 'van';

/** Linha de chão: o sítio onde todas as rodas encostam. */
export const GROUND = 104;
/** A sola da carroçaria. */
const SILL = 88;

/** Cada peça do desenho numa cor da paleta Elara (ver `VehicleArt`). */
export interface Ink {
  body: string;
  /** Contorno fino da carroçaria: dá definição ao vector em cartões pequenos. */
  edge: string;
  shade: string;
  glass: string;
  tyre: string;
  rim: string;
  road: string;
  seam: string;
  front: string;
  back: string;
  line: string;
}

/**
 * A sola, do pára-choques da frente ao de trás, com um arco recortado sobre
 * cada eixo. Desenha-se da direita para a esquerda, por isso o arco vai com
 * `sweep = 0`: é a diferença entre a roda ter uma passageira por cima e ter a
 * carroçaria dentro do pneu.
 */
const sole = (axles: number[], r = 19, y = SILL): string =>
  axles
    .slice()
    .sort((a, b) => b - a)
    .map((x) => ` L ${x + r} ${y} A ${r} ${r} 0 0 0 ${x - r} ${y}`)
    .join('');

/** Roda com pneu definido, jante limpa e cubo central legível até 24 px. */
const Wheel = ({ x, r = 15, c }: { x: number; r?: number; c: Ink }) => (
  <g>
    <circle cx={x} cy={GROUND - r} r={r} className={c.tyre} />
    <circle cx={x} cy={GROUND - r} r={r * 0.58} className={c.rim} />
    <circle cx={x} cy={GROUND - r} r={r * 0.24} className={c.tyre} />
    <circle cx={x} cy={GROUND - r} r={r * 0.1} className={c.rim} />
  </g>
);

const Seam = ({ d, c, w = 2.2 }: { d: string; c: Ink; w?: number }) => (
  <path d={d} className={c.seam} strokeWidth={w} strokeLinecap="round" fill="none" />
);

/** Farol da frente (direita) e farolim de trás (esquerda): é o que diz para onde o veículo olha. */
const HeadLamp = ({ d, c }: { d: string; c: Ink }) => <path d={d} className={c.front} />;
const TailLamp = ({ x, y, c, w = 10, h = 7 }: { x: number; y: number; c: Ink; w?: number; h?: number }) => (
  <rect x={x} y={y} width={w} height={h} rx={h / 2.4} className={c.back} />
);

/**
 * Retrovisor: uma mancha curta na base do pára-brisas, dentro da silhueta.
 * É o único pormenor do carro que aparece em todos os tamanhos, por isso é
 * pequeno e encostado ao pilar — nunca um braço a sair do desenho.
 */
const Mirror = ({ x, y, c }: { x: number; y: number; c: Ink }) => (
  <rect x={x} y={y} width="12" height="5.5" rx="2.75" className={c.shade} />
);

/** A maçaneta, sempre abaixo da linha de cintura. */
const Handle = ({ x, y, c }: { x: number; y: number; c: Ink }) => (
  <rect x={x} y={y} width="11" height="3.6" rx="1.8" className={c.shade} />
);

/** Faixa de fundo de carroçaria entre os arcos — dá peso à figura. */
const Rocker = ({ from, to, c, y = SILL - 5.5, h = 5.5 }: { from: number; to: number; c: Ink; y?: number; h?: number }) => (
  <rect x={from} y={y} width={to - from} height={h} rx={h / 2} className={c.shade} />
);

/** Pilar de carroçaria por cima do vidro: é o que separa as janelas. */
const Pillar = ({ x, y, h, c, w = 5, skew = -2 }: { x: number; y: number; h: number; c: Ink; w?: number; skew?: number }) => (
  <path d={`M ${x} ${y} h ${w} l ${skew} ${h} h ${-w} z`} className={c.body} />
);

// — Automóveis ————————————————————————————————————————————————————————————————

/**
 * O sedan da praça (Corolla / Accent / Dzire): três volumes bem proporcionados,
 * tejadilho arqueado com vidro traseiro inclinado (nunca uma caixa de picape),
 * capô baixo e linha de cintura limpa. `long` é o Conforto: maior distância
 * entre eixos, tejadilho mais esguio e capô executivo.
 */
function Sedan({ c, long = false }: { c: Ink; long?: boolean }) {
  const rear = long ? 18 : 24;
  const front = long ? 202 : 196;
  const axles = long ? [162, 56] : [156, 62];
  const roofY = long ? 43 : 42;
  const belt = 62;
  const deckX = long ? 42 : 46;
  const roofL = long ? 68 : 70;
  const roofR = long ? 128 : 124;
  const cowlX = long ? 152 : 146;
  const pillarB = long ? 102 : 100;
  const pillarC = long ? 74 : 75;

  return (
    <g>
      <path
        d={`M ${rear + 4} ${SILL}
            Q ${rear} ${SILL} ${rear} 80
            L ${rear + 2} 69
            Q ${rear + 3} 63 ${rear + 12} 62
            L ${deckX} 60
            C ${deckX + 10} 53 ${roofL - 6} ${roofY} ${roofL} ${roofY}
            L ${roofR} ${roofY}
            C ${roofR + 10} ${roofY} ${cowlX - 6} 53 ${cowlX} 59
            L ${front - 16} 61
            Q ${front - 2} 62 ${front - 1} 71
            L ${front} 81
            Q ${front} ${SILL} ${front - 8} ${SILL}${sole(axles, 19)}
            L ${rear + 4} ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Habitáculo contínuo dentro do tejadilho, cortado pelos pilares B e C */}
      <path
        d={`M ${deckX + 7} ${belt - 2}
            C ${deckX + 14} 53 ${roofL - 2} ${roofY + 4} ${roofL + 4} ${roofY + 4}
            L ${roofR - 3} ${roofY + 4}
            C ${roofR + 6} ${roofY + 4} ${cowlX - 7} 54 ${cowlX - 3} ${belt - 2} Z`}
        className={c.glass}
      />
      <Pillar x={pillarC} y={roofY + 3} h={belt - roofY - 4} c={c} w={4.5} skew={-5} />
      <Pillar x={pillarB} y={roofY + 3} h={belt - roofY - 4} c={c} w={5} skew={-1.5} />
      {/* Vinco aerodinâmico de porta e soleira */}
      <Seam d={`M ${rear + 14} ${belt + 5} L ${front - 22} ${belt + 3}`} c={c} w={1.6} />
      <Seam d={`M ${pillarB - 1} ${belt} V ${SILL - 6}`} c={c} w={1.8} />
      <Rocker from={axles[1] + 20} to={axles[0] - 20} c={c} />
      <Handle x={pillarB + 7} y={belt + 6} c={c} />
      <Handle x={pillarB - 22} y={belt + 6} c={c} />
      <Mirror x={cowlX - 13} y={belt - 4} c={c} />
      {/* Farol dianteiro inclinado e farolim traseiro envolvente */}
      <HeadLamp d={`M ${front - 22} 64 L ${front - 2} 66 L ${front - 2} 72 L ${front - 18} 72 Z`} c={c} />
      <TailLamp x={rear + 2} y={66} c={c} w={12} h={6.5} />
      {/* Detalhe de grelha baixa na frente */}
      <rect x={front - 11} y={78} width="9" height="4" rx="2" className={c.shade} />
      <Wheel x={axles[0]} c={c} />
      <Wheel x={axles[1]} c={c} />
    </g>
  );
}

/**
 * O XL (SUV de 7 lugares — Fortuner / Prado): tejadilho comprido que vai até
 * cima da roda traseira, três janelas laterais, barra de tejadilho e arcos altos.
 */
function Suv({ c }: { c: Ink }) {
  const axles = [158, 58];
  const belt = 59;
  return (
    <g>
      {/* barra de tejadilho integrada sobre a cabina */}
      <rect x="48" y="31" width="76" height="4.5" rx="2.25" className={c.shade} />
      <path
        d={`M 26 ${SILL}
            Q 22 ${SILL} 22 80
            L 23 64
            L 32 42
            Q 35 36 44 36
            L 124 36
            Q 133 36 139 44
            L 148 56
            L 178 57
            Q 192 58 194 67
            L 195 80
            Q 195 ${SILL} 187 ${SILL}${sole(axles, 21)}
            L 26 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Três vidros contínuos: carga traseira, porta traseira e porta dianteira */}
      <path
        d={`M 33 ${belt - 2} L 40 41 L 122 41 Q 128 41 132 46 L 141 ${belt - 2} Z`}
        className={c.glass}
      />
      <Pillar x={66} y={40} h={18} c={c} w={5.5} skew={-3} />
      <Pillar x={102} y={40} h={18} c={c} w={5.5} skew={-1} />
      <Seam d="M 101 60 V 82" c={c} w={1.8} />
      <Seam d="M 38 64 H 174" c={c} w={1.5} />
      <Rocker from={80} to={136} c={c} />
      <Handle x={109} y={64} c={c} />
      <Handle x={74} y={64} c={c} />
      <Mirror x={135} y={53} c={c} />
      <HeadLamp d="M 174 60 L 193 62 L 193 70 L 174 68 Z" c={c} />
      <TailLamp x={24} y={62} c={c} w={9} h={9} />
      <Wheel x={axles[0]} r={16.5} c={c} />
      <Wheel x={axles[1]} r={16.5} c={c} />
    </g>
  );
}

/**
 * O táxi urbano (hatchback compacto): traseira curta e alta por cima do eixo,
 * capô curto e letreiro âmbar de táxi no tejadilho reconhecível a 24 px.
 */
function Hatch({ c }: { c: Ink }) {
  const axles = [150, 64];
  const belt = 61;
  return (
    <g>
      {/* Letreiro luminoso de táxi no tejadilho */}
      <rect x="82" y="33" width="26" height="9" rx="3" className={c.front} />
      <path
        d={`M 36 ${SILL}
            Q 31 ${SILL} 31 80
            L 33 65
            L 46 47
            Q 51 41 60 41
            L 116 41
            Q 125 41 131 48
            L 142 59
            L 170 60
            Q 183 61 185 69
            L 186 80
            Q 186 ${SILL} 178 ${SILL}${sole(axles, 18)}
            L 36 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d={`M 45 ${belt - 2} L 54 46 L 114 46 Q 120 46 125 51 L 134 ${belt - 2} Z`}
        className={c.glass}
      />
      <Pillar x={90} y={45} h={15} c={c} w={5} skew={-1} />
      <Rocker from={83} to={131} c={c} />
      <Seam d="M 90 61 V 82" c={c} w={1.8} />
      <Handle x={97} y={65} c={c} />
      <Handle x={68} y={65} c={c} />
      <Mirror x={128} y={55} c={c} />
      <HeadLamp d="M 167 63 L 184 65 L 184 71 L 167 70 Z" c={c} />
      <TailLamp x={33} y={65} c={c} w={9} h={8} />
      <Wheel x={axles[0]} r={14.5} c={c} />
      <Wheel x={axles[1]} r={14.5} c={c} />
    </g>
  );
}

/**
 * Scooter / Moto de praça: silhueta limpa em três curvas — rabeta com banco
 * duplo, plataforma central, e escudo frontal aerodinâmico com guiador e farol.
 */
function Moto({ c }: { c: Ink }) {
  const rear = 58;
  const front = 166;
  return (
    <g>
      {/* Forquilha e guarda-lamas dianteiro */}
      <path
        d={`M 148 48 L ${front} ${GROUND - 16}`}
        className={c.line}
        fill="none"
        strokeWidth={6.5}
        strokeLinecap="round"
      />
      <path
        d={`M 148 72 Q 165 62 180 74`}
        className={c.line}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
      />
      {/* Rabeta, banco corrido e piso raso */}
      <path
        d={`M 36 ${SILL}
            V 76
            Q 36 57 55 55
            L 104 55
            Q 118 56 124 72
            L 127 80
            H 146
            L 152 ${SILL}
            ${sole([rear], 19)}
            L 36 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Banco duplo contornado */}
      <path d="M 48 55 Q 76 52 104 55 L 101 62 H 50 Z" className={c.shade} />
      {/* Escudo frontal esculpido */}
      <path
        d={`M 134 ${SILL}
            L 143 45
            Q 145 37 154 38
            L 162 42
            Q 166 47 163 56
            L 151 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Pára-brisas curto e guiador encostado ao escudo */}
      <path d="M 146 39 L 152 31 Q 157 32 158 39 Z" className={c.glass} />
      <rect x="128" y="35" width="24" height="6.5" rx="3.25" className={c.shade} />
      {/* Pousa-pés e escape discreto */}
      <rect x="82" y="81" width="44" height="6" rx="3" className={c.shade} />
      <TailLamp x={37} y={64} c={c} w={6.5} h={8} />
      <HeadLamp d="M 155 47 L 165 49 L 163 57 L 154 55 Z" c={c} />
      <Wheel x={rear} r={16.5} c={c} />
      <Wheel x={front} r={16.5} c={c} />
    </g>
  );
}

// — Carrinhas e autocarros ————————————————————————————————————————————————————

/**
 * A carrinha da casa (Toyota Hiace): caixa alta com o nariz a descair para o
 * pára-brisas. Serve para Hiace, Candongueiro (com grelha e letreiro) e Carga.
 */
function Van({ c, rack = false, board = false, panel = false }:
  { c: Ink; rack?: boolean; board?: boolean; panel?: boolean }) {
  const axles = [158, 54];
  return (
    <g>
      {rack && (
        <g className={c.shade}>
          <rect x="34" y="25" width="96" height="4.5" rx="2.25" />
          <rect x="42" y="19" width="4" height="7" rx="2" />
          <rect x="118" y="19" width="4" height="7" rx="2" />
          <rect x="56" y="12" width="44" height="14" rx="4" />
        </g>
      )}
      <path
        d={`M 22 ${SILL}
            V 42
            Q 22 31 33 30
            H 142
            Q 153 30 160 40
            L 179 58
            Q 188 61 189 70
            L 189 79
            Q 189 ${SILL} 181 ${SILL}${sole(axles, 19)}
            L 22 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* pára-brisas do nariz inclinado */}
      <path d="M 146 37 L 169 57 H 146 Z" className={c.glass} />
      {panel ? (
        <>
          {/* carrinha de carga: só a porta da frente tem vidro, o resto é chapa */}
          <path d="M 118 37 H 141 V 57 H 118 Z" className={c.glass} />
          <Seam d="M 114 33 V 82" c={c} />
          <Seam d="M 143 37 V 57" c={c} w={2} />
          <Seam d="M 32 66 H 108" c={c} w={2} />
        </>
      ) : (
        <>
          <path d="M 120 37 H 141 V 57 H 120 Z" className={c.glass} />
          <rect x="96" y="37" width="20" height="20" rx="3" className={c.glass} />
          <rect x="68" y="37" width="24" height="20" rx="3" className={c.glass} />
          <rect x="30" y="37" width="34" height="20" rx="3" className={c.glass} />
          {/* porta corrediça: costura a pique e calha */}
          <Seam d="M 118 34 V 82" c={c} />
          <Seam d="M 93 34 V 82" c={c} />
          <Seam d="M 66 62 H 118" c={c} w={2} />
        </>
      )}
      {board && <rect x="150" y="41" width="14" height="7" rx="2" className={c.front} />}
      <Rocker from={axles[1] + 20} to={axles[0] - 20} c={c} y={82} h={5.5} />
      <Mirror x={144} y={54} c={c} />
      <HeadLamp d="M 174 62 L 188 64 L 188 71 L 174 69 Z" c={c} />
      <TailLamp x={24} y={62} c={c} w={7} h={11} />
      <Wheel x={axles[0]} c={c} />
      <Wheel x={axles[1]} c={c} />
    </g>
  );
}

/** Autocarro urbano: frente direita, faixa de vidro contínua, duas portas e AC no tejadilho. */
function Bus({ c }: { c: Ink }) {
  const axles = [166, 54];
  return (
    <g>
      <rect x="58" y="20" width="66" height="7.5" rx="3.75" className={c.shade} />
      <path
        d={`M 18 ${SILL} V 36 Q 18 26 29 26 H 176 Q 190 26 194 38 L 197 52 V 79
            Q 197 ${SILL} 189 ${SILL}${sole(axles, 19)} L 18 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect x="28" y="34" width="150" height="24" rx="3" className={c.glass} />
      {[64, 96, 128, 160].map((x) => (
        <rect key={x} x={x} y="34" width="5" height="24" className={c.body} />
      ))}
      <path d="M 182 34 L 194 40 V 58 H 182 Z" className={c.glass} />
      <rect x="134" y="29" width="38" height="6.5" rx="2" className={c.front} />
      <Seam d="M 152 32 V 82" c={c} />
      <Seam d="M 76 32 V 82" c={c} />
      <rect x="152" y="34" width="4" height="48" rx="2" className={c.shade} opacity={0.45} />
      <rect x="76" y="34" width="4" height="48" rx="2" className={c.shade} opacity={0.45} />
      <Rocker from={74} to={146} c={c} y={81} h={7} />
      <Mirror x={184} y={46} c={c} />
      <HeadLamp d="M 186 66 L 196 66 L 196 74 L 186 74 Z" c={c} />
      <TailLamp x={20} y={64} c={c} w={6} h={12} />
      <Wheel x={axles[0]} r={14} c={c} />
      <Wheel x={axles[1]} r={14} c={c} />
    </g>
  );
}

// — Carga ————————————————————————————————————————————————————————————————————

/** Picape de recolha (Hilux): cabine dupla à frente, caixa aberta atrás com carga. */
function Pickup({ c }: { c: Ink }) {
  const axles = [160, 56];
  return (
    <g>
      {/* carga na caixa aberta */}
      <rect x="28" y="45" width="38" height="20" rx="3" className={c.shade} />
      <rect x="70" y="50" width="22" height="15" rx="3" className={c.shade} />
      <path
        d={`M 20 ${SILL} V 58 H 98 L 107 37 Q 109 35 114 35 H 144 Q 148 35 151 39 L 161 55 L 184 56
            Q 196 57 197 66 L 197 79 Q 197 ${SILL} 189 ${SILL}${sole(axles, 19)}
            L 20 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* chapa da caixa aberta */}
      <path d={`M 20 ${SILL} V 58 H 98 V ${SILL} Z`} className={`${c.body} ${c.edge}`} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M 106 53 L 112 40 H 127 V 53 Z" className={c.glass} />
      <path d="M 131 40 H 143 L 152 53 H 131 Z" className={c.glass} />
      <Seam d="M 129 38 V 55" c={c} />
      <Seam d="M 98 58 V 80" c={c} />
      <Handle x={135} y={60} c={c} />
      <Mirror x={155} y={50} c={c} />
      <HeadLamp d="M 182 59 L 196 61 L 196 68 L 182 66 Z" c={c} />
      <TailLamp x={22} y={62} c={c} w={7} h={9} />
      <Rocker from={76} to={140} c={c} />
      <Wheel x={axles[0]} c={c} />
      <Wheel x={axles[1]} c={c} />
    </g>
  );
}

/** Canter: caixa fechada de mudanças com nervuras e cabine sobre o motor. */
function BoxTruck({ c }: { c: Ink }) {
  const axles = [166, 58];
  return (
    <g>
      <path
        d={`M 14 ${SILL} V 26 H 148 V 34 H 180 Q 194 34 196 46 L 198 79
            Q 198 ${SILL} 190 ${SILL}${sole(axles, 19)} L 14 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect x="22" y="34" width="120" height="46" rx="3" className={c.shade} opacity={0.5} />
      {[44, 66, 88, 110, 132].map((x) => (
        <Seam key={x} d={`M ${x} 34 V 78`} c={c} w={1.8} />
      ))}
      <path d="M 186 42 H 195 V 58 H 186 Z" className={c.glass} />
      <path d="M 154 42 H 180 V 58 H 154 Z" className={c.glass} />
      <Seam d="M 152 36 V 80" c={c} />
      <Mirror x={184} y={40} c={c} />
      <HeadLamp d="M 188 62 L 197 62 L 197 70 L 188 70 Z" c={c} />
      <TailLamp x={15} y={62} c={c} w={6} h={10} />
      <rect x="14" y="76" width="10" height="8" rx="2" className={c.shade} />
      <Rocker from={78} to={146} c={c} y={80} h={8} />
      <Wheel x={axles[0]} r={14} c={c} />
      <Wheel x={axles[1]} r={14} c={c} />
    </g>
  );
}

/** Camião interprovincial: caixa comprida, eixo dianteiro e tandem atrás. */
function Lorry({ c }: { c: Ink }) {
  const axles = [176, 92, 60];
  return (
    <g>
      <path
        d={`M 12 ${SILL} V 22 H 150 V 30 H 158 L 160 16 H 186 Q 200 16 203 30
            L 206 70 V 79 Q 206 ${SILL} 198 ${SILL}${sole(axles, 18)} L 12 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect x="18" y="28" width="126" height="48" rx="3" className={c.shade} opacity={0.5} />
      <Seam d="M 144 28 V 74" c={c} w={2} />
      {[46, 74, 102, 130].map((x) => (
        <Seam key={x} d={`M ${x} 28 V 74`} c={c} w={1.8} />
      ))}
      <path d="M 164 22 H 184 Q 194 22 197 32 L 199 46 H 164 Z" className={c.glass} />
      <Seam d="M 160 34 V 78" c={c} />
      <Mirror x={190} y={30} c={c} />
      <HeadLamp d="M 196 62 L 205 62 L 205 72 L 196 72 Z" c={c} />
      <TailLamp x={13} y={62} c={c} w={6} h={10} />
      <rect x="150" y="70" width="26" height="12" rx="4" className={c.shade} />
      <rect x="12" y="70" width="8" height="10" rx="2" className={c.shade} />
      {axles.map((x) => <Wheel key={x} x={x} r={14} c={c} />)}
    </g>
  );
}

export const SHAPES: Record<VehicleKind, (c: Ink) => ReactNode> = {
  sedan: (c) => <Sedan c={c} />,
  premium: (c) => <Sedan c={c} long />,
  hatch: (c) => <Hatch c={c} />,
  suv: (c) => <Suv c={c} />,
  moto: (c) => <Moto c={c} />,
  minibus: (c) => <Van c={c} />,
  candongueiro: (c) => <Van c={c} rack board />,
  van: (c) => <Van c={c} panel />,
  bus: (c) => <Bus c={c} />,
  pickup: (c) => <Pickup c={c} />,
  boxtruck: (c) => <BoxTruck c={c} />,
  lorry: (c) => <Lorry c={c} />,
};

/** A estrada por baixo de tudo, na mesma linha para todas as figuras. */
export const Road = ({ c }: { c: Ink }) => (
  <rect x="12" y={GROUND} width="196" height="3.5" rx="1.75" className={c.road} />
);
