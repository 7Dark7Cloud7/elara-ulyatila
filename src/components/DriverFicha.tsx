import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CarFront, Check, ChevronLeft, CircleCheck, Loader2, SearchCode } from 'lucide-react';
import { supabase, rpcError } from '../lib/supabase';
import type { SessionUser, VehicleClass, Zone } from '../types';
import { ZonePicker } from './ZonePicker';
import { ClassPicker } from './ClassPicker';
import { VehicleArt, vehicleKindFor } from './VehicleArt';
import { DriverRehearsal, type Preview } from './DriverRehearsal';
import { displayPlate, parsePlate, plateIssues, plateSummary } from '../lib/plates';
import { plateTaken, publicNameOf } from '../lib/drivers';
import { cn, APOIO_DISPLAY, APOIO_PHONE, OFF } from '../lib/utils';

interface FichaProps {
  user: SessionUser;
  zones: Zone[];
  classes: VehicleClass[];
  onDone: () => void;
  onError: (message: string) => void;
}

/** As quatro coisas que uma pessoa pode declarar sem ninguém lhe pedir um papel. */
const DECLARATIONS = [
  { id: 'licence', text: 'Tenho licença de condução válida para este tipo de carro, com a categoria certa.' },
  { id: 'logbook', text: 'O livrete está no meu nome, ou tenho autorização do dono para trabalhar com o carro.' },
  { id: 'insurance', text: 'O seguro está válido e o papel vai dentro do carro.' },
  { id: 'plate', text: 'A matrícula que escrevi é a do carro que está na rua — não é a de um primo, nem uma que inventei.' },
] as const;

const STEPS = ['O carro', 'A praça', 'A declaração', 'Assim vai ser'] as const;

/**
 * A ficha de motorista, em passos, com a chapa conferida contra a lei (Decreto
 * Presidencial 202/16) antes de a pessoa enviar seja o que for.
 *
 * O que a app pode saber sem registo nenhum: a **forma** da matrícula, a
 * província do código, se a chapa bate com a praça e com o ano, e se ela já
 * está noutra conta Elara (há índice único na matrícula desde a migração 0003).
 * O que a app não sabe, e diz: se o carro é mesmo dele, se o seguro é verdadeiro,
 * se os papéis existem. Isso é uma pessoa da equipa a olhar para o livrete — por
 * isso a declaração entra na base como «auto-prestada», nunca como «verificada».
 */
