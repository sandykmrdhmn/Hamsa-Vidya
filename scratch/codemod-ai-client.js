/**
 * One-shot codemod: route every direct Gemini fetch through window.aiClient.
 *
 * Rewrites this mechanical pattern
 *
 *   const url = `https://generativelanguage.googleapis.com/v1beta/models/${M}:generateContent?key=${K}`;
 *   const res = await fetch(url, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(PAYLOAD)
 *   });
 *
 * into
 *
 *   const res = await window.aiClient.fetchGenerateContent(M, PAYLOAD, { apiKey: K });
 *
 * Downstream code keeps working unchanged because a native Response is returned.
 */

const fs = require('fs');
const path = require('path');

const TARGETS = [
  'js/gemini-service.js',
  'js/answer-writing-service.js',
  'js/ai-teacher-service.js',
  'js/notification-summary-service.js'
];

const URL_RE = /^(\s*)const url = `https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/\$\{([^}]+)\}:generateContent\?key=\$\{([^}]+)\}`;\s*$/;

/** Find index of the character closing the paren opened at openIdx. */
function matchParen(text, openIdx) {
  let depth = 0;
  let inStr = null;
  let inTemplate = false;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    const prev = text[i - 1];
    if (inStr) {
      if (c === inStr && prev !== '\\') inStr = null;
      continue;
    }
    if (inTemplate) {
      if (c === '`' && prev !== '\\') inTemplate = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '`') { inTemplate = true; continue; }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

let grandTotal = 0;

for (const rel of TARGETS) {
  const file = path.join(__dirname, '..', rel);
  let src = fs.readFileSync(file, 'utf8');
  let count = 0;

  for (;;) {
    const lines = src.split('\n');
    let hit = -1;
    let indent, model, key;

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(URL_RE);
      if (m) {
        hit = i;
        indent = m[1];
        model = m[2].trim();
        key = m[3].trim();
        break;
      }
    }
    if (hit === -1) break;

    // The fetch call usually follows immediately, but some sites have an
    // intervening statement (e.g. an onProgress callback). Scan ahead a few
    // lines and preserve anything in between.
    const FETCH_RE = /^\s*const (\w+) = await fetch\(url, \{\s*$/;
    let f = hit + 1;
    let fetchMatch = null;
    while (f < lines.length && f <= hit + 6) {
      const m = lines[f].match(FETCH_RE);
      if (m) { fetchMatch = m; break; }
      f++;
    }
    if (!fetchMatch) {
      throw new Error(`${rel}: line ${hit + 1} url not followed by a fetch call within 6 lines.`);
    }
    const varName = fetchMatch[1];

    // Lines between the url declaration and the fetch call, kept verbatim.
    const interleaved = lines.slice(hit + 1, f);

    // Locate `body: JSON.stringify(` within the init object.
    let bodyLine = -1;
    for (let i = f + 1; i < Math.min(f + 8, lines.length); i++) {
      if (/body:\s*JSON\.stringify\(/.test(lines[i])) { bodyLine = i; break; }
    }
    if (bodyLine === -1) {
      throw new Error(`${rel}: could not find body: JSON.stringify( after line ${f + 1}`);
    }

    // Work on absolute offsets to balance the JSON.stringify( parens.
    const before = lines.slice(0, hit).join('\n');
    const region = lines.slice(hit).join('\n');
    const stringifyRel = region.indexOf('JSON.stringify(');
    const openParenRel = stringifyRel + 'JSON.stringify'.length;
    const closeParenRel = matchParen(region, openParenRel);
    if (closeParenRel === -1) throw new Error(`${rel}: unbalanced JSON.stringify( near line ${bodyLine + 1}`);

    const payload = region.slice(openParenRel + 1, closeParenRel).trim();

    // After the payload comes `\n  });` closing the fetch init object + call.
    const after = region.slice(closeParenRel + 1);
    const tailMatch = after.match(/^\s*\}\s*\)\s*;/);
    if (!tailMatch) {
      throw new Error(`${rel}: unexpected tail after payload near line ${bodyLine + 1}: ${JSON.stringify(after.slice(0, 40))}`);
    }
    const rest = after.slice(tailMatch[0].length);

    const keyArg = key === 'apiKey' ? '{ apiKey }' : `{ apiKey: ${key} }`;
    const callLine = `${indent}const ${varName} = await window.aiClient.fetchGenerateContent(${model}, ${payload}, ${keyArg});`;

    // Preserve any statement that sat between the url decl and the fetch.
    const replacement = interleaved.length
      ? `${interleaved.join('\n')}\n${callLine}`
      : callLine;

    src = `${before}${before ? '\n' : ''}${replacement}${rest}`;
    count++;
    grandTotal++;
  }

  fs.writeFileSync(file, src, 'utf8');
  console.log(`${rel}: rewrote ${count} call site(s)`);
}

console.log(`\nTotal rewritten: ${grandTotal}`);
