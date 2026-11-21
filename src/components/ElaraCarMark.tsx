import { useId } from 'react';
import { cn } from '../lib/utils';

interface ElaraCarMarkProps {
  dark: boolean;
  className?: string;
}

/**
 * NOTA PARA QUEM EDITAR — O LOGÓTIPO TEM DE CONTINUAR A MELHORAR ---------------
 *
 * O pedido do utilizador: «essa logo mas dentro de um carro» — a bússola Elara
 * ao centro de um carro de FRENTE, dentro de um emblema. Foi pedido também que
 * esta nota fique no código para quem vier depois melhorar do seu jeito.
 *
 * Regras para não estragar a marca:
 *  1. O desenho Elara (bússola de traço + diamante lilás) vai SEMPRE no meio,
 *     recortado do PNG original (160×160, conteúdo x 31..128, y 17..142) pelo
 *     `<svg viewBox>` interior — nunca o estique para fora do emblema.
 *  2. Há duas variantes de ficheiro: `elara-mark.png` (escuro, sobre creme) e
 *     `elara-mark-dark.png` (claro, sobre noite). O carro e o emblema trocam de
 *     roupa no mesmo gesto — não use só uma variante nos dois temas.
 *  3. Use vector (path), não foto: escala limpa a 36 px e peso de poucos bytes.
 *  4. Se trocar o carro por outro vector reconhecido (Lucide / Material / Font
 *     Awesome), mantenha o emblema legível e as duas variantes de tema.
 * ----------------------------------------------------------------------------
 */
export function ElaraCarMark({ dark, className }: ElaraCarMarkProps) {
  const uid = useId().replace(/:/g, '');
  const bodyGrad = `elara-body-${uid}`;
  const glassGrad = `elara-glass-${uid}`;
  const ringGrad = `elara-ring-${uid}`;

  const bodyTop = dark ? '#F6E4C4' : '#7C5CE6';     // amber-200 / purple-500
  const bodyBot = dark ? '#C89B68' : '#4B27A4';     // amber-600 / purple-700
  const glassTop = dark ? '#FDF9F0' : '#E3D8FA';    // amber-50  / purple-200
  const glassBot = dark ? '#E7CFA6' : '#A98FEA';    // amber-400 / purple-400
  const badge = dark ? '#1B0B38' : '#FAF7F0';       // night     / cream
  const ringA = dark ? '#FBF1DE' : '#7C5CE6';       // highlight ring
  const ringB = dark ? '#A87B4A' : '#3A1C80';       // shadow ring
  const wheel = dark ? '#C89B68' : '#2A1254';       // amber-600 / ink
  const trim = dark ? '#1B0B38' : '#2A1254';        // grille / intake recess
  const lamp = dark ? '#FDF9F0' : '#FAF7F0';        // crisp LED blade
  const mark = dark ? '/elara-mark-dark.png' : '/elara-mark.png';

  return (
    <svg viewBox="0 0 64 64" className={cn('block h-full w-full', className)} aria-hidden="true">
      <defs>
        <linearGradient id={bodyGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bodyTop} />
          <stop offset="100%" stopColor={bodyBot} />
        </linearGradient>
        <linearGradient id={glassGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={glassTop} />
          <stop offset="100%" stopColor={glassBot} />
        </linearGradient>
        <linearGradient id={ringGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={ringA} />
          <stop offset="100%" stopColor={ringB} />
        </linearGradient>
      </defs>

      {/* sombra subtil sob o chassis para assentar o carro no emblema */}
      <ellipse cx="32" cy="57.5" rx="24" ry="2.6" fill={trim} opacity={dark ? 0.35 : 0.16} />

      {/* retrovisores aerodinâmicos encostados aos pilares A */}
      <path d="M5.5 27.5 C5.5 25.5 7 24.5 9.5 24.5 H13.5 L12.5 29.5 H8 C6.4 29.5 5.5 28.8 5.5 27.5 Z" fill={`url(#${bodyGrad})`} />
      <path d="M58.5 27.5 C58.5 25.5 57 24.5 54.5 24.5 H50.5 L51.5 29.5 H56 C57.6 29.5 58.5 28.8 58.5 27.5 Z" fill={`url(#${bodyGrad})`} />

      {/* pneus largos e assentes na mesma linha de chão */}
      <rect x="6.5" y="45" width="11" height="11.5" rx="4.2" fill={wheel} />
      <rect x="46.5" y="45" width="11" height="11.5" rx="4.2" fill={wheel} />

      {/* carroçaria esculpida de frente: tejadilho baixo, ombros firmes e guarda-lamas */}
      <path
        d="M11.5 28.5 L15.8 16.5 C17.3 12.6 20.8 11 26 11 H38 C43.2 11 46.7 12.6 48.2 16.5 L52.5 28.5
           L57.8 31.6 C60.2 33 61.2 35.4 61.2 38.4 V46.2 C61.2 49.4 59 51.5 55.8 51.5
           H8.2 C5 51.5 2.8 49.4 2.8 46.2 V38.4 C2.8 35.4 3.8 33 6.2 31.6 Z"
        fill={`url(#${bodyGrad})`}
      />

      {/* linha de brilho subtil no topo do capô */}
      <path
        d="M14 29.5 Q32 27.2 50 29.5"
        fill="none"
        stroke={lamp}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity={dark ? 0.55 : 0.35}
      />

      {/* pára-brisas inclinado com reflexo diagonal de vidro */}
      <path
        d="M16.5 26.8 L19.8 17.5 C20.6 15.4 22.3 14.6 25.2 14.6 H38.8 C41.7 14.6 43.4 15.4 44.2 17.5 L47.5 26.8 Z"
        fill={`url(#${glassGrad})`}
      />
      <path
        d="M21 26.8 L26.5 14.6 H31.2 L25.7 26.8 Z"
        fill="#FFFFFF"
        opacity={dark ? 0.35 : 0.45}
      />

      {/* faróis LED de assinatura dupla, inclinados para o centro */}
      <path d="M6.8 35.6 L16.4 37.8 L15.4 41.6 L6.8 40.2 Z" fill={lamp} opacity="0.95" />
      <path d="M57.2 35.6 L47.6 37.8 L48.6 41.6 L57.2 40.2 Z" fill={lamp} opacity="0.95" />
      <path d="M7.5 42.6 H14.5" stroke={lamp} strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
      <path d="M49.5 42.6 H56.5" stroke={lamp} strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />

      {/* recorte de grelha inferior para dar profundidade ao pára-choques */}
      <rect x="19" y="46.2" width="26" height="3" rx="1.5" fill={trim} opacity={dark ? 0.45 : 0.32} />

      {/* medalhão central de anel duplo onde a bússola Elara assenta */}
      <circle cx="32" cy="36.2" r="13.8" fill={badge} stroke={`url(#${ringGrad})`} strokeWidth="2.4" />
      <circle cx="32" cy="36.2" r="11.4" fill="none" stroke={ringA} strokeWidth="0.7" opacity="0.45" />

      {/* assinatura Elara, recortada exactamente no conteúdo do PNG */}
      <svg x="23" y="23.2" width="18" height="26" viewBox="31 17 98 126" preserveAspectRatio="xMidYMid meet">
        <image href={mark} x="0" y="0" width="160" height="160" />
      </svg>
    </svg>
  );
}
