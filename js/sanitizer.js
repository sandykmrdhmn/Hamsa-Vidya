/**
 * HAMSA VIDYA (हंस विद्या) — Security & Input Sanitizer Engine
 * Defends against Cross-Site Scripting (XSS), malicious script payloads,
 * attribute injection, and protocol bypasses across user and AI-generated content.
 */

class SecurityUtils {
  /**
   * Escape raw text characters into HTML entities
   * @param {string} str
   * @returns {string}
   */
  static escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Disallowed tag names that could execute code or manipulate DOM security context
   */
  static DANGEROUS_TAGS = new Set([
    'script', 'iframe', 'object', 'embed', 'applet', 'base', 'meta', 'link',
    'style', 'form', 'frame', 'frameset', 'svg', 'math', 'plaintext', 'template'
  ]);

  /**
   * Permitted safe formatting and layout tags for educational study material
   */
  static ALLOWED_TAGS = new Set([
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark', 'small',
    'code', 'pre', 'kbd', 'samp', 'var', 'blockquote', 'q',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    'span', 'div', 'a', 'details', 'summary'
  ]);

  /**
   * Permitted safe attributes
   */
  static ALLOWED_ATTRIBUTES = new Set([
    'id', 'class', 'style', 'title', 'href', 'target', 'rel',
    'colspan', 'rowspan', 'scope', 'data-term', 'data-section'
  ]);

