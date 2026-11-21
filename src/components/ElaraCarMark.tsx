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
  const body = dark ? '#E7CFA6' : '#5A2FC2';       // amber-400 / purple-600
  const glass = dark ? '#FBF1DE' : '#C9B4F3';      // amber-100 / purple-300
  const badge = dark ? '#1B0B38' : '#FAF7F0';      // night / cream
  const edge = dark ? '#E7CFA6' : '#4B27A4';       // amber-400 / purple-700
  const wheel = dark ? '#E7CFA6' : '#2A1254';      // amber-400 / ink
  const trim = dark ? '#1B0B38' : '#3C1B86';       // recorte de grelha / detalhe
  const mark = dark ? '/elara-mark-dark.png' : '/elara-mark.png';

  return (
    <svg viewBox="0 0 64 64" className={cn('block h-full w-full', className)} aria-hidden="true">
      {/* retrovisores encostados aos pilares: dão leitura imediata de carro de frente */}
      <rect x="6" y="25" width="7" height="4.5" rx="2.2" fill={body} />
      <rect x="51" y="25" width="7" height="4.5" rx="2.2" fill={body} />
      {/* rodas: cheias, assentes na mesma linha de chão */}
      <rect x="7" y="45" width="11" height="11" rx="4.5" fill={wheel} />
      <rect x="46" y="45" width="11" height="11" rx="4.5" fill={wheel} />
      {/* carroçaria de frente: cabina limpa, ombros esculpidos e para-choques largo */}
      <path
        d="M12 29 L16 17 C17.5 13.5 21 12 26 12 H38 C43 12 46.5 13.5 48 17 L52 29
           L57 32 C59.5 33.5 60.5 35.5 60.5 38.5 V46 C60.5 49 58.5 51 55.5 51
           H8.5 C5.5 51 3.5 49 3.5 46 V38.5 C3.5 35.5 4.5 33.5 7 32 Z"
        fill={body}
      />
      {/* pára-brisas inclinado com margem uniforme dentro do tejadilho */}
      <path
        d="M17.5 27.5 L20.5 18 C21.2 16.2 22.8 15.5 25.5 15.5 H38.5 C41.2 15.5 42.8 16.2 43.5 18 L46.5 27.5 Z"
        fill={glass}
      />
      {/* faróis LED inclinados: dão expressão moderna ao rosto do carro */}
      <path d="M7.5 36.5 L16 38 L15 42 L7.5 41 Z" fill={glass} />
      <path d="M56.5 36.5 L48 38 L49 42 L56.5 41 Z" fill={glass} />
      {/* linha subtil do para-choques inferior */}
      <rect x="21" y="45.5" width="22" height="2.5" rx="1.25" fill={trim} opacity="0.45" />
      {/* emblema: círculo de contraste onde a marca Elara se senta */}
      <circle cx="32" cy="36" r="13.2" fill={badge} stroke={edge} strokeWidth="2.4" />
      {/* assinatura Elara, recortada exactamente no conteúdo do PNG */}
      <svg x="23" y="23" width="18" height="26" viewBox="31 17 98 126" preserveAspectRatio="xMidYMid meet">
        <image href={mark} x="0" y="0" width="160" height="160" />
      </svg>
    </svg>
  );
}
