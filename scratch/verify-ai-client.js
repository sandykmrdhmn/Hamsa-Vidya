/**
 * Verify AIClient transport selection and request shaping against a real
 * local server, in both PROXY and DIRECT modes.
 *
 * Runs ai-client.js inside a minimal browser-like sandbox and intercepts fetch
 * so we can assert exactly which URL it chose and whether a key was leaked.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-client.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

/** Boot a fake server that reports a given `configured` value and echoes requests. */
function startFakeServer(configured) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      seen.push({ url: req.url, method: req.method, body });
      if (req.url === '/api/gemini/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ configured }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'PONG' }] } }] }));
    });
  });
  return new Promise(resolve => {
    server.listen(0, () => resolve({ server, port: server.address().port, seen }));
  });
}

/** Build a sandbox with a localStorage shim and an origin-aware fetch. */
function makeSandbox(port, storedKey) {
  const store = new Map();
  if (storedKey) store.set('hamsa_gemini_api_key', storedKey);

  const outbound = [];

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    fetch: (url, init) => {
      outbound.push(String(url));
      // Resolve app-relative proxy paths against the local test server.
      const abs = String(url).startsWith('/') ? `http://127.0.0.1:${port}${url}` : String(url);
      return fetch(abs, init);
    },
    window: {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: 'ai-client.js' }).runInContext(sandbox);
  return { sandbox, outbound };
}

(async () => {
  // ---------------------------------------------------------------- PROXY mode
  console.log('\n=== PROXY mode (server has a key) ===');
  {
    const { server, port, seen } = await startFakeServer(true);
    const { sandbox, outbound } = makeSandbox(port, 'user-local-key-SHOULD-NOT-BE-SENT');
    const client = sandbox.window.aiClient;

    await client.probeServerKey();
    check('mode resolves to PROXY', client.getMode() === 'PROXY', `got ${client.getMode()}`);
    check('useProxy() is true', client.useProxy() === true);
    check('isAvailable() is true', client.isAvailable() === true);

    const res = await client.fetchGenerateContent('gemini-2.5-flash', { contents: [] });
    check('request succeeded', res.ok);

    const genCall = outbound.find(u => u.includes('gemini-2.5-flash'));
    check('used relative proxy path', genCall === '/api/gemini/gemini-2.5-flash', `got ${genCall}`);
    check('never contacted googleapis.com', !outbound.some(u => u.includes('googleapis.com')),
      outbound.filter(u => u.includes('googleapis.com')).join(','));
    check('no API key present in any URL', !outbound.some(u => u.includes('key=')),
      outbound.filter(u => u.includes('key=')).join(','));
    check('local key never left the browser',
      !outbound.some(u => u.includes('SHOULD-NOT-BE-SENT')) &&
      !seen.some(r => r.url.includes('SHOULD-NOT-BE-SENT')));

    const listRes = await client.fetchListModels();
    check('listModels used proxy', outbound.includes('/api/gemini/models') && listRes.ok);

    server.close();
  }

  // --------------------------------------------------------------- DIRECT mode
  console.log('\n=== DIRECT mode (no server key, personal key present) ===');
  {
    const { server, port } = await startFakeServer(false);
    const { sandbox, outbound } = makeSandbox(port, 'my-personal-key');
    const client = sandbox.window.aiClient;

    await client.probeServerKey();
    check('mode resolves to DIRECT', client.getMode() === 'DIRECT', `got ${client.getMode()}`);
    check('useProxy() is false', client.useProxy() === false);
    check('isAvailable() is true', client.isAvailable() === true);

    // Point the direct base at our fake server so no real network call happens.
    client.DIRECT_BASE = `http://127.0.0.1:${port}/v1beta`;
    const res = await client.fetchGenerateContent('gemini-2.0-flash', { contents: [] });
    check('request succeeded', res.ok);

    const genCall = outbound.find(u => u.includes('gemini-2.0-flash'));
    check('direct URL includes generateContent', genCall && genCall.includes(':generateContent'), `got ${genCall}`);
    check('direct URL carries the personal key', genCall && genCall.includes('key=my-personal-key'), `got ${genCall}`);

    server.close();
  }

  // -------------------------------------------------------- UNCONFIGURED mode
  console.log('\n=== UNCONFIGURED (no server key, no personal key) ===');
  {
    const { server, port } = await startFakeServer(false);
    const { sandbox } = makeSandbox(port, null);
    const client = sandbox.window.aiClient;

    await client.probeServerKey();
    check('mode resolves to UNCONFIGURED', client.getMode() === 'UNCONFIGURED', `got ${client.getMode()}`);
    check('isAvailable() is false', client.isAvailable() === false);

    let threw = null;
    try { await client.fetchGenerateContent('gemini-2.5-flash', { contents: [] }); }
    catch (e) { threw = e.message; }
    check('throws a helpful error', threw && /not configured/i.test(threw), `got ${threw}`);

    server.close();
  }

  // ------------------------------------------------------------------- aborts
  console.log('\n=== Abort + timeout plumbing ===');
  {
    // Server that never responds, to exercise the timeout path.
    const hanging = http.createServer((req, res) => {
      if (req.url === '/api/gemini/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ configured: true }));
      }
      /* deliberately never respond */
    });
    await new Promise(r => hanging.listen(0, r));
    const port = hanging.address().port;

    const { sandbox } = makeSandbox(port, null);
    const client = sandbox.window.aiClient;
    await client.probeServerKey();

    let msg = null;
    try {
      await client.fetchGenerateContent('gemini-2.5-flash', { contents: [] }, { timeoutMs: 300 });
    } catch (e) { msg = e.message; }
    check('timeout produces a clear message', msg && /timed out/i.test(msg), `got ${msg}`);
    check('controller registry drained after timeout', client.inFlightCount === 0, `got ${client.inFlightCount}`);

    // abortAll() should cancel an in-flight request.
    const p = client.fetchGenerateContent('gemini-2.5-flash', { contents: [] }, { timeoutMs: 30000 });
    await new Promise(r => setTimeout(r, 50));
    check('request registered as in-flight', client.inFlightCount === 1, `got ${client.inFlightCount}`);
    client.abortAll();
    let aborted = false;
    try { await p; } catch { aborted = true; }
    check('abortAll() cancels in-flight request', aborted);

    hanging.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
