import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, saveRecoveryState } from './storage';
import {
  clearWrappedKeyEnvelope,
  cryptoSession,
  provisionZeroKnowledgeKeys,
  saveWrappedKeyEnvelope,
} from './cryptoCore';
import {
  ConfigView,
  formatRecoveryDateTime,
  humanizeRecoveryReason,
  verifyResetConfirmation,
} from '../components/ConfigView';
import { PrivacySecuritySection } from '../components/PrivacySecuritySection';

const noopUpdate = () => true;

function installMemoryStorage() {
  const store = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
  return {
    restore: () => {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else delete (globalThis as Record<string, unknown>).localStorage;
    },
  };
}

test('Bloque 25.1: Configuración elimina jerga ERP/técnica, azules residuales, flechas ASCII, clima/Open-Meteo e IDs crudos en Diagnóstico colapsado', () => {
  const mem = installMemoryStorage();
  try {
    const state = defaultState();
    state.settings.streamingEnabled = true;
    state.gym.sessions = [
      {
        id: 'stale-gym-1',
        date: '2026-11-10',
        weekLabel: 'Torso A',
        status: 'active',
        exercises: [],
      },
    ];

    saveRecoveryState(
      state,
      'usr-b25',
      'cloud_conflict',
      'Versión remota descartada al elegir datos locales'
    );

    const cuentaHtml = renderToStaticMarkup(
      <ConfigView
        state={state}
        onUpdateState={noopUpdate}
        onExportJSON={() => {}}
        storageUserId="usr-b25"
        cloudConfigured={true}
        cloudUser={{ uid: 'usr-b25', name: 'Christian', email: 'christian@example.com', photoURL: '' }}
        syncStatus="synced"
        lastSyncedAt="25/11/2026 18:30"
        initialTab="cuenta"
      />
    );

    // Tarjeta visible de Privacidad, condiciones y créditos con las 3 páginas + condiciones y sin mención a clima
    assert.match(cuentaHtml, /Privacidad, condiciones y créditos/);
    assert.match(cuentaHtml, /Íconos, ilustraciones y animaciones\./);
    assert.match(cuentaHtml, /href="\/privacidad\.html"/);
    assert.match(cuentaHtml, /href="\/privacidad\.html#condiciones"/);
    assert.match(cuentaHtml, /href="\/eliminar-cuenta\.html"/);
    assert.match(cuentaHtml, /href="\/creditos\.html"/);
    assert.doesNotMatch(cuentaHtml, /para que ningún guardado pendiente vuelva a crearlos/);
    assert.doesNotMatch(cuentaHtml, /Open-Meteo|clima|Usar mi ubicación/i);
    assert.doesNotMatch(cuentaHtml, /→|←|✓/);
    assert.doesNotMatch(cuentaHtml, /text-blue-|bg-blue-|text-sky-|bg-sky-|var\(--blue\)/);

    const prefsHtml = renderToStaticMarkup(
      <ConfigView
        state={state}
        onUpdateState={noopUpdate}
        onExportJSON={() => {}}
        initialTab="preferencias"
      />
    );
    assert.doesNotMatch(prefsHtml, /\bRFM\b/);
    assert.match(
      prefsHtml,
      /Se usa solo para estimaciones opcionales en Gimnasio \(como porcentaje estimado de grasa corporal\)\./
    );
    assert.match(prefsHtml, /Meta mensual de streams/);
    assert.doesNotMatch(prefsHtml, /Transmisiones por mes/);
    assert.match(prefsHtml, /Avisos silenciados/);
    assert.doesNotMatch(prefsHtml, /Recordatorios de «Atención ahora»/);
    assert.doesNotMatch(prefsHtml, /→|←|✓/);
    assert.doesNotMatch(prefsHtml, /text-blue-|bg-blue-|text-sky-|bg-sky-|var\(--blue\)/);

    const copiasHtml = renderToStaticMarkup(
      <ConfigView
        state={state}
        onUpdateState={noopUpdate}
        onExportJSON={() => {}}
        storageUserId="usr-b25"
        initialTab="copias"
      />
    );
    assert.doesNotMatch(copiasHtml, /Archivo JSON local; no queda cifrado por la sincronización/);
    assert.match(copiasHtml, /El archivo no lleva contraseña, así que conviene guardarlo en un lugar seguro\./);
    assert.match(copiasHtml, /Copia de emergencia en este navegador/);
    assert.match(copiasHtml, /Respaldo automático que Celestian guarda antes de aplicar un cambio importante/);
    assert.match(copiasHtml, /Guardada antes de conservar los datos de este dispositivo/);
    assert.doesNotMatch(copiasHtml, /Versión remota descartada al elegir datos locales/);
    assert.match(copiasHtml, /Antes de borrar, se guarda automáticamente una copia de emergencia en este navegador\./);
    assert.doesNotMatch(copiasHtml, /→|←|✓/);

    const diagHtml = renderToStaticMarkup(
      <ConfigView
        state={state}
        onUpdateState={noopUpdate}
        onExportJSON={() => {}}
        storageUserId="usr-b25"
        initialTab="diagnostico"
      />
    );
    assert.match(diagHtml, /Revisión de Finanzas/);
    assert.match(diagHtml, /Cuentas revisadas/);
    assert.match(diagHtml, />Saldos</);
    assert.match(diagHtml, />Movimientos</);
    assert.match(diagHtml, />Transferencias</);
    assert.match(diagHtml, />Ajustes de saldo</);
    assert.match(diagHtml, /Revisión de Gimnasio/);
    assert.match(diagHtml, /Son entrenamientos abiertos de días anteriores que podés cerrar o descartar en Gimnasio\./);
    assert.doesNotMatch(diagHtml, /Cuentas auditadas/);
    assert.doesNotMatch(diagHtml, /Conciliaciones \/ Arqueos/);
    assert.doesNotMatch(diagHtml, /Consistencia de Finanzas|Consistencia de Gimnasio/);
    assert.doesNotMatch(diagHtml, /→|←|✓/);

    // El ID crudo del dispositivo no aparece en la barra colapsada (<summary>)
    const summaryMatch = diagHtml.match(/<summary[\s\S]*?<\/summary>/);
    assert.ok(summaryMatch, 'Debe existir <summary> en Almacenamiento y detalles técnicos');
    assert.doesNotMatch(summaryMatch[0], /Dispositivo:/);
    assert.doesNotMatch(summaryMatch[0], /unknown|usbis/i);

    // Formato de fecha limpio sin segundos (HH:MM, no HH:MM:SS) y humanizador de motivos
    const formatted = formatRecoveryDateTime('2026-11-25T18:45:39.000Z');
    assert.doesNotMatch(formatted, /\d{2}:\d{2}:\d{2}/, 'La hora de copia de emergencia no debe incluir segundos');
    assert.equal(
      humanizeRecoveryReason('Versión remota descartada al elegir datos locales', 'cloud_conflict'),
      'Guardada antes de conservar los datos de este dispositivo'
    );
    assert.equal(
      humanizeRecoveryReason('Versión local descartada al elegir datos de la nube', 'cloud_conflict'),
      'Guardada antes de cargar los datos de la nube'
    );

    // PrivacySecuritySection: enlace índigo Celestian sin azul ni flechas ASCII
    const privacyHtml = renderToStaticMarkup(
      <PrivacySecuritySection state={state} storageUserId="usr-b25" cloudConnected={true} />
    );
    assert.match(privacyHtml, /text-\[#4F46E5\][^"]*dark:text-\[#818CF8\]/);
    assert.doesNotMatch(privacyHtml, /text-blue-|bg-blue-|text-sky-|bg-sky-|var\(--blue\)/);
    assert.doesNotMatch(privacyHtml, /→|←|✓/);
  } finally {
    mem.restore();
  }
});

test('Bloque 25.2: Código fuente de ConfigView y PrivacySecuritySection sin azules residuales, ASCII prohibidos ni menciones a Open-Meteo/clima', () => {
  for (const file of ['src/components/ConfigView.tsx', 'src/components/PrivacySecuritySection.tsx']) {
    const src = fs.readFileSync(path.resolve(file), 'utf8');
    assert.doesNotMatch(src, /\b(text|bg|border|ring)-(blue|sky)-/, `${file} no debe usar blue-* ni sky-*`);
    assert.doesNotMatch(src, /var\(--blue\)/, `${file} no debe usar var(--blue)`);
    assert.doesNotMatch(src, /[→←✓]/, `${file} no debe usar flechas ni checks ASCII`);
    assert.doesNotMatch(src, /Open-Meteo|clima|Usar mi ubicación/i, `${file} no debe mencionar Open-Meteo, clima ni ubicación`);
  }
});

test('Bloque 25.3: Las 3 páginas públicas HTML cumplen estándar Google Play, lenguaje humano, diseño unificado y cero Open-Meteo/clima/ubicación', () => {
  const privacyHtml = fs.readFileSync(path.resolve('public/privacidad.html'), 'utf8');
  const deleteHtml = fs.readFileSync(path.resolve('public/eliminar-cuenta.html'), 'utf8');
  const creditsHtml = fs.readFileSync(path.resolve('public/creditos.html'), 'utf8');

  for (const [name, html] of [
    ['privacidad.html', privacyHtml],
    ['eliminar-cuenta.html', deleteHtml],
    ['creditos.html', creditsHtml],
  ] as const) {
    // Fecha unificada, paleta Celestian, modo claro/oscuro, caja "En resumen"
    assert.match(html, /25 de noviembre de 2026/, `${name}: fecha de actualización 25 de noviembre de 2026`);
    assert.match(html, /#0B0F19/, `${name}: fondo oscuro Celestian`);
    assert.match(html, /#111827/, `${name}: tarjeta oscura Celestian`);
    assert.match(html, /#4F46E5/, `${name}: acento índigo Celestian`);
    assert.match(html, /#818CF8/, `${name}: acento índigo en modo oscuro`);
    assert.match(html, /prefers-color-scheme:\s*light/, `${name}: soporte nativo modo claro`);
    assert.match(html, /En resumen/, `${name}: caja destacada inicial "En resumen"`);
    assert.match(html, /Volver a Celestian LifeOS/, `${name}: enlace de regreso unificado`);
    assert.match(html, /correachristian03@gmail\.com/, `${name}: correo de contacto unificado`);

    // Enlaces cruzados válidos entre las 3 páginas + inicio
    assert.match(html, /href="\/"/, `${name}: enlace a inicio`);
    assert.match(html, /href="\/privacidad\.html"/, `${name}: enlace a privacidad.html`);
    assert.match(html, /href="\/eliminar-cuenta\.html"/, `${name}: enlace a eliminar-cuenta.html`);
    assert.match(html, /href="\/creditos\.html"/, `${name}: enlace a creditos.html`);

    // Prohibiciones estrictas
    assert.doesNotMatch(html, /←/, `${name}: cero flechas ← ASCII`);
    assert.doesNotMatch(html, /public\/gym-icons\/v1\//, `${name}: cero rutas internas de repositorio`);
    assert.doesNotMatch(html, /\.(json|lottie)\b/i, `${name}: cero nombres crudos de archivos .json/.lottie`);
    assert.doesNotMatch(html, /#2563EB|#3B82F6/i, `${name}: cero azules residuales`);
    assert.doesNotMatch(html, /Open-Meteo|clima|meteorológ|Usar mi ubicación|Ubicación \(opcional\)/i, `${name}: cero menciones a Open-Meteo, clima o permiso de ubicación`);
  }

  // Verificaciones específicas de Política de privacidad
  assert.match(privacyHtml, /Cuenta y Seguridad/);
  assert.match(privacyHtml, /Copias y Datos/);
  assert.match(privacyHtml, /Mi negocio/);
  assert.match(privacyHtml, /Candado privado adicional/);
  assert.match(privacyHtml, /contraseña de bóveda/i);
  assert.match(privacyHtml, /no solicita<\/strong> permiso de ubicación/i);
  assert.match(privacyHtml, /id="condiciones"/);
  assert.match(privacyHtml, /Condiciones de uso/);
  assert.match(privacyHtml, /\.md/);
  assert.match(privacyHtml, /anonimizar nombres/i);
  assert.doesNotMatch(privacyHtml, /versión portable de un solo archivo HTML/i);
  assert.doesNotMatch(privacyHtml, /Reventa e inventario/i);

  // Verificaciones específicas de Eliminar cuenta y datos
  assert.match(deleteHtml, /Cuenta y Seguridad/);
  assert.match(deleteHtml, /Copias y Datos/);
  assert.match(deleteHtml, /Mi negocio/);
  assert.match(deleteHtml, /Candado privado adicional/);
  assert.match(deleteHtml, /contraseña de bóveda/i);
  assert.match(deleteHtml, /30 días/);
  assert.doesNotMatch(deleteHtml, /\bUID\b/);
  assert.doesNotMatch(deleteHtml, /envoltura cifrada/i);
  assert.doesNotMatch(deleteHtml, /metadatos de bases y revisiones/i);
  assert.doesNotMatch(deleteHtml, /guardado pendiente/i);
  assert.doesNotMatch(deleteHtml, /reventa/i);

  // Verificaciones específicas de Créditos y licencias (solo las 3 secciones reales)
  assert.match(creditsHtml, /Lucide Icons/);
  assert.match(creditsHtml, /licencia ISC/i);
  assert.match(creditsHtml, /Dhawal Patel/);
  assert.match(creditsHtml, /Mahendra Bhunwal/);
  assert.match(creditsHtml, /Lottie Simple License/);
  assert.doesNotMatch(creditsHtml, /<h2>4\./);
});

test('Bloque 25.4: Reiniciar datos exige escribir REINICIAR sin E2EE y valida contraseña de bóveda o código de recuperación con E2EE activo', async () => {
  const mem = installMemoryStorage();
  const userId = 'usr-b25-reset-e2ee';
  const legacyUserId = 'usr-b25-reset-legacy';
  const state = defaultState();

  try {
    // 1) Sin E2EE: modal renderiza campo REINICIAR con .celestian-clean-field y botón deshabilitado por defecto
    const noE2eeHtml = renderToStaticMarkup(
      <ConfigView
        state={state}
        onUpdateState={noopUpdate}
        onExportJSON={() => {}}
        initialTab="copias"
        defaultResetModalOpen={true}
      />
    );
    assert.match(noE2eeHtml, /Escribí <strong>REINICIAR<\/strong>/);
    assert.match(noE2eeHtml, /id="reset-data-confirmation"[^>]*class="[^"]*celestian-clean-field/);
    assert.match(noE2eeHtml, /<button type="submit" disabled=""[^>]*>Sí, reiniciar todo<\/button>/);

    // Validación pura sin E2EE
    const badText = await verifyResetConfirmation({ envelope: null, confirmationText: 'borrar' });
    assert.equal(badText.ok, false);
    const emptyText = await verifyResetConfirmation({ envelope: null, confirmationText: '' });
    assert.equal(emptyText.ok, false);
    const goodText = await verifyResetConfirmation({ envelope: null, confirmationText: '  reiniciar  ' });
    assert.equal(goodText.ok, true);

    // 2) Con E2EE activo (contraseña de bóveda + código de recuperación)
    const vaultPassword = 'MiBovedaReset!2026';
    const provisioned = await provisionZeroKnowledgeKeys(userId, {
      vaultPassword,
      pbkdf2Iterations: 100_000,
    });
    saveWrappedKeyEnvelope(provisioned.envelope, userId);

    const e2eeHtml = renderToStaticMarkup(
      <ConfigView
        state={state}
        onUpdateState={noopUpdate}
        onExportJSON={() => {}}
        storageUserId={userId}
        initialTab="copias"
        defaultResetModalOpen={true}
      />
    );
    assert.match(e2eeHtml, /Ingresá tu contraseña de bóveda para confirmar/);
    assert.match(e2eeHtml, /id="reset-data-secret"[^>]*type="password"[^>]*autoComplete="current-password"/);
    assert.match(e2eeHtml, /celestian-clean-field/);
    assert.match(e2eeHtml, /Usar código de recuperación en su lugar/);
    assert.match(e2eeHtml, /<button type="submit" disabled=""[^>]*>Sí, reiniciar todo<\/button>/);

    // Validación en modo lectura contra cryptoCore (sin mutar cryptoSession)
    cryptoSession.lock();
    const wrongPw = await verifyResetConfirmation({
      envelope: provisioned.envelope,
      authMode: 'password',
      secret: 'ClaveIncorrecta!999',
    });
    assert.equal(wrongPw.ok, false);
    assert.match(wrongPw.error || '', /Contraseña de bóveda incorrecta/);
    assert.equal(cryptoSession.isUnlocked(userId), false, 'Verificación de reinicio no debe mutar cryptoSession');

    const correctPw = await verifyResetConfirmation({
      envelope: provisioned.envelope,
      authMode: 'password',
      secret: vaultPassword,
    });
    assert.equal(correctPw.ok, true);
    assert.equal(cryptoSession.isUnlocked(userId), false, 'Verificación exitosa sigue siendo estrictamente de lectura');

    const wrongRecovery = await verifyResetConfirmation({
      envelope: provisioned.envelope,
      authMode: 'recovery',
      secret: 'INVALID-RECOVERY-KEY',
    });
    assert.equal(wrongRecovery.ok, false);
    assert.match(wrongRecovery.error || '', /código de recuperación no es correcto/i);

    const correctRecovery = await verifyResetConfirmation({
      envelope: provisioned.envelope,
      authMode: 'recovery',
      secret: provisioned.recoveryKeyFormatted,
    });
    assert.equal(correctRecovery.ok, true);

    // 3) Cuenta legacy E2EE sin contraseña de bóveda: pide código de recuperación directamente
    const legacy = await provisionZeroKnowledgeKeys(legacyUserId);
    saveWrappedKeyEnvelope(legacy.envelope, legacyUserId);

    const legacyHtml = renderToStaticMarkup(
      <ConfigView
        state={state}
        onUpdateState={noopUpdate}
        onExportJSON={() => {}}
        storageUserId={legacyUserId}
        initialTab="copias"
        defaultResetModalOpen={true}
      />
    );
    assert.match(legacyHtml, /Ingresá tu código de recuperación para confirmar/);
    assert.doesNotMatch(legacyHtml, /Usar código de recuperación en su lugar/);

    const legacyWrong = await verifyResetConfirmation({
      envelope: legacy.envelope,
      authMode: 'password',
      secret: 'cualquier-cosa',
    });
    assert.equal(legacyWrong.ok, false);

    const legacyGood = await verifyResetConfirmation({
      envelope: legacy.envelope,
      authMode: 'password',
      secret: legacy.recoveryKeyFormatted,
    });
    assert.equal(legacyGood.ok, true);
  } finally {
    cryptoSession.lock();
    clearWrappedKeyEnvelope(userId);
    clearWrappedKeyEnvelope(legacyUserId);
    mem.restore();
  }
});
