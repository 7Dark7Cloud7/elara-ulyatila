import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './ElaraIcons';
import { cn } from '../lib/utils';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Sheet mais alto para listas (zonas, praça de pedidos). */
  tall?: boolean;
}

/**
 * Painel de fundo no estilo Elara: desliza de baixo, fecha em toque fora.
 *
 * No PC uma folha agarrada à borda de baixo de um monitor fica a meio metro do
 * olhar e com a pega virada para nada. A partir dos 1024 px o mesmo diálogo
 * senta-se centrado, com cantos em todo o redor e sem a pega — o fecho já está
 * no canto, como se espera de uma janela. É o mesmo componente e o mesmo
 * conteúdo; só a geometria muda.
 */
export function Sheet({ open, title, onClose, children, tall }: SheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Os pais passam funções novas a cada render. Guardar a função num ref evita
  // que o efeito se re Monte enquanto a folha está aberta e devolva o foco ao
  // botão de trás no meio da pessoa a escrever.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;

    const focusable = () => {
      if (!dialog) return [] as HTMLElement[];
      const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return [...dialog.querySelectorAll<HTMLElement>(sel)].filter((el) => el.offsetParent !== null);
    };

    // O autoFocus do campo de pesquisa corre antes dos efeitos: se o foco já
    // estiver dentro da folha, não lho roubamos para o botão de fechar.
    if (dialog && !dialog.contains(document.activeElement)) {
      (dialog.querySelector<HTMLElement>('[autofocus]') ?? focusable()[0])?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !dialog) return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = dialog.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Devolver o foco a quem abriu a folha — sem isto, o teclado fica preso
      // num botão que já não existe depois de fechar.
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-8">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'animate-sheet relative w-full max-w-lg rounded-t-sheet bg-cream dark:bg-vault',
          'border-t border-x border-zinc-200 dark:border-[rgba(185,168,220,0.3)] shadow-sheet',
          'flex flex-col overflow-hidden',
          tall ? 'h-[82vh]' : 'max-h-[88vh]',
          'lg:max-w-2xl',
          // 720 px e 88 vh: no PC a janela manda, não o polegar. A coluna de
          // leitura continua a ser a mesma de sempre (512 → 672 px); o que
          // muda é o painel deixar de crescer desde a borda de baixo.
          'lg:h-auto lg:max-h-[min(720px,88vh)] lg:rounded-card lg:border lg:shadow-float',
        )}
      >
        <span aria-hidden="true" className="sheet-grabber mt-2.5 mb-0.5 mx-auto shrink-0 lg:hidden" />
        <div className="flex items-center justify-between px-5 pt-1.5 pb-3 border-b border-zinc-200/80 dark:border-[rgba(185,168,220,0.22)] shrink-0 lg:pt-4 lg:px-6">
          <h2 className="font-display text-title font-medium text-zinc-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="tap-pad p-1 text-zinc-500 dark:text-zinc-400"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-4 pb-safe grow lg:px-6 lg:pb-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
