/** Flashcard storage. Source cards and saved schedules share stable keys. */
async function getFlashcardLibrary() {
  const [notes, customDecks, customCards, reviews] =
    await Promise.all([
      db.notes.toArray(),
      db.customDecks.toArray(),
      db.customCards.toArray(),
      db.cardReviews.toArray(),
    ]);
  for (const note of notes) {
    const prepared = FlashcardTools.prepareNote(note);
    if (
      JSON.stringify(note.flashcardIds) !==
      JSON.stringify(prepared.flashcardIds)
    ) {
      await db.notes.update(note.id, { flashcardIds: prepared.flashcardIds });
      note.flashcardIds = prepared.flashcardIds;
    }
  }
  const dm = new Map(customDecks.map((d) => [d.id, d]));
  const cards = [
    ...notes.flatMap((n) => FlashcardTools.noteCards(n)),
    ...customCards
      .filter((c) => dm.has(c.deckId))
      .map((c) => FlashcardTools.customCard(c, dm.get(c.deckId))),
  ].filter(Boolean);
  const byKey = new Map();
  for (const card of cards) {
    byKey.set(card.cardKey, card);
    for (const key of card.legacyKeys || [])
      if (!byKey.has(key)) byKey.set(key, card);
  }
  const latest = new Map();
  for (const review of reviews) {
    const card = byKey.get(review.cardKey);
    if (!card) continue;
    const prev = latest.get(card.cardKey);
    if (
      !prev ||
      String(review.lastReviewedAt || '') > String(prev.lastReviewedAt || '') ||
      (review.lastReviewedAt === prev.lastReviewedAt && review.id > prev.id)
    )
      latest.set(card.cardKey, review);
  }
  for (const card of cards) {
    const review = latest.get(card.cardKey);
    card.srs = FlashcardTools.reviewFits(review, card) ? review : null;
    card.changed = Boolean(review && !card.srs);
  }
  const counts = new Map();
  for (const card of cards) {
    const key = card.sourceDeckType + ':' + card.sourceDeckId;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const now = new Date(),
    today = FlashcardTools.localDate(now);
  return {
    cards,
    notes: notes.map((n) => ({
      ...n,
      cardCount: counts.get('NOTE:' + n.id) || 0,
    })),
    customDecks: customDecks.map((d) => ({
      ...d,
      cardCount: counts.get('CUSTOM:' + d.id) || 0,
    })),
    due: cards
      .filter((c) => c.changed || (c.srs && FlashcardTools.due(c.srs, now)))
      .sort(
        (a, b) =>
          Number(a.changed) - Number(b.changed) ||
          (FlashcardTools.reviewTime(a.srs) || 0) -
            (FlashcardTools.reviewTime(b.srs) || 0),
      ),
    newCards: cards.filter((c) => !c.srs),
    learning: cards.filter((c) => c.srs?.state === 'LEARNING'),
    reviewedToday: cards.filter(
      (c) =>
        c.srs?.lastReviewedAt &&
        FlashcardTools.localDate(new Date(c.srs.lastReviewedAt)) === today,
    ).length,
  };
}
async function cleanupFlashcardReviews() {
  return db.transaction(
    'rw',
    db.cardReviews,
    db.customCards,
    db.customDecks,
    db.notes,
    async () => {
      const library = await getFlashcardLibrary(),
        byKey = new Map(),
        rows = await db.cardReviews.toArray(),
        groups = new Map();
      for (const card of library.cards) {
        byKey.set(card.cardKey, card);
        for (const alias of card.legacyKeys || [])
          if (!byKey.has(alias)) byKey.set(alias, card);
      }
      for (const row of rows) {
        const card = byKey.get(row.cardKey);
        if (!card) {
          // Retired source schedules stay in archived backups; removing a
          // feature must not erase existing browser data during normal render.
          if (/^q:\d+$/.test(String(row.cardKey || ''))) continue;
          await db.cardReviews.delete(row.id);
          continue;
        }
        if (!groups.has(card.cardKey)) groups.set(card.cardKey, []);
        groups.get(card.cardKey).push({ row, card });
      }
      for (const [key, group] of groups) {
        group.sort(
          (a, b) =>
            String(b.row.lastReviewedAt || '').localeCompare(
              String(a.row.lastReviewedAt || ''),
            ) || b.row.id - a.row.id,
        );
        const { row, card } = group[0];
        await db.cardReviews.update(row.id, {
          cardKey: key,
          deckId: String(card.sourceDeckId),
          deckType: card.sourceDeckType,
        });
        for (const old of group.slice(1))
          await db.cardReviews.delete(old.row.id);
      }
    },
  );
}
async function getFlashcardByKey(key) {
  if (typeof key !== 'string') return null;
  const match = key.match(/^custom:(\d+)$/);
  if (match) {
    const id = FlashcardTools.id(match[1]);
    if (!id) return null;
    const c = await db.customCards.get(id);
    if (!c) return null;
    const deck = await db.customDecks.get(c.deckId);
    return deck ? FlashcardTools.customCard(c, deck) : null;
  }
  const noteId = key.match(/^note(?:_|:)(\d+):/)?.[1];
  if (!noteId) return null;
  const raw = await db.notes.get(Number(noteId));
  if (!raw) return null;
  const note = FlashcardTools.prepareNote(raw);
  if (JSON.stringify(raw.flashcardIds) !== JSON.stringify(note.flashcardIds))
    await db.notes.update(raw.id, { flashcardIds: note.flashcardIds });
  return (
    FlashcardTools.noteCards(note).find(
      (c) => c.cardKey === key || c.legacyKeys.includes(key),
    ) || null
  );
}
async function saveCardReviewProgress(
  cardKey,
  deckId,
  deckType,
  rating,
  options = {},
) {
  if (![1, 2, 3, 4].includes(rating)) throw Error('Invalid rating.');
  return db.transaction(
    'rw',
    db.cardReviews,
    db.customCards,
    db.customDecks,
    db.notes,
    async () => {
      const card = await getFlashcardByKey(cardKey);
      if (!card)
        throw Error('This card changed or was deleted. Reload the deck.');
      if (
        options.fingerprint &&
        options.fingerprint !== card.contentFingerprint
      )
        throw Error('This card changed. Reload before rating it.');
      const keys = new Set([card.cardKey, ...(card.legacyKeys || [])]),
        previous = await db.cardReviews
          .filter((r) => keys.has(r.cardKey))
          .toArray();
      previous.sort(
        (a, b) =>
          String(b.lastReviewedAt || '').localeCompare(
            String(a.lastReviewedAt || ''),
          ) || b.id - a.id,
      );
      const existing = previous[0];
      if (options.token && existing?.operationToken === options.token)
        return { ...existing, undoSnapshot: existing.undoSnapshot || [] };
      const baseline = FlashcardTools.reviewFits(existing, card)
        ? existing
        : null;
      const record = {
        ...FlashcardTools.schedule(baseline, rating),
        firstLearnedAt:
          baseline?.firstLearnedAt ||
          baseline?.lastReviewedAt ||
          new Date().toISOString(),
        cardKey: card.cardKey,
        deckId: String(card.sourceDeckId),
        deckType: card.sourceDeckType,
        contentFingerprint: card.contentFingerprint,
        operationToken: options.token || crypto.randomUUID(),
        undoSnapshot: previous.map(({ undoSnapshot, ...r }) => r),
      };
      if (existing) {
        record.id = existing.id;
        await db.cardReviews.put(record);
        for (const old of previous.slice(1))
          await db.cardReviews.delete(old.id);
      } else record.id = await db.cardReviews.add(record);
      return record;
    },
  );
}
async function undoCardReviewProgress(record) {
  return db.transaction('rw', db.cardReviews, async () => {
    const current = await db.cardReviews.get(record.id);
    if (!current || current.operationToken !== record.operationToken)
      throw Error('A newer review exists. Its schedule has been kept.');
    await db.cardReviews.delete(record.id);
    for (const previous of record.undoSnapshot || [])
      await db.cardReviews.put(previous);
  });
}
async function getCardReviewProgress(key) {
  const card = await getFlashcardByKey(key);
  if (!card) return null;
  const keys = new Set([card.cardKey, ...(card.legacyKeys || [])]);
  const records = await db.cardReviews
    .filter((r) => keys.has(r.cardKey))
    .toArray();
  records.sort(
    (a, b) =>
      String(b.lastReviewedAt || '').localeCompare(
        String(a.lastReviewedAt || ''),
      ) || b.id - a.id,
  );
  const r = records[0];
  return FlashcardTools.reviewFits(r, card) ? r : null;
}
async function getCardReviewsForDeck(id, type) {
  if (!['NOTE', 'CUSTOM'].includes(type)) return [];
  return db.cardReviews
    .filter((r) => String(r.deckId) === String(id) && r.deckType === type)
    .toArray();
}
async function getAllDueCards() {
  return (await getFlashcardLibrary()).due;
}
async function getDueCardsCount() {
  return (await getAllDueCards()).length;
}
async function createCustomDeck(meta) {
  const title = FlashcardTools.text(meta.title),
    subject = FlashcardTools.text(meta.subject) || 'General Study';
  if (!title || title.length > 200 || subject.length > 120)
    throw Error('Enter a title up to 200 characters and subject up to 120.');
  const now = new Date().toISOString();
  return db.customDecks.add({
    title,
    subject,
    description: FlashcardTools.text(meta.description).slice(0, 2000),
    createdAt: now,
    updatedAt: now,
  });
}
async function updateCustomDeck(id, meta) {
  if (
    !FlashcardTools.text(meta.title) ||
    meta.title.length > 200 ||
    FlashcardTools.text(meta.subject).length > 120
  )
    throw Error('Check the deck title and subject.');
  const count = await db.customDecks.update(Number(id), {
    title: meta.title.trim(),
    subject: FlashcardTools.text(meta.subject) || 'General Study',
    description: FlashcardTools.text(meta.description).slice(0, 2000),
    updatedAt: new Date().toISOString(),
  });
  if (!count) throw Error('Deck no longer exists.');
}
async function getAllCustomDecks() {
  const decks = await db.customDecks.toArray(),
    cards = await db.customCards.toArray();
  return decks
    .sort((a, b) => b.id - a.id)
    .map((d) => ({
      ...d,
      cardCount: cards.filter((c) => c.deckId === d.id).length,
    }));
}
async function getCustomDeckWithCards(id) {
  const deck = await db.customDecks.get(Number(id));
  return deck
    ? {
        ...deck,
        cards: await db.customCards
          .where('deckId')
          .equals(Number(id))
          .toArray(),
      }
    : null;
}
function validateCustomCard(data) {
  const front = FlashcardTools.text(data.front),
    back = FlashcardTools.text(data.back),
    explanation = FlashcardTools.text(data.explanation);
  if (
    !front ||
    !back ||
    front.length > 12000 ||
    back.length > 12000 ||
    explanation.length > 20000
  )
    throw Error(
      'Enter front and back up to 12,000 characters; explanation up to 20,000.',
    );
  return {
    front,
    back,
    explanation,
    badge: FlashcardTools.text(data.badge) || 'Custom Card',
  };
}
async function importCustomCards(deckId, cards) {
  if (!Array.isArray(cards) || !cards.length || cards.length > 1000)
    throw Error('Add between 1 and 1,000 cards.');
  const normalized = cards.map(validateCustomCard);
  return db.transaction('rw', db.customDecks, db.customCards, async () => {
    const id = FlashcardTools.id(deckId);
    if (!id || !(await db.customDecks.get(id)))
      throw Error('Deck no longer exists.');
    const existing = await db.customCards.where('deckId').equals(id).toArray();
    const identity = (c) => FlashcardTools.customIdentity(c);
    const seen = new Set(existing.map(identity));
    let added = 0,
      duplicates = 0,
      lastId;
    for (const card of normalized) {
      const key = identity(card);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      lastId = await db.customCards.add({
        ...card,
        deckId: id,
        createdAt: new Date().toISOString(),
      });
      added++;
    }
    await db.customDecks.update(id, { updatedAt: new Date().toISOString() });
    return { added, duplicates, lastId };
  });
}
async function addCustomCard(data) {
  const result = await importCustomCards(data.deckId, [data]);
  if (!result.added)
    throw Error('This front and answer already exist in this deck.');
  return result.lastId;
}
async function updateCustomCard(id, data) {
  const card = validateCustomCard(data);
  return db.transaction(
    'rw',
    db.customCards,
    db.customDecks,
    db.cardReviews,
    async () => {
      const old = await db.customCards.get(Number(id));
      if (!old) throw Error('Card no longer exists.');
      const rows = await db.customCards
        .where('deckId')
        .equals(old.deckId)
        .toArray();
      if (
        rows.some(
          (c) =>
            c.id !== old.id &&
            FlashcardTools.customIdentity(c) ===
              FlashcardTools.customIdentity(card),
        )
      )
        throw Error('Duplicate card in this deck.');
      await db.customCards.update(old.id, {
        ...card,
        updatedAt: new Date().toISOString(),
      });
      if (
        old.front !== card.front ||
        old.back !== card.back ||
        old.explanation !== card.explanation
      )
        await db.cardReviews
          .where('cardKey')
          .equals(`custom:${old.id}`)
          .delete();
      await db.customDecks.update(old.deckId, {
        updatedAt: new Date().toISOString(),
      });
    },
  );
}
async function deleteCustomCard(id) {
  await db.transaction(
    'rw',
    db.customCards,
    db.customDecks,
    db.cardReviews,
    async () => {
      const old = await db.customCards.get(Number(id));
      await db.customCards.delete(Number(id));
      await db.cardReviews
        .where('cardKey')
        .equals(`custom:${Number(id)}`)
        .delete();
      if (old)
        await db.customDecks.update(old.deckId, {
          updatedAt: new Date().toISOString(),
        });
    },
  );
  discardFlashcardDrafts(['card:' + Number(id)]);
}
async function deleteCustomDeck(id) {
  const drafts = [
    'deck:' + Number(id),
    'add:' + Number(id),
    'import:' + Number(id),
  ];
  await db.transaction(
    'rw',
    db.customDecks,
    db.customCards,
    db.cardReviews,
    async () => {
      const cards = await db.customCards
        .where('deckId')
        .equals(Number(id))
        .toArray();
      const keys = new Set(cards.map((c) => `custom:${c.id}`));
      drafts.push(...cards.map((c) => 'card:' + c.id));
      await db.cardReviews
        .filter(
          (r) =>
            keys.has(r.cardKey) ||
            (r.deckType === 'CUSTOM' && String(r.deckId) === String(id)),
        )
        .delete();
      await db.customCards.where('deckId').equals(Number(id)).delete();
      await db.customDecks.delete(Number(id));
    },
  );
  discardFlashcardDrafts(drafts);
}
function discardFlashcardDrafts(keys) {
  try {
    const drafts = JSON.parse(
      localStorage.getItem('hamsa_flashcard_drafts') || '{}',
    );
    for (const key of keys) delete drafts[key];
    localStorage.setItem('hamsa_flashcard_drafts', JSON.stringify(drafts));
  } catch {
    /* Deleting saved data must not fail if draft storage is unavailable. */
  }
}
