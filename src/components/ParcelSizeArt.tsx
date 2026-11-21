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
  <ellipse cx="80" cy="86" rx="50" ry="3.5" className="fill-black/[0.07] dark:fill-black/30" />
);

const Ground = ({ c }: { c: Ink }) => (
  <rect x="10" y="88" width="140" height="3" rx="1.5" className={c.road} />
);

/** 0 — envelope acolchoado: documentos e objectos planos. */
const Envelope = ({ c }: { c: Ink }) => (
  <g>
    <rect x="42" y="52" width="76" height="36" rx="6" className={`${c.body} ${c.edge}`} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M 42 58 L 80 76 L 118 58" className={c.seam} strokeWidth={2.2} fill="none" />
    <rect x="80" y="52" width="14" height="36" className={c.glass} />
    <rect x="50" y="62" width="20" height="14" rx="2" className={c.glass} />
  </g>
);

/** 1 — caixa média: o volume do dia a dia. */
const Box = ({ c }: { c: Ink }) => (
  <g>
    <rect x="46" y="44" width="68" height="44" rx="5" className={`${c.body} ${c.edge}`} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M 46 56 H 114" className={c.seam} strokeWidth={2.2} fill="none" />
    <rect x="74" y="44" width="12" height="44" className={c.glass} />
    <rect x="90" y="60" width="18" height="14" rx="2" className={c.glass} />
    <path d="M 54 72 l 5 -7 5 7 z" className={c.front} />
  </g>
);

/** 2 — dois volumes: móveis pequenos e cargas de várias peças. */
const Double = ({ c }: { c: Ink }) => (
  <g>
    <rect x="34" y="36" width="50" height="52" rx="5" className={`${c.shade} ${c.edge}`} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M 59 36 V 88" className={c.seam} strokeWidth={2} fill="none" />
    <rect x="76" y="48" width="56" height="40" rx="5" className={`${c.body} ${c.edge}`} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M 76 59 H 132" className={c.seam} strokeWidth={2} fill="none" />
    <rect x="98" y="48" width="11" height="40" className={c.glass} />
    <rect x="112" y="64" width="15" height="12" rx="2" className={c.glass} />
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
