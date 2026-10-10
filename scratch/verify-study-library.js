/** Saved Study Notes library regressions with isolated storage and navigation. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
let passed=0,failed=0;
async function test(name,run){
  const dom=new JSDOM('<div id="view-library"></div>',{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
  const notes=Array.from({length:14},(_,index)=>({id:index+1,title:`Note ${index+1}`,subject:index%2?'History':'Science',sections:[{heading:'Chapter',content:index===13?'LAST_CHAPTER_SENTINEL':'Study material'}],updatedAt:`2026-10-${String(index+1).padStart(2,'0')}`}));
  const actions=[];w.console={log(){},warn(){},error(){}};
  w.UIUtils={buildViewHero:hero=>{w.hero=hero;return '';}};
  w.getAllNotes=async()=>notes;
  w.app={navigate:async view=>actions.push(['navigate',view]),refreshIcons(){}};
  w.studyNotesView={openNote:async id=>actions.push(['note',id]),exportStudyNotesPdf:async id=>actions.push(['pdf',id])};
  w.flashcardsView={loadNotesDeck:async id=>actions.push(['cards',id])};
  w.eval(read('js/sanitizer.js'));w.eval(read('js/views/library.js'));
  try{await run({w,view:w.libraryView,notes,actions});passed++;console.log('PASS '+name);}
  catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}
  finally{w.libraryView.onLeaveView();w.close();}
}
(async()=>{
  await test('Library reads saved notes and paginates without quiz data',async({w,view})=>{
    await view.render();assert.equal(w.hero.stats[0].value,14);assert.equal(view.container.querySelectorAll('article').length,12);
    assert.ok(!/quiz/i.test(view.container.textContent));view.setPage(1);await view.render();assert.equal(view.container.querySelectorAll('article').length,2);
  });
  await test('Search includes final chapter text and subject filters preserve stored notes',async({view,notes})=>{
    view.searchQuery='LAST_CHAPTER_SENTINEL';await view.render();assert.equal(view.container.querySelectorAll('article').length,1);assert.ok(view.container.textContent.includes('Note 14'));
    view.subject='Science';await view.render();assert.equal(view.container.querySelectorAll('article').length,0);assert.equal(notes.length,14);
  });
  await test('Imported titles and chapter text cannot inject markup',async({view,notes})=>{
    notes[0].title='<img src=x onerror="bad()">';notes[0].sections[0].content='<script>bad()</script>';view.selectedSort='OLDEST';await view.render();
    assert.equal(view.container.querySelector('img,script'),null);assert.ok(view.container.textContent.includes('<img'));assert.ok(view.container.textContent.includes('<script>'));
  });
  await test('Read and flashcards actions navigate before opening the saved note',async({view,actions})=>{
    await view.openNote(7);await view.openFlashcards(8);assert.deepEqual(actions,[['navigate','study-notes'],['note',7],['navigate','flashcards'],['cards',8]]);
  });
  await test('A stale load cannot overwrite a newer filtered result',async({w,view,notes})=>{
    let resolve;const held=new Promise(r=>resolve=r);let calls=0;w.getAllNotes=()=>++calls===1?held:Promise.resolve(notes);
    const older=view.render();view.searchQuery='Note 14';await view.render();resolve(notes);await older;
    assert.equal(view.container.querySelectorAll('article').length,1);assert.ok(view.container.textContent.includes('Note 14'));
  });
  await test('Storage failure presents retry without removing saved notes',async({w,view,notes})=>{
    w.getAllNotes=async()=>{throw Error('Unavailable');};await view.render();assert.ok(view.container.querySelector('[role=alert]'));assert.ok(view.container.textContent.includes('Retry'));assert.equal(notes.length,14);
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})();
