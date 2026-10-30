import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { defaultState } from '../src/lib/storage.ts';

// Real Firebase SDK + public Google/Firebase helpers. No identity is supplied.
// Token exchange, account creation, and all Firestore requests are denied.
// firebase emulators:exec --project demo-lifeos --only hosting "node --import tsx scripts/test-hosting-google-auth.mjs"
const origin = 'http://localhost:5000';
const bootstrap = 'https://apis.google.com/js/api.js';
const modules = 'https://apis.google.com/_/scs/abc-static/_/js/';
// GAPI may sample a performance beacon. It is not needed for the iframe/OAuth
// handshake and stays blocked; retain it separately instead of broadening connect-src.
const optionalTelemetry = violation => violation.directive === 'connect-src'
  && violation.blocked === 'https://apis.google.com/js/gen_204';
function safeUrl(value) {
  try { const url = new URL(value); return { url: url.origin + url.pathname, queryKeys: [...url.searchParams.keys()] }; }
  catch { return { url: value }; }
}

export async function verifyGoogleAuth(browser, { output, mode = 'popup', negative = null } = {}) {
  mkdirSync(output, { recursive: true });
  const context = await browser.newContext({ serviceWorkers: 'block', locale: 'en-US', viewport: { width: 1440, height: 1000 } });
  const requests = [], responses = [], violations = [], errors = [], denied = [], checkpoints = [];
  const name = `auth-${mode}${negative ? `-without-${negative}` : ''}`;
  let page;
  const evidence = { mode, negative, credentialsUsed: false, completedGoogleAuthentication: false, accountCreated: false, requests, responses, violations, errors, denied, checkpoints };
  await context.exposeBinding('__authCsp', (source, value) => violations.push({ ...value, document: safeUrl(source.frame.url()).url }));
  await context.exposeBinding('__authCheckpoint', (source, value) => checkpoints.push(value));
  const state = defaultState();
  Object.assign(state.settings, { onboardingCompleted: true, hiddenTabs: [], userName: 'Prueba OAuth local' });
  await context.addInitScript(({ state, redirect }) => {
    if (location.origin === 'http://localhost:5000' && !localStorage.getItem('lifeos-state-v1')) localStorage.setItem('lifeos-state-v1', JSON.stringify(state));
    document.addEventListener('securitypolicyviolation', e => {
      let blocked = e.blockedURI;
      try { const url = new URL(blocked); blocked = url.origin + url.pathname; } catch { /* CSP keywords are not URLs. */ }
      void window.__authCsp({ directive: e.effectiveDirective, blocked, disposition: e.disposition });
    });
    if (redirect && location.origin === 'http://localhost:5000') {
      const native = window.open;
      window.open = function (url, ...args) {
        if (String(url).includes('/__/auth/handler')) {
          void window.__authCheckpoint({ popupBlocked: true, gapiReady: Boolean(window.gapi?.iframes?.Iframe), iframePresent: Boolean(document.querySelector('iframe[src*="/__/auth/iframe"]')) });
          return null; // Exercise the application's existing popup-blocked fallback.
        }
        return Reflect.apply(native, this, [url, ...args]);
      };
    }
  }, { state, redirect: mode === 'redirect' });
  context.on('page', candidate => candidate.on('pageerror', error => errors.push(error.message)));
  context.on('response', response => responses.push({ ...safeUrl(response.url()), status: response.status() }));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    let document = 'pending navigation';
    try { document = safeUrl(request.frame().url()).url; } catch { /* Popup navigation may precede its frame. */ }
    requests.push({ ...safeUrl(request.url()), method: request.method(), type: request.resourceType(), document });
    if (url.origin === origin) {
      if (negative && request.isNavigationRequest()) {
        // Explicit negative controls only. Positive runs use Hosting headers unchanged.
        const response = await route.fetch();
        const headers = response.headers();
        const removal = negative === 'bootstrap' ? ` ${bootstrap}` : negative === 'module' ? ` ${modules}` : ' https://*.firebaseapp.com';
        headers['content-security-policy'] = headers['content-security-policy'].replace(removal, '');
        return route.fulfill({ response, headers });
      }
      return route.continue();
    }
    const readHosts = ['apis.google.com', 'identitytoolkit.googleapis.com', 'www.googleapis.com', 'lifeosanywhere.firebaseapp.com', 'accounts.google.com', 'www.gstatic.com', 'ssl.gstatic.com', 'fonts.gstatic.com', 'fonts.googleapis.com', 'www.google.com'];
    const isAccountMutation = url.hostname.endsWith('.googleapis.com') && /signIn|signUp|signupNewUser|verifyAssertion|\/token/i.test(url.pathname);
    if (url.protocol === 'https:' && readHosts.includes(url.hostname) && request.method() === 'GET' && !isAccountMutation) return route.continue();
    // createAuthUri generates the provider URL; it neither authenticates nor creates a user.
    const authUri = (url.hostname === 'identitytoolkit.googleapis.com' && url.pathname === '/v1/accounts:createAuthUri')
      || (url.hostname === 'www.googleapis.com' && url.pathname === '/identitytoolkit/v3/relyingparty/createAuthUri');
    if (authUri && request.method() === 'POST') {
      const body = request.postDataJSON();
      const containsCredentials = ['identifier', 'email', 'idToken', 'accessToken', 'oauthIdToken', 'oauthAccessToken', 'password'].some(key => body[key]);
      if (body.providerId === 'google.com' && !containsCredentials) return route.continue();
    }
    denied.push({ ...safeUrl(request.url()), method: request.method() });
    return route.abort();
  });
  try {
    page = await context.newPage();
    const response = await page.goto(origin);
    evidence.csp = response.headers()['content-security-policy'];
    await page.locator('.today-observatory-greeting').waitFor();
    await page.getByRole('button', { name: 'Conectar con Google', exact: true }).first().click();
    let provider;
    for (let attempt = 0; attempt < 80; attempt++) {
      assert.deepEqual(violations.filter(v => v.disposition === 'enforce' && !optionalTelemetry(v)), [], 'OAuth resource blocked by CSP.');
      provider = context.pages().find(candidate => candidate.url().startsWith('https://accounts.google.com/'));
      if (provider) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(provider, 'The Firebase flow must reach Google; downloading api.js or opening a blank popup is insufficient.');
    const identifier = provider.locator('input[name="identifier"]');
    await identifier.waitFor({ state: 'visible', timeout: 15000 });
    evidence.provider = safeUrl(provider.url());
    evidence.providerFormVisible = true;
    evidence.providerInputEmpty = await identifier.inputValue() === '';
    assert.equal(evidence.providerInputEmpty, true);
    if (mode === 'popup') {
      assert.notEqual(provider, page);
      evidence.sdk = await page.evaluate(() => ({ gapiReady: Boolean(window.gapi?.iframes?.Iframe), iframePresent: Boolean(document.querySelector('iframe[src*="/__/auth/iframe"]')) }));
      assert.equal(evidence.sdk.gapiReady, true); assert.equal(evidence.sdk.iframePresent, true);
      await provider.screenshot({ path: path.join(output, `${name}-provider.png`) });
      await provider.close();
      await page.getByRole('button', { name: 'Conectar con Google', exact: true }).first().waitFor();
      await page.waitForTimeout(600);
      evidence.cancelledWithoutCredentials = true;
    } else {
      assert.equal(provider, page, 'The existing fallback must navigate the original page.');
      assert.ok(checkpoints.some(c => c.popupBlocked && c.gapiReady && c.iframePresent));
      await provider.screenshot({ path: path.join(output, `${name}-provider.png`) });
    }
    const appScripts = requests.filter(r => r.document === origin + '/' && r.type === 'script' && !r.url.startsWith(origin));
    assert.ok(appScripts.some(r => r.url === bootstrap));
    assert.ok(appScripts.some(r => r.url.startsWith(modules) && r.url.includes('gapi_iframes')));
    assert.ok(responses.some(r => r.url === 'https://identitytoolkit.googleapis.com/v1/projects' && r.status === 200));
    assert.ok(responses.some(r => r.url === 'https://lifeosanywhere.firebaseapp.com/__/auth/iframe' && r.status === 200));
    assert.ok(requests.some(r => r.url === 'https://accounts.google.com/o/oauth2/auth'));
    evidence.expectedBlockedTelemetry = violations.filter(optionalTelemetry);
    assert.deepEqual(violations.filter(v => v.disposition === 'enforce' && !optionalTelemetry(v)), []);
    assert.deepEqual(errors, []);
    assert.equal(requests.filter(r => /signInWithIdp|verifyAssertion|signupNewUser|accounts:signUp|\/token/i.test(r.url)).length, 0);
    evidence.oauthInitiationVerified = true;
    return evidence;
  } catch (error) {
    evidence.failure = error.message;
    const provider = context.pages().find(candidate => candidate.url().startsWith('https://accounts.google.com/'));
    if (provider) {
      evidence.providerDiagnostic = { ...safeUrl(provider.url()), title: await provider.title(), text: (await provider.locator('body').innerText()).slice(0, 1600), inputs: await provider.locator('input').evaluateAll(nodes => nodes.map(node => ({ type: node.type, name: node.name, empty: node.value === '' }))) };
      await provider.screenshot({ path: path.join(output, `${name}-failure.png`) });
    }
    throw error;
  } finally {
    await context.close();
    writeFileSync(path.join(output, `${name}.json`), JSON.stringify(evidence, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const output = path.resolve(process.env.LIFEOS_AUTH_OUTPUT || `artifacts/auth-csp-${Date.now()}`);
  const negative = process.argv.find(arg => arg.startsWith('--without='))?.split('=')[1];
  try {
    for (const mode of negative ? ['popup'] : ['popup', 'redirect']) {
      await verifyGoogleAuth(browser, { output, mode, negative });
      console.log(`PASS Google OAuth initiation: ${mode}; complete authentication NOT tested.`);
    }
  } finally { await browser.close(); }
}
