import { PackageIcon, PhoneIcon } from './ElaraIcons';
import { NavUserIcon } from './NavIcons';
import { cn } from '../lib/utils';

interface ParcelFieldsProps {
  what: string; setWhat: (v: string) => void;
  toName: string; setToName: (v: string) => void;
  toPhone: string; setToPhone: (v: string) => void;
  payBy: 'remetente' | 'destinatario'; setPayBy: (v: 'remetente' | 'destinatario') => void;
  deliverySizeId: string;
  /** Mudança: quem está no destino é quem muda, não um destinatário de encomenda. */
  move?: boolean;
}

/**
 * Os dados de uma entrega. O telefone de quem recebe só vive aqui e na
 * tr_trip: o feed da praça não o mostra, e o motorista só o lê depois de
 * aceitar a corrida — é assim que a encomenda não fica exposta a toda a gente.
 *
 * Cada campo tem rótulo visível (não só placeholder): ao corrigir um telefone
 * já preenchido, a pessoa continua a saber o que está a corrigir.
 */
export function ParcelFields({
  what, setWhat, toName, setToName, toPhone, setToPhone, payBy, setPayBy, deliverySizeId, move,
}: ParcelFieldsProps) {
  return (
    <div className="surface-card space-y-4 rounded-card p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-purple-100 text-purple-700 dark:bg-amber-400/15 dark:text-amber-300">
          <PackageIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-label font-semibold text-ink dark:text-white">
            {move ? 'A mudança' : 'A encomenda'}
          </p>
          <p className="truncate text-caption text-zinc-500 dark:text-zinc-400">
            {move ? 'O que sai e para onde vai' : 'O que vai e quem recebe'}
          </p>
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-label font-semibold text-zinc-600 dark:text-zinc-300">
          {move ? 'O que vai mudar' : 'O que vai dentro'}
        </span>
        <input
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder={move ? 'Ex.: casa T2, sofá, máquina de lavar' : 'Ex.: documentos do advogado'}
          className={fieldCls}
        />
      </label>

      <div className="space-y-2.5 rounded-control border border-zinc-200/80 p-3 dark:border-[rgba(185,168,220,0.18)]">
        <p className="eyebrow flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
          <NavUserIcon className="h-3.5 w-3.5" />
          {move ? 'Quem está no destino' : 'Quem recebe'}
        </p>

        <label className="block space-y-1.5">
          <span className="text-label font-semibold text-zinc-600 dark:text-zinc-300">Nome</span>
          <input
            value={toName}
            onChange={(e) => setToName(e.target.value)}
            placeholder={move ? 'Nome de quem está no destino' : 'Nome de quem recebe'}
            autoComplete="off"
            className={fieldCls}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-label font-semibold text-zinc-600 dark:text-zinc-300">Telefone</span>
          <span className="flex items-stretch overflow-hidden rounded-control border border-zinc-200 bg-white focus-within:border-purple-400 dark:border-[rgba(185,168,220,0.3)] dark:bg-white/[0.07] dark:focus-within:border-amber-400">
            <span className="flex items-center gap-1 border-r border-zinc-200 px-3 text-control font-semibold text-zinc-600 dark:border-[rgba(185,168,220,0.25)] dark:text-zinc-300">
              <PhoneIcon className="h-3.5 w-3.5" /> +244
            </span>
            <input
              type="tel"
              value={toPhone}
              onChange={(e) => setToPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="9XXXXXXXX"
              inputMode="numeric"
              maxLength={9}
              autoComplete="off"
              className="h-12 w-full bg-transparent px-3 text-control text-ink outline-none placeholder:text-zinc-500 dark:text-white dark:placeholder:text-[#B9A8DC]"
            />
          </span>
        </label>
      </div>

      <div className="space-y-1.5">
        <p className="text-label font-semibold text-zinc-600 dark:text-zinc-300">Quem paga</p>
        <div className="grid grid-cols-2 gap-2">
          {([['remetente', 'Eu pago'], ['destinatario', 'Quem recebe paga']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPayBy(id)}
              aria-pressed={payBy === id}
              className={cn(
                'h-11 rounded-control border text-[13px] font-semibold transition-colors',
                payBy === id
                  ? 'border-purple-400 bg-purple-100 text-purple-700 dark:border-amber-400 dark:bg-amber-400/[0.12] dark:text-amber-200'
                  : 'surface-outline text-zinc-600 dark:text-zinc-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-label leading-relaxed text-zinc-500 dark:text-zinc-400">
        {move
          ? 'O motorista liga para combinar a hora e quem carrega. O código de entrega fecha a mudança no destino.'
          : deliverySizeId === 'moveis'
            ? 'Para móveis, combinamos o transporte com a equipa — o pedido serve para marcar.'
            : 'Quem recebe mostra o código de entrega. Sem ele, a encomenda não fecha.'}
      </p>
    </div>
  );
}

const fieldCls =
  'w-full h-12 rounded-control bg-white dark:bg-white/[0.07] border border-zinc-200 dark:border-[rgba(185,168,220,0.3)] px-4 text-control text-ink dark:text-white outline-none focus:border-purple-400 dark:focus:border-amber-400 placeholder:text-zinc-500 dark:placeholder:text-[#B9A8DC]';
