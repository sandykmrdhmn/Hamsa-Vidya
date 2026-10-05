/**
 * HAMSA VIDYA (हंस विद्या) — High-Performance Static Web Server
 * Zero dependencies, built with standard Node.js http and fs modules.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const {Buffer} = require('buffer');
const liveExamsScraper = require('./live-exams-scraper');
const {ProxyBudget,positiveLimit,estimateInput,validatePayload} = require('./ai-proxy-policy');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// =========================================================================
// PROXY SAFETY LIMITS
// The Gemini proxy spends the server owner's API quota, so it must not be an
// open relay. These limits are deliberately generous for a single student but
// low enough that an abusive client cannot drain the key.
// =========================================================================
const GEMINI_RATE_LIMIT = {
  windowMs: 60 * 1000,
  maxRequests: 20
};
const MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024; // 2 MB — large PDF prompts still fit
const GEMINI_UPSTREAM_TIMEOUT_MS = 120000;
const GEMINI_MODEL = 'gemini-3.6-flash';
const proxyBudget = new ProxyBudget({
  rpm:positiveLimit(process.env.GEMINI_PROJECT_RPM,5),
  tpm:positiveLimit(process.env.GEMINI_PROJECT_TPM,12000),
  dailyRequests:positiveLimit(process.env.GEMINI_PROJECT_DAILY_REQUESTS,100),
  dailyTokens:positiveLimit(process.env.GEMINI_PROJECT_DAILY_TOKENS,500000),
  strictInputLimit:Boolean(process.env.GEMINI_PROJECT_TPM),
  file:process.env.GEMINI_API_KEY ? path.join(PUBLIC_DIR,'.hamsa-ai-budget.json') : null
});

/** requestCounts: ip -> { count, windowStart } */
const _rateBuckets = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = _rateBuckets.get(ip);

  if (!bucket || (now - bucket.windowStart) > GEMINI_RATE_LIMIT.windowMs) {
    _rateBuckets.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: GEMINI_RATE_LIMIT.maxRequests - 1, retryAfterSec: 0 };
  }

  if (bucket.count >= GEMINI_RATE_LIMIT.maxRequests) {
    const retryAfterSec = Math.ceil((bucket.windowStart + GEMINI_RATE_LIMIT.windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.count++;
  return { allowed: true, remaining: GEMINI_RATE_LIMIT.maxRequests - bucket.count, retryAfterSec: 0 };
}

// Drop stale buckets so the map cannot grow without bound.
setInterval(() => {
  const cutoff = Date.now() - GEMINI_RATE_LIMIT.windowMs * 2;
  for (const [ip, bucket] of _rateBuckets) {
    if (bucket.windowStart < cutoff) _rateBuckets.delete(ip);
  }
}, GEMINI_RATE_LIMIT.windowMs).unref();

function getClientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

// Long-cache immutable vendor bundles and images; always revalidate app code.
function cacheControlFor(ext, pathname) {
  if (pathname.startsWith('/assets/vendor/')) {
    return 'public, max-age=31536000, immutable';
  }
  if (['.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2', '.ttf'].includes(ext)) {
    return 'public, max-age=604800';
  }
  if (['.html', '.webmanifest'].includes(ext)) {
    return 'no-cache';
  }
  // .css / .js change during development — revalidate every load.
  return 'no-cache';
}

// =========================================================================
// STATIC FILE ACCESS POLICY
// The web root is the project root, so without an explicit policy the server
// happily hands out server.js, package.json, the scratch scripts and any other
// non-public file. Only serve what the browser actually needs.
// =========================================================================
const SERVABLE_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs',
  '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.gif',
  '.woff', '.woff2', '.ttf',
  // PWA manifest, robots.txt and sitemap.xml must be publicly fetchable.
  '.webmanifest', '.txt', '.xml'
]);

// Server-only files that share a servable extension and must stay private.
const DENIED_FILES = new Set([
  '/server.js',
  '/live-exams-scraper.js',
  '/ai-proxy-policy.js',
  '/package.json',
  '/package-lock.json',
  '/start-server.bat'
]);

const DENIED_PREFIXES = [
  '/node_modules/',
  '/scratch/',
  '/.git/',
  '/.kiro/',
  '/.vscode/'
];

