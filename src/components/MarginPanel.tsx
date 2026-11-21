import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, PencilLine, Percent, Save, TrendingUp } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import { formatKz } from '../lib/money';
import {
  effectivePeak, graceEnds, loadSetting, marginSplit, saveSetting,
  PEAK_CEILING, type Setting,
} from '../lib/settings';
import { cn, OFF_ATTR } from '../lib/utils';

/**
 * O lucro da Elara, em aberto. A comissão já é calculada no servidor desde a
 * 0001 (`tr_quote`: `round((preço − taxa de pedido) × commission_pct / 100)`,
 * 0 enquanto durar a graça de lançamento) e já é guardada viagem a viagem em
 * `tr_trip.commission_kz` / `driver_keeps_kz`. O que este painel acrescenta é
 * a alavanca e a leitura: a equipa muda as condições numa conta de staff, e vê
 * o que essas condições fizeram nas viagens que já terminaram.
 *
 * Nada aqui move dinheiro: o pagamento é em notas ou Multicaixa a bordo, e a
 * acertar a comissão com a equipa é que se fala com uma pessoa.
 */

const FIELD = 'w-full h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 outline-none focus:border-purple-400 text-[15px] font-semibold text-zinc-900 dark:text-white';

/** O que cada campo pode valer — os mesmos limites dos CHECK da 0001. */
const LIMITS: Record<string, [number, number, number?]> = {
  commission_pct: [0, 40, 1],
  booking_fee_kz: [0, 100000, 50],
  cancel_fee_kz: [0, 100000, 50],
  surge_cap: [1, 2, 0.01],
  trial_trip_limit: [0, 500, 1],
};

const LABELS: Record<string, [string, string]> = {
  commission_pct: ['Comissão da Elara', 'percentagem sobre o preço, sem contar a taxa de pedido'],
  booking_fee_kz: ['Taxa de pedido', 'soma-se ao preço do passageiro e fica de fora da comissão'],
  cancel_fee_kz: ['Taxa de cancelamento', 'fica escrita no registo de um cancelamento depois da aceitação'],
  surge_cap: ['Tecto da hora de pico', `07–09 e 17–20; o servidor nunca passa de ${PEAK_CEILING}`],
  trial_trip_limit: ['Viagens de teste', 'cada motorista novo começa com este número'],
};

const EXAMPLES = [500, 1000, 2500];

interface Revenue {
  trips: number;
  gross: number;
  commission: number;
  keeps: number;
}

interface TripMoney {
  price_kz: number;
  commission_kz: number;
  driver_keeps_kz: number;
}

