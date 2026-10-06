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
    // Dawn: 05:00 to 08:59
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 5, 0)), 'dawn');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 8, 59)), 'dawn');

    // Day: 09:00 to 17:59
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 9, 0)), 'day');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 14, 30)), 'day');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 17, 59)), 'day');

    // Sunset: 18:00 to 20:59
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 18, 0)), 'sunset');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 20, 59)), 'sunset');

    // Night: 21:00 to 04:59
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 21, 0)), 'night');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 2, 0)), 'night');
    assert.equal(getDayCyclePeriod(new Date(2026, 9, 5, 4, 59)), 'night');

    // Number hour directly
    assert.equal(getDayCyclePeriod(7), 'dawn');
    assert.equal(getDayCyclePeriod(12), 'day');
    assert.equal(getDayCyclePeriod(19), 'sunset');
    assert.equal(getDayCyclePeriod(23), 'night');
  });

  it('generates human greetings and atmospheric metadata for each period', () => {
    const dawn = getDayCycleConfig('dawn');
    assert.equal(dawn.label, 'Amanecer');
    assert.ok(dawn.greeting('Christian').includes('Buen día'));

    const day = getDayCycleConfig('day');
    assert.equal(day.label, 'Día');
    assert.ok(day.greeting('Christian').includes('Buenas tardes'));

    const sunset = getDayCycleConfig('sunset');
    assert.equal(sunset.label, 'Atardecer');
    assert.ok(sunset.greeting('Christian').includes('Buenas tardes'));

    const night = getDayCycleConfig('night');
    assert.equal(night.label, 'Noche');
    assert.ok(night.greeting().includes('Buenas noches'));
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
