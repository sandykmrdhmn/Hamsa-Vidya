/**
 * HAMSA VIDYA (हंस विद्या) — AI Study Mentor & Exam Strategic Advisor Engine
 * (एआई सारथी — व्यक्तिगत अध्ययन, परीक्षा लक्ष्य व समय विश्लेषण)
 * 
 * Features:
 * 1. StudyTimeTracker: Real-time active engagement tracking, daily minutes, and deficit analysis.
 * 2. Target Exam Manager: Optional student target exam selection, giant countdown timer, 
 *    eligibility verification, and tailored syllabus blueprint.
 * 3. Deep Platform Benefits Audit: Diagnoses which tools on Hamsa Vidya the student is NOT utilizing.
 * 4. Preparedness Index & 3-Pillar Tactical Action Plan.
 */

class StudyTimeTracker {
  constructor() {
    this.storageKeyToday = 'hamsa_study_seconds_today';
    this.storageKeyDate = 'hamsa_study_date_today';
    this.storageKeyWeekly = 'hamsa_study_history_weekly';
    this.activeInterval = null;
    this.isTabActive = !document.hidden;
    this.init();
  }

  init() {
    this._rolloverDateIfNeeded();
    this.startTracking();

    document.addEventListener('visibilitychange', () => {
      this.isTabActive = !document.hidden;
    });
    window.addEventListener('focus', () => { this.isTabActive = true; });
    window.addEventListener('blur', () => { this.isTabActive = false; });
  }

  _getTodayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  _rolloverDateIfNeeded() {
    const today = this._getTodayDateString();
    const storedDate = localStorage.getItem(this.storageKeyDate);

    if (storedDate !== today) {
      if (storedDate) {
        const prevSeconds = parseInt(localStorage.getItem(this.storageKeyToday) || '0', 10);
        const prevMinutes = Math.round(prevSeconds / 60);
        let history = [];
        try {
          history = JSON.parse(localStorage.getItem(this.storageKeyWeekly) || '[]');
        } catch (e) {}
        history.unshift({ date: storedDate, minutes: prevMinutes });
        history = history.slice(0, 7);
        localStorage.setItem(this.storageKeyWeekly, JSON.stringify(history));
      }
      localStorage.setItem(this.storageKeyDate, today);
      localStorage.setItem(this.storageKeyToday, '0');
    }
  }

  startTracking() {
    if (this.activeInterval) clearInterval(this.activeInterval);
    this.activeInterval = setInterval(() => {
      if (this.isTabActive) {
        this._rolloverDateIfNeeded();
        const currentSec = parseInt(localStorage.getItem(this.storageKeyToday) || '0', 10);
        localStorage.setItem(this.storageKeyToday, String(currentSec + 5));
      }
    }, 5000);
  }

  getTodayMinutes() {
    this._rolloverDateIfNeeded();
    const sec = parseInt(localStorage.getItem(this.storageKeyToday) || '0', 10);
    return Math.max(1, Math.round(sec / 60));
  }

  getWeeklyMinutes() {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(this.storageKeyWeekly) || '[]');
    } catch (e) {}
    const pastSum = history.reduce((acc, item) => acc + (item.minutes || 0), 0);
    return pastSum + this.getTodayMinutes();
  }

  getDailyAverageMinutes() {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(this.storageKeyWeekly) || '[]');
    } catch (e) {}
    const totalDays = Math.max(1, history.length + 1);
    return Math.round(this.getWeeklyMinutes() / totalDays);
  }
}

