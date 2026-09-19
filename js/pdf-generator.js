/**
 * HAMSA VIDYA (हंस विद्या) — Native High-Fidelity A4 PDF Generator
 * Supports 100% authentic Hindi (Devanagari), English, and Bilingual text with zero font corruption.
 * Uses html2pdf.js (with html2canvas + jsPDF) and native browser print-to-PDF.
 */

class PdfGeneratorService {
  /**
   * Generates an authentic A4 HTML Document string for the Question Paper & Answer Key
   */
  buildDocumentHtml(quiz, questions) {
    const letters = ['(A)', '(B)', '(C)', '(D)'];
    const maxTime = Math.max(5, Math.round(questions.length * 1.5));
    const todayStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const questionsHtml = questions.map((q, idx) => `
      <div style="page-break-inside: avoid; margin-bottom: 16px; padding: 8px 12px; background: #fafafa; border: 1px solid #e5e7eb; border-radius: 6px;">
        <div style="font-weight: 700; font-size: 13.5px; color: #111827; margin-bottom: 8px; line-height: 1.5;">
          Q${idx + 1}. ${q.questionText}
        </div>
        <div style="display: grid; grid-template-columns: 1fr; gap: 6px; font-size: 12.5px; color: #374151; padding-left: 8px;">
          ${(q.options || []).map((opt, optIdx) => `
            <div style="display: flex; gap: 8px; align-items: baseline;">
              <span style="font-weight: 700; color: #4f46e5; min-width: 24px;">${letters[optIdx] || `(${optIdx + 1})`}</span>
              <span style="line-height: 1.45;">${opt}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    const answerTableRows = questions.map((q, idx) => {
      const correctLetter = letters[q.correctAnswerIndex] || '(A)';
      const correctOptionText = q.options && q.options[q.correctAnswerIndex] ? q.options[q.correctAnswerIndex] : '';
      const sourceRef = q.sourcePage ? `Page ${q.sourcePage}` : 'Study Material';
      return `
        <tr style="border-bottom: 1px solid #e5e7eb; background: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
          <td style="padding: 6px 10px; font-weight: 700; color: #4f46e5; border-right: 1px solid #e5e7eb; width: 60px;">Q${idx + 1}</td>
          <td style="padding: 6px 10px; font-weight: 600; color: #065f46; border-right: 1px solid #e5e7eb;">
            <span style="background: #d1fae5; padding: 2px 6px; border-radius: 4px; margin-right: 6px;">${correctLetter}</span>
            ${correctOptionText}
          </td>
          <td style="padding: 6px 10px; color: #6b7280; font-size: 11.5px; width: 110px;">${sourceRef}</td>
        </tr>
      `;
    }).join('');

    const explanationsHtml = questions.map((q, idx) => {
      const correctLetter = letters[q.correctAnswerIndex] || '(A)';
      return `
        <div style="page-break-inside: avoid; margin-bottom: 14px; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 700; font-size: 13px; color: #4f46e5;">
              Question ${idx + 1} Answer: Option ${correctLetter}
            </span>
            ${q.sourcePage ? `<span style="font-size: 11px; color: #64748b; font-style: italic;">Verified Reference: Page ${q.sourcePage}</span>` : ''}
          </div>
          <div style="font-size: 12px; color: #334155; line-height: 1.55;">
            ${q.explanation || 'No detailed conceptual explanation provided.'}
          </div>
        </div>
      `;
    }).join('');

    const studentName = (window.examProfileManager && window.examProfileManager.getStudentName()) || 'Scholar';

    return `
      <div id="hamsa-printable-paper" style="font-family: 'Noto Sans Devanagari', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #ffffff; width: 100%; max-width: 800px; margin: 0 auto; line-height: 1.5; padding: 20px 24px;">
        <!-- Running Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #4f46e5; padding-bottom: 6px; margin-bottom: 16px; font-size: 11px; color: #6b7280;">
          <div style="font-weight: 700; color: #4f46e5; display: flex; align-items: center; gap: 6px;">
            <span>🪿 HAMSA VIDYA (हंस विद्या)</span>
            <span>•</span>
            <span>AI Generated Examination Paper</span>
          </div>
          <div>${todayStr} • Candidate: <strong>${studentName}</strong></div>
        </div>

        <!-- Document Header Box -->
        <div style="background: #4f46e5; color: #ffffff; padding: 14px 18px; border-radius: 8px; margin-bottom: 14px;">
          <h1 style="font-size: 18px; font-weight: 800; margin: 0 0 4px 0; letter-spacing: -0.01em; text-transform: uppercase;">
            ${quiz.title || 'Mastery Examination Paper'}
          </h1>
          <div style="font-size: 12px; color: #e0e7ff; display: flex; gap: 14px; flex-wrap: wrap;">
            <span><strong>Candidate:</strong> ${studentName}</span>
            <span><strong>Subject:</strong> ${quiz.subject || 'General'}</span>
            <span><strong>Difficulty:</strong> ${quiz.difficulty || 'MEDIUM'}</span>
            <span><strong>Mode:</strong> ${quiz.quizMode || 'PRACTICE'}</span>
            <span><strong>Language:</strong> ${quiz.language || 'English'}</span>
          </div>
        </div>

        <!-- Instructions Meta Box -->
        <div style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 11.5px; color: #374151;">
          <div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 4px;">
            <span>Total Questions: ${questions.length}</span>
            <span>Time Allowed: ${maxTime} Minutes</span>
            <span>Maximum Marks: ${questions.length}</span>
          </div>
          <div style="color: #6b7280; font-style: italic;">
            Instructions: All questions are compulsory. Select the most appropriate option. There is no negative marking.
          </div>
        </div>

        <!-- SECTION I: QUESTION PAPER -->
        <div style="margin-bottom: 24px;">
          <div style="background: #e0e7ff; color: #3730a3; padding: 6px 12px; border-radius: 4px; font-weight: 800; font-size: 13px; margin-bottom: 14px; letter-spacing: 0.04em;">
            SECTION I — MULTIPLE CHOICE QUESTIONS (${questions.length} MCQs)
          </div>
          ${questionsHtml}
        </div>

        <!-- Page Break for Answer Key -->
        <div style="page-break-before: always; height: 1px; margin-top: 20px;"></div>

        <!-- SECTION II: OFFICIAL ANSWER KEY & DETAILED EXPLANATIONS -->
        <div style="margin-top: 20px;">
          <div style="background: #d1fae5; color: #065f46; padding: 6px 12px; border-radius: 4px; font-weight: 800; font-size: 13px; margin-bottom: 14px; letter-spacing: 0.04em;">
            SECTION II — OFFICIAL ANSWER KEY & DETAILED EXPLANATIONS
          </div>

          <!-- Answer Key Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background: #4f46e5; color: #ffffff; text-align: left;">
                <th style="padding: 8px 10px; font-weight: 700;">#</th>
                <th style="padding: 8px 10px; font-weight: 700;">Official Answer Key</th>
                <th style="padding: 8px 10px; font-weight: 700;">Source Page</th>
              </tr>
            </thead>
            <tbody>
              ${answerTableRows}
            </tbody>
          </table>

          <!-- Detailed Explanations -->
          <div style="font-weight: 700; font-size: 14px; color: #1f2937; margin-bottom: 10px;">
            Detailed Conceptual Explanations:
          </div>
          ${explanationsHtml}
        </div>

        <!-- Running Footer -->
        <div style="border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 24px; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af;">
          <span>Hamsa Vidya (हंस विद्या) • AI Wisdom & Quiz Companion</span>
          <span>Sharpen Your Intellect • Confidential Study Material</span>
        </div>
      </div>
    `;
  }

  /**
   * Generates and downloads a complete A4 Question Paper PDF with 100% Hindi/English font fidelity
   */
  async generateQuestionPaperPdf(quiz, questions) {
    const cleanFileName = (quiz.title || 'hamsa-vidya-quiz')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');

    const htmlContent = this.buildDocumentHtml(quiz, questions);

    // Create a temporary offscreen container
    const container = document.createElement('div');
    container.id = 'temp-pdf-render-container';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    try {
      if (window.html2pdf) {
        const opt = {
          margin: [10, 10, 10, 10], // 10mm margins
          filename: `${cleanFileName}-question-paper.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            logging: false
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        };

        const targetEl = container.querySelector('#hamsa-printable-paper');
        await window.html2pdf().set(opt).from(targetEl).save();
      } else {
        // Fallback to print preview window
        this.openPrintWindow(htmlContent);
      }
    } catch (err) {
      console.warn('html2pdf failed, falling back to print dialog:', err);
      this.openPrintWindow(htmlContent);
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  }

  /**
   * Opens clean Print Window with full vector text for native 'Save as PDF'
   */
  openPrintWindow(htmlContent) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Hamsa Vidya - Question Paper</title>
        <meta charset="UTF-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            font-family: 'Noto Sans Devanagari', 'Inter', sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="position: fixed; top: 10px; right: 10px; z-index: 9999; display: flex; gap: 8px; background: rgba(0,0,0,0.85); padding: 8px 12px; border-radius: 8px;">
          <button onclick="window.print()" style="background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 700; cursor: pointer;">
            🖨️ Save as PDF / Print
          </button>
          <button onclick="window.close()" style="background: #374151; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">
            Close
          </button>
        </div>
        ${htmlContent}
        <script>
          setTimeout(() => { window.print(); }, 800);
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  /**
   * Generates a professionally designed Digital Textbook Study Booklet PDF
   */
  exportStudyNotesBookletPdf(note) {
    const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const sections = note.sections || [];
    const glossary = note.glossaryTerms || [];
    const words = note.metadata?.wordCount || (note.content ? note.content.split(/\s+/).length : 500);
    const readTime = note.metadata?.readingTimeMin || Math.max(1, Math.ceil(words / 200));

    const tocHtml = sections.map((sec, idx) => `
      <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px;">
        <span style="font-weight: 600; color: #1e293b;">${sec.heading || `Section ${idx + 1}`}</span>
        <span style="color: #64748b; font-style: italic;">${sec.subheading || ''}</span>
      </div>
    `).join('');

    const sectionsHtml = sections.map((sec, idx) => `
      <div style="margin-bottom: 24px; page-break-inside: auto;">
        <h2 style="font-size: 16px; font-weight: 800; color: #4338ca; border-bottom: 2px solid #e0e7ff; padding-bottom: 6px; margin-top: 20px; margin-bottom: 10px;">
          ${sec.heading || `Section ${idx + 1}`}
        </h2>
        ${sec.subheading ? `<div style="font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 10px; text-transform: uppercase;">${sec.subheading}</div>` : ''}

        <div style="font-size: 13px; line-height: 1.75; color: #334155; margin-bottom: 14px; white-space: pre-wrap;">
          ${sec.content || ''}
        </div>

        ${sec.keyPoints && sec.keyPoints.length > 0 ? `
          <div style="page-break-inside: avoid; background: #f5f3ff; border-left: 4px solid #6366f1; border-radius: 6px; padding: 12px 16px; margin-bottom: 14px;">
            <div style="font-size: 12px; font-weight: 800; color: #4f46e5; text-transform: uppercase; margin-bottom: 6px;">📌 Core Key Points</div>
            <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.6; color: #312e81;">
              ${sec.keyPoints.map(kp => `<li>${kp}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${sec.definitions && sec.definitions.length > 0 ? `
          <div style="page-break-inside: avoid; background: #f0fdf4; border-left: 4px solid #10b981; border-radius: 6px; padding: 12px 16px; margin-bottom: 14px;">
            <div style="font-size: 12px; font-weight: 800; color: #065f46; text-transform: uppercase; margin-bottom: 6px;">📖 Key Definitions</div>
            ${sec.definitions.map(def => `
              <div style="margin-bottom: 6px; font-size: 12.5px;">
                <strong style="color: #047857;">${def.term}:</strong> <span style="color: #064e3b;">${def.definition}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${sec.importantFacts && sec.importantFacts.length > 0 ? `
          <div style="page-break-inside: avoid; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 12px 16px; margin-bottom: 14px;">
            <div style="font-size: 12px; font-weight: 800; color: #92400e; text-transform: uppercase; margin-bottom: 6px;">⚡ Important Exam Facts</div>
            <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #78350f;">
              ${sec.importantFacts.map(fact => `<li>${fact}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${sec.formulas && sec.formulas.length > 0 ? `
          <div style="page-break-inside: avoid; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px;">
            <div style="font-size: 12px; font-weight: 800; color: #334155; text-transform: uppercase; margin-bottom: 6px;">📐 Formulas & Mathematical Relations</div>
            ${sec.formulas.map(f => `
              <div style="margin-bottom: 8px;">
                <div style="font-weight: 700; color: #1e293b; font-size: 12.5px;">${f.name}</div>
                <div style="font-family: monospace; background: #ffffff; border: 1px solid #e2e8f0; padding: 4px 8px; border-radius: 4px; font-size: 13px; color: #2563eb; margin: 4px 0;">
                  ${f.formula}
                </div>
                <div style="font-size: 11.5px; color: #64748b;">${f.explanation}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${sec.examples && sec.examples.length > 0 ? `
          ${sec.examples.map(ex => `
            <div style="page-break-inside: avoid; background: #fdf4ff; border-left: 4px solid #c084fc; border-radius: 6px; padding: 12px 16px; margin-bottom: 14px;">
              <div style="font-size: 12px; font-weight: 800; color: #7e22ce; text-transform: uppercase; margin-bottom: 4px;">💡 Example: ${ex.title}</div>
              <div style="font-size: 12.5px; line-height: 1.6; color: #581c87; margin-bottom: 6px;">${ex.content}</div>
              ${ex.stepByStep ? `
                <div style="font-size: 11.5px; font-weight: 700; color: #7e22ce;">Step-by-step breakdown:</div>
                <ul style="margin: 4px 0 6px; padding-left: 18px; font-size: 12px; color: #6b21a8;">
                  ${ex.stepByStep.map(s => `<li>${s}</li>`).join('')}
                </ul>
              ` : ''}
              ${ex.realWorldAnalogy ? `
                <div style="font-size: 11.5px; color: #9333ea; font-style: italic;">Analogy: ${ex.realWorldAnalogy}</div>
              ` : ''}
            </div>
          `).join('')}
        ` : ''}
      </div>
    `).join('');

    const glossaryHtml = glossary.length > 0 ? `
      <div style="page-break-before: auto; margin-top: 30px; border-top: 2px solid #cbd5e1; padding-top: 16px;">
        <h2 style="font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">🔤 Interactive Smart Glossary & Reference Index</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          ${glossary.map(g => `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 12px;">
              <div style="font-weight: 700; color: #3b82f6;">${g.term}</div>
              <div style="color: #475569; margin: 2px 0;">${g.simpleMeaning}</div>
              ${g.hindiMeaning ? `<div style="color: #10b981; font-weight: 600;">${g.hindiMeaning}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    const fullHtml = `
      <div style="font-family: 'Noto Sans Devanagari', 'Inter', sans-serif; max-width: 820px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <!-- Running Header -->
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; margin-bottom: 20px; font-size: 11px; color: #64748b;">
          <span style="font-weight: 700; color: #4f46e5;">HAMSA VIDYA (हंस विद्या) • AI Digital Textbook</span>
          <span>Printed: ${todayStr}</span>
        </div>

        <!-- Cover Title Box -->
        <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #c7d2fe; margin-bottom: 6px;">
            ${note.subject || 'General Studies'} • Comprehensive Textbook Study Module
          </div>
          <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 8px 0; line-height: 1.3;">
            ${note.title}
          </h1>
          <div style="font-size: 12px; color: #e0e7ff; display: flex; gap: 16px; flex-wrap: wrap;">
            <span>📖 ${sections.length} Sections</span>
            <span>📝 ~${words} Words</span>
            <span>⏱️ ~${readTime} Min Read</span>
          </div>
        </div>

        <!-- Table of Contents -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: 800; color: #334155; text-transform: uppercase; margin-bottom: 8px;">📚 Table of Contents</div>
          ${tocHtml}
        </div>

        <!-- Structured Chapters -->
        ${sectionsHtml}

        <!-- Glossary Index -->
        ${glossaryHtml}

        <!-- Running Footer -->
        <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center; font-size: 10px; color: #94a3b8;">
          Hamsa Vidya Knowledge Vault • Sharpen Your Intellect • Page 1
        </div>
      </div>
    `;

    this.openPrintWindow(fullHtml);
  }

  /**
   * Generates a Printable Quiz PDF with question stems and answer blanks
   */
  exportPrintableQuizPdf(quiz, questions) {
    const letters = ['(A)', '(B)', '(C)', '(D)'];
    const todayStr = new Date().toLocaleDateString();

    const questionsHtml = questions.map((q, idx) => `
      <div style="page-break-inside: avoid; margin-bottom: 18px; padding: 12px 16px; background: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-weight: 700; font-size: 13.5px; color: #0f172a;">Q${idx + 1}. ${q.questionText}</span>
          <span style="font-size: 11px; color: #64748b; border: 1px dashed #cbd5e1; padding: 2px 8px; border-radius: 4px;">Candidate Answer: [ &nbsp;&nbsp;&nbsp; ]</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12.5px; padding-left: 8px;">
          ${(q.options || []).map((opt, optIdx) => `
            <div style="display: flex; gap: 6px;">
              <span style="font-weight: 700; color: #4f46e5;">${letters[optIdx]}</span>
              <span>${opt}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    const html = `
      <div style="font-family: 'Noto Sans Devanagari', 'Inter', sans-serif; max-width: 820px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; margin-bottom: 16px; font-size: 11px; color: #64748b;">
          <span style="font-weight: 700; color: #4f46e5;">HAMSA VIDYA • Practice Examination Paper</span>
          <span>Date: ${todayStr}</span>
        </div>
        <div style="background: #4f46e5; color: white; padding: 16px 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="font-size: 18px; font-weight: 800; margin: 0 0 6px 0;">${quiz.title || 'Practice Quiz'}</h1>
          <div style="font-size: 12px; color: #e0e7ff;">Total Questions: ${questions.length} • Marking: +1 / -0.33 • Duration: ${Math.round(questions.length * 1.5)} Mins</div>
        </div>
        ${questionsHtml}
      </div>
    `;

    this.openPrintWindow(html);
  }

  /**
   * Generates a Printable Answer Key PDF with rationale
   */
  exportQuizAnswerKeyPdf(quiz, questions) {
    const letters = ['(A)', '(B)', '(C)', '(D)'];
    const todayStr = new Date().toLocaleDateString();

    const rows = questions.map((q, idx) => {
      const correctLetter = letters[q.correctAnswerIndex] || '(A)';
      const optText = q.options ? q.options[q.correctAnswerIndex] : '';
      return `
        <div style="page-break-inside: avoid; border-bottom: 1px solid #e2e8f0; padding: 10px 0;">
          <div style="font-weight: 700; font-size: 13px; color: #1e293b; margin-bottom: 4px;">
            Q${idx + 1}. Correct Answer: <span style="color: #10b981;">Option ${correctLetter}</span> (${optText})
          </div>
          <div style="font-size: 12px; color: #475569; line-height: 1.55;">${q.explanation || 'No explanation.'}</div>
        </div>
      `;
    }).join('');

    const html = `
      <div style="font-family: 'Noto Sans Devanagari', 'Inter', sans-serif; max-width: 820px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #10b981; padding-bottom: 8px; margin-bottom: 16px; font-size: 11px; color: #64748b;">
          <span style="font-weight: 700; color: #10b981;">HAMSA VIDYA • Official Answer Key & Explanations</span>
          <span>Date: ${todayStr}</span>
        </div>
        <h1 style="font-size: 18px; font-weight: 800; color: #065f46; margin-bottom: 16px;">${quiz.title} — Verified Answer Key</h1>
        ${rows}
      </div>
    `;

    this.openPrintWindow(html);
  }

  /**
   * Generates a 1-page High-Yield Revision Cheat-Sheet PDF
   */
  exportSummarySheetPdf(note) {
    const summary = note.summary;
    const todayStr = new Date().toLocaleDateString();

    const html = `
      <div style="font-family: 'Noto Sans Devanagari', 'Inter', sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #10b981; padding-bottom: 6px; margin-bottom: 16px; font-size: 11px; color: #64748b;">
          <span style="font-weight: 700; color: #10b981;">HAMSA VIDYA • High-Yield Revision Cheat-Sheet</span>
          <span>${todayStr}</span>
        </div>
        <div style="background: #065f46; color: white; padding: 14px 18px; border-radius: 8px; margin-bottom: 16px;">
          <div style="font-size: 11px; text-transform: uppercase; color: #a7f3d0;">${note.subject || 'General'} Revision Module</div>
          <h1 style="font-size: 18px; font-weight: 800; margin: 2px 0 0 0;">${note.title}</h1>
        </div>

        ${summary ? `
          <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 14px; margin-bottom: 14px;">
            <div style="font-size: 12px; font-weight: 800; color: #065f46; text-transform: uppercase; margin-bottom: 6px;">💡 Core Concept</div>
            <div style="font-size: 13px; line-height: 1.6; color: #064e3b;">${summary.coreConcept || ''}</div>
          </div>

          <div style="background: #faf5ff; border: 1.5px solid #d8b4fe; border-radius: 8px; padding: 14px; margin-bottom: 14px;">
            <div style="font-size: 12px; font-weight: 800; color: #6b21a8; text-transform: uppercase; margin-bottom: 6px;">📌 5 High-Yield Key Takeaways</div>
            <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.6; color: #581c87;">
              ${(summary.takeaways || []).map(t => `<li>${t}</li>`).join('')}
            </ul>
          </div>

          ${summary.examTraps && summary.examTraps.length > 0 ? `
            <div style="background: #fff1f2; border: 1.5px solid #fecdd3; border-radius: 8px; padding: 14px; margin-bottom: 14px;">
              <div style="font-size: 12px; font-weight: 800; color: #9f1239; text-transform: uppercase; margin-bottom: 6px;">⚠️ Common Exam Pitfalls & Traps to Avoid</div>
              <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.6; color: #881337;">
                ${summary.examTraps.map(trap => `<li>${trap}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${summary.finalTakeaway ? `
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #475569; font-style: italic;">
              ${summary.finalTakeaway}
            </div>
          ` : ''}
        ` : `
          <div style="font-size: 13px; color: #475569;">${note.content}</div>
        `}
      </div>
    `;

    this.openPrintWindow(html);
  }

  async generateAnswerWritingReportPdf(arg1 = {}, arg2 = {}, arg3 = '', arg4 = 'BILINGUAL') {
    let question = '', directive = 'Discuss', studentAnswer = '', wordLimit = 150, marks = 10, exam = 'UPSC', subject = 'General Studies', evaluation = {}, languageMode = 'BILINGUAL';

    if (arg1 && typeof arg1 === 'object' && ('evaluation' in arg1 || 'question' in arg1)) {
      question = arg1.question || '';
      directive = arg1.directive || 'Discuss';
      studentAnswer = arg1.studentAnswer || '';
      wordLimit = arg1.wordLimit || 150;
      marks = arg1.marks || 10;
      exam = arg1.exam || 'UPSC';
      subject = arg1.subject || 'General Studies';
      evaluation = arg1.evaluation || {};
      languageMode = arg1.languageMode || 'BILINGUAL';
    } else {
      evaluation = arg1 || {};
      const qObj = typeof arg2 === 'object' ? arg2 : { question: String(arg2 || '') };
      question = qObj.question || '';
      directive = qObj.directive || 'Discuss';
      studentAnswer = typeof arg3 === 'string' ? arg3 : '';
      wordLimit = qObj.wordLimit || 150;
      marks = qObj.marks || 10;
      exam = qObj.exam || 'UPSC';
      subject = qObj.subject || 'General Studies';
      languageMode = typeof arg4 === 'string' ? arg4 : 'BILINGUAL';
    }

    const studentName = (window.examProfileManager && window.examProfileManager.getStudentName()) || 'Scholar';
    const todayStr = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const ev = evaluation || {};
    
    // Markdown Helper for PDF
    const renderMd = (text) => {
      if (!text) return '';
      try {
        if (window.marked && window.SecurityUtils && window.SecurityUtils.sanitizeHtml) {
          return window.SecurityUtils.sanitizeHtml(window.marked.parse(text));
        }
        return SecurityUtils.escapeHtml(text);
      } catch (e) {
        return text;
      }
    };

    const sc = ev.scores || { overall: 7.0, content: 7.0, structure: 7.0, relevance: 7.0, analysis: 6.5, language: 7.5, presentation: 7.0 };
    const overallScore = Number(sc.overall || 7.0).toFixed(1);
    const wordCount = (studentAnswer || '').trim().split(/\s+/).filter(Boolean).length;

    let bandText = "Competitive Interview Zone";
    let bandColor = "#059669";
    if (Number(overallScore) >= 8.0) {
      bandText = "Topper Benchmark (Top 5%)";
      bandColor = "#d97706";
    } else if (Number(overallScore) < 6.0) {
      bandText = "Needs Structural Revision";
      bandColor = "#dc2626";
    }

    const showEnglish = languageMode === 'BILINGUAL' || languageMode === 'ENGLISH';
    const showHindi = languageMode === 'BILINGUAL' || languageMode === 'HINDI';

    // Build Strengths HTML
    const strengths = ev.bilingualStrengths && ev.bilingualStrengths.length > 0 
      ? ev.bilingualStrengths 
      : (ev.strengths || []).map(s => ({ en: s, hi: '' }));

    const strengthsHtml = strengths.map((st, i) => `
      <div style="margin-bottom: 8px; padding-left: 14px; position: relative;">
        <span style="position: absolute; left: 0; top: 2px; color: #059669; font-weight: bold;">✓</span>
        ${showEnglish && st.en ? `<div style="font-weight: 600; color: #1e293b; font-size: 11.5px;">${renderMd(st.en)}</div>` : ''}
        ${showHindi && st.hi ? `<div style="color: #475569; font-size: 11px; margin-top: 2px;">• ${renderMd(st.hi)}</div>` : ''}
      </div>
    `).join('');

    // Build Weaknesses HTML
    const weaknesses = ev.bilingualWeaknesses && ev.bilingualWeaknesses.length > 0
      ? ev.bilingualWeaknesses
      : (ev.weaknesses || []).map(w => ({ en: w, hi: '' }));

    const weaknessesHtml = weaknesses.map((w, i) => `
      <div style="margin-bottom: 8px; padding-left: 14px; position: relative;">
        <span style="position: absolute; left: 0; top: 2px; color: #d97706; font-weight: bold;">→</span>
        ${showEnglish && w.en ? `<div style="font-weight: 600; color: #1e293b; font-size: 11.5px;">${renderMd(w.en)}</div>` : ''}
        ${showHindi && w.hi ? `<div style="color: #475569; font-size: 11px; margin-top: 2px;">• ${renderMd(w.hi)}</div>` : ''}
      </div>
    `).join('');

    // Build Missing Dimensions Table Rows
    const missingDims = ev.bilingualMissingDimensions || ev.missingDimensions || [];
    const missingDimsHtml = missingDims.map((d, i) => `
      <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="padding: 8px 10px; font-weight: 700; color: #4338ca; width: 35%;">
          ${showEnglish ? `<div>${d.dimension || ''}</div>` : ''}
          ${showHindi && d.dimensionHi ? `<div style="font-size: 10.5px; color: #64748b; font-weight: 500;">${d.dimensionHi}</div>` : ''}
        </td>
        <td style="padding: 8px 10px; color: #334155; font-size: 11.5px; line-height: 1.45;">
          ${showEnglish ? `<div>${renderMd(d.details || '')}</div>` : ''}
          ${showHindi && d.detailsHi ? `<div style="color: #475569; font-size: 11px; margin-top: 2px;">${renderMd(d.detailsHi)}</div>` : ''}
        </td>
      </tr>
    `).join('');

    // Build Improvement Steps
    const steps = ev.bilingualImprovementSteps || (ev.improvementSteps || []).map(s => ({ stepEn: s, stepHi: '' }));
    const stepsHtml = steps.map(s => `
      <div style="margin-bottom: 8px; padding: 6px 10px; background: #f8fafc; border-left: 3px solid #4f46e5; border-radius: 4px;">
        ${showEnglish && s.stepEn ? `<div style="font-weight: 600; color: #1e293b; font-size: 11.5px;">${renderMd(s.stepEn)}</div>` : ''}
        ${showHindi && s.stepHi ? `<div style="color: #475569; font-size: 11px; margin-top: 2px;">${renderMd(s.stepHi)}</div>` : ''}
      </div>
    `).join('');

    // Flowchart diagram nodes
    const diag = ev.visualDiagram || null;
    let diagramHtml = '';
    if (diag && diag.nodes) {
      diagramHtml = `
        <div style="page-break-inside: avoid; margin-top: 16px; margin-bottom: 16px; padding: 12px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; font-weight: 800; color: #4338ca; text-transform: uppercase;">
              📊 Suggested Exam Flowchart / Conceptual Schematic (${diag.titleEn || ''})
            </span>
            <span style="font-size: 10px; color: #64748b;">Exam Sheet Blueprint</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(${diag.nodes.length}, 1fr); gap: 6px; margin-bottom: 8px;">
            ${diag.nodes.map((n, idx) => `
              <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; text-align: center;">
                <div style="background: #e0e7ff; color: #3730a3; font-size: 9px; font-weight: 800; border-radius: 3px; padding: 1px 4px; display: inline-block; margin-bottom: 4px;">
                  Step ${n.step || (idx + 1)}: ${showHindi && n.badgeHi ? n.badgeHi : n.badgeEn}
                </div>
                <div style="font-weight: 700; font-size: 10.5px; color: #1e293b; line-height: 1.25;">
                  ${showHindi && n.titleHi ? n.titleHi : n.titleEn}
                </div>
                <div style="font-size: 9.5px; color: #64748b; margin-top: 3px; line-height: 1.2;">
                  ${showHindi && n.descHi ? n.descHi : n.descEn}
                </div>
              </div>
            `).join('')}
          </div>
          <div style="font-size: 10px; color: #475569; font-style: italic; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">
            <strong>Drawing Tip for UPSC Answer Sheet:</strong> ${showHindi && diag.examSheetTipHi ? diag.examSheetTipHi : diag.examSheetTipEn}
          </div>
        </div>
      `;
    }

    const htmlContent = `
      <div id="hamsa-evaluation-report-paper" style="font-family: 'Noto Sans Devanagari', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #ffffff; width: 100%; max-width: 820px; margin: 0 auto; line-height: 1.5; padding: 24px;">
        
        <!-- Header Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; margin-bottom: 14px;">
          <div>
            <div style="font-size: 16px; font-weight: 800; color: #4f46e5; display: flex; align-items: center; gap: 6px;">
              <span>🪿 HAMSA VIDYA (हंस विद्या)</span>
              <span style="color: #94a3b8; font-weight: 400;">|</span>
              <span style="font-size: 13px; color: #1e293b;">UPSC & State PSC Assessment Cell</span>
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
              Master Civil Services Descriptive Answer Evaluation & Diagnostic Report
            </div>
          </div>
          <div style="text-align: right; font-size: 11px; color: #475569;">
            <div>Report Date: <strong>${todayStr}</strong></div>
            <div>Candidate: <strong>${studentName}</strong></div>
          </div>
        </div>

        <!-- Examination Metadata Banner -->
        <div style="background: #1e1b4b; color: #ffffff; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 11px;">
          <div>
            <span style="color: #a5b4fc; display: block; font-size: 9.5px; text-transform: uppercase;">Examination</span>
            <strong>${exam} Civil Services (Mains)</strong>
          </div>
          <div>
            <span style="color: #a5b4fc; display: block; font-size: 9.5px; text-transform: uppercase;">Subject / Paper</span>
            <strong>${subject}</strong>
          </div>
          <div>
            <span style="color: #a5b4fc; display: block; font-size: 9.5px; text-transform: uppercase;">Directive & Marks</span>
            <strong>${directive} • ${marks} Marks</strong>
          </div>
          <div>
            <span style="color: #a5b4fc; display: block; font-size: 9.5px; text-transform: uppercase;">Word Economy Audit</span>
            <strong>${wordCount} / ${wordLimit} words (${Math.round((wordCount / (wordLimit || 1)) * 100)}%)</strong>
          </div>
        </div>

        <!-- Question Box -->
        <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px;">
          <div style="font-size: 10px; font-weight: 800; color: #4f46e5; text-transform: uppercase; margin-bottom: 4px;">
            Question Statement [Target Word Limit: ${wordLimit} words | Marks: ${marks}]
          </div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.45;">
            ${question}
          </div>
        </div>

        <!-- Examiner Score Matrix -->
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; margin-bottom: 16px;">
          <div style="background: #f1f5f9; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1;">
            <span style="font-size: 12px; font-weight: 800; color: #1e293b; text-transform: uppercase;">Senior Examiner Scoring Matrix</span>
            <span style="background: ${bandColor}18; color: ${bandColor}; font-weight: 800; font-size: 11px; padding: 2px 8px; border-radius: 4px; border: 1px solid ${bandColor}40;">
              ${bandText}
            </span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: center;">
            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569;">
              <tr>
                <th style="padding: 6px 4px;">Content (/10)</th>
                <th style="padding: 6px 4px;">Structure (/10)</th>
                <th style="padding: 6px 4px;">Relevance (/10)</th>
                <th style="padding: 6px 4px;">Analysis (/10)</th>
                <th style="padding: 6px 4px;">Language (/10)</th>
                <th style="padding: 6px 4px;">Presentation (/10)</th>
                <th style="padding: 6px 8px; background: #e0e7ff; color: #3730a3; font-weight: 800;">Estimated Score</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">${sc.content ?? 7.0}</td>
                <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">${sc.structure ?? 7.0}</td>
                <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">${sc.relevance ?? 7.5}</td>
                <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">${sc.analysis ?? 6.5}</td>
                <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">${sc.language ?? 7.5}</td>
                <td style="padding: 8px 4px; font-weight: 700; color: #0f172a;">${sc.presentation ?? 7.0}</td>
                <td style="padding: 8px 8px; background: #e0e7ff; font-weight: 800; font-size: 14px; color: #312e81;">
                  ${overallScore} <span style="font-size: 10px; font-weight: 500;">/10</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Executive Summary -->
        <div style="background: #f8fafc; border-left: 4px solid #4f46e5; border-radius: 4px; padding: 10px 14px; margin-bottom: 14px;">
          <div style="font-size: 11px; font-weight: 800; color: #3730a3; text-transform: uppercase; margin-bottom: 4px;">
            Examiner Executive Assessment
          </div>
          ${showEnglish && ev.summary ? `<div style="font-size: 12px; color: #1e293b; line-height: 1.5; margin-bottom: 4px;">${renderMd(ev.summary)}</div>` : ''}
          ${showHindi && ev.summaryHi ? `<div style="font-size: 11.5px; color: #475569; line-height: 1.5; background: rgba(79,70,229,0.06); padding: 6px 10px; border-radius: 4px;"><strong>हिंदी व्याख्या:</strong> ${renderMd(ev.summaryHi)}</div>` : ''}
        </div>

        <!-- Submitted Student Answer -->
        <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px; background: #ffffff;">
          <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">
            Candidate's Submitted Answer (${wordCount} words)
          </div>
          <div style="font-size: 11.5px; color: #334155; line-height: 1.6; white-space: pre-wrap; font-style: normal; border-left: 2px solid #cbd5e1; padding-left: 10px;">
${studentAnswer || 'No answer text recorded.'}
          </div>
        </div>

        <!-- Strengths & Weaknesses Split -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; page-break-inside: avoid;">
          <div style="border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 6px; padding: 10px 12px;">
            <div style="font-size: 11px; font-weight: 800; color: #15803d; text-transform: uppercase; margin-bottom: 6px;">
              What You Did Well (सकारात्मक पक्ष)
            </div>
            ${strengthsHtml}
          </div>
          <div style="border: 1px solid #fed7aa; background: #fff7ed; border-radius: 6px; padding: 10px 12px;">
            <div style="font-size: 11px; font-weight: 800; color: #c2410c; text-transform: uppercase; margin-bottom: 6px;">
              Areas for Improvement (सुधार के क्षेत्र)
            </div>
            ${weaknessesHtml}
          </div>
        </div>

        <!-- Missing Dimensions Table -->
        <div style="margin-bottom: 14px; page-break-inside: avoid;">
          <div style="font-size: 11px; font-weight: 800; color: #4338ca; text-transform: uppercase; margin-bottom: 6px;">
            High-Yield Value Additions & Missing Dimensions (छूटे हुए महत्वपूर्ण आयाम)
          </div>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; font-size: 11.5px;">
            <thead>
              <tr style="background: #e0e7ff; color: #312e81; text-align: left;">
                <th style="padding: 6px 10px; font-weight: 700;">Dimension / Institutional Angle</th>
                <th style="padding: 6px 10px; font-weight: 700;">Suggested Value Addition / Citation</th>
              </tr>
            </thead>
            <tbody>
              ${missingDimsHtml}
            </tbody>
          </table>
        </div>

        <!-- Flowchart / Diagram Section -->
        ${diagramHtml}

        <!-- 5-Step Improvement Roadmap -->
        <div style="margin-bottom: 14px; page-break-inside: avoid;">
          <div style="font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; margin-bottom: 6px;">
            Actionable 5-Step Revision Roadmap (सुधार के 5 व्यावहारिक कदम)
          </div>
          ${stepsHtml}
        </div>

        <!-- Topper Model Answer -->
        <div style="page-break-before: always; border: 1.5px solid #6366f1; border-radius: 6px; padding: 14px; background: #fdfefe; margin-top: 16px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e0e7ff; padding-bottom: 6px; margin-bottom: 10px;">
            <div style="font-size: 12px; font-weight: 800; color: #4338ca; text-transform: uppercase;">
              Topper Benchmark Model Answer (आदर्श उत्तर)
            </div>
            <span style="font-size: 10px; background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; font-weight: 700;">
              High-Scoring Format
            </span>
          </div>

          ${showEnglish && ev.improvedAnswer ? `
            <div style="font-size: 11.5px; color: #1e293b; line-height: 1.6; margin-bottom: 12px;">
              ${renderMd(ev.improvedAnswer)}
            </div>
          ` : ''}

          ${showHindi && ev.improvedAnswerHi ? `
            <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 10px;">
              <div style="font-size: 11px; font-weight: 700; color: #4338ca; margin-bottom: 6px;">
                हिंदी में आदर्श उत्तर (Hindi Translation):
              </div>
              <div style="font-size: 11.5px; color: #334155; line-height: 1.6;">
                ${renderMd(ev.improvedAnswerHi)}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Footer & Disclaimer -->
        <div style="border-top: 1.5px solid #e2e8f0; padding-top: 8px; margin-top: 20px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
          <span>HAMSA VIDYA (हंस विद्या) • AI Wisdom & Answer Writing Studio</span>
          <span>Advisory Evaluation • Confidential Academic Practice Material</span>
        </div>
      </div>
    `;

    // Off-screen render container
    const container = document.createElement('div');
    container.id = 'temp-eval-pdf-container';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '820px';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    const safeTitle = (subject || 'UPSC-Answer')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');

    try {
      if (window.html2pdf) {
        const opt = {
          margin: [8, 8, 8, 8],
          filename: `hamsa-vidya-${safeTitle}-assessment.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            logging: false
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        };

        const targetEl = container.querySelector('#hamsa-evaluation-report-paper');
        await window.html2pdf().set(opt).from(targetEl).save();
      } else {
        this.openPrintWindow(htmlContent);
      }
    } catch (err) {
      console.warn('html2pdf failed for evaluation report, falling back to clean print popup:', err);
      this.openPrintWindow(htmlContent);
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  }
}

window.pdfGenerator = new PdfGeneratorService();
