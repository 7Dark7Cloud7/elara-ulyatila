import { useState } from 'react';
import { Loader2, Lock, LogIn, Mail, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { translateAuthError } from '../lib/auth';
import { Sheet } from './Sheet';
import { cn, OFF } from '../lib/utils';

interface AuthSheetProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/** Entrar ou criar conta com email e palavra-passe — a mesma conta do Elara. */
export function AuthSheet({ open, onClose, onDone, onError }: AuthSheetProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setLocalError(null);
    if (!email.trim() || !password) {
      setLocalError('Escreva o email e a palavra-passe.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        if (!name.trim()) {
          setLocalError('Diga o seu nome — é o que o motorista vai ver.');
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
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
  };

  const forgot = async () => {
    if (!email.trim()) {
      setLocalError('Escreva o email da conta para recuperar a palavra-passe.');
      return;
    }
    setBusy(true);
    setLocalError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) {
      setLocalError(translateAuthError(error));
    } else {
      onError('Enviei um link de recuperação para o seu email.');
    }
  };

  return (
    <Sheet open={open} title={mode === 'login' ? 'Entrar' : 'Criar conta'} onClose={() => { reset(); onClose(); }}>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'signup' && (
          <label className="block">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
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
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
            Email
          </span>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@email.com"
              autoComplete="email"
              inputMode="email"
              className={cn(inputCls, 'pl-10')}
            />
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
            Palavra-passe
          </span>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={cn(inputCls, 'pl-10')}
            />
          </div>
        </label>

        {localError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 font-medium">{localError}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className={cn(
            'btn-main w-full h-12 rounded-2xl font-bold flex items-center justify-center gap-2',
            busy && OFF,
          )}
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            mode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />
          )}
          {mode === 'login' ? 'Entrar' : 'Criar a minha conta'}
        </button>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setLocalError(null); }}
            className="text-sm font-bold text-purple-600 dark:text-amber-400"
          >
            {mode === 'login' ? 'Criar conta nova' : 'Já tenho conta'}
          </button>
          {mode === 'login' && (
            <button type="button" onClick={forgot} className="text-sm font-bold text-zinc-500 dark:text-zinc-400">
              Recuperar senha
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

const inputCls =
  'mt-1 w-full h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:border-purple-400 outline-none';
