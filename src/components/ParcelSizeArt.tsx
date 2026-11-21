import type { ReactNode } from 'react';
import { ACTIVE, INK } from './VehicleArt';
import type { Ink } from './vehicleShapes';

/**
 * O tamanho da encomenda, desenhado como encomenda.
 *
 * Nas categorias de entrega o que a pessoa escolhe é o TAMANHO da carga, não o
 * veículo — mostrar uma carrinha não a ajuda a decidir entre «documento» e
 * «caixa grande». Três volumes na mesma prancha, do mais pequeno ao maior, com
 * a mesma tinta e o mesmo chão das outras figuras.
 */
export type ParcelLevel = 0 | 1 | 2;

const Shadow = () => (
  <g>
    <ellipse cx="80" cy="86" rx="54" ry="4" className="fill-black/[0.06] dark:fill-black/25" />
    <ellipse cx="80" cy="86.5" rx="40" ry="2.2" className="fill-black/[0.09] dark:fill-black/40" />
  </g>
);

const Ground = ({ c }: { c: Ink }) => (
  <rect x="10" y="88" width="140" height="3" rx="1.5" className={c.road} />
);

/** 0 — envelope acolchoado: documentos e objectos planos com selo dourado. */
const Envelope = ({ c }: { c: Ink }) => (
  <g>
    {/* sombra de profundidade lateral (efeito 2.5D) */}
    <rect x="40" y="51" width="80" height="37" rx="7" className={`${c.shade} ${c.edge}`} strokeWidth="1.4" />
    <rect x="44" y="48" width="76" height="38" rx="6" className={`${c.body} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
    {/* aba dobrada */}
    <path d="M 46 50 L 82 70 L 118 50" className={c.seam} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {/* selo / lacre de segurança */}
    <circle cx="82" cy="69" r="5.5" className={c.front} />
    <circle cx="82" cy="69" r="2.2" className={c.glass} />
    {/* etiqueta de destinatário */}
    <rect x="52" y="69" width="22" height="11" rx="2.5" className={c.glass} />
    <path d="M 55 73 H 70 M 55 76.5 H 66" className={c.seam} strokeWidth={1.6} strokeLinecap="round" />
  </g>
);

/** 1 — caixa média 2.5D: tampa biselada, fita vertical e código de barras. */
const Box = ({ c }: { c: Ink }) => (
  <g>
    {/* face lateral sombreada para dar volume 2.5D */}
    <path d="M 42 44 L 52 36 H 112 L 104 44 Z" className={`${c.shade} ${c.edge}`} strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M 104 44 L 112 36 V 80 L 104 88 Z" className={`${c.shade} ${c.edge}`} strokeWidth="1.4" strokeLinejoin="round" />
    {/* face frontal */}
    <rect x="42" y="44" width="62" height="44" rx="4" className={`${c.body} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
    {/* fita de embalagem */}
    <path d="M 68 44 L 76 36 H 86 L 78 44 Z" className={c.glass} />
    <rect x="68" y="44" width="10" height="44" className={c.glass} />
    {/* etiqueta de envio */}
    <rect x="82" y="61" width="17" height="14" rx="2.5" className={c.glass} />
    <path d="M 85 65 H 96 M 85 69 H 93 M 85 72 H 95" className={c.seam} strokeWidth={1.5} strokeLinecap="round" />
    {/* marca «este lado para cima» */}
    <path d="M 50 75 l 4.5 -7 4.5 7 z" className={c.front} />
    <rect x="50" y="77" width="9" height="2" rx="1" className={c.front} />
  </g>
);

/** 2 — dois volumes empilhados com cintas e profundidade. */
const Double = ({ c }: { c: Ink }) => (
  <g>
    {/* caixa traseira alta */}
    <path d="M 32 34 L 40 28 H 84 L 78 34 Z" className={`${c.shade} ${c.edge}`} strokeWidth="1.4" strokeLinejoin="round" />
    <rect x="32" y="34" width="46" height="54" rx="4" className={`${c.shade} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="50" y="34" width="8" height="54" className={c.glass} opacity="0.65" />
    {/* caixa frontal larga em 2.5D */}
    <path d="M 68 48 L 76 42 H 128 L 120 48 Z" className={`${c.sheen} ${c.edge}`} strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M 120 48 L 128 42 V 82 L 120 88 Z" className={`${c.shade} ${c.edge}`} strokeWidth="1.4" strokeLinejoin="round" />
    <rect x="68" y="48" width="52" height="40" rx="4" className={`${c.body} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="89" y="48" width="10" height="40" className={c.glass} />
    <rect x="103" y="64" width="13" height="11" rx="2" className={c.glass} />
    <path d="M 74 76 l 4 -6 4 6 z" className={c.front} />
  </g>
);

const ART: Record<ParcelLevel, (p: { c: Ink }) => ReactNode> = {
  0: Envelope,
  1: Box,
  2: Double,
};

/**
 * O tamanho lê-se pelo id da categoria, não pela posição na fila: se a equipa
 * acrescentar uma categoria no meio, a ilustração não muda de tamanho por
 * acidente. É a mesma tabela que o servidor semeia (`tr_delivery_class`).
 */
const BY_ID: Record<string, ParcelLevel> = {
  documento: 0,
  pequeno: 1,
  caixa: 1,
  volume: 2,
  recolha: 2,
  canter: 2,
  moveis: 2,
  mercadoria: 2,
};

/** Um id desconhecido cai no tamanho médio, e não numa caixa de sapatos. */
export function parcelLevelFor(id: string): ParcelLevel {
  return BY_ID[id] ?? 1;
}

interface ParcelSizeArtProps {
  level: ParcelLevel;
  tone?: 'idle' | 'active';
  className?: string;
  label?: string;
}

export function ParcelSizeArt({ level, tone = 'idle', className, label }: ParcelSizeArtProps) {
  const c: Ink = tone === 'active' ? ACTIVE : INK;
  const Art = ART[level];
  return (
    <svg
      viewBox="0 0 160 96"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      className={className}
    >
      {label ? <title>{label}</title> : null}
      <Shadow />
      <Art c={c} />
      <Ground c={c} />
    </svg>
  );
}
