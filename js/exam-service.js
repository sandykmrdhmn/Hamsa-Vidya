/**
 * HAMSA VIDYA (हंस विद्या) — Exam Data Service & Demo Dataset
 * Manages exam data, search, filter, sort, and bookmarking.
 * Demo data is clearly labeled — never pretends to be live government notifications.
 */

class ExamService {
  constructor() {
    this._exams = null;
  }

  /**
   * Get all active exams (from live aggregator API or local IndexedDB cache).
   * @param {boolean} forceRefresh
   * @returns {Promise<Array>}
   */
  async getAllExams(forceRefresh = false) {
    const storedCount = await db.exams.count();
    const lastSyncTime = parseInt(localStorage.getItem('hamsa_exams_sync_timestamp') || '0', 10);
    const isStale = (Date.now() - lastSyncTime) > (60 * 60 * 1000); // 1 hour

    if (storedCount === 0 || forceRefresh || isStale) {
      await this.syncLiveExams(forceRefresh);
    }

    this._exams = await db.exams.toArray();
    return this._exams;
  }

  /**
   * Get sync metadata (last synced timestamp and source).
   */
  getSyncInfo() {
    return {
      lastSynced: localStorage.getItem('hamsa_exams_last_synced'),
      source: localStorage.getItem('hamsa_exams_source') || 'FreeJobAlert — Government Jobs table'
    };
  }

  /**
   * Get a single exam by ID.
   */
  async getExamById(id) {
    return await db.exams.get(Number(id));
  }

  /**
   * Search exams by name or organization.
   */
  async searchExams(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return await this.getAllExams();
    const all = await this.getAllExams();
    return all.filter(e =>
      (e.examName || '').toLowerCase().includes(q) ||
      (e.shortName || '').toLowerCase().includes(q) ||
      (e.organizingBody || '').toLowerCase().includes(q)
    );
  }

  /**
   * Filter exams by multiple criteria.
   */
  filterExams(exams, filters = {}) {
    let filtered = [...exams];
    const today = new Date().toISOString().split('T')[0];

    if (filters.eligibility === 'ELIGIBLE') {
      // LIKELY_ELIGIBLE is "eligible, pending verification of estimated data",
      // so it belongs in the eligible bucket.
      filtered = filtered.filter(e => window.isEligibilityPositive?.(e._eligibilityResult?.status));
    } else if (filters.eligibility === 'NOT_ELIGIBLE') {
      filtered = filtered.filter(e => e._eligibilityResult?.status === 'NOT_ELIGIBLE');
    } else if (filters.eligibility === 'NEEDS_VERIFICATION') {
      filtered = filtered.filter(e => e._eligibilityResult?.status === 'NEEDS_VERIFICATION');
    }

    if (filters.closingSoon) {
      filtered = filtered.filter(e => {
        const days = this.getDaysRemaining(e.applicationDeadline);
        return days >= 0 && days <= 7;
      });
    }

    if (filters.saved && filters.savedIds) {
      filtered = filtered.filter(e => filters.savedIds.has(e.id));
    }

    if (filters.organization) {
      filtered = filtered.filter(e => e.organizingBody === filters.organization);
    }

    if (filters.govtType && filters.govtType !== 'ALL') {
      filtered = filtered.filter(e => e.govtType === filters.govtType);
    }

    if (filters.state && filters.state !== 'ALL') {
      filtered = filtered.filter(e => e.state === filters.state);
    }

    if (filters.educationLevel && filters.educationLevel !== 'ALL') {
      filtered = filtered.filter(e => {
        const quals = e.eligibility?.qualifications || [];
        if (filters.educationLevel === '10TH_PASS') return quals.includes('10TH_PASS');
        if (filters.educationLevel === '12TH_PASS') return quals.includes('12TH_PASS');
        if (filters.educationLevel === 'GRADUATE') return quals.some(q => ['GRADUATION', 'BACHELORS', 'BA', 'BSC', 'BCOM', 'BTECH', 'BE', 'BCA', 'BBA'].includes(q));
        if (filters.educationLevel === 'ENGINEERING') return quals.includes('BTECH') || quals.includes('BE');
        if (filters.educationLevel === 'POST_GRADUATE') return quals.includes('POST_GRADUATION') || quals.includes('MASTERS');
        return true;
      });
    }

    if (filters.qualification) {
      filtered = filtered.filter(e =>
        e.eligibility?.qualifications?.includes(filters.qualification)
      );
    }

    return filtered;
  }

