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
import { VehicleArt, INK, ACTIVE, type VehicleKind } from './VehicleArt';
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
 * Entrega: duas caixas 2.5D empilhadas, com tampa biselada, fita vertical,
 * etiqueta de código de barras e seta «para cima».
 */
const Parcel = ({ c }: { c: Ink }) => (
  <g>
    {/* caixa traseira */}
    <path d="M 38 58 L 48 50 H 98 L 90 58 Z" className={`${c.shade} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="38" y="58" width="52" height="46" rx="4" className={`${c.shade} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="59" y="58" width="9" height="46" className={c.glass} opacity="0.65" />
    {/* caixa frontal em 2.5D */}
    <path d="M 78 44 L 90 34 H 174 L 162 44 Z" className={`${c.sheen} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M 162 44 L 174 34 V 94 L 162 104 Z" className={`${c.shade} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="78" y="44" width="84" height="60" rx="5" className={`${c.body} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
    {/* fita central contínua na tampa e na frente */}
    <path d="M 112 44 L 124 34 H 138 L 126 44 Z" className={c.glass} />
    <rect x="112" y="44" width="14" height="60" className={c.glass} />
    {/* etiqueta de envio */}
    <rect x="132" y="64" width="24" height="22" rx="3" className={c.glass} />
    <path d="M 136 71 H 152 M 136 76 H 148 M 136 81 H 151" className={c.seam} strokeWidth={1.8} strokeLinecap="round" />
    {/* indicador «para cima» */}
    <path d="M 90 85 l 6 -9 6 9 z" className={c.front} />
    <rect x="90" y="88" width="12" height="2.4" rx="1.2" className={c.front} />
  </g>
);

/**
 * Aluguer: comando inteligente Elara com argola metálica, lâmina fresada para
 * a direita e botões tácteis em relevo.
 */
const Key = ({ c }: { c: Ink }) => (
  <g>
    {/* argola do porta-chaves à esquerda */}
    <circle cx="38" cy="70" r="11" fill="none" className={c.line} strokeWidth="4" />
    {/* lâmina fresada a apontar para a direita */}
    <path
      d="M 106 60 H 188 L 194 65 L 188 70 H 176 V 78 H 167 V 70 H 154 V 78 H 145 V 70 H 106 Z"
      className={`${c.shade} ${c.edge}`}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M 114 65 H 184" className={c.glint} strokeWidth="2.2" strokeLinecap="round" />
    {/* corpo esculpido do comando */}
    <rect x="44" y="44" width="66" height="54" rx="16" className={`${c.body} ${c.edge}`} strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="49" y="48" width="56" height="10" rx="5" className={c.sheen} />
    {/* olhal da argola */}
    <circle cx="57" cy="59" r="5" className={c.glass} />
    {/* botões tácteis: abrir, fechar, bagageira */}
    <rect x="74" y="54" width="26" height="13" rx="4.5" className={c.glass} />
    <rect x="74" y="71" width="26" height="11" rx="4" className={c.front} />
    <rect x="52" y="71" width="16" height="18" rx="4.5" className={c.shade} />
    {/* LED de sinal no topo do comando */}
    <circle cx="96" cy="89" r="2.6" className={c.front} />
  </g>
);

interface ServiceArtProps {
  id: ServiceArtId;
  tone?: 'idle' | 'active';
  className?: string;
  /** Sem rótulo o desenho é decorativo e o leitor de ecrã passa por ele. */
  label?: string;
}

export function ServiceArt({ id, tone = 'idle', className, label }: ServiceArtProps) {
  const kind = VEHICLE[id];
  if (kind) return <VehicleArt kind={kind} tone={tone} className={className} label={label} />;

  const c: Ink = tone === 'active' ? ACTIVE : INK;
  return (
    <svg
      viewBox="0 0 220 120"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      className={className}
    >
      {label ? <title>{label}</title> : null}
      <ellipse cx="110" cy="102" rx="74" ry="4.5" className="fill-black/[0.07] dark:fill-black/30" />
      {id === 'entrega' ? <Parcel c={c} /> : <Key c={c} />}
      <Road c={c} />
    </svg>
  );
}
