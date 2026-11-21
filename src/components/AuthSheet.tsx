import { useState } from 'react';
import {
  DemoFlaskIcon, EyeIcon, EyeOffIcon, LockIcon, LoginIcon, MailIcon, ShieldCheckIcon, SpinnerIcon, UserPlusIcon,
} from './ElaraIcons';
import { supabase } from '../lib/supabase';
import { translateAuthError } from '../lib/auth';
import { isValidEmail } from '../lib/localExtras';
import { Sheet } from './Sheet';
import { cn, OFF } from '../lib/utils';

interface AuthSheetProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
  /** Permite experimentar o simulador sem criar conta. */
  onOpenDemo?: () => void;
}

/** Entrar ou criar conta com email e palavra-passe — a mesma conta do Elara. */
export function AuthSheet({ open, onClose, onDone, onError, onOpenDemo }: AuthSheetProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setLocalError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setLocalError('Escreva o email e a palavra-passe.');
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setLocalError('Verifique o endereço de email (ex.: nome@email.com).');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setLocalError('A palavra-passe precisa de pelo menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
      } else {
        if (!name.trim()) {
          setLocalError('Diga o seu nome — é o que o motorista vai ver.');
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: name.trim() } },
        });
        if (error) throw error;
        onError('Conta criada. Abra o link no seu email para confirmar e entre depois.');
      }
      if (mode === 'login') {
        onDone();
      } else {
        setMode('login');
      }
    } catch (err) {
      setLocalError(translateAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setLocalError(null);
    setBusy(false);
    setShowPassword(false);
  };

  const forgot = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setLocalError('Escreva o email da conta para recuperar a palavra-passe.');
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setLocalError('Escreva um email válido para receber o link de recuperação.');
      return;
    }
    setBusy(true);
    setLocalError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    setBusy(false);
    if (error) {
      setLocalError(translateAuthError(error));
    } else {
      onError('Enviei um link de recuperação para o seu email.');
    }
  };

  return (
    <Sheet open={open} title={mode === 'login' ? 'Entrar na conta Elara' : 'Criar conta Elara'} onClose={() => { reset(); onClose(); }}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {/* Nota honesta de conta partilhada com o Marketplace */}
        <div className="surface-card rounded-card p-3.5 flex items-start gap-2.5">
          <ShieldCheckIcon className="w-4 h-4 shrink-0 mt-0.5 text-purple-600 dark:text-amber-400" />
          <p className="text-caption leading-relaxed text-zinc-600 dark:text-zinc-300">
            A mesma conta serve na <strong className="font-semibold text-ink dark:text-white">Elara Ulyatila</strong> e no{' '}
            <strong className="font-semibold text-ink dark:text-white">Elara Marketplace</strong>. O seu telefone nunca é mostrado ao motorista.
          </p>
        </div>

        {/* Alternador Entrar / Criar conta */}
        <div className="grid grid-cols-2 gap-1.5 rounded-control bg-zinc-100 dark:bg-white/[0.06] p-1">
          {([['login', 'Entrar'], ['signup', 'Criar conta']] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setLocalError(null); }}
              aria-pressed={mode === m}
              className={cn(
                'h-10 rounded-[12px] text-label font-semibold transition-colors',
                mode === m
                  ? 'bg-purple-600 text-white shadow-card dark:bg-amber-400 dark:text-ink'
                  : 'text-zinc-600 dark:text-zinc-300',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'signup' && (
          <label className="block">
            <span className="text-caption font-semibold text-zinc-500 dark:text-zinc-400">
              O seu nome
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: João Silva"
              autoComplete="name"
              className={inputCls}
            />
          </label>
        )}

        <label className="block">
          <span className="text-caption font-semibold text-zinc-500 dark:text-zinc-400">
            Email
          </span>
          <div className="relative">
            <MailIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (localError) setLocalError(null); }}
              placeholder="nome@email.com"
              autoComplete="email"
              inputMode="email"
              className={cn(inputCls, 'pl-10')}
            />
          </div>
        </label>

        <label className="block">
          <span className="text-caption font-semibold text-zinc-500 dark:text-zinc-400">
            Palavra-passe
          </span>
          <div className="relative">
            <LockIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (localError) setLocalError(null); }}
              placeholder="Mínimo 6 caracteres"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={cn(inputCls, 'pl-10 pr-12')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Esconder palavra-passe' : 'Mostrar palavra-passe'}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-ink dark:hover:text-white"
            >
              {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
        </label>

        {localError && (
          <p
            role="alert"
            className="rounded-control border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-label text-red-700 dark:text-red-300 font-medium"
          >
            {localError}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className={cn(
            'w-full h-12 rounded-control font-semibold flex items-center justify-center gap-2',
            busy ? OFF : 'btn-main',
          )}
        >
          {busy ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : (
            mode === 'login' ? <LoginIcon className="w-5 h-5" /> : <UserPlusIcon className="w-5 h-5" />
          )}
          {mode === 'login' ? 'Entrar' : 'Criar a minha conta'}
        </button>

        {mode === 'login' && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={forgot}
              className="text-label font-semibold text-purple-600 dark:text-amber-400"
            >
              Recuperar palavra-passe
            </button>
          </div>
        )}

        {onOpenDemo && (
          <div className="pt-2 border-t border-zinc-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => { reset(); onClose(); onOpenDemo(); }}
              className="surface-outline w-full h-11 rounded-control text-label font-semibold text-purple-700 dark:text-amber-300 flex items-center justify-center gap-2"
            >
              <DemoFlaskIcon className="w-4 h-4 shrink-0" />
              Abrir app completa em modo demonstração
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

const inputCls =
  'mt-1 w-full h-12 rounded-control bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/15 px-4 text-body text-ink dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:border-purple-500 dark:focus:border-amber-400 outline-none transition-colors';