// Master Catalog of Top Competitive Exams
const TARGET_EXAMS_CATALOG = [
  {
    id: 'UPSC_CSE',
    name: 'UPSC Civil Services Examination (IAS / IPS / IFS 2027)',
    shortName: 'UPSC CSE 2027',
    organizingBody: 'Union Public Service Commission (UPSC)',
    category: 'Civil Services',
    examDate: '2027-05-23',
    applicationEndDate: '2027-03-02',
    recommendedDailyMinutes: 90,
    vacancies: '1,105+',
    salary: '₹56,100 - ₹2,50,000 (Pay Level 10-17)',
    stages: 'Prelims (GS + CSAT) ➔ Mains (9 Papers) ➔ Personality Interview',
    syllabusHighlights: 'Indian Polity, Modern History, Geography, Economy, Ecology & CSAT Comprehension',
    requiredQualifications: ['GRADUATION', 'BACHELORS', 'BTECH', 'BE', 'POST_GRADUATION'],
    preparationRoadmap: 'Daily 15 CSAT comprehension MCQs + 35 GS Static MCQs + Current Affairs Synthesis'
  },
  {
    id: 'SSC_CGL',
    name: 'Staff Selection Commission Combined Graduate Level (SSC CGL 2026-27)',
    shortName: 'SSC CGL 2026',
    organizingBody: 'Staff Selection Commission (SSC)',
    category: 'Staff Selection',
    examDate: '2026-12-14',
    applicationEndDate: '2026-10-25',
    recommendedDailyMinutes: 60,
    vacancies: '17,727',
    salary: '₹35,400 - ₹1,42,400 (Pay Level 6-8)',
    stages: 'Tier 1 CBT ➔ Tier 2 CBT (Quant, Reasoning, English, General Awareness, Computer)',
    syllabusHighlights: 'Quantitative Aptitude, General Intelligence, English Comprehension, General Awareness',
    requiredQualifications: ['GRADUATION', 'BACHELORS', 'BTECH', 'BE', 'POST_GRADUATION'],
    preparationRoadmap: 'Speed calculation drills + daily 25 Quantitative MCQs + English grammar flashcards'
  },
  {
    id: 'IBPS_PO',
    name: 'IBPS Bank Probationary Officer / Management Trainee (PO / MT 2026)',
    shortName: 'IBPS PO 2026',
    organizingBody: 'Institute of Banking Personnel Selection (IBPS)',
    category: 'Banking',
    examDate: '2026-11-28',
    applicationEndDate: '2026-10-15',
    recommendedDailyMinutes: 60,
    vacancies: '4,455+',
    salary: '₹52,000 - ₹65,000/month in-hand',
    stages: 'Prelims (English, Quant, Reasoning) ➔ Mains (DI, GA, Reasoning) ➔ Interview',
    syllabusHighlights: 'Data Interpretation, High-level Logical Puzzles, Banking Awareness & Financial Economy',
    requiredQualifications: ['GRADUATION', 'BACHELORS', 'BTECH', 'BE', 'POST_GRADUATION'],
    preparationRoadmap: 'Daily 2 Data Interpretation sets + 3 Seating Arrangement Puzzles + Financial News'
  },
  {
    id: 'RRB_NTPC',
    name: 'Railway Recruitment Board Non-Technical Categories (RRB NTPC 2026-27)',
    shortName: 'RRB NTPC 2027',
    organizingBody: 'Railway Recruitment Control Board (RRB)',
    category: 'Railways',
    examDate: '2027-01-18',
    applicationEndDate: '2026-11-10',
    recommendedDailyMinutes: 50,
    vacancies: '11,558',
    salary: '₹21,700 - ₹69,100 (Level 3-6)',
    stages: 'CBT-1 (General Awareness, Maths, Reasoning) ➔ CBT-2 ➔ Typing/Aptitude Test',
    syllabusHighlights: 'General Science, Railways History & Facts, Arithmetic, General Intelligence',
    requiredQualifications: ['TWELFTH', '12TH', 'GRADUATION', 'BACHELORS'],
    preparationRoadmap: 'General Science revision + 20 Arithmetic MCQs daily + previous years railway papers'
  },
  {
    id: 'STATE_PSC',
    name: 'State Civil Services Combined Exam (UPPSC / BPSC / MPPSC / RAS 2026-27)',
    shortName: 'State PSC 2026',
    organizingBody: 'State Public Service Commission',
    category: 'State Govt',
    examDate: '2026-12-20',
    applicationEndDate: '2026-10-30',
    recommendedDailyMinutes: 75,
    vacancies: '850+',
    salary: 'Pay Level 10 (₹56,100 - ₹1,77,500)',
    stages: 'State Prelims ➔ State Written Mains ➔ Interview',
    syllabusHighlights: 'State-specific GK & Geography, Indian Polity, Modern History, General Studies',
    requiredQualifications: ['GRADUATION', 'BACHELORS', 'POST_GRADUATION'],
    preparationRoadmap: 'State History & Geography drills + daily 30 General Studies MCQs'
  },
  {
    id: 'DEFENCE_NDA_CDS',
    name: 'National Defence Academy & Combined Defence Services (NDA / CDS 2027)',
    shortName: 'NDA / CDS 2027',
    organizingBody: 'UPSC / Ministry of Defence',
    category: 'Defence',
    examDate: '2027-04-18',
    applicationEndDate: '2027-01-15',
    recommendedDailyMinutes: 60,
    vacancies: '459',
    salary: 'Level 10 (₹56,100 + Military Service Pay ₹15,500)',
    stages: 'Written Examination (Maths + GAT) ➔ 5-Day SSB Interview Board',
    syllabusHighlights: 'Higher Mathematics (Trigonometry, Calculus, Algebra), English & General Knowledge',
    requiredQualifications: ['TWELFTH', '12TH', 'GRADUATION', 'BACHELORS'],
    preparationRoadmap: 'Daily 25 Mathematics problems + English Comprehension + Current Defence Updates'
  }
];

class AIAdvisorEngine {
  constructor() {
    this.cacheKey = 'hamsa_ai_advisor_cache';
    this.targetExamKey = 'hamsa_target_exam_id';
    this.targetExamDataKey = 'hamsa_target_exam_data';
    this.timeTracker = new StudyTimeTracker();
    this._allModalExams = [];
    this._activeCategoryFilter = 'ALL';
    this._hasEscListener = false;
  }

  /**
   * Get currently selected Target Exam ID (or null if unselected)
   */
  getTargetExamId() {
    return localStorage.getItem(this.targetExamKey) || null;
  }

  /**
   * Set target exam and refresh advice
   */
  async selectTargetExam(examId, customExamData = null) {
    if (!examId || examId === 'CLEAR') {
      localStorage.removeItem(this.targetExamKey);
      localStorage.removeItem(this.targetExamDataKey);
    } else {
      localStorage.setItem(this.targetExamKey, String(examId));
      if (customExamData) {
        try {
          localStorage.setItem(this.targetExamDataKey, JSON.stringify(customExamData));
        } catch (e) {}
      }
    }
    localStorage.removeItem(this.cacheKey);
    this.closeExamSelectorModal();
    const advice = await this.generateLiveAdvice(true);
    if (customExamData && window.app && window.app.showToast) {
      window.app.showToast(`🎯 लक्ष्य परीक्षा सेट: ${customExamData.shortName || customExamData.name}!`, 'success');
    }
    return advice;
  }

