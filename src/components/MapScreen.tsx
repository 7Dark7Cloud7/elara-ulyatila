import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from './ElaraIcons';
import { MapView, type MapViewProps } from './MapView';
import { cn } from '../lib/utils';
interface MapScreenProps {
  map: MapViewProps;
  /** Pílula de estado por cima do mapa (o "o motorista chega em 4 min"). */
  top?: ReactNode;
  /** Botões flutuantes entre o mapa e o painel (recentrar, camada). */
  actions?: ReactNode;
  children: ReactNode;
  /** O resumo que substitui o conteúdo quando a folha está fechada no
   *  telemóvel. Sem ele, meio painel corta o cartão a meio e a pessoa não vê
   *  nem a rota nem o preço — que é justamente o que interessa consultar no
   *  mapa. No PC a folha não fecha, por isso o resumo só existe no estreito. */
  peek?: ReactNode;
  /** Botão fixo no fundo do painel, fora da zona de scroll. Num ecrã de 360×640
   *  o resto do cartão não cabe todo — e o preço/CTA é a única coisa que tem de
   *  estar sempre ao alcance do polegar. */
  footer?: ReactNode;
  /** O painel fecha para mostrar só o essencial? */
  collapsible?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Força o painel a abrir quando o conteúdo muda de fase. */
  forceOpen?: boolean;
}

/** A partir daqui o ecrã tem largura para mapa e coluna lado a lado. */
const WIDE = '(min-width: 1024px)';

/**
 * O ecrã dos apps deste género: o mapa é o fundo, a acção flutua por cima.
 * O painel mede a sua própria altura e diz ao mapa — assim o pino do encontro
 * nunca fica escondido atrás do cartão, seja qual for o telemóvel.
 *
 * Num ecrã de PC a folha deixa de fazer sentido: o painel passa a coluna fixa
 * à direita e o mapa fica com o resto. É o mesmo DOM e os mesmos números — só
 * muda a geometria, a partir dos 1024 px. A coluna fica à direita porque a
 * esquerda já pertence à navegação.
 */
export function MapScreen({
  map, top, actions, children, peek, footer, collapsible = true, open: controlled, onOpenChange, forceOpen,
}: MapScreenProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = useState(220);
  const [internal, setInternal] = useState(true);
  const open = controlled ?? (collapsible ? internal : true);
  // O `paddingBottom` do mapa é uma medida em pixéis, não um classe: só o CSS
  // não sabe que no PC não há folha por baixo.
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE).matches);
  // No PC a coluna mostra tudo e não há folha para fechar: o resumo é do
  // telemóvel, e só aparece quando a folha está mesmo reduzida à pega.
  const showPeek = peek !== undefined && !open && !wide;

  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Uma mudança de fase reabre a folha: quem a fechou porque o carro ainda não
  // tinha aparecido tem de a ver abrir quando ele aparece. Só no instante em
  // que a fase muda — se fosse em cada desenho, um painel com `forceOpen`
  // constante nunca mais deixava ninguém a fechar.
  // Com painel controlado é o dono que manda, por isso pede-lhe; não fala às
  // escondidas com um estado que ele já tem.
  const wasForced = useRef(!!forceOpen);
  useEffect(() => {
    const on = !!forceOpen;
    if (on && !wasForced.current) {
      if (controlled === undefined) setInternal(true);
      else onOpenChange?.(true);
    }
    wasForced.current = on;
  }, [forceOpen, controlled, onOpenChange]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPanelH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="screen-map relative lg:flex lg:flex-row">
      <div className="absolute inset-0 lg:relative lg:inset-auto lg:min-w-0 lg:flex-1">
        <MapView
          {...map}
          paddingBottom={wide ? 0 : panelH}
          fitKey={`${map.fitKey ?? ''}|${open ? 'f' : 'c'}|${wide ? 'w' : Math.round(panelH / 8)}`}
        />

        {top && (
          <div className="absolute inset-x-0 top-0 z-10 px-3 pt-3 pointer-events-none [&>*]:pointer-events-auto">
            {top}
          </div>
        )}

        {actions && (
          <div
            className="absolute right-3 z-10 flex flex-col gap-2 transition-[bottom] duration-300"
            style={{ bottom: wide ? 44 : panelH + 12 }}
          >
            {actions}
          </div>
        )}
      </div>

      <div
        ref={panelRef}
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden',
          'rounded-t-sheet bg-cream/[0.97] dark:bg-vault/[0.97] backdrop-blur-2xl',
          'border-t border-zinc-200 dark:border-[rgba(185,168,220,0.3)] shadow-sheet',
          'transition-[height,max-height] duration-300 ease-out',
          // 68% e não mais: um painel esticado até ao topo deixa uma faixa de
          // mapa onde nenhum pino cabe. O conteúdo passa por dentro.
          open ? 'max-h-[68%]' : 'max-h-[42%]',
          'lg:static lg:inset-auto lg:h-full lg:w-[400px] lg:max-h-none lg:rounded-none',
          'lg:border-t-0 lg:border-r xl:w-[440px] 2xl:w-[480px]',
        )}
      >
        {collapsible && (
          <button
            type="button"
            onClick={() => {
              if (controlled === undefined) setInternal(!open);
              onOpenChange?.(!open);
            }}
            aria-expanded={open}
            aria-label={open ? 'Fechar painel' : 'Abrir painel'}
            className="tap-pad-lg mx-auto mt-2.5 mb-1 h-6 w-16 rounded-full flex items-center justify-center gap-1 active:bg-zinc-100/70 dark:active:bg-white/5 lg:hidden"
          >
            <span className="sheet-grabber" />
            {open
              ? <ChevronDownIcon className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              : <ChevronUpIcon className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />}
          </button>
        )}
        {/* min-h-0: num flex-column filho, a altura mínima é o conteúdo. Sem isto
            o cartão estica-se para fora do painel em vez de por barra de scroll. */}
        <div className={cn('min-h-0 overflow-y-auto overscroll-contain px-4', open ? 'pb-5' : 'pb-4')}>
          {showPeek ? peek : children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-zinc-200/80 dark:border-[rgba(185,168,220,0.22)] px-4 pt-3 pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
