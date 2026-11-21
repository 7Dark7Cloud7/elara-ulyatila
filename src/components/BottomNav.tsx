import type { ComponentType } from 'react';
import { Brand } from './Brand';
import { NavCarIcon, NavRouteIcon, NavUserIcon, NavWalletIcon, type NavIconProps } from './NavIcons';
import { cn } from '../lib/utils';

export type TabId = 'corrida' | 'viagens' | 'motorista' | 'carteira' | 'perfil';

interface BottomNavProps {
  tab: TabId;
  onTab: (tab: TabId) => void;
  dark: boolean;
}

/** As quatro portas do referencial. O motorista entra pelo Perfil — trabalhar
 *  com a Elara é uma escolha da conta, não um quinto destino na barra. */
const TABS: Array<{ id: TabId; label: string; Icon: ComponentType<NavIconProps> }> = [
  { id: 'corrida', label: 'Início', Icon: NavCarIcon },
  { id: 'viagens', label: 'Viagens', Icon: NavRouteIcon },
  { id: 'carteira', label: 'Carteira', Icon: NavWalletIcon },
  { id: 'perfil', label: 'Perfil', Icon: NavUserIcon },
];

/**
 * A barra de baixo do referencial: 76 px, ícones de 22, etiquetas de 11.
 *
 * A porta aberta ganha uma pílula suave atrás do desenho — o mesmo gesto do
 * `btn-main`, em tom de repouso. A pílula existe para o olho não ter de
 * comparar quatro cores: o escolhido tem forma, não só matiz. No escuro vira
 * âmbar a 15% para não abrir um buraco de luz na noite.
 *
 * No PC a barra de baixo é um gesto de telemóvel: a partir dos 1024 px a mesma
 * navegação vira coluna fixa à esquerda, com o acento da marca no item activo.
 * É o mesmo componente e as mesmas quatro portas.
 */
export function BottomNav({ tab, onTab, dark }: BottomNavProps) {
  // O painel do motorista abre-se a partir do Perfil: a porta fica acesa.
  const activeId: TabId = tab === 'motorista' ? 'perfil' : tab;

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'fixed bottom-0 inset-x-0 z-40 backdrop-blur-2xl pb-safe',
        'bg-white/[0.97] dark:bg-night/[0.97] border-t border-zinc-200 dark:border-[rgba(185,168,220,0.25)]',
        'lg:top-0 lg:bottom-0 lg:left-0 lg:right-auto lg:w-[var(--rail)] lg:border-t-0 lg:border-r lg:pb-0',
      )}
    >
      <div className="max-w-lg mx-auto h-[4.75rem] flex items-stretch px-2 lg:max-w-none lg:h-full lg:w-full lg:flex-col lg:items-stretch lg:gap-1 lg:px-4 lg:pt-0">
        {/* Na coluna do PC a marca abre a barra, do lado do mapa onde o nome
            já estava. No telemóvel quem a mostra é o cabeçalho. */}
        <Brand dark={dark} className="hidden lg:flex lg:h-14 lg:shrink-0 lg:px-3" />
        {TABS.map(({ id, label, Icon }) => {
          const active = activeId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1.5 h-full',
                'transition-transform duration-150 active:scale-[0.96]',
                'lg:h-12 lg:w-full lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:rounded-control lg:border-l-2 lg:px-3',
                active
                  ? 'text-purple-600 dark:text-amber-400 lg:border-current'
                  : 'text-purple-400 dark:text-zinc-400 lg:border-transparent',
              )}
            >
              <span
                className={cn(
                  'grid h-8 w-[3.25rem] shrink-0 place-items-center rounded-full',
                  'transition-colors duration-200 lg:h-8 lg:w-8',
                  active ? 'bg-purple-100 dark:bg-amber-400/[0.15]' : 'bg-transparent',
                )}
              >
                <Icon active={active} />
              </span>
              <span
                className={cn(
                  'text-[11px] leading-none tracking-[0.01em] transition-colors lg:text-[13px]',
                  active ? 'font-semibold' : 'font-medium',
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
