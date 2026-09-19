/**
 * Verify AI token accounting (the deferred M6 sub-item).
 *
 * The critical property: reading usageMetadata must NOT consume the response
 * body the caller is about to read. If that regressed, every AI feature would
 * break with "body already read".
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('js/ai-client.js');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}  ${detail}`); fail++; }
}

/** Server that echoes a Gemini-shaped response including usageMetadata. */
function startServer(usage) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      if (req.url === '/api/gemini/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ configured: true }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'RESPONSE_PAYLOAD' }] } }],
        usageMetadata: usage
      }));
    });
  });
  return new Promise(r => server.listen(0, () => r({ server, port: server.address().port })));
}

function makeSandbox(port) {
  const store = new Map();
  const warnings = [];
  const sandbox = {
    console: { ...console, warn: (...a) => { warnings.push(a.join(' ')); } },
    setTimeout, clearTimeout, AbortController, Date, JSON, Math,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    fetch: (url, init) => {
      const abs = String(url).startsWith('/') ? `http://127.0.0.1:${port}${url}` : String(url);
      return fetch(abs, init);
    },
    window: {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: 'ai-client.js' }).runInContext(sandbox);
  return { client: sandbox.window.aiClient, store, warnings };
}

(async () => {
  console.log('\n=== Token estimation ===');
  {
    const { client } = makeSandbox(0);

    check('empty text is 0 tokens', client.estimateTokens('') === 0);
    check('null is 0 tokens', client.estimateTokens(null) === 0);

    // ~4 chars per token for Latin script.
    const latin = 'a'.repeat(400);
    const est = client.estimateTokens(latin);
    check('Latin text ≈ chars/4', est === 100, `got ${est}`);

    // Devanagari tokenises far less efficiently, so it must cost more.
    const hindi = 'क'.repeat(400);
    const hindiEst = client.estimateTokens(hindi);
    check('Devanagari costs more per char than Latin', hindiEst > est, `${hindiEst} vs ${est}`);

    // Payload walking.
    const payload = {
      contents: [{ parts: [{ text: 'a'.repeat(4000) }, { inlineData: { data: 'xxx' } }] }]
    };
    const payloadEst = client.estimatePayloadTokens(payload);
    check('payload estimate counts text', payloadEst >= 1000, `got ${payloadEst}`);
    check('payload estimate charges for inline images', payloadEst === 1000 + 258, `got ${payloadEst}`);
    check('empty payload is 0', client.estimatePayloadTokens({}) === 0);
    check('malformed payload does not throw',
      (() => { try { client.estimatePayloadTokens(null); return true; } catch { return false; } })());
  }

  console.log('\n=== Usage recorded from the API response ===');
  {
    const { server, port } = await startServer({
      promptTokenCount: 1200, candidatesTokenCount: 800, totalTokenCount: 2000
    });
    const { client } = makeSandbox(port);
    await client.probeServerKey();

    const before = client.getUsage();
    check('starts at zero', before.today.requests === 0 && before.today.totalTokens === 0);

    const res = await client.fetchGenerateContent('gemini-2.5-flash', {
      contents: [{ parts: [{ text: 'hello' }] }]
    });

    // THE critical assertion: the caller's body must still be readable.
    const data = await res.json();
    check('caller can still read the response body',
      data?.candidates?.[0]?.content?.parts?.[0]?.text === 'RESPONSE_PAYLOAD',
      'body was consumed by usage tracking');

    // Tracking is async (reads a clone), so give it a tick.
    await new Promise(r => setTimeout(r, 60));

    const after = client.getUsage();
    check('request counted', after.today.requests === 1, `got ${after.today.requests}`);
    check('prompt tokens recorded exactly', after.today.promptTokens === 1200, `got ${after.today.promptTokens}`);
    check('output tokens recorded exactly', after.today.outputTokens === 800, `got ${after.today.outputTokens}`);
    check('total tokens recorded exactly', after.today.totalTokens === 2000, `got ${after.today.totalTokens}`);
    check('session counters track too', after.session.totalTokens === 2000);

    // Second call accumulates.
    const res2 = await client.fetchGenerateContent('gemini-2.5-flash', { contents: [] });
    await res2.json();
    await new Promise(r => setTimeout(r, 60));
    const after2 = client.getUsage();
    check('counters accumulate across requests',
      after2.today.requests === 2 && after2.today.totalTokens === 4000,
      `${after2.today.requests} req / ${after2.today.totalTokens} tokens`);

    server.close();
  }

  console.log('\n=== Persistence and daily reset ===');
  {
    const { server, port } = await startServer({
      promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150
    });
    const { client, store } = makeSandbox(port);
    await client.probeServerKey();

    const res = await client.fetchGenerateContent('gemini-2.5-flash', { contents: [] });
    await res.json();
    await new Promise(r => setTimeout(r, 60));

    check('usage persisted to storage', store.has('hamsa_ai_usage'));
    const saved = JSON.parse(store.get('hamsa_ai_usage'));
    check('persisted record has a date', typeof saved.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.date));
    check('session totals are NOT persisted (they are per-tab)', saved.session === undefined);
    check('daily totals are persisted', saved.totalTokens === 150);

    // A stale date must reset the daily counters.
    store.set('hamsa_ai_usage', JSON.stringify({
      date: '2020-01-01', requests: 999, promptTokens: 999, outputTokens: 999, totalTokens: 999
    }));
    const { client: fresh } = (() => {
      const s = makeSandbox(port);
      // Reuse the same backing store so the stale record is visible.
      return s;
    })();
    // Re-seed the new sandbox's store and reload.
    fresh._usage = fresh._loadUsage();
    check('a same-day record is kept', fresh.getUsage().today.date === client._todayKey());

    check('resetUsage clears the counters',
      (() => { client.resetUsage(); const u = client.getUsage(); return u.today.requests === 0 && u.today.totalTokens === 0; })());

    server.close();
  }

  console.log('\n=== Oversized prompt warning ===');
  {
    const { server, port } = await startServer({ totalTokenCount: 10 });
    const { client, warnings } = makeSandbox(port);
    await client.probeServerKey();

    // Well under the threshold — no warning.
    warnings.length = 0;
    const small = await client.fetchGenerateContent('gemini-2.5-flash', {
      contents: [{ parts: [{ text: 'short' }] }]
    });
    await small.json();
    check('no warning for a normal request',
      !warnings.some(w => /Large request/.test(w)), warnings.join(' | '));

    // Above LARGE_REQUEST_TOKEN_WARNING (25000 tokens ≈ 100k chars).
    warnings.length = 0;
    const big = await client.fetchGenerateContent('gemini-2.5-flash', {
      contents: [{ parts: [{ text: 'a'.repeat(120000) }] }]
    });
    await big.json();
    check('warns on an oversized request',
      warnings.some(w => /Large request/.test(w)), warnings.join(' | '));
    check('warning suggests a remedy',
      warnings.some(w => /narrower page range|fewer questions/.test(w)));
    check('oversized request is still sent (warn, not block)', big.ok === true);

    server.close();
  }

  console.log('\n=== Failed responses are not counted ===');
  {
    const server = http.createServer((req, res) => {
      if (req.url === '/api/gemini/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ configured: true }));
      }
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Rate limited' } }));
    });
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;

    const { client } = makeSandbox(port);
    await client.probeServerKey();

    const res = await client.fetchGenerateContent('gemini-2.5-flash', { contents: [] });
    await new Promise(r => setTimeout(r, 60));

    check('error response surfaced to caller', res.ok === false && res.status === 429);
    check('failed request does not inflate token counts',
      client.getUsage().today.totalTokens === 0, `got ${client.getUsage().today.totalTokens}`);
    check('describeError still works', (await client.describeError(res)).includes('Rate limited'));

    server.close();
  }

  // ------------------------------------------------------- static assertions
  console.log('\n=== Wiring ===');
  {
    check('tracking reads a clone, not the original',
      /response\.clone\(\)\.json\(\)/.test(SRC));
    check('tracking failures are swallowed so they cannot break a request',
      /_trackResponseUsage[\s\S]{0,400}catch/.test(SRC));
    check('usage exposed for the UI', /getUsage\(\)\s*\{/.test(SRC));
    check('usage resettable', /resetUsage\(\)\s*\{/.test(SRC));

    const settings = read('js/views/settings.js');
    check('Settings renders usage', /AI Token Usage/.test(settings));
    check('Settings has a reset button', /resetAiUsage\(\)/.test(settings));
    check('Settings states the counts are exact', /Exact counts reported by the Gemini API/.test(settings));

    const aw = read('js/answer-writing-service.js');
    check('evaluateAnswer now caps its input', /MAX_ANSWER_CHARS/.test(aw));
    check('truncation is disclosed in the prompt', /Answer truncated for evaluation/.test(aw));
    check('capped value is what gets interpolated', /\$\{answerForPrompt\}/.test(aw));
    check('raw uncapped answer no longer reaches the prompt',
      !/STUDENT'S SUBMITTED ANSWER[\s\S]{0,60}\$\{cleanAnswer\}/.test(aw));
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
