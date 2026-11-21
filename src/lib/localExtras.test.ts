import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addTrustedContact,
  buildRepeatSeed,
  demoDriverReply,
  demoStepProgress,
  filterHelpItems,
  filterOpenDriverFeed,
  filterRentals,
  filterTrips,
  filterWalletTxs,
  formatPhoneDisplay,
  isValidEmail,
  loadLocalPlaces,
  loadTrustedContacts,
  mergeSavedPlaces,
  normalizeAngolaPhone,
  normalizeSearch,
  pickPopularZones,
  removeLocalPlace,
  removeTrustedContact,
  saveLocalPlace,
  summarizeWalletMonth,
  trustedShareMessage,
  verifyDemoPin,
  type StorageLike,
} from './localExtras';
import type { OpenTrip, Trip, VehicleClass, WalletTx, Zone } from '../types';

function makeMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe('local saved places', () => {
  it('saves, loads, deduplicates, and removes places per user', () => {
    const store = makeMemoryStorage();
    const afterAdd = saveLocalPlace('u1', {
      label: 'Casa',
      emoji: '🏠',
      zone_id: 'talatona',
      lat: -8.92,
      lon: 13.18,
      note: 'Portão azul',
    }, store);
    assert.equal(afterAdd.length, 1);
    assert.equal(loadLocalPlaces('u1', store).length, 1);
    assert.equal(loadLocalPlaces('u2', store).length, 0);

    // Same zone + label deduplicates instead of duplicating
    const afterDup = saveLocalPlace('u1', {
      label: 'casa',
      emoji: '🏠',
      zone_id: 'talatona',
      lat: -8.92,
      lon: 13.18,
      note: '',
    }, store);
    assert.equal(afterDup.length, 1);

    const afterRemove = removeLocalPlace('u1', afterDup[0].id, store);
    assert.equal(afterRemove.length, 0);
  });

  it('merges remote and local saved places giving precedence to remote', () => {
    const merged = mergeSavedPlaces(
      [{ id: 'srv-1', label: 'Casa', emoji: '🏠', zone_id: 'talatona', lat: -8.9, lon: 13.1, note: '' }],
      [
        { id: 'loc-1', label: 'Casa', emoji: '🏠', zone_id: 'talatona', lat: -8.9, lon: 13.1, note: '' },
        { id: 'loc-2', label: 'Trabalho', emoji: '💼', zone_id: 'mutamba', lat: -8.81, lon: 13.23, note: '' },
      ],
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0].id, 'srv-1');
    assert.equal(merged[1].id, 'loc-2');
  });
});

describe('trusted emergency contacts', () => {
  it('normalizes Angola phones and enforces validation and limits', () => {
    const store = makeMemoryStorage();
    assert.equal(normalizeAngolaPhone('923 456 789'), '244923456789');
    assert.equal(formatPhoneDisplay('244923456789'), '+244 923 456 789');

    const badName = addTrustedContact({ name: 'A', phone: '923456789' }, store);
    assert.equal(badName.ok, false);

    const badPhone = addTrustedContact({ name: 'Ana', phone: '1234' }, store);
    assert.equal(badPhone.ok, false);

    const ok1 = addTrustedContact({ name: 'Ana Silva', phone: '923 456 789', relation: 'Irmã' }, store);
    assert.equal(ok1.ok, true);
    if (ok1.ok) {
      assert.equal(ok1.contacts.length, 1);
      assert.equal(ok1.contacts[0].phone, '244923456789');
    }

    const dup = addTrustedContact({ name: 'Outra Ana', phone: '+244 923 456 789' }, store);
    assert.equal(dup.ok, false);

    const id = loadTrustedContacts(store)[0].id;
    assert.equal(removeTrustedContact(id, store).length, 0);
  });

  it('never leaks PINs in trusted share or SOS messages', () => {
    const msg = trustedShareMessage({
      contactName: 'Ana',
      trip: {
        code: 'ELR-8821',
        driver_name: 'João Manuel',
        car_model: 'Toyota Corolla',
        plate: 'LD-24-71-AA',
        price_kz: 2500,
      },
      fromName: 'Mutamba',
      toName: 'Talatona',
    });
    assert.match(msg, /ELR-8821/);
    assert.match(msg, /LD-24-71-AA/);
    assert.doesNotMatch(msg, /PIN/i);
    assert.doesNotMatch(msg, /código de embarque/i);

    const sos = trustedShareMessage({
      contactName: 'Ana',
      trip: {
        code: 'ELR-8821',
        driver_name: 'João Manuel',
        car_model: 'Toyota Corolla',
        plate: 'LD-24-71-AA',
        price_kz: 2500,
      },
      fromName: 'Mutamba',
      toName: 'Talatona',
      emergency: true,
    });
    assert.match(sos, /preciso de ajuda/i);
    assert.doesNotMatch(sos, /PIN/i);
  });
});

