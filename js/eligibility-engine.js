/**
 * HAMSA VIDYA (हंस विद्या) — Smart Eligibility Engine
 * Pure logic module — no UI dependencies.
 * Compares a student profile against an exam's eligibility criteria.
 *
 * TWO THINGS THIS FILE HAS TO GET RIGHT
 *
 * 1. UNKNOWN IS NOT THE SAME AS SATISFIED.
 *    Listing pages never state an age limit, so an un-enriched exam arrives with
 *    `minimumAge: null, maximumAge: null`. The previous version returned `true`
 *    from the age check whenever both were absent, which meant "no age
 *    requirement" — and the exam came out as ELIGIBLE. That is a confident
 *    verdict on a criterion nobody has read. Absent criteria now produce
 *    'UNKNOWN', which downgrades the verdict to LIKELY_ELIGIBLE and names what
 *    is still missing.
 *
 * 2. MISSING PROFILE DATA MUST BE NAMED, NOT JUST COUNTED.
 *    "Complete your profile" is useless when nine fields are already filled.
 *    Every check that cannot run for want of a profile field records that field
 *    in `missingProfileFields`, so the UI can ask for exactly what it needs.
 *
 * The checks for gender, domicile, B.Ed and physical standards exist because the
 * profile already collects all four and nothing read them — so a female-only
 * post, a state-domicile post or a teaching post requiring B.Ed all came out
 * looking open to everyone.
 */

class EligibilityEngine {

  /**
   * Run full eligibility check.
   * @param {Object} profile — student profile from ExamProfileManager
   * @param {Object} examEligibility — exam.eligibility object
   * @returns {Object} structured eligibility result
   */
  checkEligibility(profile, examEligibility) {
    if (!profile || !examEligibility) {
      return this._buildResult('INCOMPLETE', false, false, {}, ['Profile or exam data is missing.'], []);
    }

    const ctx = {
      reasons: [],          // why not eligible — hard blockers
      warnings: [],         // notes worth reading
      unknowns: [],         // criteria the notification has not stated yet
      missingProfile: []    // profile fields needed to decide
    };

    const checks = {};
    checks.age = this._checkAge(profile, examEligibility, ctx);
    checks.qualification = this._checkQualification(profile, examEligibility, ctx);
    checks.percentage = this._checkPercentage(profile, examEligibility, ctx);
    checks.category = this._checkCategory(profile, examEligibility, ctx);
    checks.gender = this._checkGender(profile, examEligibility, ctx);
    checks.domicile = this._checkDomicile(profile, examEligibility, ctx);
    checks.teaching = this._checkTeachingQualification(profile, examEligibility, ctx);
    checks.physical = this._checkPhysicalStandards(profile, examEligibility, ctx);

    const hasManualRequirements = this._checkAdditionalRequirements(examEligibility, ctx);

    const values = Object.values(checks);
    const anyFailed = values.some(v => v === false);
    const anyUnknown = values.some(v => v === 'UNKNOWN');
    const anyVerify = values.some(v => v === 'VERIFY');

    // Criteria the notification is silent on, as recorded by the scraper and
    // narrowed by enrichment.
    const unknownFields = Array.isArray(examEligibility.unknownFields) ? examEligibility.unknownFields : [];

    let status, eligible, needsVerification;

    if (ctx.missingProfile.length > 0 && !anyFailed) {
      // A check could not run at all. Saying "eligible" or "not eligible" here
      // would both be guesses.
      status = 'INCOMPLETE';
      eligible = false;
      needsVerification = true;
    } else if (anyFailed) {
      status = 'NOT_ELIGIBLE';
      eligible = false;
      needsVerification = false;
    } else if (hasManualRequirements || anyVerify) {
      status = 'NEEDS_VERIFICATION';
      eligible = false;
      needsVerification = true;
    } else if (anyUnknown) {
      // Everything that could be checked passed, but the gating criteria are not
      // all published here yet. Positive, with the gap stated.
      status = 'LIKELY_ELIGIBLE';
      eligible = true;
      needsVerification = true;
      ctx.warnings.push(
        'You meet every criterion this notification states so far. ' +
        `${this._describeUnknowns(ctx.unknowns)} is not published on the listing — ` +
        'confirm it in the official notification.'
      );
    } else {
      status = 'ELIGIBLE';
      eligible = true;
      needsVerification = false;
    }

    const result = this._buildResult(status, eligible, needsVerification, checks, ctx.reasons, ctx.warnings);
    result.unknownCriteria = ctx.unknowns;
    result.missingProfileFields = ctx.missingProfile;
    result.unknownFields = unknownFields;
    return result;
  }

