import { ExternalLink, MapPinPlus, ShoppingBag, X } from 'lucide-react';
import { ELARA_MARKET_URL, type OrderSeed } from '../lib/orders';
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
      <div className="surface-card rounded-card p-4 flex items-center gap-3">
        <ShoppingBag className="w-4 h-4 shrink-0 text-purple-600 dark:text-amber-400" />
        <p className="text-[13px] font-medium text-zinc-600 dark:text-zinc-300">
          A ler a encomenda na sua conta Elara…
        </p>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="surface-card rounded-card p-4">
        <p className="text-body font-semibold text-ink dark:text-white">
          Essa encomenda não está nesta conta
        </p>
        <p className="mt-1 text-label text-zinc-500 dark:text-zinc-400">
          Entre com a conta que fez a compra no Elara Marketplace, ou peça a entrega escolhendo o destino na lista.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Dismiss onDismiss={onDismiss} />
          <a
            href={ELARA_MARKET_URL}
            target="_blank"
            rel="noreferrer"
            className="tap-pad inline-flex items-center gap-1 text-label font-semibold text-purple-700 dark:text-amber-300"
          >
            Abrir Marketplace <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    );
  }

  if (!seed) return null;

  return (
    <div className="surface-card rounded-card p-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 rounded-control bg-purple-100 text-purple-700 dark:bg-amber-400/15 dark:text-amber-300 flex items-center justify-center">
          <ShoppingBag className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink dark:text-white">
            Encomenda {seed.code}
          </p>
          <p className="text-label text-zinc-500 dark:text-zinc-400 mt-0.5">
            {seed.itemCount} {seed.itemCount === 1 ? 'peça' : 'peças'} · {formatKz(seed.totalKz)} pagos no Elara
          </p>
          <p className="text-label text-zinc-600 dark:text-zinc-300 mt-1.5 leading-relaxed">
            {seed.address}
          </p>
        </div>
      </div>

      {seed.guess ? (
        <button
          type="button"
          onClick={() => onUseZone(seed.guess!.zoneId)}
          className={cn(
            'mt-3 w-full h-11 rounded-control text-label font-semibold flex items-center justify-center gap-2',
            'border border-purple-300 bg-purple-50 text-purple-700',
            'dark:border-amber-400/40 dark:bg-amber-400/[0.12] dark:text-amber-200',
            'active:scale-[0.98] transition-transform',
          )}
        >
          <MapPinPlus className="w-4 h-4" /> Entregar em {seed.guess.zoneName}
        </button>
      ) : (
        <p className="mt-3 text-label text-zinc-500 dark:text-zinc-400">
          Não reconhecemos o bairro nesta morada — escolha o ponto de entrega na lista.
        </p>
      )}

      <p className="mt-2 text-caption text-zinc-500 dark:text-zinc-400">
        O valor da corrida paga-se aqui, como qualquer entrega; não confundir com o pagamento da compra.
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Dismiss onDismiss={onDismiss} />
        <a
          href={ELARA_MARKET_URL}
          target="_blank"
          rel="noreferrer"
          className="tap-pad inline-flex items-center gap-1 text-caption font-semibold text-purple-700 dark:text-amber-300"
        >
          Elara Marketplace <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

const Dismiss = ({ onDismiss }: { onDismiss: () => void }) => (
  <button
    type="button"
    onClick={onDismiss}
    className="tap-pad text-label font-semibold text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1"
  >
    <X className="w-3.5 h-3.5" /> Ignorar encomenda
  </button>
);
