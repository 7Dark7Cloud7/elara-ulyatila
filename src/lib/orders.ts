import { supabase } from './supabase';
import type { Zone } from '../types';

/**
 * A ponte com o Elara Marketplace.
 *
 * Os dois produtos são a mesma base de dados e a mesma conta: quem entra no
 * Elara entra aqui. Isso permite uma ligação sem tabela nova — os pedidos de
 * política do Marketplace (`orders_select_participants`, migração 014) já
 * deixam o comprador ler a sua própria encomenda, e é exactamente isso que
 * usamos aqui. Pedimos por código e não recebemos nada se o código não for
 * nosso: o Row Level Security responde por nós, e não há lista de encomendas
 * alheias possível por este caminho.
 *
 * O que nunca viaja por link é o telefone e a morada. A ligação só leva o
 * código (`ELR-......`); o resto é lido pela sessão de quem é dono da compra.
 */

export interface ElaraOrder {
  code: string;
  buyerName: string;
  buyerPhone: string;
  address: string;
  status: string;
  paymentStatus: string;
  deliveryMethod: string;
  totalKz: number;
  items: { name: string; quantity: number }[];
}

/** O que a encomenda traz para o formulário de entrega. */
export interface OrderSeed {
  code: string;
  what: string;
  toName: string;
  toPhone: string;
  parcelSize: string;
  address: string;
  /** Zona adivinhada da morada livre. É uma sugestão: só entra se a pessoa tocar. */
  guess: { zoneId: string; zoneName: string } | null;
  itemCount: number;
  totalKz: number;
}

const norm = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Só o 9... de nove dígitos; o Marketplace guarda o que a pessoa escreveu. */
const angolanPhone = (raw: string): string => {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length > 9 && digits.startsWith('244')) return digits.slice(-9);
  return digits.slice(-9);
};

/**
 * A morada do Marketplace é uma linha só (`rua, bairro, cidade, Angola`), e a
 * Ulyatila trabalha com zonas da base de dados. Procuramos o nome de uma
 * zona dentro da morada e nada mais: bater certo com uma cidade («Luanda») não
 * escolhe um bairro, e uma entrega entregue no bairro errado é pior do que
 * nenhuma sugestão.
 */
export function guessZone(address: string, zones: Zone[]): Zone | null {
  const text = ` ${norm(address)} `;
  if (!text.trim()) return null;
  let best: Zone | null = null;
  for (const z of zones) {
    const name = norm(z.name);
    if (name.length < 3) continue;
    if (!text.includes(` ${name}`) && !text.includes(`${name} `) && !text.includes(name)) continue;
    if (!best || norm(z.name).length > norm(best.name).length) best = z;
  }
  return best;
}

/** O tamanho da encomenda, pelo número de peças. Sem peso na tabela, é o que há. */
const sizeFor = (units: number): string => (units >= 4 ? 'caixa' : units >= 2 ? 'pequeno' : 'documento');

/**
 * Os códigos actuais do Market são `ELR-......` e vivem na tabela em maiúsculas,
 * mas há encomendas antigas com id em minúsculas (`ord_...`). Perseguimos as
 * duas formas em vez de forçar uma só, e devolvemos sempre o id tal como o
 * Market o guarda — é essa exacta string que o `tr_link_order` vai comparar.
 */
const idCandidates = (code: string): string[] =>
  Array.from(new Set([code, code.toUpperCase(), code.toLowerCase()])).filter(Boolean);

export async function fetchElaraOrder(code: string): Promise<ElaraOrder | null> {
  const raw = code.trim();
  if (!raw) return null;

  const { data, error } = await supabase
    .from('orders')
    .select('id, buyer_name, buyer_phone, shipping_address, status, payment_status, delivery_method, total, created_at')
    .in('id', idCandidates(raw))
    .limit(1)
    .maybeSingle();
  // Erro OU linha ausente são a mesma coisa para quem usa: esta app não tem
  // nada a dizer sobre encomendas que não são da pessoa.
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const orderId = String(row.id ?? raw);

  // A coluna no Market é `title`, não `name`. Pedir `name` fazia o embed
  // falhar em silêncio e a entrega chegaria sem dizer o que vai na caixa.
  const { data: itemRows } = await supabase
    .from('order_items')
    .select('quantity, price, products(title)')
    .eq('order_id', orderId);

  const items = ((itemRows ?? []) as Record<string, unknown>[])
    .map((it) => {
      const p = it.products as { title?: string } | { title?: string }[] | null;
      const one = Array.isArray(p) ? p[0] : p;
      return {
        name: (one?.title ?? 'Artigo').toString().slice(0, 60),
        quantity: Number(it.quantity ?? 1) || 1,
      };
    })
    .filter((it) => it.quantity > 0);

  return {
    code: orderId,
    buyerName: String(row.buyer_name ?? '').slice(0, 60),
    buyerPhone: angolanPhone(String(row.buyer_phone ?? '')),
    address: String(row.shipping_address ?? '').slice(0, 160),
    status: String(row.status ?? ''),
    paymentStatus: String(row.payment_status ?? ''),
    deliveryMethod: String(row.delivery_method ?? ''),
    totalKz: Math.round(Number(row.total ?? 0)) || 0,
    items,
  };
}

export function seedFromOrder(order: ElaraOrder, zones: Zone[]): OrderSeed {
  const units = order.items.reduce((s, i) => s + i.quantity, 0);
  const names = order.items.map((i) => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name));
  const what = names.length ? names.join(', ').slice(0, 120) : `Encomenda ${order.code}`;
  const zone = guessZone(order.address, zones);
  return {
    code: order.code,
    what,
    toName: order.buyerName,
    toPhone: order.buyerPhone,
    parcelSize: sizeFor(units),
    address: order.address,
    guess: zone ? { zoneId: zone.id, zoneName: zone.name } : null,
    itemCount: units,
    totalKz: order.totalKz,
  };
}

/**
 * Guardar o par viagem↔encomenda (migração 0006). Sem a migração aplicada o
 * `tr_link_order` não existe no servidor, e é exactamente assim que deve
 * ficar: a entrega acontece na mesma, só não aparece ligada na outra app.
 */
export async function linkOrder(tripId: string, code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('tr_link_order', {
    p_trip_id: tripId,
    p_order_code: code,
  });
  if (error) return false;
  return (data as { ok?: boolean } | null)?.ok !== false;
}
