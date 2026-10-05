/** Shared card identities, readable formatting, CSV and local review scheduling. */
class FlashcardTools {
  static text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
  static id(value) {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  static hash(value) {
    let h = 2166136261;
    for (const c of String(value)) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }
  static localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  static due(review, now = new Date()) {
    const instant = this.reviewTime(review);
    return Number.isFinite(instant) && instant <= now.getTime();
  }
  static reviewTime(review) {
    const instant = Date.parse(review?.dueAt);
    if (Number.isFinite(instant)) return instant;
    const date = review?.dueDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return NaN;
    const local = new Date(date + 'T00:00:00');
    return this.localDate(local) === date ? local.getTime() : NaN;
  }
  static reviewLabel(review) {
    const instant = this.reviewTime(review);
    if (!Number.isFinite(instant)) return 'Schedule unavailable';
    return Number.isFinite(Date.parse(review.dueAt))
      ? new Date(instant).toLocaleString()
      : new Date(instant).toLocaleDateString();
  }
  static schedule(previous, rating, now = new Date()) {
    if (![1, 2, 3, 4].includes(rating))
      throw Error('Choose a valid recall rating.');
    let repetitions = Math.max(
      0,
      Math.floor(Number(previous?.repetitions) || 0),
    );
    let easeFactor = Math.min(
      3.5,
      Math.max(1.3, Number(previous?.easeFactor) || 2.5),
    );
    let interval = Math.max(1, Math.min(3650, Number(previous?.interval) || 1)),
      state = 'REVIEW',
      due = new Date(now);
    if (rating === 1) {
      repetitions = 0;
      interval = 0;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
      state = 'LEARNING';
      due.setMinutes(due.getMinutes() + 10);
    } else {
      if (rating === 2) {
        interval = repetitions ? Math.max(1, Math.round(interval * 1.2)) : 1;
        easeFactor = Math.max(1.3, easeFactor - 0.15);
      } else if (rating === 3)
        interval =
          repetitions === 0
            ? 1
            : repetitions === 1
              ? 4
              : Math.round(interval * easeFactor);
      else {
        interval =
          repetitions === 0
            ? 3
            : repetitions === 1
              ? 7
              : Math.round(interval * easeFactor * 1.3);
        easeFactor = Math.min(3.5, easeFactor + 0.15);
      }
      repetitions++;
      interval = Math.min(3650, Math.max(1, interval));
      due.setDate(due.getDate() + interval);
    }
    return {
      interval,
      repetitions,
      easeFactor: Number(easeFactor.toFixed(2)),
      state,
      dueAt: due.toISOString(),
      dueDate: this.localDate(due),
      lastRating: rating,
      lastReviewedAt: now.toISOString(),
    };
  }
  static intervalLabel(previous, rating) {
    const days = this.schedule(previous, rating).interval;
    return days === 0 ? '10 min' : `${days}d`;
  }
  static fingerprint(card) {
    return card.sourceDeckType === 'NOTE' && card.kind
      ? this.hash(
          JSON.stringify([
            card.kind,
            ['point', 'concept'].includes(card.kind) ? '' : card.front,
            card.back,
            ['definition', 'point', 'concept'].includes(card.kind)
              ? ''
              : card.explanation,
          ]),
        )
      : this.hash(
          JSON.stringify([
            card.front,
            card.back,
            card.explanation,
            card.options || [],
          ]),
        );
  }
  static normalize(card) {
    if (
      !card ||
      !this.text(card.cardKey) ||
      !this.text(card.front) ||
      !this.text(card.back)
    )
      return null;
    const result = {
      ...card,
      front: this.text(card.front),
      back: this.text(card.back),
      explanation: this.text(card.explanation),
      options: Array.isArray(card.options)
        ? card.options.filter((v) => typeof v === 'string')
        : [],
      optionExplanations: Array.isArray(card.optionExplanations)
        ? card.optionExplanations.map((v) => this.text(v))
        : [],
      sourceReferences: this.references(card.sourceReferences),
      memoryCue: this.text(card.memoryCue),
      evidenceQuote: this.text(card.evidenceQuote),
      sourceTitle: this.text(card.sourceTitle),
      sourcePage: this.id(card.sourcePage),
    };
    result.contentFingerprint = this.fingerprint(result);
    return result;
  }
  static questionCard(raw, quiz = {}) {
    const q = window.QuizQuality?.normalize(raw);
    if (!q || q.reviewIssue || !this.id(raw.id)) return null;
    return this.normalize({
      id: raw.id,
      cardKey: `q:${raw.id}`,
      sourceDeckId: raw.quizId || quiz.id,
      sourceDeckType: 'QUIZ',
      front: q.questionText,
      back: q.options[q.correctAnswerIndex],
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      explanation: q.explanation,
      optionExplanations: q.optionExplanations,
      memoryCue: q.memoryCue,
      evidenceQuote: q.evidenceQuote,
      sourcePage: q.sourcePage,
      sourceReferences: this.references(q.sourceRefs),
      answerOrigin: q.answerOrigin,
      aiReviewed: q.aiReviewed,
      sourceTitle: quiz.sourceTitle || quiz.title || '',
      badge: quiz.subject || q.subject || 'Quiz',
      subject: quiz.subject || q.subject || 'General Study',
      isBookmarked: raw.isBookmarked,
    });
  }
  static customCard(raw, deck = {}) {
    if (!this.id(raw?.id)) return null;
    return this.normalize({
      ...raw,
      id: raw.id,
      cardKey: `custom:${raw.id}`,
      sourceDeckId: raw.deckId,
      sourceDeckType: 'CUSTOM',
      badge: raw.badge || 'Custom',
      subject: deck.subject || 'General Study',
      sourceTitle: deck.title || '',
    });
  }
  static references(refs) {
    return (Array.isArray(refs) ? refs : [])
      .filter((ref) => ref && typeof ref === 'object')
      .map((ref) => ({
        fileName: this.text(ref.fileName || ref.name) || 'Source',
        page: this.id(ref.page || ref.pageNumber),
      }));
  }
  static recallParts(value, limit = 650) {
    const text = this.text(value);
    if (text.length <= limit) return text ? [text] : [];
    const parts = [];
    let current = '';
    const append = (unit, separator = ' ') => {
      if (current && current.length + unit.length + separator.length > limit) {
        parts.push(current.trim());
        current = '';
      }
      current += (current ? separator : '') + unit;
    };
    // Protected blocks remain atomic even when larger than the target size.
    const blocks = text.split(
      /(```[\s\S]*?```|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g,
    );
    blocks.forEach((block, index) => {
      if (index % 2) {
        append(block, '\n\n');
        return;
      }
      for (const paragraph of block.split(/\n\s*\n/).filter((p) => p.trim())) {
        if (
          paragraph.length <= limit ||
          /^(?:\s*\||\s*[-*]\s|\s*\d+\.\s)/m.test(paragraph)
        ) {
          append(paragraph.trim(), '\n\n');
          continue;
        }
        for (const sentence of paragraph.match(
          /[\s\S]+?(?:[.!?।]+(?=\s|$)|$)/g,
        ) || [paragraph]) {
          if (sentence.length <= limit) append(sentence.trim());
          else
            for (const word of sentence.match(
              /`[^`]*`|\$[^$]+\$|\\\([^]*?\\\)|\S+/g,
            ) || [])
              append(word);
        }
      }
    });
    if (current.trim()) parts.push(current.trim());
    return parts;
  }
  static noteItems(note, sectionId = null) {
    // Legacy flat Notes must resolve identically in the reader and review store.
    if (
      (!Array.isArray(note.sections) || !note.sections.length) &&
      this.text(note.content)
    )
      note = {
        ...note,
        sections: [
          {
            id: 'sec-1',
            heading: note.title || 'Core Concepts & Study Guide',
            content: note.content,
          },
        ],
      };
    const items = [];
    const add = (
      kind,
      scope,
      index,
      front,
      back,
      explanation,
      badge,
      legacyKeys,
      refs,
    ) => {
      if (!this.text(front) || !this.text(back)) return;
      const semantic = ['point', 'concept'].includes(kind)
        ? [kind, this.text(back)]
        : [kind, this.text(front), this.text(back)];
      items.push({
        kind,
        scope,
        index,
        front,
        back,
        explanation,
        badge,
        legacyKeys,
        sourceReferences: this.references(refs),
        signature: JSON.stringify(semantic),
      });
    };
    const glossary = Array.isArray(note.glossaryTerms)
      ? note.glossaryTerms
      : Array.isArray(note.glossary)
        ? note.glossary
        : [];
    if (sectionId == null)
      glossary.forEach((term, i) => {
        if (term && this.text(term.term))
          add(
            'glossary',
            'glossary',
            i,
            'Define: ' + term.term,
            term.simpleMeaning || term.contextMeaning || term.definition,
            term.hindiMeaning ? 'Hindi Meaning: ' + term.hindiMeaning : '',
            'Glossary Term',
            [term.term],
            term.sourceReferences || term.sourceRefs,
          );
      });
    for (const [s, sec] of (Array.isArray(note.sections)
      ? note.sections
      : []
    ).entries()) {
      if (!sec || typeof sec !== 'object') continue;
      const scope = String(sec.id ?? 'section-' + s);
      if (sectionId != null && scope !== String(sectionId)) continue;
      const refs = sec.sourceReferences || sec.sourceRefs;
      (Array.isArray(sec.definitions) ? sec.definitions : []).forEach(
        (d, i) => {
          if (d && this.text(d.term))
            add(
              'definition',
              scope,
              i,
              'Define: ' + d.term,
              d.definition,
              sec.heading,
              'Definition',
              [scope + ':' + d.term],
              d.sourceReferences || d.sourceRefs || refs,
            );
        },
      );
      (Array.isArray(sec.formulas) ? sec.formulas : []).forEach((f, i) => {
        if (f && this.text(f.name))
          add(
            'formula',
            scope,
            i,
            f.name,
            f.formula,
            f.explanation || sec.heading,
            'Formula',
            [scope + ':' + f.name],
            f.sourceReferences || f.sourceRefs || refs,
          );
      });
      (Array.isArray(sec.keyPoints) ? sec.keyPoints : []).forEach((point, i) =>
        add(
          'point',
          scope,
          i,
          'Core Principle #' +
            (i + 1) +
            ' (' +
            (sec.heading || 'Section') +
            ')',
          point,
          sec.heading,
          'Key Point',
          [],
          refs,
        ),
      );
      this.recallParts(sec.summary || sec.content).forEach((part, i) =>
        add(
          'concept',
          scope,
          i,
          'Core Concept: ' +
            (sec.heading || 'Section') +
            (i ? ' • Part ' + (i + 1) : ''),
          part,
          'From note: ' + note.title,
          'Key Concept',
          i ? [] : [sec.heading],
          refs,
        ),
      );
    }
    return items;
  }
  // Match unchanged items first so insertion/reordering cannot borrow another
  // card's ID. Edited answers keep their ID and invalidate their schedule.
  static prepareNote(note, previous = note) {
    const items = this.noteItems(note),
      old = (
        Array.isArray(previous?.flashcardIds) ? previous.flashcardIds : []
      ).filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          typeof entry.token === 'string' &&
          entry.token &&
          typeof entry.signature === 'string',
      );
    const baseline = old.length
      ? old
      : this.noteItems(previous || note).map((item) => ({
          ...item,
          token: previous?.id ? String(item.index) : crypto.randomUUID(),
          migrationFingerprint: this.hash(
            JSON.stringify([
              item.front,
              item.back,
              this.text(item.explanation),
              [],
            ]),
          ),
        }));
    const semantic = this.indexEntries(baseline, (entry) =>
      JSON.stringify([entry.kind, entry.scope, entry.signature]),
    );
    const slots = this.indexEntries(baseline, (entry) =>
      JSON.stringify([entry.kind, entry.scope, entry.index]),
    );
    const used = new Set(),
      matches = new Map();
    for (const item of items) {
      const match = this.takeEntry(
        semantic,
        JSON.stringify([item.kind, item.scope, item.signature]),
        used,
      );
      if (match) {
        matches.set(item, match);
        used.add(match);
      }
    }
    for (const item of items)
      if (!matches.has(item)) {
        const match = this.takeEntry(
          slots,
          JSON.stringify([item.kind, item.scope, item.index]),
          used,
        );
        if (match) {
          matches.set(item, match);
          used.add(match);
        }
      }
    const flashcardIds = items.map((item) => {
      const match = matches.get(item);
      return {
        kind: item.kind,
        scope: item.scope,
        index: item.index,
        signature: item.signature,
        token: match?.token || crypto.randomUUID(),
        migrationFingerprint:
          match?.signature === item.signature
            ? match.migrationFingerprint
            : null,
      };
    });
    return { ...note, flashcardIds };
  }
  static noteCards(note, sectionId = null) {
    if (!this.id(note?.id)) return [];
    const entries = (
        Array.isArray(note.flashcardIds) ? note.flashcardIds : []
      ).filter((entry) => entry && typeof entry === 'object'),
      used = new Set();
    const semantic = this.indexEntries(entries, (entry) =>
      JSON.stringify([entry.kind, entry.scope, entry.signature]),
    );
    return this.noteItems(note, sectionId).map((item) => {
      const entry = this.takeEntry(
        semantic,
        JSON.stringify([item.kind, item.scope, item.signature]),
        used,
      );
      if (entry) used.add(entry);
      const token = entry?.token ?? String(item.index),
        key =
          'note:' +
          note.id +
          ':' +
          encodeURIComponent(item.scope) +
          ':' +
          item.kind +
          ':' +
          token;
      const legacy = item.legacyKeys.flatMap((tail) =>
        ['glossary', 'concept'].includes(item.kind)
          ? ['note_' + note.id + ':' + tail]
          : ['note_' + note.id + ':' + tail, 'note:' + note.id + ':' + tail],
      );
      if (item.kind === 'point')
        legacy.push('note:' + note.id + ':' + item.scope + ':' + item.front);
      const card = this.normalize({
        ...item,
        id: key,
        cardKey: key,
        legacyKeys: legacy,
        sourceDeckId: note.id,
        sourceDeckType: 'NOTE',
        sectionId: item.scope,
        subject: note.subject || 'General Study',
        sourceTitle: note.title,
      });
      card.migrationFingerprints = entry?.migrationFingerprint
        ? [entry.migrationFingerprint]
        : [];
      card.contentFingerprint = this.fingerprint(card);
      return card;
    });
  }
  static reviewFits(review, card) {
    return Boolean(
      review &&
        (!review.contentFingerprint ||
          review.contentFingerprint === card.contentFingerprint ||
          card.migrationFingerprints?.includes(review.contentFingerprint)),
    );
  }
  static indexEntries(entries, keyFor) {
    const map = new Map();
    for (const entry of entries) {
      const key = keyFor(entry);
      if (!map.has(key)) map.set(key, { entries: [], cursor: 0 });
      map.get(key).entries.push(entry);
    }
    return map;
  }
  static takeEntry(map, key, used) {
    const queue = map.get(key);
    if (!queue) return null;
    while (queue.cursor < queue.entries.length) {
      const entry = queue.entries[queue.cursor++];
      if (!used.has(entry)) return entry;
    }
    return null;
  }
  static math(tex, display = false) { return window.StudyFormat?.math(tex, display)?.replace('class="study-math"','class="study-math fc-math"') || null; }
  static format(text, options = {}) {
    return window.StudyFormat ? StudyFormat.format(text, options).replaceAll('class="study-math"','class="study-math fc-math"') : SecurityUtils.escapeHtml(String(text ?? '')).replace(/\n/g, '<br>');
  }
  static answerMatches(answer, target) {
    const plain = (value) =>
      String(value ?? '')
        .normalize('NFC')
        .trim()
        .replace(/\u2212/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/(?<=[\p{L}])\.$/u, '');
    const a = plain(answer),
      b = plain(target);
    // Case matters for symbols, chemistry, units and code. Prose can ignore case.
    const technical = (v) => QuizQuality.isTechnicalAnswer(v);
    return (
      a !== '' &&
      (a === b ||
        (!technical(a) &&
          !technical(b) &&
          a.toLocaleLowerCase() === b.toLocaleLowerCase()))
    );
  }
  static cloze(text) {
    const value = this.text(text);
    if (/\{\{|\}\}/.test(value.replace(/\{\{c1::[^{}]+\}\}/g, ''))) return null;
    const match = value.match(/\{\{c1::([^{}]+)\}\}/);
    if (!match) return null;
    return {
      front: value.replace(/\{\{c1::([^{}]+)\}\}/g, '[ … ]'),
      back: value.replace(/\{\{c1::([^{}]+)\}\}/g, '$1'),
      explanation: 'Recall the hidden phrase(s).',
    };
  }
  static csv(raw, { preview = false } = {}) {
    if (typeof raw !== 'string' || raw.length > 2000000)
      throw Error('Use a CSV up to 2 MB.');
    raw = raw.replace(/^\uFEFF/, '');
    const rows = [],
      rowLines = [];
    let line = 1,
      rowLine = 1;
    let row = [],
      field = '',
      quoted = false,
      closed = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '"') {
        if (quoted && raw[i + 1] === '"') {
          field += '"';
          i++;
        } else if (!quoted && field !== '') throw Error('Invalid CSV quoting.');
        else {
          if (quoted) closed = true;
          quoted = !quoted;
        }
      } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
        row.push(field);
        field = '';
        closed = false;
        if (c !== ',') {
          if (c === '\r' && raw[i + 1] === '\n') i++;
          if (row.some((v) => v.trim())) {
            rows.push(row);
            rowLines.push(rowLine);
          }
          row = [];
          line++;
          rowLine = line;
        }
      } else {
        if (closed && !quoted)
          throw Error('Invalid text after a CSV closing quote.');
        field += c;
        if (c === '\n' || (c === '\r' && raw[i + 1] !== '\n')) line++;
      }
    }
    if (quoted) throw Error(`CSV row ${rowLine}: unclosed quote.`);
    row.push(field);
    if (row.some((v) => v.trim())) {
      rows.push(row);
      rowLines.push(rowLine);
    }
    const header = rows[0]?.map((v) => v.trim().toLowerCase());
    const hasHeader =
      header?.[0] === 'front' &&
      header[1] === 'back' &&
      (header.length === 2 ||
        (header.length === 3 && header[2] === 'explanation'));
    if (hasHeader) {
      rows.shift();
      rowLines.shift();
    }
    if (rows.length > 1000)
      throw Error('Import at most 1,000 cards at a time.');
    if (!rows.length)
      throw Error('CSV has no cards. Use front,back,explanation columns.');
    const cards = [],
      errors = [];
    rows.forEach((r, i) => {
      const [front, back, explanation = ''] = r.map((v) => v.trim()),
        row = rowLines[i];
      let reason = '';
      if (r.length < 2 || r.length > 3 || !front || !back)
        reason = 'Enter front, back and optional explanation.';
      else if (
        front.length > 12000 ||
        back.length > 12000 ||
        explanation.length > 20000
      )
        reason =
          'Front/answer must fit 12,000 characters and explanation 20,000.';
      if (reason) {
        if (!preview) throw Error(`CSV row ${row}: ${reason}`);
        errors.push({ row, reason });
      } else cards.push({ front, back, explanation });
    });
    return preview ? { cards, errors } : cards;
  }
  static customIdentity(card) {
    return JSON.stringify([
      QuizQuality.answerIdentity(this.text(card.front)),
      QuizQuality.answerIdentity(this.text(card.back)),
    ]);
  }
}
window.FlashcardTools = FlashcardTools;
