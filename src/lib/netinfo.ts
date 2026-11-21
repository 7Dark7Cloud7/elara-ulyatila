import { useEffect, useState } from 'react';

/**
 * A ligação em Angola parte em silêncio: o túnel do canal, a torre saturada, o
 * crédito que acabou. A app já aguenta isso (tudo volta a ser lido no polling),
 * mas a pessoa não tem forma de saber se o ecrã parado é a app ou a rede. Este
 * módulo só lê o que o aparelho sabe — nunca inventa «fraca» quando é «sem sinal».
 */

interface Connection {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: string, cb: () => void) => void;
  removeEventListener?: (type: string, cb: () => void) => void;
}

const connection = (): Connection | null =>
  (navigator as Navigator & { connection?: Connection }).connection ?? null;

const isSlow = (c: Connection | null): boolean =>
  !!c && (c.effectiveType === 'slow-2g' || c.effectiveType === '2g');

export interface Net {
  online: boolean;
  /** `navigator.onLine` diz `true` sempre que o aparelho tem interface ligada —
   *  não prova que a rede responde. Por isso o banner só afirma o que lê. */
  slow: boolean;
}

export function useNet(): Net {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [slow, setSlow] = useState(() => isSlow(connection()));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    const onConn = () => setSlow(isSlow(connection()));

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    connection()?.addEventListener?.('change', onConn);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      connection()?.removeEventListener?.('change', onConn);
    };
  }, []);

  return { online, slow };
}