  /**
   * Reset target exam
   */
  async resetTargetExam() {
    await this.selectTargetExam('CLEAR');
  }

  /**
   * Helper to format live exam object to target exam structure
   */
  _formatLiveExamToTarget(liveMatch) {
    const isCentral = liveMatch.govtType === 'CENTRAL';
    return {
      id: String(liveMatch.id),
      name: liveMatch.examName,
      shortName: liveMatch.shortName || liveMatch.organizingBody || (liveMatch.examName.length > 28 ? liveMatch.examName.substring(0, 28) + '...' : liveMatch.examName),
      organizingBody: liveMatch.organizingBody || (isCentral ? 'Central Govt Recruitment Board' : 'State Recruitment Board'),
      category: isCentral ? 'Central Govt' : (liveMatch.state ? `${liveMatch.state} State Govt` : 'State Govt'),
      examDate: liveMatch.examDate || liveMatch.applicationDeadline,
      applicationEndDate: liveMatch.applicationDeadline,
      recommendedDailyMinutes: 60,
      vacancies: liveMatch.vacancies ? `${liveMatch.vacancies.toLocaleString()} Posts` : 'Open Vacancies',
      salary: liveMatch.payScale || 'Central/State Pay Matrix',
      stages: 'CBT / Written Examination ➔ Skill Test ➔ Document Verification',
      syllabusHighlights: (liveMatch.educationTags && liveMatch.educationTags.length) ? liveMatch.educationTags.join(', ') : 'General Knowledge, Quantitative Aptitude & Core Technical Subjects',
      requiredQualifications: liveMatch.eligibility?.qualifications || ['GRADUATION'],
      preparationRoadmap: 'Topic-wise mock MCQs + regular 5-minute timed drills on Hamsa Vidya'
    };
  }