export function DriverFicha({ user, zones, classes, onDone, onError }: FichaProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user.name);
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [classId, setClassId] = useState<string | null>('economico');
  const [homeZone, setHomeZone] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [dup, setDup] = useState<'idle' | 'checking' | 'clear' | 'taken' | 'unknown'>('idle');
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState(false);

  useEffect(() => {
    if (zones.length && !homeZone) setHomeZone('z-mutamba');
  }, [zones, homeZone]);

  const parsed = useMemo(() => parsePlate(plate), [plate]);
  const zone = zones.find((z) => z.id === homeZone) ?? null;
  const picked = classes.find((c) => c.id === classId) ?? null;
  const issues = useMemo(
    () => plateIssues(parsed, { province: zone?.province ?? null, year: year ? Number(year) : null }),
    [parsed, zone, year],
  );
  const errors = issues.filter((i) => i.level === 'erro');
  const warnings = issues.filter((i) => i.level === 'aviso');
  const summary = plateSummary(parsed);
  const declared = DECLARATIONS.every((d) => ticks[d.id]);

  // A duplicata pergunta-se ao sair do campo: enquanto se escreve não vale a
  // pena incomodar o servidor, e um toque no meio do telemóvel não é uma chapa.
  const checkDup = async () => {
    if (!parsed.ok) { setDup('idle'); return; }
    setDup('checking');
    const r = await plateTaken(parsed.value);
    setDup(r.taken ? 'taken' : r.checked ? 'clear' : 'unknown');
  };

  const stepOk = [
    parsed.ok && errors.length === 0 && dup !== 'taken' && model.trim().length >= 2 && /^\d{4}$/.test(year),
    !!homeZone,
    name.trim().length >= 3 && declared,
    true,
  ][step];

  const preview: Preview = {
    publicName: publicNameOf(name),
    plate: displayPlate(parsed.value),
    model: model.trim(),
    year,
    classId: picked?.id ?? 'economico',
    classLabel: picked?.label ?? 'Carro',
    classIcon: picked?.icon,
    classMinKz: picked?.min_kz ?? null,
    zoneName: zone?.name ?? null,
    province: zone?.province ?? null,
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('tr_apply_driver', {
      p_name: name.trim(),
      p_plate: parsed.value || plate.trim().toUpperCase(),
      p_model: model.trim(),
      p_year: Number(year),
      p_class_id: classId,
      p_home_zone_id: homeZone,
      p_declares: true,
    });
    if (error) { setBusy(false); onError(rpcError(error)); return; }
    const id = (data as { id?: string } | null)?.id ?? null;
    // A declaração entra na ficha do motorista como o que é: auto-prestada. Os
    // campos da equipa (BI visto, fotos, selfie) ficam falsos até ela ver.
    if (id) {
      const { error: docError } = await supabase
        .from('tr_driver_doc')
        .update({ licence: true, logbook: true, insurance: true, updated_at: Date.now() })
        .eq('driver_id', id);
      if (docError) onError('A candidatura entrou. Não foi possível registar a declaração na sua ficha — escreva-a no chat com a equipa.');
    }
    setBusy(false);
    onDone();
  };

  if (sim) return <DriverRehearsal preview={preview} onClose={() => setSim(false)} />;

  return (
    <div className="animate-enter space-y-4">
      {/* Passos: o título de cada um cabe em 360 px porque são quatro palavras. */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className={cn('h-1 rounded-full', i <= step ? 'bg-purple-600' : 'bg-zinc-200 dark:bg-zinc-700')} />
            <span className={cn(
              'truncate text-[12px] font-semibold',
              i === step ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400',
            )}>
              {i + 1}. {s}
            </span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
          <div className="relative flex items-end justify-center h-[96px] bg-gradient-to-b from-purple-100 to-white dark:from-purple-950/60 dark:to-zinc-900">
            <VehicleArt
              kind={vehicleKindFor(picked?.id ?? 'economico', picked?.icon)}
              label={picked?.label ?? 'Carro'}
              className="w-[190px] h-auto translate-y-[8px] animate-drive"
            />
            <span className="absolute top-3 left-4 flex items-center gap-1.5 text-[12px] font-semibold text-purple-700 dark:text-purple-300">
              <BadgeCheck className="w-4 h-4" /> {picked?.label ?? 'Categoria'}
            </span>
          </div>
          <div className="p-5 pt-4 space-y-3">
            <div>
              <label className="block text-[12px] font-semibold text-zinc-500 dark:text-zinc-400" htmlFor="ficha-plate">
                Matrícula do carro
              </label>
              <input
                id="ficha-plate"
                value={plate}
                onChange={(e) => { setPlate(e.target.value.toUpperCase()); setDup('idle'); }}
                onBlur={() => void checkDup()}
                placeholder="LDA-00-01-AA"
                autoCapitalize="characters"
                autoComplete="off"
                className={cn(fieldCls, 'mt-1 tracking-wide', dup === 'taken' && 'border-red-400 focus:border-red-400')}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {parsed.value && summary && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-purple-700 dark:text-purple-300">
                    <CircleCheck className="w-3.5 h-3.5" /> {summary}
                  </span>
                )}
                {parsed.value && !parsed.ok && (
                  <span className="text-[12px] font-semibold text-red-700 dark:text-red-300">forma não reconhecida</span>
                )}
                {dup === 'checking' && (
                  <span className="flex items-center gap-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> a ver na Elara…
                  </span>
                )}
                {dup === 'clear' && (
                  <span className="flex items-center gap-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                    <SearchCode className="w-3.5 h-3.5" /> sem outra conta da Elara com esta chapa
                  </span>
                )}
                {dup === 'unknown' && (
                  <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                    não consegui confirmar na base — a app verifica na mesma ao enviar
                  </span>
                )}
              </div>
            </div>

            {errors.map((i) => (
              <p key={i.text} className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-2.5 text-[12px] font-bold leading-snug text-red-800 dark:text-red-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {i.text}
              </p>
            ))}
            {warnings.map((i) => (
              <p key={i.text} className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-2.5 text-[12px] font-bold leading-snug text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {i.text}
              </p>
            ))}
            {dup === 'taken' && (
              <p className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-2.5 text-[12px] font-bold leading-snug text-red-800 dark:text-red-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                Esta matrícula já está noutra conta da Elara. Se o carro passou a ser
                seu, fale com a equipa no WhatsApp {APOIO_DISPLAY} antes de enviar.
              </p>
            )}

            <div className="grid grid-cols-[1fr_5.5rem] gap-3">
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                aria-label="Marca e modelo"
                placeholder="Marca e modelo (ex.: Toyota Corolla)"
                className={fieldCls}
              />
              <input
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                aria-label="Ano do carro"
                placeholder="2018"
                inputMode="numeric"
                className={cn(fieldCls, 'text-center')}
              />
            </div>
          </div>
        </div>
      )}

      {step === 0 && (
        <div>
          <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 px-1 mb-2">Em que categoria trabalha?</p>
          <ClassPicker classes={classes} value={classId} onChange={setClassId} />
        </div>
      )}

      {step === 1 && (
        <div className="rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-5 space-y-3 shadow-sm">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white leading-tight">A sua praça</h2>
          <p className="text-[13px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">
            É o bairro onde costuma esperar passageiros. O preço de cada viagem é
            calculado entre zonas, por isso a praça também diz quanto ganha por
            volta.
          </p>
          <ZonePicker label="A sua praça (zona de casa)" value={homeZone} zones={zones} onChange={setHomeZone}
            report={{ uid: user.uid, role: 'driver' }} />
          {zone && (
            <p className="text-[12px] font-semibold text-purple-700 dark:text-purple-300">
              {zone.name} · {zone.city}, {zone.province}
            </p>
          )}
          <p className="text-[12px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">
            Não é uma prisão: aceita pedidos de outras zonas quando lhe convier.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-5 space-y-3 shadow-sm">
            <label className="block" htmlFor="ficha-name">
              <span className="block text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">O seu nome completo</span>
              <input
                id="ficha-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={cn(fieldCls, 'mt-1')}
                placeholder="Como está no BI"
              />
            </label>
            <p className="text-[12px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">
              Para a rua aparece <strong className="font-semibold text-zinc-900 dark:text-white">
                {preview.publicName || '—'}
              </strong>. O nome completo é só da equipa e do registo da conta.
            </p>
          </div>

          {DECLARATIONS.map((d) => {
            const on = !!ticks[d.id];
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setTicks((t) => ({ ...t, [d.id]: !t[d.id] }))}
                aria-pressed={on}
                className={cn(
                  'w-full text-left rounded-2xl border p-4 flex gap-3 transition-colors',
                  on
                    ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700',
                )}
              >
                <span className={cn(
                  'w-6 h-6 rounded-lg shrink-0 border-2 flex items-center justify-center transition-colors',
                  on ? 'bg-purple-600 border-purple-600 text-white' : 'border-zinc-300 dark:border-zinc-600',
                )}>
                  {on && <Check className="w-4 h-4" strokeWidth={3} />}
                </span>
                <span className="text-[13px] leading-snug font-bold text-zinc-700 dark:text-zinc-200">{d.text}</span>
              </button>
            );
          })}

          <p className="text-[12px] font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
            Estas quatro linhas ficam na sua ficha como declarações suas. A equipa
            confirma os papéis mais tarde, quando puder; enquanto isso a app não
            escreve «verificado» em nada — porque não é o que aconteceu.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-5 space-y-2.5 shadow-sm">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white leading-tight">Está pronto a entrar</h2>
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <Line k="Nome público" v={preview.publicName || '—'} />
            <Line k="Carro" v={[preview.model, preview.year].filter(Boolean).join(' · ') || '—'} />
            <Line k="Matrícula" v={preview.plate || '—'} />
            <Line k="Categoria" v={preview.classLabel} />
            <Line k="Praça" v={zone ? `${zone.name} · ${zone.province}` : '—'} />
          </dl>
          <button
            onClick={() => setSim(true)}
            className="w-full h-12 rounded-2xl font-bold text-[14px] bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-200 flex items-center justify-center gap-2"
          >
            <CarFront className="w-5 h-5" /> Ver como vai ser antes de enviar
          </button>
          <p className="text-[12px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">
            A candidatura é aprovada no momento em que entra, e as primeiras
            viagens ficam em período de teste revisto pela equipa. Se a declaração
            não for verdadeira, a equipa suspende a conta.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="w-14 h-12 shrink-0 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-200"
            aria-label="Passo anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {step < 3 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepOk}
            className={cn(btnCls, 'grow', !stepOk && OFF)}
          >
            Continuar
          </button>
        ) : (
          <button
            onClick={() => void submit()}
            disabled={!stepOk || busy}
            className={cn(btnCls, 'grow h-14 text-lg', (!stepOk || busy) && OFF)}
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CarFront className="w-5 h-5" />}
            Entrar na praça
          </button>
        )}
      </div>

      {!stepOk && step < 3 && (
        <p className="text-[12px] font-semibold text-amber-900 dark:text-amber-200 -mt-1">
          {step === 0 && dup === 'taken'
            ? 'Resolva a matrícula primeiro — é o que a equipa precisa de ver.'
            : step === 0 && !parsed.ok
              ? 'Escreva a matrícula completa, como está na chapa.'
              : step === 0
                ? 'Falta a matrícula certa, a marca e modelo, ou o ano do carro.'
                : step === 1
                  ? 'Escolha a sua praça para continuar.'
                  : 'Escreva o seu nome completo e confirme as quatro declarações.'}
        </p>
      )}

      <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4">
        <p className="text-[12px] leading-relaxed font-medium text-zinc-600 dark:text-zinc-300">
          Guardamos o seu nome, a matrícula, a marca, o ano, a categoria, a sua
          praça e a data desta declaração, mais a posição enquanto estiver
          ligado. A pessoa que entra no seu carro vê o nome público, a categoria
          e a matrícula, para confirmar o carro antes de subir. Não pedimos nem
          mostramos o seu telefone.
        </p>
        <p className="text-[12px] leading-relaxed font-medium text-zinc-600 dark:text-zinc-300 mt-2">
          O servidor é o Supabase e o site está na Vercel; os riscos do mapa vêm
          do OpenFreeMap (OpenStreetMap) e levam só a zona que está a ver. Não
          vendemos nem enviamos os seus dados a terceiros.
        </p>
        <p className="text-[12px] leading-relaxed font-medium text-zinc-600 dark:text-zinc-300 mt-2">
          Quer sair e apagar? Fale com a equipa no WhatsApp{' '}
          <a href={`https://wa.me/${APOIO_PHONE}`} target="_blank" rel="noreferrer" className="text-purple-700 dark:text-purple-300 underline underline-offset-2">
            {APOIO_DISPLAY}
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{k}</dt>
      <dd className="min-w-0 text-[13px] font-bold text-zinc-900 dark:text-white text-right truncate">{v}</dd>
    </div>
  );
}

const fieldCls =
  'w-full h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 outline-none focus:border-purple-400 placeholder:text-zinc-500 dark:placeholder:text-zinc-400';

const btnCls =
  'btn-main h-12 rounded-2xl font-bold flex items-center justify-center gap-2';
