import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { haversineKm } from './map';
import { usePrefs } from './alerts';

export interface LatLon { lat: number; lon: number }

export type GpsStatus = 'idle' | 'asking' | 'ok' | 'denied' | 'unavailable';

/**
 * A posição de quem pede. Não se insiste: uma pergunta, e se a pessoa negar
 * usamos o ponto que ela escolheu. Um app que persegue o GPS no telemóvel do
 * utilizador perde a confiança dele e a bateria do aparelho.
 */
export function useMyPosition(): {
  pos: LatLon | null;
  status: GpsStatus;
  accuracy: number | null;
  /** Quando a última leitura chegou, em ms. Serve para animar e para dizer
   *  «há 4 min» — um ponto velho não pode fingir que é agora. */
  updatedAt: number | null;
  /** `fresh` é o toque no botão: pede uma leitura nova ao aparelho em vez de
   *  aproveitar a última da cache, que pode ter um minuto e ser noutro bairro. */
  ask: (fresh?: boolean) => void;
} {
  const [pos, setPos] = useState<LatLon | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<GpsStatus>('idle');
  // Só bloqueamos um pedido em curso: se a pessoa negar e mais tarde carregar
  // em "Tentar de novo", o segundo pedido tem de sair mesmo.
  const askingRef = useRef(false);

  const ask = useCallback((fresh?: boolean) => {
    // Um toque no botão nunca se cala: se a leitura automática estiver em curso,
    // ela pode vir da cache e responder com o bairro antigo. O pedido fresco
    // substitui-a — os dois callbacks escrevem o mesmo estado e o último ganha.
    if (askingRef.current && !fresh) return;
    if (!('geolocation' in navigator)) { setStatus('unavailable'); return; }
    askingRef.current = true;
    setStatus('asking');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        askingRef.current = false;
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude });
        // Alguns aparelhos respondem com precisão 0 — não é «zero metros de
        // erro», é «não me disseram». Dizer «cerca de 0 m» seria prometer mais
        // do que o GPS deu.
        setAccuracy(p.coords.accuracy ? Math.round(p.coords.accuracy) : null);
        setUpdatedAt(Date.now());
        setStatus('ok');
      },
      (err) => {
        askingRef.current = false;
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      // Quem carrega no botão quer saber onde está *agora*; a primeira leitura
      // do ecrã pode vir da cache para não atrasar quem só abriu a app.
      { enableHighAccuracy: true, timeout: fresh ? 12000 : 9000, maximumAge: fresh ? 0 : 30000 },
    );
  }, []);

  return { pos, status, accuracy, updatedAt, ask };
}

/**
 * O gesto de «o meu ponto»: arma-se no toque e, quando chega uma leitura NOVA,
 * faz a câmara ir até ela (`onFix`) e acende o anel do botão uma vez.
 *
 * Vive aqui porque o passageiro e o motorista medem a mesma coisa com fontes
 * diferentes — um com `useMyPosition`, o outro com a publicação de presença de
 * 15 em 15 segundos. Sem a arma, o anel piscaria a cada publicação, e um botão
 * que pulsa sempre deixa de dizer seja o que for.
 */
export function useFixFlash(signal: unknown, onFix?: () => void): {
  arm: () => void;
  justFixed: boolean;
} {
  const armed = useRef(false);
  const seen = useRef(signal);
  const cb = useRef(onFix);
  cb.current = onFix;
  const [justFixed, setJustFixed] = useState(false);

  const arm = useCallback(() => { armed.current = true; }, []);

  useEffect(() => {
    if (signal === seen.current) return;
    seen.current = signal;
    if (!armed.current) return;
    armed.current = false;
    cb.current?.();
    setJustFixed(true);
    const t = window.setTimeout(() => setJustFixed(false), 1000);
    return () => window.clearTimeout(t);
  }, [signal]);

  return { arm, justFixed };
}

export interface NearbyCar {
  driver_id: string;
  class_id: string;
  lat: number;
  lon: number;
  seen_min: number;
  distance_km: number;
}

const NEARBY_MS = 15000;
/** Modo dados móveis: menos pedidos, mesmos factos. Cortar os carros do mapa
 *  seria esconder informação; perguntar de minuto em minuto poupa o crédito
 *  da pessoa sem lhe tirar nada. */
const NEARBY_MS_LOW_DATA = 60000;
const NEARBY_START_KM = 8;
/** O mesmo teto que o servidor impõe (tr_nearby_drivers): alargar além disto
 *  era mostrar carros que já não vêm a tempo. */
export const NEARBY_MAX_KM = 15;