  _describeUnknowns(unknowns) {
    if (unknowns.length === 0) return 'Some criteria';
    if (unknowns.length === 1) return unknowns[0];
    return `${unknowns.slice(0, -1).join(', ')} and ${unknowns[unknowns.length - 1]}`;
  }

  // =======================================================================
  // CHECKS
  //
  // Each returns one of:
  //   true       satisfied
  //   false      blocked — a reason is pushed
  //   'VERIFY'   satisfied on paper, needs a human to confirm
  //   'UNKNOWN'  the notification does not state this criterion
  // =======================================================================

  /**
   * Age, with category relaxation and the notification's own cutoff date.
   */
  _checkAge(profile, elig, ctx) {
    const hasMin = elig.minimumAge !== null && elig.minimumAge !== undefined;
    const hasMax = elig.maximumAge !== null && elig.maximumAge !== undefined;

    // Not stated. Previously this returned true, which read as "no age limit" —
    // but every government post has one, so the honest answer is "not known".
    if (!hasMin && !hasMax) {
      ctx.unknowns.push('the age limit');
      return 'UNKNOWN';
    }

    if (!profile.dateOfBirth) {
      ctx.missingProfile.push({
        field: 'dateOfBirth',
        label: 'Date of birth',
        why: 'needed to check the age limit'
      });
      return 'UNKNOWN';
    }

    const cutoffDate = elig.ageCutoffDate || new Date().toISOString().split('T')[0];
    const ageAtCutoff = window.examProfileManager.calculateAgeAtDate(profile.dateOfBirth, cutoffDate);
    const cutoffIsAssumed = !elig.ageCutoffDate;

    let effectiveMaxAge = hasMax ? elig.maximumAge : Infinity;
    let relaxationApplied = 0;

    if (elig.categoryAgeRelaxation && profile.category && profile.category !== 'GENERAL') {
      const relaxation = elig.categoryAgeRelaxation[profile.category];
      if (relaxation && relaxation > 0) {
        relaxationApplied = relaxation;
        effectiveMaxAge += relaxation;
      }
    } else if (hasMax && profile.category && profile.category !== 'GENERAL' && !elig.categoryAgeRelaxation) {
      // Relaxation almost certainly exists but has not been read, and it is
      // usually 3–5 years — enough to flip a verdict. Do not rule anyone out.
      ctx.warnings.push(
        `Category relaxation for ${profile.category} is not stated in this notification. ` +
        'Reserved candidates normally get 3–5 extra years, which this check has not applied.'
      );
    }

    if (hasMin && ageAtCutoff < elig.minimumAge) {
      ctx.reasons.push(
        `Minimum age is ${elig.minimumAge} years. Your age on ${this._formatDate(cutoffDate)}` +
        `${cutoffIsAssumed ? ' (cutoff date not stated, using today)' : ''} is ${ageAtCutoff} years.`
      );
      return false;
    }

    if (hasMax && ageAtCutoff > effectiveMaxAge) {
      // Without a stated relaxation this could be a false rejection, so it is
      // reported as something to verify rather than a hard block.
      const couldBeRelaxed = profile.category && profile.category !== 'GENERAL' && !elig.categoryAgeRelaxation;

      let msg = `Maximum age is ${elig.maximumAge} years`;
      if (relaxationApplied > 0) {
        msg += ` (${effectiveMaxAge} with the stated ${profile.category} relaxation of +${relaxationApplied})`;
      }
      msg += `. Your age on ${this._formatDate(cutoffDate)} is ${ageAtCutoff} years.`;

      if (couldBeRelaxed) {
        ctx.warnings.push(`${msg} Category relaxation is not stated here and may still make you eligible.`);
        return 'VERIFY';
      }
      ctx.reasons.push(msg);
      return false;
    }

    if (hasMax && (effectiveMaxAge - ageAtCutoff) <= 1) {
      ctx.warnings.push(`Your age (${ageAtCutoff}) is within a year of the limit (${effectiveMaxAge}). Apply promptly.`);
    }
    if (relaxationApplied > 0) {
      ctx.warnings.push(`Age relaxation of +${relaxationApplied} years applied for ${profile.category}.`);
    }

    return true;
  }

