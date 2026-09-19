/**
 * HAMSA VIDYA (हंस विद्या) — Student Exam Profile Manager
 * Manages student academic profile for eligibility checking.
 * Uses LocalStorage for persistence (consistent with existing preference storage).
 */

const PROFILE_STORAGE_KEY = 'hamsa_exam_profile';

/**
 * Qualification hierarchy map.
 * Each qualification ID maps to an array of qualification levels it satisfies.
 * Used by the eligibility engine for flexible matching.
 */
const QUALIFICATION_HIERARCHY = {
  '10TH_PASS':        { level: 1, label: '10th Pass',              satisfies: ['10TH_PASS'] },
  '12TH_PASS':        { level: 2, label: '12th Pass',              satisfies: ['10TH_PASS', '12TH_PASS'] },
  'ITI':              { level: 2, label: 'ITI',                    satisfies: ['10TH_PASS', 'ITI'] },
  'DIPLOMA':          { level: 3, label: 'Diploma',                satisfies: ['10TH_PASS', '12TH_PASS', 'DIPLOMA'] },
  'GRADUATION_IN_PROGRESS': { level: 3, label: 'Graduation in Progress', satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION_IN_PROGRESS'] },
  'BA':               { level: 4, label: 'B.A.',                   satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'BA'] },
  'BSC':              { level: 4, label: 'B.Sc.',                  satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'BSC'] },
  'BCOM':             { level: 4, label: 'B.Com.',                 satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'BCOM'] },
  'BTECH':            { level: 4, label: 'B.Tech',                 satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'BTECH', 'BE'] },
  'BE':               { level: 4, label: 'B.E.',                   satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'BTECH', 'BE'] },
  'BCA':              { level: 4, label: 'BCA',                    satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'BCA'] },
  'BBA':              { level: 4, label: 'BBA',                    satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'BBA'] },
  'GRADUATION':       { level: 4, label: 'Graduation Completed',   satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS'] },
  'MCA':              { level: 5, label: 'MCA',                    satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'POST_GRADUATION', 'MASTERS', 'MCA'] },
  'MBA':              { level: 5, label: 'MBA',                    satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'POST_GRADUATION', 'MASTERS', 'MBA'] },
  'MA':               { level: 5, label: 'M.A.',                   satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'POST_GRADUATION', 'MASTERS', 'MA'] },
  'MSC':              { level: 5, label: 'M.Sc.',                  satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'POST_GRADUATION', 'MASTERS', 'MSC'] },
  'MCOM':             { level: 5, label: 'M.Com.',                 satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'POST_GRADUATION', 'MASTERS', 'MCOM'] },
  'POST_GRADUATION':  { level: 5, label: 'Post Graduation',        satisfies: ['10TH_PASS', '12TH_PASS', 'GRADUATION', 'BACHELORS', 'POST_GRADUATION', 'MASTERS'] },
  'OTHER':            { level: 3, label: 'Other',                  satisfies: ['OTHER'] }
};

/**
 * Dropdown options for qualification selector (display order).
 */
const QUALIFICATION_OPTIONS = [
  { id: '10TH_PASS', label: '10th Pass' },
  { id: '12TH_PASS', label: '12th Pass' },
  { id: 'ITI', label: 'ITI' },
  { id: 'DIPLOMA', label: 'Diploma' },
  { id: 'GRADUATION_IN_PROGRESS', label: 'Graduation in Progress' },
  { id: 'BA', label: 'B.A.' },
  { id: 'BSC', label: 'B.Sc.' },
  { id: 'BCOM', label: 'B.Com.' },
  { id: 'BTECH', label: 'B.Tech' },
  { id: 'BE', label: 'B.E.' },
  { id: 'BCA', label: 'BCA' },
  { id: 'BBA', label: 'BBA' },
  { id: 'GRADUATION', label: 'Graduation Completed' },
  { id: 'MCA', label: 'MCA' },
  { id: 'MBA', label: 'MBA' },
  { id: 'MA', label: 'M.A.' },
  { id: 'MSC', label: 'M.Sc.' },
  { id: 'MCOM', label: 'M.Com.' },
  { id: 'POST_GRADUATION', label: 'Post Graduation' },
  { id: 'OTHER', label: 'Other' }
];

