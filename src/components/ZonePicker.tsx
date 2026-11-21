import { useMemo, useState } from 'react';
import { Check, ChevronRight, Loader2, MapPin, Search, X } from 'lucide-react';
import type { Zone } from '../types';
import { Sheet } from './Sheet';
import { dataDate, placeKindLabel, searchPlaces, usePlacesReady, type Place } from '../lib/places';
import { reportMissingPlace, type MissingPlace } from '../lib/reports';
import { cn, OFF_ATTR } from '../lib/utils';

interface ZonePickerProps {
  label: string;
  value: string | null;
  zones: Zone[];
  onChange: (zoneId: string) => void;
  /**
   * Um lugar do índice OSM: dá o ponto fino no mapa, não só o bairro. Quem o
   * usa é a partida (o ponto onde a pessoa espera) e o destino (só o nome, que
   * é o que o motorista precisa de ler — o preço é sempre o da zona).
   */
  onExact?: (place: Place) => void;
  /**
   * Esta conta pode dizer-nos que falta um nome. Sem isto o ecrã de «nada
   * encontrado» continua a ser um beco sem saída para quem está no terreno.
   */
  report?: { uid: string; role: 'passenger' | 'driver' } | null;
  compact?: boolean;
  displayName?: string;
  tone?: 'from' | 'to';
}

/** Quando cada nome foi conferido no OSM — a pessoa merece saber a idade do índice. */
const checkedOn = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** O que o pedido responde, em palavras que a pessoa percebe sem abrir a consola. */
const SENT_TEXT: Record<MissingPlace, string> = {
  enviado: 'Guardámos a palavra que procurou. Vai para a lista que a equipa lê.',
  ja_pedido: 'Já pediu esse nome hoje — está na lista à espera.',
  vazio: 'Escreva primeiro o nome que não encontra.',
  falhou: 'Agora não conseguiu enviar. Tente de novo.',
};