  /**
   * Qualification, using the hierarchy so a higher degree satisfies a lower bar.
   */
  _checkQualification(profile, elig, ctx) {
    if (!elig.qualifications || elig.qualifications.length === 0) {
      ctx.unknowns.push('the required qualification');
      return 'UNKNOWN';
    }

    if (!profile.qualificationId) {
      ctx.missingProfile.push({
        field: 'qualificationId',
        label: 'Highest qualification',
        why: 'needed to check the education requirement'
      });
      return 'UNKNOWN';
    }

    const hierarchy = (typeof window !== 'undefined' && window.QUALIFICATION_HIERARCHY)
      || (typeof QUALIFICATION_HIERARCHY !== 'undefined' ? QUALIFICATION_HIERARCHY : {});
    const studentQual = hierarchy[profile.qualificationId];
    if (!studentQual) {
      ctx.reasons.push('Your qualification could not be recognised. Please update your profile.');
      return false;
    }

    const satisfiesAny = elig.qualifications.some(reqQualId =>
      studentQual.satisfies && studentQual.satisfies.includes(reqQualId)
    );

    if (!satisfiesAny) {
      const requiredLabels = elig.qualifications
        .map(q => (hierarchy[q] ? hierarchy[q].label : q))
        .join(', ');
      ctx.reasons.push(`Required: ${requiredLabels}. Your qualification: ${studentQual.label}.`);
      return false;
    }

    if (profile.qualificationId === 'GRADUATION_IN_PROGRESS') {
      const graduationRequired = elig.qualifications.some(q =>
        ['GRADUATION', 'BACHELORS', 'BA', 'BSC', 'BCOM', 'BTECH', 'BE', 'BCA', 'BBA'].includes(q)
      );
      if (graduationRequired) {
        ctx.warnings.push('Your graduation is in progress. Check whether the notification allows appearing candidates.');
        return 'VERIFY';
      }
    }

    return true;
  }

