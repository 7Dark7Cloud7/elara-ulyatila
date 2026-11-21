import { useState } from 'react';
import { BatteryWarning, X } from 'lucide-react';
import { batteryDismissed, dismissBattery, useBattery } from '../lib/battery';
import { EMERGENCY_NUMBER } from '../lib/trips';
import { cn } from '../lib/utils';

/**
 * Aviso de bateria fraca. Não é vigilância: é o que o telemóvel da pessoa já
 * sabe, dito uma vez e com um conselho que cabe na app — fechar a viagem,
 * guardar o número de emergência, carregar o aparelho.
 */
export function BatteryNotice({ role }: { role: 'driver' | 'passenger' }) {
  const battery = useBattery();
  const [open, setOpen] = useState(() => !batteryDismissed(role));

  if (!battery || battery.charging || battery.level > 20 || !open) return null;

  const text = role === 'driver'
    ? `Bateria a ${battery.level}% sem carregador. Com o mapa aberto a noite inteira, é assim que um carro fica preso numa corrida. Feche a app entre pedidos e carregue antes de aceitar a próxima.`
    : `Bateria a ${battery.level}%. Se está numa viagem, guarde agora o código da viagem e o número ${EMERGENCY_NUMBER} — o telemóvel pode desligar a meio do trajecto.`;

  return (
    <div className={cn(
      'animate-enter-sm rounded-2xl border p-3 flex items-start gap-3',
      'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
    )}>
      <BatteryWarning className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
      <p className="text-[12px] font-bold text-amber-800 dark:text-amber-200 grow">{text}</p>
      <button
        onClick={() => { dismissBattery(role); setOpen(false); }}
        aria-label="Fechar o aviso de bateria"
        className="tap-pad text-amber-600 dark:text-amber-400 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