  /**
   * Open the Target Exam Selector Modal
   */
  async openExamSelectorModal() {
    const modal = document.getElementById('target-exam-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('active');

    // Reset search & category
    const searchInput = document.getElementById('target-exam-search-input');
    if (searchInput) searchInput.value = '';
    this._activeCategoryFilter = 'ALL';
    this._updateCategoryPillsUI();

    const listContainer = document.getElementById('target-exam-modal-list');
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="exam-modal-loading-state">
          <div class="spinner"></div>
          <span>आगामी परीक्षाओं की लाइव सूची लोड हो रही है...</span>
        </div>
      `;
    }

    // Fetch all live exams from Exam Tab service
    const allExams = window.examService ? await window.examService.getAllExams().catch(() => []) : [];
    
    // Unify premier catalog with all live fetched exams
    const unified = [];
    const seenNames = new Set();

    // 1. Premier Flagship National Exams
    TARGET_EXAMS_CATALOG.forEach(ex => {
      seenNames.add(ex.name.toLowerCase());
      const days = this._computeDaysLeft(ex.examDate || ex.applicationEndDate);
      unified.push({
        id: String(ex.id),
        name: ex.name,
        shortName: ex.shortName,
        organizingBody: ex.organizingBody,
        category: ex.category,
        categoryType: this._detectCategoryType(ex),
        examDate: ex.examDate,
        applicationDeadline: ex.applicationEndDate,
        daysRemaining: days,
        vacancies: ex.vacancies,
        salary: ex.salary,
        qualifications: ex.requiredQualifications?.join(', ') || 'Graduation',
        isPremier: true,
        raw: ex
      });
    });

    // 2. All Live Scraped Exams from Exam Tab
    allExams.forEach(live => {
      const nameKey = (live.examName || '').toLowerCase().trim();
      if (!seenNames.has(nameKey)) {
        seenNames.add(nameKey);
        const days = this._computeDaysLeft(live.examDate || live.applicationDeadline);
        const formatted = this._formatLiveExamToTarget(live);
        unified.push({
          id: String(live.id),
          name: live.examName,
          shortName: live.shortName || live.organizingBody,
          organizingBody: live.organizingBody || 'Government Board',
          category: live.govtType === 'CENTRAL' ? 'Central Govt' : (live.state ? `${live.state} State` : 'State Govt'),
          categoryType: live.govtType === 'CENTRAL' ? 'CENTRAL' : 'STATE',
          examDate: live.examDate,
          applicationDeadline: live.applicationDeadline,
          daysRemaining: days,
          vacancies: live.vacancies ? `${live.vacancies.toLocaleString()} Posts` : 'Open Posts',
          salary: live.payScale || 'Govt Pay Matrix',
          qualifications: (live.educationTags && live.educationTags.length) ? live.educationTags.join(', ') : 'Eligible Qualifications',
          isPremier: false,
          raw: formatted
        });
      }
    });

    // Sort by days remaining (exams coming up soonest appear first)
    unified.sort((a, b) => (a.daysRemaining || 999) - (b.daysRemaining || 999));
    this._allModalExams = unified;

    this.filterExamModal('');

    // Setup ESC key listener once
    if (!this._hasEscListener) {
      this._hasEscListener = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeExamSelectorModal();
      });
    }
  }

  _computeDaysLeft(dateStr) {
    if (!dateStr) return 999;
    let targetDateObj = new Date(dateStr);
    const now = new Date();
    if (targetDateObj < now) {
      targetDateObj.setFullYear(targetDateObj.getFullYear() + 1);
    }
    return Math.max(1, Math.ceil((targetDateObj - now) / (1000 * 60 * 60 * 24)));
  }

  _detectCategoryType(ex) {
    const c = (ex.category || '').toLowerCase();
    if (c.includes('banking')) return 'BANK_RAIL';
    if (c.includes('railway')) return 'BANK_RAIL';
    if (c.includes('civil') || c.includes('defence')) return 'CIVIL_DEFENCE';
    if (c.includes('state')) return 'STATE';
    return 'CENTRAL';
  }

  closeExamSelectorModal() {
    const modal = document.getElementById('target-exam-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
  }

  setCategoryFilter(category) {
    this._activeCategoryFilter = category;
    this._updateCategoryPillsUI();
    const query = document.getElementById('target-exam-search-input')?.value || '';
    this.filterExamModal(query);
  }

  _updateCategoryPillsUI() {
    const container = document.getElementById('target-exam-category-chips');
    if (!container) return;
    const buttons = container.querySelectorAll('.target-cat-chip');
    buttons.forEach(btn => {
      if (btn.getAttribute('data-cat') === this._activeCategoryFilter) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  filterExamModal(query = '') {
    const container = document.getElementById('target-exam-modal-list');
    const countLabel = document.getElementById('target-exam-count-label');
    if (!container) return;

    const q = (query || '').toLowerCase().trim();
    const cat = this._activeCategoryFilter || 'ALL';
    const currentTargetId = this.getTargetExamId();

    const filtered = this._allModalExams.filter(exam => {
      // Category filter
      if (cat !== 'ALL') {
        if (cat === 'CENTRAL' && exam.categoryType !== 'CENTRAL') return false;
        if (cat === 'STATE' && exam.categoryType !== 'STATE') return false;
        if (cat === 'BANK_RAIL' && exam.categoryType !== 'BANK_RAIL') return false;
        if (cat === 'CIVIL_DEFENCE' && exam.categoryType !== 'CIVIL_DEFENCE') return false;
      }

      // Query filter
      if (q) {
        const text = `${exam.name} ${exam.shortName} ${exam.organizingBody} ${exam.qualifications} ${exam.category}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    if (countLabel) {
      countLabel.textContent = `${filtered.length} परीक्षाएं उपलब्ध`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="exam-modal-empty-state">
          <div class="empty-icon">🔍</div>
          <h4>कोई परीक्षा नहीं मिली (No Matching Exams Found)</h4>
          <p>कृपया किसी अन्य कीवर्ड (जैसे UPSC, SSC, AIIMS, Railway) से खोजें या फ़िल्टर बदलें।</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="target-exam-cards-grid">
        ${filtered.map(exam => {
          const isSelected = String(exam.id) === String(currentTargetId);
          const rawEscaped = encodeURIComponent(JSON.stringify(exam.raw));
          return `
            <div class="exam-selector-card ${isSelected ? 'card-active-target' : ''}">
              <div class="card-left-info">
                <div class="card-meta-chips">
                  <span class="exam-chip-cat">${exam.isPremier ? '⭐ Premier' : '🏛️'} ${SecurityUtils.escapeHtml(exam.category)}</span>
                  <span class="exam-chip-org">${SecurityUtils.escapeHtml(exam.organizingBody)}</span>
                  <span class="exam-chip-days">⏳ ${exam.daysRemaining} दिन शेष</span>
                </div>
                <h4 class="exam-card-title">${SecurityUtils.escapeHtml(exam.name)}</h4>
                <div class="exam-card-specs">
                  <span>👥 <strong>${SecurityUtils.escapeHtml(exam.vacancies)}</strong></span>
                  <span>•</span>
                  <span>💰 ${SecurityUtils.escapeHtml(exam.salary)}</span>
                  <span>•</span>
                  <span>🎓 ${SecurityUtils.escapeHtml(exam.qualifications)}</span>
                </div>
              </div>

              <div class="card-action-right">
                ${isSelected ? `
                  <button class="btn btn-outline btn-sm target-selected-btn" disabled>
                    <i data-lucide="check-circle" style="width:14px;height:14px;color:var(--color-success);"></i>
                    <span>सक्रिय लक्ष्य</span>
                  </button>
                ` : `
                  <button class="btn btn-primary btn-sm target-select-btn" onclick="window.aiAdvisorEngine.selectTargetExam('${exam.id}', JSON.parse(decodeURIComponent('${rawEscaped}')))">
                    <i data-lucide="target" style="width:14px;height:14px;"></i>
                    <span>लक्ष्य चुनें</span>
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * Retrieve cached advice
   */
  _getCachedAdvice() {
    try {
      const raw = localStorage.getItem(this.cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Cache valid for 15 minutes unless refreshed
      if (Date.now() - parsed.timestamp < 15 * 60 * 1000) {
        return parsed.data;
      }
    } catch (e) {}
    return null;
  }

  /**
   * Main entry point called when dashboard renders
   */
  async getAdvice(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = this._getCachedAdvice();
      if (cached) {
        this.renderAdvice(cached);
        return cached;
      }
    }
    return await this.generateLiveAdvice(false);
  }

  /**
   * Comprehensive Multi-Vector AI Analysis
   */
  async generateLiveAdvice(showToast = true) {
    const profile = window.examProfileManager ? (window.examProfileManager.loadProfile() || window.examProfileManager.getProfile()) : null;
    const stats = typeof getDashboardStats === 'function' ? await getDashboardStats() : { totalQuizzesTaken: 0, overallAccuracy: 0, dueCardsToday: 0, dayStreak: 1, totalNotesCount: 0 };
    const analytics = typeof getAnalyticsData === 'function' ? await getAnalyticsData() : { subjects: [] };
    const allExams = window.examService ? await window.examService.getAllExams().catch(() => []) : [];

    const studentName = (window.examProfileManager && window.examProfileManager.getStudentFirstName()) || 'Scholar';
    const qualification = (profile && profile.qualification) || 'General Student';

    // 1. Time Investment & Habit Audit
    const todayMinutes = this.timeTracker.getTodayMinutes();
    const weeklyMinutes = this.timeTracker.getWeeklyMinutes();
    const dailyAvgMinutes = this.timeTracker.getDailyAverageMinutes();

    // 2. Resolve Target Exam (Selected or Default)
    const targetExamId = this.getTargetExamId();
    let targetExam = null;

    if (targetExamId) {
      // 1. Check custom saved data in localStorage
      try {
        const savedData = localStorage.getItem(this.targetExamDataKey);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          if (String(parsed.id) === String(targetExamId)) {
            targetExam = parsed;
          }
        }
      } catch (e) {}

      // 2. Check preset catalog
      if (!targetExam) {
        targetExam = TARGET_EXAMS_CATALOG.find(e => String(e.id) === String(targetExamId));
      }

      // 3. Check live exams in database
      if (!targetExam && allExams.length > 0) {
        const liveMatch = allExams.find(e => String(e.id) === String(targetExamId));
        if (liveMatch) {
          targetExam = this._formatLiveExamToTarget(liveMatch);
        }
      }
    }

    // Benchmark recommended time
    const recommendedMinutes = targetExam ? targetExam.recommendedDailyMinutes : 45;
    const timeDeficit = Math.max(0, recommendedMinutes - todayMinutes);
    const isLowTime = todayMinutes < (recommendedMinutes * 0.5);

    // 3. Calculate Days Left for Target Exam
    let targetDaysLeft = null;
    let targetDateLabel = '';
    if (targetExam) {
      const targetDateStr = targetExam.examDate || targetExam.applicationEndDate || targetExam.applicationDeadline;
      if (targetDateStr) {
        let targetDateObj = new Date(targetDateStr);
        const now = new Date();
        // If target date has passed, advance 1 year to next cycle
        if (targetDateObj < now) {
          targetDateObj.setFullYear(targetDateObj.getFullYear() + 1);
        }
        const diffMs = targetDateObj - now;
        targetDaysLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        targetDateLabel = `Exam Date: ${targetDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      }
    }

    // 4. Target Exam Student Eligibility Evaluation
    let targetEligibility = { eligible: true, summary: 'Open Category Qualification' };
    if (targetExam && window.eligibilityEngine && profile) {
      const criteria = {
        qualifications: targetExam.requiredQualifications || ['GRADUATION'],
        minimumAge: 18,
        maximumAge: 32,
        allowedCategories: ['ALL']
      };
      const check = window.eligibilityEngine.checkEligibility(profile, criteria);
      targetEligibility = {
        eligible: check.eligible,
        summary: check.eligible 
          ? `✅ 100% Eligible based on your ${qualification} qualification`
          : `⚠️ Qualification / Age requirement verification required`
      };
    }

    // 5. Audit Underutilized Platform Features ("क्या लाभ नहीं ले रहे")
    const unutilizedBenefits = [];
    if (stats.totalQuizzesTaken === 0) {
      unutilizedBenefits.push({
        title: 'AI प्रश्नोत्तरी अभ्यास (AI Quiz Generation)',
        issue: 'आपने आज तक अपने सिलेबस या PDF नोट्स से AI MCQs उत्पन्न नहीं किए हैं।',
        solution: 'अपनी पाठ्यपुस्तक या किसी भी टॉपिक की PDF अपलोड करके 10 उच्च-स्तरीय MCQs तुरंत तैयार करें।',
        actionText: 'Generate AI Quiz',
        actionCmd: `app.navigate('create-quiz')`
      });
    }

    if (stats.dueCardsToday > 0 || (stats.totalCustomCards || 0) === 0) {
      unutilizedBenefits.push({
        title: 'फ्लैशकार्ड्स व स्मृति संरक्षण (Active Recall SRS)',
        issue: stats.dueCardsToday > 0 
          ? `आपके ${stats.dueCardsToday} फ्लैशकार्ड्स आज समीक्षा (Review) के लिए लंबित हैं। विस्मरण वक्र (Forgetting Curve) सक्रिय है!`
          : 'आपने अभी तक महत्वपूर्ण सूत्रों और शब्दावली के 3D फ्लैशकार्ड्स नहीं बनाए हैं।',
        solution: 'दैनिक 5-मिनट फ्लैशकार्ड रिव्यु से याददाश्त 3 गुना अधिक समय तक स्थायी रहती है।',
        actionText: 'Review Flashcards',
        actionCmd: `app.navigate('flashcards')`
      });
    }

    if (isLowTime) {
      unutilizedBenefits.push({
        title: '5-मिनट त्वरित AI ड्रिल (Speed & Agility Drill)',
        issue: `आज आपने केवल ${todayMinutes} मिनट अध्ययन किया है। त्वरित रिवीजन मिस हो रहा है।`,
        solution: 'परीक्षा-हॉल जैसे टाइमर दबाव में 5 तीव्र प्रश्नों को हल करके अपनी स्पीड बढ़ाएं।',
        actionText: 'Start 5-Min Drill',
        actionCmd: `app.launchQuickDrill()`
      });
    }

    if ((stats.totalNotesCount || 0) === 0) {
      unutilizedBenefits.push({
        title: 'स्टडी नोट्स वॉल्ट (Quick Revision Vault)',
        issue: 'आपके वॉल्ट में कोई त्वरित रिवीजन नोट्स संकलित नहीं हैं।',
        solution: 'कठिन विषयों के सारांश नोट्स तैयार करें ताकि परीक्षा से 48 घंटे पहले तेजी से दोहरा सकें।',
        actionText: 'Open Notes Vault',
        actionCmd: `app.navigate('study-notes')`
      });
    }

    // 6. Identify Weak & Strong Subjects
    let weakestSubject = null;
    if (analytics.subjects && analytics.subjects.length > 0) {
      const sorted = [...analytics.subjects].sort((a, b) => a.accuracy - b.accuracy);
      weakestSubject = sorted[0];
    }

    // 7. Calculate Comprehensive Preparedness Index (0 - 100)
    let readinessScore = 40;
    if (stats.totalQuizzesTaken > 0) {
      const quizFactor = Math.min(stats.totalQuizzesTaken * 3.5, 25);
      const accFactor = (stats.overallAccuracy || 50) * 0.35;
      const timeFactor = Math.min((todayMinutes / recommendedMinutes) * 20, 20);
      const streakFactor = Math.min((stats.dayStreak || 1) * 3, 15);
      readinessScore = Math.min(Math.round(readinessScore + quizFactor + accFactor + timeFactor + streakFactor - 35), 98);
    }

    // 8. Synthesize Deep Strategic Advisory Narrative
    let narrative = '';
    if (targetExam) {
      if (isLowTime) {
        narrative = `${studentName}, आपने आज हम्श विद्या पर केवल ${todayMinutes} मिनट का समय दिया है, जबकि ${targetExam.shortName} के लिए दैनिक कम से कम ${recommendedMinutes} मिनट का केंद्रित अभ्यास आवश्यक है (समय की कमी: -${timeDeficit} मिनट)। परीक्षा में ${targetDaysLeft !== null ? `${targetDaysLeft} दिन शेष हैं` : 'सीमित समय है'}। तुरंत नीचे दिए गए कमजोर विषयों के AI ड्रिल और फ्लैशकार्ड्स को पूरा करें।`;
      } else {
        narrative = `${studentName}, उत्कृष्ट अनुशासन! आपने आज ${todayMinutes} मिनट का समर्पित अध्ययन पूरा किया है। ${targetExam.shortName} में ${targetDaysLeft !== null ? `${targetDaysLeft} दिन शेष हैं` : 'सीमित समय है'}। आपका वर्तमान तैयारी सूचकांक ${readinessScore}% है। आज ${weakestSubject ? `${weakestSubject.name} के प्रश्नों पर` : 'अपने कोर मॉक टेस्ट पर'} ध्यान केंद्रित करें।`;
      }
    } else {
      if (isLowTime) {
        narrative = `${studentName}, आज आपका अध्ययन समय (${todayMinutes} मिनट) सामान्य मानक से कम है। प्रतियोगी परीक्षाओं में निरंतरता ही मेरिट तय करती है। ऊपर दिए गए लक्ष्य परीक्षा चयनकर्ता में से अपनी लक्षित परीक्षा चुनें ताकि AI आपको प्रतिदिन का सटीक रोडमैप और दिन-प्रतिदिन का काउंटडाउन प्रदान कर सके।`;
      } else {
        narrative = `${studentName}, आपकी अध्ययन निरंतरता सराहनीय है (${todayMinutes} मिनट आज सक्रिय)। अपनी तैयारी को 100x अधिक धारदार बनाने के लिए कृपया ऊपर अपनी 'लक्ष्य परीक्षा' चुनें, जिससे AI उसके संपूर्ण पाठ्यक्रम और कटऑफ के अनुसार आपको दैनिक रणनीति दे सके।`;
      }
    }

    const adviceData = {
      studentName,
      qualification,
      todayMinutes,
      weeklyMinutes,
      dailyAvgMinutes,
      recommendedMinutes,
      timeDeficit,
      isLowTime,
      targetExam,
      targetDaysLeft,
      targetDateLabel,
      targetEligibility,
      unutilizedBenefits,
      weakestSubject,
      readinessScore,
      narrative,
      availableExams: TARGET_EXAMS_CATALOG,
      allExamsCount: allExams.length,
      analyzedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Cache locally
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify({
        timestamp: Date.now(),
        data: adviceData
      }));
    } catch (e) {}

    this.renderAdvice(adviceData);

    if (showToast && window.app && window.app.showToast) {
      window.app.showToast('🤖 AI सारथी: पूर्ण अध्ययन व परीक्षा विश्लेषण अद्यतनम्', 'success');
    }

    return adviceData;
  }

  /**
   * Render the complete advisory UI
   */
  renderAdvice(data) {
    const container = document.getElementById('ai-advisor-content-box');
    if (!container || !data) return;

    const { targetExam, todayMinutes, recommendedMinutes, timeDeficit, isLowTime, targetDaysLeft, targetDateLabel, targetEligibility } = data;

    container.innerHTML = `
      <div class="ai-advisor-full-suite">
        <!-- TARGET EXAM SPOTLIGHT OR UNIFIED INVITATION BANNER -->
        ${targetExam ? `
          <!-- 1. MAJESTIC TARGET EXAM SPOTLIGHT BANNER (SHOWN WHEN EXAM SELECTED) -->
          <div class="target-exam-spotlight-banner animate-fade-in">
            <div class="spotlight-left-col">
              <div class="spotlight-top-bar">
                <div class="spotlight-category-chip">
                  <span>🏛️ ${SecurityUtils.escapeHtml(targetExam.category)}</span>
                  <span>•</span>
                  <span>${SecurityUtils.escapeHtml(targetExam.organizingBody)}</span>
                </div>
                <div class="spotlight-actions-group">
                  <button class="btn btn-outline btn-xs btn-change-target-exam" onclick="window.aiAdvisorEngine.openExamSelectorModal()" title="Select a different target exam from live list">
                    <i data-lucide="list-filter" style="width:12px;height:12px;"></i>
                    <span>लक्ष्य परीक्षा बदलें (Change Exam)</span>
                  </button>
                  <button class="btn btn-ghost btn-xs picker-reset-btn" onclick="window.aiAdvisorEngine.resetTargetExam()" title="Clear target selection">
                    <i data-lucide="x" style="width:12px;height:12px;"></i>
                    <span>Reset</span>
                  </button>
                </div>
              </div>
              
              <!-- BIG EXAM TITLE -->
              <h2 class="target-exam-title-big">
                ${SecurityUtils.escapeHtml(targetExam.name)}
              </h2>

              <!-- Key Specs Badges -->
              <div class="spotlight-meta-badges">
                <span class="spotlight-badge badge-eligibility">
                  ${targetEligibility.summary}
                </span>
                <span class="spotlight-badge badge-vacancies">
                  👥 ${SecurityUtils.escapeHtml(targetExam.vacancies)}
                </span>
                <span class="spotlight-badge badge-salary">
                  💰 ${SecurityUtils.escapeHtml(targetExam.salary)}
                </span>
              </div>

              <!-- Stages and Syllabus Blueprint -->
              <div class="spotlight-stages-text">
                <strong>चयन प्रक्रिया (Stages):</strong> ${SecurityUtils.escapeHtml(targetExam.stages)}
              </div>
              <div class="spotlight-syllabus-text">
                <strong>रणनीतिक फोकस:</strong> ${SecurityUtils.escapeHtml(targetExam.preparationRoadmap)}
              </div>
            </div>

            <!-- BIG DAYS COUNTDOWN BOX -->
            <div class="spotlight-countdown-card">
              <div class="countdown-card-header">
                <i data-lucide="clock" style="width:14px;height:14px;color:var(--color-gold);"></i>
                <span>उलटी गिनती (COUNTDOWN)</span>
              </div>
              <div class="countdown-number-giant">
                ${targetDaysLeft !== null ? targetDaysLeft : '—'}
              </div>
              <div class="countdown-label-giant">DAYS REMAINING</div>
              <div class="countdown-target-date">
                ${targetDateLabel || 'Notification Active'}
              </div>
              <button class="btn btn-primary btn-sm spotlight-cta-btn" onclick="app.navigate('create-quiz')">
                <i data-lucide="sparkles" style="width:14px;height:14px;"></i>
                <span>Practice ${SecurityUtils.escapeHtml(targetExam.shortName)} MCQs</span>
              </button>
            </div>
          </div>
        ` : `
          <!-- SINGLE UNIFIED TARGET EXAM INVITATION CARD (NO DUPLICATES, NO FIXED PILLS) -->
          <div class="target-exam-empty-banner animate-fade-in">
            <div class="empty-banner-left">
              <div class="empty-banner-icon-box">
                <span>🎯</span>
              </div>
              <div class="empty-banner-text">
                <div class="empty-banner-title-line">
                  <h4 class="empty-banner-title">अपनी लक्ष्य परीक्षा चुनें (Select Your Target Exam)</h4>
                  <span class="empty-banner-badge">वैकल्पिक / Optional</span>
                </div>
                <p class="empty-banner-desc">
                  आप जिस प्रतियोगी परीक्षा (UPSC, SSC, Railway, AIIMS, Banking, State PSC आदि) की तैयारी कर रहे हैं, उसे आगामी परीक्षाओं की लाइव सूची से चुनें। AI तुरंत उस परीक्षा का सटीक दिनों का काउंटडाउन, पाठ्यक्रम और दैनिक अध्ययन समय सीमा निर्धारित करेगा।
                </p>
              </div>
            </div>
            <div class="empty-banner-right">
              <button class="btn btn-primary btn-md btn-browse-live-cta" onclick="window.aiAdvisorEngine.openExamSelectorModal()" title="Open full live upcoming exams list from Exam Tab">
                <i data-lucide="list-filter" style="width:16px;height:16px;"></i>
                <span>🎯 आगामी परीक्षाओं की सूची खोलें (${data.allExamsCount || '69+'} Exams)</span>
              </button>
            </div>
          </div>
        `}

        <!-- 3. STUDY TIME INVESTMENT AUDIT + TODAY'S NARRATIVE -->
        <div class="ai-study-audit-grid">
          <!-- Left: Narrative & Preparedness Gauge -->
          <div class="ai-advisor-narrative-card">
            <div class="ai-narrative-header">
              <div class="ai-coach-tag">
                <span class="ai-pulse-dot"></span>
                <span>आज की रणनीतिक सलाह (Tactical Directive)</span>
              </div>
              <span class="ai-timestamp">Analyzed at ${data.analyzedAt}</span>
            </div>

            <p class="ai-narrative-text">
              “ ${SecurityUtils.escapeHtml(data.narrative)} ”
            </p>

            <!-- Exam Preparedness Index Bar -->
            <div class="readiness-meter-wrap">
              <div class="readiness-meter-header">
                <span class="readiness-title">Exam Preparedness Index (तैयारी सूचकांक)</span>
                <span class="readiness-value">${data.readinessScore}%</span>
              </div>
              <div class="readiness-track">
                <div class="readiness-bar" style="width: ${data.readinessScore}%;"></div>
              </div>
              <div class="readiness-caption">
                <span>Status: <strong>${data.readinessScore >= 75 ? '🔥 High Readiness' : data.readinessScore >= 50 ? '📈 Steady Growth' : '🌱 Foundational'}</strong></span>
                <span>Target Benchmark: <strong>${recommendedMinutes} mins/day</strong></span>
              </div>
            </div>
          </div>

          <!-- Right: Daily Study Time Audit Card -->
          <div class="ai-time-audit-card ${isLowTime ? 'time-card-warning' : 'time-card-good'}">
            <div class="time-card-header">
              <div class="time-title-wrap">
                <span class="time-icon">⏱️</span>
                <div>
                  <div class="time-headline">दैनिक अध्ययन समय विश्लेषण (Study Time Audit)</div>
                  <div class="time-subheadline">प्लेटफ़ॉर्म पर सक्रिय अध्ययन समय की ट्रैकिंग</div>
                </div>
              </div>
              <span class="time-status-pill ${isLowTime ? 'pill-deficit' : 'pill-met'}">
                ${isLowTime ? '⚠️ समय की कमी (Deficit)' : '✅ समय लक्ष्य पूर्ण'}
              </span>
            </div>

            <!-- Time Stats Grid -->
            <div class="time-metrics-row">
              <div class="time-stat-box">
                <span class="time-stat-num">${todayMinutes}</span>
                <span class="time-stat-unit">मिनट आज</span>
              </div>
              <div class="time-divider">/</div>
              <div class="time-stat-box">
                <span class="time-stat-num stat-recommended">${recommendedMinutes}</span>
                <span class="time-stat-unit">मिनट अनुशंसित</span>
              </div>
              <div class="time-stat-box stat-right">
                <span class="time-stat-num ${isLowTime ? 'stat-deficit' : 'stat-surplus'}">
                  ${isLowTime ? `-${timeDeficit}` : '+0'}
                </span>
                <span class="time-stat-unit">मिनट अंतर</span>
              </div>
            </div>

            <!-- Progress Bar of Time -->
            <div class="time-progress-track">
              <div class="time-progress-fill" style="width: ${Math.min(100, Math.round((todayMinutes / recommendedMinutes) * 100))}%;"></div>
            </div>

            <p class="time-audit-advice">
              ${isLowTime ? `
                <strong>सलाह:</strong> प्रतियोगी परीक्षाओं में 25 मिनट से कम अध्ययन से अवधारणाएं सुदृढ़ नहीं होतीं। कम से कम <strong>${timeDeficit} मिनट</strong> और पढ़ाई करके दैनिक लक्ष्य पूरा करें।
              ` : `
                <strong>सलाह:</strong> शानदार अध्ययन गति! आज का समय मानक पूरा हुआ। इसी एकाग्रता से अगले मॉक टेस्ट की तैयारी करें।
              `}
            </p>
          </div>
        </div>

        <!-- 4. WHAT BENEFITS YOU ARE NOT TAKING (वेबसाइट के जिन फीचर्स का लाभ नहीं ले रहे) -->
        ${data.unutilizedBenefits && data.unutilizedBenefits.length > 0 ? `
          <div class="unutilized-benefits-section">
            <div class="benefits-header">
              <div class="benefits-title-inline">
                <i data-lucide="alert-triangle" style="width:16px;height:16px;color:var(--color-gold);"></i>
                <span class="benefits-title">वेबसाइट के उपयोगी फीचर्स जिनका आप पूरा लाभ नहीं ले रहे (Underutilized Features):</span>
              </div>
              <span class="benefits-count-chip">${data.unutilizedBenefits.length} सुधार के अवसर मिले</span>
            </div>

            <div class="benefits-grid">
              ${data.unutilizedBenefits.map(b => `
                <div class="benefit-item-card">
                  <div class="benefit-card-top">
                    <span class="benefit-alert-badge">⚠️ मिस हो रहा है</span>
                    <button class="benefit-cta-btn" onclick="${b.actionCmd}">
                      <span>${b.actionText}</span>
                      <i data-lucide="arrow-right" style="width:12px;height:12px;"></i>
                    </button>
                  </div>
                  <div class="benefit-item-title">${SecurityUtils.escapeHtml(b.title)}</div>
                  <div class="benefit-item-issue">${SecurityUtils.escapeHtml(b.issue)}</div>
                  <div class="benefit-item-solution">💡 <strong>AI समाधान:</strong> ${SecurityUtils.escapeHtml(b.solution)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    if (window.app && window.app.refreshIcons) {
      window.app.refreshIcons();
    } else if (window.lucide) {
      window.lucide.createIcons();
    }
  }
}

// Global Singleton
window.aiAdvisorEngine = new AIAdvisorEngine();
