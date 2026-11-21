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
 * Os quatro ícones unificados da barra de navegação — mesma grelha óptica
 * 24×24, traço minimalista uniforme (1.85 px em repouso), extremidades suaves
 * e preenchimento duotone limpo quando a aba está activa. Escalam sem perder
 * nitidez entre 16 px e 32 px em ambos os temas.
 */
export interface NavIconProps {
  active?: boolean;
  className?: string;
}

interface GlyphProps extends NavIconProps {
  children: ReactNode;
}

function Glyph({ className, children }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      shapeRendering="geometricPrecision"
      className={cn('h-[22px] w-[22px] shrink-0', className)}
    >
      {children}
    </svg>
  );
}

/**
 * Início — sedan de perfil minimalista esculpido na grelha 24×24 (silhueta
 * limpa inspirada em `mdi-car-side`): traço geométrico nítido em repouso,
 * carroçaria duotone com vidros recortados e cavas de roda definidas quando
 * activo.
 */
export function NavCarIcon({ active, className }: NavIconProps) {
  if (active) {
    return (
      <Glyph className={className}>
        {/* Carroçaria sólida com vidros vazados (evenodd) e cavas de roda limpas */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="currentColor"
          d="M7.35 6h7.1c.82 0 1.58.4 2.04 1.08l2.16 3.17h1.45c1.16 0 2.1.94 2.1 2.1v2.9c0 .55-.45 1-1 1h-.92a3.05 3.05 0 0 0-5.76 0H9.48a3.05 3.05 0 0 0-5.76 0H2.8c-.55 0-1-.45-1-1v-2.45c0-1.1.74-2.06 1.8-2.34l1.1-.29 1.73-2.98C6.84 6.45 7.57 6 8.38 6H7.35Zm.95 1.8L6.62 10.2h4.78V7.8H8.3Zm4.65 0v2.4h4.18l-1.58-2.4h-2.6Z"
        />
        {/* Rodas com aro vazado subtil para leitura imediata em 22 px */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="currentColor"
          d="M6.6 14.3a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Zm0 1.45a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="currentColor"
          d="M17.4 14.3a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Zm0 1.45a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z"
        />
      </Glyph>
    );
  }
  return (
    <Glyph className={className}>
      <path
        d="M4.2 16.5H3a.9.9 0 0 1-.9-.9v-2.3c0-.96.64-1.8 1.58-2.04l1.17-.3 1.7-2.98A2.2 2.2 0 0 1 8.46 6.8h6.04a2.2 2.2 0 0 1 1.82.96l2.13 3.14h1.65a1.9 1.9 0 0 1 1.9 1.9v2.8a.9.9 0 0 1-.9.9h-1.3"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.9 16.5h6.2"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <path
        d="M5.4 10.9h12.8M11.6 7v3.9"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <circle cx="6.6" cy="16.5" r="2.1" stroke="currentColor" strokeWidth="1.85" />
      <circle cx="17.4" cy="16.5" r="2.1" stroke="currentColor" strokeWidth="1.85" />
    </Glyph>
  );
}

/**
 * Viagens — partida e destino ligados por um percurso contínuo em S, com halo
 * de destino e ponto sólido quando activo.
 */
export function NavRouteIcon({ active, className }: NavIconProps) {
  return (
    <Glyph className={className}>
      <path
        d="M7.8 18.4h4.9a3.25 3.25 0 0 0 0-6.5h-1.4a3.25 3.25 0 0 1 0-6.5h4.5"
        stroke="currentColor"
        strokeWidth={active ? '2.25' : '1.85'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="5.4"
        cy="18.4"
        r="2.2"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.85"
      />
      {active && <circle cx="18.4" cy="5.4" r="4.1" fill="currentColor" fillOpacity="0.2" />}
      <circle
        cx="18.4"
        cy="5.4"
        r="2.3"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.85"
      />
      {!active && <circle cx="18.4" cy="5.4" r="0.7" fill="currentColor" />}
    </Glyph>
  );
}

/**
 * Carteira — pasta geométrica com aba superior subtil e fecho lateral de
 * precisão, em contorno fino ou preenchimento sólido recortado.
 */
export function NavWalletIcon({ active, className }: NavIconProps) {
  if (active) {
    return (
      <Glyph className={className}>
        <path
          d="M5.4 4.5h11.8a1.5 1.5 0 0 1 1.5 1.5v1.2H5.4a2 2 0 0 1-2-2c0-.39.31-.7.7-.7h1.3Z"
          fill="currentColor"
          fillOpacity="0.32"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="currentColor"
          d="M5.2 7.1h14.1a2.2 2.2 0 0 1 2.2 2.2v8.2a2.2 2.2 0 0 1-2.2 2.2H5.5a2.5 2.5 0 0 1-2.5-2.5V6.6a2.1 2.1 0 0 1 2.1-2.1h11.1a.9.9 0 1 1 0 1.8H5.2a.4.4 0 0 0 0 .8Zm11.4 4.8a1.65 1.65 0 1 0 0 3.3h3.2a1.65 1.65 0 1 0 0-3.3h-3.2Z"
        />
        <circle cx="16.8" cy="13.55" r="0.95" fill="currentColor" />
      </Glyph>
    );
  }
  return (
    <Glyph className={className}>
      <path
        d="M18.8 7.2V5.9a1.5 1.5 0 0 0-1.5-1.5H5.5A2.5 2.5 0 0 0 3 6.9v10.4a2.5 2.5 0 0 0 2.5 2.5h13.6a2.1 2.1 0 0 0 2.1-2.1V9.3a2.1 2.1 0 0 0-2.1-2.1H5.5A2.3 2.3 0 0 1 3.2 6.6"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="15.2"
        y="11.6"
        width="6"
        height="3.8"
        rx="1.9"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="17.3" cy="13.5" r="0.85" fill="currentColor" />
    </Glyph>
  );
}

/**
 * Perfil — busto minimalista de proporções equilibradas: contorno fino em
 * repouso, silhueta sólida limpa quando activo (sem sobreposição pesada).
 */
export function NavUserIcon({ active, className }: NavIconProps) {
  if (active) {
    return (
      <Glyph className={className}>
        <circle cx="12" cy="7.6" r="3.75" fill="currentColor" />
        <path
          d="M4.4 19.35c0-3.55 3.4-5.95 7.6-5.95s7.6 2.4 7.6 5.95c0 .75-.6 1.35-1.35 1.35H5.75c-.75 0-1.35-.6-1.35-1.35Z"
          fill="currentColor"
        />
      </Glyph>
    );
  }
  return (
    <Glyph className={className}>
      <circle cx="12" cy="7.6" r="3.55" stroke="currentColor" strokeWidth="1.85" />
      <path
        d="M4.6 19.75c0-3.5 3.3-5.95 7.4-5.95s7.4 2.45 7.4 5.95"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </Glyph>
  );
}
