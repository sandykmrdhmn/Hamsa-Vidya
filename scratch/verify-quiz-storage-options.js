/** Canonical quiz storage, exam scoring, revision and backup regressions. No AI requests. */
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
let passed = 0, failed = 0;
async function test(label, run) {
  try { await run(); passed++; console.log('PASS ' + label); }
  catch (error) { failed++; console.error('FAIL ' + label + ': ' + error.stack); }
}
function environment() {
  const database = {};
  class Table {
    constructor() { this.rows = []; this.next = 1; }
    async add(row) {
      if (this.failOnAdd) throw Error('Injected card write failure');
      const id = row.id || this.next++;
      this.next = Math.max(this.next, id + 1);
      this.rows.push(clone({...row, id}));
      return id;
    }
    async get(id) { return clone(this.rows.find(row => row.id === id)); }
    async toArray() { return clone(this.rows); }
    async count() { return this.rows.length; }
    async clear() { this.rows = []; }
    async delete(id) { this.rows = this.rows.filter(row => row.id !== id); }
    async bulkPut(rows) {
      for (const row of rows) {
        const index = this.rows.findIndex(item => item.id === row.id);
        if (index < 0) await this.add(row); else this.rows[index] = clone(row);
      }
    }
    where(key) { return {equals:value => this.collection(this.rows.filter(row => row[key] === value))}; }
    filter(predicate) { return this.collection(this.rows.filter(predicate)); }
    collection(rows) {
      return {toArray:async () => clone(rows), count:async () => rows.length, delete:async () => {
        const ids = new Set(rows.map(row => row.id)); this.rows = this.rows.filter(row => !ids.has(row.id)); return ids.size;
      }};
    }
  }
  database.version = number => ({stores:definitions => {
    database.verno = number;
    for (const [name, schema] of Object.entries(definitions)) if (schema !== null && !database[name]) database[name] = new Table();
    return {upgrade(){}};
  }});
  database.isOpen = () => true;
  database.transaction = async (...args) => {
    const run = args.pop(), snapshots = new Map();
    for (const table of args.flat()) if (table?.rows) snapshots.set(table, {rows:clone(table.rows), next:table.next});
    try { return await run(); }
    catch (error) { for (const [table, snapshot] of snapshots) Object.assign(table, snapshot); throw error; }
  };
  function Dexie() { return database; }
  const storage = new Map();
  let backup;
  const sandbox = {Dexie, console:{warn(){},error(){}}, setTimeout, clearTimeout, Blob,
    UIUtils:{toDateKey:() => '2026-10-09', downloadJson:value => {backup = clone(value);}},
    localStorage:{getItem:key => storage.get(key) ?? null, setItem:(key,value) => storage.set(key,String(value)), removeItem:key => storage.delete(key)}};
  sandbox.window = sandbox;
  vm.createContext(sandbox); new vm.Script(source, {filename:'db.js'}).runInContext(sandbox);
  return {w:sandbox, db:database, storage, backup:() => backup};
}
const quiz = extra => ({title:'Bilingual mathematics', difficulty:'MIXED', language:'BILINGUAL', model:'fixture-model',
  source:{type:'TOPIC', text:'Algebra and code'}, subject:'Mathematics', chapter:'Algebra', exam:'Custom',
  createdAt:'2026-10-09T09:00:00.000Z', questions:Array.from({length:4},(_,index) => ({
    question:`Question ${index + 1}: choose the expression / व्यंजक चुनें`, options:['+1','-1','x+1','x-1'], answerIndex:index,
    explanation:'Algebra preserves the operator / चिह्न से अर्थ बदलता है।', difficulty:['EASY','MEDIUM','HARD','EASY'][index],
    topic:'Expressions', sourcePage:null, optionExplanations:['Positive unit','Negative unit','Add one to x','Subtract one from x']
  })), ...extra});
