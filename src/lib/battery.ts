import { useEffect, useState } from 'react';

/**
 * Bateria do telemóvel — o único aviso de segurança que o aparelho sabe dar
 * sem precisar de servidor. A app não vigia ninguém: lê o que o browser mostra
 * e diz isso mesmo, uma vez por sessão.
 *
 * Em iOS/Safari não há `getBattery()`: o valor fica `null` e o aviso não
 * aparece, exactamente como deve ser quando não se sabe nada.
 */
export interface Battery {
  level: number;
  charging: boolean;
}

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryManager>;
};

export function useBattery(): Battery | null {
  const [battery, setBattery] = useState<Battery | null>(null);

  useEffect(() => {
    let alive = true;
    let manager: BatteryManager | null = null;
    const sync = () => {
      if (manager && alive) setBattery({ level: Math.round(manager.level * 100), charging: manager.charging });
    };

    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== 'function') return;

    nav.getBattery()
      .then((b) => {
        if (!alive) return;
        manager = b;
        b.addEventListener('levelchange', sync);
        b.addEventListener('chargingchange', sync);
        sync();
      })
      .catch(() => { /* sem API de bateria neste browser */ });

    return () => {
      alive = false;
      manager?.removeEventListener('levelchange', sync);
      manager?.removeEventListener('chargingchange', sync);
    };
  }, []);

  return battery;
}

/** Um aviso por sessão e por papel: a pessoa não quer o mesmo recado duas vezes. */
const seen = new Set<string>();

export function batteryDismissed(key: string): boolean {
  if (seen.has(key)) return true;
  try { return sessionStorage.getItem(`tr.batt.${key}`) === '1'; } catch { return false; }
}

export function dismissBattery(key: string): void {
  seen.add(key);
  try { sessionStorage.setItem(`tr.batt.${key}`, '1'); } catch { /* modo privado */ }
}
