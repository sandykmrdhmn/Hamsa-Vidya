/** Safe Markdown and MathML formatting shared by study views. */
class StudyFormat {
  static math(tex, display = false) {
    if (!window.katex || tex.length > 8000) return null;
    try {
      const output = katex.renderToString(tex, {
        output: 'mathml',
        displayMode: display,
        trust: false,
        throwOnError: true,
        maxExpand: 500,
        maxSize: 20,
      });
      const doc = new DOMParser().parseFromString(output, 'text/html'),
        math = doc.querySelector('math');
      if (!math) return null;
      const tags = new Set([
        'math',
        'semantics',
        'annotation',
        'mrow',
        'mi',
        'mn',
        'mo',
        'mtext',
        'mspace',
        'mfrac',
        'msqrt',
        'mroot',
        'msup',
        'msub',
        'msubsup',
        'munder',
        'mover',
        'munderover',
        'mtable',
        'mtr',
        'mtd',
        'mstyle',
        'mpadded',
        'mphantom',
        'menclose',
        'mmultiscripts',
        'mprescripts',
        'none',
      ]);
      const attrs = new Set([
        'xmlns',
        'display',
        'mathvariant',
        'stretchy',
        'fence',
        'separator',
        'form',
        'accent',
        'accentunder',
        'encoding',
        'columnalign',
        'rowalign',
        'columnspacing',
        'rowspacing',
        'linethickness',
        'width',
        'height',
        'depth',
        'lspace',
        'rspace',
        'voffset',
        'notation',
        'displaystyle',
        'scriptlevel',
      ]);
      for (const el of [math, ...math.querySelectorAll('*')]) {
        if (!tags.has(el.localName)) {
          el.remove();
          continue;
        }
        for (const attr of [...el.attributes])
          if (!attrs.has(attr.name)) el.removeAttribute(attr.name);
      }
      return '<span class="study-math">' + math.outerHTML + '</span>';
    } catch {
      return null;
    }
  }
  static format(text, { formula = false } = {}) {
    const raw = String(text ?? ''),
      escape = (value) => SecurityUtils.escapeHtml(value),
      math = [],
      originals = [];
    if (formula && !/\$|\\\(|\\\[/.test(raw)) {
      const rendered = this.math(raw, true);
      if (rendered) return rendered;
    }
    const token = 'STUDYMATH' + crypto.randomUUID().replaceAll('-', '');
    const protect = raw
      .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
      .map((part, i) =>
        i % 2
          ? part
          : part.replace(
              /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([^\n]+?)\\\)|(?<!\\)\$([^\n$]+?)\$/g,
              (match, a, b, c, d, offset, full) => {
                // A closing dollar before another price is currency, not TeX.
                if (d && /^\d/.test(full.slice(offset + match.length)))
                  return match;
                if (
                  d &&
                  /^\d/.test(d) &&
                  /\s(?:to|and|or|each|for|through|per|vs)\b/i.test(d)
                )
                  return match;
                if (d && /\s$/.test(d)) return match;
                const rendered = this.math(a || b || c || d, Boolean(a || b));
                if (!rendered) return match;
                const marker = token + math.length + 'END';
                math.push(rendered);
                originals.push(match);
                return marker;
              },
            ),
      )
      .join('');
    let html = window.marked
      ? SecurityUtils.sanitizeHtml(
          window.marked.parse(escape(protect), { breaks: true }),
        )
      : escape(protect).replace(/\n/g, '<br>');
    // Markdown escapes code a second time. Decode that extra layer as text,
    // keeping technical angle brackets readable without permitting HTML.
    if (window.marked && html.includes('<code')) {
      const doc = new DOMParser().parseFromString(html, 'text/html'),
        decoder = document.createElement('textarea');
      for (const code of doc.querySelectorAll('code')) {
        decoder.innerHTML = code.textContent;
        code.textContent = decoder.value;
      }
      html = doc.body.innerHTML;
    }
    // Replace only text nodes, never attributes or link targets.
    if (math.length) {
      let doc = new DOMParser().parseFromString(html, 'text/html');
      // Restore literal delimiters in attributes, then validate URLs again.
      // Math markup belongs only in text; URL paths must not contain markers.
      for (const el of doc.body.querySelectorAll('*'))
        for (const attr of [...el.attributes]) {
          if (attr.value.includes(token))
            el.setAttribute(
              attr.name,
              attr.value.replace(
                new RegExp(token + '(\\d+)END', 'g'),
                (_, i) => originals[Number(i)] || '',
              ),
            );
        }
      doc = new DOMParser().parseFromString(
        SecurityUtils.sanitizeHtml(doc.body.innerHTML),
        'text/html',
      );
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT),
        nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (node.parentElement.closest('code,pre')) continue;
        const pieces = node.textContent.split(
          new RegExp('(' + token + '\\d+END)', 'g'),
        );
        if (pieces.length === 1) continue;
        const fragment = doc.createDocumentFragment();
        for (const piece of pieces) {
          const index = piece.startsWith(token)
            ? Number(piece.slice(token.length, -3))
            : NaN;
          if (Number.isInteger(index) && math[index]) {
            const template = doc.createElement('template');
            template.innerHTML = math[index];
            fragment.append(template.content);
          } else fragment.append(doc.createTextNode(piece));
        }
        node.replaceWith(fragment);
      }
      html = doc.body.innerHTML;
    }
    return html;
  }
}
window.StudyFormat = StudyFormat;