/** @returns {boolean} true when the request must be refused. */
function isForbiddenPath(urlPath, ext) {
  const lower = urlPath.toLowerCase();

  if (DENIED_FILES.has(lower)) return true;
  if (DENIED_PREFIXES.some(p => lower.startsWith(p))) return true;

  // Dotfiles (.env, .gitignore) and editor/backup leftovers.
  const base = lower.split('/').pop() || '';
  if (base.startsWith('.')) return true;
  if (lower.endsWith('.bak') || lower.endsWith('.log') || lower.endsWith('.ps1')) return true;

  // Anything we don't explicitly recognise (.md, .env, .yml ...) stays private
  // rather than being shipped as application/octet-stream.
  if (!SERVABLE_EXTENSIONS.has(ext)) return true;

  return false;
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  applySecurityHeaders(res);

  // =========================================================================
  // API: Exam listing — one source, five columns (see live-exams-scraper.js)
  // =========================================================================
  if (req.url.startsWith('/api/live-exams')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    const urlParts = req.url.split('?');
    const params = new URLSearchParams(urlParts[1] || '');
    const forceRefresh = params.get('refresh') === 'true';

    liveExamsScraper.getLiveExams({ forceRefresh })
      .then(exams => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=900'
        });
        res.end(JSON.stringify({
          success: true,
          count: exams.length,
          // Taken from the reader rather than restated, so the two cannot drift.
          source: liveExamsScraper.SOURCE.url,
          timestamp: new Date().toISOString(),
          exams
        }));
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: err.message, exams: [] }));
      });
    return;
  }

  // =========================================================================
  // API PROXY: Forward Gemini requests securely (keeps API key server-side)
  //
  // The browser never sees GEMINI_API_KEY. Clients call:
  //   GET  /api/gemini/status         -> is a server key configured?
  //   GET  /api/gemini/models         -> list models
  //   POST /api/gemini/<model>        -> generateContent
  // =========================================================================
  if (req.url.startsWith('/api/gemini')) {
    const urlParts = req.url.split('?');
    const apiPath = urlParts[0].replace('/api/gemini', '');
    const serverApiKey = process.env.GEMINI_API_KEY || '';
    const ip = getClientIp(req);
    // There is no backend user authentication in this application yet. Keep
    // the shared key local rather than granting public access through a UI gate.
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)) return sendJson(res,403,{error:{code:'AI_PROXY_ACCESS',message:'Shared AI access is restricted to this computer. Use a personal key, or add authenticated server access before public hosting.'}});
    let requestHost;
    try { requestHost = new URL(`http://${req.headers.host}`); }
    catch { return sendJson(res,403,{error:'Invalid shared AI host.'}); }
    if (!['localhost','127.0.0.1','[::1]'].includes(requestHost.hostname)) return sendJson(res,403,{error:'Shared AI access requires a localhost host.'});
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return sendJson(res,403,{error:'Invalid request origin.'}); }
      if (origin.host !== req.headers.host || !['http:','https:'].includes(origin.protocol)) return sendJson(res,403,{error:'Cross-origin shared AI requests are not allowed.'});
    }

    // Handle CORS preflight before anything else.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    // -- Capability probe. Deliberately reveals only a boolean, never the key. --
    if (req.method === 'GET' && apiPath === '/status') {
      return sendJson(res, 200, {
        configured: Boolean(serverApiKey),
        rateLimit: {
          maxRequests: GEMINI_RATE_LIMIT.maxRequests,
          windowSeconds: GEMINI_RATE_LIMIT.windowMs / 1000
        }
      });
    }

    if (!serverApiKey) {
      return sendJson(res, 503, {
        error: 'GEMINI_API_KEY is not configured on the server. Set the environment variable, or add a personal key in Settings to use direct mode.'
      });
    }

    // -- Rate limit every request that spends the server's quota. --
    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
      return sendJson(res, 429, {
        error: `Rate limit exceeded. Max ${GEMINI_RATE_LIMIT.maxRequests} AI requests per ${GEMINI_RATE_LIMIT.windowMs / 1000}s. Retry in ${limit.retryAfterSec}s.`
      }, {
        'Retry-After': String(limit.retryAfterSec)
      });
    }

    const forwardHeaders = {
      'X-RateLimit-Remaining': String(limit.remaining)
    };

    if (req.method === 'GET' && apiPath === '/models') {
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${serverApiKey}`;
      fetch(targetUrl, { signal: AbortSignal.timeout(GEMINI_UPSTREAM_TIMEOUT_MS) })
        .then(r => r.text().then(body => {
          res.writeHead(r.status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...(r.headers.get('Retry-After') ? { 'Retry-After': r.headers.get('Retry-After') } : {}),
            ...forwardHeaders
          });
          res.end(body);
        }))
        .catch(err => {
          sendJson(res, 502, { error: 'Failed to reach Gemini API: ' + err.message }, forwardHeaders);
        });
      return;
    }

    if (req.method === 'POST') {
      // Extract model from path: /api/gemini/gemini-3.6-flash -> gemini-3.6-flash
      let rawModel;
      try { rawModel = decodeURIComponent(apiPath.replace(/^\//, '')) || GEMINI_MODEL; }
      catch { return sendJson(res,400,{error:'Invalid model path encoding.'},forwardHeaders); }

      // Only allow plausible model identifiers so the path cannot be used to
      // reach arbitrary Google endpoints.
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(rawModel)) {
        return sendJson(res, 400, { error: `Invalid model identifier: ${rawModel}` }, forwardHeaders);
      }
      if (rawModel !== GEMINI_MODEL) return sendJson(res,400,{error:'This shared proxy only enables Gemini 3.6 Flash.'},forwardHeaders);

      const chunks = [];
      let bytes = 0;
      let aborted = false;

      req.on('data', chunk => {
        if (aborted) return;
        bytes += chunk.length;
        if (bytes > MAX_PROXY_BODY_BYTES) {
          aborted = true;
          sendJson(res, 413, {
            error: `Request body too large. Limit is ${Math.round(MAX_PROXY_BODY_BYTES / 1024 / 1024)} MB. Reduce the page range or split the request.`
          }, forwardHeaders);
          req.destroy();
          return;
        }
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      req.on('end', () => {
        if (aborted) return;
        const body = Buffer.concat(chunks).toString('utf8');
        let payload;

        // Reject malformed JSON here rather than paying for an upstream round trip.
        try {
          payload = JSON.parse(body);
        } catch {
          return sendJson(res, 400, { error: 'Request body is not valid JSON.' }, forwardHeaders);
        }
        const invalid = validatePayload(payload);
        if (invalid) return sendJson(res,400,{error:invalid},forwardHeaders);
        const safePayload = {...payload,generationConfig:{...payload.generationConfig,maxOutputTokens:payload.generationConfig?.maxOutputTokens || 8192,thinkingConfig:{...payload.generationConfig?.thinkingConfig,thinkingLevel:payload.generationConfig?.thinkingConfig?.thinkingLevel || 'low'}}};
        const budgetError = proxyBudget.reserve(estimateInput(safePayload),safePayload.generationConfig.maxOutputTokens);
        if (budgetError) return sendJson(res,budgetError.status,{error:{code:budgetError.code,message:budgetError.message,retryable:budgetError.retryable}}, {...forwardHeaders,...(budgetError.retryAfter ? {'Retry-After':String(budgetError.retryAfter)} : {})});

        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${rawModel}:generateContent?key=${serverApiKey}`;
        const upstreamController = new AbortController();
        let upstreamTimedOut = false;
        const upstreamTimer = setTimeout(() => { upstreamTimedOut = true; upstreamController.abort(); }, GEMINI_UPSTREAM_TIMEOUT_MS);
        const cancelUpstream = () => { if (!res.writableEnded) upstreamController.abort(); };
        res.on('close', cancelUpstream);
        fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(safePayload),
          signal: upstreamController.signal
        })
          .then(r => r.text().then(responseBody => {
            if (res.destroyed) return;
            res.writeHead(r.status, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
              ...(r.headers.get('Retry-After') ? { 'Retry-After': r.headers.get('Retry-After') } : {}),
              ...forwardHeaders
            });
            res.end(responseBody);
          }))
          .catch(err => {
            if (res.destroyed) return;
            const msg = upstreamTimedOut || err.name === 'TimeoutError'
              ? `Gemini upstream timed out after ${GEMINI_UPSTREAM_TIMEOUT_MS / 1000}s.`
              : 'Failed to reach Gemini API: ' + err.message;
            sendJson(res, 502, { error: {message:msg,code:upstreamTimedOut || err.name === 'TimeoutError' ? 'AI_UPSTREAM_TIMEOUT' : 'AI_NETWORK_UNCERTAIN',retryable:false} }, forwardHeaders);
          }).finally(() => { clearTimeout(upstreamTimer); res.removeListener('close', cancelUpstream); });
      });

      req.on('error', () => {
        if (!aborted) sendJson(res, 400, { error: 'Request stream error.' }, forwardHeaders);
      });
      return;
    }

    return sendJson(res, 405, { error: 'Method not allowed' }, forwardHeaders);
  }

  // =========================================================================
  // STATIC FILE SERVER
  // =========================================================================
  let safeUrl = req.url.split('?')[0];

  // Decode percent-escapes before the traversal check so %2e%2e cannot slip through.
  try {
    safeUrl = decodeURIComponent(safeUrl);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('400 Bad Request');
  }

  if (safeUrl === '/') safeUrl = '/index.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(safeUrl));

  // Security check to prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  // Refuse private files before touching the filesystem. Extensionless paths
  // (SPA deep links like /dashboard) fall through to the index.html handler.
  const requestedExt = path.extname(safeUrl).toLowerCase();
  if (requestedExt && isForbiddenPath(safeUrl.replace(/\\/g, '/'), requestedExt)) {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('404 Not Found');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Missing assets must not become successful HTML responses: browsers and
      // service workers otherwise cache the document as a script/worker.
      if (requestedExt && requestedExt !== '.html') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end('404 Not Found');
      }
      // Extensionless/HTML page routes can still use the SPA shell.
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (indexErr, content) => {
        if (indexErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('404 Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControlFor(ext, safeUrl));
    res.setHeader('Content-Length', stats.size);

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  const keyConfigured = Boolean(process.env.GEMINI_API_KEY);
  console.log('================================================================');
  console.log('🪿 HAMSA VIDYA (हंस विद्या) — AI Wisdom & Quiz Companion');
  console.log(`🚀 Web Application running at: http://localhost:${PORT}`);
  console.log(keyConfigured
    ? '🔒 Gemini mode: SECURE PROXY (key stays server-side)'
    : '⚠️  Gemini mode: DIRECT (no GEMINI_API_KEY set — browser will use a personal key from Settings)');
  if (!keyConfigured) {
    console.log('   To enable secure proxy mode:  $env:GEMINI_API_KEY="your-key"; node server.js');
  }
  console.log('Press Ctrl+C to terminate the server.');
  console.log('================================================================');
});
