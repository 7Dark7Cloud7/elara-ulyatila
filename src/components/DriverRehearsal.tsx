import { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, Car, CreditCard, Eye, Loader2, ShieldAlert, Wallet } from 'lucide-react';
import { VehicleArt, vehicleKindFor } from './VehicleArt';
import { STATE_LABEL } from '../lib/trips';
import type { TripState } from '../types';
import { formatKz } from '../lib/money';
import { graceEnds, loadSetting, marginSplit, type Setting } from '../lib/settings';
import { cn } from '../lib/utils';

/** Tudo o que a simulação precisa de saber — e nada mais. */
export interface Preview {
  /** O nome que a rua vê, calculado aqui como o servidor calcula. */
  publicName: string;
  plate: string;
  model: string;
  year: string;
  classId: string;
  classLabel: string;
  classIcon?: string;
  classMinKz?: number | null;
  zoneName: string | null;
  province: string | null;
}

interface DriverRehearsalProps {
  preview: Preview;
  /** Fecha a simulação; não há nada para gravar aqui. */
  onClose: () => void;
  /** O título muda consoante quem a abre: antes ou depois de enviar. */
  title?: string;
}

/** Os passos que uma viagem atravessa, por ordem. É derivado de STATE_LABEL, */
const FLOW = ['searching', 'accepted', 'arriving', 'waiting_pin', 'ongoing', 'ended'] as TripState[];

/** Números redondos para explicar a taxa — não são preços de corrida nenhuma. */
const EXAMPLES = [1000, 2500] as const;

/**
 * O ensaio: «assim vai ser». Antes de uma pessoa dar a matrícula e o nome, vê o
 * cartão que a rua vai ler, o ecrã que vai ter nas mãos e quanto fica de cada
 * corrida. Nenhum outro app em Angola faz isto porque exige honestidade sobre a
 * taxa — e é justamente por isso que vale a pena.
 *
 * Não escreve nada: nem no servidor, nem no telemóvel. É um espelho do que já
 * existe, com fita de SIMULAÇÃO a todo o momento.
 */