  /**
   * Percentage requirements. Silence here genuinely means "no bar", unlike age —
   * most notifications only state a percentage when one applies.
   */
  _checkPercentage(profile, elig, ctx) {
    let passed = true;

    const compare = (required, actual, label, profileField, profileLabel) => {
      if (required === null || required === undefined) return;
      if (actual === null || actual === undefined) {
        ctx.missingProfile.push({ field: profileField, label: profileLabel, why: `needed to check the ${label} requirement` });
        return;
      }
      if (actual < required) {
        ctx.reasons.push(`Minimum ${required}% in ${label} required. Yours: ${actual}%.`);
        passed = false;
      }
    };

    compare(elig.minimum10thPercentage, profile.tenthPercentage, '10th', 'tenthPercentage', '10th percentage');
    compare(elig.minimum12thPercentage, profile.twelfthPercentage, '12th', 'twelfthPercentage', '12th percentage');

    if (elig.minimumPercentage === null || elig.minimumPercentage === undefined) return passed;

    if (profile.score === null || profile.score === undefined) {
      ctx.missingProfile.push({
        field: 'score',
        label: 'Degree marks',
        why: 'needed to check the degree percentage requirement'
      });
      return passed;
    }

    let studentPercentage = profile.score;
    if (profile.scoreType === 'CGPA') {
      studentPercentage = profile.score * 9.5;
      ctx.warnings.push(
        `Your CGPA (${profile.score}) is about ${studentPercentage.toFixed(1)}% using the common ×9.5 formula. ` +
        'Your university may convert differently.'
      );
    }

    let effectiveMin = elig.minimumPercentage;
    if (elig.categoryPercentageRelaxation && profile.category && profile.category !== 'GENERAL') {
      const relaxation = elig.categoryPercentageRelaxation[profile.category];
      if (relaxation && relaxation > 0) {
        effectiveMin -= relaxation;
        ctx.warnings.push(`Percentage relaxation of ${relaxation}% applied for ${profile.category}. Effective minimum: ${effectiveMin}%.`);
      }
    }

    if (studentPercentage < effectiveMin) {
      ctx.reasons.push(
        `Minimum ${elig.minimumPercentage}% required in your qualification. ` +
        `Yours: ${studentPercentage.toFixed(1)}%.`
      );
      return false;
    }

    return passed;
  }

  /** Category — 'ALL' is the normal case. */
  _checkCategory(profile, elig, ctx) {
    if (!elig.allowedCategories || elig.allowedCategories.length === 0) return true;
    if (elig.allowedCategories.includes('ALL')) return true;

    if (!profile.category) {
      ctx.missingProfile.push({ field: 'category', label: 'Category', why: 'this post is reserved for specific categories' });
      return 'UNKNOWN';
    }

    if (!elig.allowedCategories.includes(profile.category)) {
      ctx.reasons.push(`Reserved for: ${elig.allowedCategories.join(', ')}. Your category: ${profile.category}.`);
      return false;
    }
    return true;
  }

  /**
   * Gender-restricted posts.
   *
   * The profile has collected `gender` all along and nothing read it, so
   * female-only Anganwadi and constable posts appeared open to male candidates
   * and vice versa.
   */
  _checkGender(profile, elig, ctx) {
    const restriction = elig.genderRestriction;
    if (!restriction) return true; // open to all, the normal case

    if (!profile.gender) {
      ctx.missingProfile.push({ field: 'gender', label: 'Gender', why: 'this post is restricted by gender' });
      return 'UNKNOWN';
    }

    const wanted = restriction === 'FEMALE_ONLY' ? 'FEMALE' : 'MALE';
    const actual = String(profile.gender).toUpperCase();

    if (actual !== wanted) {
      ctx.reasons.push(
        `This post is open to ${wanted.toLowerCase()} candidates only.`
      );
      return false;
    }
    ctx.warnings.push(`Reserved for ${wanted.toLowerCase()} candidates — you qualify.`);
    return true;
  }

  /**
   * State domicile. Treated as VERIFY rather than a hard block: domicile rules
   * usually allow certificates and long-term residence, not just birth state.
   */
  _checkDomicile(profile, elig, ctx) {
    const required = elig.domicileRequired;
    if (!required) return true;

    if (!profile.domicile) {
      ctx.missingProfile.push({ field: 'domicile', label: 'Home state', why: 'this post requires state domicile' });
      return 'UNKNOWN';
    }

    if (String(profile.domicile).toLowerCase() !== String(required).toLowerCase()) {
      ctx.warnings.push(
        `This post requires ${required} domicile and your profile says ${profile.domicile}. ` +
        'Check whether a domicile certificate or residence period qualifies you.'
      );
      return 'VERIFY';
    }
    return true;
  }

