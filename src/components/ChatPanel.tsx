import { useEffect, useRef, useState } from 'react';
import { SendIcon, SosShieldIcon, SpinnerIcon } from './ElaraIcons';
import { supabase } from '../lib/supabase';
import { useDemo } from '../lib/demoContext';
import { appendDemoChatMessage } from '../lib/demoEngine';
import type { ChatMessage } from '../types';
import { QUICK_REPLIES } from '../lib/trips';
import { buzz } from '../lib/alerts';
import { cn, when, OFF } from '../lib/utils';

interface ChatPanelProps {
  tripId: string;
  myRole: 'passenger' | 'driver';
  /** Texto pré-escrito no campo (o aviso do troco, por exemplo). Não envia
   *  sozinho: quem envia é a pessoa, e fica registado como mensagem dela. */
  seed?: string | null;
  /** Fecha o teclado, com a frase que se mostra no lugar dele. É uma regra da
   *  app e não um conselho: ao volante não se escreve. As respostas rápidas,
   *  que são um toque, continuam lá. */
  lockNote?: string | null;
}

/**
 * Chat da viagem: tudo o que se combina fica registado. O filtro do servidor
 * (trigger tr_moderate_trip_chat) limpa telefones e links — «[contacto removido]»
 * é o sinal de que alguém tentou desviar o encontro para fora da app.
 */
export function ChatPanel({ tripId, myRole, seed, lockNote }: ChatPanelProps) {
  const demoCtx = useDemo();
  const isDemo = !!demoCtx?.isDemo;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!isDemo);
  const endRef = useRef<HTMLDivElement>(null);
  const locked = !!lockNote;

  const displayedMessages = isDemo ? (demoCtx?.demoState.chats[tripId] ?? []) : messages;

  useEffect(() => {
    if (isDemo) {
      setLoading(false);
      return;
    }
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('tr_chat_message')
        .select('*')
        .eq('trip_id', tripId)
        .order('at', { ascending: true });
      if (alive && data) setMessages(data);
      if (alive) setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`tr-chat-${tripId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tr_chat_message', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === (payload.new as ChatMessage).id)
              ? prev
              : [...prev, payload.new as ChatMessage],
          );
        },
      )
      .subscribe();

    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 20000);

    return () => {
      alive = false;
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [tripId, isDemo]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayedMessages.length]);

  useEffect(() => {
    if (seed) setText(seed);
  }, [seed]);

  const send = async (bodyArg?: string) => {
    const body = (bodyArg ?? text).trim();
    if (!body || busy) return;
    setBusy(true);
    setText('');
    if (isDemo && demoCtx) {
      demoCtx.setDemoState((prev) => appendDemoChatMessage(prev, tripId, myRole, body));
      buzz(40);
      setBusy(false);
      return;
    }
    const tempId = `tmp-${Date.now()}`;
    const temp = {
      id: tempId, trip_id: tripId, sender_role: myRole, text: body, at: Date.now(),
    } as ChatMessage;
    setMessages((prev) => [...prev, temp]);
    const { data, error } = await supabase
      .from('tr_chat_message')
      .insert({
        trip_id: tripId,
        sender_role: myRole,
        text: body,
        at: Date.now(),
      })
      .select()
      .single();
    setMessages((prev) => {
      const rest = prev.filter((m) => m.id !== tempId);
      return error ? rest : [...rest, data as ChatMessage];
    });
    if (error) setText(body);
    else buzz(40);
    setBusy(false);
  };

  return (
    <div className="surface-card rounded-card overflow-hidden">
      <div className="h-64 overflow-y-auto overscroll-contain bg-cream/60 dark:bg-night/50 p-3 space-y-2 custom-scrollbar">
        {loading && (
          <div className="h-full flex items-center justify-center text-zinc-400">
            <SpinnerIcon className="w-5 h-5 animate-spin" />
          </div>
        )}
        {!loading && displayedMessages.length === 0 && (
          <p className="h-full flex items-center justify-center text-center text-label text-zinc-500 dark:text-zinc-400 px-4">
            Escreva para combinar o encontro. O que se combinar aqui, fica registado.
          </p>
        )}
        {displayedMessages.map((m) => {
          const mine = m.sender_role === myRole;
          const blocked = !!m.blocked;
          return (
            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-control px-3.5 py-2',
                  m.sender_role === 'system'
                    ? 'mx-auto bg-purple-100 dark:bg-amber-400/[0.14] text-purple-700 dark:text-amber-200 text-caption text-center'
                    : mine
                      ? 'bg-purple-600 text-white dark:bg-amber-400 dark:text-ink'
                      : 'bg-white dark:bg-vault border border-zinc-200 dark:border-white/15 text-ink dark:text-white',
                )}
              >
                {blocked && (
                  <p className={cn('flex items-center gap-1 text-caption font-medium mb-0.5',
                    mine ? 'text-amber-100 dark:text-ink/80' : 'text-amber-800 dark:text-amber-200')}>
                    <SosShieldIcon className="w-3 h-3" /> combinou por fora — cuidado com burlas
                  </p>
                )}
                <p className={cn('text-label break-words', m.sender_role === 'system' ? 'font-semibold' : 'font-medium')}>
                  {m.text}
                </p>
                <p className={cn('text-[11px] mt-0.5', mine ? 'text-purple-100 dark:text-ink/70' : 'text-zinc-500 dark:text-zinc-400')}>
                  {when(m.at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* O que se repete em toda a corrida, escrito uma vez. Um toque chega e
          envia — por isso é só para as frases que não precisam de discussão.
          São também elas que ficam quando o teclado está fechado ao volante. */}
      <div className="h-rail flex gap-2 overflow-x-auto px-2.5 pt-2.5 pb-1 bg-white dark:bg-vault">
        {QUICK_REPLIES[myRole].map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={busy}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-caption font-semibold border transition-colors',
              busy ? OFF : 'surface-outline text-ink dark:text-zinc-200',
            )}
          >{q}</button>
        ))}
      </div>

      {locked ? (
        <p className={cn(
          'flex items-start gap-2 border-t border-zinc-200 dark:border-white/10 p-3',
          'bg-white dark:bg-vault text-label font-medium',
          'text-zinc-600 dark:text-zinc-300',
        )}>
          <SosShieldIcon className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          {lockNote}
        </p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-center gap-2 bg-white dark:bg-vault p-2.5 border-t border-zinc-200 dark:border-white/10">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva uma mensagem…"
            maxLength={1000}
            className="grow h-11 rounded-control bg-zinc-100 dark:bg-white/[0.07] px-3.5 text-label text-ink dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none focus:border-purple-500 dark:focus:border-amber-400 border border-transparent"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Enviar"
            className="tap-pad shrink-0 p-2 text-purple-600 dark:text-amber-400 disabled:text-zinc-400 dark:disabled:text-zinc-500"
          >
            {busy ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : <SendIcon className="w-6 h-6" />}
          </button>
        </form>
      )}
    </div>
  );
}