export function MarginPanel({ onError }: { onError: (message: string) => void }) {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);

  const read = async () => {
    setLoading(true);
    setFailed(null);
    const [s, r] = await Promise.all([
      loadSetting(),
      supabase.from('tr_trip')
        .select('price_kz, commission_kz, driver_keeps_kz')
        .in('state', ['ended', 'rated'])
        .order('created_at', { ascending: false })
        .limit(200),
    ]);
    setLoading(false);
    if (s.error) { setFailed(s.error); return; }
    if (!s.setting) { setSetting(null); return; }
    setSetting(s.setting);
    setDraft({
      commission_pct: String(s.setting.commission_pct),
      booking_fee_kz: String(s.setting.booking_fee_kz),
      cancel_fee_kz: String(s.setting.cancel_fee_kz),
      surge_cap: String(s.setting.surge_cap),
      trial_trip_limit: String(s.setting.trial_trip_limit),
    });
    if (!r.error) {
      const rows = (r.data ?? []) as TripMoney[];
      setRevenue({
        trips: rows.length,
        gross: rows.reduce((a, x) => a + x.price_kz, 0),
        commission: rows.reduce((a, x) => a + x.commission_kz, 0),
        keeps: rows.reduce((a, x) => a + x.driver_keeps_kz, 0),
      });
    } else {
      setRevenue(null);
    }
  };

  useEffect(() => { void read(); }, []);

  const bad = (key: string): string | null => {
    const lim = LIMITS[key];
    if (!lim) return null;
    const v = Number(draft[key]);
    if (draft[key] === '' || !Number.isFinite(v)) return 'escreva um número';
    if (v < lim[0] || v > lim[1]) return `entre ${lim[0]} e ${lim[1]}`;
    const step = lim[2] ?? 1;
    if (Math.abs(Math.round(v / step) * step - v) > 1e-9) return `de ${step} em ${step}`;
    if (step >= 1 && !Number.isInteger(v)) return 'sem casas decimais';
    return null;
  };

  const errors = Object.keys(LIMITS).map((k) => [k, bad(k)] as const).filter(([, e]) => e);
  const dirty = setting
    ? Object.keys(LIMITS).filter((k) => Number(draft[k]) !== Number(setting[k as keyof Setting]))
    : [];

  const save = async () => {
    if (!setting || busy || errors.length || !dirty.length) return;
    setBusy(true);
    const patch: Partial<Setting> = {};
    for (const k of dirty) {
      (patch as Record<string, unknown>)[k] = k === 'surge_cap' ? Number(draft[k]) : Math.round(Number(draft[k]));
    }
    const err = await saveSetting(patch);
    setBusy(false);
    if (err) { onError(err); return; }
    setNotice('Guardado. Vale para as viagens pedidas a partir de agora.');
    void read();
  };

  const toggleGrace = async () => {
    if (!setting || busy) return;
    setBusy(true);
    const until = graceEnds(setting)
      ? 0
      : Date.now() + 30 * 86400000;
    const err = await saveSetting({ launch_commission_until: until });
    setBusy(false);
    if (err) { onError(err); return; }
    setNotice(until
      ? 'Graça ligada por 30 dias: comissão 0 % nas próximas viagens.'
      : 'Graça terminada: a comissão aplica-se às próximas viagens.');
    void read();
  };

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-600 dark:text-zinc-300">
        <Loader2 className="w-4 h-4 animate-spin" /> a ler as condições da praça…
      </p>
    );
  }

  if (failed) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Não conseguimos ler as condições.
        </p>
        <p className="text-[12px] text-amber-900 dark:text-amber-200 mt-1">{failed}</p>
        <button onClick={() => void read()} className="mt-3 h-10 px-4 rounded-2xl text-sm font-bold bg-amber-900 text-white dark:bg-amber-200 dark:text-amber-950">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!setting) {
    return (
      <p className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-4 text-sm text-zinc-600 dark:text-zinc-300">
        A linha de condições não existe neste projeto. Sem ela o servidor não tem
        comissão definida — é uma linha por inserir em SQL, não um número a
        inventar aqui.
      </p>
    );
  }

  const now = Date.now();
  const inGrace = !!graceEnds(setting, now);
  const split = marginSplit(1000, setting, now);

  return (
    <section className="rounded-3xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-zinc-50 dark:active:bg-zinc-800/60"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <Percent className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-zinc-900 dark:text-white">Condições e lucro da Elara</span>
            <span className="block text-[12px] text-zinc-600 dark:text-zinc-400 truncate">
              {inGrace
                ? `Graça até ${graceEnds(setting)} — comissão 0 Kz`
                : `${setting.commission_pct} % · ${formatKz(split.commissionKz)} numa viagem de Kz 1.000`}
            </span>
          </span>
        </span>
        <ChevronDown className={cn('w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {revenue && (
            <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-3">
              <p className="flex items-center gap-2 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                <TrendingUp className="w-4 h-4" /> Últimas {revenue.trips} viagens fechadas
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Passageiro pagou', formatKz(revenue.gross)],
                  ['Motorista ficou', formatKz(revenue.keeps)],
                  ['Elara (comissão)', formatKz(revenue.commission)],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <p className="text-[13px] font-bold text-zinc-900 dark:text-white leading-tight">{v}</p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">{k}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-2">
                Números do que já aconteceu, não previsão. A comissão de 0 Kz
                quer dizer graça de lançamento a contar, não erro de leitura.
              </p>
            </div>
          )}
          {!revenue && (
            <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
              Não conseguimos contar as viagens fechadas — o que está abaixo é o
              que a app cobra, não o que já entrou.
            </p>
          )}

          <div className="space-y-3">
            {Object.keys(LIMITS).map((k) => {
              const e = bad(k);
              return (
                <label key={k} className="block">
                  <span className="text-[12px] font-semibold text-zinc-900 dark:text-white">{LABELS[k][0]}</span>
                  <input
                    value={draft[k] ?? ''}
                    onChange={(ev) => setDraft((d) => ({ ...d, [k]: ev.target.value }))}
                    inputMode={k === 'surge_cap' ? 'decimal' : 'numeric'}
                    aria-label={LABELS[k][0]}
                    className={cn(FIELD, 'mt-1', e && 'border-red-300 dark:border-red-900')}
                  />
                  <span className={cn('block text-[11px] mt-1', e ? 'text-red-700 dark:text-red-300' : 'text-zinc-600 dark:text-zinc-400')}>
                    {e ?? LABELS[k][1]}
                  </span>
                </label>
              );
            })}
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              Tecto efectivo de pico: {Math.round((effectivePeak(Number(draft.surge_cap) || 1) - 1) * 100)} %
              {' '}(o servidor usa `least(1.1, {draft.surge_cap || 1})`, por isso valores acima de 1,1 não mudam nada).
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-800">
            {EXAMPLES.map((p) => {
              const s = marginSplit(p, { ...setting, ...Object.fromEntries(
                Object.keys(LIMITS).map((k) => [k, Number(draft[k]) || 0]),
              ) } as Setting, now);
              return (
                <div key={p} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[13px] text-zinc-600 dark:text-zinc-300">viagem de {formatKz(p)}</span>
                  <span className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                    Elara {formatKz(s.commissionKz)} · motorista {formatKz(s.driverKeepsKz)}
                  </span>
                </div>
              );
            })}
          </div>

          {notice && (
            <p role="status" className="rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 px-3 py-2.5 text-[13px] font-semibold text-purple-800 dark:text-purple-200">
              {notice}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={() => void save()}
              disabled={busy || !!errors.length || !dirty.length}
              className={cn(
                'btn-main h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2',
                OFF_ATTR,
              )}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {dirty.length ? `Guardar ${dirty.length} alteração(ões)` : 'Sem alterações'}
            </button>
            <button
              onClick={() => void toggleGrace()}
              disabled={busy}
              className={cn(
                'h-12 rounded-2xl text-sm font-semibold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center justify-center gap-2',
                OFF_ATTR,
              )}
            >
              <PencilLine className="w-4 h-4" />
              {inGrace ? 'Terminar a graça e começar a cobrar' : 'Dar 30 dias de graça'}
            </button>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              Só uma conta de equipa escreve aqui. Estas condições valem para as
              viagens pedidas depois de guardar; as viagens em curso mantêm o
              preço com que nasceram. Nada na app move dinheiro: o pagamento é a
              bordo e a comissão acerta-se com a equipa.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
