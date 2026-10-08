import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDayCyclePeriod, getDayCycleConfig } from './alpineDayCycle';
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
  it('determines the correct day cycle period for each hour range', () => {
    // Dawn: 06:00 to 11:59
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 6, 0)), 'dawn');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 11, 59)), 'dawn');

    // Day: 12:00 to 17:59
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 12, 0)), 'day');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 14, 30)), 'day');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 17, 59)), 'day');

    // Sunset: 18:00 to 19:59
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 18, 0)), 'sunset');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 19, 59)), 'sunset');

    // Night: 20:00 to 05:59
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 20, 0)), 'night');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 2, 0)), 'night');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 5, 59)), 'night');

    // Number hour directly
    assert.equal(getDayCyclePeriod(7), 'dawn');
    assert.equal(getDayCyclePeriod(11), 'dawn');
    assert.equal(getDayCyclePeriod(12), 'day');
    assert.equal(getDayCyclePeriod(19), 'sunset');
    assert.equal(getDayCyclePeriod(20), 'night');
  });

  it('generates human greetings and atmospheric metadata for each period', () => {
    const dawn = getDayCycleConfig('dawn');
    assert.equal(dawn.label, 'Amanecer');
    assert.equal(dawn.greeting('Christian'), 'Buenos días, Christian');

    const day = getDayCycleConfig('day');
    assert.equal(day.label, 'Día');
    assert.equal(day.greeting('Christian'), 'Buenas tardes, Christian');

    const sunset = getDayCycleConfig('sunset');
    assert.equal(sunset.label, 'Atardecer');
    assert.equal(sunset.greeting('Christian'), 'Buenas tardes, Christian');

    const night = getDayCycleConfig('night');
    assert.equal(night.label, 'Noche');
    assert.equal(night.greeting(), 'Buenas noches');
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
