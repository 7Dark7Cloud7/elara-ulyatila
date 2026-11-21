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
  /** Brilho superior / vinco de luz na carroçaria. */
  sheen: string;
  glass: string;
  /** Reflexo diagonal sobre o vidro. */
  glint: string;
  tyre: string;
  rim: string;
  /** Raios da jante de liga leve. */
  spoke: string;
  road: string;
  seam: string;
  front: string;
  back: string;
  line: string;
}

/**
 * A sola, do pára-choques da frente ao de trás, com um arco recortado sobre
 * cada eixo. Desenha-se da direita para a esquerda, por isso o arco vai com
 * `sweep = 0`: é a diferença entre a roda ter uma cava de roda por cima e ter
 * a carroçaria dentro do pneu.
 */
const sole = (axles: number[], r = 19, y = SILL): string =>
  axles
    .slice()
    .sort((a, b) => b - a)
    .map((x) => ` L ${x + r} ${y} A ${r} ${r} 0 0 0 ${x - r} ${y}`)
    .join('');

/** Roda de liga leve com pneu recortado, 5 raios finos e cubo central. */
const Wheel = ({ x, r = 15, c }: { x: number; r?: number; c: Ink }) => {
  const cy = GROUND - r;
  const inner = r * 0.56;
  const spokeR = r * 0.5;
  return (
    <g>
      <circle cx={x} cy={cy} r={r} className={c.tyre} />
      <circle cx={x} cy={cy} r={r * 0.82} className={c.seam} fill="none" strokeWidth="1" />
      <circle cx={x} cy={cy} r={inner} className={c.rim} />
      {[0, 72, 144, 216, 288].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x2 = x + Math.cos(rad) * spokeR;
        const y2 = cy + Math.sin(rad) * spokeR;
        return (
          <line
            key={deg}
            x1={x}
            y1={cy}
            x2={x2}
            y2={y2}
            className={c.spoke}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={x} cy={cy} r={r * 0.22} className={c.tyre} />
      <circle cx={x} cy={cy} r={r * 0.09} className={c.rim} />
    </g>
  );
};

const Seam = ({ d, c, w = 2 }: { d: string; c: Ink; w?: number }) => (
  <path d={d} className={c.seam} strokeWidth={w} strokeLinecap="round" fill="none" />
);

/** Reflexo diagonal dentro de um vidro: dá leitura de superfície polida. */
const GlassGlint = ({ x, y, h, c, w = 8 }: { x: number; y: number; h: number; c: Ink; w?: number }) => (
  <path d={`M ${x} ${y + h} L ${x + 6} ${y} h ${w} L ${x + w} ${y + h} Z`} className={c.glint} />
);

/** Farol da frente (direita) e farolim de trás (esquerda): diz para onde o veículo olha. */
const HeadLamp = ({ d, c }: { d: string; c: Ink }) => <path d={d} className={c.front} />;
const TailLamp = ({ x, y, c, w = 10, h = 7 }: { x: number; y: number; c: Ink; w?: number; h?: number }) => (
  <rect x={x} y={y} width={w} height={h} rx={h / 2.4} className={c.back} />
);

/** Retrovisor encostado ao pilar A, sempre dentro da silhueta. */
const Mirror = ({ x, y, c }: { x: number; y: number; c: Ink }) => (
  <rect x={x} y={y} width="11.5" height="5.2" rx="2.6" className={c.shade} />
);

/** Maçaneta esculpida abaixo da linha de cintura. */
const Handle = ({ x, y, c }: { x: number; y: number; c: Ink }) => (
  <rect x={x} y={y} width="10.5" height="3.2" rx="1.6" className={c.shade} />
);

/** Soleira inferior entre as cavas das rodas — dá peso e estabilidade. */
const Rocker = ({ from, to, c, y = SILL - 5.5, h = 5.2 }: { from: number; to: number; c: Ink; y?: number; h?: number }) => (
  <rect x={from} y={y} width={to - from} height={h} rx={h / 2} className={c.shade} />
);

/** Pilar de carroçaria por cima do vidro: separa as janelas com ângulo real. */
const Pillar = ({ x, y, h, c, w = 4.8, skew = -2 }: { x: number; y: number; h: number; c: Ink; w?: number; skew?: number }) => (
  <path d={`M ${x} ${y} h ${w} l ${skew} ${h} h ${-w} z`} className={c.body} />
);

// — Automóveis ————————————————————————————————————————————————————————————————

/**
 * Sedan urbano (`economico`) e executivo (`conforto` / `long`):
 * tejadilho fluido tipo fastback, cintura esculpida, brilho superior de capô
 * e farol LED afilado.
 */
function Sedan({ c, long = false }: { c: Ink; long?: boolean }) {
  const rear = long ? 16 : 23;
  const front = long ? 204 : 197;
  const axles = long ? [163, 55] : [156, 61];
  const roofY = long ? 42 : 41;
  const belt = 62;
  const deckX = long ? 42 : 46;
  const roofL = long ? 68 : 70;
  const roofR = long ? 130 : 124;
  const cowlX = long ? 153 : 146;
  const pillarB = long ? 103 : 100;
  const pillarC = long ? 74 : 75;

  return (
    <g>
      <path
        d={`M ${rear + 4} ${SILL}
            Q ${rear} ${SILL} ${rear} 80
            L ${rear + 2} 69
            Q ${rear + 3} 62.5 ${rear + 13} 61.5
            L ${deckX} 59.5
            C ${deckX + 10} 52 ${roofL - 6} ${roofY} ${roofL} ${roofY}
            L ${roofR} ${roofY}
            C ${roofR + 10} ${roofY} ${cowlX - 6} 52.5 ${cowlX} 58.5
            L ${front - 16} 60.5
            Q ${front - 2} 61.8 ${front - 1} 71
            L ${front} 81
            Q ${front} ${SILL} ${front - 8} ${SILL}${sole(axles, 19.5)}
            L ${rear + 4} ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Brilho superior do tejadilho e do capô */}
      <path
        d={`M ${roofL + 4} ${roofY + 2} H ${roofR - 4}`}
        className={c.sheen}
        strokeWidth="2.5"
      />
      <path
        d={`M ${cowlX + 2} 61.2 Q ${front - 24} 61.5 ${front - 14} 64.5 L ${cowlX + 1} 64.5 Z`}
        className={c.sheen}
      />
      {/* Habitáculo contínuo com reflexos diagonais */}
      <path
        d={`M ${deckX + 7} ${belt - 2}
            C ${deckX + 14} 52.5 ${roofL - 2} ${roofY + 4} ${roofL + 4} ${roofY + 4}
            L ${roofR - 3} ${roofY + 4}
            C ${roofR + 6} ${roofY + 4} ${cowlX - 7} 54 ${cowlX - 3} ${belt - 2} Z`}
        className={c.glass}
      />
      <GlassGlint x={pillarB + 10} y={roofY + 4.5} h={belt - roofY - 7} c={c} w={9} />
      <GlassGlint x={pillarC + 4} y={roofY + 4.5} h={belt - roofY - 7} c={c} w={6} />
      <Pillar x={pillarC} y={roofY + 3} h={belt - roofY - 4} c={c} w={4.5} skew={-5} />
      <Pillar x={pillarB} y={roofY + 3} h={belt - roofY - 4} c={c} w={5} skew={-1.5} />
      {/* Vinco aerodinâmico de cintura (no Conforto, friso cromado extra) */}
      <Seam d={`M ${rear + 14} ${belt + 5.5} L ${front - 22} ${belt + 3}`} c={c} w={long ? 1.9 : 1.5} />
      <Seam d={`M ${pillarB - 1} ${belt} V ${SILL - 6}`} c={c} w={1.6} />
      {long && <rect x={axles[1] + 22} y={belt + 1} width={axles[0] - axles[1] - 44} height="2.4" rx="1.2" className={c.glint} />}
      <Rocker from={axles[1] + 20} to={axles[0] - 20} c={c} />
      <Handle x={pillarB + 7} y={belt + 6} c={c} />
      <Handle x={pillarB - 21} y={belt + 6} c={c} />
      <Mirror x={cowlX - 13} y={belt - 4.2} c={c} />
      {/* Farol LED afilado + faixa diurna e farolim envolvente */}
      <HeadLamp d={`M ${front - 23} 64 L ${front - 2} 66.2 L ${front - 2} 71.5 L ${front - 18} 71.5 Z`} c={c} />
      <TailLamp x={rear + 2} y={66} c={c} w={13} h={6} />
      {/* Entrada de ar frontal */}
      <rect x={front - 12} y={77.5} width="10" height="4.2" rx="2.1" className={c.shade} />
      <Wheel x={axles[0]} c={c} />
      <Wheel x={axles[1]} c={c} />
    </g>
  );
}

/**
 * SUV 7 lugares (`xl` — Fortuner / Prado): tejadilho comprido, barras de carga,
 * três janelas laterais com reflexo e arcos de roda pronunciados.
 */
function Suv({ c }: { c: Ink }) {
  const axles = [158, 58];
  const belt = 59;
  return (
    <g>
      {/* barra de tejadilho integrada com apoios */}
      <rect x="46" y="30.5" width="78" height="4.5" rx="2.25" className={c.shade} />
      <rect x="54" y="34" width="5" height="3.5" className={c.shade} />
      <rect x="112" y="34" width="5" height="3.5" className={c.shade} />
      <path
        d={`M 26 ${SILL}
            Q 22 ${SILL} 22 80
            L 23 64
            L 32 42
            Q 35 36 44 36
            L 124 36
            Q 133 36 139 44
            L 148 56
            L 179 57
            Q 192 58 194 67
            L 195 80
            Q 195 ${SILL} 187 ${SILL}${sole(axles, 21)}
            L 26 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M 149 59.5 H 184 Q 190 60 191 63 L 149 62.5 Z" className={c.sheen} />
      {/* Três vidros contínuos com brilho */}
      <path
        d={`M 33 ${belt - 2} L 40 41 L 122 41 Q 128 41 132 46 L 141 ${belt - 2} Z`}
        className={c.glass}
      />
      <GlassGlint x={110} y={41.5} h={15} c={c} w={9} />
      <GlassGlint x={73} y={41.5} h={15} c={c} w={7} />
      <Pillar x={66} y={40} h={18} c={c} w={5.2} skew={-3} />
      <Pillar x={102} y={40} h={18} c={c} w={5.2} skew={-1} />
      <Seam d="M 101 60 V 82" c={c} w={1.6} />
      <Seam d="M 38 64.5 H 174" c={c} w={1.5} />
      <Rocker from={80} to={136} c={c} />
      <Handle x={109} y={64} c={c} />
      <Handle x={74} y={64} c={c} />
      <Mirror x={135} y={53} c={c} />
      <HeadLamp d="M 174 60 L 193 62 L 193 70 L 174 68 Z" c={c} />
      <TailLamp x={24} y={62} c={c} w={9} h={9} />
      <rect x="184" y="76" width="9" height="4.5" rx="2" className={c.shade} />
      <Wheel x={axles[0]} r={16.5} c={c} />
      <Wheel x={axles[1]} r={16.5} c={c} />
    </g>
  );
}

/**
 * Táxi urbano compacto (`hatch`): traseira curta, letreiro luminoso no topo e
 * arcos bem proporcionados.
 */
function Hatch({ c }: { c: Ink }) {
  const axles = [150, 64];
  const belt = 61;
  return (
    <g>
      {/* Letreiro luminoso de táxi no tejadilho com base */}
      <rect x="81" y="32" width="28" height="9.5" rx="3.2" className={c.front} />
      <rect x="86" y="35" width="18" height="3.2" rx="1.6" className={c.glint} />
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
            Q 186 ${SILL} 178 ${SILL}${sole(axles, 18.5)}
            L 36 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d={`M 45 ${belt - 2} L 54 46 L 114 46 Q 120 46 125 51 L 134 ${belt - 2} Z`}
        className={c.glass}
      />
      <GlassGlint x={98} y={46.5} h={12} c={c} w={8} />
      <Pillar x={90} y={45} h={15} c={c} w={5} skew={-1} />
      <Rocker from={83} to={131} c={c} />
      <Seam d="M 90 61 V 82" c={c} w={1.6} />
      <Seam d="M 46 65 H 164" c={c} w={1.4} />
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
 * Moto urbana / Scooter de praça: carenagem dianteira aerodinâmica, pára-brisas
 * fumado, banco duplo esculpido, escape traseiro e forquilha firme.
 */
function Moto({ c }: { c: Ink }) {
  const rear = 58;
  const front = 166;
  return (
    <g>
      {/* Escape traseiro inclinado */}
      <path d="M 44 82 L 88 84 L 86 90 L 42 87 Z" className={c.shade} />
      {/* Forquilha dianteira e guarda-lamas */}
      <path
        d={`M 148 47 L ${front} ${GROUND - 16.5}`}
        className={c.line}
        fill="none"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d="M 147 71 Q 165 60 181 73"
        className={c.line}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
      />
      {/* Rabeta, piso raso e carenagem traseira */}
      <path
        d={`M 36 ${SILL}
            V 76
            Q 36 57 56 55
            L 104 55
            Q 118 56 124 72
            L 127 80
            H 146
            L 152 ${SILL}
            ${sole([rear], 19.5)}
            L 36 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Banco duplo anatómico */}
      <path d="M 47 55 Q 76 51.5 104 55 L 101 62.5 H 49 Z" className={c.shade} />
      {/* Escudo frontal esculpido */}
      <path
        d={`M 134 ${SILL}
            L 143 45
            Q 145 37 154 38
            L 162 42
            Q 166 47 163 56
            L 151 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M 146 42 L 154 44 L 146 78 L 141 78 Z" className={c.sheen} />
      {/* Viseira e guiador */}
      <path d="M 146 39 L 152 30 Q 158 31 159 39 Z" className={c.glass} />
      <rect x="128" y="35" width="24" height="6.2" rx="3.1" className={c.shade} />
      <rect x="82" y="81" width="44" height="5.5" rx="2.75" className={c.shade} />
      <TailLamp x={37} y={64} c={c} w={6.5} h={8} />
      <HeadLamp d="M 155 47 L 166 49 L 164 57 L 154 55 Z" c={c} />
      <Wheel x={rear} r={16.5} c={c} />
      <Wheel x={front} r={16.5} c={c} />
    </g>
  );
}

// — Carrinhas e autocarros ————————————————————————————————————————————————————

/**
 * A carrinha da casa (Toyota Hiace): serve para Hiace, Candongueiro (com grelha
 * e letreiro) e Carga (painel fechado).
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
            Q 189 ${SILL} 181 ${SILL}${sole(axles, 19.5)}
            L 22 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M 146 37 L 169 57 H 146 Z" className={c.glass} />
      <GlassGlint x={148} y={38} h={18} c={c} w={6} />
      {panel ? (
        <>
          <path d="M 118 37 H 141 V 57 H 118 Z" className={c.glass} />
          <Seam d="M 114 33 V 82" c={c} />
          <Seam d="M 143 37 V 57" c={c} w={1.8} />
          <Seam d="M 32 64 H 108 M 32 71 H 108" c={c} w={1.6} />
        </>
      ) : (
        <>
          <path d="M 120 37 H 141 V 57 H 120 Z" className={c.glass} />
          <rect x="96" y="37" width="20" height="20" rx="3" className={c.glass} />
          <rect x="68" y="37" width="24" height="20" rx="3" className={c.glass} />
          <rect x="30" y="37" width="34" height="20" rx="3" className={c.glass} />
          <GlassGlint x={100} y={37.5} h={19} c={c} w={6} />
          <GlassGlint x={40} y={37.5} h={19} c={c} w={7} />
          <Seam d="M 118 34 V 82" c={c} />
          <Seam d="M 93 34 V 82" c={c} />
          <Seam d="M 66 62 H 118" c={c} w={1.8} />
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

/** Autocarro urbano: frente direita, faixa panorâmica de vidro, duas portas e AC. */
function Bus({ c }: { c: Ink }) {
  const axles = [166, 54];
  return (
    <g>
      <rect x="58" y="20" width="66" height="7.5" rx="3.75" className={c.shade} />
      <path
        d={`M 18 ${SILL} V 36 Q 18 26 29 26 H 176 Q 190 26 194 38 L 197 52 V 79
            Q 197 ${SILL} 189 ${SILL}${sole(axles, 19)} L 18 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect x="28" y="34" width="150" height="24" rx="3" className={c.glass} />
      <GlassGlint x={40} y={34.5} h={23} c={c} w={8} />
      <GlassGlint x={106} y={34.5} h={23} c={c} w={8} />
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
      {/* carga arrumada na caixa aberta */}
      <rect x="27" y="44" width="38" height="19" rx="3" className={c.shade} />
      <rect x="69" y="49" width="23" height="14" rx="3" className={c.shade} />
      <path
        d={`M 20 ${SILL} V 58 H 98 L 107 37 Q 109 35 114 35 H 144 Q 148 35 151 39 L 161 55 L 184 56
            Q 196 57 197 66 L 197 79 Q 197 ${SILL} 189 ${SILL}${sole(axles, 19.5)}
            L 20 ${SILL} Z`}
        className={`${c.body} ${c.edge}`}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d={`M 20 ${SILL} V 58 H 98 V ${SILL} Z`} className={`${c.body} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M 106 53 L 112 40 H 127 V 53 Z" className={c.glass} />
      <path d="M 131 40 H 143 L 152 53 H 131 Z" className={c.glass} />
      <GlassGlint x={134} y={40.5} h={12} c={c} w={6} />
      <Seam d="M 129 38 V 55" c={c} />
      <Seam d="M 98 58 V 80" c={c} />
      <Seam d="M 28 65 H 92" c={c} w={1.5} />
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
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect x="22" y="34" width="120" height="46" rx="3" className={c.shade} opacity={0.48} />
      {[44, 66, 88, 110, 132].map((x) => (
        <Seam key={x} d={`M ${x} 34 V 78`} c={c} w={1.8} />
      ))}
      <path d="M 186 42 H 195 V 58 H 186 Z" className={c.glass} />
      <path d="M 154 42 H 180 V 58 H 154 Z" className={c.glass} />
      <GlassGlint x={160} y={42.5} h={15} c={c} w={6} />
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
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect x="18" y="28" width="126" height="48" rx="3" className={c.shade} opacity={0.48} />
      <Seam d="M 144 28 V 74" c={c} w={2} />
      {[46, 74, 102, 130].map((x) => (
        <Seam key={x} d={`M ${x} 28 V 74`} c={c} w={1.8} />
      ))}
      <path d="M 164 22 H 184 Q 194 22 197 32 L 199 46 H 164 Z" className={c.glass} />
      <GlassGlint x={170} y={22.5} h={23} c={c} w={7} />
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
  <g>
    <rect x="12" y={GROUND} width="196" height="3.2" rx="1.6" className={c.road} />
    <rect x="34" y={GROUND + 5.2} width="32" height="1.8" rx="0.9" className={c.road} opacity="0.5" />
    <rect x="86" y={GROUND + 5.2} width="46" height="1.8" rx="0.9" className={c.road} opacity="0.5" />
    <rect x="152" y={GROUND + 5.2} width="26" height="1.8" rx="0.9" className={c.road} opacity="0.5" />
  </g>
);
