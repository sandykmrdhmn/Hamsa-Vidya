/** PDF ingestion with optional scanned-page OCR and document cleanup. */
if (window.pdfjsLib?.GlobalWorkerOptions && !window.pdfReader) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
class PdfExtractorService {
  static async ensureReader() {
    if(typeof window.pdfReader?.ensure==='function')return window.pdfReader.ensure();
    // A failed/mixed-version HTML load can omit the recovery helper itself.
    // Bootstrap it here so PDF ingestion has no unguarded script dependency.
    if(!this._readerBootstrap) {
      const task=new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=this.readerURL;script.async=true;
        let timer;
        const finish=error=>{
          clearTimeout(timer);script.onload=script.onerror=null;script.remove();
          if(!error && typeof window.pdfReader?.ensure==='function')resolve();
          else reject(new Error('PDF support could not be loaded. Check your connection or local app files, then retry uploading the PDF.'));
        };
        script.onload=()=>finish();script.onerror=()=>finish(true);timer=setTimeout(()=>finish(true),15000);document.head.append(script);
      });
      this._readerBootstrap=task;
      task.then(()=>{if(this._readerBootstrap===task)this._readerBootstrap=null;},()=>{if(this._readerBootstrap===task)this._readerBootstrap=null;});
    }
    await this._readerBootstrap;
    return window.pdfReader.ensure();
  }
  constructor() { this.currentDoc=null;this.currentFile=null;this.metadata=null;this._loadVersion=0;this._textCache=null;this._pageTextCache=new Map();this.READ_TIMEOUT_MS=30000; }
  waitForRead(promise,signal,message) {
    return new Promise((resolve,reject)=>{
      let timer;
      const finish=(error,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
      const cancel=()=>finish(new DOMException('PDF reading cancelled.','AbortError'));
      // Observe the underlying task even when it cancelled synchronously.
      Promise.resolve(promise).then(value=>finish(null,value),error=>finish(error));
      if(signal?.aborted){cancel();return;}
      signal?.addEventListener('abort',cancel,{once:true});
      timer=setTimeout(()=>{const error=new Error(message);error.code='PDF_READ_TIMEOUT';finish(error);},this.READ_TIMEOUT_MS);
    });
  }
  readableText(text) {
    const damaged=(text.match(/[\uFFFD\u0000]/g)||[]).length;
    // A single unsupported glyph must not discard a whole usable page.
    if(damaged && damaged/text.length>0.05)return '';
    return text.replace(/[\uFFFD\u0000]/g,' ').trim();
  }
  formatFileSize(bytes) { return bytes<1024 ? `${bytes} B` : bytes<1048576 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1048576).toFixed(1)} MB`; }
  async loadPdfFile(file, {draftPdfId=null}={}) {
    if(!file || file.size>200*1048576) throw new Error('Choose a PDF up to 200 MB.');
    if(file.type!=='application/pdf' && !/\.pdf$/i.test(file.name||'')) throw new Error('Choose a PDF document.');
    const version=++this._loadVersion;
    let reader;
    try {reader=await PdfExtractorService.ensureReader();}
    catch(error){if(version!==this._loadVersion)throw new DOMException('PDF load cancelled.','AbortError');throw error;}
    if(version!==this._loadVersion) throw new DOMException('PDF load cancelled.','AbortError');
    if(typeof reader?.getDocument!=='function') throw new Error('PDF reader could not be loaded. Check your connection or local app files, then retry uploading the PDF.');
    const bytes=await this.waitForRead(file.arrayBuffer(),null,'PDF file reading took too long. Try uploading the file again.');
    if(version!==this._loadVersion) throw new DOMException('PDF load cancelled.','AbortError');
    const task=reader.getDocument({data:bytes,isEvalSupported:false});
    this._loadingTask?.destroy().catch(()=>{});this._loadingTask=task;
    let doc;
    try {
      doc=await this.waitForRead(task.promise,null,'PDF loading took too long. Retry with this file or a smaller PDF.');
      if(version!==this._loadVersion) { await doc.destroy();throw new DOMException('PDF load cancelled.','AbortError'); }
      const previous=this.currentDoc;this.currentDoc=doc;this.currentFile=file;this._draftPdfId=draftPdfId;this._textCache=null;this._pageTextCache.clear();
      this.metadata={fileName:file.name,fileSizeBytes:file.size,formattedSize:this.formatFileSize(file.size),pageCount:doc.numPages};
      previous?.destroy().catch(()=>{});return this.metadata;
    } catch(error) { if(!doc) await task.destroy().catch(()=>{});throw error; }
    finally { if(this._loadingTask===task) this._loadingTask=null; }
  }
  bindDraftFile(id, file) {
    if(!id || this.currentFile!==file)return false;
    this._draftPdfId=id;return true;
  }
  pageCacheVersion() {
    const model=window.geminiService?.constructor?.DEFAULT_MODEL || 'gemini-3.6-flash';
    return `pdf-text-v1|ocr-study-v1|${model}`;
  }
  async extractTextFromPageRange(fromPage,toPage,onProgress=()=>{}, {signal,ocr=false,skipUnreadable=false,draftPdfId=null,isCurrent=()=>true,jobId=null}={}) {
    const doc=this.currentDoc;if(!doc) throw new Error('Upload a PDF first.');
    if(draftPdfId && this._draftPdfId!==draftPdfId)throw new Error('This PDF does not match the saved quiz draft. Resume from the saved source.');
    const abort=()=>{ if(signal?.aborted || this.currentDoc!==doc || !isCurrent()) throw new DOMException('PDF extraction cancelled.','AbortError'); };
    const from=Math.max(1,Math.min(Math.floor(Number(fromPage)||1),doc.numPages));
    const to=Math.max(from,Math.min(Math.floor(Number(toPage)||from),doc.numPages));
    if(ocr) await window.aiClient?.probeServerKey?.();
    abort();
    const cacheVersion=this.pageCacheVersion();
    if(this._pageCacheDoc!==doc || this._pageCacheVersion!==cacheVersion) {
      this._pageTextCache.clear();this._pageCacheDoc=doc;this._pageCacheVersion=cacheVersion;this._textCache=null;
    }
    const durable=Boolean(draftPdfId && typeof getQuizDraftPages==='function' && typeof saveQuizDraftPage==='function');
    const savedPages=durable ? await getQuizDraftPages(draftPdfId,cacheVersion) : [];
    abort();
    for(const page of savedPages)if(page.pageNumber<=doc.numPages && (page.extractionMethod!=='OCR' || ocr) && this.readableText(page.text))this._pageTextCache.set(page.pageNumber,{...page});
    const savedNumbers=new Set(savedPages.filter(page=>page.extractionMethod!=='OCR' || ocr).map(page=>page.pageNumber));
    const checkpoint=async page=>{
      abort();
      if(!durable || savedNumbers.has(page.pageNumber))return;
      let saved;const startedAt=Date.now();
      try {saved=await saveQuizDraftPage(draftPdfId,cacheVersion,page,signal);}
      catch(error) {abort();const paused=new Error('This page was read, but its recovery checkpoint could not be saved. Free browser storage and continue this draft before reading more scanned pages.');paused.code='PDF_CHECKPOINT_FAILED';throw paused;}
      finally {window.aiClient?.recordStageTiming?.('pdf-page-checkpoint',startedAt,{jobId,pages:1,outcome:saved?'saved':'failed'});}
      abort();if(!saved)throw new DOMException('PDF draft was discarded.','AbortError');
      savedNumbers.add(page.pageNumber);
    };
    const cached=this._textCache;
    if(!durable && cached?.doc===doc && cached.from===from && cached.to===to && cached.ocr===ocr) {
      onProgress(to-from+1,to-from+1,'Reusing the selected PDF pages already read…');abort();
      return JSON.parse(JSON.stringify(cached.result));
    }
    const extractedPages=[],skippedPages=[];let size=0;
    for(let number=from;number<=to;number++) {
      const cachedPage=this._pageTextCache.get(number);
      if(cachedPage && (cachedPage.extractionMethod!=='OCR' || ocr)) {
        abort();size+=cachedPage.text.length;
        if(size>1000000) throw new Error('Selected pages exceed 1 million text characters. Choose a smaller range.');
        await checkpoint(cachedPage);abort();
        window.aiClient?.recordStageTiming?.('pdf-page-cache',Date.now(),{jobId,pages:1,cacheHits:1,outcome:'reused'});
        extractedPages.push({...cachedPage});onProgress(number-from+1,to-from+1,`Reusing page ${number} already read…`);continue;
      }
      abort();onProgress(number-from,to-from+1,`Reading page ${number}…`);
      let page,text='',extractionMethod='TEXT',reason='Page could not be read';
      try {
        page=await this.waitForRead(doc.getPage(number),signal,`PDF page ${number} took too long to load. Choose a smaller range or retry.`);abort();
        let content;
        try {content=await this.waitForRead(page.getTextContent(),signal,`PDF page ${number} took too long to read. Choose a smaller range or retry.`);}
        catch(error) {abort();if(error.name==='AbortError'||error.code==='PDF_READ_TIMEOUT'||!skipUnreadable||!ocr)throw error;content={items:[]};}
        abort();let lastY=null;
        for(const item of content.items) {
          if(typeof item.str!=='string') continue;const y=item.transform?.[5];
          if(lastY!==null && y!==undefined && Math.abs(y-lastY)>5) text+='\n';
          else if(text && !/\s$/.test(text)) text+=' ';
          text+=item.str;if(item.hasEOL) text+='\n';lastY=y;
        }
        text=this.readableText(text);
        reason='No readable text; OCR was not enabled';
        if(!text && ocr) {
          reason='OCR failed or was unavailable';
          if(!window.geminiService?.isAiAvailable()) throw new Error(`Page ${number} needs OCR. Add your API key or choose text pages.`);
          onProgress(number-from,to-from+1,`Reading scanned page ${number} with OCR…`);
          const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,1800/Math.max(base.width,base.height))});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          let render;const cancel=()=>render?.cancel();
          signal?.addEventListener('abort',cancel,{once:true});
          try { render=page.render({canvasContext:canvas.getContext('2d'),viewport});await this.waitForRead(render.promise,signal,`Scanned page ${number} took too long to render. Retry with a smaller PDF.`);abort();const result=await window.geminiService.extractTextFromImage({base64Data:canvas.toDataURL('image/png'),mimeType:'image/png',signal});text=typeof result==='string'?this.readableText(result):'';abort();extractionMethod='OCR'; }
          finally { signal?.removeEventListener('abort',cancel);render?.cancel?.();canvas.width=0;canvas.height=0; }
        }
        if(!text) throw new Error(`Page ${number} has no readable text. Enable scanned-page OCR or exclude blank pages.`);
      } catch(error) {
        abort();if(error.name==='AbortError'||[400,401,403,404,413,429,502].includes(error.status)||['AI_TIMEOUT','AI_UPSTREAM_TIMEOUT','AI_NETWORK_UNCERTAIN','AI_STEP_TIMEOUT','AI_INPUT_BUDGET','PDF_READ_TIMEOUT'].includes(error.code)||!skipUnreadable)throw error;
        skippedPages.push({pageNumber:number,reason});
        onProgress(number-from+1,to-from+1,`Skipped unreadable page ${number}; continuing…`);
        continue;
      } finally {try {page?.cleanup?.();}catch {}}
      size+=text.length;if(size>1000000) throw new Error('Selected pages exceed 1 million text characters. Choose a smaller range.');
      extractedPages.push({pageNumber:number,text,fileName:this.metadata?.fileName||'document.pdf',extractionMethod});
      this._pageTextCache.set(number,{...extractedPages.at(-1)});
      await checkpoint(extractedPages.at(-1));
    }
    abort();
    if(!extractedPages.length&&skipUnreadable) {const error=new Error(`No readable pages remain. Skipped PDF pages: ${skippedPages.map(page=>page.pageNumber).join(', ')}.`);error.skippedPages=skippedPages;throw error;}
    onProgress(to-from+1,to-from+1,`${extractedPages.length} pages read${skippedPages.length?`; ${skippedPages.length} unreadable pages skipped`:''}.`);
    abort();
    const result={text:extractedPages.map(page=>`--- [PAGE ${page.pageNumber} START] ---\n${page.text}\n--- [PAGE ${page.pageNumber} END] ---`).join('\n\n'),extractedPages,skippedPages,fromPage:from,toPage:to,totalPages:doc.numPages,fileName:this.metadata?.fileName||'document.pdf',pageCountSelected:to-from+1};
    // Retry skipped/OCR-failed pages on a later run; cache only full successes.
    if(!skippedPages.length)this._textCache={doc,from,to,ocr,result:JSON.parse(JSON.stringify(result))};
    return result;
  }
  clear() { ++this._loadVersion;this._loadingTask?.destroy().catch(()=>{});this._loadingTask=null;this.currentDoc?.destroy().catch(()=>{});this.currentDoc=null;this.currentFile=null;this._draftPdfId=null;this.metadata=null;this._textCache=null;this._pageTextCache.clear(); }
}
PdfExtractorService.readerURL=new URL('pdf-reader.js?v=20261002-pdf2',document.currentScript?.src || new URL('js/pdf-extractor.js',document.baseURI)).href;
window.pdfExtractor=new PdfExtractorService();
