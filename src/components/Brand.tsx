import { cn } from '../lib/utils';
import { ElaraCarMark } from './ElaraCarMark';

interface BrandProps {
  dark: boolean;
  className?: string;
}

/**
 * A assinatura da casa: a marca e o nome em versaletes espaçadas, como no
 * referencial.
 *
 * Vive em dois sítios conforme o ecrã. No telemóvel abre a barra de topo, à
 * esquerda dos botões. No PC abre a coluna de navegação — sem isto o canto
 * superior esquerdo fica um quadrado branco ao lado da marca, e a marca fica
 * a meio do ecrã, a fluturar sobre o mapa.
 */
export function Brand({ dark, className }: BrandProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <span className="h-9 w-9 shrink-0">
        <ElaraCarMark dark={dark} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-bold leading-none tracking-[0.22em] text-zinc-900 dark:text-white">
          ELARA
        </p>
        <p className="mt-1 text-[10px] font-semibold leading-none tracking-[0.3em] text-purple-700 dark:text-amber-400">
          Ulyatila
        </p>
      </div>
    </div>
  );
}