  /**
   * Sanitize HTML content by parsing through DOM and stripping threats
   * @param {string} dirtyHtml
   * @returns {string}
   */
  static sanitizeHtml(dirtyHtml) {
    if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(dirtyHtml, 'text/html');
      const body = doc.body;

      if (!body) return this.escapeHtml(dirtyHtml);

      // Clean node hierarchy recursively
      this._cleanNode(body);

      return body.innerHTML;
    } catch (e) {
      console.warn('Sanitizer fallback to escapeHtml:', e);
      return this.escapeHtml(dirtyHtml);
    }
  }

  /**
   * Recursive node cleaner
   * @private
   */
  static _cleanNode(node) {
    const children = Array.from(node.childNodes);

    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = child.tagName.toLowerCase();

        // 1. Strip dangerous tags immediately
        if (this.DANGEROUS_TAGS.has(tagName) || !this.ALLOWED_TAGS.has(tagName)) {
          // If it's a known dangerous container, delete entirely (including children)
          if (this.DANGEROUS_TAGS.has(tagName)) {
            child.remove();
            continue;
          }
          // Otherwise, unwrap the element (keep safe text child nodes)
          while (child.firstChild) {
            node.insertBefore(child.firstChild, child);
          }
          child.remove();
          continue;
        }

        // 2. Clean all attributes
        const attrs = Array.from(child.attributes);
        for (const attr of attrs) {
          const attrName = attr.name.toLowerCase();
          const attrVal = (attr.value || '').trim();

          // Strip any event handler (onerror, onload, onclick, on...)
          if (attrName.startsWith('on')) {
            child.removeAttribute(attr.name);
            continue;
          }

          // Strip disallowed attributes
          if (!this.ALLOWED_ATTRIBUTES.has(attrName) && !attrName.startsWith('data-')) {
            child.removeAttribute(attr.name);
            continue;
          }

          // Check protocol for href
          if (attrName === 'href') {
            const valLower = attrVal.toLowerCase().replace(/[\s\x00-\x1F]/g, '');
            if (
              valLower.startsWith('javascript:') ||
              valLower.startsWith('data:') ||
              valLower.startsWith('vbscript:')
            ) {
              child.removeAttribute('href');
              continue;
            }
            // Enforce safe target and rel for links
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }

          // Check style attribute for dangerous expressions or url()
          if (attrName === 'style') {
            const styleLower = attrVal.toLowerCase();
            if (
              styleLower.includes('expression') ||
              styleLower.includes('behavior') ||
              styleLower.includes('javascript:') ||
              styleLower.includes('url(') ||
              styleLower.includes('-moz-binding')
            ) {
              child.removeAttribute('style');
            }
          }
        }

        // Clean deeper children
        this._cleanNode(child);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        // Remove HTML comments
        child.remove();
      }
    }
  }

  /**
   * Clean string value in an object or primitive
   */
  static sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return this.sanitizeHtml(str);
  }

  // =========================================================================
  // SVG SANITIZER
  //
  // The AI Teacher asks Gemini to return raw <svg> markup for concept diagrams,
  // which was previously injected straight into innerHTML. That is a script
  // execution path: <svg><script>…</script></svg> runs on our origin and can
  // read the Gemini API key out of localStorage.
  //
  // sanitizeHtml() cannot be used here because it deliberately drops <svg>
  // entirely (it is in DANGEROUS_TAGS). This method keeps the feature by
  // allowing only a presentational subset of SVG.
  // =========================================================================

  /**
   * Shape, text and gradient elements that cannot execute anything.
   * NOTE: entries must be lowercase — they are compared against
   * nodeName.toLowerCase(), so 'linearGradient' would never match.
   */
  static SVG_ALLOWED_TAGS = new Set([
    'svg', 'g', 'defs', 'title', 'desc',
    'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'textpath',
    'lineargradient', 'radialgradient', 'stop', 'pattern',
    'marker', 'symbol', 'clippath', 'mask',
    // Filters are presentational and safe once attributes are filtered.
    'filter', 'fegaussianblur', 'feoffset', 'feblend', 'femerge', 'femergenode',
    'fedropshadow', 'fecolormatrix', 'fecomposite', 'feflood'
  ]);

  /**
   * Attributes allowed on SVG elements. Deliberately excludes href/xlink:href
   * (external and javascript: references) and all event handlers.
   */
  static SVG_ALLOWED_ATTRIBUTES = new Set([
    'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform',
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
    'opacity', 'offset', 'stop-color', 'stop-opacity',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'text-anchor', 'dominant-baseline', 'alignment-baseline', 'letter-spacing',
    'dx', 'dy', 'class', 'id', 'gradientunits', 'gradienttransform',
    'patternunits', 'markerwidth', 'markerheight', 'refx', 'refy', 'orient',
    'preserveaspectratio', 'xmlns', 'clip-rule', 'clip-path',
    'stddeviation', 'in', 'in2', 'result', 'mode', 'type', 'values',
    'flood-color', 'flood-opacity', 'operator'
  ]);

  /**
   * Sanitize an SVG fragment, returning safe markup or '' if unusable.
   * @param {string} dirtySvg
   * @returns {string}
   */
  static sanitizeSvg(dirtySvg) {
    if (!dirtySvg || typeof dirtySvg !== 'string') return '';

    // Cheap pre-filter: if it doesn't look like an <svg>, refuse it outright.
    if (!/^\s*<svg[\s>]/i.test(dirtySvg.trim())) return '';

    try {
      const doc = new DOMParser().parseFromString(dirtySvg, 'image/svg+xml');

      // Malformed XML yields a <parsererror> document.
      if (doc.getElementsByTagName('parsererror').length > 0) return '';

      const root = doc.documentElement;
      if (!root || root.nodeName.toLowerCase() !== 'svg') return '';

      // The root's own attributes must be filtered too — an `onload` on the
      // outer <svg> is the easiest place to hide script, and cleaning only the
      // children would leave it intact.
      this._cleanSvgAttributes(root);
      this._cleanSvgNode(root);

      // Constrain the drawing to its container regardless of what the model asked for.
      root.setAttribute('width', '100%');
      if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', '0 0 500 180');
      root.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      return new XMLSerializer().serializeToString(root);
    } catch (e) {
      console.warn('SVG sanitizer rejected content:', e);
      return '';
    }
  }

  /**
   * Recursively strip disallowed SVG elements and attributes.
   * @private
   */
  static _cleanSvgNode(node) {
    const children = Array.from(node.childNodes);

    for (const child of children) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = child.nodeName.toLowerCase();

      // Anything not explicitly allowed goes, children included. <script>,
      // <foreignObject>, <use>, <animate> and <style> all land here.
      if (!this.SVG_ALLOWED_TAGS.has(tag)) {
        child.remove();
        continue;
      }

      this._cleanSvgAttributes(child);
      this._cleanSvgNode(child);
    }
  }

  /**
   * Strip unsafe attributes from a single SVG element.
   * Applied to the root as well as every descendant.
   * @private
   */
  static _cleanSvgAttributes(el) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = (attr.value || '').trim();

      // Event handlers (onload, onclick, onbegin, ...).
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      // Any form of href — blocks javascript:, data: and external fetches.
      if (name === 'href' || name.endsWith(':href')) {
        el.removeAttribute(attr.name);
        continue;
      }
      // Namespace declarations other than the SVG one (e.g. xmlns:xlink).
      if (name.startsWith('xmlns') && name !== 'xmlns') {
        el.removeAttribute(attr.name);
        continue;
      }
      if (!this.SVG_ALLOWED_ATTRIBUTES.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }

      // Even on allowed attributes, reject script-ish or remote-fetching values.
      const lowered = value.toLowerCase().replace(/[\s\x00-\x1F]/g, '');
      if (lowered.includes('javascript:') || lowered.includes('vbscript:') ||
          lowered.includes('data:text/html')) {
        el.removeAttribute(attr.name);
        continue;
      }

      // `url(#localId)` is how gradients and clip paths are referenced, so it
      // must be allowed. Only external or data URLs are a problem.
      if (lowered.includes('url(') && !/^url\(#[\w:.-]+\)$/.test(lowered)) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

// Attach globally
window.SecurityUtils = SecurityUtils;
