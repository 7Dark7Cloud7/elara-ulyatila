import { Brand } from './Brand';
import { MoonIcon, SunIcon } from './ElaraIcons';
import { NavUserIcon } from './NavIcons';
import { cn } from '../lib/utils';

interface HeaderProps {
  dark: boolean;
  onToggleTheme: () => void;
  userName: string | null;
  onAccount: () => void;
}

/**
 * A barra de topo: a assinatura da casa, o tema e a conta.
 *
 * No PC a marca muda-se para o topo da coluna de navegação (ver Brand), e a
 * barra fica só com o que é acção — o tema e a conta, encostados à direita.
 */
export function Header({ dark, onToggleTheme, userName, onAccount }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-cream/[0.97] dark:bg-night/[0.97] backdrop-blur-2xl border-b border-zinc-200 dark:border-[rgba(185,168,220,0.25)] pt-safe">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4 lg:mx-0 lg:max-w-none lg:px-8">
        <Brand dark={dark} className="lg:hidden" />
        <div className="grow" />
        <button
          onClick={onToggleTheme}
          aria-label={dark ? 'Modo claro' : 'Modo escuro'}
          className="tap-pad w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 active:bg-black/5 dark:active:bg-white/10 transition-colors"
        >
          {dark ? <SunIcon className="w-[20px] h-[20px]" /> : <MoonIcon className="w-[20px] h-[20px]" />}
        </button>
        <button
          onClick={onAccount}
          aria-label={userName ? 'A minha conta' : 'Entrar'}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
            userName
              ? 'bg-purple-100 dark:bg-amber-400/15 text-purple-700 dark:text-amber-300 ring-1 ring-purple-200 dark:ring-amber-400/40'
              : 'text-zinc-600 dark:text-zinc-300 active:bg-black/5 dark:active:bg-white/10',
          )}
        >
          <NavUserIcon className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