export function DriverRehearsal({ preview, onClose, title = 'Assim vai ser' }: DriverRehearsalProps) {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadSetting().then((s) => {
      if (!alive) return;
      setLoading(false);
      if (s.error || !s.setting) { setFailed(true); return; }
      setSetting(s.setting);
    });
    return () => { alive = false; };
  }, []);

  const now = Date.now();
  const grace = setting ? graceEnds(setting, now) : null;
  const trial = setting?.trial_trip_limit ?? null;

  return (
    <div className="animate-enter space-y-4">
      {/* A fita não desaparece com scroll: uma simulação que se parece demais
          com a app a sério é pior do que nenhuma simulação. */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-amber-100 dark:bg-amber-950/70 border-y border-amber-300 dark:border-amber-800">
        <p className="flex items-center gap-2 text-[12px] font-bold text-amber-900 dark:text-amber-200">
          <Eye className="w-4 h-4 shrink-0" />
          SIMULAÇÃO — nada aqui foi gravado nem enviado. Toque em voltar para continuar a candidatura.
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={onClose}
          className="surface-outline tap-pad w-10 h-10 rounded-control flex items-center justify-center text-ink dark:text-zinc-200"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-display text-lg font-medium tracking-tight text-ink dark:text-white">{title}</h2>
      </div>

      {/* 1 — O cartão que o passageiro lê antes de entrar no carro. */}
      <section className="surface-card rounded-card overflow-hidden">
        <p className="px-4 pt-3 text-caption font-semibold text-zinc-500 dark:text-zinc-400">
          1 · O que a pessoa que entra no seu carro vê
        </p>
        <div className="p-4 flex items-center gap-3">
          <span className="relative flex h-14 w-[86px] shrink-0 items-end justify-center rounded-control bg-purple-50 dark:bg-white/[0.05] overflow-hidden">
            <VehicleArt
              kind={vehicleKindFor(preview.classId, preview.classIcon)}
              label={preview.classLabel}
              className="w-[78px] h-auto translate-y-[3px]"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink dark:text-white truncate">
              {preview.publicName || '—'}
            </span>
            <span className="block text-caption font-medium text-zinc-500 dark:text-zinc-400 truncate">
              {preview.classLabel} · {preview.model || '—'} {preview.year || ''}
            </span>
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/10 px-2 py-1 text-caption font-bold tracking-wide text-ink dark:text-white">
              <Car className="w-3.5 h-3.5 text-purple-600 dark:text-amber-400" />
              {preview.plate || 'sem matrícula'}
            </span>
          </span>
        </div>
        <p className="px-4 pb-3 text-caption font-medium text-zinc-500 dark:text-zinc-400">
          Só isto. O seu telefone nunca aparece ao passageiro, nem o contrário —
          e é por isso que a app não tem botão de chamada.
        </p>
      </section>

      {/* 2 — O que ele faz, por ordem. */}
      <section className="surface-card rounded-card p-4">
        <p className="text-caption font-semibold text-zinc-500 dark:text-zinc-400">
          2 · O que acontece numa viagem, passo a passo
        </p>
        <ol className="mt-3 space-y-2">
          {FLOW.map((s, i) => (
            <li key={s} className="flex items-start gap-2.5">
              <span className="w-6 h-6 shrink-0 rounded-lg bg-purple-100 dark:bg-amber-400/[0.16] text-purple-700 dark:text-amber-300 flex items-center justify-center text-caption font-bold">
                {i + 1}
              </span>
              <span className="text-label font-semibold leading-6 text-ink dark:text-white">
                {STATE_LABEL[s]}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-caption font-medium text-zinc-500 dark:text-zinc-400">
          O código de 4 dígitos diz-se dentro do carro, quando já está ao pé da
          pessoa. Quem lhe pedir o código por telefone ou WhatsApp não é a Elara.
        </p>
      </section>

      {/* 3 — O dinheiro, com as condições reais da tr_setting. */}
      <section className="surface-card rounded-card p-4">
        <p className="text-caption font-semibold text-zinc-500 dark:text-zinc-400">
          3 · Quanto fica para si
        </p>
        {loading && (
          <p className="flex items-center gap-2 py-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" /> a ler as condições da Elara…
          </p>
        )}
        {failed && (
          <p className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-3 text-[12px] font-bold leading-snug text-amber-900 dark:text-amber-200">
            Não consegui ler as condições de agora. Fale com a equipa no apoio e
            confirme a taxa antes da primeira viagem — não gosto de lhe mostrar
            um número que pode não ser o de hoje.
          </p>
        )}
        {setting && (
          <>
            <p className="mt-1 text-[13px] font-bold text-zinc-900 dark:text-white">
              A taxa da Elara é {setting.commission_pct}% do valor da corrida
              {setting.booking_fee_kz > 0 ? `, e a taxa de reserva de ${formatKz(setting.booking_fee_kz)} fica sempre para a Elara` : ''}.
            </p>
            {grace && (
              <p className="mt-1 flex items-start gap-1.5 text-[12px] font-semibold text-purple-700 dark:text-purple-300">
                <BadgeCheck className="w-4 h-4 shrink-0 mt-0.5" />
                Neste arranque não há taxa até {grace}: fica com o valor todo.
              </p>
            )}
            <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              {typeof preview.classMinKz === 'number' && preview.classMinKz > 0 && (
                <Row label={`o mínimo de ${preview.classLabel}`} price={preview.classMinKz} setting={setting} now={now} />
              )}
              {EXAMPLES.map((p) => (
                <Row key={p} label="exemplo" price={p} setting={setting} now={now} />
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              <Wallet className="w-4 h-4 shrink-0 mt-0.5" />
              O pagamento é a bordo, em dinheiro ou Multicaixa. A app não passa
              o seu dinheiro por si: a taxa é um acerto com a equipa, nunca um
              valor que se desconta sozinho.
            </p>
          </>
        )}
      </section>

      {/* 4 — O que a equipa faz depois de a pessoa carregar em «entrar». */}
      <section className="surface-card rounded-card p-4">
        <p className="text-caption font-semibold text-zinc-500 dark:text-zinc-400">
          4 · Depois de enviar
        </p>
        <ul className="mt-2 space-y-2">
          <li className="flex items-start gap-2 text-label font-medium leading-snug text-zinc-700 dark:text-zinc-200">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-purple-600 dark:text-amber-400" />
            {trial === null
              ? 'As primeiras viagens ficam em período de teste, revisto pela equipa.'
              : `As primeiras ${trial} viagens ficam em período de teste, revisto pela equipa.`}
          </li>
          <li className="flex items-start gap-2 text-label font-medium leading-snug text-zinc-700 dark:text-zinc-200">
            <CreditCard className="w-4 h-4 shrink-0 mt-0.5 text-purple-600 dark:text-amber-400" />
            A praça é {preview.zoneName ?? 'a que escolher'}
            {preview.province ? ` (${preview.province})` : ''}. É ela que define o
            preço das suas corridas, porque o preço é calculado entre zonas.
          </li>
        </ul>
        <p className="mt-3 text-caption font-medium text-zinc-500 dark:text-zinc-400">
          A candidatura fica activa no minuto em que entra — o que a segura cá é
          o teste revisto pela equipa, não uma espera de dias. Se a declaração
          não for verdadeira, a equipa suspende a conta.
        </p>
      </section>

      <button
        onClick={onClose}
        className="surface-outline w-full h-12 rounded-control font-semibold text-body text-ink dark:text-zinc-100"
      >
        Voltar à candidatura
      </button>
    </div>
  );
}

function Row({ label, price, setting, now }: { label: string; price: number; setting: Setting; now: number }) {
  const split = marginSplit(price, setting, now);
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 py-2.5">
      <span className="min-w-0 text-caption font-medium text-zinc-500 dark:text-zinc-400 truncate">
        {label} · corrida de {formatKz(price)}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-label font-semibold text-ink dark:text-white tabular-nums">
          fica {formatKz(split.driverKeepsKz)}
        </span>
        <span className={cn('block text-caption font-semibold', split.inGrace ? 'text-purple-700 dark:text-amber-300' : 'text-zinc-500 dark:text-zinc-400')}>
          {split.inGrace ? 'sem taxa agora' : `Elara ${formatKz(split.commissionKz)}`}
        </span>
      </span>
    </div>
  );
}
