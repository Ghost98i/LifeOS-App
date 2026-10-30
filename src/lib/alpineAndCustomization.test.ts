import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDayCyclePeriod, getDayCycleConfig, getGreetingPrefix, getLocalGreeting } from './alpineDayCycle';
import { identifyMerchant } from './merchantIdentity';
import {
  loadTodayCustomization,
  saveTodayCustomization,
  loadFinanceCustomization,
  saveFinanceCustomization,
  DEFAULT_TODAY_CUSTOMIZATION,
  DEFAULT_FINANCE_CUSTOMIZATION,
} from './viewCustomization';

describe('Alpine Day-Cycle Signature', () => {
  it('separates the five local image periods at every requested boundary', () => {
    const at = (hour: number, minute: number) => new Date(2026, 9, 15, hour, minute);
    // Noche: 19:30–04:59
    assert.equal(getDayCyclePeriod(at(19, 30)), 'night');
    assert.equal(getDayCyclePeriod(at(23, 59)), 'night');
    assert.equal(getDayCyclePeriod(at(0, 0)), 'night');
    assert.equal(getDayCyclePeriod(at(4, 59)), 'night');
    // Madrugada: 05:00–06:59
    assert.equal(getDayCyclePeriod(at(5, 0)), 'predawn');
    assert.equal(getDayCyclePeriod(at(6, 59)), 'predawn');
    // Mañana: 07:00–10:59
    assert.equal(getDayCyclePeriod(at(7, 0)), 'morning');
    assert.equal(getDayCyclePeriod(at(10, 59)), 'morning');
    // Mediodía: 11:00–16:59
    assert.equal(getDayCyclePeriod(at(11, 0)), 'day');
    assert.equal(getDayCyclePeriod(at(16, 59)), 'day');
    // Atardecer: 17:00–19:29
    assert.equal(getDayCyclePeriod(at(17, 0)), 'sunset');
    assert.equal(getDayCyclePeriod(at(19, 29)), 'sunset');
  });

  it('keeps greeting boundaries coherent with the five time periods', () => {
    const at = (hour: number, minute: number) => new Date(2026, 9, 15, hour, minute);
    assert.equal(getGreetingPrefix(at(0, 0)), 'Buenas noches');
    assert.equal(getGreetingPrefix(at(4, 59)), 'Buenas noches');
    assert.equal(getGreetingPrefix(at(5, 0)), 'Buenos días');
    assert.equal(getGreetingPrefix(at(6, 59)), 'Buenos días');
    assert.equal(getGreetingPrefix(at(7, 0)), 'Buenos días');
    assert.equal(getGreetingPrefix(at(11, 59)), 'Buenos días');
    assert.equal(getGreetingPrefix(at(12, 0)), 'Buenas tardes');
    assert.equal(getGreetingPrefix(at(16, 59)), 'Buenas tardes');
    assert.equal(getGreetingPrefix(at(17, 0)), 'Buenas tardes');
    assert.equal(getGreetingPrefix(at(19, 29)), 'Buenas tardes');
    assert.equal(getGreetingPrefix(at(19, 30)), 'Buenas noches');
    assert.equal(getGreetingPrefix(at(23, 59)), 'Buenas noches');
    assert.equal(getDayCyclePeriod(at(11, 30)), 'day');
    assert.equal(getGreetingPrefix(at(11, 30)), 'Buenos días');
    assert.equal(getDayCyclePeriod(at(19, 15)), 'sunset');
    assert.equal(getGreetingPrefix(at(19, 15)), 'Buenas tardes');
    assert.equal(getLocalGreeting(at(12, 0), 'Christian'), 'Buenas tardes, Christian');
    assert.equal(getDayCycleConfig('predawn').label, 'Madrugada');
    assert.equal(getDayCycleConfig('morning').label, 'Mañana');
    assert.equal(getDayCycleConfig('day').label, 'Mediodía');
    assert.equal(getDayCycleConfig('sunset').label, 'Atardecer');
    assert.equal(getDayCycleConfig('night').label, 'Noche');
  });
});

describe('Merchant Offline Identity', () => {
  it('correctly recognizes popular Uruguayan and international merchants offline', () => {
    const spotify = identifyMerchant('Spotify Premium mensual');
    assert.ok(spotify !== null);
    assert.equal(spotify?.name, 'Spotify');
    assert.equal(spotify?.icon, '🎵');
    assert.ok(spotify?.badgeBg.includes('rgba'));

    const ute = identifyMerchant('Factura UTE luz casa');
    assert.ok(ute !== null);
    assert.equal(ute?.name, 'UTE');
    assert.equal(ute?.icon, '⚡');

    const netflix = identifyMerchant('Suscripción Netflix 4K');
    assert.ok(netflix !== null);
    assert.equal(netflix?.name, 'Netflix');
    assert.equal(netflix?.icon, '🎬');

    const pedidosYa = identifyMerchant('Cena pedidosya');
    assert.ok(pedidosYa !== null);
    assert.equal(pedidosYa?.name, 'PedidosYa');
    assert.equal(pedidosYa?.icon, '🛵');

    const antel = identifyMerchant('Plan fibra Antel');
    assert.ok(antel !== null);
    assert.equal(antel?.name, 'Antel');
  });

  it('returns null for generic descriptions without merchant match', () => {
    assert.equal(identifyMerchant('Compra panaderia de la esquina'), null);
    assert.equal(identifyMerchant(''), null);
    assert.equal(identifyMerchant(undefined), null);
    assert.equal(identifyMerchant(null), null);
  });
});

describe('View Customization Persistence (Monarch-inspired)', () => {
  it('loads default Today customization safely even without localStorage', () => {
    const custom = loadTodayCustomization();
    assert.ok(custom !== null);
    assert.equal(custom.visibleWidgets.focus, true);
    assert.equal(custom.visibleWidgets.gym, true);
    assert.equal(DEFAULT_TODAY_CUSTOMIZATION.density, 'comfortable');

    // Save invocation does not crash
    saveTodayCustomization(custom);
  });

  it('loads default Finance customization safely', () => {
    const custom = loadFinanceCustomization();
    assert.ok(custom !== null);
    assert.equal(custom.heroDisplayMode, 'actual_balance');
    assert.equal(custom.showCommitmentsStrip, true);
    assert.equal(DEFAULT_FINANCE_CUSTOMIZATION.heroDisplayMode, 'actual_balance');

    // Save invocation does not crash
    saveFinanceCustomization(custom);
  });
});
