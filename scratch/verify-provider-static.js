/** Static isolation regressions using an entirely virtual public filesystem. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const {createRequire} = require('module');
const {EventEmitter} = require('events');
const {Readable, Writable} = require('stream');
const root = path.resolve(__dirname, '..'), virtualRoot = path.join(root, 'scratch', 'virtual-provider-public');
const actualRequire = createRequire(path.join(root, 'server.js'));
const shell = '<!doctype html><title>HAMSA VIDYA fixture</title><main>SAFE_APP_SHELL</main>';
const secret = 'FAKE_FIXTURE_SECRET_NEVER_AN_ACTUAL_KEY';
const files = new Map();
const file = (url, body) => files.set(path.join(virtualRoot, path.normalize(url)).toLowerCase(), Buffer.from(body));
file('/index.html', shell); file('/js/app.js', 'window.fixtureAppLoaded = true;'); file('/css/tokens.css', ':root{--fixture:1}');
for (const url of ['/.env', '/.gitignore', '/.hidden-directory/secret.js', '/.hidden-directory/config', '/.nested/.private/secret.js', '/.git/config', '/server.js', '/ai-proxy-policy.js', '/.hamsa-ai-budget.json', '/.hamsa-openai-budget.json', '/.hamsa-openai-budget.json.tmp', '/private-config', '/package.json']) file(url, secret);
const accessed = [];
const virtualFs = {
  stat(target, callback) { accessed.push(target); queueMicrotask(() => callback(files.has(target.toLowerCase()) ? null : Object.assign(Error('Virtual file missing'), {code: 'ENOENT'}), {isFile: () => files.has(target.toLowerCase())})); },
  readFile(target, callback) { accessed.push(target); queueMicrotask(() => files.has(target.toLowerCase()) ? callback(null, files.get(target.toLowerCase())) : callback(Object.assign(Error('Virtual file missing'), {code: 'ENOENT'}))); },
  createReadStream(target) { accessed.push(target); return Readable.from(files.get(target.toLowerCase()) || Buffer.alloc(0)); }
};
let handler, upstreamCalls = 0;
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
vm.runInNewContext(source.slice(0, source.lastIndexOf('server.listen(')), {
  __dirname: virtualRoot, process: {env: {}}, URL, Buffer, AbortController, AbortSignal, console: {log() {}},
  setInterval: () => ({unref() {}}), setTimeout, clearTimeout,
  fetch: () => { upstreamCalls++; throw Error('Static tests must not contact any provider.'); },
  require: name => name === 'http' ? {createServer(fn) { handler = fn; return {}; }} : name === 'fs' ? virtualFs : actualRequire(name)
});
async function request(url) {
  const chunks = [], headers = {};
  const req = new EventEmitter(); Object.assign(req, {url, method: 'GET', headers: {host: 'localhost:3000'}, socket: {remoteAddress: '127.0.0.1'}});
  const res = new Writable({write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); }});
  res.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
  res.writeHead = (status, values = {}) => { res.status = status; for (const [name, value] of Object.entries(values)) headers[name.toLowerCase()] = value; return res; };
  const done = new Promise((resolve, reject) => { res.on('error', reject); res.on('finish', () => resolve({status: res.status || 200, headers, body: Buffer.concat(chunks).toString('utf8')})); });
  handler(req, res); return done;
}
let passed = 0, failed = 0;
async function test(name, run) { try { await run(); passed++; console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.stack); } }
(async () => {
  for (const url of ['/.env', '/.gitignore', '/%2eenv', '/.hidden-directory/secret.js', '/.hidden-directory/config', '/.nested/.private/secret.js', '/.git/config']) await test('Private dotfile or directory denied: ' + url, async () => { const result = await request(url); assert.equal(result.status, 404); assert.ok(!result.body.includes(secret)); });
  for (const url of ['/server.js', '/ai-proxy-policy.js', '/package.json', '/.hamsa-ai-budget.json', '/.hamsa-openai-budget.json', '/.hamsa-openai-budget.json.tmp']) await test('Provider/server source and budgets denied: ' + url, async () => { const result = await request(url); assert.equal(result.status, 404); assert.ok(!result.body.includes(secret)); });
  for (const url of ['/assets/%2e%2e/.env', '/assets/..%5c.env', '/assets/%2e%2e/.hidden-directory/secret.js', '/assets/%2e%2e/.hamsa-openai-budget.json']) await test('Encoded private path alias denied: ' + url, async () => { const result = await request(url); assert.equal(result.status, 404); assert.ok(!result.body.includes(secret)); });
  for (const url of ['/', '/dashboard', '/settings', '/quiz/create', '/ai-teacher']) await test('Public SPA route serves HTML shell: ' + url, async () => { const result = await request(url); assert.equal(result.status, 200); assert.equal(result.body, shell); assert.ok(result.headers['content-type'].includes('text/html')); });
  await test('Existing unknown extensionless files never serve their bytes', async () => { const result = await request('/private-config'); assert.ok([200, 404].includes(result.status)); assert.ok(!result.body.includes(secret)); if (result.status === 200) { assert.equal(result.body, shell); assert.ok(result.headers['content-type'].includes('text/html')); } });
  await test('JavaScript and CSS app assets remain public with correct types', async () => { const script = await request('/js/app.js'), css = await request('/css/tokens.css'); assert.equal(script.status, 200); assert.equal(script.body, 'window.fixtureAppLoaded = true;'); assert.ok(script.headers['content-type'].includes('javascript')); assert.equal(css.status, 200); assert.ok(css.headers['content-type'].includes('text/css')); });
  await test('Gemini status API remains available and contains no keys', async () => { for (const url of ['/api/gemini/status']) { const result = await request(url); assert.equal(result.status, 200); assert.equal(JSON.parse(result.body).configured, false); assert.ok(!result.body.includes(secret)); assert.ok(result.headers['content-type'].includes('application/json')); } assert.equal(upstreamCalls, 0); });
  for (const url of ['/api/openai/status','/api/openai/config','/api/openai/gpt-4.1-mini','/api/anthropic/status','/api/nvidia/models']) await test('Removed provider API returns 404: ' + url, async () => { const result=await request(url); assert.equal(result.status,404); assert.ok(result.headers['content-type'].includes('application/json')); assert.equal(upstreamCalls,0); });
  await test('Denied files were blocked before virtual filesystem access', () => { const forbidden = accessed.filter(target => /[\\/]\.[^\\/]|server\.js$|ai-proxy-policy\.js$|package\.json$/.test(target.slice(virtualRoot.length))); assert.deepEqual(forbidden, []); });
  console.log(`RESULT: ${passed} passed, ${failed} failed`); process.exitCode = failed ? 1 : 0;
})();
