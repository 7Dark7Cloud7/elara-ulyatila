import { useCallback, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, ChevronDown, Gift, Loader2, MessageSquare, ShieldCheck, StopCircle, Users } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import type { ChatMessage, Driver, MoneyRequest, VehicleClass, Zone } from '../types';
import { STATE_LABEL } from '../lib/trips';
import {
  REPORT_STATE_LABEL, REPORT_STATE_TONE, cleanOutcome, isMissingColumn,
  reportLabel, type ReportState,
} from '../lib/reports';
import { decideReferral, listReferrals, referralsLive, type Referral } from '../lib/extras';
import { isAccountRequest } from '../lib/dataexport';
import { cn, when, OFF } from '../lib/utils';
import { formatKz } from '../lib/money';
import { Sheet } from './Sheet';
import { LiveBoard } from './LiveBoard';
import { MarginPanel } from './MarginPanel';

/**
 * Aconsolida o que a equipa (1 a 3 pessoas) precisa de ver: candidaturas,
 * documentos conferidos ao vivo, o que os passageiros reportam e o dinheiro à
 * espera de confirmação.
 *
 * Sem milagres de backoffice: cada decisão é uma linha escrita no servidor, e
 * nada aqui promete vigilância que não existe. Aprovar um motorista é o que
 * põe carros no mapa — até lá, o mapa diz honestamente que não há ninguém ligado.
 */

interface DocRow {
  driver_id: string;
  bi: boolean;
  licence: boolean;
  logbook: boolean;
  insurance: boolean;
  criminal_record: boolean;
  car_photos: boolean;
  selfie_checked: boolean;
}

interface ReportRow {
  id: string;
  trip_id: string | null;
  by_id: string;
  by_role: 'passenger' | 'driver';
  reason: string;
  text: string;
  state: ReportState;
  at: number;
  resolved_at: number | null;
  outcome: string | null;
}

/** O processo da viagem, para a equipa decidir com o caso à frente. */
interface CaseRow {
  id: string;
  code: string;
  kind: string;
  state: string;
  from_zone_id: string;
  to_zone_id: string;
  price_kz: number;
  passenger_name: string;
}

type TeamDriver = Driver & { tr_driver_doc: DocRow | null };

const DOCS: [keyof Omit<DocRow, 'driver_id'>, string][] = [
  ['bi', 'BI'],
  ['licence', 'Carta'],
  ['logbook', 'Título do veículo'],
  ['insurance', 'Seguro'],
  ['criminal_record', 'Registo criminal'],
  ['car_photos', 'Fotos do carro'],
  ['selfie_checked', 'Condutor visto'],
];

const DECISION_LABEL: Record<string, string> = {
  pending: 'Aprovada', approved: 'Aprovada', suspended: 'Suspenso', banned: 'Banido',
};

const CHAT_WHO: Record<ChatMessage['sender_role'], string> = {
  passenger: 'Passageiro', driver: 'Motorista', system: 'Elara',
};

/** Os motivos das duas pontas, os que a app escreve sozinha e os pedidos da
 *  conta vivem em `lib/reports`, para a consola e o ecrã da pessoa dizerem o
 *  mesmo com as mesmas palavras. */

const statusTone = (s: Driver['status']) =>
  s === 'approved'
    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
    : s === 'pending'
      ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300';

interface TeamConsoleProps {
  open: boolean;
  onClose: () => void;
  zones: Zone[];
  classes: VehicleClass[];
  onError: (message: string) => void;
}

