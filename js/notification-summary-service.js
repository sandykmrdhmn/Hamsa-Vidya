/**
 * HAMSA VIDYA (हंस विद्या) — Notification Summary Service
 * Abstracts PDF extraction + AI summarization behind a provider interface.
 * Mock provider for demo; Gemini provider for production use.
 */

class NotificationSummaryService {
  constructor() {
    this._cache = new Map(); // examId → { summary, timestamp }
    this._cacheMaxAge = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Summarize a notification for an exam.
   * Returns a structured 5-point summary.
   * @param {Object} exam — full exam object
   * @returns {Promise<{ success: boolean, summary: string[], disclaimer: string, provider: string, error?: string }>}
   */
  async summarizeNotification(exam) {
    if (!exam) return this._error('No exam data provided.');

    // Check cache
    const cached = this._cache.get(exam.id);
    if (cached && (Date.now() - cached.timestamp) < this._cacheMaxAge) {
      return cached.result;
    }

    // Determine provider
    const hasGeminiKey = window.geminiService?.isAiAvailable();
    const hasPdfUrl = exam.notificationPdfUrl;

    let result;
    if (hasGeminiKey && hasPdfUrl) {
      result = await this._geminiSummarize(exam);
    } else {
      result = this._mockSummarize(exam);
    }

    // Cache result
    this._cache.set(exam.id, { result, timestamp: Date.now() });
    return result;
  }

  /**
   * AI-powered summarization using existing Gemini service.
   */
  async _geminiSummarize(exam) {
    try {
      // Build context from structured exam data for AI prompt
      const examContext = this._buildExamContext(exam);

      const prompt = `You are an Indian government exam notification analyst. Based on the following exam notification details, provide EXACTLY 5 concise bullet points summarizing the key information a student needs to know.

Structure your 5 points as:
1. Who can apply (eligibility overview)
2. Important posts/vacancies
3. Age limit & qualification requirements
4. Important dates & fees
5. Selection process & important instructions

EXAM NOTIFICATION DATA:
${examContext}

IMPORTANT RULES:
- Each point must be 1-2 sentences maximum
- Use specific numbers and dates from the data provided
- Do NOT invent any information not present in the data
- If information is not available, say "Refer to official notification"
- Be factual and precise — this is a government exam notification

Return ONLY the 5 numbered bullet points, nothing else.`;

      const apiKey = window.geminiService.getApiKey();
      const model = window.geminiService.getActiveModel();

      const response = await window.aiClient.fetchGenerateContent(model, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 600,
            topP: 0.8
          }
        }, { apiKey });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('Empty response from AI');
      }

      // Parse numbered points
      const points = text.split(/\n/)
        .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter(line => line.length > 10);

      if (points.length < 3) {
        throw new Error('Insufficient summary points generated');
      }

