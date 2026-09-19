/**
 * HAMSA VIDYA (हंस विद्या) — AI Teacher & Pedagogical Explanation Service
 * Personal AI Tutor Engine: "Understand anything, step by step."
 * Supports Google Gemini API (Direct & Server Proxy) + Instant Offline Deterministic Engine
 */

class AiTeacherService {
  constructor() {
    this.systemPrompt = `You are HAMSA VIDYA's Master AI Teacher (हंस विद्या गुरु) — an expert personal tutor, educator, and pedagogical architect.
Your mission is NOT simply to give a dry, final answer.
Your mission is: "Teach the student so clearly that even a complete beginner can understand the concept from first principles."

PEDAGOGICAL TEACHING PRINCIPLES:
1. Assume the student may have ZERO prior knowledge. Start from absolute fundamentals.
2. Explain WHY and HOW, not merely WHAT.
3. If technical terms are used: define the term, explain the simple meaning, and give an everyday example.
4. For MATHEMATICAL problems: automatically switch to Math Teacher mode. List Given, What to Find, Formula with rationale, Step-by-step calculation with substitution, Final Answer with units, Verification Check, and Alternate mental trick when helpful.
5. For SCIENCE: explain the core process, ingredients/causes, mechanism, visual flowchart, and real-life relevance.
6. For HISTORY/GEOGRAPHY/POLITY: explain background, causes, chronological timeline (Cause → Event → Effect), key personalities, map/diagram ideas, and exam takeaways.
7. For COMPARISONS: provide a clear feature-by-feature comparison table.
8. If an analogy helps: provide a "Think of it like this..." analogy clearly marked as an analogy.
9. Highlight COMMON MISTAKES: show the ❌ Mistake vs ✅ Correct Understanding.
10. Provide an effortless MEMORY TRICK / MNEMONIC when helpful.
11. Adapt strictly to the selected LANGUAGE:
    - "BILINGUAL": Provide explanations with natural, student-friendly code-switching in BOTH Hindi and English. Important concepts must be explained in both languages.
    - "HINDI": Provide natural, pure, high-quality Hindi (सरल एवं स्पष्ट हिंदी).
    - "HINGLISH": Provide accessible, natural conversational Hinglish.
    - "ENGLISH": Provide clear, direct, accessible English.
12. Respect the DEPTH:
    - "QUICK": Concise answer + essential takeaways.
    - "STANDARD": Normal student-friendly explanation + 1 good example.
    - "DETAILED": Full step-by-step breakdown + foundation + analogy + example + flowchart + common mistakes + summary + 3 practice questions.
    - "DEEP_DIVE": In-depth conceptual mastery + prerequisites + advanced nuances + comprehensive diagram + 5 practice questions.
13. Respect the MODE:
    - "STUDENT": Maximum conceptual clarity, intuitive everyday connections, encouraging tone.
    - "EXAM": Adds syllabus relevance, high-yield keywords, potential exam traps, descriptive answer blueprint (Intro → Body → Conclusion).

IMPORTANT: Return ONLY valid JSON adhering strictly to the JSON schema below. Do not wrap with conversational filler or preamble.`;
  }

  /**
   * Resolve structured student educational context from existing profile and target exam
   */
  _resolveStudentContext(overrideLevel = 'AUTO') {
    let profile = null;
    if (typeof window !== 'undefined' && window.examProfileManager && typeof window.examProfileManager.loadProfile === 'function') {
      try {
        profile = window.examProfileManager.loadProfile();
      } catch (e) {}
    }
    if (!profile && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('hamsa_exam_profile');
        if (raw) profile = JSON.parse(raw);
      } catch (e) {}
    }

    let targetExam = null;
    if (typeof localStorage !== 'undefined') {
      try {
        const rawExam = localStorage.getItem('hamsa_target_exam_data');
        if (rawExam) targetExam = JSON.parse(rawExam);
      } catch (e) {}
    }

    // Extract student profile fields safely without duplicating or assuming
    const qualificationId = profile?.qualificationId || '';
    const qualificationLabel = profile?.qualification || '';
    const twelfthStream = profile?.twelfthStream || '';
    const targetExamName = targetExam ? (targetExam.shortName || targetExam.name || '') : '';
    const age = profile?.age || null;

    let effectiveLevel = 'CLASS_10';
    let tier = 'INTERMEDIATE'; // BEGINNER | INTERMEDIATE | ADVANCED | EXAM_FOCUSED
    let levelLabel = 'Class 10 (Secondary School)';
    let isExplicitOverride = false;

    if (overrideLevel && overrideLevel !== 'AUTO') {
      isExplicitOverride = true;
      switch (overrideLevel) {
        case 'CLASS_6':
          effectiveLevel = 'CLASS_6';
          tier = 'BEGINNER';
          levelLabel = 'Class 6 (Middle School: 10–12 yrs)';
          break;
        case 'CLASS_10':
          effectiveLevel = 'CLASS_10';
          tier = 'INTERMEDIATE';
          levelLabel = 'Class 10 (Secondary Board Level)';
          break;
        case 'CLASS_12_SCIENCE':
          effectiveLevel = 'CLASS_12_SCIENCE';
          tier = 'ADVANCED';
          levelLabel = 'Class 12 Science (PCM / PCB)';
          break;
        case 'CLASS_12':
          effectiveLevel = 'CLASS_12';
          tier = 'ADVANCED';
          levelLabel = 'Class 12 (Senior Secondary)';
          break;
        case 'UPSC':
          effectiveLevel = 'UPSC';
          tier = 'EXAM_FOCUSED';
          levelLabel = 'UPSC Civil Services Aspirant';
          break;
        case 'COLLEGE':
          effectiveLevel = 'COLLEGE';
          tier = 'ADVANCED';
          levelLabel = 'College / University Undergraduate';
          break;
        default:
          effectiveLevel = overrideLevel;
          tier = 'INTERMEDIATE';
          levelLabel = overrideLevel;
      }
    } else {
      // Automatic detection from stored profile & target exam
      if (targetExamName && targetExamName.trim().length > 0) {
        const isUPSC = targetExamName.toUpperCase().includes('UPSC') || targetExamName.toUpperCase().includes('IAS') || targetExamName.toUpperCase().includes('CIVIL');
        effectiveLevel = isUPSC ? 'UPSC' : 'COMPETITIVE_EXAM';
        tier = 'EXAM_FOCUSED';
        levelLabel = `Target Exam: ${targetExamName}`;
      } else if (qualificationId === '10TH_PASS') {
        effectiveLevel = 'CLASS_10';
        tier = 'INTERMEDIATE';
        levelLabel = 'Class 10 (Secondary School)';
      } else if (qualificationId === '12TH_PASS') {
        if (twelfthStream.toLowerCase().includes('science')) {
          effectiveLevel = 'CLASS_12_SCIENCE';
          tier = 'ADVANCED';
          levelLabel = `Class 12 (${twelfthStream})`;
        } else {
          effectiveLevel = 'CLASS_12';
          tier = 'ADVANCED';
          levelLabel = `Class 12 (${twelfthStream || 'Senior Secondary'})`;
        }
      } else if (qualificationId && qualificationId !== 'OTHER') {
        effectiveLevel = 'COLLEGE';
        tier = 'ADVANCED';
        levelLabel = `${qualificationLabel || 'University'}`;
      } else if (age && age <= 13) {
        effectiveLevel = 'CLASS_6';
        tier = 'BEGINNER';
        levelLabel = 'Class 6 (Middle School)';
      } else {
        effectiveLevel = 'CLASS_10';
        tier = 'INTERMEDIATE';
        levelLabel = 'General Student (Secondary)';
      }
    }