describe('repeat-trip seed and filters', () => {
  const classes: VehicleClass[] = [
    { id: 'economico', label: 'Económico', seats: 4, base_kz: 300, per_km_kz: 400, min_kz: 900, per_seat: false, blurb: '', icon: 'Car', sort: 1 },
    { id: 'moto', label: 'Moto', seats: 1, base_kz: 200, per_km_kz: 250, min_kz: 600, per_seat: false, blurb: '', icon: 'Bike', sort: 2 },
    { id: 'canter', label: 'Canter', seats: 2, base_kz: 2000, per_km_kz: 1200, min_kz: 5000, per_seat: false, blurb: '', icon: 'Truck', sort: 3, lane: 'carga' },
  ];

  const baseTrip: Trip = {
    id: 't1',
    code: 'ULY-101',
    passenger_id: 'u1',
    passenger_name: 'Paulo',
    kind: 'passageiro',
    from_zone_id: 'mutamba',
    to_zone_id: 'talatona',
    class_id: 'economico',
    seats: 1,
    distance_km: 12,
    price_kz: 3200,
    commission_kz: 320,
    driver_keeps_kz: 2880,
    state: 'ended',
    driver_name: 'Carlos',
    payment: 'cash',
    trial: false,
    events: [],
    created_at: Date.now(),
  };

  it('maps trips to the right repeat service', () => {
    assert.equal(buildRepeatSeed(baseTrip, classes).service, 'carro');
    assert.equal(buildRepeatSeed({ ...baseTrip, class_id: 'moto' }, classes).service, 'moto');
    assert.equal(buildRepeatSeed({ ...baseTrip, seats: 3 }, classes).service, 'partilha');
    assert.equal(buildRepeatSeed({ ...baseTrip, kind: 'entrega', class_id: 'moto' }, classes).service, 'entrega');
    assert.equal(buildRepeatSeed({ ...baseTrip, kind: 'entrega', class_id: 'canter' }, classes).service, 'mudanca');
  });

  it('filters trips by status, kind, and query', () => {
    const trips: Trip[] = [
      baseTrip,
      { ...baseTrip, id: 't2', code: 'ULY-202', kind: 'entrega', state: 'cancelled', to_zone_id: 'viana' },
    ];
    const zoneName = (id: string) => ({ mutamba: 'Mutamba', talatona: 'Talatona', viana: 'Viana' }[id] ?? id);
    assert.equal(filterTrips(trips, { status: 'done', kind: 'all', query: '', zoneName }).length, 1);
    assert.equal(filterTrips(trips, { status: 'all', kind: 'entrega', query: 'viana', zoneName }).length, 1);
    assert.equal(filterTrips(trips, { status: 'all', kind: 'all', query: 'ULY-101', zoneName }).length, 1);
  });

  it('summarizes and filters wallet transactions', () => {
    const now = new Date('2026-05-15T10:00:00Z');
    const txs: WalletTx[] = [
      { id: '1', who: 'u1', kind: 'topup', amount_kz: 5000, balance_after_kz: 5000, note: 'Multicaixa', at: new Date('2026-05-02T10:00:00Z').getTime() },
      { id: '2', who: 'u1', kind: 'commission', amount_kz: -600, balance_after_kz: 4400, note: 'Corrida', at: new Date('2026-05-03T10:00:00Z').getTime() },
      { id: '3', who: 'u1', kind: 'topup', amount_kz: 9000, balance_after_kz: 9000, note: 'Mês passado', at: new Date('2026-04-10T10:00:00Z').getTime() },
    ];
    const summary = summarizeWalletMonth(txs, now);
    assert.equal(summary.inKz, 5000);
    assert.equal(summary.outKz, 600);
    assert.equal(summary.count, 2);

    assert.equal(filterWalletTxs(txs, { direction: 'in', query: '' }).length, 2);
    assert.equal(filterWalletTxs(txs, { direction: 'out', query: '' }).length, 1);
    assert.equal(filterWalletTxs(txs, { direction: 'all', query: 'multicaixa' }).length, 1);
  });

  it('filters and sorts open driver feed by payment or distance', () => {
    const zones: Record<string, Zone> = {
      near: { id: 'near', name: 'Perto', city: 'Luanda', province: 'Luanda', lat: -8.812, lon: 13.235, kind: 'bairro' },
      far: { id: 'far', name: 'Longe', city: 'Luanda', province: 'Luanda', lat: -8.98, lon: 13.36, kind: 'bairro' },
    };
    const feed: OpenTrip[] = [
      { id: 'a', code: 'A', kind: 'passageiro', from_zone_id: 'far', to_zone_id: 'near', class_id: 'economico', seats: 1, distance_km: 15, price_kz: 4000, payment: 'cash', created_at: 1 },
      { id: 'b', code: 'B', kind: 'passageiro', from_zone_id: 'near', to_zone_id: 'far', class_id: 'economico', seats: 1, distance_km: 15, price_kz: 4200, payment: 'multicaixa', created_at: 2 },
    ];
    const cashOnly = filterOpenDriverFeed(feed, { filter: 'cash', selectedId: null, myPos: null, zoneOf: (id) => zones[id] ?? null });
    assert.deepEqual(cashOnly.map((t) => t.id), ['a']);

    const nearest = filterOpenDriverFeed(feed, {
      filter: 'nearest',
      selectedId: null,
      myPos: { lat: -8.81, lon: 13.23 },
      zoneOf: (id) => zones[id] ?? null,
    });
    assert.deepEqual(nearest.map((t) => t.id), ['b', 'a']);
  });
});

