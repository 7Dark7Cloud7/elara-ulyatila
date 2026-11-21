/**
 * A figura de cada porta do ecrã principal.
 *
 * Não é uma família à parte: as quatro portas de veículo mostram o MESMO
 * vector do `VehicleArt` (o carro da Viagem é o sedan que se escolhe depois, a
 * Partilhar é a Hiace, a Mudança é o Canter), e as duas que não são veículo —
 * a caixa da Entrega e a chave do Aluguer — são desenhadas na mesma prancha
 * 220 × 120, com a mesma tinta e a mesma linha de chão. Quem olha para a grelha
 * vê um só conjunto porque é um só conjunto.
 *
 * As duas figuras sem rodas seguem a regra dos veículos: frente para a
 * DIREITA, apoiadas no chão a y=104, e uma silhueta que se lê a 44 px de alto —
 * é a essa altura que aparecem na grelha de serviços.
 */
import type { ReactNode } from 'react';
import { VehicleArt, INK, type VehicleKind } from './VehicleArt';
import { Road, type Ink } from './vehicleShapes';

export type ServiceArtId = 'carro' | 'moto' | 'partilha' | 'entrega' | 'mudanca' | 'alugar';

/** Porta → a categoria que a app desenha noutros sítios. */
const VEHICLE: Partial<Record<ServiceArtId, VehicleKind>> = {
  carro: 'sedan',
  moto: 'moto',
  partilha: 'minibus',
  mudanca: 'boxtruck',
};

/**
 * Entrega: duas caixas empilhadas lado a lado, a de trás mais pequena e mais
 * escura para dar profundidade. A faixa de fita e as duas setas de «para cima»
 * são o que faz a figura ler-se como carga e não como um cubo.
 */
const Parcel = ({ c }: { c: Ink }) => (
  <g>
    {/* a caixa de trás */}
    <rect x="38" y="60" width="58" height="44" rx="4" className={`${c.shade} ${c.edge}`} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M 64 60 V 104" className={c.seam} strokeWidth={2.2} fill="none" />
    {/* a caixa da frente */}
    <rect x="80" y="42" width="92" height="62" rx="5" className={`${c.body} ${c.edge}`} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M 80 56 H 172" className={c.seam} strokeWidth={2.2} fill="none" />
    {/* fita: a luz vertical que segura a tapa */}
    <rect x="112" y="42" width="14" height="62" className={c.glass} />
    {/* etiqueta de envio */}
    <rect x="136" y="64" width="30" height="22" rx="3" className={c.glass} />
    <path d="M 141 71 H 161 M 141 77 H 156" className={c.seam} strokeWidth={2} fill="none" />
    {/* setas de «esta direcção para cima» */}
    <path d="M 92 84 l 6 -9 6 9 z" className={c.front} />
  </g>
);

/**
 * Aluguer: uma chave com comando. A lâmina sai para a DIREITA, a mesma direcção
 * dos veículos, com dois dentes recortados na chapa — é o que a distingue de
 * uma régua. O comando cobre a base da lâmina.
 */
const Key = ({ c }: { c: Ink }) => (
  <g>
    <path
      d="M 100 58 H 184 V 68 H 172 V 76 H 164 V 68 H 150 V 76 H 142 V 68 H 100 Z"
      className={`${c.shade} ${c.edge}`}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <rect x="44" y="46" width="64" height="58" rx="15" className={`${c.body} ${c.edge}`} strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="60" cy="60" r="6" className={c.glass} />
    <rect x="76" y="64" width="22" height="14" rx="4" className={c.glass} />
    <rect x="76" y="84" width="22" height="14" rx="4" className={c.front} />
    <rect x="50" y="76" width="18" height="14" rx="4" className={c.shade} />
  </g>
);

interface ServiceArtProps {
  id: ServiceArtId;
  className?: string;
  /** Sem rótulo o desenho é decorativo e o leitor de ecrã passa por ele. */
  label?: string;
}

export function ServiceArt({ id, className, label }: ServiceArtProps) {
  const kind = VEHICLE[id];
  if (kind) return <VehicleArt kind={kind} className={className} label={label} />;

  const c: Ink = INK;
  return (
    <svg
      viewBox="0 0 220 120"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      className={className}
    >
      {label ? <title>{label}</title> : null}
      <ellipse cx="110" cy="100.5" rx="70" ry="4.5" className="fill-black/[0.07] dark:fill-black/30" />
      {id === 'entrega' ? <Parcel c={c} /> : <Key c={c} />}
      <Road c={c} />
    </svg>
  );
}