  /**
   * Sort exams.
   */
  sortExams(exams, sortBy = 'deadline_asc') {
    const sorted = [...exams];
    switch (sortBy) {
      case 'deadline_asc':
        return sorted.sort((a, b) => new Date(a.applicationDeadline) - new Date(b.applicationDeadline));
      case 'deadline_desc':
        return sorted.sort((a, b) => new Date(b.applicationDeadline) - new Date(a.applicationDeadline));
      case 'name_asc':
        return sorted.sort((a, b) => (a.examName || '').localeCompare(b.examName || ''));
      case 'vacancies_desc':
        return sorted.sort((a, b) => (b.vacancies || 0) - (a.vacancies || 0));
      case 'eligibility':
        const order = { 'ELIGIBLE': 0, 'LIKELY_ELIGIBLE': 0, 'NEEDS_VERIFICATION': 1, 'NOT_ELIGIBLE': 2, 'INCOMPLETE': 3 };
        return sorted.sort((a, b) =>
          (order[a._eligibilityResult?.status] ?? 3) - (order[b._eligibilityResult?.status] ?? 3)
        );
      default:
        return sorted;
    }
  }

  /**
   * Get days remaining until deadline.
   * @returns {number} days remaining (-1 if expired)
   */
  getDaysRemaining(deadlineStr) {
    if (!deadlineStr) return -1;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const deadline = new Date(deadlineStr + 'T23:59:59+05:30');
    const diff = deadline - now;
    if (diff < 0) return -1;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Get urgency level for countdown display.
   */
  getUrgencyLevel(daysRemaining) {
    if (daysRemaining < 0) return { level: 'CLOSED', label: 'Application Closed', color: 'closed', icon: '⚫' };
    if (daysRemaining === 0) return { level: 'TODAY', label: 'Ends Today', color: 'critical', icon: '🔴' };
    if (daysRemaining <= 2) return { level: 'VERY_URGENT', label: `${daysRemaining} day${daysRemaining > 1 ? 's' : ''} left`, color: 'urgent', icon: '🟠' };
    if (daysRemaining <= 7) return { level: 'CLOSING_SOON', label: `${daysRemaining} days left`, color: 'warning', icon: '🟡' };
    return { level: 'NORMAL', label: `${daysRemaining} days left`, color: 'normal', icon: '🟢' };
  }

  /**
   * Get unique organizing bodies from exams.
   */
  getOrganizations(exams) {
    const orgs = new Set();
    exams.forEach(e => { if (e.organizingBody) orgs.add(e.organizingBody); });
    return Array.from(orgs).sort();
  }

  /**
   * Toggle bookmark/save for an exam.
   */
  async toggleSaved(examId) {
    const existing = await db.savedExams.where('examId').equals(Number(examId)).first();
    if (existing) {
      await db.savedExams.delete(existing.id);
      return false; // unsaved
    } else {
      await db.savedExams.add({ examId: Number(examId), savedAt: new Date().toISOString() });
      return true; // saved
    }
  }

  /**
   * Alias for toggleSaved.
   */
  async toggleSavedExam(examId) {
    return await this.toggleSaved(examId);
  }

  /**
   * Check if an exam is currently saved.
   */
  async isExamSaved(examId) {
    const existing = await db.savedExams.where('examId').equals(Number(examId)).first();
    return !!existing;
  }

  /**
   * Get set of saved exam IDs.
   */
  async getSavedExamIds() {
    const saved = await db.savedExams.toArray();
    return new Set(saved.map(s => s.examId));
  }

  /**
   * Sync fresh notifications from server's live aggregator endpoint (/api/live-exams).
   * Persists results into IndexedDB (db.exams) for offline availability.
   * @param {boolean} forceRefresh
   * @returns {Promise<{ success: boolean, count: number, source: string, timestamp: string }>}
   */
  async syncLiveExams(forceRefresh = false) {
    try {
      const url = `/api/live-exams${forceRefresh ? '?refresh=true' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.exams) && data.exams.length > 0) {
        await db.transaction('rw', db.exams, async () => {
          await db.exams.clear();
          await db.exams.bulkAdd(data.exams);
        });

        const timestamp = data.timestamp || new Date().toISOString();
        localStorage.setItem('hamsa_exams_last_synced', timestamp);
        localStorage.setItem('hamsa_exams_sync_timestamp', String(Date.now()));
        localStorage.setItem('hamsa_exams_source', data.source || 'FreeJobAlert — Government Jobs table');

        return {
          success: true,
          count: data.exams.length,
          source: data.source,
          timestamp
        };
      }
    } catch (err) {
      console.warn('Live exam sync notice (working offline or server unreachable):', err.message);
    }

    const currentCount = await db.exams.count();
    return {
      success: false,
      count: currentCount,
      source: localStorage.getItem('hamsa_exams_source') || 'OFFLINE_CACHE',
      timestamp: localStorage.getItem('hamsa_exams_last_synced') || new Date().toISOString()
    };
  }
}

// Global singleton
window.examService = new ExamService();
