import { useEffect, useRef, useState } from 'react';
import type { LngLat, MapLibre } from '../lib/map';
import {
  LUANDA, STYLE_DARK, STYLE_LIGHT, boundsOf, bubbleEl, carMarkerEl,
  circlePolygonKm, loadMapLibre, meMarkerEl, pinMarkerEl,
} from '../lib/map';
import type { LatLon } from '../lib/geo';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/utils';

export interface MapPin { id: string; at: LatLon; label: string; tone: 'from' | 'to' | 'pick'; scan?: boolean }
export interface MapCar { id: string; at: LatLon; assigned?: boolean }
export interface MapBubble { id: string; at: LatLon; text: string; active?: boolean }
/** Raio de procura desenhado no mapa, em metros de verdade. */
export interface MapRadar { at: LatLon; radiusKm: number }

export interface MapViewProps {
  center?: LatLon | null;
  zoom?: number;
  pins?: MapPin[];
  cars?: MapCar[];
  bubbles?: MapBubble[];
  onBubble?: (id: string) => void;
  /**
   * Tocar no mapa para dizer «apanhem-me aqui». Opcional de propósito: nos
   * ecrãs onde ninguém está a marcar um ponto, um toque no mapa é só panificar,
   * e não deve apagar nem criar embarque nenhum.
   */
  onPick?: (at: LatLon) => void;
  me?: LatLon | null;
  /** Precisão anunciada pelo aparelho, em metros: desenha o círculo em volta do ponto. */
  meAccuracy?: number | null;
  radar?: MapRadar | null;
  /** Segmentos rectos entre pontos. Aproximado de propósito: não há router de estradas. */
  route?: LatLon[] | null;
  /** Carro a seguir em directo (o do motorista atribuído). */
  follow?: LatLon | null;
  /** Altura do painel flutuante: o ponto importante cai acima dele. */
  paddingBottom?: number;
  /** Muda quando a câmara deve reencaixar (novo estado da viagem, nova rota). */
  fitKey?: string;
  /** Incrementa para recentrar. */
  focusToken?: number;
  className?: string;
}

type Marker = InstanceType<MapLibre['Marker']>;
interface Tracked { marker: Marker; at: LngLat; anim: number | null; sig: string }

/** Desliza um marcador até ao novo ponto em vez de o teletransportar: são
 *  posições de 15 em 15 segundos, e sem isto os carros saltam pelo ecrã. */
function glide(tracked: Tracked, to: LngLat, ms = 1400): void {
  if (tracked.anim) cancelAnimationFrame(tracked.anim);
  const from = tracked.at;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const ease = t < 0.5 ? 2 * t * t : 1 - (-4 * t + 3) * t;
    tracked.marker.setLngLat([from[0] + dx * ease, from[1] + dy * ease]);
    if (t < 1) tracked.anim = requestAnimationFrame(step);
    else tracked.anim = null;
  };
  tracked.anim = requestAnimationFrame(step);
  tracked.at = to;
}

/** O painel flutuante tapa a parte de baixo do mapa. Em vez de passar `padding`
 *  a cada movimento de câmara (o MapLibre soma-o duas vezes e os pinos saem do
 *  ecrã), dizemos uma vez ao mapa qual é a janela visível. O limite deixa sempre
 *  uma faixa utilizável: com um painel muito alto é melhor o pino encostar à
 *  borda do cartão do que a câmara ficar sem onde pôr a rota. */
const MIN_BAND = 130;
const clampBottom = (map: { getContainer(): HTMLElement }, bottom: number) =>
  Math.min(bottom + 24, Math.max(MIN_BAND, map.getContainer().clientHeight - 64 - MIN_BAND));

