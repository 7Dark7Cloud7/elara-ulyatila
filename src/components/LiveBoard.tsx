import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, Users } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import { STATE_LABEL, isTripActive } from '../lib/trips';
import { cn, minutesAgo, OFF_ATTR } from '../lib/utils';
import { formatKz } from '../lib/money';
import type { TripEvent, TripState, Zone } from '../types';

/**
 * «Agora» — o que está a acontecer na praça neste momento, visto de dentro da
 * consola da equipa (1 a 3 pessoas). Uma só leitura de `tr_trip`, que o RLS já
 * abre a quem é da equipa (`tr_trip_read` inclui `is_admin()`): nenhuma tabela
 * nova, nenhum canal de tempo real, nenhuma promessa de vigilância.
 *
 * A lista não se mexe sozinha. Há um botão «Actualizar» e a idade da última
 * leitura, porque dizer «ao vivo» sem ligação em tempo real seria mentir.
 */

interface LiveTrip {
  id: string;
  code: string;
  kind: string;
  state: TripState;
  from_zone_id: string;
  to_zone_id: string;
  price_kz: number;
  driver_name: string | null;
  plate: string | null;
  events: TripEvent[] | null;
  created_at: number;
}

/** Os estados «à espera» e «em curso» derivam da mesma tabela de etiquetas e da
 *  mesma definição de viagem activa que o passageiro e o motorista usam. Se um
 *  estado novo aparecer em `STATE_LABEL`, este painel passa a mostrá-lo sem aqui
 *  se mudar seja o que for. */
const LIVE_STATES = (Object.keys(STATE_LABEL) as TripState[])
  .filter((s) => isTripActive({ state: s }));

/** Cinco minutos sem ninguém aceitar é o sinal que a equipa pode accionar.
 *  Abaixo disso há trânsito e há um pedido normal. Mesmo tempo do `RideCheck`. */
const STUCK_MS = 5 * 60_000;

/** Desde quando a viagem está no estado em que está. Sem historial, é o carimbo
 *  de criação — que num pedido à espera é exactamente o que se quer contar. */
const sinceState = (t: LiveTrip): number => {
  const e = (t.events ?? []).filter((x) => x && typeof x.at === 'number').pop();
  return e ? e.at : t.created_at;
};

/** Relojinho para as idades não ficarem congeladas enquanto a folha está aberta. */
const useMinuteTick = (on: boolean) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [on]);
};

interface LiveBoardProps {
  zones: Zone[];
  /** Motoristas ligados, contados na frota que a consola já carregou. */
  onlineNow: number;
  driversTotal: number;
}

