import { MapPinPlus, ShoppingBag, X } from 'lucide-react';
import type { OrderSeed } from '../lib/orders';
import { formatKz } from '../lib/money';
import { cn } from '../lib/utils';

interface OrderNoticeProps {
  seed: OrderSeed | null;
  loading: boolean;
  missing: boolean;
  onUseZone: (zoneId: string) => void;
  onDismiss: () => void;
}

/**
 * O cartão que diz de onde vem esta entrega. Aparece quando a pessoa chega por
 * ligação do Marketplace: os campos já vão cheios, mas nada entra na viagem sem
 * que ela veja e confirme — a morada do Elara é uma linha escrita à mão, e uma
 * linha escrita à mão não escolhe um bairro por si própria.
 */
export function OrderNotice({ seed, loading, missing, onUseZone, onDismiss }: OrderNoticeProps) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 shadow-float flex items-center gap-3">
        <ShoppingBag className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
        <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">A ler a encomenda na sua conta Elara…</p>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 shadow-float">
        <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-50">Essa encomenda não está nesta conta</p>
        <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-1">
          Entra com a conta que fez a compra, ou pede a entrega normalmente — escolhendo tu o ponto de destino.
        </p>
        <Dismiss onDismiss={onDismiss} />
      </div>
    );
  }

  if (!seed) return null;

  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 shadow-float">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
          <ShoppingBag className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-50">
            Encomenda {seed.code}
          </p>
          <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
            {seed.itemCount} {seed.itemCount === 1 ? 'peça' : 'peças'} · {formatKz(seed.totalKz)} pagos no Elara
          </p>
          <p className="text-[12px] font-medium text-zinc-600 dark:text-zinc-300 mt-1.5 leading-relaxed">
            {seed.address}
          </p>
        </div>
      </div>

      {seed.guess ? (
        <button
          onClick={() => onUseZone(seed.guess!.zoneId)}
          className={cn(
            'mt-3 w-full h-11 rounded-2xl text-[13px] font-bold flex items-center justify-center gap-2',
            'border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40',
            'text-purple-700 dark:text-purple-300 active:scale-[0.98] transition-transform',
          )}
        >
          <MapPinPlus className="w-4 h-4" /> Entregar em {seed.guess.zoneName}
        </button>
      ) : (
        <p className="mt-3 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
          Não reconhecemos o bairro nesta morada — escolhe o ponto de entrega na lista.
        </p>
      )}

      <p className="mt-2 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
        O valor da corrida paga-se aqui, como qualquer entrega; não confundir com o pagamento da compra.
      </p>
      <Dismiss onDismiss={onDismiss} />
    </div>
  );
}

const Dismiss = ({ onDismiss }: { onDismiss: () => void }) => (
  <button
    onClick={onDismiss}
    className="tap-pad mt-2 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1"
  >
    <X className="w-3.5 h-3.5" /> Ignorar a encomenda
  </button>
);