    return {
      educationLevel: effectiveLevel,
      academicTier: tier,
      levelLabel: levelLabel,
      isExplicitOverride: isExplicitOverride,
      targetExam: targetExamName || (effectiveLevel === 'UPSC' ? 'UPSC Civil Services' : null),
      stream: twelfthStream || null,
      qualification: qualificationLabel || null,
      learningPreference: 'CONCEPTUAL_AND_PRACTICAL',
      difficultyTier: tier
    };
  }

  /**
   * Main entry point to generate a complete structured explanation
   */
  async explain({
    question,
    language = 'BILINGUAL',
    depth = 'DETAILED',
    mode = 'STUDENT',
    educationLevel = 'AUTO',
    imageFile = null,
    pdfContext = null
  }) {
    if (!question || !question.trim()) {
      throw new Error('Please enter a question or topic to explain.');
    }

    const cleanQuestion = question.trim();
    const apiKey = (window.geminiService && window.geminiService.getApiKey()) || '';

    // Resolve structured student profile context
    const studentContext = this._resolveStudentContext(educationLevel);

    // Build complete user prompt with deep pedagogical directives
    const userPrompt = this._buildPrompt({
      question: cleanQuestion,
      language,
      depth,
      mode,
      studentContext,
      pdfContext
    });

    // If online and API key or server proxy is available, attempt Gemini generation
    let aiResponse = null;
    let geminiError = null;

    try {
      aiResponse = await this._callGeminiWithFallback(userPrompt, imageFile);
    } catch (err) {
      console.warn('AI Teacher Gemini API attempt failed, switching to Deterministic Pedagogical Engine:', err);
      geminiError = err.message;
    }

    if (aiResponse && aiResponse.success && aiResponse.data) {
      aiResponse.data.studentContext = studentContext;
      return {
        success: true,
        data: aiResponse.data,
        source: 'GEMINI_AI',
        model: aiResponse.model || 'Gemini 2.5 Flash',
        studentContext
      };
    }

    // Fallback: Use High-Precision Offline Pedagogical Engine adapted to studentContext
    const fallbackData = this.getDeterministicExplanation({
      question: cleanQuestion,
      language,
      depth,
      mode,
      studentContext
    });
    fallbackData.studentContext = studentContext;

    return {
      success: true,
      data: fallbackData,
      source: 'BUILTIN_PEDAGOGICAL_ENGINE',
      model: 'Hamsa Offline Wisdom Engine',
      studentContext,
      notice: geminiError ? `AI live service notice: ${geminiError}. Displaying personalized built-in curriculum.` : null
    };
  }

  /**
   * Asks a contextual follow-up question
   */
  async askFollowUp({
    originalQuestion,
    previousExplanation,
    followUpQuery,
    language = 'BILINGUAL',
    educationLevel = 'AUTO',
    studentContext = null
  }) {
    const ctx = studentContext || this._resolveStudentContext(educationLevel);
    const prompt = `You are the personal AI Teacher teaching a student at the ${ctx.levelLabel || ctx.educationLevel} level.
Context of original topic: "${originalQuestion}"
Previous explanation summary: "${previousExplanation.quickAnswer || previousExplanation.topic || ''}"

The student now asks a follow-up doubt:
"${followUpQuery}"

PEDAGOGICAL DIRECTIVES:
- Adapt your answer strictly to their educational level (${ctx.levelLabel}).
- If Class 5-6: Use short simple words and everyday analogies.
- If Class 10: Use board-exam level accuracy and clear reasoning.
- If Class 12 Science: Use subject terminology, reaction mechanisms, or mathematical precision.
- If UPSC: Connect conceptually to governance, ecological, or socio-economic context.
- Language: ${language} (if BILINGUAL, explain in natural Hindi + English).

Include:
1. Direct clear answer to the doubt
2. A simple clarifying example suited to their level
3. "Think of it like this" mini-analogy if helpful
4. 1 quick check question to see if they understood

Respond in clean, structured JSON:
{
  "followUpAnswer": "Clear, friendly explanation...",
  "clarifyingExample": "Short illustrative example...",
  "miniAnalogy": "Brief mental model...",
  "checkQuestion": "Did that make sense? Try this quick check: ..."
}`;

    try {
      const response = await this._callGeminiRaw(prompt);
      const parsed = this._parseJsonSafely(response);
      if (parsed) return parsed;
    } catch (e) {
      console.warn('Follow-up Gemini error:', e);
    }

    // Offline follow-up response tailored to educationLevel
    if (ctx.educationLevel === 'CLASS_6') {
      return {
        followUpAnswer: language === 'HINDI'
          ? `"${followUpQuery}" के बारे में: यह बहुत अच्छा सवाल है! जैसे खेल में हर नियम अगले कदम से जुड़ा होता है, वैसे ही यह बात हमारे मुख्य विषय (${originalQuestion}) से बिल्कुल सीधे जुड़ी है।`
          : `Regarding "${followUpQuery}": That is a great question! Just like in an everyday game where each step depends on the previous one, this part connects directly to our main story of "${originalQuestion}".`,
        clarifyingExample: `Imagine you change one small toy in your game — the whole play naturally changes! That is exactly what happens here.`,
        miniAnalogy: `Think of it like adding a pinch of salt to a dish: it brings the whole recipe together.`,
        checkQuestion: `Does that feel simple and clear? Can you tell me in 3 words what you think happens next?`
      };
    }

    if (ctx.educationLevel === 'UPSC' || ctx.academicTier === 'EXAM_FOCUSED') {
      return {
        followUpAnswer: language === 'HINDI'
          ? `"${followUpQuery}" के संदर्भ में: मुख्य परीक्षा (Mains) एवं प्रारंभिक परीक्षा दोनों के दृष्टिकोण से यह एक अत्यंत महत्वपूर्ण आयाम है। यह अवधारणा "${originalQuestion}" के संस्थागत, नीतिगत और व्यावहारिक प्रभावों को स्पष्ट करती है।`
          : `Regarding "${followUpQuery}" in relation to "${originalQuestion}": From a civil services examination perspective (both Prelims and Mains), this point forms a crucial structural link connecting core theoretical principles to policy outcomes and real-world implications.`,
        clarifyingExample: `In contemporary governance and policy dynamics, any shift in this parameter directly influences regulatory compliance and socio-economic indicators.`,
        miniAnalogy: `Think of it as the institutional feedback loop in systemic policy formulation.`,
        checkQuestion: `Consider how this perspective enhances a structured multi-dimensional GS Mains answer.`
      };
    }

    return {
      followUpAnswer: language === 'HINDI'
        ? `"${followUpQuery}" के संदर्भ में: यह मूल विषय (${originalQuestion}) का एक महत्वपूर्ण पहलू है। इसके मूल सिद्धांत प्रत्यक्ष रूप से परस्पर जुड़े हुए हैं।`
        : `Regarding "${followUpQuery}" in relation to "${originalQuestion}": This is a crucial follow-up point. In ${language === 'BILINGUAL' ? 'Hindi & English' : 'simple terms'}, the core reason is that the foundational principles work together dynamically to produce this exact outcome.`,
      clarifyingExample: `For instance, if you change one key factor in "${originalQuestion}", the resulting impact naturally shifts accordingly.`,
      miniAnalogy: `Think of it like tuning an instrument: adjusting this variable harmonizes the whole concept.`,
      checkQuestion: `Can you see how this directly connects back to our main topic?`
    };
  }

  /**
   * Rewrites the explanation to be even simpler for beginners
   */
  async makeItSimpler({ question, currentExplanation, language = 'BILINGUAL', educationLevel = 'AUTO', studentContext = null }) {
    const ctx = studentContext || this._resolveStudentContext(educationLevel);
    const prompt = `You are the AI Teacher. The student found this explanation a bit tricky and clicked "Make it Simpler".
STUDENT PROFILE: ${ctx.levelLabel || ctx.educationLevel}
TOPIC: "${question}"
CURRENT QUICK ANSWER: "${currentExplanation.quickAnswer || ''}"

Rewrite the explanation using:
- Grade 4-5 level vocabulary
- Very short sentences
- An everyday, relatable analogy (e.g. food, sports, pocket money, family, cartoon)
- Natural ${language}
- Zero jargon. If a technical term is necessary, explain it like a story.

Respond in JSON:
{
  "simplerQuickAnswer": "Super simple 1-sentence answer",
  "storyExplanation": "Step-by-step story or ultra-simple explanation...",
  "everydayAnalogy": "Think of it like: ...",
  "funCheck": "Fun, easy question to test understanding"
}`;

    try {
      const response = await this._callGeminiRaw(prompt);
      const parsed = this._parseJsonSafely(response);
      if (parsed) return parsed;
    } catch (e) {
      console.warn('Make simpler Gemini error:', e);
    }

    return {
      simplerQuickAnswer: language === 'HINDI'
        ? `सरल शब्दों में: ${question} का मतलब है सबसे आसान तरीके से बुनियादी नियम को समझना।`
        : `In the simplest words: ${question} just means understanding the core rule in everyday terms without complex jargon.`,
      storyExplanation: language === 'BILINGUAL'
        ? `कल्पना कीजिए कि आपके पास 10 चॉकलेट हैं और आप उन्हें दोस्तों में बांट रहे हैं। ठीक इसी तरह यह सिद्धांत काम करता है! (Imagine you have a simple everyday task — this rule just guides how each step naturally follows the previous one.)`
        : `Imagine a friendly everyday situation where everything happens step-by-step. Each part relies simply on the previous part!`,
      everydayAnalogy: `Think of it like a staircase: you take one small, easy step at a time until you reach the top effortlessly.`,
      funCheck: `If someone asks you this in 5 words, what would you tell them?`
    };
  }

  /**
   * Generates a completely new, fresh example
   */
  async generateAnotherExample({ question, currentExplanation, language = 'BILINGUAL', educationLevel = 'AUTO', studentContext = null }) {
    const ctx = studentContext || this._resolveStudentContext(educationLevel);
    const prompt = `You are the AI Teacher. The student clicked "Another Example" for:
STUDENT PROFILE: ${ctx.levelLabel || ctx.educationLevel}
TOPIC: "${question}"
EXISTING EXAMPLES: ${JSON.stringify((currentExplanation.examples || []).map(e => e.title || e.description))}

Generate a BRAND NEW, completely different, practical real-life example tailored to this student's level (${ctx.levelLabel}).
Language: ${language}

Respond in JSON:
{
  "title": "Fresh Example Title",
  "scenario": "The real life everyday or exam situation...",
  "howItApplies": "How this proves the concept...",
  "takeaway": "What the student should remember"
}`;

    try {
      const response = await this._callGeminiRaw(prompt);
      const parsed = this._parseJsonSafely(response);
      if (parsed) return parsed;
    } catch (e) {
      console.warn('Another example Gemini error:', e);
    }

    if (ctx.educationLevel === 'CLASS_6') {
      return {
        title: 'Playground & Toy Box Scenario',
        scenario: `Think of trading marbles or coloring sketchbooks with your best friend at school.`,
        howItApplies: `Notice how you trade fair and square: exactly the same simple rule of ${question} applies here!`,
        takeaway: `Keep this fun playground picture in mind whenever you think of ${question}!`
      };
    }

    if (ctx.educationLevel === 'UPSC') {
      return {
        title: 'Public Administration & Macro-Policy Case Study',
        scenario: `Consider a real-time District Administration or Reserve Bank of India policy intervention in rural markets.`,
        howItApplies: `The structural dynamics of ${question} directly dictate the policy outcomes and citizen service delivery here.`,
        takeaway: `Use this practical governance case study for analytical depth in your GS Mains answers.`
      };
    }

    return {
      title: 'Real-Life Everyday Scenario',
      scenario: `Consider a daily life situation involving local market shopping or smartphone battery usage.`,
      howItApplies: `Notice how the exact same rule of ${question} applies seamlessly here without changing any core logic.`,
      takeaway: `Whenever you see this concept, picture this practical scenario in your mind!`
    };
  }

  /**
   * Expands on a specific concept or section
   */
  async explainConceptMore({ concept, contextQuestion, language = 'BILINGUAL' }) {
    const prompt = `You are the AI Teacher. The student clicked "Explain More" specifically on the sub-concept: "${concept}".
BROADER QUESTION: "${contextQuestion}"
Language: ${language}

Deeply explain ONLY this specific sub-concept:
1. What is it precisely?
2. Why is it vital to the whole topic?
3. How does it work internally?
4. A concrete microscopic example.

Respond in JSON:
{
  "subConcept": "${concept}",
  "deepDiveExplanation": "Detailed, crystal-clear breakdown...",
  "internalMechanism": "How it functions step-by-step...",
  "microExample": "Specific concrete example...",
  "examInsight": "High-yield fact for competitive exams"
}`;

    try {
      const response = await this._callGeminiRaw(prompt);
      const parsed = this._parseJsonSafely(response);
      if (parsed) return parsed;
    } catch (e) {
      console.warn('Explain more Gemini error:', e);
    }

    return {
      subConcept: concept,
      deepDiveExplanation: `Diving deeper into "${concept}": This component forms the structural backbone of the entire mechanism.`,
      internalMechanism: `1. Signal/Input receives data. 2. Processing applies the specific rule. 3. Output delivers the verified outcome.`,
      microExample: `In a real-world system, without ${concept}, the entire sequence would stall or produce erroneous results.`,
      examInsight: `Examiners frequently test this precise term because students often confuse it with its parent category.`
    };
  }

  // =========================================================================
  // INTERNAL PROMPT BUILDER
  // =========================================================================

  _buildPrompt({ question, language, depth, mode, studentContext = null, pdfContext }) {
    const ctx = studentContext || this._resolveStudentContext();
    let pedagogicalDirectives = '';

    switch (ctx.educationLevel) {
      case 'CLASS_6':
        pedagogicalDirectives = `
STUDENT EDUCATIONAL PROFILE: Class 5–6 (Middle School level, ~11 years old).
PEDAGOGICAL TEACHING RULES FOR THIS STUDENT:
- Vocabulary: Ultra-simple language, friendly conversational tone, short easy sentences.
- Conceptual Depth: Explain from absolute ground zero. Use everyday concrete objects (chocolates, playground, toys, kitchen, bicycles).
- Science: Use simple 3-4 step chains. Do NOT introduce complex chemical equations, stoichiometry, or microscopic cell organelles unless explained like a simple cartoon story.
- Mathematics: Explain what variables like 'x' or '%' mean (e.g. 'x' is a mystery gift box). Explain WHY each operation is performed step by step.
- Flowcharts/Diagrams: Keep to 3 simple intuitive blocks.
- Output Difficulty Field: MUST be "BEGINNER".`;
        break;

      case 'CLASS_10':
        pedagogicalDirectives = `
STUDENT EDUCATIONAL PROFILE: Class 9–10 (Secondary School level, preparing for 10th Board Exams).
PEDAGOGICAL TEACHING RULES FOR THIS STUDENT:
- Vocabulary: Standard secondary school terminology (CBSE/State Board level).
- Conceptual Depth: Clear definitions, balanced chemical equations (e.g., 6CO2 + 6H2O -> C6H12O6 + 6O2), standard algebraic proofs, and anatomical parts (chloroplast, stomata, guard cells).
- Exam Focus: Highlight 10th Board high-yield keywords, standard laws, and common board exam traps.
- Output Difficulty Field: MUST be "INTERMEDIATE".`;
        break;

      case 'CLASS_12_SCIENCE':
        pedagogicalDirectives = `
STUDENT EDUCATIONAL PROFILE: Class 11–12 Senior Secondary Science (${ctx.stream || 'Science PCM/PCB'} - CBSE/NEET/JEE level).
PEDAGOGICAL TEACHING RULES FOR THIS STUDENT:
- Vocabulary: Rigorous academic and scientific nomenclature.
- Biology/Chemistry: Detail cellular organelles, biochemical cycles (e.g. for Photosynthesis: Light-dependent reactions in thylakoid membranes, Photosystem II (P680) & Photosystem I (P700), Z-scheme, photolysis of water, non-cyclic & cyclic photophosphorylation, Calvin cycle in stroma, RuBisCO enzyme, C3 vs C4 pathways), thermodynamic equations, and reaction mechanisms.
- Mathematics: Rigorous algebraic proofs, domain/range, and calculus/analytical formulations where relevant.
- Do NOT waste time repeating middle school basics; teach with senior secondary rigor.
- Output Difficulty Field: MUST be "ADVANCED".`;
        break;

      case 'UPSC':
      case 'COMPETITIVE_EXAM':
        pedagogicalDirectives = `
STUDENT EDUCATIONAL PROFILE: Competitive Examination Aspirant (Target: ${ctx.targetExam || 'UPSC Civil Services / State PCS / Central Exams'}).
PEDAGOGICAL TEACHING RULES FOR THIS STUDENT:
- Multidisciplinary Perspective: Integrate Science & Tech, Environment, Governance, Economy, and International Treaties (UNFCCC, COP, Paris Agreement).
- If Economics (e.g. Inflation): Explain Demand-Pull vs Cost-Push, Headline vs Core, WPI vs CPI indices, RBI Monetary Policy Committee (MPC) mechanism, Repo rate transmission, and socio-economic impact on vulnerable sections.
- If Science/Ecology: Highlight environmental significance, carbon cycle, carbon sequestration, Blue Carbon, Green Hydrogen, and ecological services.
- Answer-Writing Blueprint: Provide a crisp GS Mains Answer blueprint (Introduction → Core Dimensions/Body → Critical Evaluation → Policy/Way Forward).
- High-yield facts for Prelims MCQs and conceptual clarity for Mains.
- Output Difficulty Field: MUST be "EXAM_FOCUSED".`;
        break;

      case 'COLLEGE':
        pedagogicalDirectives = `
STUDENT EDUCATIONAL PROFILE: College / University Undergraduate (${ctx.qualification || 'Undergraduate'}).
PEDAGOGICAL TEACHING RULES FOR THIS STUDENT:
- Vocabulary: University-level academic rigor, theoretical frameworks, and research/industrial applications.
- Output Difficulty Field: MUST be "ADVANCED".`;
        break;

      default:
        pedagogicalDirectives = `
STUDENT EDUCATIONAL PROFILE: ${ctx.levelLabel || 'Secondary Level'}.
PEDAGOGICAL TEACHING RULES: Adapt explanation depth, terminology, and analogies smoothly to this level.`;
    }

    return `${this.systemPrompt}

PERSONALIZED STUDENT CONTEXT:
${pedagogicalDirectives}

PRIVACY & PEDAGOGICAL TONE PRINCIPLE:
- Adapt explanation depth, vocabulary, and pedagogical complexity NATURALLY.
- Do NOT explicitly recite private demographics (e.g. do NOT say "Since you are 16 years old..." or "Because of your profile...").
- Teach directly at their wavelength.

STUDENT REQUEST:
Question / Concept: "${question}"
Selected Language: ${language}
Explanation Depth: ${depth}
Mode: ${mode}
${pdfContext ? `Attached Document Context: """${pdfContext.substring(0, 3000)}"""` : ''}

You MUST return a JSON object with this exact structure:
{
  "subject": "Mathematics | Science | History | Geography | Polity | Economy | Technology | English | Hindi | General Studies",
  "topic": "Concise topic title",
  "difficulty": "BEGINNER | INTERMEDIATE | ADVANCED",
  "isMath": false,
  "quickAnswer": "Direct, clear, punchy answer in 1-2 sentences",
  "foundation": {
    "title": "Let's Understand (Starting from Zero)",
    "explanation": "Assume zero knowledge. Build from ground up with simple words...",
    "technicalTerms": [
      { "term": "Term Name", "simpleMeaning": "Simple meaning", "example": "Everyday example" }
    ]
  },
  "steps": [
    { "stepNumber": 1, "title": "Step title", "content": "Clear progressive explanation" },
    { "stepNumber": 2, "title": "Step title", "content": "Clear progressive explanation" }
  ],
  "whyAndHow": {
    "what": "What is it?",
    "why": "Why does this happen / Why does it matter?",
    "how": "How does it work step by step?",
    "when": "When is it used / When does it occur?",
    "where": "Where does it apply in real life?"
  },
  "examples": [
    {
      "type": "Everyday Life | Practical | Numerical | School Level",
      "title": "Example Title",
      "description": "Relatable scenario showing the concept clearly"
    }
  ],
  "analogy": {
    "hook": "Think of it like this...",
    "analogyText": "A vivid, relatable analogy (e.g., CPU is like the chef in a kitchen)",
    "takeaway": "Why this mental model makes it unforgettable"
  },
  "mathSolution": {
    "given": "Given parameters if applicable, else empty string",
    "toFind": "What to calculate if applicable, else empty string",
    "formula": "Formula used if applicable, else empty string",
    "formulaExplanation": "Why this formula applies",
    "calculationSteps": [
      { "step": "Step 1", "math": "20% of 500 = 20/100 * 500", "explanation": "Explanation of calculation" }
    ],
    "finalAnswer": "Final calculated answer with units",
    "verification": "Check: How to verify answer is 100% correct",
    "alternateMethod": "Alternate short trick or mental shortcut"
  },
  "flowchart": {
    "title": "Visual Process Flow",
    "nodes": [
      { "label": "Stage 1", "description": "Brief description" },
      { "label": "Stage 2", "description": "Brief description" },
      { "label": "Stage 3", "description": "Brief description" }
    ]
  },
  "diagram": {
    "title": "Concept Diagram",
    "type": "svg",
    "svgContent": "<svg viewBox='0 0 500 180' xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' style='background:transparent;'><defs><linearGradient id='diagGrad' x1='0%' y1='0%' x2='100%' y2='0%'><stop offset='0%' stop-color='#4F46E5'/><stop offset='100%' stop-color='#06B6D4'/></linearGradient></defs><rect x='30' y='50' width='120' height='70' rx='12' fill='url(#diagGrad)' opacity='0.85'/><text x='90' y='90' fill='#ffffff' font-family='sans-serif' font-size='14' font-weight='bold' text-anchor='middle'>Input</text><path d='M 155 85 L 205 85' stroke='#F59E0B' stroke-width='3' marker-end='url(#arrow)'/><rect x='210' y='50' width='120' height='70' rx='12' fill='#7C3AED' opacity='0.85'/><text x='270' y='90' fill='#ffffff' font-family='sans-serif' font-size='14' font-weight='bold' text-anchor='middle'>Process</text><path d='M 335 85 L 385 85' stroke='#10B981' stroke-width='3'/><rect x='390' y='50' width='100' height='70' rx='12' fill='#10B981' opacity='0.85'/><text x='440' y='90' fill='#ffffff' font-family='sans-serif' font-size='14' font-weight='bold' text-anchor='middle'>Output</text></svg>",
    "caption": "Clear caption describing the diagram flow"
  },
  "comparison": {
    "title": "Comparison Table (if comparing concepts, else leave null)",
    "headers": ["Feature / Basis", "Concept A", "Concept B"],
    "rows": [
      ["Meaning", "Description A", "Description B"],
      ["Nature", "Description A", "Description B"]
    ]
  },
  "commonMistakes": [
    {
      "mistake": "Common confusion or misconception students make",
      "correction": "The correct scientific / factual truth and why"
    }
  ],
  "memoryTrick": {
    "mnemonic": "Easy memory trick, acronym or rhyme",
    "explanation": "How to recall this instantly in an exam"
  },
  "examPoints": {
    "highYieldPoints": ["High yield fact 1", "High yield fact 2"],
    "keyTerms": ["Key Term 1", "Key Term 2"],
    "expectedAnswerStructure": "Introduction (Define) → Body (Core Mechanism + Diagram) → Conclusion (Relevance)",
    "potentialMcqFacts": ["Possible MCQ trap or numerical constant"]
  },
  "summary": [
    "Key takeaway point 1",
    "Key takeaway point 2",
    "Key takeaway point 3"
  ],
  "practiceQuestions": [
    {
      "type": "MCQ",
      "question": "Practice question 1 to test immediate understanding?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A",
      "explanation": "Why Option A is correct"
    },
    {
      "type": "CONCEPTUAL",
      "question": "Quick conceptual check question?",
      "options": [],
      "answer": "Clear, concise answer",
      "explanation": "Educational reasoning"
    }
  ],
  "followUpSuggestions": [
    "Why does this occur under different conditions?",
    "Can you give another real-life example in Hindi?",
    "How does this connect to competitive exam questions?"
  ]
}`;
  }

  // =========================================================================
  // GEMINI CALLER WITH MODEL ROTATION & PARSING
  // =========================================================================

  async _callGeminiWithFallback(prompt, imageFile = null) {
    const apiKey = (window.geminiService && window.geminiService.getApiKey()) || '';
    
    // Check if running on local server with proxy
    const isLocalServer = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Prepare contents
    const parts = [{ text: prompt }];

    if (imageFile) {
      try {
        const base64Data = await this._fileToBase64(imageFile);
        parts.push({
          inlineData: {
            mimeType: imageFile.type || 'image/jpeg',
            data: base64Data
          }
        });
      } catch (e) {
        console.warn('Image attachment encoding error:', e);
      }
    }

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json'
      }
    };

    // Candidates models
    let modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    if (window.geminiService) {
      try {
        const discovered = await window.geminiService.discoverAvailableModels(apiKey);
        if (discovered && discovered.length > 0) {
          modelsToTry = window.geminiService.sortModelsByPreference(discovered, window.geminiService.getActiveModel());
        }
      } catch (e) {}
    }

    let lastError = null;

    // 1. Try server proxy if available
    if (isLocalServer && typeof window !== 'undefined') {
      try {
        const origin = (window.location && window.location.origin && window.location.origin !== 'null') ? window.location.origin : '';
        const proxyUrl = origin ? `${origin}/api/gemini/gemini-2.5-flash` : '/api/gemini/gemini-2.5-flash';
        const proxyRes = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (proxyRes.ok) {
          const json = await proxyRes.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = this._parseJsonSafely(text);
          if (parsed) return { success: true, data: parsed, model: 'gemini-2.5-flash (Proxy)' };
        }
      } catch (proxyErr) {
        // Continue to direct API calls
      }
    }

    // 2. Direct Gemini API calls with key
    if (!window.geminiService?.isAiAvailable()) {
      throw new Error('No Gemini API key configured.');
    }

    for (const model of modelsToTry) {
      try {
        const res = await window.aiClient.fetchGenerateContent(model, payload, { apiKey });

        if (res.ok) {
          const json = await res.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = this._parseJsonSafely(text);
          if (parsed) {
            return { success: true, data: parsed, model };
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          lastError = errData.error?.message || `HTTP ${res.status}`;
          if (res.status === 400 && lastError.toLowerCase().includes('api key')) break;
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    throw new Error(lastError || 'Failed to reach Gemini API.');
  }

  async _callGeminiRaw(prompt) {
    const apiKey = (window.geminiService && window.geminiService.getApiKey()) || '';
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    };

    if (!window.geminiService?.isAiAvailable()) {
      // Try local proxy if in browser environment
      try {
        const origin = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') ? window.location.origin : '';
        const proxyUrl = origin ? `${origin}/api/gemini/gemini-2.5-flash` : '/api/gemini/gemini-2.5-flash';
        const proxyRes = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (proxyRes.ok) {
          const json = await proxyRes.json();
          return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      } catch (e) {}
      throw new Error('API key missing');
    }


    const model = (window.geminiService && window.geminiService.getActiveModel()) || 'gemini-2.5-flash';
    const res = await window.aiClient.fetchGenerateContent(model, payload, { apiKey });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  _parseJsonSafely(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let clean = raw.trim();
    // Remove Markdown code fence blocks
    clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();

    try {
      return JSON.parse(clean);
    } catch (e) {
      // Attempt JSON substring extraction
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
        } catch (subErr) {}
      }
    }
    return null;
  }

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result;
        const base64 = res.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  // =========================================================================
  // DETERMINISTIC PEDAGOGICAL ENGINE (100% Offline, Zero Key Required)
  // Comprehensive, expert-curated lessons for core concepts & auto-adapter
  // =========================================================================

  getDeterministicExplanation({ question, language = 'BILINGUAL', depth = 'DETAILED', mode = 'STUDENT', studentContext = null }) {
    const qLower = question.toLowerCase();
    const ctx = studentContext || this._resolveStudentContext();

    // 0. Linear Equation: e.g. "Solve 2x + 5 = 15" or "2x + 5 = 15"
    if ((qLower.includes('2x') && qLower.includes('15')) || qLower.includes('2x+5') || qLower.includes('2x + 5') || (qLower.includes('solve') && qLower.includes('='))) {
      return this._getMathEquationExplanation(question, language, ctx);
    }

    // 1. Mathematics: Percentage / 15% of 200 = 30
    if (qLower.includes('15%') || (qLower.includes('percent') && qLower.includes('200')) || (qLower.includes('20%') && qLower.includes('500'))) {
      return this._getMathPercentageExplanation(question, language, ctx);
    }

    // 2. Science: Photosynthesis
    if (qLower.includes('photosynthesis') || qLower.includes('प्रकाश संश्लेषण')) {
      return this._getPhotosynthesisExplanation(language, ctx);
    }

    // 3. History: French Revolution
    if (qLower.includes('french revolution') || qLower.includes('फ्रांसीसी क्रांति')) {
      return this._getFrenchRevolutionExplanation(language, ctx);
    }

    // 4. Geography: Water Cycle
    if (qLower.includes('water cycle') || qLower.includes('जल चक्र')) {
      return this._getWaterCycleExplanation(language, ctx);
    }

    // 5. Computer Science: RAM / Memory
    if (qLower.includes('ram') || qLower.includes('random access memory')) {
      return this._getRamExplanation(language, ctx);
    }

    // 6. Hindi / Polity: Indian Constitution / भारतीय संविधान
    if (qLower.includes('संविधान') || qLower.includes('constitution')) {
      return this._getConstitutionExplanation(language, ctx);
    }

    // 7. Economics: Inflation / मुद्रास्फीति
    if (qLower.includes('inflation') || qLower.includes('मुद्रास्फीति') || qLower.includes('महंगाई')) {
      return this._getInflationExplanation(language, ctx);
    }

    // Universal Adaptive Fallback for any other educational topic
    return this._getUniversalAdaptiveExplanation(question, language, depth, mode, ctx);
  }

  _getMathEquationExplanation(question, lang, ctx) {
    const isHindi = lang === 'HINDI';
    const isBilingual = lang === 'BILINGUAL';
    const level = ctx?.educationLevel || 'CLASS_10';

    // -------------------------------------------------------------
    // PROFILE A: CLASS 6 (Middle School Beginner)
    // -------------------------------------------------------------
    if (level === 'CLASS_6') {
      return {
        subject: "Mathematics",
        topic: "Solving Simple Equations: 2x + 5 = 15 (सरल समीकरण हल करना)",
        difficulty: "BEGINNER",
        isMath: true,
        quickAnswer: isHindi
          ? "x का मान 5 है! सोचिए कि 'x' एक रहस्यमयी डिब्बा है। दोनों तरफ तराजू बराबर रखने के लिए x = 5 होना चाहिए।"
          : "The value of x is 5! Think of 'x' as a mystery gift box. To keep the scale balanced, each box contains 5 coins.",
        foundation: {
          title: isHindi ? "शून्य से समझें: 'x' क्या होता है?" : "Let's Understand: What is 'x'?",
          explanation: isBilingual
            ? "गणित में 'x' कोई डरावनी चीज़ नहीं है! सोचिए कि 'x' एक बंद उपहार का डिब्बा (Mystery Box) है जिसमें कुछ सिक्के बंद हैं। हमारा काम बस यह पता लगाना है कि उस डिब्बे के अंदर कितने सिक्के हैं।"
            : "In math, 'x' is simply a placeholder for an unknown number — think of it as an unopened mystery gift box. Our entire goal is to find how many coins are hidden inside that box!",
          technicalTerms: [
            {
              term: "Variable 'x' (चर / अज्ञात राशि)",
              simpleMeaning: "An unknown number waiting to be discovered (रहस्यमयी डिब्बा)",
              example: "In 2x, we have 2 identical mystery boxes."
            },
            {
              term: "Equals Sign '=' (समानता का तराजू)",
              simpleMeaning: "Means both sides are in perfect balance, like a vegetable scale",
              example: "Whatever you do to the left side, you MUST do to the right side!"
            }
          ]
        },
        steps: [
          {
            stepNumber: 1,
            title: isHindi ? "समीकरण को तराजू की तरह देखें" : "Picture the Balance Scale",
            content: "Left side: 2 mystery boxes + 5 loose coins. Right side: 15 loose coins. Both sides are in perfect balance."
          },
          {
            stepNumber: 2,
            title: isHindi ? "दोनों तरफ से 5 सिक्के हटाएं (Why subtract 5?)" : "Remove 5 loose coins from BOTH sides",
            content: "Why do we subtract 5? Because we want the mystery boxes alone! If you take 5 coins from the left, you must take 5 from the right to keep the scale level: 15 - 5 = 10. Now, 2 mystery boxes = 10 coins."
          },
          {
            stepNumber: 3,
            title: isHindi ? "2 से भाग दें (Why divide by 2?)" : "Divide by 2 to find 1 box",
            content: "Why divide by 2? Because 2 identical boxes hold 10 coins in total. So 1 single box holds: 10 ÷ 2 = 5 coins! Thus, x = 5."
          },
          {
            stepNumber: 4,
            title: isHindi ? "उत्तर की जांच करें" : "Double Check Your Answer",
            content: "Put 5 coins into the 2 boxes: 2 × (5) + 5 = 10 + 5 = 15 coins! It balances perfectly!"
          }
        ],
        whyAndHow: {
          what: "Solving for the unknown variable using balance rules.",
          why: "To uncover hidden quantities in games, shopping, and everyday puzzles.",
          how: "By undoing operations step-by-step using inverse actions (opposite of +5 is -5; opposite of ×2 is ÷2).",
          when: "Whenever you know the total result but need to find the missing starting value.",
          where: "Pocket money calculations, scorekeeping in cricket, and shopping bills."
        },
        examples: [
          {
            type: "Playground Toy Box Example",
            title: "The Mystery Marbles",
            description: "You have 2 pouches of marbles (same count) plus 5 loose marbles. Total is 15 marbles. Remove the 5 loose ones → 10 marbles left in 2 pouches → each pouch has 5 marbles!"
          }
        ],
        analogy: {
          hook: "Think of it like this...",
          analogyText: "Think of a playground seesaw. On the left side sit 2 twin kids holding a 5 kg backpack. On the right side sits a 15 kg weight. If you take away the 5 kg backpack, you must remove 5 kg from the right side so the seesaw doesn't tilt! Now the 2 twins weigh 10 kg, meaning each twin weighs 5 kg!",
          takeaway: "An equation is just a seesaw: keep it level at every single step."
        },
        mathSolution: {
          given: "Equation: 2x + 5 = 15",
          toFind: "The value of x (how much 1 mystery box holds)",
          formula: "Isolate x: 2x + 5 - 5 = 15 - 5 → 2x = 10 → x = 10/2 = 5",
          formulaExplanation: "We perform the inverse operation to isolate the unknown on one side of the equal sign.",
          calculationSteps: [
            { step: "Step 1: Write equation", math: "2x + 5 = 15", explanation: "Original balanced statement" },
            { step: "Step 2: Subtract 5 from both sides", math: "2x = 15 - 5", explanation: "Remove loose 5 coins" },
            { step: "Step 3: Simplify right side", math: "2x = 10", explanation: "Two boxes equal 10" },
            { step: "Step 4: Divide both sides by 2", math: "x = 10 / 2", explanation: "Share 10 equally between 2 boxes" },
            { step: "Step 5: Final value", math: "x = 5", explanation: "Each box holds 5" }
          ],
          finalAnswer: "x = 5",
          units: "",
          verification: "Check: 2(5) + 5 = 10 + 5 = 15 ✓ (Verified correct!)",
          alternateMethod: "Mental check: What number doubled plus 5 gives 15? 10 + 5 = 15, so double of 5 is 10 → x = 5!"
        },
        flowchart: {
          title: "Step-by-Step Balance Flow",
          nodes: [
            { label: "2x + 5 = 15", description: "Start with balanced scale" },
            { label: "Subtract 5 from Both Sides", description: "2x = 10 (loose coins removed)" },
            { label: "Divide Both Sides by 2", description: "x = 5 (split equally)" }
          ]
        },
        diagram: {
          title: "Balance Scale Representation",
          type: "svg",
          svgContent: `<svg viewBox="0 0 480 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <line x1="100" y1="70" x2="380" y2="70" stroke="#F59E0B" stroke-width="4"/>
            <polygon points="240,70 220,130 260,130" fill="#64748B"/>
            <rect x="60" y="30" width="80" height="40" rx="8" fill="#4F46E5" opacity="0.9"/>
            <text x="100" y="55" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">2 Boxes (2x)</text>
            <circle cx="170" cy="50" r="18" fill="#10B981"/>
            <text x="170" y="55" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">+5</text>
            <rect x="300" y="30" width="80" height="40" rx="8" fill="#F59E0B" opacity="0.9"/>
            <text x="340" y="55" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">15 Coins</text>
            <text x="240" y="150" fill="#10B981" font-size="12" font-weight="bold" text-anchor="middle">Balanced scale: remove 5 from both sides → 2x = 10 → x = 5</text>
          </svg>`,
          caption: "Balance scale model: whatever you subtract from one pan, subtract from the other."
        },
        comparison: null,
        commonMistakes: [
          {
            mistake: "Subtracting 5 from the left side but forgetting to subtract 5 from the right side (writing 2x = 15).",
            correction: "An equation is a scale. If you touch one side, you must do the EXACT same thing to the other side!"
          }
        ],
        memoryTrick: {
          mnemonic: "SAD (Subtract / Add first, then Divide / Multiply)",
          explanation: "In reverse order of operations, clear loose additions/subtractions first before dividing by the coefficient!"
        },
        examPoints: {
          highYieldPoints: [
            "Always verify your answer by substituting x = 5 back into the original equation.",
            "Linear equations in one variable always have exactly one unique solution."
          ],
          keyTerms: ["Variable", "Constant", "Coefficient", "Equation", "Isolate"],
          expectedAnswerStructure: "State equation → Show subtraction on both sides → Show division by coefficient → State final answer with check.",
          potentialMcqFacts: ["If 2x + 5 = 15, then 4x + 10 = 30."]
        },
        summary: [
          "x represents an unknown value (mystery box).",
          "Remove additions by subtracting from both sides: 2x = 10.",
          "Remove multiplications by dividing both sides: x = 5.",
          "Always substitute back to verify 100% accuracy."
        ],
        practiceQuestions: [
          {
            type: "MCQ",
            question: "If 3x + 4 = 19, what is the value of x?",
            options: ["3", "4", "5", "6"],
            answer: "5",
            explanation: "3x = 19 - 4 = 15 → x = 15 / 3 = 5."
          }
        ],
        followUpSuggestions: [
          "What if the equation has a minus sign, like 2x - 5 = 15?",
          "Can x ever be a fraction or a negative number?",
          "How do we solve equations with x on both sides, like 3x + 2 = x + 10?"
        ]
      };
    }

    // -------------------------------------------------------------
    // PROFILE B & C: CLASS 10 & 12 (Board / Rigorous Math)
    // -------------------------------------------------------------
    if (level === 'CLASS_10' || level === 'CLASS_12' || level === 'CLASS_12_SCIENCE' || level === 'COLLEGE') {
      return {
        subject: "Mathematics / Algebra",
        topic: "Linear Equations in One Variable: 2x + 5 = 15",
        difficulty: level.includes('12') ? "ADVANCED" : "INTERMEDIATE",
        isMath: true,
        quickAnswer: "Solving 2x + 5 = 15 yields x = 5 through transposition and algebraic inverse operations.",
        foundation: {
          title: "Algebraic Axioms & Transposition Rules",
          explanation: "A linear equation represents an equality between two algebraic expressions of first degree. By Euclid's axioms, equals added or subtracted from equals remain equal. We transpose the constant term +5 to the RHS as -5, yielding 2x = 10, then divide by the leading coefficient 2.",
          technicalTerms: [
            { term: "Linear Equation", simpleMeaning: "An equation where the highest exponent of the variable is 1", example: "ax + b = c (graph is a straight line)" },
            { term: "Transposition", simpleMeaning: "Moving a term across the equality sign by inverting its mathematical operation", example: "+5 becomes -5 across '='" }
          ]
        },
        steps: [
          { stepNumber: 1, title: "Given Equation", content: "2x + 5 = 15 (Standard form: ax + b = c, where a = 2, b = 5, c = 15)." },
          { stepNumber: 2, title: "Transposition of Constant Term", content: "2x = 15 - 5 = 10." },
          { stepNumber: 3, title: "Coefficient Division", content: "x = 10 / 2 = 5." },
          { stepNumber: 4, title: "LHS = RHS Verification", content: "LHS = 2(5) + 5 = 10 + 5 = 15 = RHS (Identity holds)." }
        ],
        whyAndHow: {
          what: "Determination of the single unique root of a degree-1 polynomial equation.",
          why: "Forms the bedrock of coordinate geometry, systems of linear equations, and calculus.",
          how: "Axial transformation: x = (c - b) / a.",
          when: "Kinematics (v = u + at), cost functions, and rate problems.",
          where: "Applied across engineering physics, financial optimization, and data analysis."
        },
        examples: [
          {
            type: "Coordinate Geometry Representation",
            title: "Intersection of Two Lines",
            description: "The solution x = 5 is the x-coordinate of the intersection point between the line y = 2x + 5 and the horizontal line y = 15."
          }
        ],
        analogy: {
          hook: "Algebraic Symmetry...",
          analogyText: "Think of algebraic operations as forward and rewind functions on a video recorder: if a number was multiplied by 2 and had 5 added, we rewind by first subtracting 5, then dividing by 2.",
          takeaway: "Inverting the sequence of operations recovers the initial state."
        },
        mathSolution: {
          given: "Linear equation: 2x + 5 = 15",
          toFind: "Root x ∈ ℝ",
          formula: "For ax + b = c (a ≠ 0), x = (c - b) / a",
          formulaExplanation: "General closed-form solution of univariate first-degree linear equations.",
          calculationSteps: [
            { step: "Step 1: Write equation", math: "2x + 5 = 15", explanation: "Degree 1 polynomial" },
            { step: "Step 2: Subtract 5 from both sides", math: "2x = 15 - 5 = 10", explanation: "Transposition of additive constant" },
            { step: "Step 3: Multiply by reciprocal 1/2", math: "x = 10 × (1/2)", explanation: "Multiplicative inverse" },
            { step: "Step 4: Result", math: "x = 5", explanation: "Unique root" }
          ],
          finalAnswer: "x = 5",
          units: "",
          verification: "Substitution: 2(5) + 5 = 10 + 5 = 15 ≡ 15 ✓",
          alternateMethod: "Direct matrix / vector mapping or graphical intersection at (5, 15)."
        },
        flowchart: {
          title: "Algebraic Pipeline",
          nodes: [
            { label: "2x + 5 = 15", description: "Given univariate equation" },
            { label: "2x = 10", description: "Additive inverse applied" },
            { label: "x = 5", description: "Multiplicative inverse applied" }
          ]
        },
        diagram: {
          title: "Graphical Intersection Diagram",
          type: "svg",
          svgContent: `<svg viewBox="0 0 480 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <line x1="40" y1="130" x2="440" y2="130" stroke="#64748B" stroke-width="2"/>
            <line x1="80" y1="150" x2="80" y2="20" stroke="#64748B" stroke-width="2"/>
            <line x1="80" y1="50" x2="420" y2="50" stroke="#EF4444" stroke-width="2" stroke-dasharray="4,4"/>
            <text x="430" y="55" fill="#EF4444" font-size="11" font-weight="bold">y = 15</text>
            <line x1="80" y1="115" x2="320" y2="25" stroke="#4F46E5" stroke-width="3"/>
            <text x="330" y="25" fill="#4F46E5" font-size="11" font-weight="bold">y = 2x + 5</text>
            <circle cx="240" cy="50" r="6" fill="#10B981"/>
            <text x="240" y="40" fill="#10B981" font-size="12" font-weight="bold" text-anchor="middle">(5, 15)</text>
            <line x1="240" y1="50" x2="240" y2="130" stroke="#10B981" stroke-width="1.5" stroke-dasharray="2,2"/>
            <text x="240" y="145" fill="#10B981" font-size="12" font-weight="bold" text-anchor="middle">x = 5</text>
          </svg>`,
          caption: "Intersection of lines y = 2x + 5 and y = 15 at point (5, 15)."
        },
        comparison: null,
        commonMistakes: [
          {
            mistake: "Dividing by 2 before subtracting 5 without dividing all terms (writing x + 5 = 7.5).",
            correction: "If dividing first, every term must be divided: x + 2.5 = 7.5 → x = 5. Always subtract loose constants first to avoid fractional arithmetic."
          }
        ],
        memoryTrick: {
          mnemonic: "SAMDE (Reverse of PEDMAS for Equations)",
          explanation: "Subtraction/Addition first, then Multiplication/Division, then Exponents."
        },
        examPoints: {
          highYieldPoints: [
            "Linear equations in one variable have degree 1 and exactly one real root.",
            "If ax + b = cx + d, then x = (d - b) / (a - c) provided a ≠ c."
          ],
          keyTerms: ["Transposition", "Univariate", "Root", "Linear Function"],
          expectedAnswerStructure: "State given equation → Transpose constant → Divide by coefficient → Verify by LHS/RHS substitution.",
          potentialMcqFacts: ["The root of ax + b = c is always rational if a, b, c are integers and a ≠ 0."]
        },
        summary: [
          "Linear equation standard form: 2x + 5 = 15.",
          "Transposition yields 2x = 10.",
          "Root is x = 5.",
          "Graphically represents the intersection point (5, 15)."
        ],
        practiceQuestions: [
          {
            type: "MCQ",
            question: "What is the root of the equation 5x - 7 = 3x + 11?",
            options: ["6", "9", "4", "7"],
            answer: "9",
            explanation: "5x - 3x = 11 + 7 → 2x = 18 → x = 9."
          }
        ],
        followUpSuggestions: [
          "How do we solve simultaneous linear equations in two variables (2x + 3y = 12)?",
          "What is the geometric meaning of consistent vs inconsistent systems of equations?",
          "How does linear algebra extend this to matrices (Ax = b)?"
        ]
      };
    }

    // -------------------------------------------------------------
    // PROFILE D: UPSC / CSAT ASPIRANT (Speed Math & Quantitative Aptitude)
    // -------------------------------------------------------------
    return {
      subject: "Quantitative Aptitude (CSAT / Competitive Exams)",
      topic: "Linear Equations & Speed Mental Math: 2x + 5 = 15",
      difficulty: "EXAM_FOCUSED",
      isMath: true,
      quickAnswer: "x = 5. In CSAT and competitive exams, solve by inspection in 1.5 seconds: (15 - 5) / 2 = 5.",
      foundation: {
        title: "CSAT Quantitative Aptitude Strategy",
        explanation: "In competitive civil services aptitude (CSAT Paper-II), linear equations appear disguised inside word problems (Ages, Time & Work, Partnerships, and Mixture Allegations). The key skill is eliminating algebraic scratch-work through rapid mental decomposition: peel off the additive bias, then scale by the rate.",
        technicalTerms: [
          { term: "Direct Inspection", simpleMeaning: "Solving basic linear equations mentally without pen and paper", example: "x = (15 - 5) / 2 = 5" },
          { term: "Substitution Strategy", simpleMeaning: "Plugging MCQ options directly into the equation to verify in seconds", example: "Option B: 2(5) + 5 = 15 ✓" }
        ]
      },
      steps: [
        { stepNumber: 1, title: "Mental Subtraction", content: "Subtract bias: 15 - 5 = 10." },
        { stepNumber: 2, title: "Mental Halving", content: "Divide by coefficient: 10 / 2 = 5." },
        { stepNumber: 3, title: "Time Taken", content: "Target solving speed: Under 2 seconds." }
      ],
      whyAndHow: {
        what: "Instant mental algebra for competitive quantitative aptitude.",
        why: "Preserves cognitive bandwidth and time for complex comprehension passages in CSAT.",
        how: "By recognizing the linear structure x = (Result - Constant) / Rate.",
        when: "Applied continuously in CSAT numerical aptitude questions.",
        where: "UPSC Prelims Paper-II, SSC CGL Tier-1, State PCS exams."
      },
      examples: [
        {
          type: "CSAT Word Problem Application",
          title: "Age Problem Translation",
          description: "'A father is 5 years older than twice his son's age. If the father is 15 years old, find the son's age.' Equation: 2x + 5 = 15 → Son is 5 years old!"
        }
      ],
      analogy: {
        hook: "Aptitude Speed Rule...",
        analogyText: "In CSAT, never write what you can calculate in your head. Treat 2x + 5 = 15 as simply halving the difference between 15 and 5.",
        takeaway: "Mastering mental subtraction and division speeds up 40% of CSAT quant questions."
      },
      mathSolution: {
        given: "Equation: 2x + 5 = 15",
        toFind: "Value of x in under 2 seconds",
        formula: "x = (15 - 5) / 2",
        formulaExplanation: "Immediate mental arithmetic elimination of additive constant.",
        calculationSteps: [
          { step: "Step 1", math: "15 - 5 = 10", explanation: "Mental difference" },
          { step: "Step 2", math: "10 / 2 = 5", explanation: "Mental quotient" }
        ],
        finalAnswer: "x = 5",
        units: "",
        verification: "Direct option verification: 2(5) + 5 = 15 ✓",
        alternateMethod: "Back-solving from options: Pick option 5 → 2(5) + 5 = 15."
      },
      flowchart: {
        title: "CSAT 2-Second Decision Flow",
        nodes: [
          { label: "Scan 2x + 5 = 15", description: "Identify variable & constants" },
          { label: "15 - 5 = 10", description: "Mental subtraction" },
          { label: "10 ÷ 2 = 5", description: "Answer marked" }
        ]
      },
      diagram: {
        title: "CSAT Time Management Matrix",
        type: "svg",
        svgContent: `<svg viewBox="0 0 480 150" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <rect x="30" y="35" width="190" height="80" rx="10" fill="rgba(239,68,68,0.2)" stroke="#EF4444" stroke-width="2"/>
          <text x="125" y="65" fill="#EF4444" font-size="13" font-weight="bold" text-anchor="middle">❌ Traditional Pen Method</text>
          <text x="125" y="90" fill="#E2E8F0" font-size="12" text-anchor="middle">Takes 30–45 seconds</text>
          <rect x="260" y="35" width="190" height="80" rx="10" fill="rgba(16,185,129,0.2)" stroke="#10B981" stroke-width="2"/>
          <text x="355" y="65" fill="#10B981" font-size="13" font-weight="bold" text-anchor="middle">✅ CSAT Inspection Method</text>
          <text x="355" y="90" fill="#10B981" font-size="14" font-weight="bold" text-anchor="middle">Solved in 1.5 seconds</text>
        </svg>`,
        caption: "Efficiency in basic algebra saves critical minutes for complex reasoning sets."
      },
      comparison: null,
      commonMistakes: [
        {
          mistake: "Wasting 45 seconds setting up long-form written steps for simple degree-1 equations in Prelims.",
          correction: "Train your brain to execute (Constant Difference ÷ Coefficient) mentally."
        }
      ],
      memoryTrick: {
        mnemonic: "CSAT Rule: Target < 2 Seconds",
        explanation: "15 - 5 = 10 → half is 5."
      },
      examPoints: {
        highYieldPoints: [
          "UPSC CSAT frequently embeds linear relationships into Age, Speed-Time-Distance, and Ratio problems.",
          "Option substitution is often 3x faster than algebraic manipulation in multi-variable problems."
        ],
        keyTerms: ["CSAT Paper-II", "Mental Arithmetic", "Back-Solving", "Option Substitution"],
        expectedAnswerStructure: "Quick inspection → Option verification → Immediate marking.",
        potentialMcqFacts: ["Average time per question in CSAT is ~90 seconds; basic linear algebra should take < 15 seconds."]
      },
      summary: [
        "In 2x + 5 = 15, x = 5.",
        "Subtract 5 to get 10, divide by 2 to get 5.",
        "Essential mental shortcut for CSAT aptitude sets."
      ],
      practiceQuestions: [
        {
          type: "MCQ",
          question: "CSAT Practice: If 4x - 6 = 18, what is the value of x?",
          options: ["5", "6", "7", "8"],
          answer: "6",
          explanation: "(18 + 6) / 4 = 24 / 4 = 6."
        }
      ],
      followUpSuggestions: [
        "How do I apply this to solve CSAT Ages word problems in under 30 seconds?",
        "Show me how to solve two-variable linear equations using option substitution in CSAT.",
        "What are the most frequent quant topics in UPSC Prelims CSAT?"
      ]
    };
  }

  _getMathPercentageExplanation(question, lang) {
    const isHindi = lang === 'HINDI';
    const isBilingual = lang === 'BILINGUAL';

    return {
      subject: "Mathematics",
      topic: "Percentage Calculation (प्रतिशत गणना)",
      difficulty: "BEGINNER",
      isMath: true,
      quickAnswer: isHindi 
        ? "15% of 200 का मान 30 है क्योंकि 'प्रतिशत' का अर्थ प्रति 100 में से होता है। 200 में दो 100 होते हैं, इसलिए 15 + 15 = 30।"
        : "15% of 200 is 30 because percent means 'parts per hundred'. Since 200 contains two hundreds, 15 parts from each hundred give 15 + 15 = 30.",
      foundation: {
        title: isHindi ? "शून्य से समझें (Understanding from Zero)" : "Let's Understand (Starting from Zero)",
        explanation: isBilingual
          ? "Percentage (प्रतिशत) दो शब्दों से मिलकर बना है: 'Per' (प्रत्येक) + 'Cent' (सौ/100)। यानी हर 100 में से कितना भाग। जब हम कहते हैं 15%, इसका मतलब है 100 में से 15 भाग।"
          : (isHindi 
            ? "प्रतिशत का अर्थ है 'प्रति सौ'। जब हम 15% कहते हैं, तो इसका सीधा मतलब है कि हर 100 में से 15 इकाई।"
            : "The word 'Percent' comes from Latin 'Per Centum', meaning 'out of 100'. So 15% literally means 15 pieces out of every 100 pieces."),
        technicalTerms: [
          {
            term: "Percent (%)",
            simpleMeaning: "A fraction whose denominator is always 100 (100 में से हिस्सा)",
            example: "15% = 15/100 = 0.15"
          },
          {
            term: "Base Value (मूल मान)",
            simpleMeaning: "The total whole amount on which the percentage is calculated (200 in this case)",
            example: "If a shirt costs ₹200, ₹200 is the base value."
          }
        ]
      },
      steps: [
        {
          stepNumber: 1,
          title: isHindi ? "प्रतिशत को भिन्न (Fraction) में बदलें" : "Convert Percentage to a Fraction",
          content: "15% = 15 ÷ 100 = 15/100 (or 0.15 in decimal form)."
        },
        {
          stepNumber: 2,
          title: isHindi ? "भिन्न को कुल संख्या (200) से गुणा करें" : "Multiply Fraction by Base Number (200)",
          content: "Calculation: (15 / 100) × 200 = 15 × (200 / 100) = 15 × 2 = 30."
        },
        {
          stepNumber: 3,
          title: isHindi ? "अंतिम उत्तर की पुष्टि करें" : "Verify Result",
          content: "15 parts from the 1st hundred = 15. 15 parts from the 2nd hundred = 15. Total = 15 + 15 = 30."
        }
      ],
      whyAndHow: {
        what: "A direct fractional proportion calculation.",
        why: "Percentages allow us to scale proportions uniformly regardless of the total size.",
        how: "By dividing by 100 to find the rate per single unit, then multiplying by the target quantity.",
        when: "Everyday financial transactions, discounts, exam score calculations, and taxes (GST).",
        where: "Shopping bills, bank interest, profit/loss analysis, and statistical surveys."
      },
      examples: [
        {
          type: "Everyday Shopping Example",
          title: "Discount on a Book",
          description: "A book's marked price is ₹200. The bookstore gives a 15% discount. You save (15/100) × 200 = ₹30. You only pay ₹170!"
        },
        {
          type: "Mental Math Trick",
          title: "The 10% + 5% Rule",
          description: "To find 15% of 200 in your head: First find 10% of 200 = 20. Then 5% is half of 10% = 10. Add them: 20 + 10 = 30!"
        }
      ],
      analogy: {
        hook: "Think of it like this...",
        analogyText: "Imagine 200 rupee coins grouped into two bags of 100 coins each. If you take 15 coins from Bag 1 and 15 coins from Bag 2, you are holding 15 + 15 = 30 coins in your hand!",
        takeaway: "Percentage simply counts how many items you pull out per bag of 100."
      },
      mathSolution: {
        given: "Rate = 15%, Base (Total) = 200",
        toFind: "Value of 15% of 200",
        formula: "Percentage Value = (Percentage Rate / 100) × Total Value",
        formulaExplanation: "Dividing by 100 normalizes the rate to a unit fraction, which is then scaled to the target base.",
        calculationSteps: [
          { step: "Step 1: Write formula", math: "Value = (P / 100) × N", explanation: "Where P = 15 and N = 200" },
          { step: "Step 2: Substitute values", math: "Value = (15 / 100) × 200", explanation: "Substitute P = 15 and N = 200" },
          { step: "Step 3: Simplify zeroes", math: "Value = 15 × (200 / 100) = 15 × 2", explanation: "200 divided by 100 equals 2" },
          { step: "Step 4: Multiply", math: "Value = 30", explanation: "15 multiplied by 2 gives 30" }
        ],
        finalAnswer: "30",
        units: "",
        verification: "Check: (30 ÷ 200) × 100 = 30/2 = 15% ✓ (Verified correct!)",
        alternateMethod: "Mental Math: 10% of 200 = 20. 5% of 200 = 10. Total 15% = 20 + 10 = 30."
      },
      flowchart: {
        title: "Calculation Pipeline",
        nodes: [
          { label: "Given: 15% of 200", description: "Identify percentage and base" },
          { label: "Convert to Fraction", description: "15% → 15/100" },
          { label: "Simplify with Base", description: "200 / 100 = 2" },
          { label: "Final Result = 30", description: "15 × 2 = 30" }
        ]
      },
      diagram: {
        title: "Visual 100-Grid Representation",
        type: "svg",
        svgContent: `<svg viewBox="0 0 480 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <rect x="20" y="25" width="200" height="110" rx="12" fill="rgba(79,70,229,0.15)" stroke="#4F46E5" stroke-width="2"/>
          <text x="120" y="55" fill="#6366F1" font-size="13" font-weight="bold" text-anchor="middle">Bag 1 (100 Units)</text>
          <rect x="35" y="70" width="170" height="35" rx="6" fill="#4F46E5" opacity="0.3"/>
          <text x="120" y="93" fill="#F59E0B" font-size="14" font-weight="bold" text-anchor="middle">Take 15 parts</text>

          <text x="240" y="85" fill="#F59E0B" font-size="24" font-weight="bold" text-anchor="middle">+</text>

          <rect x="260" y="25" width="200" height="110" rx="12" fill="rgba(16,185,129,0.15)" stroke="#10B981" stroke-width="2"/>
          <text x="360" y="55" fill="#10B981" font-size="13" font-weight="bold" text-anchor="middle">Bag 2 (100 Units)</text>
          <rect x="275" y="70" width="170" height="35" rx="6" fill="#10B981" opacity="0.3"/>
          <text x="360" y="93" fill="#F59E0B" font-size="14" font-weight="bold" text-anchor="middle">Take 15 parts</text>

          <text x="240" y="152" fill="#10B981" font-size="13" font-weight="bold" text-anchor="middle">Total Taken = 15 + 15 = 30</text>
        </svg>`,
        caption: "200 consists of two groups of 100. Taking 15 from each gives 30."
      },
      comparison: null,
      commonMistakes: [
        {
          mistake: "Multiplying 15 × 200 directly without dividing by 100 (giving 3000).",
          correction: "Never forget that '%' means divide by 100. Always divide by 100."
        },
        {
          mistake: "Confusing percentage of a number with percentage increase.",
          correction: "15% of 200 is 30. A 15% increase on 200 would be 200 + 30 = 230."
        }
      ],
      memoryTrick: {
        mnemonic: "P = Rate × Base ÷ 100 (PRB Rule)",
        explanation: "Multiply the two numbers and shift the decimal point two places to the left! 15 × 200 = 3000 → shift 2 places left = 30."
      },
      examPoints: {
        highYieldPoints: [
          "X% of Y is always equal to Y% of X! (15% of 200 = 200% of 15 = 2 × 15 = 30).",
          "Percentage questions in CSAT/SSC frequently test rapid mental splitting (10% + 5%)."
        ],
        keyTerms: ["Percentage", "Base", "Fractional Conversion", "Proportion"],
        expectedAnswerStructure: "State formula → Substitute values → Show arithmetic simplification → State final answer with units.",
        potentialMcqFacts: ["15% of 200 equals 200% of 15."]
      },
      summary: [
        "Percent means parts per hundred (15% = 15/100).",
        "200 has two groups of 100, each contributing 15.",
        "Mathematical formula: (15 / 100) × 200 = 30.",
        "Mental check: 10% (20) + 5% (10) = 30."
      ],
      practiceQuestions: [
        {
          type: "MCQ",
          question: "What is 25% of 160?",
          options: ["30", "40", "50", "35"],
          answer: "40",
          explanation: "25% is one-fourth (1/4). 160 ÷ 4 = 40."
        },
        {
          type: "CONCEPTUAL",
          question: "Is 15% of 200 equal to 200% of 15? Why?",
          options: [],
          answer: "Yes! Because (15 × 200) / 100 = (200 × 15) / 100 = 30.",
          explanation: "Multiplication is commutative (a × b = b × a)."
        }
      ],
      followUpSuggestions: [
        "What is 20% of 500?",
        "How do I calculate percentage increase and decrease?",
        "Show me how to solve percentage questions mentally in 3 seconds."
      ]
    };
  }

  _getPhotosynthesisExplanation(lang, ctx) {
    const isHindi = lang === 'HINDI';
    const isBilingual = lang === 'BILINGUAL';
    const level = ctx?.educationLevel || 'CLASS_10';

    // =========================================================================
    // PROFILE A: CLASS 6 (Middle School: 10–12 years old)
    // Ultra-simple language, everyday solar kitchen analogy, 3-step chain, no chemical equations
    // =========================================================================
    if (level === 'CLASS_6') {
      return {
        subject: "Science / Biology (कक्षा 6 विज्ञान)",
        topic: "How Plants Make Food: Photosynthesis (पौधे अपना भोजन कैसे बनाते हैं)",
        difficulty: "BEGINNER",
        isMath: false,
        quickAnswer: isHindi
          ? "प्रकाश संश्लेषण वह सुंदर प्रक्रिया है जिससे हरे पौधे धूप, पानी और हवा की मदद से अपनी पत्तियों में अपना भोजन बनाते हैं और हमें सांस लेने के लिए ताज़ा ऑक्सीजन देते हैं!"
          : "Photosynthesis means green plants make their own sweet food using sunlight, water, and air, while releasing clean oxygen for us to breathe!",
        foundation: {
          title: isHindi ? "शून्य से समझें: पौधों की हरी रसोई" : "Let's Understand: The Green Plant Kitchen",
          explanation: isBilingual
            ? "हर जीव को ज़िंदा रहने और खेलने-कूदने के लिए भोजन चाहिए। हम रोटी, चावल और फल खाते हैं। लेकिन क्या आपने कभी किसी आम के पेड़ को बाज़ार जाकर सब्ज़ी खरीदते देखा है? बिल्कुल नहीं! पौधे अपना भोजन खुद बनाते हैं, वह भी अपनी हरी पत्तियों में धूप की मदद से। 'Photo' का मतलब है प्रकाश (धूप) और 'Synthesis' का मतलब है बनाना।"
            : "Every living creature needs energy to grow and play! Humans eat food, but plants cannot walk to a grocery store. Instead, plants are nature's solar cookers: they make their own food inside their green leaves using free sunshine from the sky! 'Photo' means light, and 'Synthesis' means putting things together.",
          technicalTerms: [
            {
              term: "Leaf / रसोई (The Kitchen)",
              simpleMeaning: "The flat green part of the plant where food is cooked",
              example: "Think of every green leaf as a tiny chef's kitchen."
            },
            {
              term: "Sunlight / धूप (The Stove)",
              simpleMeaning: "The natural warm energy that cooks the plant's food",
              example: "Without the sun, the kitchen stove has no heat!"
            },
            {
              term: "Glucose / मीठा भोजन (Plant Food)",
              simpleMeaning: "Sweet sugar made by the plant to give it energy to grow",
              example: "Like energy juice for the branches and flowers."
            },
            {
              term: "Oxygen / ताज़ा हवा (Fresh Breath)",
              simpleMeaning: "The clean gas plants send out into the breeze for humans and animals",
              example: "Every breath of fresh morning air comes from plants."
            }
          ]
        },
        steps: [
          {
            stepNumber: 1,
            title: isHindi ? "जड़ों से पानी पीना" : "Roots Drink Water",
            content: "Roots drink water from underground soil like drinking mango juice with a straw."
          },
          {
            stepNumber: 2,
            title: isHindi ? "हवा से कार्बन डाइऑक्साइड लेना" : "Leaves Catch Air",
            content: "Leaves have tiny invisible mouth-pores that breathe in carbon dioxide gas floating in the breeze."
          },
          {
            stepNumber: 3,
            title: isHindi ? "धूप से भोजन पकाना" : "Sunlight Powers the Cooking",
            content: "The green color (chlorophyll) catches golden sunlight and cooks water and air into sweet plant food (glucose)."
          },
          {
            stepNumber: 4,
            title: isHindi ? "ताज़ा ऑक्सीजन उपहार में देना" : "Clean Oxygen is Released",
            content: "The plant keeps the sweet food to grow tall, and releases fresh oxygen gas into the air for all humans and animals!"
          }
        ],
        whyAndHow: {
          what: "Plants making their own food using sunshine, water, and air.",
          why: "Without plants making food and oxygen, no animal or human could survive on Earth!",
          how: "Sunlight + Water + Air → Sweet Food + Fresh Oxygen.",
          when: "Happens during daytime whenever the sun shines.",
          where: "Inside the green leaves of every plant, tree, and blade of grass."
        },
        examples: [
          {
            type: "Kitchen Story Analogy",
            title: "The Solar Sandwich",
            description: "To make a sandwich at home, you take bread and veggies, and your stove warms it up. For a plant: Water from the tap + Air from the breeze + Sun as the stove = A delicious leaf sandwich!"
          }
        ],
        analogy: {
          hook: "Think of it like this...",
          analogyText: "A green leaf is like a solar-powered organic kitchen! The Sun is the stove flame, roots are the water pipe, air gives the ingredients, and the green leaf chef bakes yummy sweet cookies while puffing out clean, sweet oxygen bubbles for you and me!",
          takeaway: "Plants cook with sunshine and share clean air with the world!"
        },
        mathSolution: {
          given: "Ingredients: Sunlight + Water + Air (Carbon Dioxide)",
          toFind: "What is produced",
          formula: "Sunlight + Water + Air → Sweet Food (Glucose) + Oxygen",
          formulaExplanation: "Simple recipe rule for Class 6: Three simple natural ingredients turn into food and oxygen.",
          calculationSteps: [
            { step: "Step 1", math: "Sunlight (Energy) + Water (from soil)", explanation: "Energy and liquid combined" },
            { step: "Step 2", math: "+ Carbon Dioxide (from air)", explanation: "Air added through leaf pores" },
            { step: "Step 3", math: "= Glucose (Plant Food) + Oxygen (For us!)", explanation: "Final healthy output" }
          ],
          finalAnswer: "Sweet Food (Glucose) + Fresh Oxygen",
          units: "",
          verification: "Cover a plant in total darkness: its leaves turn pale because without sunlight, the kitchen cannot cook!",
          alternateMethod: ""
        },
        flowchart: {
          title: "Simple 3-Step Leaf Kitchen Chain",
          nodes: [
            { label: "1. Sunlight + Water + Air", description: "The 3 natural ingredients" },
            { label: "2. Green Leaf Cooks", description: "Leaf uses sunshine to make food" },
            { label: "3. Food + Fresh Oxygen", description: "Plant grows, we breathe" }
          ]
        },
        diagram: {
          title: "The Friendly Solar Leaf",
          type: "svg",
          svgContent: `<svg viewBox="0 0 480 170" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <circle cx="70" cy="50" r="28" fill="#F59E0B" opacity="0.9"/>
            <text x="70" y="55" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">☀️ Sun</text>
            <path d="M 105 60 L 170 80" stroke="#F59E0B" stroke-width="3" marker-end="url(#arrow)"/>
            <ellipse cx="240" cy="90" rx="75" ry="45" fill="#10B981" opacity="0.85"/>
            <text x="240" y="88" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">🌿 Green Leaf</text>
            <text x="240" y="106" fill="#ECFDF5" font-size="10" text-anchor="middle">(Solar Kitchen)</text>
            <path d="M 110 130 L 175 110" stroke="#3B82F6" stroke-width="3"/>
            <text x="70" y="140" fill="#3B82F6" font-size="11" font-weight="bold">💧 Water (Roots)</text>
            <path d="M 315 80 L 390 60" stroke="#F59E0B" stroke-width="3"/>
            <text x="425" y="65" fill="#F59E0B" font-size="11" font-weight="bold">🍬 Food (Glucose)</text>
            <path d="M 315 105 L 390 125" stroke="#06B6D4" stroke-width="3"/>
            <text x="425" y="130" fill="#06B6D4" font-size="11" font-weight="bold">💨 Clean Oxygen</text>
          </svg>`,
          caption: "Sun, water, and air go in → sweet food and clean oxygen come out!"
        },
        comparison: null,
        commonMistakes: [
          {
            mistake: "Thinking plants eat soil through their roots.",
            correction: "Plants only drink water and minerals from soil; they cook their actual food inside their leaves using sunlight!"
          }
        ],
        memoryTrick: {
          mnemonic: "S-W-A = Food & Air (Sun, Water, Air)",
          explanation: "Sun + Water + Air is all a green plant needs to feed itself and give us oxygen!"
        },
        examPoints: {
          highYieldPoints: [
            "Chlorophyll is the green pigment that traps sunlight.",
            "Oxygen is released as a byproduct which all animals breathe."
          ],
          keyTerms: ["Photosynthesis", "Chlorophyll", "Glucose", "Stomata"],
          expectedAnswerStructure: "Simple definition → 3 Ingredients → 2 Outputs (Food + Oxygen) → Real-life importance.",
          potentialMcqFacts: ["Leaves look green because of chlorophyll."]
        },
        summary: [
          "Photosynthesis = making food using sunlight.",
          "Ingredients: Sunlight, Water, and Carbon Dioxide.",
          "Outputs: Glucose (plant food) and Oxygen (for humans).",
          "Without plants, there would be no clean oxygen on Earth."
        ],
        practiceQuestions: [
          {
            type: "MCQ",
            question: "What color pigment inside leaves catches sunlight?",
            options: ["Chlorophyll (Green)", "Hemoglobin (Red)", "Melanin (Brown)", "Carotene (Orange)"],
            answer: "Chlorophyll (Green)",
            explanation: "Chlorophyll is the wonderful green color in leaves that absorbs sunlight like a solar panel!"
          }
        ],
        followUpSuggestions: [
          "Why do leaves turn brown and fall off in autumn?",
          "Can plants make food under an indoor electric bulb?",
          "Do plants make food at night when the sun goes down?"
        ]
      };
    }

    // =========================================================================
    // PROFILE B: CLASS 10 (Secondary School Board Exam Level)
    // Balanced chemical equation, 3 board steps, stomata guard cells, board exam traps
    // =========================================================================
    if (level === 'CLASS_10') {
      return {
        subject: "Science / Biology (Class 10 CBSE / State Board)",
        topic: "Photosynthesis & Autotrophic Nutrition (प्रकाश संश्लेषण - कक्षा 10)",
        difficulty: "INTERMEDIATE",
        isMath: false,
        quickAnswer: isHindi
          ? "प्रकाश संश्लेषण ऑटोट्रॉफिक पोषण की वह प्रक्रिया है जिसमें हरे पौधे क्लोरोफिल और सूर्य के प्रकाश की उपस्थिति में कार्बन डाइऑक्साइड और जल को कार्बोहाइड्रेट (ग्लूकोज) में बदलते हैं और ऑक्सीजन मुक्त करते हैं: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂।"
          : "Photosynthesis is the autotrophic nutrition process by which green plants absorb solar energy via chlorophyll to synthesize glucose from carbon dioxide and water, releasing oxygen as a byproduct: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂.",
        foundation: {
          title: "Class 10 Board Curriculum: Autotrophic Nutrition",
          explanation: "In Class 10 Life Processes, plants are classified as autotrophs. They convert simple inorganic raw materials (CO2 and H2O) into complex organic energy reserves (glucose/starch) using light energy trapped by chlorophyll in chloroplasts. Gaseous exchange of CO2 and O2 occurs through microscopic stomata on the leaf surface, dynamically regulated by the turgor pressure of surrounding guard cells.",
          technicalTerms: [
            { term: "Chloroplast (हरितलवक)", simpleMeaning: "Cell organelle containing chlorophyll where photosynthesis takes place", example: "Site of the photosynthetic machinery in mesophyll cells." },
            { term: "Stomata & Guard Cells", simpleMeaning: "Pores on leaf epidermis whose opening/closing is regulated by turgor pressure of guard cells", example: "Swelling of guard cells opens the stomatal pore for gas exchange." },
            { term: "Photolysis (जल का प्रकाश अपघटन)", simpleMeaning: "Splitting of water molecules into hydrogen ions, electrons, and oxygen using light energy", example: "Origin of all atmospheric oxygen." }
          ]
        },
        steps: [
          { stepNumber: 1, title: "1. Absorption of Light Energy", content: "Chlorophyll pigments absorb specific wavelengths of solar radiation." },
          { stepNumber: 2, title: "2. Conversion & Water Splitting", content: "Light energy is converted into chemical energy, and water (H₂O) is split into hydrogen and oxygen (photolysis)." },
          { stepNumber: 3, title: "3. Reduction of Carbon Dioxide", content: "Carbon dioxide (CO₂) is reduced to carbohydrates (glucose, C₆H₁₂O₆)." }
        ],
        whyAndHow: {
          what: "Primary photochemical energy conversion driving terrestrial and aquatic ecosystems.",
          why: "Maintains atmospheric CO₂/O₂ equilibrium and forms the base of all ecological food chains.",
          how: "Balanced equation: 6CO₂ + 6H₂O + Sunlight/Chlorophyll → C₆H₁₂O₆ + 6O₂.",
          when: "Light-dependent reactions occur during daytime; CO₂ uptake in desert plants can occur at night.",
          where: "Chloroplasts located primarily in leaf mesophyll tissue."
        },
        examples: [
          {
            type: "Class 10 Board Practical",
            title: "Variegated Leaf (Money Plant / Croton) Experiment",
            description: "Testing a de-starched variegated leaf with iodine solution reveals that only the green portions (containing chlorophyll) turn blue-black, proving chlorophyll is indispensable for photosynthesis."
          }
        ],
        analogy: {
          hook: "Board Concept...",
          analogyText: "Think of the leaf as an electrochemical factory: Chloroplast is the processing plant, chlorophyll is the solar collector, water is the electron source, and the final output is energy-dense glucose stored as starch.",
          takeaway: "Inorganic inputs are synthesized into organic storage molecules."
        },
        mathSolution: {
          given: "Reactants: 6 moles CO₂ + 6 moles H₂O",
          toFind: "Stoichiometric products",
          formula: "6CO₂ + 6H₂O + Sunlight/Chlorophyll → C₆H₁₂O₆ + 6O₂",
          formulaExplanation: "Balanced chemical equation demonstrating conservation of mass across C, H, and O atoms.",
          calculationSteps: [
            { step: "Carbon balance", math: "6 C in 6CO₂ → 6 C in C₆H₁₂O₆", explanation: "Conserved" },
            { step: "Hydrogen balance", math: "12 H in 6H₂O → 12 H in C₆H₁₂O₆", explanation: "Conserved" },
            { step: "Oxygen balance", math: "18 O in reactants → 6 in C₆H₁₂O₆ + 12 in 6O₂", explanation: "Conserved" }
          ],
          finalAnswer: "C₆H₁₂O₆ + 6O₂",
          units: "1 mole glucose + 6 moles oxygen",
          verification: "Atomic counts balance identically on LHS and RHS.",
          alternateMethod: ""
        },
        flowchart: {
          title: "Class 10 Three-Step Board Sequence",
          nodes: [
            { label: "1. Light Absorption", description: "Chlorophyll absorbs solar photons" },
            { label: "2. Photolysis of H₂O", description: "Water splits → O₂ liberated" },
            { label: "3. Reduction of CO₂", description: "CO₂ reduced to glucose (C₆H₁₂O₆)" }
          ]
        },
        diagram: {
          title: "Class 10 Board Photosynthesis & Stomatal Pore",
          type: "svg",
          svgContent: `<svg viewBox="0 0 480 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <ellipse cx="140" cy="80" rx="90" ry="50" fill="rgba(16,185,129,0.2)" stroke="#10B981" stroke-width="2"/>
            <text x="140" y="65" fill="#10B981" font-size="13" font-weight="bold" text-anchor="middle">Chloroplast</text>
            <text x="140" y="85" fill="#F59E0B" font-size="11" text-anchor="middle">6CO₂ + 6H₂O</text>
            <text x="140" y="105" fill="#6EE7B7" font-size="11" text-anchor="middle">↓ Sunlight + Chlorophyll</text>
            <text x="140" y="125" fill="#10B981" font-size="12" font-weight="bold" text-anchor="middle">C₆H₁₂O₆ + 6O₂</text>
            <path d="M 245 80 L 295 80" stroke="#F59E0B" stroke-width="3" marker-end="url(#arrow)"/>
            <rect x="310" y="35" width="140" height="90" rx="10" fill="rgba(79,70,229,0.15)" stroke="#4F46E5" stroke-width="2"/>
            <text x="380" y="65" fill="#818CF8" font-size="12" font-weight="bold" text-anchor="middle">Stomatal Pore</text>
            <text x="380" y="85" fill="#E2E8F0" font-size="11" text-anchor="middle">Guard Cells (Turgid)</text>
            <text x="380" y="105" fill="#34D399" font-size="10" text-anchor="middle">CO₂ in • O₂ out</text>
          </svg>`,
          caption: "Chloroplast chemical synthesis and stomatal gas exchange mechanism."
        },
        comparison: {
          title: "Photosynthesis vs Respiration",
          headers: ["Feature", "Photosynthesis", "Respiration"],
          rows: [
            ["Metabolic Nature", "Anabolic (Constructive)", "Catabolic (Destructive)"],
            ["Energy Change", "Endothermic (Stores solar energy)", "Exothermic (Releases ATP energy)"],
            ["Gas Exchanged", "Consumes CO₂, releases O₂", "Consumes O₂, releases CO₂"],
            ["Organelle Site", "Chloroplasts (Green cells only)", "Mitochondria (All living cells)"]
          ]
        },
        commonMistakes: [
          {
            mistake: "Writing that oxygen released comes from carbon dioxide (CO₂).",
            correction: "Class 10 Board Trap: Oxygen comes exclusively from the photolysis of WATER (H₂O), not from CO₂!"
          },
          {
            mistake: "Assuming desert plants follow the daytime sequence identically.",
            correction: "Desert plants take in CO₂ at night through open stomata and store it as an intermediate acid to prevent daytime water transpiration loss."
          }
        ],
        memoryTrick: {
          mnemonic: "A-S-R (Absorb, Split, Reduce)",
          explanation: "1. Absorb light → 2. Split water → 3. Reduce carbon dioxide."
        },
        examPoints: {
          highYieldPoints: [
            "The 3 core board steps do NOT necessarily happen immediately one after another (e.g. desert plants).",
            "Guard cells swell when water flows into them, causing stomata to curve open.",
            "Starch is the primary stored carbohydrate in plants; glycogen in animals."
          ],
          keyTerms: ["Autotroph", "Chloroplast", "Stomata", "Guard Cells", "Photolysis", "Balanced Equation"],
          expectedAnswerStructure: "Definition → Balanced Chemical Equation → Three Events Sequence → Stomatal Regulation → Experimental Proof.",
          potentialMcqFacts: ["Oxygen released during photosynthesis originates from water (H₂O)."]
        },
        summary: [
          "Photosynthesis converts light into chemical energy.",
          "Balanced formula: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂.",
          "Three steps: light absorption, water photolysis, CO₂ reduction.",
          "Regulated by guard cell turgor pressure."
        ],
        practiceQuestions: [
          {
            type: "MCQ",
            question: "Which event does NOT occur during the photochemical phase of photosynthesis?",
            options: [
              "Absorption of light energy by chlorophyll",
              "Splitting of water molecules",
              "Conversion of light energy into chemical energy",
              "Oxidation of carbohydrates to carbon dioxide"
            ],
            answer: "Oxidation of carbohydrates to carbon dioxide",
            explanation: "Oxidation of carbohydrates occurs during respiration, whereas photosynthesis involves the REDUCTION of CO₂ to carbohydrates."
          }
        ],
        followUpSuggestions: [
          "Explain the role of KOH in the carbon dioxide necessity experiment.",
          "How do stomata open and close based on guard cell potassium and water influx?",
          "Why do plants store glucose as insoluble starch instead of soluble sugar?"
        ]
      };
    }

    // =========================================================================
    // PROFILE C: CLASS 12 SCIENCE (Senior Secondary / NEET / JEE)
    // Biophysical rigor: Thylakoids, Z-Scheme, PS I & II, Photolysis by OEC, Calvin Cycle, RuBisCO, C3 vs C4
    // =========================================================================
    if (level === 'CLASS_12_SCIENCE' || level === 'CLASS_12' || level === 'COLLEGE') {
      return {
        subject: "Biology / Botany (Class 11–12 Senior Secondary / NEET)",
        topic: "Photosynthesis in Higher Plants: Biophysics & Enzymology (प्रकाश संश्लेषण - 12वीं विज्ञान)",
        difficulty: "ADVANCED",
        isMath: false,
        quickAnswer: "An endergonic, anabolic oxidation-reduction bio-energetic process occurring within chloroplasts, coupling light-dependent photochemical transduction of solar irradiance into ATP and NADPH across thylakoid membranes with light-independent enzymatic reduction of CO₂ in the stroma (Calvin Cycle).",
        foundation: {
          title: "Senior Secondary Botany: Chloroplast Ultrastructure & Energetics",
          explanation: "Photosynthesis operates via two compartmentalized, mutually dependent phases: the Photochemical (Light) reactions occurring on the thylakoid membranes (grana & stroma lamellae with the Z-scheme, photolysis, and proton translocation), and the Biosynthetic (Dark) reactions occurring in the stroma matrix catalyzed by RuBisCO in the Calvin cycle. The overall reaction requires 18 ATP and 12 NADPH per hexose synthesized, with an overall free energy change of ΔG°' = +2870 kJ/mol.",
          technicalTerms: [
            {
              term: "Photosystem II (P680) & Photosystem I (P700)",
              simpleMeaning: "Multi-protein pigment-antenna complexes with reaction center chlorophyll a absorbing at 680 nm and 700 nm respectively",
              example: "PS II operates at redox potential +0.82V, sufficient to split H₂O."
            },
            {
              term: "Oxygen Evolving Complex (OEC)",
              simpleMeaning: "A lumen-facing Mn₄CaO₅ cluster on PS II that catalyzes the 4-step Kok cycle water oxidation",
              example: "2H₂O → 4H⁺ + 4e⁻ + O₂."
            },
            {
              term: "RuBisCO (Ribulose-1,5-bisphosphate carboxylase-oxygenase)",
              simpleMeaning: "Dual-affinity stroma enzyme catalyzing primary CO₂ carboxylation in C3 plants; exhibits competitive oxygenation causing photorespiration",
              example: "Most abundant protein on Earth, comprising ~40% of leaf soluble protein."
            },
            {
              term: "Kranz Anatomy & C4 Pathway",
              simpleMeaning: "Spatial segregation of primary carboxylation (PEP carboxylase in mesophyll) and decarboxylation/Calvin cycle (bundle sheath cells) to eliminate photorespiration",
              example: "Observed in tropical monocots like Zea mays and Saccharum officinarum."
            }
          ]
        },
        steps: [
          {
            stepNumber: 1,
            title: "Photochemical Light Phase & Z-Scheme (Thylakoids)",
            content: "Photons excite P680 in PS II. Electrons pass through Pheophytin → Plastoquinone (PQ) → Cytochrome b₆f complex → Plastocyanin (PC) to oxidized P700 in PS I. PS I photo-oxidation transfers electrons via A₀, A₁, iron-sulfur centers (F_X, F_A/B) to Ferredoxin (Fd), where Ferredoxin-NADP⁺ reductase (FNR) reduces NADP⁺ to NADPH."
          },
          {
            stepNumber: 2,
            title: "Photolysis of Water & Chemiosmotic ATP Synthesis",
            content: "OEC extracts 4 electrons from 2H₂O to replenish P680⁺, depositing 4H⁺ into the thylakoid lumen. Concurrently, the Q-cycle at Cytochrome b₆f translocates additional protons into the lumen. The resulting electrochemical proton gradient (ΔpH ~ 3.5) drives ATP synthesis via CF₀-CF₁ ATP synthase (Mitchell's chemiosmosis)."
          },
          {
            stepNumber: 3,
            title: "Biosynthetic Phase / Calvin Cycle (Stroma)",
            content: "1. Carboxylation: 3 RuBP (5C) + 3 CO₂ + 3 H₂O → 6 molecules of 3-Phosphoglycerate (3C), catalyzed by RuBisCO. 2. Reduction: 6 3-PGA phosphorylated by 6 ATP and reduced by 6 NADPH to 6 Glyceraldehyde-3-phosphate (G3P). 1 G3P exits toward hexose synthesis. 3. Regeneration: Remaining 5 G3P rearranged into 3 RuBP utilizing 3 ATP. Net per glucose: 18 ATP + 12 NADPH."
          },
          {
            stepNumber: 4,
            title: "Photorespiration (C₂ Cycle) Mitigation",
            content: "At elevated temperatures or low CO₂/O₂ ratios, RuBisCO oxygenates RuBP to 1 3-PGA + 1 2-Phosphoglycolate, initiating an energy-wasting salvage pathway across chloroplast, peroxisome, and mitochondrion. C4 plants circumvent this via Hatch-Slack spatial compartmentalization."
          }
        ],
        whyAndHow: {
          what: "Quantum biophysical light capture coupled to biochemical carbon assimilation.",
          why: "Thermodynamic engine driving 100+ billion tonnes of global annual dry biomass synthesis.",
          how: "Quantum requirement: 8 to 10 einsteins (photons) required per molecule of O₂ evolved.",
          when: "Light reaction requires irradiance; dark reaction operates in stroma as long as ATP/NADPH pools persist.",
          where: "Chloroplast thylakoids (light reactions) and stroma matrix (Calvin-Benson cycle)."
        },
        examples: [
          {
            type: "NEET / Advanced Conceptual Analysis",
            title: "Cyclic vs Non-Cyclic Photophosphorylation",
            description: "When NADPH/NADP⁺ ratio is high or stroma lamellae lacks PS II, electrons cycle from Fd back to Cytochrome b₆f, synthesizing exclusively ATP without generating NADPH or evolving O₂."
          }
        ],
        analogy: {
          hook: "Biochemical Circuit...",
          analogyText: "Think of the thylakoid membrane as an electrochemical dam: light-driven electron flow pumps protons (H⁺) into the lumen reservoir, creating high pressure. The only outlet is the CF₀-CF₁ turbine, which spins to generate ATP battery packs for the Calvin assembly line.",
          takeaway: "Solar photon excitation generates proton motive force, powering molecular synthesis."
        },
        mathSolution: {
          given: "1 Hexose molecule (C₆H₁₂O₆) synthesis",
          toFind: "Total ATP and NADPH stoichiometry",
          formula: "6 CO₂ + 18 ATP + 12 NADPH + 12 H⁺ → C₆H₁₂O₆ + 18 ADP + 18 Pi + 12 NADP⁺ + 6 H₂O",
          formulaExplanation: "Per turn of the Calvin cycle fixing 1 CO₂: 2 ATP + 2 NADPH for reduction, 1 ATP for RuBP regeneration = 3 ATP & 2 NADPH per CO₂. For 6 CO₂ = 18 ATP & 12 NADPH.",
          calculationSteps: [
            { step: "Carboxylation phase", math: "6 RuBP + 6 CO₂ → 12 (3-PGA)", explanation: "Catalyzed by RuBisCO" },
            { step: "Reduction phase", math: "12 (3-PGA) + 12 ATP + 12 NADPH → 12 G3P + 12 ADP + 12 NADP⁺", explanation: "12 ATP + 12 NADPH consumed" },
            { step: "Hexose yield", math: "2 G3P exit cycle → 1 Fructose-6-P → 1 Glucose", explanation: "Net carbon export = 6C" },
            { step: "Regeneration phase", math: "10 G3P + 6 ATP → 6 RuBP + 6 ADP", explanation: "6 ATP consumed in stroma" },
            { step: "Total energy balance", math: "18 ATP + 12 NADPH", explanation: "18 ATP and 12 NADPH per hexose" }
          ],
          finalAnswer: "18 ATP and 12 NADPH consumed per glucose",
          units: "ATP:NADPH stoichiometric ratio = 3:2",
          verification: "Non-cyclic photophosphorylation yields roughly 1:1, hence cyclic photophosphorylation tops up the required 3:2 ratio.",
          alternateMethod: ""
        },
        flowchart: {
          title: "Z-Scheme & Calvin Cycle Bioenergetics",
          nodes: [
            { label: "PS II (P680) + OEC", description: "H₂O photolysis → 4e⁻ + 4H⁺ + O₂" },
            { label: "ETC (PQ → Cyt b₆f → PC)", description: "Proton motive force across thylakoid" },
            { label: "PS I (P700) + FNR", description: "NADP⁺ reduced to NADPH" },
            { label: "CF₀-CF₁ ATP Synthase", description: "ADP + Pi → ATP" },
            { label: "Calvin Cycle (Stroma)", description: "RuBisCO fixes CO₂ → Hexose" }
          ]
        },
        diagram: {
          title: "Thylakoid Membrane Chemiosmosis & Z-Scheme",
          type: "svg",
          svgContent: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <rect x="20" y="70" width="440" height="25" fill="#334155" opacity="0.6"/>
            <text x="40" y="60" fill="#94A3B8" font-size="10" font-weight="bold">Stroma (pH ~ 8.0)</text>
            <text x="40" y="115" fill="#38BDF8" font-size="10" font-weight="bold">Thylakoid Lumen (pH ~ 4.5 - High H⁺)</text>
            <rect x="70" y="55" width="55" height="55" rx="6" fill="#10B981"/>
            <text x="97" y="85" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle">PS II</text>
            <text x="97" y="135" fill="#F59E0B" font-size="9" text-anchor="middle">H₂O → O₂ + 4H⁺</text>
            <rect x="175" y="55" width="60" height="55" rx="6" fill="#6366F1"/>
            <text x="205" y="85" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">Cyt b₆f</text>
            <rect x="280" y="55" width="55" height="55" rx="6" fill="#10B981"/>
            <text x="307" y="85" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle">PS I</text>
            <text x="307" y="45" fill="#F59E0B" font-size="9" text-anchor="middle">NADP⁺ → NADPH</text>
            <ellipse cx="400" cy="82" rx="28" ry="32" fill="#F59E0B"/>
            <text x="400" y="86" fill="#1E293B" font-size="9" font-weight="bold" text-anchor="middle">ATP Syn</text>
            <text x="400" y="45" fill="#10B981" font-size="9" text-anchor="middle">ADP → ATP</text>
          </svg>`,
          caption: "Coupled chemiosmotic electron transport across the thylakoid lipid bilayer."
        },
        comparison: {
          title: "C3 vs C4 vs CAM Photosynthetic Pathways",
          headers: ["Parameter", "C3 Pathway", "C4 Pathway", "CAM Pathway"],
          rows: [
            ["Primary CO₂ Acceptor", "RuBP (5C)", "Phosphoenolpyruvate / PEP (3C)", "PEP (at night)"],
            ["Primary Carboxylating Enzyme", "RuBisCO", "PEP Carboxylase", "PEP Carboxylase"],
            ["First Stable Product", "3-PGA (3C)", "Oxaloacetic Acid / OAA (4C)", "OAA / Malic Acid (4C)"],
            ["Kranz Anatomy", "Absent", "Present in bundle sheath cells", "Absent"],
            ["Photorespiration Loss", "High (~25-40% at high temp)", "Negligible / Suppressed", "Negligible"],
            ["Optimum Temperature", "20°C – 25°C", "30°C – 45°C", "Variable (Desert adapted)"]
          ]
        },
        commonMistakes: [
          {
            mistake: "Confusing the site of light reaction with the dark reaction.",
            correction: "Light reaction is membrane-bound on thylakoids; Calvin cycle enzymes (RuBisCO) are soluble in the hydrophilic stroma matrix."
          },
          {
            mistake: "Assuming RuBisCO fixes CO₂ in C4 mesophyll cells.",
            correction: "In C4 plants, initial fixation in mesophyll is performed strictly by PEP carboxylase (which has zero oxygenase activity); RuBisCO operates exclusively inside bundle sheath cells where CO₂ is concentrated."
          }
        ],
        memoryTrick: {
          mnemonic: "18-12 Rule (Calvin Currency)",
          explanation: "18 ATP + 12 NADPH = 1 Hexose Glucose. (Ratio 3 ATP : 2 NADPH per CO₂ fixed)."
        },
        examPoints: {
          highYieldPoints: [
            "Quantum yield: 8-10 photons required per O₂ molecule evolved.",
            "RuBisCO active site requires Mg²⁺ and carbamylated lysine residue for catalytic activation.",
            "Kranz anatomy features dimorphic chloroplasts: granal in mesophyll, agranal in bundle sheath.",
            "Blackman's Law of Limiting Factors (1905): The rate of a process is limited by the pace of the slowest factor."
          ],
          keyTerms: ["Photosystems", "Z-Scheme", "RuBisCO", "Photophosphorylation", "Chemiosmosis", "Kranz Anatomy", "Photorespiration"],
          expectedAnswerStructure: "Ultrastructure site → Photochemical Z-scheme & water photolysis → Chemiosmotic ATP synthesis → Calvin cycle stoichiometry → C3 vs C4 comparative analysis.",
          potentialMcqFacts: ["RuBisCO acts as an oxygenase when CO₂:O₂ ratio drops or temperature rises above 30°C."]
        },
        summary: [
          "Light reactions on thylakoid generate ATP and NADPH via Z-scheme photolysis.",
          "Dark reactions in stroma fix 6 CO₂ into 1 hexose requiring 18 ATP + 12 NADPH.",
          "RuBisCO competitive oxygenase activity triggers wasteful photorespiration in C3 plants.",
          "C4 plants overcome photorespiration through Kranz anatomy and PEP carboxylase."
        ],
        practiceQuestions: [
          {
            type: "MCQ",
            question: "In C4 plants, the primary carboxylation occurs in the mesophyll cells catalyzed by:",
            options: ["RuBisCO", "PEP carboxylase", "Carbonic anhydrase", "Pyruvate kinase"],
            answer: "PEP carboxylase",
            explanation: "Phosphoenolpyruvate (PEP) carboxylase fixes atmospheric CO₂ into 4C Oxaloacetic acid (OAA) in mesophyll cells, exhibiting high affinity for HCO₃⁻ with no oxygenase activity."
          }
        ],
        followUpSuggestions: [
          "Detail the enzymatic steps of the Kok S-state water oxidation cycle in the OEC.",
          "How does the Q-cycle at Cytochrome b₆f double the proton pumping efficiency?",
          "Explain the energetic cost of the C2 photorespiratory glycolate pathway."
        ]
      };
    }

    // =========================================================================
    // PROFILE D: UPSC ASPIRANT / COMPETITIVE EXAM (Civil Services GS Paper 3)
    // Multidisciplinary analysis: Ecology, Carbon Sink, Blue Carbon, Climate Change, Bio-hydrogen, Policy & GS-3 Blueprint
    // =========================================================================
    return {
      subject: "General Studies Paper 3 (Science & Tech, Environment & Climate Change)",
      topic: "Photosynthesis: Biophysical Mechanics, Global Carbon Cycle & Climate Policy (UPSC GS-3)",
      difficulty: "EXAM_FOCUSED",
      isMath: false,
      quickAnswer: isHindi
        ? "प्रकाश संश्लेषण पृथ्वी की प्राथमिक उत्पादकता (Primary Productivity) का आधार है, जो वैश्विक कार्बन चक्र, समुद्री-स्थलीय कार्बन सिंक (Blue Carbon) और खाद्य सुरक्षा को नियंत्रित करता है। यह जलवायु परिवर्तन शमन (UNFCCC, पेरिस समझौता) और कृत्रिम प्रकाश संश्लेषण द्वारा हरित हाइड्रोजन उत्पादन के लिए निर्णायक है।"
        : "Photosynthesis is the foundational biophysical driver of global primary productivity and biogeochemical carbon cycling, dictating terrestrial and marine carbon sinks (Blue Carbon), planetary food security, and frontier climate mitigation under the UNFCCC Paris Agreement and India's Net-Zero 2070 framework.",
      foundation: {
        title: "UPSC GS-3 Multidisciplinary Analytical Framework",
        explanation: "For the Civil Services Examination, photosynthesis transcends basic botany: it is examined across Biogeochemical Cycling, Carbon Sequestration dynamics, Agricultural Food Security under anthropogenic thermal stress, and Frontiers of Bio-energy (Artificial Photosynthesis).",
        technicalTerms: [
          {
            term: "Primary Productivity (GPP vs NPP)",
            simpleMeaning: "Gross Primary Productivity (total chemical energy fixed) minus autotrophic respiration losses equals Net Primary Productivity",
            example: "NPP represents the total organic biomass available to heterotrophic trophic levels."
          },
          {
            term: "Blue Carbon Ecosystems",
            simpleMeaning: "Coastal and marine ecosystems (mangroves, tidal salt marshes, seagrass meadows) that sequester organic carbon via marine photosynthesis",
            example: "Sequester organic carbon up to 10× faster per hectare than terrestrial tropical rainforests."
          },
          {
            term: "Thermal Stress on RuBisCO",
            simpleMeaning: "Global warming increases RuBisCO oxygenase affinity over carboxylase, driving photorespiration and reducing C3 staple crop yields (rice, wheat) by up to 20-30%",
            example: "A grave risk to India's agricultural output in Indo-Gangetic Plains."
          },
          {
            term: "Artificial Photosynthesis (Green Hydrogen)",
            simpleMeaning: "Biomimetic photo-electrochemical water splitting using solar cells and catalysts to produce clean hydrogen fuel without greenhouse gas emissions",
            example: "Core pillar of the National Green Hydrogen Mission."
          }
        ]
      },
      steps: [
        {
          stepNumber: 1,
          title: "1. Global Primary Production & Trophic Baseline",
          content: "Photosynthetic autotrophs fix approximately 120 gigatonnes of elemental carbon annually. Marine phytoplankton contribute over 50% of planetary oxygen, underpinning ocean food webs."
        },
        {
          stepNumber: 2,
          title: "2. Carbon Sequestration & Biogeochemical Sinks",
          content: "Terrestrial forests and coastal Blue Carbon habitats act as massive carbon sinks, absorbing roughly 30% of anthropogenic CO₂ emissions annually."
        },
        {
          stepNumber: 3,
          title: "3. Anthropogenic Climate Stressors",
          content: "Elevated temperatures and marine heatwaves induce coral bleaching, phytoplankton decline, and increased photorespiration in C3 food staples, jeopardizing Sustainable Development Goal 2 (Zero Hunger)."
        },
        {
          stepNumber: 4,
          title: "4. Policy Framework & Nature-based Solutions (NbS)",
          content: "India's updated NDC commitment under the Paris Agreement targets creating an additional cumulative carbon sink of 2.5 to 3.0 billion tonnes of CO₂ equivalent through agro-forestry by 2030."
        }
      ],
      whyAndHow: {
        what: "Planetary energetic and carbon regulation system.",
        why: "Central to decarbonization, ecological balance, and climate resilience.",
        how: "By converting solar irradiance into stable carbohydrate polymers and storing carbon in soil/biomass.",
        when: "Critical focus for UNFCCC COP negotiations, carbon credit markets (Article 6), and biodiversity frameworks.",
        where: "Terrestrial biosphere, coastal wetlands, and pelagic ocean zones."
      },
      examples: [
        {
          type: "National Policy Case Study",
          title: "India's Mangrove Initiative for Shoreline Habitats & Tangible Incomes (MISHTI)",
          description: "Union Budget scheme leveraging coastal photosynthesis: restores mangrove wetlands along India's coastline for intensified Blue Carbon sequestration, storm-surge buffering, and coastal livelihood creation."
        },
        {
          type: "Frontier Biotechnology Project",
          title: "IRRI C4 Rice Consortium",
          description: "International Rice Research Institute project genetically engineering C4 photosynthetic Kranz anatomy and PEP carboxylase into C3 rice to boost yield by 50% while reducing water and nitrogen consumption."
        }
      ],
      analogy: {
        hook: "Macro-Policy Perspective...",
        analogyText: "Photosynthesis is the Earth's biological atmospheric scrubber and central bank of energy: it withdraws excess atmospheric carbon debt and converts it into physical capital (biomass, oxygen, timber, and crops). Human emissions are overloading the scrubber while deforestation destroys its capacity.",
        takeaway: "Protecting and enhancing photosynthetic sinks is the most cost-effective Nature-based Solution."
      },
      mathSolution: {
        given: "India's NDC Target: 2.5 to 3.0 Billion Tonnes Additional Carbon Sink by 2030",
        toFind: "Required sequestration rate via forestry and nature-based solutions",
        formula: "Annual Carbon Sequestration = Cumulative Target Sink / Remaining Target Years",
        formulaExplanation: "Calculating required national afforestation scale to fulfill Paris Agreement Nationally Determined Contributions.",
        calculationSteps: [
          { step: "Target Sink", math: "2.5 - 3.0 Gt CO₂ equivalent", explanation: "Committed NDC target" },
          { step: "Mechanism", math: "Forest & tree cover expansion to 33% of geographical area", explanation: "National Forest Policy goal" },
          { step: "Key Schemes", math: "MISHTI + Green India Mission + Nagar Van Yojana", explanation: "Synergistic operational vehicles" }
        ],
        finalAnswer: "Additional 2.5–3.0 Gt CO₂e sink by 2030",
        units: "Gigatonnes CO₂ equivalent",
        verification: "Monitored biannually via Forest Survey of India (ISFR) remote sensing data.",
        alternateMethod: ""
      },
      flowchart: {
        title: "Photosynthesis in Global Climate & Policy Architecture",
        nodes: [
          { label: "Solar Energy & Atmospheric CO₂", description: "Primary inputs for planetary photosynthesis" },
          { label: "Terrestrial & Blue Carbon Sinks", description: "Absorbs ~30% of anthropogenic emissions" },
          { label: "Climate Vulnerability", description: "Photorespiration spikes; phytoplankton drops" },
          { label: "Policy Interventions (NDC/MISHTI)", description: "Afforestation, BECCS & Artificial Photosynthesis" }
        ]
      },
      diagram: {
        title: "The Terrestrial & Blue Carbon Sink Cycle",
        type: "svg",
        svgContent: `<svg viewBox="0 0 480 170" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <rect x="20" y="25" width="200" height="120" rx="10" fill="rgba(16,185,129,0.15)" stroke="#10B981" stroke-width="2"/>
          <text x="120" y="55" fill="#10B981" font-size="13" font-weight="bold" text-anchor="middle">🌳 Terrestrial Forests</text>
          <text x="120" y="80" fill="#E2E8F0" font-size="11" text-anchor="middle">C3/C4 Trees & Grasslands</text>
          <text x="120" y="105" fill="#F59E0B" font-size="11" text-anchor="middle">Stores carbon in woody biomass & soil</text>
          <text x="120" y="125" fill="#6EE7B7" font-size="10" text-anchor="middle">NDC Goal: 2.5-3.0 Gt CO₂e sink</text>
          <rect x="260" y="25" width="200" height="120" rx="10" fill="rgba(6,182,212,0.15)" stroke="#06B6D4" stroke-width="2"/>
          <text x="360" y="55" fill="#06B6D4" font-size="13" font-weight="bold" text-anchor="middle">🌊 Marine & Blue Carbon</text>
          <text x="360" y="80" fill="#E2E8F0" font-size="11" text-anchor="middle">Phytoplankton & Mangroves</text>
          <text x="360" y="105" fill="#38BDF8" font-size="11" text-anchor="middle">Phytoplankton > 50% global O₂</text>
          <text x="360" y="125" fill="#F59E0B" font-size="10" text-anchor="middle">MISHTI & Coastal Protection</text>
        </svg>`,
        caption: "Terrestrial and oceanic photosynthesis anchoring global carbon sinks."
      },
      comparison: {
        title: "Terrestrial Carbon vs Blue Carbon Sequestration",
        headers: ["Dimension", "Terrestrial Forest Carbon", "Coastal Blue Carbon (Mangroves/Seagrass)"],
        rows: [
          ["Sequestration Speed", "Moderate (~0.5 - 2 tonnes C/ha/yr)", "Very High (~2 - 8 tonnes C/ha/yr - up to 10× faster)"],
          ["Storage Longevity", "Centuries (vulnerable to wildfires & logging)", "Millennia (anaerobic sediments prevent oxidation)"],
          ["Ecosystem Threats", "Deforestation, forest fires, drought", "Coastal development, aquaculture, ocean acidification"],
          ["Key Indian Schemes", "Green India Mission, CAMPA funds", "MISHTI Scheme, Coastal Regulation Zone (CRZ)"]
        ]
      },
      commonMistakes: [
        {
          mistake: "Attributing all planetary oxygen to tropical rainforests (calling Amazon 'the only lungs').",
          correction: "Marine phytoplankton produce more than 50% of the Earth's oxygen, while mature climax forests consume most of their own oxygen via night-time community respiration."
        },
        {
          mistake: "Treating higher atmospheric CO₂ as universally beneficial for agriculture (the 'CO₂ fertilization' myth).",
          correction: "While initial photosynthetic rate rises in C3 plants, concurrent thermal heatwaves increase RuBisCO oxygenation (photorespiration), reduce zinc/protein content, and cause net crop yield declines."
        }
      ],
      memoryTrick: {
        mnemonic: "P-C-T-P (UPSC Mains Answer Structure)",
        explanation: "1. Physiological foundation → 2. Carbon sink & Blue Carbon → 3. Threat from climate change → 4. Policy, S&T & Way Forward."
      },
      examPoints: {
        highYieldPoints: [
          "India's updated NDC commitment (2022): 2.5–3.0 billion tonnes additional carbon sink by 2030.",
          "Phytoplankton produce >50% of atmospheric oxygen; ocean acidification threatens coccolithophores.",
          "MISHTI scheme for mangrove conservation leverages High-Density Blue Carbon.",
          "Artificial Photosynthesis: National Green Hydrogen Mission research priority."
        ],
        keyTerms: ["NPP", "Blue Carbon", "Carbon Sequestration", "RuBisCO Thermal Inefficiency", "MISHTI", "NDC", "Artificial Photosynthesis"],
        expectedAnswerStructure: "Introduction (Ecological Baseline) → Body Paragraph 1 (Biogeochemical Carbon Sinks: Terrestrial vs Marine) → Body Paragraph 2 (Climate Change Disruptions & Agriculture) → Body Paragraph 3 (Technological Frontiers & Genetic Engineering) → Conclusion / Policy Way Forward (Nature-based Solutions).",
        potentialMcqFacts: ["Blue carbon ecosystems sequester carbon up to 10 times faster than mature terrestrial forests."]
      },
      summary: [
        "Photosynthesis drives global primary productivity and terrestrial/marine carbon sinks.",
        "Blue carbon ecosystems (mangroves) sequester carbon at 10x the rate of forests.",
        "Thermal stress increases RuBisCO photorespiration, threatening tropical food security.",
        "Strategic priority under India's NDC, MISHTI scheme, and National Green Hydrogen Mission."
      ],
      practiceQuestions: [
        {
          type: "CONCEPTUAL",
          question: "UPSC Mains GS-3 Practice: 'Nature-based solutions like Blue Carbon conservation offer higher carbon sequestration permanence than terrestrial afforestation.' Critically examine with reference to India's coastal ecosystems.",
          options: [],
          answer: "Blue carbon ecosystems sequester organic matter in saline, anaerobic sediment layers where lack of oxygen prevents microbial decomposition for millennia, unlike terrestrial forests which remain highly susceptible to wildfires and logging.",
          explanation: "Anaerobic sediment saturation preserves carbon profiles across geological timescales."
        }
      ],
      followUpSuggestions: [
        "How does ocean acidification specifically affect marine photosynthetic coccolithophores?",
        "Explain the biomimetic working mechanism of Artificial Photosynthesis for Green Hydrogen generation.",
        "Critically evaluate India's progress toward achieving the 2.5-3 billion tonnes carbon sink NDC target."
      ]
    };
  }

  _getFrenchRevolutionExplanation(lang) {
    return {
      subject: "World History",
      topic: "The French Revolution of 1789 (फ्रांसीसी क्रांति)",
      difficulty: "INTERMEDIATE",
      isMath: false,
      quickAnswer: "The French Revolution (1789–1799) was a watershed period of radical social and political upheaval that overthrew the absolute monarchy of King Louis XVI, dismantled feudal privileges, and established principles of Liberty, Equality, and Fraternity (स्वतंत्रता, समानता, बंधुत्व).",
      foundation: {
        title: "Let's Understand (Starting from Zero)",
        explanation: "Imagine a country where 98% of the population works in fields and shops, pays all the heavy taxes, but has zero say in government. Meanwhile, 2% of the rich nobles and clergy pay zero taxes, live in golden palaces, and waste national treasury. That was France in 1789. The common people finally said: 'Enough!'",
        technicalTerms: [
          { term: "Old Regime (Ancien Régime)", simpleMeaning: "The feudal monarchical society of France before 1789", example: "Ruled by Bourbon monarchs with absolute authority." },
          { term: "Three Estates (तीन संपदाएं)", simpleMeaning: "Social hierarchy: 1st Estate (Clergy), 2nd Estate (Nobility), 3rd Estate (Commoners)", example: "Only the 3rd Estate paid land and salt taxes." },
          { term: "Bastille (बास्तील)", simpleMeaning: "Royal fortress prison in Paris symbolizing tyrannical oppression", example: "Stormed on July 14, 1789." }
        ]
      },
      steps: [
        { stepNumber: 1, title: "Bankruptcy & Famine (1788-1789)", content: "Wars (including aiding American independence) emptied the French treasury. Severe winters caused crop failure and bread prices skyrocketed." },
        { stepNumber: 2, title: "Estates-General Deadlock (May 1789)", content: "King Louis XVI called the Estates-General to levy new taxes. The 3rd Estate demanded 1-person-1-vote instead of 1-estate-1-vote. When rejected, they formed the National Assembly." },
        { stepNumber: 3, title: "Storming of the Bastille (July 14, 1789)", content: "Enraged Parisian crowds stormed the royal prison fortress for gunpowder. This marked the outbreak of the revolution." },
        { stepNumber: 4, title: "Declaration of Rights of Man (August 1789)", content: "Abolished feudalism and proclaimed universal rights: Liberty, Equality, Fraternity." }
      ],
      whyAndHow: {
        what: "The overthrow of absolute monarchy and birth of modern democratic ideals.",
        why: "Severe financial bankruptcy, rigid feudal inequalities, high taxation on commoners, famine, and Enlightenment ideas (Rousseau, Voltaire, Montesquieu).",
        how: "Popular mass revolt combined with intellectual rebellion led by the bourgeoisie.",
        when: "Began with the storming of the Bastille on July 14, 1789.",
        where: "Kingdom of France (centered in Paris and Versailles)."
      },
      examples: [
        { type: "Relatable Scenario", title: "The Dinner Bill Analogy", description: "10 friends go to an expensive restaurant. 2 friends order the costliest champagne and steaks. But when the bill arrives, those 2 pay ₹0 and force the remaining 8 to pay the entire bill! How long before the 8 revolt?" }
      ],
      analogy: {
        hook: "Think of it like this...",
        analogyText: "France was like a pressure cooker on high flame with the safety valve blocked. The fire was high taxes and starvation; the heavy lid was the King and Nobles refusing to compromise. Eventually, the cooker exploded into revolution!",
        takeaway: "Extreme systemic inequality without reform makes revolution inevitable."
      },
      mathSolution: null,
      flowchart: {
        title: "Causes to Revolution Timeline",
        nodes: [
          { label: "Financial Deficit & Famine", description: "Treasury empty, bread crisis" },
          { label: "Estates-General Deadlock", description: "3rd Estate declares National Assembly" },
          { label: "Storming of Bastille (14 July 1789)", description: "Symbolic fall of royal tyranny" },
          { label: "Declaration of Rights", description: "Liberty, Equality, Fraternity established" }
        ]
      },
      diagram: {
        title: "The Three Estates Inequality Pyramid",
        type: "svg",
        svgContent: `<svg viewBox="0 0 480 170" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <polygon points="240,20 340,75 140,75" fill="#EF4444" opacity="0.85"/>
          <text x="240" y="55" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">1st Estate: Clergy (1%) - NO TAX</text>
          <polygon points="140,78 340,78 390,120 90,120" fill="#F59E0B" opacity="0.85"/>
          <text x="240" y="103" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">2nd Estate: Nobility (2%) - NO TAX</text>
          <polygon points="90,123 390,123 440,165 40,165" fill="#3B82F6" opacity="0.85"/>
          <text x="240" y="148" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">3rd Estate: Peasants, Workers, Bourgeoisie (97%) - PAID ALL TAXES</text>
        </svg>`,
        caption: "97% of the population bore 100% of the taxation burden."
      },
      comparison: {
        title: "French Revolution vs American Revolution",
        headers: ["Feature", "French Revolution (1789)", "American Revolution (1776)"],
        rows: [
          ["Nature", "Internal social revolution against domestic monarchy", "Anti-colonial war of independence against foreign British rule"],
          ["Result", "Overthrew monarchy; radical Reign of Terror, later Napoleon", "Formed a federal democratic republic (USA)"],
          ["Target", "Feudal nobility, church privileges, King Louis XVI", "British Parliament and King George III"]
        ]
      },
      commonMistakes: [
        { mistake: "Believing that King Louis XVI was personally evil.", correction: "He was well-meaning but weak, indecisive, and trapped in an archaic political structure." }
      ],
      memoryTrick: {
        mnemonic: "LEF = Liberty, Equality, Fraternity",
        explanation: "The immortal slogan that transformed modern democracy."
      },
      examPoints: {
        highYieldPoints: [
          "Philosophers' impact: Montesquieu (Separation of Powers), Rousseau (Social Contract), Voltaire (Free Speech).",
          "Tennis Court Oath (June 20, 1789): Pledge not to separate until a written constitution was drafted.",
          "Bastille Day (July 14) is celebrated as the National Day of France."
        ],
        keyTerms: ["Tithe", "Taille", "Tennis Court Oath", "Jacobins", "Reign of Terror"],
        expectedAnswerStructure: "Social / Economic / Political causes → Immediate trigger (Estates-General) → Major phases → Global ideological impact.",
        potentialMcqFacts: ["Storming of the Bastille occurred on July 14, 1789."]
      },
      summary: [
        "Unfair Three Estates system forced the poor 97% to pay all taxes.",
        "Financial bankruptcy and high bread prices triggered public revolt.",
        "July 14, 1789 storming of the Bastille ignited the revolution.",
        "Gave the world the universal ideals of Liberty, Equality, and Fraternity."
      ],
      practiceQuestions: [
        {
          type: "MCQ",
          question: "Which Estate in 18th-century France paid all direct taxes?",
          options: ["First Estate (Clergy)", "Second Estate (Nobles)", "Third Estate (Commoners)", "Both First and Second Estates"],
          answer: "Third Estate (Commoners)",
          explanation: "Clergy and Nobility enjoyed feudal tax exemptions."
        }
      ],
      followUpSuggestions: [
        "Who were the Jacobins and what was the Reign of Terror?",
        "How did Napoleon Bonaparte rise to power after the revolution?",
        "What was the impact of the French Revolution on the Indian freedom struggle?"
      ]
    };
  }

  _getWaterCycleExplanation(lang) {
    return {
      subject: "Geography / Earth Science",
      topic: "The Water Cycle (Hydrological Cycle / जल चक्र)",
      difficulty: "BEGINNER",
      isMath: false,
      quickAnswer: "The Water Cycle is Earth's continuous natural recycling system where water moves constantly between oceans, atmosphere, and land through Evaporation, Condensation, Precipitation, and Collection.",
      foundation: {
        title: "Let's Understand (Starting from Zero)",
        explanation: "Did you know that the water you drank today might be the exact same water a dinosaur drank 100 million years ago? Earth has a fixed amount of water that never increases or decreases. Nature simply purifies and recycles it endlessly through the water cycle!",
        technicalTerms: [
          { term: "Evaporation (वाष्पीकरण)", simpleMeaning: "Liquid water heating up and turning into invisible water vapor", example: "Water puddles drying under the sun." },
          { term: "Condensation (संघनन)", simpleMeaning: "Cooling water vapor turning back into tiny liquid droplets to form clouds", example: "Water droplets forming on the outside of a cold glass." },
          { term: "Precipitation (वर्षा)", simpleMeaning: "Water falling from clouds as rain, snow, or hail", example: "Monsoon rains." }
        ]
      },
      steps: [
        { stepNumber: 1, title: "Evaporation & Transpiration", content: "The Sun heats oceans, lakes, and rivers. Plants also release moisture from their leaves (transpiration)." },
        { stepNumber: 2, title: "Condensation (Cloud Formation)", content: "As warm vapor rises, it cools in the upper atmosphere and condenses around microscopic dust particles to form clouds." },
        { stepNumber: 3, title: "Precipitation (Rainfall)", content: "When water droplets inside clouds become too heavy to stay suspended in air, gravity pulls them down as rain or snow." },
        { stepNumber: 4, title: "Collection & Runoff", content: "Rainwater flows into rivers, fills groundwater aquifers, and returns to the oceans to repeat the cycle." }
      ],
      whyAndHow: {
        what: "The continuous circulation of water throughout Earth's hydrosphere.",
        why: "Driven by solar energy and planetary gravity.",
        how: "Phase changes between liquid, vapor, and solid states.",
        when: "24/7 continuously across the globe.",
        where: "Across oceans, atmosphere, land surfaces, and underground aquifers."
      },
      examples: [
        { type: "Kitchen Experiment", title: "Boiling Kettle with a Cold Plate", description: "Boil water in a pot (Evaporation). Hold a cold metal lid over the steam (Condensation into droplets). Watch droplets drip down (Precipitation)! Nature does this on a planetary scale." }
      ],
      analogy: {
        hook: "Think of it like this...",
        analogyText: "The Sun is Earth's giant distillation machine. It gently lifts dirty salt water from oceans, leaves all the salt and dirt behind, carries pure sweet water in cloud wagons, and drops fresh rainwater over our crops!",
        takeaway: "The water cycle is Earth's free natural water purifier."
      },
      mathSolution: null,
      flowchart: {
        title: "Hydrological Cycle Sequence",
        nodes: [
          { label: "1. Evaporation", description: "Water turns to vapor via solar heat" },
          { label: "2. Condensation", description: "Vapor cools to form clouds" },
          { label: "3. Precipitation", description: "Rain / snow falls due to gravity" },
          { label: "4. Runoff & Collection", description: "Returns to rivers & oceans" }
        ]
      },
      diagram: {
        title: "Water Cycle Stages",
        type: "svg",
        svgContent: `<svg viewBox="0 0 480 180" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <rect x="0" y="130" width="480" height="50" fill="#1E3A8A" opacity="0.6"/>
          <text x="100" y="160" fill="#93C5FD" font-size="13" font-weight="bold">🌊 Ocean / Reservoir</text>
          <ellipse cx="400" cy="40" rx="30" ry="30" fill="#F59E0B"/>
          <text x="400" y="45" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">☀️ Sun</text>
          <path d="M 120 130 Q 120 70 170 50" stroke="#F59E0B" stroke-width="2.5" stroke-dasharray="4,4"/>
          <text x="100" y="85" fill="#F59E0B" font-size="11" font-weight="bold">↑ Evaporation</text>
          <ellipse cx="240" cy="45" rx="55" ry="25" fill="#E2E8F0" opacity="0.85"/>
          <text x="240" y="48" fill="#1E293B" font-size="12" font-weight="bold" text-anchor="middle">☁️ Clouds</text>
          <path d="M 280 65 L 340 125" stroke="#3B82F6" stroke-width="2.5"/>
          <text x="340" y="95" fill="#3B82F6" font-size="11" font-weight="bold">↓ Rain (Precipitation)</text>
          <path d="M 360 135 L 200 145" stroke="#10B981" stroke-width="2.5"/>
          <text x="280" y="160" fill="#10B981" font-size="11" font-weight="bold">← Runoff</text>
        </svg>`,
        caption: "Solar heat evaporates water → clouds condense → rain precipitates → returns to sea."
      },
      comparison: null,
      commonMistakes: [
        { mistake: "Thinking water vapor is visible as white clouds.", correction: "True water vapor is invisible gas. Clouds are actually billions of tiny liquid water droplets condensed in air!" }
      ],
      memoryTrick: {
        mnemonic: "E-C-P-C (Every Cloud Produces Cloudbursts)",
        explanation: "Evaporation → Condensation → Precipitation → Collection."
      },
      examPoints: {
        highYieldPoints: [
          "Transpiration from plants contributes about 10% of atmospheric moisture.",
          "Oceans hold ~96.5% of all Earth's water, but produce ~86% of global evaporation.",
          "Groundwater replenishment (infiltration) depends on soil permeability and vegetation cover."
        ],
        keyTerms: ["Evapotranspiration", "Dew Point", "Infiltration", "Aquifer", "Hydrosphere"],
        expectedAnswerStructure: "Definition → Four Primary Phases with Scientific Mechanisms → Solar Driving Force → Environmental Significance.",
        potentialMcqFacts: ["Oceans contribute ~86% of global evaporation."]
      },
      summary: [
        "Water cycle is the endless planetary circulation of water.",
        "Main steps: Evaporation, Condensation, Precipitation, Collection.",
        "Powered entirely by solar heat energy and Earth's gravity.",
        "Maintains freshwater supplies and global climate temperature balance."
      ],
      practiceQuestions: [
        {
          type: "MCQ",
          question: "The process by which plants release water vapor through leaf pores is called:",
          options: ["Precipitation", "Transpiration", "Sublimation", "Infiltration"],
          answer: "Transpiration",
          explanation: "Transpiration is the evaporative loss of water vapor from aerial plant parts."
        }
      ],
      followUpSuggestions: [
        "How does deforestation disrupt the water cycle?",
        "What is the difference between rain, snow, hail, and sleet?",
        "How do clouds stay floating in the air if water is heavier than air?"
      ]
    };
  }

  _getRamExplanation(lang) {
    return {
      subject: "Computer Science",
      topic: "Random Access Memory (RAM)",
      difficulty: "BEGINNER",
      isMath: false,
      quickAnswer: "RAM (Random Access Memory) is a computer's ultra-fast, temporary working memory where active programs and data are kept for instant access by the CPU while the computer is turned on.",
      foundation: {
        title: "Let's Understand (Starting from Zero)",
        explanation: "Imagine you are sitting at a study desk. Your textbook is open right in front of you on the desk so you can read it instantly. But all your other 50 books are stored away in the bookshelf behind you. The study desk is RAM (fast, right in front of you, but limited space). The bookshelf is your Hard Drive/SSD (huge storage, but slower to walk over and fetch).",
        technicalTerms: [
          { term: "Volatile Memory (अस्थिर मेमोरी)", simpleMeaning: "Data disappears as soon as power is turned off", example: "Unsaved Word document lost during a sudden power outage." },
          { term: "Random Access", simpleMeaning: "The CPU can access any memory cell in the exact same fraction of a nanosecond", example: "Opening app 1 or app 10 takes the identical instant speed." }
        ]
      },
      steps: [
        { stepNumber: 1, title: "Launching an Application", content: "When you double-click Chrome or a game, it is copied from your slow SSD into your fast RAM." },
        { stepNumber: 2, title: "High-Speed CPU Processing", content: "The CPU reads and modifies instructions directly from RAM millions of times every second." },
        { stepNumber: 3, title: "Saving Back to Disk", content: "When you press 'Save', your work is written back from volatile RAM to permanent storage (SSD/HDD)." }
      ],
      whyAndHow: {
        what: "High-speed primary volatile storage.",
        why: "SSDs and hard drives are far too slow to keep up with the gigahertz speed of modern CPUs.",
        how: "Uses capacitors and transistors to store bits (0s and 1s) as electrical charges.",
        when: "Continuously active whenever your computer or phone is powered on.",
        where: "Located on memory DIMM sticks slotted directly into the motherboard."
      },
      examples: [
        { type: "Everyday Example", title: "Multitasking on a Smartphone", description: "If you have 16GB RAM, you can keep YouTube, WhatsApp, and a heavy game open simultaneously without apps refreshing or freezing!" }
      ],
      analogy: {
        hook: "Think of it like this...",
        analogyText: "CPU is the Master Chef. RAM is the Chef's chopping board right under his hands. Hard Drive (SSD) is the storage refrigerator in the basement. A bigger chopping board (more RAM) means the chef can work on 5 dishes at once without running to the basement!",
        takeaway: "More RAM doesn't make a single task faster, but allows you to run multiple heavy tasks smoothly."
      },
      mathSolution: null,
      flowchart: {
        title: "Computer Memory Hierarchy Flow",
        nodes: [
          { label: "Storage (SSD/HDD)", description: "Permanent, Huge, Slower" },
          { label: "RAM (Main Memory)", description: "Temporary, Fast, Active workspace" },
          { label: "CPU Cache (L1/L2/L3)", description: "Ultra-fast, Inside processor" },
          { label: "CPU Registers", description: "Nanosecond instruction execution" }
        ]
      },
      diagram: {
        title: "Memory Speed Hierarchy",
        type: "svg",
        svgContent: `<svg viewBox="0 0 480 170" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <rect x="20" y="30" width="120" height="90" rx="10" fill="#1E293B" stroke="#64748B" stroke-width="2"/>
          <text x="80" y="65" fill="#94A3B8" font-size="13" font-weight="bold" text-anchor="middle">SSD / HDD</text>
          <text x="80" y="85" fill="#64748B" font-size="11" text-anchor="middle">Permanent</text>
          <text x="80" y="102" fill="#64748B" font-size="10" text-anchor="middle">~500-7000 MB/s</text>

          <path d="M 145 75 L 185 75" stroke="#F59E0B" stroke-width="3" marker-end="url(#arrow)"/>

          <rect x="190" y="20" width="140" height="110" rx="12" fill="rgba(79,70,229,0.2)" stroke="#4F46E5" stroke-width="2.5"/>
          <text x="260" y="60" fill="#818CF8" font-size="16" font-weight="bold" text-anchor="middle">⚡ RAM</text>
          <text x="260" y="80" fill="#F59E0B" font-size="11" font-weight="bold" text-anchor="middle">Volatile Working Table</text>
          <text x="260" y="100" fill="#C7D2FE" font-size="11" text-anchor="middle">~25,000-80,000 MB/s</text>

          <path d="M 335 75 L 375 75" stroke="#10B981" stroke-width="3"/>

          <rect x="380" y="30" width="80" height="90" rx="10" fill="#065F46" stroke="#10B981" stroke-width="2"/>
          <text x="420" y="70" fill="#34D399" font-size="14" font-weight="bold" text-anchor="middle">CPU</text>
          <text x="420" y="90" fill="#A7F3D0" font-size="10" text-anchor="middle">Processor</text>
        </svg>`,
        caption: "RAM bridges the massive speed gap between slow SSD storage and ultra-fast CPU processing."
      },
      comparison: {
        title: "RAM vs ROM Comparison",
        headers: ["Feature", "RAM (Random Access Memory)", "ROM (Read Only Memory)"],
        rows: [
          ["Volatility", "Volatile (loses data on power off)", "Non-Volatile (retains data forever)"],
          ["Function", "Runs current active programs & browser tabs", "Stores startup BIOS/UEFI firmware"],
          ["Read/Write", "High-speed Read and Write", "Primarily Read-only"],
          ["Capacity", "Typically 8GB to 64GB in modern PCs", "Small (typically a few Megabytes)"]
        ]
      },
      commonMistakes: [
        { mistake: "Confusing RAM capacity with phone internal storage (e.g., 'My phone has 128GB RAM').", correction: "128GB is permanent storage (ROM/UFS) for your photos. RAM is 6GB or 8GB for running apps." }
      ],
      memoryTrick: {
        mnemonic: "RAM = Run All Multitasking (Temporary)",
        explanation: "RAM runs what is active RIGHT NOW; ROM remembers forever."
      },
      examPoints: {
        highYieldPoints: [
          "DRAM (Dynamic RAM) uses 1 transistor + 1 capacitor per bit; requires periodic refresh.",
          "SRAM (Static RAM) uses 4-6 transistors per bit; faster, does not need refresh, used for CPU Cache.",
          "Virtual Memory (Paging): When RAM runs out, OS uses a portion of SSD as emergency backup memory."
        ],
        keyTerms: ["DRAM", "SRAM", "Volatile", "Bus Speed", "Latency (CL)", "Virtual Memory"],
        expectedAnswerStructure: "Definition → Architectural Function → Volatility Concept → RAM vs ROM Table → DRAM vs SRAM distinctions.",
        potentialMcqFacts: ["SRAM is used for CPU cache because it does not require electrical refreshing."]
      },
      summary: [
        "RAM is ultra-fast temporary memory for running applications.",
        "It is volatile: all contents disappear when power turns off.",
        "Acts as a fast buffer between the slow SSD and the lightning-fast CPU.",
        "More RAM prevents system lag when running multiple apps."
      ],
      practiceQuestions: [
        {
          type: "MCQ",
          question: "Which of the following types of memory loses its contents when power is turned off?",
          options: ["ROM", "Hard Disk Drive", "RAM", "Flash Memory"],
          answer: "RAM",
          explanation: "RAM is volatile memory; without constant electrical power, stored charges dissipate."
        }
      ],
      followUpSuggestions: [
        "What is the difference between DDR4 and DDR5 RAM?",
        "What happens when your computer runs out of RAM?",
        "What is Virtual Memory (Paging) in Windows and Linux?"
      ]
    };
  }

  _getConstitutionExplanation(lang) {
    return {
      subject: "Indian Polity & Constitution (भारतीय राजव्यवस्था)",
      topic: "The Constitution of India (भारतीय संविधान)",
      difficulty: "BEGINNER",
      isMath: false,
      quickAnswer: "भारतीय संविधान भारत का सर्वोच्च कानून (Supreme Law of the Land) है, जो देश की शासन प्रणाली, नागरिकों के मौलिक अधिकार, कर्तव्यों और सरकार के तीनों अंगों (विधायिका, कार्यपालिका, न्यायपालिका) की शक्तियों व सीमाओं को निर्धारित करता है।",
      foundation: {
        title: "शून्य से समझें (Understanding from Zero)",
        explanation: "जैसे क्रिकेट या फुटबॉल का एक नियम-पुस्तिका (Rulebook) होता है जिसके बिना खेल नहीं चल सकता, ठीक उसी तरह पूरे देश को न्याय, समानता और शांति से चलाने के लिए बनाई गई सर्वोच्च नियम-पुस्तिका को 'संविधान' कहते हैं। यह 140 करोड़ भारतीयों के अधिकारों की ढाल है।",
        technicalTerms: [
          { term: "संवैधानिक सर्वोच्चता (Constitutional Supremacy)", simpleMeaning: "देश में कोई भी नेता, कानून या संसद संविधान से ऊपर नहीं है", example: "यदि कोई कानून संविधान का उल्लंघन करता है, तो सुप्रीम कोर्ट उसे रद्द कर सकता है।" },
          { term: "प्रस्तावना (Preamble)", simpleMeaning: "संविधान का परिचय या सार (आत्मा)", example: "'हम, भारत के लोग...'" },
          { term: "मौलिक अधिकार (Fundamental Rights)", simpleMeaning: "हर नागरिक को जन्म से मिले अपरिहार्य अधिकार", example: "समानता का अधिकार, बोलने की स्वतंत्रता।" }
        ]
      },
      steps: [
        { stepNumber: 1, title: "संविधान सभा का गठन (1946)", content: "कैबिनेट मिशन योजना के तहत भारत के योग्य प्रतिनिधियों की 'संविधान सभा' बनाई गई।" },
        { stepNumber: 2, title: "प्रारूपण (Drafting Committee)", content: "डॉ. भीमराव अंबेडकर की अध्यक्षता वाली प्रारूप समिति ने दुनिया भर के अच्छे विचारों को अपनाकर भारत के अनुरूप संविधान तैयार किया। इसमें 2 वर्ष, 11 महीने, 18 दिन लगे।" },
        { stepNumber: 3, title: "स्वीकृति व लागू होना", content: "26 नवंबर 1949 को इसे अंगीकृत (Adopt) किया गया (संविधान दिवस), और 26 जनवरी 1950 को यह पूर्ण रूप से लागू हुआ (गणतंत्र दिवस)।" }
      ],
      whyAndHow: {
        what: "विश्व का सबसे विस्तृत लिखित संविधान।",
        why: "तानाशाही रोकने, विधि का शासन स्थापित करने और सामाजिक-आर्थिक न्याय सुनिश्चित करने हेतु।",
        how: "संविधान सभा में गहन लोकतांत्रिक बहसों के उपरांत सर्वसम्मति से पारित हुआ।",
        when: "26 जनवरी 1950 को लागू हुआ।",
        where: "संपूर्ण भारत गणराज्य पर लागू।"
      },
      examples: [
        { type: "दैनिक जीवन का उदाहरण", title: "समानता का अधिकार (अनुच्छेद 14)", description: "चाहे देश का प्रधानमंत्री हो या साधारण मजदूर, कानून के समक्ष सब समान हैं। अपराध करने पर दोनों पर एक ही कानूनी प्रक्रिया लागू होगी।" }
      ],
      analogy: {
        hook: "ऐसे समझें...",
        analogyText: "जैसे एक विशाल बरगद का पेड़ अपनी मजबूत जड़ों से हजारों शाखाओं और पक्षियों को सहारा देता है, वैसे ही भारतीय संविधान विभिन्न धर्मों, भाषाओं और संस्कृतियों वाले इस विशाल राष्ट्र को एक सूत्र में सुरक्षित बांधे रखता है।",
        takeaway: "संविधान लोकतंत्र की सुरक्षा कवच है।"
      },
      mathSolution: null,
      flowchart: {
        title: "भारतीय लोकतंत्र के तीन प्रमुख अंग",
        nodes: [
          { label: "विधायिका (Legislature)", description: "संसद - कानून बनाना" },
          { label: "कार्यपालिका (Executive)", description: "राष्ट्रपति व मंत्रीपरिषद - कानून लागू करना" },
          { label: "न्यायपालिका (Judiciary)", description: "सुप्रीम कोर्ट - कानून की व्याख्या व रक्षा" }
        ]
      },
      diagram: {
        title: "सरकार के 3 अंग व शक्तियों का संतुलन (Checks & Balances)",
        type: "svg",
        svgContent: `<svg viewBox="0 0 480 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <circle cx="240" cy="80" rx="35" ry="35" fill="rgba(245,158,11,0.2)" stroke="#F59E0B" stroke-width="2"/>
          <text x="240" y="85" fill="#F59E0B" font-size="12" font-weight="bold" text-anchor="middle">संविधान</text>
          <rect x="20" y="55" width="110" height="50" rx="8" fill="#4F46E5" opacity="0.85"/>
          <text x="75" y="85" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">विधायिका (संसद)</text>
          <rect x="350" y="55" width="110" height="50" rx="8" fill="#10B981" opacity="0.85"/>
          <text x="405" y="85" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">कार्यपालिका</text>
          <rect x="185" y="120" width="110" height="35" rx="8" fill="#EF4444" opacity="0.85"/>
          <text x="240" y="142" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">न्यायपालिका</text>
        </svg>`,
        caption: "संविधान के अंतर्गत तीनों अंग एक-दूसरे को संतुलित करते हैं।"
      },
      comparison: {
        title: "मौलिक अधिकार बनाम नीति निदेशक तत्व",
        headers: ["बिंदु", "मौलिक अधिकार (भाग 3)", "नीति निदेशक तत्व (भाग 4)"],
        rows: [
          ["प्रकृति", "न्यायोचित (Justiciable - कोर्ट जा सकते हैं)", "गैर-न्यायोचित (Non-justiciable)"],
          ["उद्देश्य", "राजनीतिक लोकतंत्र की स्थापना", "सामाजिक व आर्थिक लोकतंत्र की स्थापना"],
          ["स्रोत", "अमेरिकी संविधान से प्रेरित", "आयरलैंड के संविधान से प्रेरित"]
        ]
      },
      commonMistakes: [
        { mistake: "26 नवंबर और 26 जनवरी में भ्रमित होना।", correction: "26 नवंबर 1949 को संविधान बनकर तैयार हुआ व स्वीकारा गया (संविधान दिवस)। 26 जनवरी 1950 को यह लागू हुआ (गणतंत्र दिवस)।" }
      ],
      memoryTrick: {
        mnemonic: "SO-SO-SE-DE-RE (प्रस्तावना के 5 आदर्श शब्द)",
        explanation: "Sovereign (संप्रभु), Socialist (समाजवादी), Secular (पंथनिरपेक्ष), Democratic (लोकतांत्रिक), Republic (गणराज्य)।"
      },
      examPoints: {
        highYieldPoints: [
          "संविधान के मूल पाठ में 395 अनुच्छेद, 22 भाग और 8 अनुसूचियां थीं।",
          "डॉ. भीमराव अंबेडकर को 'भारतीय संविधान का जनक' कहा जाता है।",
          "केशवानंद भारती केस (1973): सुप्रीम कोर्ट ने 'मूल ढांचे का सिद्धांत' (Basic Structure Doctrine) दिया।"
        ],
        keyTerms: ["प्रस्तावना", "मौलिक अधिकार", "मूल ढांचा", "विधि का शासन", "संविधान संशोधन (अनुच्छेद 368)"],
        expectedAnswerStructure: "संविधान की परिभाषा → ऐतिहासिक पृष्ठभूमि → प्रमुख विशेषताएं → लोकतंत्र के तीन अंग → आधुनिक महत्व।",
        potentialMcqFacts: ["संविधान निर्माण में 2 वर्ष, 11 माह, 18 दिन का समय लगा।"]
      },
      summary: [
        "भारतीय संविधान देश का सर्वोच्च लिखित नियम-विधान है।",
        "यह नागरिकों को 6 मौलिक अधिकार प्रदान करता है।",
        "डॉ. अंबेडकर की अध्यक्षता में 2 वर्ष 11 महीने 18 दिन में तैयार हुआ।",
        "26 जनवरी 1950 को लागू हुआ और भारत एक संपूर्ण प्रभुत्व-संपन्न गणराज्य बना।"
      ],
      practiceQuestions: [
        {
          type: "MCQ",
          question: "भारतीय संविधान का 'मूल ढांचा सिद्धांत' (Basic Structure Doctrine) किस ऐतिहासिक वाद में दिया गया था?",
          options: ["गोलकनाथ वाद (1967)", "केशवानंद भारती वाद (1973)", "मिनर्वा मिल्स वाद (1980)", "मेनका गांधी वाद (1978)"],
          answer: "केशवानंद भारती वाद (1973)",
          explanation: "13 जजों की सबसे बड़ी संवैधानिक पीठ ने संसद की संशोधन शक्तियों को सीमित करते हुए मूल ढांचे का सिद्धांत दिया।"
        }
      ],
      followUpSuggestions: [
        "संविधान के अनुच्छेद 32 को डॉ. अंबेडकर ने 'हृदय और आत्मा' क्यों कहा?",
        "मूल अधिकार और कानूनी अधिकार में क्या अंतर है?",
        "भारत में संविधान संशोधन (Article 368) की क्या प्रक्रिया है?"
      ]
    };
  }

  _getInflationExplanation(lang, ctx) {
    const isHindi = lang === 'HINDI';
    const isBilingual = lang === 'BILINGUAL';
    const level = ctx?.educationLevel || 'CLASS_10';

    // =========================================================================
    // PROFILE A: CLASS 6 (Middle School: 10–12 years old)
    // Story of ₹10 coin and shrinking ice-cream scoop, zero heavy jargon
    // =========================================================================
    if (level === 'CLASS_6') {
      return {
        subject: "Social Studies / Everyday Life (कक्षा 6)",
        topic: "What is Inflation? (महंगाई क्या होती है?)",
        difficulty: "BEGINNER",
        isMath: false,
        quickAnswer: isHindi
          ? "महंगाई (Inflation) का सीधा मतलब है कि समय के साथ चीज़ों की कीमतें बढ़ जाती हैं, जिससे आपकी जेब खर्च में पहले से कम टॉफियां या खिलौने आते हैं!"
          : "Inflation simply means that things become more expensive over time, so the exact same pocket money buys fewer toys or snacks!",
        foundation: {
          title: isHindi ? "10 रुपये के सिक्के की कहानी" : "The Story of the ₹10 Coin",
          explanation: isBilingual
            ? "सोचिए कि 5 साल पहले जब आप ₹10 लेकर दुकान जाते थे, तो आपको एक बड़ा आइसक्रीम कोन मिलता था। लेकिन आज जब आप वही ₹10 का सिक्का लेकर जाते हैं, तो दुकानदार आपको एक छोटा सा लॉलीपॉप देता है! आपका ₹10 का सिक्का छोटा नहीं हुआ, लेकिन उसकी ताकत कम हो गई। इसी को महंगाई (Inflation) कहते हैं।"
            : "Imagine 5 years ago when you took a ₹10 coin to the shop, you could buy a big chocolate ice-cream cone. But today, with that exact same ₹10 coin, the shopkeeper only gives you a small lollipop! Your ₹10 coin did not shrink, but its buying power became smaller. That is what Inflation means.",
          technicalTerms: [
            {
              term: "Pocket Money Power (पैसे की ताकत)",
              simpleMeaning: "How many toys or chocolates your money can buy",
              example: "When prices rise, your pocket money buys less."
            },
            {
              term: "Price Rise (कीमत बढ़ना)",
              simpleMeaning: "When things in the market cost more coins than before",
              example: "A notebook costing ₹20 today instead of ₹15 last year."
            }
          ]
        },
        steps: [
          {
            stepNumber: 1,
            title: isHindi ? "सबको एक ही खिलौना चाहिए" : "Everyone Wants the Same Toy",
            content: "Imagine there are only 2 cricket bats in the shop, but 10 kids want to buy them. Kids will offer more coins to get them!"
          },
          {
            stepNumber: 2,
            title: isHindi ? "दुकानदार कीमत बढ़ा देता है" : "The Price Goes Up",
            content: "Because so many kids want the bats, the shopkeeper raises the price."
          },
          {
            stepNumber: 3,
            title: isHindi ? "पैसे से कम चीज़ें मिलती हैं" : "Your Money Buys Less",
            content: "Now you need to save more pocket money just to buy that one bat!"
          }
        ],
        whyAndHow: {
          what: "Things becoming costlier over time.",
          why: "When making things costs more, or when too many people want to buy fewer goods.",
          how: "Sellers raise prices when their raw materials get expensive.",
          when: "Happens slowly year after year.",
          where: "At grocery stores, toy shops, and school bus fees."
        },
        examples: [
          {
            type: "Pocket Money Story",
            title: "The Canteen Samosa",
            description: "If your school canteen samosa was ₹5 two years ago and is now ₹10, that is everyday inflation right in front of your eyes!"
          }
        ],
        analogy: {
          hook: "Think of it like this...",
          analogyText: "Imagine an auction at school for one shiny video game. If each kid only has 10 marbles, the game sells for 10 marbles. But if every kid is suddenly given 100 marbles, the game will sell for 100 marbles! The video game didn't change — marbles just became less rare!",
          takeaway: "When money is everywhere, things cost more coins."
        },
        mathSolution: {
          given: "Old Ice Cream Price = ₹10, New Ice Cream Price = ₹15",
          toFind: "Price increase",
          formula: "Increase = New Price - Old Price",
          formulaExplanation: "Simple subtraction to see how much extra pocket money you need.",
          calculationSteps: [
            { step: "Step 1", math: "₹15 - ₹10 = ₹5", explanation: "You need ₹5 extra now" }
          ],
          finalAnswer: "Price increased by ₹5",
          units: "₹",
          verification: "₹10 + ₹5 = ₹15 ✓",
          alternateMethod: ""
        },
        flowchart: {
          title: "Simple 3-Step Inflation Story",
          nodes: [
            { label: "1. Making Goods Costs More", description: "Wheat, sugar, or fuel costs rise" },
            { label: "2. Shop Prices Go Up", description: "Snacks and books cost more coins" },
            { label: "3. Pocket Money Buys Less", description: "Purchasing power drops" }
          ]
        },
        diagram: {
          title: "The Shrinking Shopping Basket",
          type: "svg",
          svgContent: `<svg viewBox="0 0 480 150" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <rect x="30" y="25" width="180" height="95" rx="10" fill="rgba(16,185,129,0.2)" stroke="#10B981" stroke-width="2"/>
            <text x="120" y="55" fill="#10B981" font-size="13" font-weight="bold" text-anchor="middle">5 Years Ago: ₹50</text>
            <text x="120" y="85" fill="#E2E8F0" font-size="12" text-anchor="middle">🛒 5 Samosas + 2 Juices</text>
            <path d="M 220 70 L 260 70" stroke="#EF4444" stroke-width="3" marker-end="url(#arrow)"/>
            <rect x="270" y="25" width="180" height="95" rx="10" fill="rgba(239,68,68,0.2)" stroke="#EF4444" stroke-width="2"/>
            <text x="360" y="55" fill="#EF4444" font-size="13" font-weight="bold" text-anchor="middle">Today: Same ₹50</text>
            <text x="360" y="85" fill="#E2E8F0" font-size="12" text-anchor="middle">🛒 Only 2 Samosas!</text>
          </svg>`,
          caption: "The same ₹50 note buys fewer snacks today because of inflation."
        },
        comparison: null,
        commonMistakes: [
          {
            mistake: "Thinking your ₹10 coin loses its number.",
            correction: "The number 10 is still on the coin! It's just that the goods in the shop have higher price tags now."
          }
        ],
        memoryTrick: {
          mnemonic: "Inflation = Inflated (Bigger) Price Tags!",
          explanation: "Think of price tags blowing up like big balloons!"
        },
        examPoints: {
          highYieldPoints: [
            "Inflation means general price rise.",
            "It decreases the purchasing power of money."
          ],
          keyTerms: ["Inflation", "Price Rise", "Purchasing Power"],
          expectedAnswerStructure: "Story definition → Example with pocket money → Simple reason why prices rise.",
          potentialMcqFacts: ["Inflation makes goods cost more money."]
        },
        summary: [
          "Inflation = prices rise over time.",
          "Your pocket money buys fewer things.",
          "Happens when too many people want limited goods."
        ],
        practiceQuestions: [
          {
            type: "MCQ",
            question: "If a notebook was ₹20 last year and is ₹25 this year, what happened?",
            options: ["The notebook price experienced inflation", "The notebook became free", "The notebook price shrank", "Nothing changed"],
            answer: "The notebook price experienced inflation",
            explanation: "The price increased by ₹5, which is an example of inflation!"
          }
        ],
        followUpSuggestions: [
          "Who decides the price of things in the supermarket?",
          "Can prices ever go down instead of going up?",
          "How do banks protect people's savings from inflation?"
        ]
      };
    }

    // =========================================================================
    // PROFILE B: CLASS 10 (Secondary Board Economics)
    // Standard secondary economics: purchasing power, cost-push vs demand-pull, CPI basics
    // =========================================================================
    if (level === 'CLASS_10') {
      return {
        subject: "Economics / Social Science (Class 10 CBSE)",
        topic: "Inflation & Purchasing Power of Money (मुद्रा और साख - मुद्रास्फीति)",
        difficulty: "INTERMEDIATE",
        isMath: false,
        quickAnswer: isHindi
          ? "मुद्रास्फीति (Inflation) का अर्थ है समय के साथ वस्तुओं और सेवाओं के सामान्य मूल्य स्तर में निरंतर वृद्धि, जिसके परिणामस्वरूप मुद्रा की क्रय-शक्ति (Purchasing Power) घट जाती है।"
          : "Inflation refers to a persistent, general increase in the price level of goods and services in an economy over time, which erodes the purchasing power of money.",
        foundation: {
          title: "Class 10 Economics: Money and Credit",
          explanation: "In Class 10 Economics (Money and Credit), money acts as a medium of exchange and a store of value. When the general price level rises, a single unit of currency buys fewer goods than before.",
          technicalTerms: [
            { term: "Purchasing Power (क्रय शक्ति)", simpleMeaning: "The quantity of goods and services one unit of currency can buy", example: "Higher inflation causes purchasing power to drop." },
            { term: "CPI (Consumer Price Index)", simpleMeaning: "Measures average retail price changes of a basket of consumer goods", example: "Reflects the price rise experienced by ordinary households." },
            { term: "Demand-Pull vs Cost-Push", simpleMeaning: "Price rise driven by excess consumer demand vs price rise caused by higher raw material/fuel costs", example: "Crude oil price hikes cause cost-push inflation." }
          ]
        },
        steps: [
          { stepNumber: 1, title: "Excess Demand or Production Costs", content: "High money supply boosts demand, or raw material shortages increase production costs." },
          { stepNumber: 2, title: "Sustained Price Increases", content: "Businesses raise wholesale and retail prices across food, fuel, and manufacturing." },
          { stepNumber: 3, title: "Monetary Response", content: "Central banks adjust interest rates to regulate borrowing and restore price stability." }
        ],
        whyAndHow: {
          what: "Sustained upward movement in the overall price index.",
          why: "Disparity between aggregate demand and aggregate supply.",
          how: "Tracked via weighted index numbers (CPI and WPI).",
          when: "Occurs dynamically; low, stable inflation (~3-4%) is normal for growing economies.",
          where: "Household grocery budgets, fuel pumps, housing rents."
        },
        examples: [
          {
            type: "Household Budget Example",
            title: "The Monthly Grocery Bill",
            description: "If a family spent ₹8,000 on monthly groceries in 2024 and pays ₹8,800 for the exact same grocery basket in 2025, the household experienced an annual inflation rate of 10%."
          }
        ],
        analogy: {
          hook: "Economic Balance...",
          analogyText: "Think of the economy as a train: money supply is the engine fuel. Moderate fuel keeps the train moving steadily forward (growth); too much fuel causes the engine to overheat (high inflation); too little fuel causes the train to stall (deflation/recession).",
          takeaway: "Price stability maintains steady economic speed."
        },
        mathSolution: {
          given: "Year 1 Basket = ₹100, Year 2 Basket = ₹106",
          toFind: "Inflation Rate (%)",
          formula: "Inflation Rate = ((Price Year 2 - Price Year 1) / Price Year 1) × 100",
          formulaExplanation: "Percentage change in price level over the baseline period.",
          calculationSteps: [
            { step: "Price difference", math: "106 - 100 = 6", explanation: "Increase is ₹6" },
            { step: "Percentage calculation", math: "(6 / 100) × 100 = 6%", explanation: "6% annual inflation" }
          ],
          finalAnswer: "6% per annum",
          units: "%",
          verification: "100 × 1.06 = 106 ✓",
          alternateMethod: ""
        },
        flowchart: {
          title: "Inflation Transmission Flow",
          nodes: [
            { label: "1. Demand or Cost Rise", description: "Excess liquidity or raw material spike" },
            { label: "2. Retail CPI Increases", description: "General price level shifts upward" },
            { label: "3. Central Bank Tightens", description: "Interest rates adjusted to restore stability" }
          ]
        },
        diagram: {
          title: "Purchasing Power Scale Over Time",
          type: "svg",
          svgContent: `<svg viewBox="0 0 480 150" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <rect x="30" y="30" width="180" height="90" rx="10" fill="rgba(16,185,129,0.2)" stroke="#10B981" stroke-width="2"/>
            <text x="120" y="60" fill="#10B981" font-size="13" font-weight="bold" text-anchor="middle">Year 2020: ₹100</text>
            <text x="120" y="85" fill="#E2E8F0" font-size="11" text-anchor="middle">Buys 10 units</text>
            <path d="M 220 75 L 260 75" stroke="#EF4444" stroke-width="3" marker-end="url(#arrow)"/>
            <rect x="270" y="30" width="180" height="90" rx="10" fill="rgba(239,68,68,0.2)" stroke="#EF4444" stroke-width="2"/>
            <text x="360" y="60" fill="#EF4444" font-size="13" font-weight="bold" text-anchor="middle">Year 2026: ₹100</text>
            <text x="360" y="85" fill="#E2E8F0" font-size="11" text-anchor="middle">Buys only 6 units</text>
          </svg>`,
          caption: "Inflation reduces the real goods one currency unit can buy."
        },
        comparison: {
          title: "Demand-Pull vs Cost-Push Inflation",
          headers: ["Basis", "Demand-Pull Inflation", "Cost-Push Inflation"],
          rows: [
            ["Origin", "Consumers spend excessively ('Too much money chasing few goods')", "Supply shocks raise production costs (oil, wages, raw materials)"],
            ["Remedy", "Raise interest rates, reduce govt spending, increase taxes", "Subsidize key inputs, ease import duties, resolve bottlenecks"]
          ]
        },
        commonMistakes: [
          {
            mistake: "Believing zero inflation (0%) is the best economic goal.",
            correction: "A low, predictable inflation rate (2% to 4%) is healthy because it encourages companies to invest and expand."
          }
        ],
        memoryTrick: {
          mnemonic: "DP vs CP (Demand Pulls up, Cost Pushes up)",
          explanation: "High consumer demand pulls prices up; costlier inputs push prices up from below."
        },
        examPoints: {
          highYieldPoints: [
            "Inflation hurts fixed-income earners and savers the most.",
            "Borrowers generally benefit during unexpected inflation because the real value of their debt decreases."
          ],
          keyTerms: ["Purchasing Power", "Medium of Exchange", "Consumer Price Index", "Demand-Pull", "Cost-Push"],
          expectedAnswerStructure: "Definition → Two Primary Causes (Demand-Pull & Cost-Push) → Impact on purchasing power → Central bank policy.",
          potentialMcqFacts: ["Consumer Price Index (CPI) reflects retail household inflation."]
        },
        summary: [
          "Inflation is the persistent rise in the general price level.",
          "Erodes the purchasing power of money.",
          "Caused by demand-pull and cost-push factors.",
          "Regulated by central bank monetary interventions."
        ],
        practiceQuestions: [
          {
            type: "MCQ",
            question: "Who among the following is most adversely affected by high unexpected inflation?",
            options: ["Fixed-salary workers and pensioners", "Borrowers of home loans", "Business owners selling goods", "Real-estate speculators"],
            answer: "Fixed-salary workers and pensioners",
            explanation: "Their incomes remain constant in nominal terms while their living costs rise steeply, reducing their real purchasing power."
          }
        ],
        followUpSuggestions: [
          "How does the Reserve Bank of India use interest rates to control inflation?",
          "What is the difference between headline inflation and core inflation?",
          "Why is deflation (falling prices) considered dangerous for an economy?"
        ]
      };
    }

    // =========================================================================
    // PROFILE D: UPSC ASPIRANT (Civil Services GS Paper 3 Economics)
    // Macroeconomic policy: CPI-C vs WPI, MPC (Section 45ZB), Repo, FIT 4%±2%, Regressive impact, GS-3 Blueprint
    // =========================================================================
    return {
      subject: "Indian Economy & Macroeconomics (UPSC GS Paper 3)",
      topic: "Inflation Dynamics, Monetary Policy Transmission & Fiscal Implications (मुद्रास्फीति एवं मौद्रिक नीति)",
      difficulty: "EXAM_FOCUSED",
      isMath: false,
      quickAnswer: isHindi
        ? "मुद्रास्फीति (Inflation) अर्थव्यवस्था में सामान्य मूल्य स्तर की निरंतर वृद्धि एवं मुद्रा की क्रय-शक्ति का ह्रास है। भारत में RBI अधिनियम 1934 की धारा 45ZB के तहत मौद्रिक नीति समिति (MPC) उपभोक्ता मूल्य सूचकांक (CPI-Combined) पर आधारित 4% (±2%) के 'लचीले मुद्रास्फीति लक्ष्य' (FIT) के माध्यम से रेपो दर व तरलता प्रबंधन द्वारा इसे नियंत्रित करती है।"
        : "Inflation is the persistent macroeconomic rise in the general price level and the attendant erosion of domestic currency purchasing power. In India, it is governed by the statutory Monetary Policy Committee (MPC) under Section 45ZB of the RBI Act 1934, anchoring headline Consumer Price Index (CPI-Combined) within the Flexible Inflation Targeting (FIT) mandate of 4% (±2%) via the liquidity adjustment facility (LAF) and policy repo rate.",
      foundation: {
        title: "UPSC GS-3 Macroeconomic & Policy Architecture",
        explanation: "Inflation is analyzed across its three conceptual drivers (Demand-Pull, Cost-Push, and Structural/Built-In Wage-Price spirals), institutional anchoring (NSO CPI vs DPIIT WPI), monetary transmission lags, and socio-economic incidence as a regressive tax on marginalized households.",
        technicalTerms: [
          {
            term: "Monetary Policy Committee (MPC)",
            simpleMeaning: "A 6-member statutory committee (3 RBI + 3 Union Govt appointed) chaired by the RBI Governor; decides the policy repo rate by majority vote",
            example: "Mandated to maintain CPI inflation at 4% with a tolerance band of ±2% (2% to 6%)."
          },
          {
            term: "Headline vs Core Inflation",
            simpleMeaning: "Headline CPI encompasses all consumer categories including volatile food and fuel components; Core CPI strips out food and fuel to reveal sticky underlying inflationary pressures",
            example: "Monetary policy watches Core CPI to assess structural second-round effects."
          },
          {
            term: "CPI vs WPI Dichotomy",
            simpleMeaning: "CPI (Base 2012, NSO) measures retail prices with ~45.8% food weight; WPI (Base 2011-12, DPIIT) measures wholesale manufacturer prices with 64.2% manufactured products weight and zero service coverage",
            example: "RBI shifted policy anchor from WPI to CPI in 2014 per Urjit Patel Committee recommendations."
          },
          {
            term: "Monetary Transmission Channels",
            simpleMeaning: "The sequential transmission of policy repo rate changes through bank lending rates, bond yields, credit growth, and aggregate demand to consumer prices",
            example: "Transmission is often delayed by high external commercial borrowings and sticky deposit rates."
          }
        ]
      },
      steps: [
        {
          stepNumber: 1,
          title: "1. Diagnosis of Inflationary Pressures",
          content: "RBI and Ministry of Finance analyze food price spikes (vegetable seasonality), imported inflation (global crude oil, shipping freight, and Rupee depreciation), and domestic capacity utilization."
        },
        {
          stepNumber: 2,
          title: "2. Statutory MPC Policy Intervention",
          content: "If CPI exceeds 6% for three consecutive quarters, RBI triggers failure reporting to Parliament and hikes policy repo rate to tighten Liquidity Adjustment Facility (LAF)."
        },
        {
          stepNumber: 3,
          title: "3. Fiscal & Supply-Side Complements",
          content: "Government executes targeted fiscal interventions: cutting import duties on edible oils/pulses, imposing export restrictions (onion minimum export price), releasing buffer stocks via OMSS (Open Market Sale Scheme)."
        },
        {
          stepNumber: 4,
          title: "4. Second-Round Pass-Through Mitigation",
          content: "Preventing generalized core inflation and anchoring consumer inflation expectations to prevent wage-price spiral emergence."
        }
      ],
      whyAndHow: {
        what: "Macroeconomic price instability and currency depreciation engine.",
        why: "Preserving macroeconomic stability, defending CAD (Current Account Deficit), and protecting real wages.",
        how: "Via counter-cyclical monetary policy (Repo, SDF, MSF, CRR, OMO) coupled with counter-cyclical fiscal buffers.",
        when: "Bi-monthly MPC reviews under Section 45ZB.",
        where: "Affects consumption expenditure, bond yield curves, capital flows, and Gini coefficient."
      },
      examples: [
        {
          type: "GS-3 Policy Case Study",
          title: "The Urjit Patel Committee Reforms (2014)",
          description: "Shifted India's monetary anchor from wholesale WPI to retail CPI-Combined, institutionalized the 6-member MPC, and established Flexible Inflation Targeting (4% ± 2%) under the revised RBI Act."
        },
        {
          type: "Imported Inflation Mechanism",
          title: "The Crude Oil Transmission Vector",
          description: "India imports ~85% of its crude oil. A global crude price spike increases diesel transportation costs, raising retail prices of food and manufactured items across all Indian states."
        }
      ],
      analogy: {
        hook: "Macro-Governance Perspective...",
        analogyText: "Inflation functions as an unlegislated, regressive tax: it redistributes real wealth away from fixed-income workers and rural wage-earners toward asset-rich corporates and debtors. The central bank's repo rate is the hydraulic brake on this wealth-eroding machine.",
        takeaway: "Price stability is a non-negotiable prerequisite for equitable, high sustained GDP growth."
      },
      mathSolution: {
        given: "RBI Statutory Flexible Inflation Target Mandate",
        toFind: "Target corridor & failure condition",
        formula: "Target = 4% | Tolerance Band = [2%, 6%]",
        formulaExplanation: "Section 45ZA of the RBI Act 1934 mandates the Central Government, in consultation with RBI, to set the inflation target once every five years.",
        calculationSteps: [
          { step: "Lower Tolerance", math: "4% - 2% = 2%", explanation: "Deflationary floor" },
          { step: "Central Anchor", math: "4.0%", explanation: "Optimal inflation for developing economy" },
          { step: "Upper Tolerance", math: "4% + 2% = 6%", explanation: "Overheating ceiling" },
          { step: "Failure Trigger", math: "CPI > 6% or CPI < 2% for 3 consecutive quarters", explanation: "Mandatory report to Union Parliament" }
        ],
        finalAnswer: "4.0% (± 2.0%) band",
        units: "% CPI-Combined",
        verification: "Enacted into law via Finance Act 2016.",
        alternateMethod: ""
      },
      flowchart: {
        title: "Monetary Policy Transmission Mechanism in India",
        nodes: [
          { label: "1. CPI Inflation Spike", description: "Food/fuel shock or excess aggregate demand" },
          { label: "2. Statutory MPC Rate Hike", description: "Policy repo rate increased (e.g. +50 bps)" },
          { label: "3. Interbank & Lending Rates Rise", description: "MCLR and EBLR rates rise across banks" },
          { label: "4. Aggregate Demand Cools", description: "Borrowing slows, prices stabilize to 4%" }
        ]
      },
      diagram: {
        title: "India's Flexible Inflation Target Framework",
        type: "svg",
        svgContent: `<svg viewBox="0 0 480 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <rect x="30" y="35" width="420" height="85" rx="12" fill="#1E293B" stroke="#475569" stroke-width="2"/>
          <line x1="120" y1="25" x2="120" y2="135" stroke="#38BDF8" stroke-width="2" stroke-dasharray="4,4"/>
          <text x="120" y="20" fill="#38BDF8" font-size="11" font-weight="bold" text-anchor="middle">2% (Floor)</text>
          <line x1="240" y1="20" x2="240" y2="140" stroke="#10B981" stroke-width="3"/>
          <text x="240" y="15" fill="#10B981" font-size="13" font-weight="bold" text-anchor="middle">4% (Target Anchor)</text>
          <line x1="360" y1="25" x2="360" y2="135" stroke="#EF4444" stroke-width="2" stroke-dasharray="4,4"/>
          <text x="360" y="20" fill="#EF4444" font-size="11" font-weight="bold" text-anchor="middle">6% (Ceiling)</text>
          <rect x="120" y="60" width="240" height="35" rx="6" fill="rgba(16,185,129,0.25)"/>
          <text x="240" y="82" fill="#F59E0B" font-size="11" font-weight="bold" text-anchor="middle">Permissible Tolerance Corridor (4% ± 2%)</text>
        </svg>`,
        caption: "RBI statutory mandate: 4% target with ±2% tolerance band under Section 45ZA."
      },
      comparison: {
        title: "Consumer Price Index (CPI) vs Wholesale Price Index (WPI)",
        headers: ["Parameter", "CPI-Combined", "WPI"],
        rows: [
          ["Publishing Authority", "National Statistical Office (NSO), MoSPI", "Office of Economic Adviser, DPIIT, MoC&I"],
          ["Base Year", "2012 = 100", "2011-12 = 100"],
          ["Food Weight", "High (~45.86% in CPI-C)", "Moderate (~24.38% including primary food)"],
          ["Services Component", "Included (~47% non-food items)", "Completely EXCLUDED (goods only)"],
          ["Monetary Policy Role", "Official policy anchor for RBI (since 2014)", "Auxiliary input for producer price trends"]
        ]
      },
      commonMistakes: [
        {
          mistake: "Stating that WPI is the primary inflation index targeted by the RBI.",
          correction: "UPSC Prelims Trap: Since 2014, the RBI targets CPI-Combined (Consumer Price Index), NOT WPI."
        },
        {
          mistake: "Assuming the RBI Governor has an absolute veto in the MPC.",
          correction: "Decisions are taken by a majority vote of the 6 members. The Governor has a second or casting vote ONLY in the event of a tie."
        }
      ],
      memoryTrick: {
        mnemonic: "C-P-I: Central Bank's Policy Indicator",
        explanation: "CPI-C is the statutory anchor; WPI has zero services."
      },
      examPoints: {
        highYieldPoints: [
          "Monetary Policy Committee (MPC): Section 45ZB, RBI Act 1934; 6 members with 4-year tenure.",
          "Target mandate: 4% CPI with ± 2% tolerance corridor (2% to 6%).",
          "Urjit Patel Committee (2014) recommended inflation targeting and CPI anchoring.",
          "Headline inflation includes food and fuel; Core inflation excludes volatile food and fuel components."
        ],
        keyTerms: ["Flexible Inflation Targeting (FIT)", "Section 45ZB", "CPI-Combined", "Core Inflation", "Monetary Policy Committee", "Repo Rate", "Imported Inflation"],
        expectedAnswerStructure: "Introduction (Macroeconomic definition & Statutory Mandate) → Body Paragraph 1 (Drivers: Demand vs Cost-push vs Structural) → Body Paragraph 2 (Institutional Architecture: MPC & FIT) → Body Paragraph 3 (Socio-Economic Impacts & Monetary-Fiscal Coordination) → Conclusion (Way Forward).",
        potentialMcqFacts: ["The Monetary Policy Committee has 6 members and targets CPI-Combined (4% ± 2%)."]
      },
      summary: [
        "Inflation erodes purchasing power and acts as a regressive tax on the vulnerable.",
        "Statutorily governed by RBI's 6-member MPC targeting 4% (±2%) CPI-Combined.",
        "CPI captures retail services and high food weights, unlike WPI.",
        "Requires counter-cyclical monetary policy coordinated with fiscal supply-side interventions."
      ],
      practiceQuestions: [
        {
          type: "CONCEPTUAL",
          question: "UPSC GS-3 Mains Practice: 'Examine how the Flexible Inflation Targeting (FIT) framework has reshaped monetary policy management in India. Does an excessive focus on headline CPI constrain growth during supply-side shocks?'",
          options: [],
          answer: "FIT provided institutional credibility and anchored long-term inflation expectations. However, during supply-side agricultural or geopolitical crude shocks, demand-compression through repo hikes risks depressing industrial investment without directly resolving food supply bottlenecks, necessitating deeper fiscal-monetary synergy.",
          explanation: "Supply-side shocks cannot be solved by monetary tightening alone."
        }
      ],
      followUpSuggestions: [
        "Explain the working of the Standing Deposit Facility (SDF) introduced by the RBI in 2022.",
        "How do US Federal Reserve interest rate hikes cause imported inflation in emerging markets like India?",
        "Critically evaluate the debate on excluding volatile food components from the statutory inflation target."
      ]
    };
  }

  _getUniversalAdaptiveExplanation(question, lang, depth, mode) {
    const isHindi = lang === 'HINDI';
    const isBilingual = lang === 'BILINGUAL';

    return {
      subject: "General Studies & Concepts",
      topic: question.length > 50 ? question.substring(0, 50) + "..." : question,
      difficulty: "BEGINNER",
      isMath: false,
      quickAnswer: isHindi
        ? `"${question}" के संदर्भ में: इसका मुख्य उद्देश्य और सिद्धांत बुनियादी वैज्ञानिक व तार्किक नियमों पर आधारित है।`
        : `Understanding "${question}": At its foundation, this concept operates on clear, interconnected principles designed for structured learning.`,
      foundation: {
        title: isHindi ? "शून्य से समझें (Starting from Zero)" : "Let's Understand (Starting from Zero)",
        explanation: isBilingual
          ? `किसी भी विषय को आसानी से समझने के लिए हमें सबसे पहले उसकी बुनियादी इकाइयों को जानना चाहिए। "${question}" भी एक चरणबद्ध सिद्धांत का पालन करता है, जहां प्रत्येक चरण स्वाभाविक रूप से अगले चरण से जुड़ता है।`
          : `To master "${question}", we start with the simplest core components. Every complex system is simply a collection of simple ideas working smoothly together.`,
        technicalTerms: [
          {
            term: "Core Concept",
            simpleMeaning: "The foundational rule that governs how this topic functions",
            example: "The fundamental baseline in everyday practice."
          },
          {
            term: "Practical Application",
            simpleMeaning: "How this concept is actively utilized in real-world scenarios",
            example: "Standard implementation in professional and exam settings."
          }
        ]
      },
      steps: [
        {
          stepNumber: 1,
          title: "Identify the Fundamental Baseline",
          content: `We first isolate the core objective of "${question}" and establish what inputs are required.`
        },
        {
          stepNumber: 2,
          title: "Understand the Underlying Mechanism",
          content: "Next, we observe how individual variables interact and influence the final outcome."
        },
        {
          stepNumber: 3,
          title: "Synthesize the Practical Outcome",
          content: "Finally, we connect the theoretical baseline to real-life observations and verified facts."
        }
      ],
      whyAndHow: {
        what: `A comprehensive conceptual breakdown of "${question}".`,
        why: "Understanding the underlying rationale eliminates the need for rote memorization.",
        how: "Through progressive logical reasoning from fundamental axioms to observable facts.",
        when: "Applies consistently across relevant academic and practical contexts.",
        where: "Observed in nature, society, technology, or standard academic curriculums."
      },
      examples: [
        {
          type: "Real-Life Application",
          title: "Everyday Connection",
          description: `Consider how "${question}" operates just like an everyday system where every action generates a predictable, measurable reaction.`
        }
      ],
      analogy: {
        hook: "Think of it like this...",
        analogyText: `Think of "${question}" like building a sturdy house with Lego blocks: you cannot place the roof until the foundation bricks are firmly clicked in place. Once the base is solid, the entire structure stands effortlessly!`,
        takeaway: "Master the base bricks first, and advanced concepts become self-evident."
      },
      mathSolution: null,
      flowchart: {
        title: "Conceptual Progression Flow",
        nodes: [
          { label: "1. Core Foundation", description: "Underlying principles identified" },
          { label: "2. Intermediate Action", description: "Mechanisms & interactions apply" },
          { label: "3. Observable Outcome", description: "Verified real-world result" }
        ]
      },
      diagram: {
        title: "Foundation to Mastery Hierarchy",
        type: "svg",
        svgContent: `<svg viewBox="0 0 480 150" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <rect x="30" y="45" width="120" height="60" rx="10" fill="#4F46E5" opacity="0.85"/>
          <text x="90" y="80" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">Input / Cause</text>
          <path d="M 155 75 L 205 75" stroke="#F59E0B" stroke-width="3"/>
          <rect x="210" y="45" width="120" height="60" rx="10" fill="#7C3AED" opacity="0.85"/>
          <text x="270" y="80" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">Principle</text>
          <path d="M 335 75 L 385 75" stroke="#10B981" stroke-width="3"/>
          <rect x="390" y="45" width="70" height="60" rx="10" fill="#10B981" opacity="0.85"/>
          <text x="425" y="80" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">Outcome</text>
        </svg>`,
        caption: "Every educational concept moves from initial cause through core principle to final outcome."
      },
      comparison: null,
      commonMistakes: [
        {
          mistake: "Memorizing surface definitions without understanding the underlying cause.",
          correction: "Always ask 'WHY does this happen?' before memorizing what it is."
        }
      ],
      memoryTrick: {
        mnemonic: "F-M-O (Foundation → Mechanism → Outcome)",
        explanation: "Anchor your memory on these three progressive steps."
      },
      examPoints: {
        highYieldPoints: [
          "Examiners reward students who explain the underlying cause rather than just quoting textbook definitions.",
          "Linking theory with a real-world example demonstrates true mastery."
        ],
        keyTerms: ["Foundation", "Mechanism", "Application", "Verification"],
        expectedAnswerStructure: "Definition → Underlying Principles → Concrete Example → Key Takeaway.",
        potentialMcqFacts: ["Look for keywords connecting causes to effects in exam options."]
      },
      summary: [
        `"${question}" is grounded in verified, systematic principles.`,
        "Breaking the concept into progressive steps makes understanding natural.",
        "Always connect theory to a relatable real-life analogy."
      ],
      practiceQuestions: [
        {
          type: "CONCEPTUAL",
          question: `What is the primary foundation behind "${question}"?`,
          options: [],
          answer: "The fundamental axioms and observable cause-and-effect mechanisms.",
          explanation: "Every conceptual system relies on validated baseline principles."
        }
      ],
      followUpSuggestions: [
        "Explain this in even simpler language with a story.",
        "Give me another practical everyday example in Hindi.",
        "How is this tested in competitive examinations?"
      ]
    };
  }
}

// Export singleton instance to window
window.aiTeacherService = new AiTeacherService();
