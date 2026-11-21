import {
  ChevronRight, FileJson, FlaskConical, Gauge, LifeBuoy, LogOut, Moon, ShieldAlert,
  Sun, Users,
} from 'lucide-react';
import type { Driver, SessionUser } from '../types';
import { setPref, usePrefs } from '../lib/alerts';
import { ReferralCard } from '../components/ReferralCard';
import { cn } from '../lib/utils';

interface ProfileViewProps {
  user: SessionUser | null;
  driver: Driver | null;
  driverLoading: boolean;
  dark: boolean;
  onToggleTheme: () => void;
  onLogin: () => void;
  onDriver: () => void;
  onSos: () => void;
  onHelp: () => void;
  onData: () => void;
  onTeam: () => void;
  onLogout: () => void;
  onError: (message: string, tone?: 'ok' | 'err') => void;
  /** Corre a viagem inteira sem servidor: preço, aceitação, chegada e fecho. */
  demo: boolean;
  onDemo: (on: boolean) => void;
  onOpenDemo: () => void;
}

/**
 * O Perfil do referencial: a identidade, o trabalho, o que é de emergência e o
 * que é preferência. Cada linha leva a um sítio que já existe — nada aqui é
 * uma porta pintada na parede.
 */
export function ProfileView({
  user, driver, driverLoading, dark, onToggleTheme, onLogin, onDriver,
  onSos, onHelp, onData, onTeam, onLogout, onError, demo, onDemo, onOpenDemo,
}: ProfileViewProps) {
  const prefs = usePrefs();
  const initials = (user?.name ?? '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

  return (
    <div className="animate-enter space-y-4 pb-8">
      <div>
        <p className="eyebrow text-purple-700 dark:text-amber-400">A sua conta Elara</p>
        <h1 className="mt-1 font-display text-title font-medium leading-tight text-ink dark:text-white">
          Perfil
        </h1>
      </div>

      {/* Identidade */}
      <div className="surface-card rounded-card p-4">
        {user ? (
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-purple-600 text-control font-semibold text-white dark:bg-amber-400 dark:text-ink">
              {initials || 'E'}
            </span>
            <div className="min-w-0">
              <p className="truncate text-body font-semibold text-ink dark:text-white">{user.name}</p>
              <p className="truncate text-label text-zinc-500 dark:text-zinc-400">{user.email || '—'}</p>
              {user.isAdmin && (
                <p className="mt-1 inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-caption font-semibold text-purple-700 dark:bg-amber-400/15 dark:text-amber-300">
                  Equipa Elara
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-body font-semibold text-ink dark:text-white">Entre para guardar as suas viagens</p>
            <p className="mt-1 text-label text-zinc-500 dark:text-zinc-400">
              A mesma conta serve o Elara Marketplace e a Ulyatila.
            </p>
            <button onClick={onLogin} className="btn-main mt-3 h-12 w-full rounded-control text-body font-semibold">
              Entrar na minha conta
            </button>
          </div>
        )}
      </div>

      {/* Trabalhar com a Elara */}
      <button
        onClick={onDriver}
        className="surface-card flex w-full items-center gap-3 rounded-card p-3.5 text-left transition-all hover:border-purple-300 active:scale-[0.99] dark:hover:border-amber-400/50"
      >
        <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-[12px] bg-zinc-100/90 px-1 dark:bg-white/[0.08]">
          <img src="/icons-3d/carro.png" alt="" aria-hidden="true" className="h-9 w-auto object-contain" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-body font-semibold text-ink dark:text-white">
            <Gauge className="h-4 w-4 shrink-0 text-purple-600 dark:text-amber-400" strokeWidth={1.8} />
            {driver?.status === 'approved' ? 'Painel do motorista' : 'Quero conduzir com a Elara'}
          </span>
          <span className="mt-0.5 block text-label text-zinc-500 dark:text-zinc-400">
            {driverLoading
              ? 'a verificar a sua conta…'
              : driver?.status === 'approved'
                ? `${driver.public_name} · ${driver.plate}`
                : driver?.status === 'pending'
                  ? 'Candidatura em análise pela equipa.'
                  : 'Moto, carro, Hiace, Canter ou camião.'}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
      </button>

      {/* Emergência, ajuda e dados: as três coisas que se procuram com pressa */}
      <div className="grid grid-cols-3 gap-2">
        <QuickAction icon={<ShieldAlert className="h-5 w-5" />} label="SOS" hint="111" onClick={onSos} danger />
        <QuickAction icon={<LifeBuoy className="h-5 w-5" />} label="Ajuda" hint="preço · código" onClick={onHelp} />
        <QuickAction icon={<FileJson className="h-5 w-5" />} label="Dados" hint="exportar · apagar" onClick={onData} />
      </div>

      {/* Aparência e avisos */}
      <div className="surface-card overflow-hidden rounded-card divide-y divide-zinc-100 dark:divide-white/10">
        <ToggleRow
          label="Tema escuro"
          hint="A tela principal nasce em ameixa; o claro é uma escolha."
          on={dark}
          onToggle={onToggleTheme}
          icon={dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        />
        <ToggleRow
          label="Som de chegada"
          hint="Um toque curto quando o motorista chega ao ponto."
          on={prefs.sound}
          onToggle={(v) => setPref('sound', v)}
        />
        <ToggleRow
          label="Vibração"
          hint="O telemóvel vibra nos avisos da viagem."
          on={prefs.vibrate}
          onToggle={(v) => setPref('vibrate', v)}
        />
        <ToggleRow
          label="Avisos de noite (21 h – 05 h)"
          hint="Verificação mais cedo e confirma a matrícula ao entrar."
          on={prefs.night}
          onToggle={(v) => setPref('night', v)}
        />
        <ToggleRow
          label="Poupar dados móveis"
          hint="Para de procurar carros à volta no mapa. As suas viagens continuam a chegar."
          on={prefs.lowData}
          onToggle={(v) => setPref('lowData', v)}
        />
      </div>

      {/* Demonstração: o fluxo inteiro sem tocar no servidor. */}
      <div className={cn(
        'rounded-card border p-4',
        demo
          ? 'border-purple-300 bg-purple-50 dark:border-amber-400/40 dark:bg-amber-400/[0.08]'
          : 'border-zinc-200 bg-white dark:border-[rgba(185,168,220,0.3)] dark:bg-white/[0.07]',
      )}>
        <div className="flex items-start gap-3">
          <span className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-full',
            demo ? 'bg-purple-600 text-white dark:bg-amber-400 dark:text-ink' : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300',
          )}>
            <FlaskConical className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-ink dark:text-white">Modo demonstração</p>
            <p className="mt-0.5 text-label leading-snug text-zinc-500 dark:text-zinc-400">
              Corre a viagem toda sem servidor: preço, motorista a aceitar, chegada, fecho e avaliação.
              Tudo fica no telemóvel e leva a marca DEMO.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={demo}
            aria-label="Modo demonstração"
            onClick={() => onDemo(!demo)}
            className={cn(
              'tap-pad-lg relative h-8 w-14 shrink-0 rounded-full transition-colors',
              demo ? 'bg-purple-600 dark:bg-amber-400' : 'bg-zinc-300/80 dark:bg-zinc-700',
            )}
          >
            <span className={cn(
              'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all duration-300',
              demo ? 'left-7' : 'left-1',
            )} />
          </button>
        </div>
        {demo && (
          <button
            onClick={onOpenDemo}
            className="mt-3 h-11 w-full rounded-control bg-purple-600 text-label font-semibold text-white dark:bg-amber-400 dark:text-ink"
          >
            Abrir o simulador
          </button>
        )}
      </div>

      <ReferralCard onError={(m, tone) => onError(m, tone)} />

      {user?.isAdmin && (
        <button
          onClick={onTeam}
          className="surface-card flex w-full items-center justify-between gap-2 rounded-card p-4 text-body font-semibold text-ink dark:text-white"
        >
          <span className="flex items-center gap-2.5">
            <Users className="h-4 w-4 text-purple-600 dark:text-amber-400" /> Consola da equipa
          </span>
          <ChevronRight className="h-5 w-5 text-zinc-400" aria-hidden="true" />
        </button>
      )}

      {user && (
        <button
          onClick={onLogout}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-control border border-red-200 bg-red-50 text-body font-semibold text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <LogOut className="h-5 w-5" /> Terminar sessão
        </button>
      )}

      <p className="text-center text-caption text-zinc-500 dark:text-zinc-400">
        Elara Ulyatila · versão {__APP_VERSION__} · a mesma conta do Marketplace.
      </p>
    </div>
  );
}

function QuickAction({ icon, label, hint, onClick, danger }: {
  icon: React.ReactNode; label: string; hint: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex min-h-[84px] flex-col items-start justify-between rounded-card border p-3 text-left active:scale-[0.98]',
        danger
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          : 'border-zinc-200 bg-white text-ink dark:border-[rgba(185,168,220,0.3)] dark:bg-white/[0.07] dark:text-white',
      )}
    >
      <span className={cn(danger ? 'text-red-600 dark:text-red-300' : 'text-purple-600 dark:text-amber-400')}>
        {icon}
      </span>
      <span>
        <span className="block text-[13px] font-semibold leading-tight">{label}</span>
        <span className={cn('block text-caption', danger ? 'text-red-600/80 dark:text-red-300/80' : 'text-zinc-500 dark:text-zinc-400')}>
          {hint}
        </span>
      </span>
    </button>
  );
}

function ToggleRow({ label, hint, on, onToggle, icon }: {
  label: string; hint: string; on: boolean; onToggle: (v: boolean) => void; icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-body font-semibold text-ink dark:text-white">
          {icon && <span className="text-purple-600 dark:text-amber-400">{icon}</span>}
          {label}
        </p>
        <p className="mt-0.5 text-label text-zinc-500 dark:text-zinc-400">{hint}</p>
      </div>
      <button
        onClick={() => onToggle(!on)}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={cn(
          'tap-pad-lg w-14 h-8 rounded-full relative transition-colors shrink-0',
          on ? 'bg-purple-600 dark:bg-amber-400' : 'bg-zinc-300/80 dark:bg-zinc-700',
        )}
      >
        <span className={cn(
          'absolute top-1 w-6 h-6 rounded-full bg-white shadow-[0_1px_4px_rgba(24,24,27,0.35)] transition-all duration-300',
          on ? 'left-7' : 'left-1',
        )} />
      </button>
    </div>
  );
}
