/** Shared student defaults. No provider calls or automatic narration. */
class StudyPreferences {
  constructor() {
    this.storageKey = 'hamsa_study_preferences';
    this.defaults = { language: 'AUTO', level: 'AUTO', exam: '', depth: 'AUTO', voiceLanguage: 'AUTO', voiceURI: '', voiceRate: 0.95 };
    this.languages = [['AUTO', 'Use each tab’s default'], ['HINDI', 'हिन्दी'], ['HINGLISH', 'Hinglish'], ['ENGLISH', 'English'], ['BILINGUAL', 'हिन्दी + English']];
    this.levels = [['AUTO', 'Use academic profile / source'], ['CLASS_6_8', 'Class 6–8'], ['CLASS_9_10', 'Class 9–10'], ['CLASS_11_12', 'Class 11–12'], ['CLASS_12_SCIENCE', 'Class 12 Science'], ['COLLEGE', 'College / University'], ['SSC_CGL', 'SSC / CGL / CHSL'], ['BANKING_RAILWAY', 'Banking / Railway'], ['UPSC', 'UPSC / State PSC'], ['ADVANCED', 'Advanced']];
    this.depths = [['AUTO', 'Adapt to the question'], ['SIMPLE', 'Simple & concise'], ['DETAILED', 'Detailed, step by step']];
  }

  normalize(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const allowed = (key, choices) => choices.some(([id]) => id === value[key]) ? value[key] : this.defaults[key];
    const rate = Number(value.voiceRate);
    return { language: allowed('language', this.languages), level: allowed('level', this.levels),
      exam: String(value.exam || '').trim().slice(0, 120), depth: allowed('depth', this.depths),
      voiceLanguage: ['AUTO', 'HINDI', 'ENGLISH'].includes(value.voiceLanguage) ? value.voiceLanguage : 'AUTO',
      voiceURI: typeof value.voiceURI === 'string' ? value.voiceURI.slice(0, 500) : '',
      voiceRate: Number.isFinite(rate) && rate >= 0.6 && rate <= 1.4 ? rate : 0.95 };
  }

  get() {
    try { return this.normalize(JSON.parse(localStorage.getItem(this.storageKey) || '{}')); }
    catch { return { ...this.defaults }; }
  }

  save(value) {
    const normalized = this.normalize(value);
    localStorage.setItem(this.storageKey, JSON.stringify(normalized));
    return normalized;
  }

  teacherDefaults() {
    const p = this.get();
    return { selectedLanguage: p.language === 'AUTO' ? 'BILINGUAL' : p.language,
      selectedEducationLevel: p.level, selectedDepth: p.depth === 'AUTO' ? 'DETAILED' : p.depth };
  }

  noteDefaults() {
    const p = this.get();
    const level = p.level.startsWith('CLASS_') ? 'SCHOOL'
      : ['SSC_CGL', 'BANKING_RAILWAY', 'UPSC'].includes(p.level) ? 'COMPETITIVE' : p.level;
    return { language: p.language, level, exam: p.exam, depth: p.depth,
      classLevel: p.level === 'AUTO' ? '' : this.levels.find(([id]) => id === p.level)?.[1] || '' };
  }

  // Update only untouched defaults. A per-tab choice remains the student's choice.
  applyDefaults(target, defaults, marker) {
    const previous = target[marker];
    for (const [key, value] of Object.entries(defaults)) {
      if (!previous || target[key] === previous[key]) target[key] = value;
    }
    Object.defineProperty(target, marker, { value: { ...defaults }, writable: true, configurable: true, enumerable: false });
  }

  applySpeech(utterance, text = '') {
    const p = this.get();
    utterance.rate = p.voiceRate;
    if (p.voiceLanguage !== 'AUTO') utterance.lang = p.voiceLanguage === 'HINDI' ? 'hi-IN' : 'en-IN';
    else if (!utterance.lang) utterance.lang = /[\u0900-\u097f]/.test(text) || this.get().language === 'HINGLISH' ? 'hi-IN' : 'en-IN';
    const voices = window.speechSynthesis?.getVoices() || [];
    const language = utterance.lang.slice(0, 2).toLowerCase();
    const compatible = voices.filter(voice => voice.lang.toLowerCase().startsWith(language));
    const voice = compatible.find(voice => voice.voiceURI === p.voiceURI)
      || compatible.find(voice => voice.localService) || compatible[0];
    if (voice) utterance.voice = voice;
    return utterance;
  }
}
window.studyPreferences = new StudyPreferences();
