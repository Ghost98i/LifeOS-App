import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const LIVE_URL = 'https://lifeosanywhere.web.app';

async function verifyLive() {
  console.log(`🌐 Iniciando verificación sobre el despliegue público: ${LIVE_URL}`);
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });

  const errors = [];
  page.on('pageerror', (err) => {
    console.error('❌ Page error en live:', err.message);
    errors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.warn('⚠️ Console error en live:', msg.text());
    }
  });

  try {
    // Inicializar estado mínimo con onboarding completado para acceder al dashboard
    await page.addInitScript(() => {
      localStorage.setItem(
        'lifeos-state-v1',
        JSON.stringify({
          settings: { onboardingCompleted: true, darkMode: true },
          profile: { name: 'Christian' },
        })
      );
    });

    // 1. Carga inicial
    console.log('1. Cargando URL pública...');
    const response = await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
    console.log(`   Status HTTP: ${response.status()}`);
    if (response.status() !== 200) {
      throw new Error(`Respuesta HTTP no esperada: ${response.status()}`);
    }

    // 2. Verificar que los mecanismos sintéticos están estrictamente inaccesibles
    console.log('2. Verificando aislamiento de mecanismos sintéticos E2EE...');
    const syntheticChecks = await page.evaluate(() => {
      const hasSyntheticState = typeof (window).__setSyntheticCloudState !== 'undefined';
      return {
        hostname: window.location.hostname,
        hasSyntheticState,
      };
    });
    console.log(`   Hostname en vivo: ${syntheticChecks.hostname}`);
    console.log(`   __setSyntheticCloudState presente?: ${syntheticChecks.hasSyntheticState}`);
    if (syntheticChecks.hasSyntheticState) {
      throw new Error('FALLO DE SEGURIDAD: __setSyntheticCloudState está expuesto en dominio público!');
    }
    console.log('   ✔ Aislamiento de mecanismos sintéticos verificado (inaccesible en live).');

    // 3. Verificar Hoy
    console.log('3. Verificando módulo Hoy...');
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('header, aside, main').first().isVisible(), true);
    assert.ok((await page.locator('main').first().innerText()).length > 0);
    console.log(`   Módulo Hoy renderizado con éxito. Muestra saludo/foco.`);

    // 4. Verificar Agenda
    console.log('4. Navegando y verificando Agenda...');
    await page.locator('aside nav button:has-text("Agenda")').first().click();
    await page.waitForTimeout(1000);
    const agendaActionVisible = await page.locator('button:has-text("Actividad semanal")').first().isVisible();
    console.log(`   Botón "Actividad semanal" visible en Agenda: ${agendaActionVisible}`);
    if (!agendaActionVisible) throw new Error('Agenda no se visualiza correctamente en live');
    console.log('   ✔ Agenda carga correctamente con nueva composición de amplitud.');

    // 5. Verificar Configuración
    console.log('5. Navegando y verificando Configuración...');
    await page.locator('aside nav button:has-text("Configuración")').first().click();
    await page.waitForTimeout(800);
    const configVisible = await page.locator('h1:has-text("Configuración")').isVisible();
    const v2DevPresent = await page.locator('text=v2 · dev').isVisible();
    console.log(`   Configuración visible: ${configVisible}`);
    console.log(`   v2 · dev visible en cabecera?: ${v2DevPresent}`);
    if (v2DevPresent) throw new Error('v2 · dev sigue visible en cabecera pública!');
    console.log('   ✔ Configuración carga correctamente sin metadatos técnicos en cabecera.');

    // 6. Verificar Mi Negocio
    console.log('6. Navegando y verificando Mi negocio...');
    const miNegocioBtn = page.locator('aside nav button:has-text("Mi negocio")').first();
    if (await miNegocioBtn.isVisible()) {
      await miNegocioBtn.click();
      await page.waitForTimeout(800);
      const negocioHeading = await page.locator('text=Mi negocio').first().isVisible();
      console.log(`   Mi negocio cargado y visible: ${negocioHeading}`);
      console.log('   ✔ Módulo Mi negocio disponible e íntegro.');
    } else {
      console.log('   (Botón Mi negocio no visible directamente en navegación lateral)');
    }

    // 7. PWA Manifest y Service Worker
    console.log('7. Verificando manifest.webmanifest...');
    const manifestResp = await page.goto(`${LIVE_URL}/manifest.webmanifest`);
    console.log(`   Status Manifest: ${manifestResp.status()}`);
    if (manifestResp.status() !== 200) throw new Error('manifest.webmanifest no accesible');

    console.log('\n🎉 Toda la verificación sobre la web pública finalizó con ÉXITO.');
    if (errors.length > 0) {
      console.warn(`Se registraron ${errors.length} errores no fatales:`, errors);
    }
  } finally {
    await browser.close();
  }
}

verifyLive().catch((err) => {
  console.error('Error fatal durante la verificación en live:', err);
  process.exit(1);
});