const attempt = extra => ({answers:[0,0,null,3], completedAt:'2026-10-09T09:05:00.000Z', ...extra});
const bookmark = key => ({...quiz().questions[0], key, quizTitle:'Source quiz', savedAt:'2026-10-09T09:03:00.000Z'});
async function main() {
  await test('Bilingual and mixed quizzes retain study context and option reasons', async () => {
    const {w} = environment(), saved = await w.quizStore.save(quiz());
    assert.equal(saved.language, 'BILINGUAL'); assert.equal(saved.difficulty, 'MIXED');
    assert.equal(saved.chapter, 'Algebra'); assert.equal(saved.exam, 'Custom');
    assert.deepEqual(clone((await w.quizStore.get(saved.id)).questions), clone(saved.questions));
  });
  await test('Scan provenance survives saved quiz backup and malformed page references are rejected', async () => {
    const {w,db,backup} = environment(), value = quiz({source:{type:'PDF',fileName:'Scanned study.pdf',fromPage:1,toPage:3,pageCount:3,ocrPages:[1,3],excerptedPages:[3]}});
    value.questions.forEach((question,index) => {question.sourcePage = index % 3 + 1;});
    const saved = await w.quizStore.save(value);
    assert.deepEqual(clone(saved.source.ocrPages),[1,3]);
    for (const ocrPages of [[0],[4],[1,1],['1'],new Array(1),{page:1}]) {
      const invalid = clone(value); invalid.source.ocrPages = ocrPages;
      await assert.rejects(w.quizStore.save(invalid), /scanned PDF page references/i);
    }
    const topic = quiz(); topic.source.ocrPages = [1];
    await assert.rejects(w.quizStore.save(topic), /scanned PDF page references/i);
    assert.equal(db.pdfQuizzes.rows.length,1);
    await w.exportDatabaseBackup(); const restored = environment();
    await restored.w.importDatabaseBackup(JSON.stringify(backup()));
    assert.deepEqual(clone(restored.db.pdfQuizzes.rows[0].source.ocrPages),[1,3]);
    assert.deepEqual(clone(restored.db.pdfQuizzes.rows[0].source.excerptedPages),[3]);
  });
  await test('Mathematical signs, decimal points and code case remain distinct options', async () => {
    const {w} = environment();
    for (const options of [['+1','-1','x+1','x-1'], ['1.2','12','x','X'], ['a.b','ab','1/2','12']]) {
      const value = quiz(); value.questions[0].options = options; await w.quizStore.save(value);
    }
    for (const options of [['x',' x ','a','b'], ['a','b','!!!','d'], ['１','1','2','3']]) {
      const value = quiz(); value.questions[0].options = options; await assert.rejects(w.quizStore.save(value), /duplicate|options/i);
    }
  });
  await test('Old attempts retain count scores and get compatible exam defaults', async () => {
    const {w} = environment(), saved = await w.quizStore.save(quiz()), result = await w.quizStore.saveAttempt(saved.id, attempt({score:999,correct:999,totalQuestions:999}));
    assert.equal(result.correct,2); assert.equal(result.incorrect,1); assert.equal(result.skipped,1); assert.equal(result.score,2);
    assert.equal(result.totalQuestions,4); assert.equal(result.percentage,50); assert.equal(result.maxMarks,4);
    assert.equal(result.settings.negativeMarks,0); assert.equal(result.mode,'PRACTICE');
  });
  await test('Targeted revision scores canonical answers only within selected original indices', async () => {
    const {w} = environment(), saved = await w.quizStore.save(quiz());
    const data = attempt({answers:[null,0,null,3], questionIndices:[1,2,3], questionOrder:[3,1,2], optionOrder:Array.from({length:4},() => [3,1,0,2]),
      confidence:['HIGH','LOW',null,'MEDIUM'], marked:[1], mode:'EXAM', settings:{durationMinutes:30,marksPerQuestion:2,negativeMarks:0.5,shuffleQuestions:true,shuffleOptions:true,presetId:'SSC'}});
    const result = await w.quizStore.saveAttempt(saved.id,data);
    assert.equal(result.correct,1); assert.equal(result.incorrect,1); assert.equal(result.skipped,1); assert.equal(result.totalQuestions,3);
    assert.equal(result.score,1.5); assert.equal(result.maxMarks,6); assert.equal(result.marksPercentage,25); assert.equal(result.percentage,33);
    assert.equal(result.accuracy,50); assert.deepEqual(clone(result.answers),data.answers);
    assert.deepEqual(clone(result.questionOrder),[3,1,2]); assert.deepEqual(clone(result.optionOrder[0]),[3,1,0,2]);
    data.answers[1] = 1; data.optionOrder[0][0] = 0; data.confidence[1] = 'HIGH';
    const stored = (await w.quizStore.listAttempts(saved.id))[0];
    assert.equal(stored.answers[1],0); assert.equal(stored.optionOrder[0][0],3); assert.equal(stored.confidence[1],'LOW');
  });
  await test('Repeated result saves with an attempt key produce one attempt', async () => {
    const {w} = environment(), saved = await w.quizStore.save(quiz()), first = await w.quizStore.saveAttempt(saved.id,attempt({attemptKey:'attempt-1'}));
    const repeated = await w.quizStore.saveAttempt(saved.id,attempt({attemptKey:'attempt-1',answers:[3,3,3,3]}));
    assert.equal(repeated.id,first.id); assert.equal(repeated.score,first.score); assert.equal((await w.quizStore.listAttempts(saved.id)).length,1);
    await w.quizStore.saveAttempt(saved.id,attempt({attemptKey:'attempt-2'})); assert.equal((await w.quizStore.listAttempts(saved.id)).length,2);
  });
  await test('Revision parent IDs and both timer expiry states survive attempt storage', async () => {
    const {w} = environment(), saved = await w.quizStore.save(quiz()), parent = await w.quizStore.saveAttempt(saved.id,attempt());
    for (const expired of [true,false]) {
      const result = await w.quizStore.saveAttempt(saved.id,attempt({answers:[null,0,null,null],questionIndices:[1],parentAttemptId:parent.id,expired}));
      assert.equal(result.parentAttemptId,parent.id); assert.equal(result.expired,expired);
      const stored = (await w.quizStore.listAttempts(saved.id)).find(row => row.id === result.id);
      assert.equal(stored.parentAttemptId,parent.id); assert.equal(stored.expired,expired);
    }
  });
  await test('Invalid revision parent IDs and nonboolean timer expiry flags never become attempts', async () => {
    const {w,db} = environment(), saved = await w.quizStore.save(quiz());
    for (const parentAttemptId of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'1',{}]) {
      await assert.rejects(w.quizStore.saveAttempt(saved.id,attempt({parentAttemptId})), /parent attempt/i);
    }
    for (const expired of [0,1,'true',[],{}]) {
      await assert.rejects(w.quizStore.saveAttempt(saved.id,attempt({expired})), /expiry flag/i);
    }
    assert.equal(db.pdfQuizAttempts.rows.length,0);
  });
  await test('Revision rejects nonnull answers outside its canonical question subset', async () => {
    const {w,db} = environment(), saved = await w.quizStore.save(quiz());
    await assert.rejects(w.quizStore.saveAttempt(saved.id,attempt({questionIndices:[1,2,3]})), /outside this revision/i);
    await assert.rejects(w.quizStore.saveAttempt(saved.id,attempt({answers:[0,0,null,3],questionIndices:[0,1]})), /outside this revision/i);
    assert.equal(db.pdfQuizAttempts.rows.length,0);
    const result = await w.quizStore.saveAttempt(saved.id,attempt({answers:[null,0,null,null],questionIndices:[1]}));
    assert.deepEqual(clone(result.answers),[null,0,null,null]); assert.equal(result.totalQuestions,1);
  });
  await test('Malformed subsets, permutations, confidence, modes and settings never become attempts', async () => {
    const {w,db} = environment(), saved = await w.quizStore.save(quiz());
    const bad = [{answers:Array(4)}, {questionIndices:[]}, {questionIndices:[1,1]}, {questionIndices:[4]},
      {questionIndices:[1],questionOrder:[0]}, {questionOrder:[0,1,2]}, {optionOrder:[[0,1,2,2],[0,1,2,3],[0,1,2,3],[0,1,2,3]]},
      {confidence:[null,null,null,'SURE']}, {confidence:[null]}, {marked:[4]}, {marked:[0,0]}, {mode:'INVALID'},
      {settings:{durationMinutes:721}}, {settings:{marksPerQuestion:0}}, {settings:{negativeMarks:-1}},
      {settings:{negativeMarks:2,marksPerQuestion:1}}, {settings:{shuffleOptions:'true'}}, {settings:[]}, {attemptKey:''}];
    for (const data of bad) await assert.rejects(w.quizStore.saveAttempt(saved.id,attempt(data)));
    assert.equal(db.pdfQuizAttempts.rows.length,0);
  });
  await test('Option explanation and question metadata bounds are validated before saving', async () => {
    const {w,db} = environment();
    for (const mutate of [value => value.subject = 'x'.repeat(121), value => value.questions[0].optionExplanations = ['short'],
      value => value.questions[0].optionExplanations[0] = '', value => value.questions[0].topic = 'x'.repeat(121), value => value.questions[0].difficulty = 'MIXED']) {
      const value = quiz(); mutate(value); await assert.rejects(w.quizStore.save(value));
    }
    assert.equal(db.pdfQuizzes.rows.length,0);
  });
  await test('Flashcard conversion uses canonical answers and reuses the same selected question set', async () => {
    const {w,db} = environment(), saved = await w.quizStore.save(quiz());
    const tampered = clone(saved); tampered.questions[0].answerIndex = 3;
    const first = await w.quizStore.convertToFlashcards(tampered,[3,0]), repeated = await w.quizStore.convertToFlashcards(saved,[0,3]);
    assert.equal(first.count,2); assert.equal(first.reused,false); assert.equal(repeated.reused,true); assert.equal(first.deckId,repeated.deckId);
    assert.equal(db.customDecks.rows.length,1); assert.equal(db.customCards.rows.length,2);
    assert.equal(db.customCards.rows[0].back,'+1'); assert.match(db.customCards.rows[0].explanation,/Option explanations/);
    assert.equal(db.customCards.rows[1].back,'x-1'); assert.equal(db.customCards.rows[1].sourceQuestionIndex,3);
    await assert.rejects(w.quizStore.convertToFlashcards(saved,[])); await assert.rejects(w.quizStore.convertToFlashcards(quiz(),[0]));
  });
  await test('A card write failure rolls back both the converted deck and all cards', async () => {
    const {w,db} = environment(), saved = await w.quizStore.save(quiz()); db.customCards.failOnAdd = true;
    await assert.rejects(w.quizStore.convertToFlashcards(saved,[0,1]), /Injected/);
    assert.equal(db.customDecks.rows.length,0); assert.equal(db.customCards.rows.length,0); assert.equal(db.pdfQuizzes.rows.length,1);
  });
  await test('Portable backup restores weighted attempts, metadata and independent bookmarks', async () => {
    const {w,storage,backup} = environment(), saved = await w.quizStore.save(quiz());
    await w.quizStore.saveAttempt(saved.id,attempt({answers:[0,0,null,null],questionIndices:[0,1],settings:{marksPerQuestion:2,negativeMarks:0.5},attemptKey:'portable',parentAttemptId:1,expired:true}));
    storage.set('hamsa_saved_questions_v1',JSON.stringify([bookmark('saved-one')]));
    await w.exportDatabaseBackup(); const payload = backup();
    assert.equal(JSON.parse(payload.preferences.hamsa_saved_questions_v1).length,1);
    payload.tables.pdfQuizAttempts[0].score = 999; payload.tables.pdfQuizAttempts[0].maxMarks = 999;
    await w.importDatabaseBackup(JSON.stringify(payload));
    const result = (await w.quizStore.listAttempts(saved.id))[0]; assert.equal(result.score,1.5); assert.equal(result.maxMarks,4);
    assert.equal(result.attemptKey,'portable'); assert.equal(result.questionIndices.length,2);
    assert.equal(result.parentAttemptId,1); assert.equal(result.expired,true);
    assert.equal((await w.quizStore.get(saved.id)).questions[0].optionExplanations.length,4);
    assert.equal(JSON.parse(storage.get('hamsa_saved_questions_v1'))[0].optionExplanations.length,4);
  });
  await test('Backup MERGE remaps converted quiz decks and unions existing bookmarks', async () => {
    const original = environment(), saved = await original.w.quizStore.save(quiz());
    await original.w.quizStore.convertToFlashcards(saved,[0,2]);
    original.storage.set('hamsa_saved_questions_v1',JSON.stringify([bookmark('incoming')]));
    await original.w.exportDatabaseBackup();
    const target = environment(); await target.w.quizStore.save(quiz({title:'Existing'}));
    target.storage.set('hamsa_saved_questions_v1',JSON.stringify([bookmark('existing')]));
    await target.w.importDatabaseBackup(JSON.stringify(original.backup()),{mode:'MERGE'});
    const incoming = (await target.w.quizStore.list()).find(value => value.title === saved.title);
    const converted = await target.w.quizStore.convertToFlashcards(incoming,[2,0]);
    assert.equal(converted.reused,true); assert.equal(target.db.customDecks.rows.length,1);
    assert.equal(target.db.customDecks.rows[0].sourceQuizId,incoming.id); assert.equal(target.db.customCards.rows[0].deckId,converted.deckId);
    assert.equal(JSON.parse(target.storage.get('hamsa_saved_questions_v1')).length,2);
  });
  await test('Bookmark-only backups work and malformed bookmark snapshots are excluded', async () => {
    const {w,storage} = environment();
    const payload = {formatVersion:3,tables:{},preferences:{hamsa_saved_questions_v1:JSON.stringify([bookmark('valid'),{key:'bad',question:'Bad',options:['a'],answerIndex:8}])}};
    const preview = await w.inspectDatabaseBackup(JSON.stringify(payload)); assert.equal(preview.savedQuestionsCount,1);
    const report = await w.importDatabaseBackup(JSON.stringify(payload)); assert.equal(report.savedQuestionsRestored,1);
    assert.equal(JSON.parse(storage.get('hamsa_saved_questions_v1')).length,1);
    await assert.rejects(w.importDatabaseBackup(JSON.stringify({preferences:{hamsa_saved_questions_v1:'not JSON'}})), /recognisable/);
  });
  await test('Quiz reset deletes bookmarks and preserves flashcards, notes and credentials', async () => {
    const {w,db,storage} = environment(), saved = await w.quizStore.save(quiz());
    await w.quizStore.saveAttempt(saved.id,attempt()); await w.quizStore.convertToFlashcards(saved,[0]); await db.notes.add({title:'Keep note'});
    storage.set('hamsa_saved_questions_v1',JSON.stringify([bookmark('valid')])); storage.set('hamsa_gemini_api_key','private');
    const removed = await w.clearModuleData('QUIZ'); assert.equal(removed.savedQuestions,1);
    assert.equal(storage.has('hamsa_saved_questions_v1'),false); assert.equal(db.pdfQuizzes.rows.length,0); assert.equal(db.pdfQuizAttempts.rows.length,0);
    assert.equal(db.customDecks.rows.length,1); assert.equal(db.notes.rows.length,1); assert.equal(storage.get('hamsa_gemini_api_key'),'private');
    storage.set('hamsa_saved_questions_v1',JSON.stringify([bookmark('new')])); await w.clearDatabase();
    assert.equal(storage.has('hamsa_saved_questions_v1'),false);
  });
  await test('Failed quiz resets preserve both database rows and bookmark snapshots', async () => {
    const {w,db,storage} = environment(), saved = await w.quizStore.save(quiz());
    await w.quizStore.saveAttempt(saved.id,attempt());
    const bookmarks = JSON.stringify([bookmark('preserve')]); storage.set('hamsa_saved_questions_v1',bookmarks);
    const remove = w.localStorage.removeItem;
    w.localStorage.removeItem = () => {throw Error('Storage blocked');};
    await assert.rejects(w.clearModuleData('QUIZ'),/Storage blocked/);
    assert.equal(db.pdfQuizzes.rows.length,1); assert.equal(db.pdfQuizAttempts.rows.length,1); assert.equal(storage.get('hamsa_saved_questions_v1'),bookmarks);
    w.localStorage.removeItem = remove;
    const transaction = db.transaction;
    db.transaction = async (...args) => {
      const operation = args.pop();
      return transaction(...args,async () => {await operation();throw Error('Commit refused');});
    };
    await assert.rejects(w.clearModuleData('QUIZ'),/Commit refused/);
    assert.equal(db.pdfQuizzes.rows.length,1); assert.equal(db.pdfQuizAttempts.rows.length,1); assert.equal(storage.get('hamsa_saved_questions_v1'),bookmarks);
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch(error => {console.error(error);process.exitCode = 1;});
