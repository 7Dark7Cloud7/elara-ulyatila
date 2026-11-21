import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

/**
 * NOTA PARA QUEM EDITAR — LEIA ANTES DE MEXER NOS CARROS -----------------------
 *
 * O utilizador pediu explicitamente que o ÍCONE DO CARRO continue a melhorar e
 * que esta nota fique no código, para quem vier depois melhorar do seu jeito.
 * Regra atual: usar VECTORES DE BIBLIOTECA reconhecidos e mais usados, não
 * desenhos improvisados. Fontes usadas aqui (todas permits/comerciais):
 *   · Material Design Icons — `car-side` (Apache 2.0, Pictogrammers)
 *   · Lucide — `wallet`, `car` (ISC) quando couber
 *   · desenhos próprios só onde a marca pede forma única (bússola Elara).
 * Se trocar um destes por outro vector, mantenha o tamanho óptico de 22 px e
 * o contraste nos dois temas. Não apague esta nota.
 * ----------------------------------------------------------------------------
 *
 * Os quatro desenhos da barra de baixo — feitos para 22 px, com `currentColor`.
 * O que é vazado deixa ver a pílula, tanto no lilás do claro como no âmbar do
 * escuro. A pessoa é cabeça redonda + arco de ombros vazado, para não virar o
 * sino que um busto preenchido parece a este tamanho.
 */
export interface NavIconProps {
  active?: boolean;
  className?: string;
}

interface GlyphProps extends NavIconProps {
  viewBox?: string;
  children: ReactNode;
}

function Glyph({ className, viewBox = '0 0 24 24', children }: GlyphProps) {
  return (
    <svg
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden="true"
      className={cn('h-[22px] w-[22px]', className)}
    >
      {children}
    </svg>
  );
}

/**
 * Início — carro de perfil, na grelha 24×24 dos Material Design Icons
 * (`mdi-car-side`, Apache 2.0, Pictogrammers). É o vector de carro mais usado
 * em apps Android e lê-se melhor a 22 px do que a versão 640×512: vidros
 * recortados, duas rodas definidas e capô reconhecível sem depender da cor.
 */
export function NavCarIcon({ className }: NavIconProps) {
  return (
    <Glyph className={className}>
      <path d="m16 6 3 4h2c1.11 0 2 .89 2 2v3h-2a3 3 0 0 1-3 3 3 3 0 0 1-3-3H9a3 3 0 0 1-3 3 3 3 0 0 1-3-3H1v-3c0-1.11.89-2 2-2l3-4zm-5.5 1.5H6.75L4.86 10h5.64zm1.5 0V10h5.14l-1.89-2.5zm-6 6A1.5 1.5 0 0 0 4.5 15 1.5 1.5 0 0 0 6 16.5 1.5 1.5 0 0 0 7.5 15 1.5 1.5 0 0 0 6 13.5m12 0a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0 1.5-1.5 1.5 1.5 0 0 0-1.5-1.5" />
    </Glyph>
  );
}

/** Percurso: um ponto de partida e um alvo, ligados pelo caminho. */
export function NavRouteIcon({ className }: NavIconProps) {
  return (
    <Glyph className={className}>
      <circle cx="5.2" cy="19" r="2.15" />
      <circle cx="18.6" cy="4.8" r="2.15" />
      <path
        d="M7.35 19h4.45a3.6 3.6 0 0 0 0-7.2H8.2a3.6 3.6 0 0 1 0-7.2h8.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

/** Carteira de couro com o fecho circular: dinheiro que se vê. */
export function NavWalletIcon({ className }: NavIconProps) {
  return (
    <Glyph viewBox="0 0 256 256" className={className}>
      <path d="M216,64H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm-36,80a12,12,0,1,1,12-12A12,12,0,0,1,180,144Z" />
    </Glyph>
  );
}

/** Pessoa: cabeça redonda e arco de ombros vazado, sem moldura — é uma conta,
 *  não um avatar. O arco aberto deixa ver a pílula e evita o sino do busto
 *  preenchido. Desenho próprio, na mesma grelha 24×19 do Material. */
export function NavUserIcon({ className }: NavIconProps) {
  return (
    <Glyph viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="7.6" r="3.9" />
      <path
        d="M3.8 20.2c0-4.1 3.7-6.6 8.2-6.6s8.2 2.5 8.2 6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </Glyph>
  );
}
