/** Local source inspection. Files are never uploaded by this viewer. */
class QuizSourceView {
  close() {
    this._version=(this._version||0)+1;
    if(this.dialog?.open)this.dialog.close();
    this.dialog?.remove();this.dialog=null;
    if(this.url)URL.revokeObjectURL(this.url);this.url=null;
  }
  async capture(options) {
    if(options.originalSource)return options.originalSource;
    const source={text:options.sourceType==='PDF'?'':String(options.sourceContent||''),pages:(options.sourcePages||[]).map(p=>({...p})),files:[],importedAt:new Date().toISOString()};
    let file=options._pdfFile;
    if(!(file instanceof Blob) && options.draftPdfId && typeof getQuizDraftFile==='function') {
      try { file=await getQuizDraftFile(options.draftPdfId); }
      catch { app.showToast('Saved draft PDF could not be read. Extracted source text is preserved; reattach the original PDF to inspect it.', 'warning'); }
    }
    if(file instanceof Blob) {
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not save the original PDF. Retry saving.'));reader.readAsDataURL(new Blob([file],{type:'application/pdf'}));});
      source.files=[{name:file.name,type:'application/pdf',size:file.size,data}];
    }
    return source;
  }
  async open(quiz, question, kind='question') {
    if(!quiz || !question)return;
    this.close();
    const version=this._version;
    if(!quiz.originalSource && quiz.draftPdfId) {
      try {quiz={...quiz,originalSource:await this.capture(quiz)};}
      catch {app.showToast('Draft PDF could not be opened; saved evidence is shown.', 'warning');}
      if(version!==this._version)return;
    }
    if(!quiz.originalSource && question.sourceQuizId && question.sourceQuizId!==quiz.id && typeof getQuizWithQuestions==='function') {
      try {const parent=await getQuizWithQuestions(Number(question.sourceQuizId));if(version!==this._version)return;if(parent)quiz={...quiz,originalSource:parent.originalSource,sourceTitle:parent.sourceTitle||parent.title};}
      catch {app.showToast('Could not load the original source; saved evidence is shown.','warning');}
    }
    if(version!==this._version)return;
    const original=quiz.originalSource||{},page=Number(kind==='key'?question.keySourcePage:question.sourcePage)||1;
    const savedPages=original.pages||quiz.sourcePages||[];
    const text=savedPages.filter(p=>Number(p.pageNumber||p.page)===page).map(p=>String(p.text||'')).join('\n\n') || original.text || quiz.sourceContent || (kind==='key'?question.keyEvidenceQuote:question.evidenceQuote) || '';
    const e=SecurityUtils.escapeHtml,title=quiz.sourceTitle||quiz.title||'Saved source';
    const dialog=document.createElement('dialog');dialog.className='quiz-edit-dialog quiz-source-dialog';
    dialog.innerHTML=`<h2>${kind==='key'?'Printed answer key':'Question source'}</h2><p>${e(title)}${question.sourcePage||question.keySourcePage?' · Page '+page:''}</p><div class="quiz-source-file"></div><p class="quiz-source-status">The original file is unavailable. Saved text is shown below.</p><label class="quiz-source-attach">Open original PDF locally<input type="file" accept="application/pdf,.pdf"></label><details open><summary>Saved source text / evidence</summary><pre class="quiz-source-text">${e(text||'This older quiz has no saved source text.')}</pre></details><button type="button" class="btn btn-secondary">Close</button>`;
    this.dialog=dialog;document.body.append(dialog);
    const focus=document.activeElement;
    dialog.querySelector('button').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{if(this.url)URL.revokeObjectURL(this.url);this.url=null;dialog.remove();if(this.dialog===dialog)this.dialog=null;if(focus?.isConnected)focus.focus();},{once:true});
    dialog.querySelector('input').onchange=event=>{
      const file=event.target.files?.[0];if(!file)return;
      if(file.type!=='application/pdf' && !/\.pdf$/i.test(file.name||'')){app.showToast('Choose the original PDF document.','error');return;}
      if(file.size>200*1048576){app.showToast('Choose a PDF up to 200 MB.','error');return;}
      this.showPdf(file,page,dialog,'Locally attached PDF. Confirm that it matches this saved source.');
    };
    const file=(original.files||[]).find(f=>typeof f.data==='string' && /^data:application\/pdf;base64,[A-Za-z0-9+/=\s]+$/.test(f.data));
    if(file){try{const binary=atob(file.data.slice(file.data.indexOf(',')+1));this.showPdf(new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:'application/pdf'}),page,dialog,'Original PDF saved with this quiz.');}catch{app.showToast('Saved PDF could not be opened; choose the original file locally.','warning');}}
    else if(quiz._pdfFile)this.showPdf(quiz._pdfFile,page,dialog,'Original PDF from this generation session.');
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
    dialog.querySelector('button').focus();
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();dialog.close();}});
  }
  showPdf(file,page,dialog,status) {
    if(this.url)URL.revokeObjectURL(this.url);
    this.url=URL.createObjectURL(file);
    const iframe=document.createElement('iframe');iframe.title='Original PDF source';iframe.src=this.url+'#page='+page;
    dialog.querySelector('.quiz-source-file').replaceChildren(iframe);
    dialog.querySelector('.quiz-source-status').textContent=status;
    dialog.querySelector('details').open=false;
  }
}
window.quizSourceView=new QuizSourceView();