  /** Teaching posts that require B.Ed, which the profile records but nothing read. */
  _checkTeachingQualification(profile, elig, ctx) {
    const text = `${elig.qualificationText || ''} ${(elig.additionalRequirements || []).join(' ')}`;
    if (!/\bb\.?\s?ed\b|d\.?\s?el\.?\s?ed|teacher\s*training|\bctet\b|\btet\b/i.test(text)) return true;

    if (profile.hasBEd === undefined || profile.hasBEd === null) {
      ctx.missingProfile.push({
        field: 'hasBEd',
        label: 'B.Ed / teacher training',
        why: 'this teaching post requires a teaching qualification'
      });
      return 'UNKNOWN';
    }

    if (!profile.hasBEd) {
      ctx.reasons.push('This post requires B.Ed or an equivalent teacher-training qualification.');
      return false;
    }
    return true;
  }

  /**
   * Physical standards for uniformed posts. Never a hard block — the profile
   * records readiness, not measurements, so this can only flag it.
   */
  _checkPhysicalStandards(profile, elig, ctx) {
    if (!elig.physicalStandards) return true;

    ctx.warnings.push(`Physical standards apply: ${String(elig.physicalStandards).slice(0, 220)}`);

    if (profile.physicalFitnessReady === false) {
      ctx.warnings.push('Your profile says you are not ready for physical tests. Verify the exact standards before applying.');
    }
    return 'VERIFY';
  }

  _checkAdditionalRequirements(elig, ctx) {
    const reqs = elig.additionalRequirements;
    if (!reqs || reqs.length === 0) return false;
    reqs.forEach(req => ctx.warnings.push(`Manual check needed: ${req}`));
    return true;
  }

  _buildResult(status, eligible, needsVerification, checks, reasons, warnings) {
    return {
      // 'ELIGIBLE' | 'LIKELY_ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEEDS_VERIFICATION' | 'INCOMPLETE'
      status,
      eligible,
      needsVerification,
      // { age, qualification, percentage, category, gender, domicile, teaching, physical }
      // each true | false | 'VERIFY' | 'UNKNOWN'
      checks,
      reasons,
      warnings,
      unknownCriteria: [],
      missingProfileFields: [],
      unknownFields: []
    };
  }

  _formatDate(dateStr) {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }
}

/**
 * Statuses that mean "you can apply for this".
 * LIKELY_ELIGIBLE is ELIGIBLE with an "not everything is published yet" caveat,
 * so anything that filters, counts or sorts "eligible" exams must accept both.
 */
EligibilityEngine.POSITIVE_STATUSES = ['ELIGIBLE', 'LIKELY_ELIGIBLE'];

EligibilityEngine.isPositive = function (status) {
  return EligibilityEngine.POSITIVE_STATUSES.includes(status);
};

/**
 * Which profile fields would unlock the most verdicts across a list of exams.
 *
 * Drives a targeted prompt — "add your date of birth to check 34 more exams" —
 * instead of a generic "complete your profile" that says nothing about why.
 *
 * @param {Array} exams exams carrying `_eligibilityResult`
 * @returns {Array<{field:string, label:string, why:string, blockedCount:number}>}
 */
EligibilityEngine.summariseMissingProfileFields = function (exams) {
  const byField = new Map();

  for (const exam of exams || []) {
    const missing = exam?._eligibilityResult?.missingProfileFields || [];
    for (const m of missing) {
      if (!byField.has(m.field)) {
        byField.set(m.field, { ...m, blockedCount: 0 });
      }
      byField.get(m.field).blockedCount++;
    }
  }

  return [...byField.values()].sort((a, b) => b.blockedCount - a.blockedCount);
};

// Global singleton
window.eligibilityEngine = new EligibilityEngine();
window.isEligibilityPositive = EligibilityEngine.isPositive;
window.summariseMissingProfileFields = EligibilityEngine.summariseMissingProfileFields;