export function LiveBoard({ zones, onlineNow, driversTotal }: LiveBoardProps) {
  const [rows, setRows] = useState<LiveTrip[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);

  const load = async () => {
    if (loading) return;
    setLoading(true);
    setFailed(null);
    const { data, error } = await supabase
      .from('tr_trip')
      .select('*')
      .in('state', LIVE_STATES)
      .order('created_at', { ascending: true })
      .limit(60);
    setLoading(false);
    if (error) { setFailed(rpcError(error)); return; }
    setRows((data as LiveTrip[]) ?? []);
    setReadAt(Date.now());
  };

  // O painel vive dentro da folha: cada abertura é uma montagem nova, e por
  // isso basta ler uma vez ao montar. A lista é o retrato desse instante.
  useEffect(() => {
    void load();
  }, []);

  useMinuteTick(!!rows?.length);

  const nomeZona = (id: string) => zones.find((z) => z.id === id)?.name ?? id;
  const semMotoristaHáMuito = (t: LiveTrip): boolean => Date.now() - sinceState(t) >= STUCK_MS;
  const waiting = (rows ?? []).filter((t) => t.state === 'searching');
  const running = (rows ?? []).filter((t) => t.state !== 'searching');
  const stuck = waiting.filter(semMotoristaHáMuito);

  const linha = (t: LiveTrip, urgente: boolean) => (
    <li
      key={t.id}
      className={cn(
        'rounded-2xl px-3 py-2.5',
        urgente
          ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900'
          : 'bg-zinc-100 dark:bg-zinc-800',
      )}
    >
      {/* A primeira linha é o estado, não o código: é o que diz o que ainda não
          aconteceu. O código vem junto das zonas, para a equipa poder chamar
          as duas pontas pelo que está no ecrã delas. */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-bold text-zinc-900 dark:text-white truncate">
          {STATE_LABEL[t.state]}
        </p>
        <span className="shrink-0 text-[12px] font-semibold text-zinc-600 dark:text-zinc-400 tabular-nums">
          {minutesAgo(sinceState(t))}
        </span>
      </div>
      <p className="text-[12px] font-medium text-zinc-600 dark:text-zinc-300 mt-0.5 truncate">
        {t.code} · {nomeZona(t.from_zone_id)} → {nomeZona(t.to_zone_id)}
        {t.kind === 'entrega' ? ' · entrega' : ''}
      </p>
      <div className="flex items-baseline justify-between gap-2 mt-0.5">
        <span className="shrink-0 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300 tabular-nums">
          {formatKz(t.price_kz)}
        </span>
        <span className={cn(
          'min-w-0 truncate text-[12px] font-semibold',
          t.driver_name ? 'text-zinc-600 dark:text-zinc-400' : 'text-purple-700 dark:text-purple-300',
        )}>
          {t.driver_name ? `${t.driver_name}${t.plate ? ` · ${t.plate}` : ''}` : 'sem motorista'}
        </span>
      </div>
    </li>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
          <Activity className="w-3.5 h-3.5" /> Agora
          {!!rows?.length && (
            <span className="rounded-full bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 text-[12px] font-semibold text-purple-700 dark:text-purple-300">
              {rows.length}
            </span>
          )}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-purple-700 dark:text-purple-300 tap-pad"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Actualizar
        </button>
      </div>

      {loading && !rows && (
        <p className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-3 py-3 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
          a ler a praça…
        </p>
      )}

      {failed && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3">
          <p className="flex items-start gap-2 text-[12px] font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            {failed}
          </p>
          <button
            onClick={load}
            disabled={loading}
            className={cn(
              'mt-2 h-9 px-3 rounded-xl text-[12px] font-semibold bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 flex items-center gap-1.5',
              OFF_ATTR,
            )}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Tentar de novo
          </button>
        </div>
      )}

      {rows && !rows.length && !failed && (
        <p className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-3 py-3 text-[12px] font-medium text-zinc-600 dark:text-zinc-300">
          Nenhuma corrida em curso à última leitura{readAt ? ` (${minutesAgo(readAt)})` : ''}.
          {onlineNow === 0 && driversTotal > 0
            ? ' E nenhum motorista ligado — é por isso que a praça está quieta.'
            : ''}
        </p>
      )}

      {!!rows?.length && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {driversTotal ? `${onlineNow} de ${driversTotal} motoristas ligados` : 'nenhum motorista aprovado'}
            </span>
            <span>{waiting.length} {waiting.length === 1 ? 'pedido' : 'pedidos'} à espera</span>
            {!!stuck.length && (
              <span className="text-amber-800 dark:text-amber-300">
                {stuck.length} sem motorista há mais de 5 min
              </span>
            )}
          </div>

          {!!waiting.length && (
            <div>
              <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                À espera de motorista
              </p>
              <ul className="space-y-1.5">
                {waiting.map((t) => linha(t, semMotoristaHáMuito(t)))}
              </ul>
            </div>
          )}

          {!!running.length && (
            <div>
              <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                Com motorista
              </p>
              <ul className="space-y-1.5">{running.map((t) => linha(t, false))}</ul>
            </div>
          )}

          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Lido {readAt ? minutesAgo(readAt) : 'agora'}. A consola não tem ligação em tempo
            real: toque em «Actualizar» para ver a praça de agora.
          </p>
        </div>
      )}
    </div>
  );
}