/** Bairros e municípios da base de dados, mais os lugares do índice (bairros, marcos, vias). */
export function ZonePicker({ label, value, zones, onChange, onExact, report, compact, displayName, tone = 'from' }: ZonePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<MissingPlace | null>(null);
  const selected = zones.find((z) => z.id === value) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? zones.filter((z) =>
          `${z.name} ${z.city}`.toLowerCase().includes(q))
      : zones;
    const byCity = new Map<string, Zone[]>();
    for (const z of list) {
      const arr = byCity.get(z.city) ?? [];
      arr.push(z);
      byCity.set(z.city, arr);
    }
    return Array.from(byCity.entries());
  }, [zones, query]);

  // Por cima dos bairros: «Belas Shopping» é um ponto, «Belas» é uma zona.
  // O índice chega depois do primeiro ecrã, por isso a lista se reescreve
  // sozinha quando ele entra — quem já escreveu não tem de apagar nada.
  const ready = usePlacesReady();
  // A licença é sempre dita, com índice dentro ou a caminho; a data só vale
  // quando os nomes chegaram, senão era uma data sem nada atrás dela.
  const checked = ready ? checkedOn(dataDate()) : '';
  const exact = useMemo(
    () => (onExact && ready ? searchPlaces(query, zones) : []),
    [onExact, ready, query, zones],
  );

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
    setSent(null);
  };

  const pickExact = (p: Place) => {
    // A zona de preço é a mais próxima do lugar: é ela que o servidor usa, e por
    // isso o preço continua a bater certo com o que o motorista vai receber.
    onChange(p.zoneId);
    onExact?.(p);
    setOpen(false);
    setQuery('');
    setSent(null);
  };

  const ask = async () => {
    if (!report || sending) return;
    setSending(true);
    setSent(await reportMissingPlace(report.uid, report.role, query));
    setSending(false);
  };

  // O referencial desenha a rota com um círculo violeta na partida e um
  // quadrado dourado no destino — a pessoa vê a forma antes de ler a palavra.
  const dot = tone === 'from'
    ? 'rounded-full bg-purple-500 ring-2 ring-white/70 dark:bg-purple-400 dark:ring-white/20'
    : 'rounded-[3px] bg-ink dark:bg-amber-400';

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${label}: ${selected ? displayName || selected.name : 'escolher zona'}`}
          className="w-full flex items-center gap-3 px-4 min-h-16 py-3 text-left active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
        >
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', dot)} />
          <span className="min-w-0 flex-1">
            <span className="block text-label font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
            <span className={cn('block text-control font-semibold break-words mt-0.5', selected ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400')}>
              {selected ? displayName || selected.name : 'Escolher zona'}
            </span>
            {selected && displayName && displayName !== selected.name && (
              <span className="block text-label text-zinc-500 dark:text-zinc-400 mt-1">Zona de preço: {selected.name}</span>
            )}
          </span>
          <ChevronRight className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 h-14 text-left"
        >
          <MapPin className={cn('w-5 h-5 shrink-0', selected ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-400')} />
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              {label}
            </span>
            <span className={cn('block truncate font-medium', selected ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400')}>
              {selected ? `${selected.name} · ${selected.city}` : 'Escolher zona'}
            </span>
          </span>
        </button>
      )}

      <Sheet open={open} title={label} onClose={() => { setOpen(false); setSent(null); }} tall>
        <div className="sticky -top-4 z-10 bg-white dark:bg-zinc-900 pt-1 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              autoFocus
              type="search"
              enterKeyHint="search"
              aria-label={`Pesquisar ${label.toLowerCase()}`}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSent(null); }}
              placeholder={onExact ? 'Procurar bairro, avenida ou lugar…' : 'Procurar bairro ou município…'}
              className="w-full h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 pl-10 pr-12 text-control text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 outline-none focus:border-purple-400 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query && (
              <button
                type="button"
                aria-label="Limpar pesquisa"
                onClick={(e) => {
                  setQuery('');
                  setSent(null);
                  e.currentTarget.parentElement?.querySelector('input')?.focus();
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-xl text-zinc-500 dark:text-zinc-400 active:bg-zinc-200 dark:active:bg-zinc-700"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
          {onExact && !query.trim() && (
            <p className="mt-2 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              {tone === 'from'
                ? 'Escreva o nome do sítio — bairro, shopping, mercado, hospital, igreja, avenida — e pomos o pin no lugar, não só no bairro.'
                : 'Escreva o nome do sítio — bairro, shopping, mercado, hospital, igreja, avenida — e o motorista lê onde o deixar. O preço é sempre o da zona.'}
            </p>
          )}
        </div>
        <div className="space-y-5">
          {!!exact.length && (
            <div>
              <p className="text-[12px] font-semibold text-purple-700 dark:text-purple-300 mb-1.5">
                Lugares no mapa
              </p>
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
                {exact.map((p) => (
                  <button
                    key={`${p.name}-${p.lat}-${p.lon}`}
                    onClick={() => pickExact(p)}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-zinc-50 dark:active:bg-zinc-800/60"
                  >
                    <MapPin className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-zinc-900 dark:text-white truncate">{p.name}</span>
                      <span className="block text-[12px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                        {p.via === 'equipa'
                          ? 'dito pela equipa'
                          : `${placeKindLabel(p.kind)}${p.parent ? ` · ${p.parent}` : ''}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 text-right">
                      {p.zoneName}
                      <span className="block font-medium text-zinc-600 dark:text-zinc-400">
                        {p.zoneKm < 1 ? `${Math.round(p.zoneKm * 1000)} m` : `${p.zoneKm.toFixed(1)} km`} da paragem
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {results.map(([city, list]) => (
            <div key={city}>
              <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                {city}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {list.map((z) => (
                  <button
                    key={z.id}
                    onClick={() => pick(z.id)}
                    className={cn(
                      'text-left rounded-2xl px-3 py-2.5 border',
                      z.id === value
                        ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-400 text-purple-700 dark:text-purple-300'
                        : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200',
                    )}
                  >
                    <span className="block text-sm font-bold truncate">{z.name}</span>
                    <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 capitalize">{z.kind}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {results.length === 0 && !exact.length && (
            <div className="py-6 text-center">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {query.trim()
                  ? `Nada com «${query.trim()}» entre os bairros e lugares que temos. Escolha o bairro mais próximo e escreva a referência no ponto de embarque.`
                  : 'Nenhuma zona carregada.'}
              </p>
              {!!query.trim() && report && (
                sent ? (
                  <p className={cn(
                    'mt-3 flex items-start gap-1.5 text-[12px] font-semibold text-left',
                    sent === 'falhou'
                      ? 'text-amber-800 dark:text-amber-200'
                      : 'text-purple-700 dark:text-purple-300',
                  )}>
                    {sent !== 'falhou' && <Check className="w-3.5 h-3.5 shrink-0 mt-px" />}
                    <span>{SENT_TEXT[sent]}</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={ask}
                    disabled={sending}
                    className={cn(
                      'mt-3 inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-purple-100 dark:bg-purple-900/40 border border-purple-300 dark:border-purple-700 text-[13px] font-bold text-purple-700 dark:text-purple-200',
                      OFF_ATTR,
                    )}
                  >
                    {sending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Search className="w-4 h-4" />}
                    Falta o nome de «{query.trim().slice(0, 24)}» — diga-nos
                  </button>
                )
              )}
              {!!query.trim() && report && sent && sent !== 'falhou' && (
                <p className="mt-2 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                  Escreva outro nome por cima para pedir mais um.
                </p>
              )}
            </div>
          )}
          {onExact && (
            <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              Os nomes vêm do OpenStreetMap (licença ODbL)
              {checked ? `, conferidos em ${checked}` : ''}. Os marcados
              «dito pela equipa» vieram de pessoas no terreno, e dizem-no. O
              preço é sempre o da zona onde o ponto cai.
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
