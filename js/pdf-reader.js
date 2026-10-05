/** Resolve the local PDF.js dependency and recover a failed initial script load. */
(() => {
  const scriptURL = document.currentScript?.src || new URL('js/pdf-reader.js', document.baseURI).href;
  const libraryURL = new URL('../assets/vendor/pdf.min.js', scriptURL).href;
  const workerURL = new URL('../assets/vendor/pdf.worker.min.js?v=20261002-pdf2', scriptURL).href;
  let activeWorkerURL = workerURL;
  let pending = null;

  function resolveReader() {
    const reader = typeof window.pdfjsLib?.getDocument === 'function'
      ? window.pdfjsLib : window['pdfjs-dist/build/pdf'];
    if (typeof reader?.getDocument !== 'function') return null;
    if (reader.version && reader.version !== '3.11.174') return null;
    window.pdfjsLib = reader;
    if (reader.GlobalWorkerOptions) reader.GlobalWorkerOptions.workerSrc = activeWorkerURL;
    return reader;
  }

  function loadReader() {
    const ready = resolveReader();
    if (ready) return Promise.resolve(ready);
    if (pending) return pending;
    const task = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // The initial script may have come from a stale HTTP/SW cache. A fresh
      // request must escape that cache, with a cached fallback when offline.
      const freshLibrary = new URL(libraryURL), freshWorker = new URL(workerURL);
      const retry = String(Date.now());
      freshLibrary.searchParams.set('pdf-refresh', retry);
      freshWorker.searchParams.set('pdf-refresh', retry);
      activeWorkerURL = freshWorker.href;
      script.src = freshLibrary.href;
      script.async = true;
      let timer;
      const finish = error => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        script.remove();
        const reader = !error && resolveReader();
        if (reader) resolve(reader);
        else reject(new Error('PDF reader could not be loaded. Check your connection or local app files, then retry uploading the PDF.'));
      };
      script.onload = () => finish();
      script.onerror = () => finish(true);
      timer = setTimeout(() => finish(true), 15000);
      document.head.append(script);
    });
    pending = task;
    task.then(() => { if (pending === task) pending = null; }, () => { if (pending === task) pending = null; });
    return task;
  }

  window.pdfReader = { ensure: loadReader };
  resolveReader();
})();