      return {
        success: true,
        summary: points.slice(0, 5),
        disclaimer: 'AI-generated summary using Google Gemini. Always verify important details in the official notification.',
        provider: 'GEMINI_AI'
      };

    } catch (err) {
      console.warn('Gemini summarization failed, falling back to mock:', err.message);
      return this._mockSummarize(exam);
    }
  }

  /**
   * Build exam context string from structured data for AI prompt.
   */
  _buildExamContext(exam) {
    const lines = [];
    lines.push(`Exam Name: ${exam.examName}`);
    lines.push(`Organizing Body: ${exam.organizingBody}`);
    if (exam.notificationNumber) lines.push(`Notification No.: ${exam.notificationNumber}`);
    if (exam.vacancies) lines.push(`Vacancies: ${exam.vacancies}`);
    if (exam.applicationStartDate) lines.push(`Application Start: ${exam.applicationStartDate}`);
    if (exam.applicationDeadline) lines.push(`Application Deadline: ${exam.applicationDeadline}`);
    if (exam.examDate) lines.push(`Exam Date: ${exam.examDate}`);

    if (exam.eligibility) {
      const e = exam.eligibility;
      if (e.minimumAge) lines.push(`Minimum Age: ${e.minimumAge}`);
      if (e.maximumAge) lines.push(`Maximum Age: ${e.maximumAge}`);
      if (e.ageCutoffDate) lines.push(`Age Cutoff Date: ${e.ageCutoffDate}`);
      if (e.qualifications?.length) {
        const hierarchy = (typeof window !== 'undefined' && window.QUALIFICATION_HIERARCHY) || (typeof QUALIFICATION_HIERARCHY !== 'undefined' ? QUALIFICATION_HIERARCHY : {});
        const labels = e.qualifications.map(q => {
          const entry = hierarchy[q];
          return entry ? entry.label : q;
        });
        const unique = [...new Set(labels)];
        lines.push(`Required Qualification: ${unique.slice(0, 5).join(', ')}`);
      }
      if (e.minimumPercentage) lines.push(`Minimum Percentage: ${e.minimumPercentage}%`);
      if (e.categoryAgeRelaxation) {
        const relax = Object.entries(e.categoryAgeRelaxation)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}: +${v} years`);
        if (relax.length) lines.push(`Age Relaxation: ${relax.join(', ')}`);
      }
      if (e.additionalRequirements?.length) {
        lines.push(`Additional Requirements: ${e.additionalRequirements.join('; ')}`);
      }
    }

    if (exam.officialNotificationUrl) lines.push(`Official Notification: ${exam.officialNotificationUrl}`);
    return lines.join('\n');
  }

  /**
   * Mock summary provider using structured exam data.
   * Clearly labeled as demo/generated summary, not AI-extracted.
   */
  _mockSummarize(exam) {
    const e = exam.eligibility || {};
    const summary = [];
    const hierarchy = (typeof window !== 'undefined' && window.QUALIFICATION_HIERARCHY) || (typeof QUALIFICATION_HIERARCHY !== 'undefined' ? QUALIFICATION_HIERARCHY : {});

    // 1. Who can apply
    const quals = (e.qualifications || []).slice(0, 3).map(q => {
      const entry = hierarchy[q];
      return entry ? entry.label : q;
    });
    summary.push(`Candidates with ${quals.join(' / ') || 'required qualification'} from a recognized university/board are eligible to apply for ${exam.shortName || exam.examName}.`);

    // 2. Vacancies/posts
    if (exam.vacancies) {
      summary.push(`Total ${exam.vacancies.toLocaleString('en-IN')} vacancies have been notified across various categories and posts under ${exam.organizingBody}.`);
    } else {
      summary.push(`${exam.organizingBody} has announced ${exam.shortName || exam.examName}. Refer to official notification for post details.`);
    }

    // 3. Age & qualification
    let ageStr = '';
    if (e.minimumAge && e.maximumAge) ageStr = `${e.minimumAge}–${e.maximumAge} years`;
    else if (e.maximumAge) ageStr = `up to ${e.maximumAge} years`;
    else if (e.minimumAge) ageStr = `minimum ${e.minimumAge} years`;
    else ageStr = 'No specific age limit';
    const relaxStr = e.categoryAgeRelaxation ? Object.entries(e.categoryAgeRelaxation).filter(([, v]) => v > 0).map(([k, v]) => `${k} +${v}y`).join(', ') : '';
    summary.push(`Age limit: ${ageStr}${e.ageCutoffDate ? ` (as on ${this._formatDate(e.ageCutoffDate)})` : ''}. ${relaxStr ? `Relaxation: ${relaxStr}.` : ''} ${e.minimumPercentage ? `Minimum ${e.minimumPercentage}% marks required.` : ''}`);

    // 4. Important dates
    const startDate = exam.applicationStartDate ? this._formatDate(exam.applicationStartDate) : 'Refer to notification';
    const endDate = exam.applicationDeadline ? this._formatDate(exam.applicationDeadline) : 'Refer to notification';
    const examDateStr = exam.examDate ? this._formatDate(exam.examDate) : 'To be announced';
    summary.push(`Application period: ${startDate} to ${endDate}. Exam tentatively scheduled for ${examDateStr}. Application fee details available in official notification.`);

    // 5. Selection process
    if (e.additionalRequirements?.length) {
      summary.push(`Selection involves written exam and additional requirements: ${e.additionalRequirements.slice(0, 2).join('; ')}. Refer to official notification for complete selection process.`);
    } else {
      summary.push(`Selection process typically includes Computer Based Test (CBT) followed by document verification. Refer to the official notification for the complete selection process and syllabus.`);
    }

    return {
      success: true,
      summary,
      disclaimer: 'Summary generated from structured exam data (demo mode). For AI-powered summaries, configure your Gemini API key in Settings. Always verify details in the official notification.',
      provider: 'MOCK'
    };
  }

  /**
   * Format date for display.
   */
  _formatDate(dateStr) {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  /**
   * Error result.
   */
  _error(msg) {
    return {
      success: false,
      summary: [],
      disclaimer: '',
      provider: 'NONE',
      error: msg
    };
  }

  /**
   * Clear summary cache.
   */
  clearCache() {
    this._cache.clear();
  }
}

// Global singleton
window.notificationSummaryService = new NotificationSummaryService();