export function TeamConsole({ open, onClose, zones, classes, onError }: TeamConsoleProps) {
  const [drivers, setDrivers] = useState<TeamDriver[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [money, setMoney] = useState<MoneyRequest[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  // A conversa da viagem reportada: é isto que permite decidir com o caso à
  // frente, em vez de Suspender por intuição.
  const [chatFor, setChatFor] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[] | null>(null);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  // A fila de convites só aparece com a migração 0005 aplicada.
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [refsOn, setRefsOn] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, r, m] = await Promise.all([
      supabase.from('tr_driver').select('*, tr_driver_doc(*)').order('created_at', { ascending: false }).limit(100),
      supabase.from('tr_report').select('*').order('at', { ascending: false }).limit(50),
      supabase.from('tr_money_request').select('*').eq('state', 'pending').order('at', { ascending: true }).limit(80),
    ]);
    setLoading(false);
    if (d.error) { onError(rpcError(d.error)); return; }
    setDrivers((d.data as TeamDriver[]) ?? []);
    setReports((r.data as ReportRow[]) ?? []);
    setMoney((m.data as MoneyRequest[]) ?? []);
  }, [onError]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Fila de convites: tabela nova, por isso sondada. Sem a 0005 a secção
  // simplesmente não existe, exactamente como antes.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    referralsLive().then(async (live) => {
      if (!alive || !live) return;
      const rows = await listReferrals();
      if (!alive) return;
      setRefsOn(true);
      setReferrals(rows ?? []);
    });
    return () => { alive = false; };
  }, [open]);

  const decide = async (id: string, decision: 'approved' | 'suspended' | 'banned') => {
    setBusy(id);
    const { error } = await supabase.rpc('tr_review_driver', { p_driver_id: id, p_decision: decision });
    setBusy(null);
    if (error) { onError(rpcError(error)); return; }
    onError(`Decisão registada: ${DECISION_LABEL[decision]}.`);
    load();
  };

  const tick = async (doc: DocRow, field: keyof Omit<DocRow, 'driver_id'>, value: boolean) => {
    setBusy(doc.driver_id);
    const { error } = await supabase
      .from('tr_driver_doc')
      .update({ [field]: value, updated_at: Date.now() })
      .eq('driver_id', doc.driver_id);
    setBusy(null);
    if (error) { onError(rpcError(error)); return; }
    setDrivers((rows) => rows.map((row) => (
      row.tr_driver_doc?.driver_id === doc.driver_id
        ? { ...row, tr_driver_doc: { ...doc, [field]: value } }
        : row
    )));
  };

  /** A decisão da equipa sobre um reporte. `outcome` é a única frase que quem
   *  reportou consegue ler, por isso escreve-se junto com o estado, nunca
   *  depois: um «resolvido» sem resposta é o silêncio que já havia. */
  const setReport = async (rep: ReportRow, state: ReportState) => {
    setBusy(rep.id);
    const typed = (reason[rep.id] ?? '').trim();
    const outcome = state === 'resolved'
      ? cleanOutcome(typed || rep.outcome || '')
      : state === 'review' ? cleanOutcome(typed) : null;
    const stamp = state === 'resolved' ? Date.now() : null;
    let nota = outcome;
    let { error } = await supabase.from('tr_report')
      .update({ state, resolved_at: stamp, outcome })
      .eq('id', rep.id);
    if (error && isMissingColumn(error)) {
      // O servidor pode não ter a coluna da nota. A decisão fica na mesma.
      const again = await supabase.from('tr_report')
        .update({ state, resolved_at: stamp }).eq('id', rep.id);
      error = again.error;
      nota = null;
    }
    setBusy(null);
    if (error) { onError(rpcError(error)); return; }
    setReports((rows) => rows.map((x) => (
      x.id === rep.id ? { ...x, state, resolved_at: stamp, outcome: nota } : x
    )));
    if (typed) setReason((r) => ({ ...r, [rep.id]: '' }));
    onError(state === 'resolved'
      ? (typed && !nota
        ? 'Reporte fechado. A nota não coube no servidor — escreva-a no apoio.'
        : 'Reporte fechado. A pessoa vê o estado e a nota na app dela.')
      : state === 'review' ? 'Reporte marcado como em análise.' : 'Reporte reaberto.');
  };

  const openChat = async (tripId: string | null) => {
    if (!tripId) return;
    if (chatFor === tripId) { setChatFor(null); return; }
    setChatFor(tripId);
    setChat(null);
    setCaseRow(null);
    setChatBusy(true);
    const [messages, trip] = await Promise.all([
      supabase
        .from('tr_chat_message')
        .select('id, trip_id, sender_role, text, blocked, at')
        .eq('trip_id', tripId)
        .order('at', { ascending: true })
        .limit(80),
      supabase
        .from('tr_trip')
        .select('id, code, kind, state, from_zone_id, to_zone_id, price_kz, passenger_name')
        .eq('id', tripId)
        .maybeSingle(),
    ]);
    setChatBusy(false);
    if (messages.error) { onError(rpcError(messages.error)); setChatFor(null); return; }
    setChat((messages.data as ChatMessage[]) ?? []);
    setCaseRow((trip.data as CaseRow) ?? null);
  };

  const pending = drivers.filter((d) => d.status === 'pending');
  const openReports = reports.filter((r) => r.state !== 'resolved');
  const doneReports = reports.filter((r) => r.state === 'resolved');
  const pendingMoney = money.filter((m) => m.state === 'pending');
  const pendingRefs = referrals.filter((r) => r.status === 'pending');

  // O painel «Agora» conta os motoristas ligados a partir da frota que já está
  // carregada aqui — uma linha no ecrã sem um pedido extra ao servidor.
  const frota = drivers.filter((d) => d.status === 'approved');
  const onlineNow = frota.filter((d) => d.online).length;

  // O nome aparece quando é um motorista nosso (já está carregado aqui). Um
  // passageiro é só «Passageiro»: esta consola não é um cadastro de pessoas.
  const whoName = (who: string) =>
    drivers.find((d) => d.account_id === who)?.public_name ?? 'Passageiro';

  const resolveMoney = async (req: MoneyRequest, approve: boolean) => {
    setBusy(req.id);
    const { error } = await supabase.rpc('tr_resolve_money_request', {
      p_request_id: req.id,
      p_approve: approve,
      p_reason: approve ? null : (reason[req.id]?.trim() || null),
    });
    setBusy(null);
    if (error) { onError(rpcError(error)); return; }
    setMoney((rows) => rows.map((x) => (
      x.id === req.id
        ? { ...x, state: approve ? 'confirmed' as const : 'rejected' as const, resolved_at: Date.now() }
        : x
    )));
    onError(approve
      ? `${req.direction === 'in' ? 'Recarga' : 'Levantamento'} de ${formatKz(req.amount_kz)} confirmado na carteira.`
      : 'Pedido recusado. A pessoa vê o motivo na carteira dela.');
  };

  const decideRef = async (row: Referral, confirm: boolean) => {
    setBusy(row.id);
    const msg = await decideReferral(row.id, confirm, (reason[row.id] ?? '').trim());
    setBusy(null);
    if (msg) { onError(msg); return; }
    setReferrals((rows) => rows.map((x) => (
      x.id === row.id ? { ...x, status: confirm ? 'confirmed' as const : 'rejected' as const } : x
    )));
    onError(confirm
      ? 'Convite confirmado. O crédito entra pelo fluxo de dinheiro, se houver dinheiro a entrar.'
      : 'Convite recusado.');
  };

  return (
    <Sheet open={open} title="Equipa Elara" onClose={onClose} tall>
      {loading && !drivers.length ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" /> a carregar a frota…
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2">
            {[
              ['À espera', pending.length],
              ['Aprovados', drivers.filter((d) => d.status === 'approved').length],
              ['Reportes', openReports.length],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-3 text-center">
                <p className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{n}</p>
                <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
              </div>
            ))}
          </div>

          <LiveBoard zones={zones} onlineNow={onlineNow} driversTotal={frota.length} />

          <MarginPanel onError={onError} />

          {!pending.length && (
            <p className="flex items-center gap-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-4 text-sm font-bold text-zinc-600 dark:text-zinc-300">
              <Users className="w-4 h-4 shrink-0" />
              Nenhuma candidatura à espera. Sem motorista aprovado não há carros no mapa — e não mostramos carros que não existem.
            </p>
          )}

          {pending.map((d) => {
            const doc = d.tr_driver_doc;
            const missing = doc ? DOCS.filter(([f]) => !doc[f]).length : DOCS.length;
            return (
              <div
                key={d.id}
                className="rounded-3xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-900 dark:text-white truncate">{d.public_name}</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                      {d.plate} · {d.model} {d.year} · {classes.find((c) => c.id === d.class_id)?.label ?? d.class_id}
                    </p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {zones.find((z) => z.id === d.home_zone_id)?.name ?? d.home_zone_id} · {d.province} · pediu {when(d.created_at)}
                    </p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold', statusTone(d.status))}>
                    {d.status === 'pending' ? 'novo' : DECISION_LABEL[d.status]}
                  </span>
                </div>

                {/* O que a equipa confirma ao vivo, uma caixinha por documento. */}
                {doc && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {DOCS.map(([field, label]) => (
                      <button
                        key={field}
                        onClick={() => tick(doc, field, !doc[field])}
                        disabled={busy === d.id}
                        aria-pressed={doc[field]}
                        className={cn(
                          'rounded-full px-2.5 py-1.5 text-[12px] font-semibold border flex items-center gap-1.5 transition-colors',
                          doc[field]
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400',
                        )}
                      >
                        {doc[field] ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    onClick={() => decide(d.id, 'approved')}
                    disabled={busy === d.id || missing > 0}
                    className={cn(
                      'btn-main h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2',
                      (missing > 0 || busy === d.id) && OFF,
                    )}
                  >
                    {busy === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Aprovar
                  </button>
                  <button
                    onClick={() => decide(d.id, 'banned')}
                    disabled={busy === d.id}
                    className="h-12 rounded-2xl font-bold text-sm border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center gap-2"
                  >
                    <StopCircle className="w-4 h-4" /> Rejeitar
                  </button>
                </div>
                {missing > 0 && (
                  <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400 mt-2">
                    Falta confirmar {missing} documento{missing > 1 ? 's' : ''} — só se aprova com a ficha completa.
                  </p>
                )}
              </div>
            );
          })}

          {drivers.filter((d) => d.status !== 'pending').length > 0 && (
            <div>
              <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                Frota revista
              </p>
              <div className="space-y-1.5">
                {drivers.filter((d) => d.status !== 'pending').map((d) => (
                  <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-zinc-900 dark:text-white truncate">
                        {d.public_name} · {d.plate}
                      </p>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        {d.trips} viagens · {d.online ? 'ligado agora' : 'desligado'}
                        {d.trial_trips_left > 0 ? ` · teste: ${d.trial_trips_left}` : ''}
                      </p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold', statusTone(d.status))}>
                      {DECISION_LABEL[d.status]}
                    </span>
                    {d.status === 'approved' ? (
                      <button
                        onClick={() => decide(d.id, 'suspended')}
                        disabled={busy === d.id}
                        aria-label={`Suspender ${d.public_name}`}
                        className="tap-pad text-zinc-500 dark:text-zinc-400"
                      >
                        <StopCircle className="w-5 h-5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => decide(d.id, 'approved')}
                        disabled={busy === d.id}
                        className="text-[12px] font-semibold text-purple-600 dark:text-purple-400 tap-pad"
                      >
                        Reativar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              <Banknote className="w-3.5 h-3.5" /> Dinheiro à espera
              {pendingMoney.length > 0 && (
                <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                  {pendingMoney.length}
                </span>
              )}
            </p>
            {!pendingMoney.length ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum pedido por confirmar.</p>
            ) : (
              <div className="space-y-2">
                {pendingMoney.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                        {req.direction === 'in' ? 'Recarga' : 'Levantamento'} · {formatKz(req.amount_kz)}
                      </p>
                      <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 shrink-0">{when(req.at)}</span>
                    </div>
                    <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {whoName(req.who)} · {req.role === 'driver' ? 'motorista' : 'passageiro'} · {req.method}
                    </p>
                    <input
                      value={reason[req.id] ?? ''}
                      onChange={(e) => setReason((r) => ({ ...r, [req.id]: e.target.value }))}
                      placeholder="Motivo, se recusar (a pessoa lê isto)"
                      maxLength={120}
                      className="mt-2 w-full h-10 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-700 px-3 text-[12px] font-bold text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none focus:border-purple-500"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => resolveMoney(req, true)}
                        disabled={busy === req.id}
                        className={cn(
                          'btn-main flex-1 h-10 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5',
                          busy === req.id && OFF,
                        )}
                      >
                        {busy === req.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <CheckCircle2 className="w-4 h-4" />}
                        Confirmar
                      </button>
                      <button
                        onClick={() => resolveMoney(req, false)}
                        disabled={busy === req.id}
                        className="h-10 px-3 rounded-xl text-[12px] font-semibold border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-[12px] font-medium text-amber-800 dark:text-amber-300">
                  Confirme só depois de o dinheiro ter mudado de mão de verdade: isto escreve o
                  movimento na carteira, não transfere nem recebe nada por si.
                </p>
              </div>
            )}
          </div>

          {/* Convites: uma fila de revisão, nunca um saldo automático. */}
          {refsOn && (
            <div>
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                <Gift className="w-3.5 h-3.5" /> Convites à espera
                {pendingRefs.length > 0 && (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                    {pendingRefs.length}
                  </span>
                )}
              </p>
              {!pendingRefs.length ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum convite por decidir.</p>
              ) : (
                <div className="space-y-2">
                  {pendingRefs.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                          {row.code}
                        </p>
                        <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 shrink-0">{when(row.at)}</span>
                      </div>
                      <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {whoName(row.who)} · quem usou o código
                      </p>
                      <input
                        value={reason[row.id] ?? ''}
                        onChange={(e) => setReason((r) => ({ ...r, [row.id]: e.target.value }))}
                        placeholder="Nota da decisão (guarda-se no registo)"
                        maxLength={140}
                        className="mt-2 w-full h-10 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-700 px-3 text-[12px] font-bold text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none focus:border-purple-500"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => decideRef(row, true)}
                          disabled={busy === row.id}
                          className={cn(
                            'btn-main flex-1 h-10 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5',
                            busy === row.id && OFF,
                          )}
                        >
                          {busy === row.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <CheckCircle2 className="w-4 h-4" />}
                          Confirmar
                        </button>
                        <button
                          onClick={() => decideRef(row, false)}
                          disabled={busy === row.id}
                          className="h-10 px-3 rounded-xl text-[12px] font-semibold border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
                        >
                          Recusar
                        </button>
                      </div>
                    </div>
                  ))}
                  <p className="text-[12px] font-medium text-amber-800 dark:text-amber-300">
                    Confirmar um convite não dá saldo a ninguém. A nota fica no registo, e o
                    crédito — se houver — entra pelo fluxo de dinheiro acima.
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              Reportes
            </p>
            {!openReports.length ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Nada aberto. Bom sinal.</p>
            ) : (
              <div className="space-y-2">
                {openReports.map((rep) => (
                  <div key={rep.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                        {reportLabel(rep.reason)}
                      </p>
                      <span className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold',
                        REPORT_STATE_TONE[rep.state],
                      )}>
                        {REPORT_STATE_LABEL[rep.state]}
                      </span>
                    </div>
                    <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {when(rep.at)} · {whoName(rep.by_id)}
                    </p>
                    <p className="text-[12px] font-semibold text-purple-700 dark:text-purple-300 mt-0.5">
                      {isAccountRequest(rep.reason)
                        ? 'Pedido da conta'
                        : rep.by_role === 'driver' ? 'Denúncia de motorista' : 'Denúncia de passageiro'}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">{rep.text}</p>
                    {rep.trip_id && (
                      <>
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">Viagem {rep.trip_id}</p>
                        <button
                          onClick={() => openChat(rep.trip_id)}
                          className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-purple-700 dark:text-purple-300 tap-pad"
                        >
                          {chatBusy && chatFor === rep.trip_id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <MessageSquare className="w-3.5 h-3.5" />}
                          {chatFor === rep.trip_id ? 'Fechar o processo' : 'Abrir o processo desta viagem'}
                        </button>
                        {chatFor === rep.trip_id && caseRow && (
                          <div className="mt-2 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-700 p-2.5">
                            <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                              Viagem {caseRow.code} · {STATE_LABEL[caseRow.state as keyof typeof STATE_LABEL] ?? caseRow.state}
                            </p>
                            <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                              {zones.find((z) => z.id === caseRow.from_zone_id)?.name ?? caseRow.from_zone_id} →{' '}
                              {zones.find((z) => z.id === caseRow.to_zone_id)?.name ?? caseRow.to_zone_id} ·{' '}
                              {caseRow.kind === 'entrega' ? 'Entrega' : caseRow.passenger_name} · {formatKz(caseRow.price_kz)}
                            </p>
                          </div>
                        )}
                        {chatFor === rep.trip_id && !chatBusy && (
                          !chat?.length ? (
                            <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-1.5">
                              Nada foi dito nesta viagem.
                            </p>
                          ) : (
                            <ul className="mt-2 max-h-72 overflow-y-auto overscroll-contain space-y-2 border-l-2 border-zinc-200 dark:border-zinc-700 pl-2.5">
                              {chat.map((m) => (
                                <li key={m.id}>
                                  <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
                                    {CHAT_WHO[m.sender_role]} · {when(m.at)}
                                  </p>
                                  <p className="text-[12px] font-bold text-zinc-700 dark:text-zinc-200 break-words">
                                    {m.text}
                                  </p>
                                  {m.blocked && (
                                    <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400">
                                      Texto ajustado automaticamente: {m.blocked}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )
                        )}
                      </>
                    )}
                    <input
                      value={reason[rep.id] ?? ''}
                      onChange={(e) => setReason((r) => ({ ...r, [rep.id]: e.target.value }))}
                      placeholder="Nota para a pessoa ler (opcional)"
                      maxLength={200}
                      className="mt-3 w-full h-10 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-700 px-3 text-[12px] font-bold text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none focus:border-purple-500"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setReport(rep, 'review')}
                        disabled={busy === rep.id}
                        className="h-9 px-3 rounded-xl text-[12px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                      >Em análise</button>
                      <button
                        onClick={() => setReport(rep, 'resolved')}
                        disabled={busy === rep.id}
                        className="h-9 px-3 rounded-xl text-[12px] font-semibold bg-purple-600 text-white"
                      >Resolvido</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* O que já foi fechado fica visível e reabrível. Com uma equipa de
                três pessoas um «resolvido» por engano acontece, e sem esta
                lista o reporte desaparecia da consola sem rasto. */}
            {!!doneReports.length && (
              <div className="mt-3">
                <button
                  onClick={() => setShowDone((v) => !v)}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-purple-700 dark:text-purple-300 tap-pad"
                >
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showDone && 'rotate-180')} />
                  {showDone ? 'Ocultar' : 'Ver'} {doneReports.length} resolvido{doneReports.length > 1 ? 's' : ''}
                </button>
                {showDone && (
                  <ul className="mt-2 space-y-1.5">
                    {doneReports.map((rep) => (
                      <li
                        key={rep.id}
                        className="rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 py-2.5 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-zinc-900 dark:text-white truncate">
                            {reportLabel(rep.reason)} · {whoName(rep.by_id)}
                          </p>
                          <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                            {rep.resolved_at ? when(rep.resolved_at) : when(rep.at)}
                            {rep.outcome ? ` · ${rep.outcome}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => setReport(rep, 'review')}
                          disabled={busy === rep.id}
                          className="shrink-0 text-[12px] font-semibold text-purple-700 dark:text-purple-300 tap-pad"
                        >
                          Reabrir
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            As decisões ficam no servidor com data. Nada nesta consola envia dados a terceiros.
          </p>
        </div>
      )}
    </Sheet>
  );
}