describe('demo studio helpers', () => {
  it('validates PIN, maps progress, and generates contextual driver replies', () => {
    assert.equal(verifyDemoPin('4821', '4821'), true);
    assert.equal(verifyDemoPin('48 21', '4821'), true);
    assert.equal(verifyDemoPin('1234', '4821'), false);
    assert.equal(demoStepProgress(0), 8);
    assert.equal(demoStepProgress(5), 100);
    assert.match(demoDriverReply('here', 'Toyota Corolla', 'LD-24-71-AA'), /LD-24-71-AA/);
  });
});

describe('Phase 2 search, rentals, zones, and auth helpers', () => {
  it('filters help items accent-insensitively across questions and answers', () => {
    const items = [
      { id: 'preco', q: 'O preço que vejo é o que pago?', a: ['Sem aumento automático.'] },
      { id: 'codigo', q: 'O código de 4 dígitos: quando se dá?', a: ['O código começa a viagem.'] },
      { id: 'sos', q: 'Se me sentir em perigo', a: ['O botão SOS marca o 111.'] },
    ];
    assert.equal(normalizeSearch('Código & Preço'), 'codigo & preco');
    assert.equal(filterHelpItems(items, 'codigo 4').length, 1);
    assert.equal(filterHelpItems(items, 'codigo 4')[0].id, 'codigo');
    assert.equal(filterHelpItems(items, 'preco').length, 1);
    assert.equal(filterHelpItems(items, '111')[0].id, 'sos');
    assert.equal(filterHelpItems(items, 'inexistente').length, 0);
    assert.equal(filterHelpItems(items, '   ').length, 3);
  });

  it('filters rentals by driver mode and search text', () => {
    const rentals = [
      { title: 'Toyota Corolla', blurb: 'AC frio', with_driver: true, allows_self_drive: false, zone_id: 'talatona', tr_driver: { public_name: 'Carlos', model: 'Corolla' } },
      { title: 'Hyundai Tucson', blurb: 'Familiar', with_driver: false, allows_self_drive: true, zone_id: 'mutamba', tr_driver: { public_name: 'Marta', model: 'Tucson' } },
      { title: 'Toyota Hiace', blurb: 'Eventos', with_driver: true, allows_self_drive: true, zone_id: 'kilamba', tr_driver: { public_name: 'Pedro', model: 'Hiace' } },
    ];
    const zoneName = (id?: string | null) => ({ talatona: 'Talatona', mutamba: 'Mutamba', kilamba: 'Kilamba' }[id ?? ''] ?? '');

    assert.equal(filterRentals(rentals, { mode: 'driver', query: '', zoneName }).length, 2);
    assert.equal(filterRentals(rentals, { mode: 'self', query: '', zoneName }).length, 2);
    assert.equal(filterRentals(rentals, { mode: 'all', query: 'talatona', zoneName }).length, 1);
    assert.equal(filterRentals(rentals, { mode: 'self', query: 'marta', zoneName })[0].title, 'Hyundai Tucson');
  });

  it('picks popular zones only from loaded zones without inventing fake ones', () => {
    const zones: Zone[] = [
      { id: 'z1', name: 'Cazenga', city: 'Luanda', province: 'Luanda', lat: -8.82, lon: 13.30, kind: 'zona' },
      { id: 'z2', name: 'Mutamba', city: 'Luanda', province: 'Luanda', lat: -8.81, lon: 13.23, kind: 'bairro' },
      { id: 'z3', name: 'Talatona', city: 'Luanda', province: 'Luanda', lat: -8.92, lon: 13.18, kind: 'zona' },
      { id: 'z4', name: 'Sambizanga', city: 'Luanda', province: 'Luanda', lat: -8.79, lon: 13.26, kind: 'bairro' },
    ];
    const top = pickPopularZones(zones, 3);
    assert.deepEqual(top.map((z) => z.id), ['z3', 'z2', 'z1']);
    assert.deepEqual(pickPopularZones([], 6), []);
  });

  it('validates email addresses cleanly before calling auth', () => {
    assert.equal(isValidEmail('cliente@elara.ao'), true);
    assert.equal(isValidEmail('  nome.apelido+1@gmail.com '), true);
    assert.equal(isValidEmail('sem-arroba.com'), false);
    assert.equal(isValidEmail('com espaco@elara.ao'), false);
    assert.equal(isValidEmail('a@b'), false);
  });
});

