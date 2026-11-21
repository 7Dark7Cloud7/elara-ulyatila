import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_CLASSES,
  DEMO_DELIVERY_CLASSES,
  DEMO_ZONES,
  advanceDemoDriverTrip,
  advanceDemoTrip,
  appendDemoChatMessage,
  buildDemoNearbyCars,
  cancelDemoTrip,
  claimDemoDriverTrip,
  computeDemoQuote,
  computeDemoRentalQuote,
  confirmDemoMoneyRequest,
  createDemoTrip,
  createInitialDemoState,
  demoDriverPosition,
  rateDemoTrip,
  requestDemoMoney,
} from './demoEngine.ts';
import { classIcon } from '../components/Icon.tsx';

test('computeDemoQuote returns accurate line-by-line quote for passenger and delivery', () => {
  const q = computeDemoQuote({
    classId: 'economico',
    fromZoneId: 'd-talatona',
    toZoneId: 'd-ilha',
    seats: 1,
    kind: 'passageiro',
    zones: DEMO_ZONES,
    classes: DEMO_CLASSES,
    deliveryClasses: DEMO_DELIVERY_CLASSES,
  });
  assert.ok(q);
  assert.ok(q.priceKz >= 1000);
  assert.equal(q.lines.reduce((s, l) => s + l.amountKz, 0), q.priceKz);
  assert.equal(q.commissionKz + q.driverKeepsKz, q.priceKz);

  const sameZone = computeDemoQuote({
    classId: 'economico',
    fromZoneId: 'd-talatona',
    toZoneId: 'd-talatona',
    seats: 1,
    kind: 'passageiro',
    zones: DEMO_ZONES,
    classes: DEMO_CLASSES,
    deliveryClasses: DEMO_DELIVERY_CLASSES,
  });
  assert.equal(sameZone, null);
});

test('full demo trip lifecycle runs searching -> accepted -> arriving -> waiting_pin -> ongoing -> ended -> rated', () => {
  const initial = createInitialDemoState(1_700_000_000_000);
  const quote = computeDemoQuote({
    classId: 'conforto',
    fromZoneId: 'd-praca',
    toZoneId: 'd-ai',
    seats: 1,
    kind: 'passageiro',
    zones: DEMO_ZONES,
    classes: DEMO_CLASSES,
    deliveryClasses: DEMO_DELIVERY_CLASSES,
  });
  assert.ok(quote);

  const created = createDemoTrip(initial, { quote, kind: 'passageiro', payment: 'cash' }, 1_700_000_001_000);
  assert.equal(created.trip.state, 'searching');
  assert.equal(created.pin.length, 4);
  assert.equal(demoDriverPosition(created.trip, DEMO_ZONES), null);

  let s = created.state;
  const states: string[] = [];
  for (let i = 0; i < 5; i++) {
    s = advanceDemoTrip(s, created.trip.id, 1_700_000_002_000 + i * 1000);
    const cur = s.trips.find((t) => t.id === created.trip.id)!;
    states.push(cur.state);
    assert.ok(demoDriverPosition(cur, DEMO_ZONES));
  }
  assert.deepEqual(states, ['accepted', 'arriving', 'waiting_pin', 'ongoing', 'ended']);

  s = appendDemoChatMessage(s, created.trip.id, 'passenger', 'Vou pagar com nota de 5000', 1_700_000_010_000);
  const chat = s.chats[created.trip.id] ?? [];
  assert.ok(chat.some((m) => m.sender_role === 'driver' && m.text.toLowerCase().includes('troco')));

  s = rateDemoTrip(s, created.trip.id, 5);
  assert.equal(s.trips.find((t) => t.id === created.trip.id)?.state, 'rated');
});

test('demo cancel, wallet request/confirm, rental quote, and driver dispatch all update cleanly', () => {
  let s = createInitialDemoState(1_700_000_000_000);
  assert.equal(buildDemoNearbyCars({ lat: -8.81, lon: 13.23 }).length, 5);

  // Cancel
  const q = computeDemoQuote({
    classId: 'moto',
    fromZoneId: 'd-mutamba',
    toZoneId: 'd-maianga',
    seats: 1,
    kind: 'passageiro',
    zones: DEMO_ZONES,
    classes: DEMO_CLASSES,
    deliveryClasses: DEMO_DELIVERY_CLASSES,
  })!;
  const created = createDemoTrip(s, { quote: q, kind: 'passageiro', payment: 'multicaixa' });
  s = cancelDemoTrip(created.state, created.trip.id);
  assert.equal(s.trips.find((t) => t.id === created.trip.id)?.state, 'cancelled');

  // Wallet topup + instant confirm
  const startBal = s.wallet.balanceKz;
  s = requestDemoMoney(s, 'in', 5000, 'Multicaixa Express', 1_700_000_020_000);
  const reqId = s.wallet.requests[0].id;
  s = confirmDemoMoneyRequest(s, reqId, 1_700_000_021_000);
  assert.equal(s.wallet.balanceKz, startBal + 5000);

  // Rental quote
  const rq = computeDemoRentalQuote(s.rentals[0], 'day', 2, true);
  assert.equal(rq.priceKz, (s.rentals[0].price_day_kz + s.rentals[0].driver_fee_kz) * 2);

  // Driver claim & complete
  const openId = s.openDriverTrips[0].id;
  const beforeTrips = s.driverToday.trips;
  s = claimDemoDriverTrip(s, openId);
  assert.ok(s.driverActiveTrip);
  for (let i = 0; i < 4; i++) s = advanceDemoDriverTrip(s);
  assert.equal(s.driverActiveTrip, null);
  assert.equal(s.driverToday.trips, beforeTrips + 1);
});

test('custom Elara vehicle class icons resolve for all supported keys and fallback safely', () => {
  for (const key of ['Car', 'Bike', 'Taxi', 'Armchair', 'Users', 'Van', 'Bus', 'Truck', 'Unknown']) {
    const Comp = classIcon(key);
    assert.equal(typeof Comp, 'function');
  }
});