export function MapView(props: MapViewProps) {
  const {
    center, zoom = 13, pins, cars, bubbles, onBubble, onPick, me, meAccuracy, radar, route, follow,
    paddingBottom = 0, fitKey = '', focusToken = 0, className,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<MapLibre['Map']> | null>(null);
  const libRef = useRef<MapLibre | null>(null);
  const marksRef = useRef(new Map<string, Tracked>());
  const routeRef = useRef(route);
  const radarRef = useRef(radar);
  const gpsRef = useRef<{ at: LatLon; km: number } | null>(null);
  const draggedRef = useRef(false);
  const onBubbleRef = useRef(onBubble);
  const onPickRef = useRef(onPick);
  const darkRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const dark = useTheme();
  darkRef.current = dark;
  onBubbleRef.current = onBubble;
  onPickRef.current = onPick;
  routeRef.current = route;
  // O ref é lido dentro do handler do `styledata`, que só existe uma vez: sem
  // actualizar aqui, o raio de procura ficaria preso ao valor do primeiro
  // render (null) e o círculo nunca aparecia quando a pessoa alarga a procura.
  radarRef.current = radar;
  // O raio de precisão, em quilómetros verdadeiros e com teto: três quilómetros
  // de Wi-Fi tapariam o bairro inteiro, e um círculo que tapa tudo não diz nada.
  gpsRef.current = me && meAccuracy && meAccuracy > 0
    ? { at: me, km: Math.min(2, Math.max(0.015, meAccuracy / 1000)) }
    : null;

  // — O desenho da casa por cima dos tiles ——————————————————————————————————
  //
  // Os tiles continuam a dar ruas e nomes verdadeiros, mas as cores são da
  // Elara: campo ameixa, estradas lavanda grossas, água funda e etiquetas
  // discretas — o mesmo desenho do referencial (fundo #3F1A7A → #22103F,
  // estradas #5B33A3). Recolore-se nos dois temas a cada `styledata`, porque
  // trocar de estilo deita as nossas pinturas fora.
  const brandMap = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const darkMode = darkRef.current;
    const style = map.getStyle();
    for (const layer of style.layers ?? []) {
      if (layer.id.startsWith('elara-')) continue;
      const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'] ?? '';
      const paint = (prop: string, value: unknown) => {
        try { map.setPaintProperty(layer.id, prop, value); } catch { /* camada não aceita esta pintura */ }
      };
      if (layer.type === 'background') {
        paint('background-color', darkMode ? '#22103F' : '#EDE6FA');
      } else if (layer.type === 'fill') {
        const water = sourceLayer === 'water' || sourceLayer === 'waterway' || /water|ocean|sea/.test(layer.id);
        const building = sourceLayer === 'building' || /building/.test(layer.id);
        const park = /park|wood|grass|landcover|landuse|forest|golf|cemetery/.test(sourceLayer + layer.id);
        paint('fill-color', water
          ? (darkMode ? '#1B0B38' : '#DCD1F5')
          : building
            ? (darkMode ? '#2A1450' : '#E3DAF6')
            : park
              ? (darkMode ? '#28124D' : '#E6DFF7')
              : (darkMode ? '#22103F' : '#EDE6FA'));
        paint('fill-opacity', water ? 1 : 0.9);
      } else if (layer.type === 'line') {
        const major = /motorway|trunk|primary/.test(layer.id);
        const minor = /secondary|tertiary|street|residential|service|path|track|footway|cycleway|rail/.test(layer.id);
        paint('line-color', darkMode ? '#5B33A3' : '#FFFFFF');
        paint('line-width', major
          ? ['interpolate', ['linear'], ['zoom'], 8, 1.5, 13, 8, 17, 20]
          : minor
            ? ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 2.5, 18, 8]
            : ['interpolate', ['linear'], ['zoom'], 9, 1, 13, 4, 17, 10]);
        paint('line-opacity', darkMode ? 0.85 : 1);
      } else if (layer.type === 'symbol') {
        paint('text-color', darkMode ? '#B7A5D9' : '#6B5B8A');
        paint('text-halo-color', darkMode ? '#22103F' : '#FFFFFF');
        paint('icon-opacity', 0.85);
      } else if (layer.type === 'fill-extrusion') {
        paint('fill-extrusion-color', darkMode ? '#2A1450' : '#E3DAF6');
        paint('fill-extrusion-opacity', 0.6);
      }
    }
  };

  // — Linha da rota —————————————————————————————————————————————————————————
  const syncRoute = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const points: LngLat[] = (routeRef.current ?? []).map((p) => [p.lon, p.lat]);
    const line = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: points },
    };
    const src = map.getSource('elara-line') as { setData(d: unknown): void } | undefined;
    if (src) { src.setData(line); return; }
    if (points.length < 2) return;
    map.addSource('elara-line', { type: 'geojson', data: line });
    map.addLayer({
      id: 'elara-line-case', type: 'line', source: 'elara-line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': darkRef.current ? '#2A1254' : '#FFFFFF',
        'line-width': 9, 'line-opacity': 0.9,
      },
    });
    map.addLayer({
      id: 'elara-line', type: 'line', source: 'elara-line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': darkRef.current ? '#E7CFA6' : '#7C5CE6', 'line-width': 5 },
    });
  };

  // — Raio de procura ————————————————————————————————————————————————————————
  //
  // Um círculo com quilómetros verdadeiros, não um desenho: é o raio que o
  // servidor usa no tr_nearby_drivers, e quando a pessoa alarga a procura vê-o
  // crescer. Não se usa a geometria de círculo da biblioteca (as suas tipos não
  // saem no pacote ESM); calcula-se o anel por fórmula esférica e é GeoJSON
  // como o resto. Trocar o estilo deita os revestimentos, por isso o styledata
  // reconstrói.
  const syncRadar = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const at = radarRef.current;

    if (!at) {
      if (map.getLayer('elara-radar-line')) map.removeLayer('elara-radar-line');
      if (map.getLayer('elara-radar-fill')) map.removeLayer('elara-radar-fill');
      if (map.getSource('elara-radar')) map.removeSource('elara-radar');
      return;
    }

    const ring = circlePolygonKm(at.at.lat, at.at.lon, at.radiusKm);
    const data = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [ring] },
    };
    const src = map.getSource('elara-radar') as { setData(d: unknown): void } | undefined;
    if (src) { src.setData(data); return; }

    map.addSource('elara-radar', { type: 'geojson', data });
    map.addLayer({
      id: 'elara-radar-fill', type: 'fill', source: 'elara-radar',
      paint: { 'fill-color': darkRef.current ? '#E7CFA6' : '#7C5CE6', 'fill-opacity': 0.07 },
    });
    map.addLayer({
      id: 'elara-radar-line', type: 'line', source: 'elara-radar',
      paint: {
        'line-color': darkRef.current ? '#E7CFA6' : '#7C5CE6',
        'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [2, 2],
      },
    });
  };

  // — O círculo da precisão ——————————————————————————————————————————————————
  //
  // O ponto do aparelho é uma adivinhação com um raio, e o raio vem com ele.
  // Desenhá-lo é mais honesto que um pino nítido: é o que faz a pessoa perceber
  // que tem de caminhar até à avenida, e não que o carro está ali. O raio tem
  // um teto — uma leitura por Wi-Fi de três quilómetros taparia um bairro
  // inteiro, e um círculo que tapa tudo não informa nada.
  const syncGps = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const at = gpsRef.current;

    if (!at) {
      if (map.getLayer('elara-gps-fill')) map.removeLayer('elara-gps-fill');
      if (map.getSource('elara-gps')) map.removeSource('elara-gps');
      return;
    }

    const ring = circlePolygonKm(at.at.lat, at.at.lon, at.km);
    const data = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [ring] },
    };
    const src = map.getSource('elara-gps') as { setData(d: unknown): void } | undefined;
    if (src) { src.setData(data); return; }

    map.addSource('elara-gps', { type: 'geojson', data });
    map.addLayer({
      id: 'elara-gps-fill', type: 'fill', source: 'elara-gps',
      paint: { 'fill-color': '#7C5CE6', 'fill-opacity': 0.14 },
    });
  };

  // — Arranque ——————————————————————————————————————————————————————————————
  useEffect(() => {
    let disposed = false;
    loadMapLibre()
      .then((lib) => {
        if (disposed || !hostRef.current) return;
        libRef.current = lib;
        const map = new lib.Map({
          container: hostRef.current,
          style: darkRef.current ? STYLE_DARK : STYLE_LIGHT,
          center: center ? [center.lon, center.lat] : [LUANDA.lon, LUANDA.lat],
          zoom,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        map.touchZoomRotate.disableRotation();
        map.on('dragstart', () => { draggedRef.current = true; });
        map.on('click', (e: { lngLat: { lat: number; lng: number } }) => {
          onPickRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        });
        map.on('styledata', () => { brandMap(); syncRoute(); syncRadar(); syncGps(); });
        map.on('load', () => setReady(true));
        mapRef.current = map;
      })
      .catch(() => { if (!disposed) setFailed(true); });

    return () => {
      disposed = true;
      marksRef.current.forEach((t) => {
        if (t.anim) cancelAnimationFrame(t.anim);
        t.marker.remove();
      });
      marksRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tema: trocar o estilo deita as camadas que são nossas; o styledata traz-as de volta.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setStyle(dark ? STYLE_DARK : STYLE_LIGHT);
  }, [dark, ready]);

  useEffect(() => {
    syncRadar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radar?.at.lat, radar?.at.lon, radar?.radiusKm, ready]);

  useEffect(() => {
    syncGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.lat, me?.lon, meAccuracy, ready]);

  useEffect(() => {
    syncRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, ready]);

  // — Marcadores —————————————————————————————————————————————————————————————
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !ready) return;

    interface Spec { at: LatLon; sig: string; el: HTMLElement; anchor: 'bottom' | 'center'; animate: boolean }
    const want = new Map<string, Spec>();
    (pins ?? []).forEach((p) => want.set(`pin:${p.id}`, {
      at: p.at, sig: `${p.tone}|${p.label}|${p.scan ? 's' : ''}`,
      el: pinMarkerEl(p.label, p.tone, !!p.scan), anchor: 'bottom', animate: false,
    }));
    (cars ?? []).forEach((c) => want.set(`car:${c.id}`, {
      at: c.at, sig: c.assigned ? 'a' : 'n', el: carMarkerEl({ assigned: c.assigned }), anchor: 'center', animate: true,
    }));
    (bubbles ?? []).forEach((b) => {
      const el = bubbleEl(b.text, !!b.active);
      el.addEventListener('click', (e) => { e.stopPropagation(); onBubbleRef.current?.(b.id); });
      want.set(`bubble:${b.id}`, {
        at: b.at, sig: `${b.active ? 1 : 0}|${b.text}`, el, anchor: 'bottom', animate: true,
      });
    });
    if (me) want.set('me', { at: me, sig: 'me', el: meMarkerEl(), anchor: 'center', animate: true });

    want.forEach((spec, key) => {
      const ll: LngLat = [spec.at.lon, spec.at.lat];
      const found = marksRef.current.get(key);
      if (found && found.sig === spec.sig) {
        if (spec.animate) glide(found, ll);
        else found.marker.setLngLat(ll);
        return;
      }
      if (found) {
        if (found.anim) cancelAnimationFrame(found.anim);
        found.marker.remove();
      }
      marksRef.current.set(key, {
        marker: new lib.Marker({ element: spec.el, anchor: spec.anchor }).setLngLat(ll).addTo(map),
        at: ll, anim: null, sig: spec.sig,
      });
    });

    marksRef.current.forEach((tracked, key) => {
      if (!want.has(key)) {
        if (tracked.anim) cancelAnimationFrame(tracked.anim);
        tracked.marker.remove();
        marksRef.current.delete(key);
      }
    });
  }, [pins, cars, bubbles, me, ready]);

  // — Janela visível —————————————————————————————————————————————————————————
  // Declarado antes da câmara: o novo padding tem de estar aplicado quando o
  // fitBounds calcula para onde ir.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setPadding({ top: 64, bottom: clampBottom(map, paddingBottom), left: 40, right: 40 });
  }, [paddingBottom, ready]);

  // — Câmara——————————————————————————————————————————————————————————————————
  // O pino do aparelho não entra na conta dos pontos a enquadrar: ele muda a
  // cada leitura do GPS, e uma câmara que o segue a cada salto dá voltas no
  // ecrã. Ele só manda na câmara quando a pessoa o pede — o `focusToken` do
  // botão «ver o meu ponto».
  const meRef = useRef(me);
  meRef.current = me;
  const lastFocusRef = useRef(focusToken);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (focusToken !== lastFocusRef.current) {
      lastFocusRef.current = focusToken;
      const at = meRef.current;
      if (at) {
        draggedRef.current = false;
        map.easeTo({ center: [at.lon, at.lat], zoom: Math.max(map.getZoom(), 15.5), duration: 800 });
        return;
      }
    }
    const points: LngLat[] = [
      ...(pins ?? []).map((p) => [p.at.lon, p.at.lat] as LngLat),
      ...(bubbles ?? []).map((b) => [b.at.lon, b.at.lat] as LngLat),
      ...(route ?? []).map((r) => [r.lon, r.lat] as LngLat),
      ...(center ? [[center.lon, center.lat] as LngLat] : []),
    ];
    draggedRef.current = false;
    if (points.length > 1) {
      map.fitBounds(boundsOf(points), { duration: 900, maxZoom: 15.5 });
    } else if (points.length === 1) {
      map.easeTo({ center: points[0], zoom: Math.max(map.getZoom(), 14.5), duration: 800 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, focusToken, ready]);

  // Seguir o carro — só enquanto a pessoa não mexer no mapa ela própria.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !follow || draggedRef.current) return;
    map.easeTo({
      center: [follow.lon, follow.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 1400,
    });
  }, [follow, ready]);

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-[#EDE6FA] dark:bg-[#22103F]', className)}>
      {/* h-full/w-full e não inset-0: o CSS do MapLibre põe position:relative no
          contentor depois de nós, e um contentor relativo sem altura dá um
          mapa de 0 px. */}
      <div ref={hostRef} className="h-full w-full" />
      {!ready && !failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            role="status"
            aria-label="a carregar o mapa"
            className="h-10 w-10 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600"
          />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">O mapa não abriu neste aparelho.</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            É um extra: continue a pedir a sua viagem normalmente.
          </p>
        </div>
      )}
    </div>
  );
}