/**
 * Os carros por perto: um pedido de 15 em 15 segundos, só com o ecrã visível.
 * Não é uma subscrição aberta a seguir motorista a motorista — o servidor
 * devolve posições arredondadas a ~110 m e apaga carros que pararam de
 * atualizar. O carro do *seu* motorista, esse vem por tempo real.
 *
 * O raio é o que a Uber chama "alargar a procura": começa apertado (8 km, o
 * carro que chega primeiro) e a pessoa pode pedir mais longe quando vê que
 * não vem ninguém.
 */
export function useNearbyDrivers(
  center: LatLon | null,
  enabled: boolean,
): {
  cars: NearbyCar[];
  loading: boolean;
  failed: boolean;
  refresh: () => void;
  radiusKm: number;
  widen: () => void;
  canWiden: boolean;
} {
  const [cars, setCars] = useState<NearbyCar[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [radiusKm, setRadiusKm] = useState(NEARBY_START_KM);
  const prefs = usePrefs();
  const everyMs = prefs.lowData ? NEARBY_MS_LOW_DATA : NEARBY_MS;
  const centerRef = useRef(center);
  centerRef.current = center;
  // Falhou uma vez (rede, sessão, função ainda não criada): pára de martelar o
  // servidor a cada 15 s. Em dados móveis isso custa dinheiro, e o botão
  // "Tentar de novo" está no ecrã para quem quiser voltar a tentar.
  const failedRef = useRef(false);
  // A chave é o valor da posição: um objecto novo a cada render recriaria o
  // intervalo, que chamaria pull, que renderizava de novo.
  const key = center ? `${center.lat.toFixed(4)},${center.lon.toFixed(4)}` : null;

  const pull = useCallback(async () => {
    const at = centerRef.current;
    if (!enabled || !at || failedRef.current) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('tr_nearby_drivers', {
      p_lat: at.lat,
      p_lon: at.lon,
      p_radius_km: radiusKm,
    });
    setLoading(false);
    if (error) { failedRef.current = true; setFailed(true); return; }
    failedRef.current = false;
    setFailed(false);
    setCars((data as NearbyCar[]) ?? []);
  }, [enabled, radiusKm]);

  const refresh = useCallback(() => {
    failedRef.current = false;
    setFailed(false);
    pull();
  }, [pull]);

  const widen = useCallback(() => setRadiusKm((r) => Math.min(NEARBY_MAX_KM, r + 7)), []);

  // Pedido novo, raio novo: o alargamento era para aquele pedido.
  useEffect(() => {
    if (!enabled) setRadiusKm(NEARBY_START_KM);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !key) { setCars([]); return; }
    failedRef.current = false;
    setFailed(false);
    pull();
    const onVisible = () => { if (document.visibilityState === 'visible') pull(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, key, pull]);

  // O ritmo vive num efeito próprio: mudar o modo dados móveis a meio de um
  // pedido não pode voltar a buscar tudo, só passa a perguntar mais devagar.
  useEffect(() => {
    if (!enabled || !key) return;
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') pull();
    }, everyMs);
    return () => { window.clearInterval(tick); };
  }, [enabled, key, pull, everyMs]);

  return {
    cars, loading, failed, refresh,
    radiusKm, widen, canWiden: radiusKm < NEARBY_MAX_KM,
  };
}

/**
 * Posição em directo do motorista atribuído. A política de leitura da presença
 * só dá esta linha a este passageiro, e só enquanto a viagem estiver viva — é
 * por isso que o tempo real funciona sem abrir a frota a quem não a vê.
 */
export function useDriverPresence(driverId: string | null | undefined): LatLon | null {
  const [pos, setPos] = useState<LatLon | null>(null);
  const prefs = usePrefs();

  useEffect(() => {
    setPos(null);
    if (!driverId) return;
    let alive = true;

    const read = () => {
      supabase
        .from('tr_driver_presence')
        .select('lat, lon')
        .eq('driver_id', driverId)
        .maybeSingle()
        .then(({ data }) => {
          if (alive && data) setPos({ lat: data.lat, lon: data.lon });
        });
    };
    read();

    const channel = supabase
      .channel(`tr-presence-${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tr_driver_presence', filter: `driver_id=eq.${driverId}` },
        (payload) => {
          const next = payload.new as { lat: number; lon: number };
          if (next && typeof next.lat === 'number') setPos({ lat: next.lat, lon: next.lon });
        },
      )
      .subscribe();

    // O tempo real morre em silêncio quando a rede móvel troca de torre. Uma
    // leitura de 15 em 15 segundos (60 no modo dados) mantém o carro a andar.
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') read();
    }, prefs.lowData ? NEARBY_MS_LOW_DATA : NEARBY_MS);

    return () => {
      alive = false;
      window.clearInterval(tick);
      supabase.removeChannel(channel);
    };
  }, [driverId, prefs.lowData]);

  return pos;
}

export function distanceText(from: LatLon | null | undefined, to: LatLon): string | null {
  if (!from) return null;
  const km = haversineKm(from.lat, from.lon, to.lat, to.lon);
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
