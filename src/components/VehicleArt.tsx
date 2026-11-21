/**
 * Vector de cada categoria.
 *
 * NOTA PARA QUEM EDITAR — OS CARROS DOS CARTÕES TÊM DE MELHORAR ---------------
 * O utilizador pediu que estes desenhos continuem a ser melhorados e que esta
 * nota fique no código, para quem vier depois melhorar do seu jeito. A casa
 * usa VECTORES, nunca fotografias: escalam limpos, pesam bytes e não mostram
 * um carro específico que ninguém nesta praça tem. Quando trocar uma forma
 * por outra (Lucide / Material / Font Awesome são as famílias de referência),
 * mantenha a prancha comum 220×120, o chão em y=104 e a frente à direita —
 * é isso que faz os doze veículos parecerem uma única frota.
 * ---------------------------------------------------------------------------
 *
 * Uma família, não doze desenhos: as silhuetas vivem em `vehicleShapes.tsx`
 * sobre a mesma prancha (220 × 120, chão a y=104, frente para a direita) e
 * este ficheiro dá-lhes as cores. São dois conjuntos de cores porque há duas
 * maneiras de aparecer: no cartão normal, e no cartão escolhido, que é roxo no
 * modo claro e âmbar no escuro — um desenho que não trocar de roupa fica
 * invisível em um dos dois.
 */
import type { ReactNode } from 'react';
import { Road, SHAPES, type Ink, type VehicleKind } from './vehicleShapes';

export type { VehicleKind } from './vehicleShapes';

/**
 * O que cada papel do desenho quer dizer, em classes da paleta Elara.
 *
 * O pneu é escuro nos dois temas e o aro claro: é o par que se lê a 24 px, que
 * é o tamanho em que o painel do motorista mostra a categoria da corrida.
 * Sai daqui também para as figuras sem rodas (`ServiceArt`) usarem as mesmas
 * cores: a porta da Entrega é do mesmo mundo que o carro da Viagem.
 */
export const INK: Ink = {
  body: 'fill-purple-600 dark:fill-purple-400',
  edge: 'stroke-purple-900/35 dark:stroke-black/45',
  shade: 'fill-purple-700 dark:fill-purple-600',
  glass: 'fill-white/90 dark:fill-zinc-100/85',
  tyre: 'fill-zinc-800',
  rim: 'fill-zinc-200 dark:fill-zinc-100',
  road: 'fill-zinc-300 dark:fill-zinc-600',
  seam: 'stroke-zinc-900/25 dark:stroke-zinc-950/50',
  front: 'fill-amber-400 dark:fill-amber-300',
  back: 'fill-red-500 dark:fill-red-400',
  line: 'stroke-purple-600 dark:stroke-purple-400',
};

// No cartão escolhido o fundo passa a ser roxo (claro) ou âmbar (escuro): o
// veículo inverte-se — branco sobre roxo, tinta sobre ouro — e os vidros passam
// a ser a cor do fundo a deixá-la aparecer por trás.
export const ACTIVE: Ink = {
  body: 'fill-white dark:fill-ink',
  edge: 'stroke-purple-900/40 dark:stroke-black/50',
  shade: 'fill-purple-200 dark:fill-white/25',
  glass: 'fill-purple-800/45 dark:fill-amber-100/70',
  tyre: 'fill-purple-950/70 dark:fill-ink',
  rim: 'fill-white/85 dark:fill-amber-200',
  road: 'fill-white/45 dark:fill-ink/35',
  seam: 'stroke-purple-900/30 dark:stroke-white/30',
  front: 'fill-amber-300 dark:fill-white',
  back: 'fill-red-300 dark:fill-red-500',
  line: 'stroke-white dark:stroke-ink',
};

interface VehicleArtProps {
  kind: VehicleKind;
  /** 'active' = desenhado para um cartão preenchido. */
  tone?: 'idle' | 'active';
  className?: string;
  /** Sem rótulo o desenho é decorativo e o leitor de ecrã passa por ele. */
  label?: string;
}

export function VehicleArt({ kind, tone = 'idle', className, label }: VehicleArtProps) {
  const c = tone === 'active' ? ACTIVE : INK;
  const art: ReactNode = SHAPES[kind](c);
  return (
    <svg
      viewBox="0 0 220 120"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      className={className}
    >
      {label ? <title>{label}</title> : null}
      {/* A sombra no chão é o que separa o vector do papel: sem ela a silhueta
          flutua e o desenho lê-se como ícone, não como veículo. */}
      <ellipse cx="110" cy="100.5" rx="74" ry="4.5" className="fill-black/[0.07] dark:fill-black/30" />
      {art}
      <Road c={c} />
    </svg>
  );
}

const BY_CLASS: Record<string, VehicleKind> = {
  economico: 'sedan',
  conforto: 'premium',
  xl: 'suv',
  taxi: 'hatch',
  candongueiro: 'candongueiro',
  moto: 'moto',
  hiace: 'minibus',
  autocarro: 'bus',
  carga: 'van',
  picape: 'pickup',
  recolha: 'pickup',
  canter: 'boxtruck',
  camiao: 'lorry',
  mercadoria: 'lorry',
};

const BY_ICON: Record<string, VehicleKind> = {
  Car: 'sedan', Bike: 'moto', Taxi: 'hatch', Armchair: 'premium',
  Users: 'suv', Van: 'minibus', Bus: 'bus', Truck: 'boxtruck',
};

/** Primeiro o id (estável, vem do seed), depois o ícone que a base traz. */
export const vehicleKindFor = (classId: string, icon?: string): VehicleKind =>
  BY_CLASS[classId] ?? BY_ICON[icon ?? ''] ?? 'sedan';