const CATEGORY_OPTIONS = [
  { id: 'GENERAL', label: 'General' },
  { id: 'OBC', label: 'OBC' },
  { id: 'SC', label: 'SC' },
  { id: 'ST', label: 'ST' },
  { id: 'EWS', label: 'EWS' }
];

const STATE_OPTIONS = [
  '', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

// Expose globally for other scripts & views
if (typeof window !== 'undefined') {
  window.QUALIFICATION_HIERARCHY = QUALIFICATION_HIERARCHY;
  window.QUALIFICATION_OPTIONS = QUALIFICATION_OPTIONS;
  window.CATEGORY_OPTIONS = CATEGORY_OPTIONS;
  window.STATE_OPTIONS = STATE_OPTIONS;
}

class ExamProfileManager {
  constructor() {
    this._profile = null;
  }

  /**
   * Load profile from LocalStorage.
   * @returns {Object|null} The student profile or null if not saved.
   */
  loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return null;
      const profile = JSON.parse(raw);
      // Recalculate current age on load
      if (profile.dateOfBirth) {
        profile.age = this.calculateAgeAtDate(profile.dateOfBirth, new Date().toISOString().split('T')[0]);
      }
      this._migrateEducation(profile);
      this._profile = profile;
      return profile;
    } catch {
      return null;
    }
  }

  /**
   * Rebuild the `education` list for a profile saved before it existed.
   *
   * Older profiles stored a 10th percentage, a 12th percentage and one
   * `qualificationId`. Without this, opening the profile modal would show an
   * empty education section and a user who had already filled everything in
   * would appear to have lost it.
   *
   * Mutates in place and does not persist — saving happens only when the user
   * submits, so a read never silently rewrites their stored profile.
   */
  _migrateEducation(profile) {
    if (!profile || (Array.isArray(profile.education) && profile.education.length)) return;

    const rebuilt = [];

    if (profile.tenthPercentage !== null && profile.tenthPercentage !== undefined) {
      rebuilt.push({
        level: '10TH_PASS',
        institution: profile.tenthBoard || '',
        passingYear: profile.tenthPassingYear ?? null,
        scoreType: 'PERCENTAGE',
        score: profile.tenthPercentage
      });
    }

    if (profile.twelfthPercentage !== null && profile.twelfthPercentage !== undefined) {
      rebuilt.push({
        level: '12TH_PASS',
        institution: profile.twelfthStream || '',
        passingYear: profile.twelfthPassingYear ?? null,
        scoreType: 'PERCENTAGE',
        score: profile.twelfthPercentage
      });
    }

    // The old "highest qualification" becomes its own row, unless it is already
    // one of the two school rows above.
    if (profile.qualificationId && !['10TH_PASS', '12TH_PASS'].includes(profile.qualificationId)) {
      rebuilt.push({
        level: profile.qualificationId,
        institution: '',
        passingYear: null,
        scoreType: profile.scoreType === 'CGPA' ? 'CGPA' : 'PERCENTAGE',
        score: (profile.score === null || profile.score === undefined) ? null : profile.score
      });
    }

    profile.education = rebuilt;
  }

  /**
   * Collapse the education list into the flat fields the eligibility engine
   * reads, so nothing downstream had to change.
   *
   * The highest row wins for `qualificationId` and `score`, ranked by the level
   * numbers in QUALIFICATION_HIERARCHY rather than by list order — a user can
   * add their degree before their 10th and the answer must be the same.
   *
   * @returns {{qualificationId:string, score:number|null, scoreType:string,
   *            tenthPercentage:number|null, twelfthPercentage:number|null,
   *            tenthBoard:string, twelfthStream:string,
   *            tenthPassingYear:number|null, twelfthPassingYear:number|null}}
   */
  deriveFromEducation(education) {
    const rows = Array.isArray(education) ? education.filter(r => r && r.level) : [];

    const out = {
      qualificationId: '',
      score: null,
      scoreType: 'PERCENTAGE',
      tenthPercentage: null,
      twelfthPercentage: null,
      tenthBoard: '',
      twelfthStream: '',
      tenthPassingYear: null,
      twelfthPassingYear: null
    };
    if (rows.length === 0) return out;

    const levelOf = (id) => (QUALIFICATION_HIERARCHY[id]?.level ?? 0);
    const highest = rows.reduce((best, r) => (levelOf(r.level) > levelOf(best.level) ? r : best), rows[0]);

    out.qualificationId = highest.level;
    out.scoreType = highest.scoreType === 'CGPA' ? 'CGPA' : 'PERCENTAGE';
    out.score = (highest.score === null || highest.score === undefined || isNaN(highest.score))
      ? null : Number(highest.score);

    const tenth = rows.find(r => r.level === '10TH_PASS');
    if (tenth) {
      // A CGPA cannot be compared against a notification's "minimum 60% in
      // 10th", so it is converted with the common x9.5 formula. The engine
      // already warns the user that conversion is indicative.
      out.tenthPercentage = this._asPercentage(tenth);
      out.tenthBoard = tenth.institution || '';
      out.tenthPassingYear = tenth.passingYear ?? null;
    }

    const twelfth = rows.find(r => r.level === '12TH_PASS');
    if (twelfth) {
      out.twelfthPercentage = this._asPercentage(twelfth);
      out.twelfthStream = twelfth.institution || '';
      out.twelfthPassingYear = twelfth.passingYear ?? null;
    }

    return out;
  }

  /** A row's marks as a percentage, or null when none were given. */
  _asPercentage(row) {
    if (row.score === null || row.score === undefined || row.score === '' || isNaN(row.score)) return null;
    const n = Number(row.score);
    return row.scoreType === 'CGPA' ? Math.min(100, Math.round(n * 9.5 * 10) / 10) : n;
  }

  /**
   * Save profile to LocalStorage after validation.
   * @param {Object} data — raw form data
   * @returns {{ valid: boolean, errors: Object, profile: Object|null }}
   */
  /**
   * Save profile to LocalStorage after validation.
   * @param {Object} data — raw form data
   * @returns {{ valid: boolean, errors: Object, profile: Object|null }}
   */
  saveProfile(data) {
    const errors = this.validate(data);
    if (Object.keys(errors).length > 0) {
      return { valid: false, errors, profile: null };
    }

    const today = new Date().toISOString().split('T')[0];

    // The education list is the source of truth. Everything the eligibility
    // engine reads is derived from it, so the engine, the backup format and the
    // exam UI all keep working against the same field names as before.
    const education = this._normaliseEducation(data.education);
    const derived = this.deriveFromEducation(education);

    const profile = {
      fullName: (data.fullName || '').trim(),
      gender: data.gender || 'MALE',
      dateOfBirth: data.dateOfBirth,
      age: this.calculateAgeAtDate(data.dateOfBirth, today),
      category: data.category || 'GENERAL',
      domicile: data.domicile || '',

      // Every qualification the student entered, in the order they added them.
      education,

      // ---- derived, for the eligibility engine
      tenthPercentage: derived.tenthPercentage,
      tenthBoard: derived.tenthBoard,
      tenthPassingYear: derived.tenthPassingYear,

      twelfthPercentage: derived.twelfthPercentage,
      twelfthStream: derived.twelfthStream,
      twelfthPassingYear: derived.twelfthPassingYear,

      qualificationId: derived.qualificationId,
      qualification: this.getQualificationLabel(derived.qualificationId),
      scoreType: derived.scoreType,
      score: derived.score,

      // Special Qualifications
      hasBEd: data.hasBEd === true || data.hasBEd === 'true',
      physicalFitnessReady: data.physicalFitnessReady === true || data.physicalFitnessReady === 'true',

      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    this._profile = profile;

    // Trigger universal update across UI
    if (typeof window !== 'undefined' && window.app && window.app.updateGlobalStudentIdentity) {
      window.app.updateGlobalStudentIdentity();
    }

    return { valid: true, errors: {}, profile };
  }

  /**
   * Reset/delete profile.
   */
  resetProfile() {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    this._profile = null;
    if (typeof window !== 'undefined' && window.app && window.app.updateGlobalStudentIdentity) {
      window.app.updateGlobalStudentIdentity();
    }
  }

  /**
   * Get cached profile (call loadProfile first).
   */
  getProfile() {
    if (!this._profile) this.loadProfile();
    return this._profile;
  }

  /**
   * Get formatted student name for global display.
   * @returns {string}
   */
  getStudentName() {
    const p = this.getProfile();
    return (p && p.fullName) ? p.fullName.trim() : 'Scholar';
  }

  /**
   * Get student's first name.
   * @returns {string}
   */
  getStudentFirstName() {
    const name = this.getStudentName();
    return name.split(' ')[0] || 'Scholar';
  }

  /**
   * Get student initials for avatar circles (e.g. 'Sneha Sharma' -> 'SS').
   * @returns {string}
   */
  getStudentInitials() {
    const p = this.getProfile();
    if (!p || !p.fullName) return 'HV';
    const parts = p.fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * Check if profile is complete (all required academic & personal fields filled).
   * @returns {boolean}
   */
  isProfileComplete() {
    const p = this.getProfile();
    if (!p) return false;

    // One qualification is enough. Requiring a 10th AND a 12th percentage — as
    // this did before — locked a 10th-pass-only candidate out of the app
    // entirely, and those posts are a large share of what it lists.
    const hasEducation = (Array.isArray(p.education) && p.education.some(r => r && r.level)) || !!p.qualificationId;

    return !!(
      p.fullName &&
      p.dateOfBirth &&
      p.category &&
      hasEducation
    );
  }

  /**
   * Which profile fields the eligibility engine actually reads, and why.
   *
   * This is the bridge the app was missing. The form collected gender, domicile,
   * B.Ed and physical readiness from the start, and the engine read none of them
   * — so a female-only post or a state-domicile post looked open to everybody.
   * The engine reads all four now, and this table lets the UI explain what a
   * blank field costs the student instead of nagging them to "complete profile".
   *
   * `blocking` marks the fields without which a verdict cannot be reached at all.
   */
  getEligibilityFieldMeta() {
    return {
      dateOfBirth: { label: 'Date of birth', why: 'checks the age limit on every exam', blocking: true },
      qualificationId: { label: 'Highest qualification', why: 'checks the education requirement', blocking: true },
      category: { label: 'Social category', why: 'applies age and fee relaxation', blocking: true },
      gender: { label: 'Gender', why: 'some posts are reserved for one gender', blocking: false },
      domicile: { label: 'Home state', why: 'state posts require domicile', blocking: false },
      tenthPercentage: { label: '10th percentage', why: 'some posts set a minimum 10th score', blocking: false },
      twelfthPercentage: { label: '12th percentage', why: 'some posts set a minimum 12th score', blocking: false },
      score: { label: 'Degree marks', why: 'some posts set a minimum degree percentage', blocking: false },
      hasBEd: { label: 'B.Ed / teacher training', why: 'required for teaching posts', blocking: false },
      physicalFitnessReady: { label: 'Physical readiness', why: 'flags uniformed-service physical tests', blocking: false }
    };
  }

  /**
   * Engine-relevant fields that are currently empty.
   *
   * Booleans are excluded: `hasBEd: false` is an answer, not a blank.
   *
   * @returns {Array<{field, label, why, blocking}>}
   */
  getMissingEligibilityFields() {
    const p = this.getProfile();
    const meta = this.getEligibilityFieldMeta();
    if (!p) {
      return Object.entries(meta).map(([field, m]) => ({ field, ...m }));
    }

    const missing = [];
    for (const [field, m] of Object.entries(meta)) {
      const v = p[field];
      if (typeof v === 'boolean') continue;
      if (v === null || v === undefined || v === '') missing.push({ field, ...m });
    }
    return missing;
  }

  /**
   * How ready this profile is to produce real eligibility verdicts.
   *
   * Deliberately separate from `isProfileComplete()`, which gates the mandatory
   * onboarding modal. Widening that gate would re-block users who saved a
   * profile before `domicile` became a required field — so readiness is reported
   * here and prompted for in context, rather than by locking the app.
   *
   * @returns {{ready: boolean, percent: number, missing: Array, blocking: Array }}
   */
  getEligibilityReadiness() {
    const meta = this.getEligibilityFieldMeta();
    const missing = this.getMissingEligibilityFields();
    const total = Object.keys(meta).length;
    const blocking = missing.filter(m => m.blocking);

    return {
      ready: blocking.length === 0,
      percent: Math.round(((total - missing.length) / total) * 100),
      missing,
      blocking
    };
  }

  /**
   * Get profile completeness percentage.
   * @returns {number} 0–100
   */
  getProfileCompleteness() {
    const p = this.getProfile();
    if (!p) return 0;
    const required = ['fullName', 'dateOfBirth', 'qualificationId', 'category'];
    const optional = ['score', 'domicile', 'tenthPercentage', 'twelfthPercentage', 'gender'];
    let filled = 0;
    const total = required.length + optional.length;
    required.forEach(f => { if (p[f] !== null && p[f] !== undefined && p[f] !== '') filled++; });
    optional.forEach(f => { if (p[f] !== null && p[f] !== undefined && p[f] !== '') filled++; });
    return Math.round((filled / total) * 100);
  }

  /**
   * Validate profile form data.
   * @param {Object} data
   * @returns {Object} errors — keyed by field name
   */
  validate(data) {
    const errors = {};

    // Full Name
    const name = (data.fullName || '').trim();
    if (!name) {
      errors.fullName = 'Full name is required.';
    } else if (name.length < 2) {
      errors.fullName = 'Name must be at least 2 characters.';
    } else if (name.length > 100) {
      errors.fullName = 'Name must be under 100 characters.';
    }

    // Date of Birth
    if (!data.dateOfBirth) {
      errors.dateOfBirth = 'Date of birth is required.';
    } else {
      const dob = new Date(data.dateOfBirth);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(dob.getTime())) {
        errors.dateOfBirth = 'Invalid date of birth.';
      } else if (dob >= today) {
        errors.dateOfBirth = 'Date of birth cannot be today or in the future.';
      } else {
        const age = this.calculateAgeAtDate(data.dateOfBirth, today.toISOString().split('T')[0]);
        if (age < 10) {
          errors.dateOfBirth = 'Age must be at least 10 years.';
        } else if (age > 70) {
          errors.dateOfBirth = 'Please enter a valid date of birth.';
        }
      }
    }

    // Category
    if (!data.category) {
      errors.category = 'Please select your category.';
    }

    // Education list.
    //
    // 10th and 12th are no longer separately mandatory. Requiring both made the
    // form impossible to finish for a 10th-pass-only candidate — which is a
    // large share of the posts this app lists. One qualification is enough.
    const education = this._normaliseEducation(data.education);
    if (education.length === 0) {
      errors.education = 'Add at least one qualification.';
    } else {
      const seen = new Set();
      for (const row of education) {
        if (!QUALIFICATION_HIERARCHY[row.level]) {
          errors.education = 'One of the qualifications is not recognised.';
          break;
        }
        if (seen.has(row.level)) {
          errors.education = `${this.getQualificationLabel(row.level)} has been added twice.`;
          break;
        }
        seen.add(row.level);

        if (row.score !== null) {
          const max = row.scoreType === 'CGPA' ? 10 : 100;
          if (isNaN(row.score) || row.score < 0 || row.score > max) {
            errors.education = `${this.getQualificationLabel(row.level)}: marks must be between 0 and ${max}.`;
            break;
          }
        }

        if (row.passingYear !== null) {
          const maxYear = new Date().getFullYear() + 6;
          if (isNaN(row.passingYear) || row.passingYear < 1960 || row.passingYear > maxYear) {
            errors.education = `${this.getQualificationLabel(row.level)}: check the passing year.`;
            break;
          }
        }
      }
    }

    return errors;
  }

  /**
   * Coerce raw education rows into the stored shape.
   * Rows without a level are dropped — those are blank form rows.
   */
  _normaliseEducation(education) {
    if (!Array.isArray(education)) return [];
    return education
      .filter(r => r && r.level)
      .map(r => ({
        level: String(r.level),
        institution: String(r.institution || '').trim().slice(0, 120),
        passingYear: (r.passingYear === '' || r.passingYear === null || r.passingYear === undefined)
          ? null : parseInt(r.passingYear, 10),
        scoreType: r.scoreType === 'CGPA' ? 'CGPA' : 'PERCENTAGE',
        score: (r.score === '' || r.score === null || r.score === undefined)
          ? null : parseFloat(r.score)
      }));
  }

  /**
   * Validate profile and return structured validation result.
   * @param {Object} data
   * @returns {{ isValid: boolean, errors: Object }}
   */
  validateProfile(data) {
    const errors = this.validate(data);
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Accurate age calculation at a specific date.
   * Properly handles year/month/day and leap years.
   * Returns a Number object enriched with .years, .months, and .days properties,
   * behaving as a primitive number in comparisons (<, >, ==) while providing exact breakdown.
   * @param {string} dobStr — 'YYYY-MM-DD'
   * @param {string} refDateStr — 'YYYY-MM-DD' (cutoff date or today)
   * @returns {Number} age in completed years, with .years, .months, .days
   */
  calculateAgeAtDate(dobStr, refDateStr) {
    const dob = new Date(dobStr + 'T00:00:00');
    const ref = new Date(refDateStr + 'T00:00:00');

    if (isNaN(dob.getTime()) || isNaN(ref.getTime())) return 0;

    let years = ref.getFullYear() - dob.getFullYear();
    let months = ref.getMonth() - dob.getMonth();
    let days = ref.getDate() - dob.getDate();

    if (days < 0) {
      months--;
      const prevMonth = new Date(ref.getFullYear(), ref.getMonth(), 0);
      days += prevMonth.getDate();
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    const ageVal = Math.max(0, years);
    const ageObj = new Number(ageVal);
    ageObj.years = ageVal;
    ageObj.months = Math.max(0, months);
    ageObj.days = Math.max(0, days);
    return ageObj;
  }

  /**
   * Get display label for a qualification ID.
   * @param {string} qualId
   * @returns {string}
   */
  getQualificationLabel(qualId) {
    const entry = QUALIFICATION_HIERARCHY[qualId];
    return entry ? entry.label : qualId;
  }

  /**
   * Check if a student's qualification satisfies a required qualification.
   * @param {string} studentQualId — student's qualification ID
   * @param {string} requiredQualId — exam's required qualification ID
   * @returns {boolean}
   */
  qualificationSatisfies(studentQualId, requiredQualId) {
    const entry = QUALIFICATION_HIERARCHY[studentQualId];
    if (!entry) return false;
    return entry.satisfies.includes(requiredQualId);
  }
}

// Global singleton
window.examProfileManager = new ExamProfileManager();
