/**
 * HAMSA VIDYA (हंस विद्या) — PDF.js Ingestion & Page Range Text Extractor
 */

// Configure PDF.js Worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
}

class PdfExtractorService {
  constructor() {
    this.currentDoc = null;
    this.currentFile = null;
    this.metadata = null;
  }

  /**
   * Formats file size in bytes to human-readable string (KB / MB)
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    const mb = kb / 1024;
    return mb.toFixed(1) + ' MB';
  }

  /**
   * Loads a PDF file and extracts document metadata
   */
  async loadPdfFile(file) {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js library is not initialized.');
    }

    this.currentFile = file;
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    this.currentDoc = await loadingTask.promise;

    this.metadata = {
      fileName: file.name,
      fileSizeBytes: file.size,
      formattedSize: this.formatFileSize(file.size),
      pageCount: this.currentDoc.numPages
    };

    return this.metadata;
  }

  /**
   * Strictly extracts text from within [fromPage .. toPage]
   * Ensures no text outside this boundary is ingested.
   */
  async extractTextFromPageRange(fromPage, toPage, onProgress = () => {}) {
    if (!this.currentDoc) {
      throw new Error('No PDF document is currently loaded.');
    }

    const totalPages = this.currentDoc.numPages;
    const validFrom = Math.max(1, Math.min(fromPage, totalPages));
    const validTo = Math.max(validFrom, Math.min(toPage, totalPages));

    const pagesToExtract = validTo - validFrom + 1;
    let combinedText = '';
    const extractedPages = [];

    onProgress(0, pagesToExtract, `Starting extraction for pages ${validFrom} to ${validTo}...`);

    for (let pageNum = validFrom; pageNum <= validTo; pageNum++) {
      const pageIndex = pageNum - validFrom + 1;
      onProgress(pageIndex, pagesToExtract, `Extracting text from page ${pageNum} of ${totalPages}...`);

      const page = await this.currentDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Combine text items preserving spacing
      let lastY = null;
      let pageText = '';

      for (const item of textContent.items) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          pageText += '\n';
        } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' ';
        }
        pageText += item.str;
        lastY = item.transform[5];
      }

      const cleanPageText = pageText.trim();
      extractedPages.push({
        pageNumber: pageNum,
        text: cleanPageText
      });

      combinedText += `\n\n--- [PAGE ${pageNum} START] ---\n${cleanPageText}\n--- [PAGE ${pageNum} END] ---\n`;
    }

    onProgress(pagesToExtract, pagesToExtract, `Extracted ${pagesToExtract} pages successfully.`);

    return {
      text: combinedText.trim(),
      extractedPages,
      fromPage: validFrom,
      toPage: validTo,
      totalPages: totalPages,
      fileName: this.metadata ? this.metadata.fileName : 'document.pdf',
      pageCountSelected: pagesToExtract
    };
  }

  /**
   * Reset loaded document
   */
  clear() {
    this.currentDoc = null;
    this.currentFile = null;
    this.metadata = null;
  }
}

// Export singleton instance
window.pdfExtractor = new PdfExtractorService();
