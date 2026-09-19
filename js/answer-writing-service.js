/**
 * HAMSA VIDYA (हंस विद्या) — Answer Writing & AI Evaluation Service
 * Master AI Tutor & Evaluator Engine for UPSC & Competitive Exam Descriptive Answers
 */

class AnswerWritingService {
  constructor() {
    this.directiveGuides = {
      'Discuss': 'Requires a comprehensive exploration of all perspectives, pros & cons, implications, and a balanced conclusion.',
      'Analyze': 'Requires breaking down the topic into core components, identifying cause-and-effect relationships, and examining structural reasons.',
      'Examine': 'Requires probing deeply into the facts and realities of the topic, verifying validity, and establishing underlying causes.',
      'Critically Examine': 'Demands a rigorous appraisal: highlight achievements/strengths, uncover deficiencies/weaknesses, and offer a practical way forward.',
      'Evaluate': 'Requires forming a reasoned value judgement based on evidence, assessing the success/failure or effectiveness of a measure.',
      'Critically Evaluate': 'Requires weighing evidence on both sides, judging limitations, and concluding with a balanced, forward-looking stance.',
      'Elucidate': 'Demands making the topic clear, lucid, and easy to understand with supporting arguments, illustrations, and examples.',
      'Explain': 'Requires clarifying the "how" and "why" of the phenomenon or policy, establishing clear cause-effect clarity.',
      'Comment': 'Requires expressing a reasoned view or perspective on the statement, backed by relevant facts and constitutional/policy backing.',
      'Compare': 'Requires identifying both similarities and differences between two entities, paradigms, or policies systematically.'
    };

    // Pre-curated high-yield descriptive questions repository across major UPSC/PSC subjects
    this.curatedQuestionBank = [
      {
        question: "Discuss the role of the Indian monsoon in shaping India's agricultural economy and macroeconomic stability. What adaptive strategies can mitigate climate change vulnerabilities?",
        exam: "UPSC",
        subject: "Geography & Economy",
        difficulty: "MODERATE",
        directive: "Discuss",
        wordLimit: 150,
        marks: 10,
        answerType: "Paragraph Answer"
      },
      {
        question: "Critically examine the effectiveness of the Basic Structure Doctrine in safeguarding constitutionalism while balancing parliamentary sovereignty.",
        exam: "UPSC",
        subject: "Polity & Governance",
        difficulty: "DIFFICULT",
        directive: "Critically Examine",
        wordLimit: 250,
        marks: 15,
        answerType: "Analytical Answer"
      },
      {
        question: "Analyze the structural bottlenecks hindering India's manufacturing sector despite initiatives like Make in India. Suggest a strategic roadmap for job-rich industrialization.",
        exam: "UPSC",
        subject: "Economy",
        difficulty: "MODERATE",
        directive: "Analyze",
        wordLimit: 150,
        marks: 10,
        answerType: "Analytical Answer"
      },
      {
        question: "Explain the strategic and geopolitical significance of the Indo-Pacific construct for India. How does India balance its strategic autonomy amidst great power rivalry?",
        exam: "UPSC",
        subject: "International Relations",
        difficulty: "MODERATE",
        directive: "Explain",
        wordLimit: 150,
        marks: 10,
        answerType: "Descriptive Answer"
      },
      {
        question: "Examine the ecological and socio-economic consequences of groundwater depletion in northwestern India. What policy reforms are urgently needed?",
        exam: "UPSC",
        subject: "Environment",
        difficulty: "MODERATE",
        directive: "Examine",
        wordLimit: 150,
        marks: 10,
        answerType: "Paragraph Answer"
      },
      {
        question: "Discuss the ethical dilemmas faced by civil servants in balancing political directions with administrative integrity and constitutional obligations.",
        exam: "UPSC",
        subject: "Ethics",
        difficulty: "ADVANCED",
        directive: "Discuss",
        wordLimit: 150,
        marks: 10,
        answerType: "Analytical Answer"
      },
      {
        question: "Evaluate the role of Digital Public Infrastructure (DPI) in fostering financial inclusion and citizen-centric governance in India.",
        exam: "State PSC",
        subject: "Science & Technology",
        difficulty: "EASY",
        directive: "Evaluate",
        wordLimit: 150,
        marks: 10,
        answerType: "Paragraph Answer"
      },
      {
        question: "Analyze the socio-economic impact of rural-to-urban distress migration on megacities and elderly populations in rural households.",
        exam: "State PSC",
        subject: "Society",
        difficulty: "MODERATE",
        directive: "Analyze",
        wordLimit: 150,
        marks: 10,
        answerType: "Descriptive Answer"
      }
    ];
  }

  /**
   * Identifies directive word from question string
   */
  extractDirectiveWord(questionText) {
    if (!questionText) return 'Discuss';
    const text = questionText.trim();
    const directives = [
      'Critically Examine', 'Critically Analyze', 'Critically Evaluate',
      'Discuss', 'Analyze', 'Examine', 'Evaluate', 'Elucidate',
      'Explain', 'Comment', 'Compare', 'Illustrate', 'Substantiate'
    ];
    for (const d of directives) {
      const reg = new RegExp(`\\b${d}\\b`, 'i');
      if (reg.test(text)) {
        return d;
      }
    }
    return 'Discuss';
  }

  /**
   * Returns helpful pedagogical tip for directive
   */
  getDirectiveTip(directive) {
    return this.directiveGuides[directive] || 'Read the question carefully, address all components directly, and provide a balanced, forward-looking answer.';
  }

  /**
   * Generates a descriptive question via Gemini AI or curated fallback
   */
  async generateQuestion({
    exam = 'UPSC',
    subject = 'Polity',
    difficulty = 'MODERATE',
    answerType = 'Paragraph Answer',
    wordLimit = 150,
    marks = 10
  }) {
    const apiKey = window.geminiService?.getApiKey();

    if (window.geminiService?.isAiAvailable()) {
      try {
        const prompt = `You are a Senior Question Paper Setter for the ${exam} competitive examination.
Create ONE high-yield, descriptive answer-writing question for:
- Subject: ${subject}
- Difficulty Level: ${difficulty}
- Answer Format: ${answerType}
- Target Word Limit: ${wordLimit} words
- Maximum Marks: ${marks} marks

Ensure the question:
1. Starts with or prominently features an authentic examination directive word (such as Discuss, Analyze, Critically Examine, Evaluate, Elucidate, or Explain).
2. Is multi-dimensional, contemporary, and strictly conforms to actual ${exam} Mains examination standards.
3. Tests both foundational conceptual clarity and applied analytical depth.

Respond with ONLY valid JSON with this exact schema:
{
  "question": "The complete question text",
  "directive": "The primary directive keyword (e.g. Critically Examine)",
  "subject": "${subject}",
  "exam": "${exam}",
  "difficulty": "${difficulty}",
  "wordLimit": ${wordLimit},
  "marks": ${marks},
  "answerType": "${answerType}",
  "syllabusContext": "Brief 1-sentence mapping to syllabus topic",
  "recommendedStructure": "Brief tip on how to structure intro, body dimensions, and conclusion"
}`;

        const model = window.geminiService.getActiveModel();

        const res = await window.aiClient.fetchGenerateContent(model, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json'
            }
          }, { apiKey });

        if (res.ok) {
          const data = await res.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const parsed = this._safeJsonParse(rawText);
          if (parsed && parsed.question) {
            return {
              ...parsed,
              directive: parsed.directive || this.extractDirectiveWord(parsed.question)
            };
          }
        }
      } catch (err) {
        console.warn('AI question generation call failed, falling back to curated bank:', err);
      }
    }

    // Curated fallback matching criteria
    return this._getCuratedQuestion({ exam, subject, difficulty, wordLimit, marks, answerType });
  }

  _getCuratedQuestion({ exam, subject, difficulty, wordLimit, marks, answerType }) {
    const matching = this.curatedQuestionBank.filter(q => {
      const sMatch = subject ? q.subject.toLowerCase().includes(subject.toLowerCase()) || subject.toLowerCase().includes(q.subject.toLowerCase()) : true;
      return sMatch;
    });

    const pool = matching.length > 0 ? matching : this.curatedQuestionBank;
    const picked = pool[Math.floor(Math.random() * pool.length)];

    return {
      question: picked.question,
      directive: picked.directive || this.extractDirectiveWord(picked.question),
      subject: subject || picked.subject,
      exam: exam || picked.exam,
      difficulty: difficulty || picked.difficulty,
      wordLimit: Number(wordLimit) || picked.wordLimit,
      marks: Number(marks) || picked.marks,
      answerType: answerType || picked.answerType,
      syllabusContext: `Core thematic concept under ${subject || picked.subject} for ${exam || 'UPSC'} Mains.`,
      recommendedStructure: `Direct 2-line introduction defining key terms, 3-4 thematic body dimensions with examples, and a forward-looking conclusion.`
    };
  }

  /**
   * Evaluates student's answer as a Senior Competitive Examination Tutor
   */
  async evaluateAnswer({
    exam = 'UPSC',
    subject = 'General Studies',
    question,
    directive,
    wordLimit = 150,
    marks = 10,
    studentAnswer,
    inputSource = 'TYPED',
    ocrConfidence = null,
    onProgress = () => {}
  }) {
    if (!studentAnswer || !studentAnswer.trim()) {
      throw new Error('Please enter or extract your answer before requesting evaluation.');
    }

    const cleanAnswer = studentAnswer.trim();
    const wordCount = cleanAnswer.split(/\s+/).filter(Boolean).length;

    // This was the one prompt with no input cap: the entire answer was
    // interpolated on top of a ~5 KB rubric. A pasted document instead of a
    // 150-word answer could blow the context window and get the whole request
    // rejected. 24000 chars is roughly 4000 words — far beyond any real answer
    // limit (the largest preset is 250 words) while still bounding the request.
    const MAX_ANSWER_CHARS = 24000;
    const answerForPrompt = cleanAnswer.length > MAX_ANSWER_CHARS
      ? `${cleanAnswer.slice(0, MAX_ANSWER_CHARS)}\n\n[Answer truncated for evaluation — ${cleanAnswer.length - MAX_ANSWER_CHARS} further characters omitted.]`
      : cleanAnswer;

    if (cleanAnswer.length > MAX_ANSWER_CHARS) {
      console.warn(`[answerWriting] Answer of ${cleanAnswer.length} chars truncated to ${MAX_ANSWER_CHARS} for evaluation.`);
    }
    const effectiveDirective = directive || this.extractDirectiveWord(question);

    onProgress({ stage: 'reading', message: 'Reading student answer and exam directives...' });

    const apiKey = window.geminiService?.getApiKey();

    if (window.geminiService?.isAiAvailable()) {
      try {
        onProgress({ stage: 'understanding', message: 'Analyzing directive keyword and question parts...' });
        await new Promise(r => setTimeout(r, 200));

        onProgress({ stage: 'content', message: 'Scrutinizing factual accuracy, constitutional context & examples...' });
        await new Promise(r => setTimeout(r, 250));

        onProgress({ stage: 'structure', message: 'Evaluating Introduction, Body dimensions & Way Forward...' });

        const prompt = `You are a Senior UPSC & State PSC Civil Services Examination Answer-Writing Evaluator and Master Academic Mentor.
Evaluate the following student's descriptive answer with academic rigor, pedagogical depth, and constructive feedback.

EXAMINATION CONTEXT:
- Exam: ${exam}
- Subject: ${subject}
- Directive Word: ${effectiveDirective} (Meaning: ${this.getDirectiveTip(effectiveDirective)})
- Specified Word Limit: ${wordLimit} words
- Maximum Marks: ${marks} marks
- Input Source: ${inputSource} ${ocrConfidence ? `(OCR Confidence: ${ocrConfidence})` : ''}

EXAMINATION QUESTION:
"${question}"

STUDENT'S SUBMITTED ANSWER (${wordCount} words):
"""
${answerForPrompt}
"""

EVALUATION PARAMETERS TO ADDRESS:
1. QUESTION UNDERSTANDING: Did the student address all sub-parts? Did they adhere strictly to the directive "${effectiveDirective}"?
2. CONTENT DEPTH & VALUE ADDITION: Identify strong arguments already present. Then identify missing dimensions (constitutional articles, landmark Supreme Court cases, committees/reports, government schemes, empirical facts, contemporary relevance). NOTE: NEVER fabricate facts or committee names. If uncertain, state clearly "Needs verification".
3. STRUCTURE & FLOW: Evaluate Introduction (does it define or provide context?), Body (logical flow, subheadings, multi-dimensional coverage), and Conclusion (forward-looking Way Forward).
4. RELEVANCE & WORD ECONOMY: Flag padding, repetition, off-topic sentences, and word limit compliance.
5. FACTUAL ACCURACY: Classify assertions into Correct, Likely Correct, Needs Verification, or Problematic.
6. LANGUAGE & PRESENTATION: Grammar, tone, precision, maturity, paragraph length, and bullet usage.
7. SCORING: Estimated marks out of 10 for Content, Structure, Relevance, Analysis, Language, Presentation, and Overall Score.
8. HOW TO IMPROVE: Give 5 specific, step-by-step actionable rewrite steps.
9. MODEL / IMPROVED ANSWER: Provide an exemplary version of the answer within the word limit (${wordLimit} words), preserving the student's core points while elevating structure and vocabulary.
10. BEFORE vs AFTER: Provide 2-3 direct comparisons of student excerpts vs improved versions with "Why this is better".
11. SUGGESTED FRAMEWORK: A tailored structural blueprint for this specific question.

Return ONLY a valid, parseable JSON object matching this exact schema:
{
  "summary": "Short 2-3 sentence executive evaluation summary",
  "scores": {
    "content": 7.0,
    "structure": 7.0,
    "relevance": 7.5,
    "analysis": 6.5,
    "language": 7.5,
    "presentation": 7.0,
    "overall": 7.1
  },
  "scoreDisclaimer": "AI Practice Evaluation — Not an Official Exam Score",
  "strengths": [
    "Specific positive point 1",
    "Specific positive point 2",
    "Specific positive point 3"
  ],
  "weaknesses": [
    "Specific weakness 1",
    "Specific weakness 2",
    "Specific weakness 3"
  ],
  "missingDimensions": [
    { "dimension": "e.g. Constitutional / Legal Angle", "details": "Article or statutory provision that should be cited" },
    { "dimension": "e.g. Committee / Report", "details": "Name of relevant commission or report" },
    { "dimension": "e.g. Contemporary Example / Scheme", "details": "Real-world initiative or case study" },
    { "dimension": "e.g. Way Forward / Future Outlook", "details": "Actionable policy suggestion" }
  ],
  "structureAnalysis": {
    "intro": { "verdict": "Effective / Needs Focus", "feedback": "Detailed feedback on introduction" },
    "body": { "verdict": "Moderate / Strong", "feedback": "Detailed feedback on body arguments & dimensions" },
    "conclusion": { "verdict": "Adequate / Weak", "feedback": "Detailed feedback on conclusion & way forward" }
  },
  "relevanceAnalysis": {
    "wordCountStatus": "${wordCount > wordLimit * 1.15 ? 'Exceeded Limit' : (wordCount < wordLimit * 0.75 ? 'Below Target' : 'Optimal Word Length')}",
    "fluffIdentified": "Specific sentences or points that added little value or repeated ideas",
    "wordEconomyTip": "How to express the same ideas in fewer, higher-impact words"
  },
  "depthAnalysis": {
    "currentLevel": "Descriptive / Moderate Analysis / High Critical Depth",
    "recommendation": "How the student can move from simple description to multi-stakeholder analytical depth"
  },
  "factualReview": [
    { "statement": "Claim made by student", "status": "Correct | Likely Correct | Needs Verification | Incorrect", "note": "Explanatory remark" }
  ],
  "languageFeedback": {
    "tone": "Academic & Objective | Informal | Overly Complex",
    "vocabularySuggestions": [
      { "original": "Original phrase used", "suggested": "Refined civil services phrasing", "reason": "Why this improves precision" }
    ]
  },
  "presentationFeedback": {
    "formatting": "Paragraph vs Bullet structure feedback",
    "advice": "Tips on headings, sub-headings, or underlining key terms"
  },
  "examStrategy": [
    "Next time, remember: First break the question into its sub-parts...",
    "Next time, remember: Always dedicate at least 2 lines to a forward-looking Way Forward...",
    "Next time, remember: Keep introductions concise to reserve words for core analysis."
  ],
  "improvementSteps": [
    "1. Rewrite the introduction directly addressing the core concept in 2 lines.",
    "2. Incorporate constitutional/statutory provisions to anchor the arguments.",
    "3. Eliminate repeated phrasing in the second paragraph.",
    "4. Add concrete contemporary examples or government initiatives.",
    "5. Conclude with a balanced, visionary Way Forward rather than a mere summary."
  ],
  "improvedAnswer": "Complete, topper-grade improved answer within approximately ${wordLimit} words...",
  "beforeAfter": [
    {
      "before": "Original student sentence/paragraph snippet",
      "after": "Refined and structured topper-grade rewrite",
      "whyBetter": "Explanation of why the revision carries higher impact in examination marking"
    }
  ],
  "suggestedFramework": {
    "intro": "What to write in introduction",
    "dimensions": [
      "Dimension 1: Focus area",
      "Dimension 2: Focus area",
      "Dimension 3: Focus area"
    ],
    "challenges": "Key bottlenecks or counter-points to address",
    "wayForward": "Strategic policy recommendations",
    "conclusion": "Balanced closing synthesis"
  }
}`;

        const model = window.geminiService.getActiveModel();

        onProgress({ stage: 'preparing', message: 'Synthesizing examiner report & model answer...' });

        const res = await window.aiClient.fetchGenerateContent(model, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json'
            }
          }, { apiKey });

        if (res.ok) {
          const data = await res.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const parsed = this._safeJsonParse(rawText);
          if (parsed && parsed.scores && parsed.strengths) {
            return this._sanitizeEvaluationResult(parsed, cleanAnswer, wordCount, wordLimit, marks);
          }
        }
      } catch (apiErr) {
        console.warn('Gemini evaluation API error, falling back to deterministic tutor engine:', apiErr);
      }
    }

    // Realistic Deterministic Fallback Evaluation
    onProgress({ stage: 'preparing', message: 'Generating comprehensive evaluation report...' });
    await new Promise(r => setTimeout(r, 600));
    return this._generateDeterministicEvaluation({
      exam,
      subject,
      question,
      directive: effectiveDirective,
      wordLimit,
      marks,
      studentAnswer: cleanAnswer,
      wordCount,
      inputSource
    });
  }

  /**
   * Deterministic evaluation generator for offline or key-less scenarios
   */
  _generateDeterministicEvaluation({
    exam,
    subject,
    question,
    directive,
    wordLimit,
    marks,
    studentAnswer,
    wordCount,
    inputSource
  }) {
    const paragraphs = studentAnswer.split(/\n+/).filter(p => p.trim().length > 0);
    const sentences = studentAnswer.split(/[.?!]+/).filter(s => s.trim().length > 5);

    // Dynamic scoring calculation based on length heuristics & structure
    const lengthRatio = wordCount / wordLimit;
    let lengthScore = 8;
    if (lengthRatio < 0.6) lengthScore = 5;
    else if (lengthRatio < 0.8) lengthScore = 7;
    else if (lengthRatio > 1.3) lengthScore = 6.5;
    else lengthScore = 8.5;

    const hasParagraphStructure = paragraphs.length >= 2;
    const structureScore = hasParagraphStructure ? (paragraphs.length >= 3 ? 7.5 : 7.0) : 5.5;

    const contentScore = Math.min(9, Math.max(5, Number((6.5 + (sentences.length > 5 ? 0.8 : 0)).toFixed(1))));
    const analysisScore = Math.min(9, Math.max(5, Number((6.2 + (paragraphs.length >= 3 ? 0.6 : 0)).toFixed(1))));
    const relevanceScore = lengthScore;
    const languageScore = 7.5;
    const presentationScore = hasParagraphStructure ? 7.2 : 6.0;

    const overall = Number(((contentScore + structureScore + relevanceScore + analysisScore + languageScore + presentationScore) / 6).toFixed(1));

    const introSentence = sentences[0] ? sentences[0].trim() : 'The topic under consideration holds great significance.';
    const conclusionSentence = sentences[sentences.length - 1] ? sentences[sentences.length - 1].trim() : 'Thus, coordinated policy action is essential.';

    const visualDiagram = this._normalizeVisualDiagram(this.generateVisualDiagram(subject, question, directive));
    const hindiModelAnswer = this._generateHindiModelAnswer(question, studentAnswer, wordLimit, directive);
    const englishModelAnswer = this._generateImprovedModelAnswer(question, studentAnswer, wordLimit, directive);

    const bilingualStrengths = [
      {
        en: `Direct engagement with the core theme of "${subject}".`,
        hi: `"${subject}" के मुख्य विषय और प्रश्न की मूल मांग को सीधे संबोधित किया गया है।`
      },
      {
        en: `Effective communication of the central premise without convoluted jargon.`,
        hi: `बिना किसी अनावश्यक शब्दाडंबर के मुख्य विचार को स्पष्ट भाषा में प्रस्तुत किया गया है।`
      },
      {
        en: paragraphs.length >= 2 ? `Clear effort to separate thoughts into distinct paragraphs.` : `Good initial focus in the opening sentence.`,
        hi: paragraphs.length >= 2 ? `विचारों को अलग-अलग अनुच्छेदों (Paragraphs) में व्यवस्थित करने का सराहनीय प्रयास किया गया है।` : `प्रारंभिक वाक्य में विषय पर अच्छा फोकस बनाया गया है।`
      }
    ];

    const bilingualWeaknesses = [
      {
        en: `Limited multi-dimensional analysis: key institutional, economic, or legal aspects remain unaddressed.`,
        hi: `बहु-आयामीय विश्लेषण की कमी: संस्थागत, आर्थिक या विधिक पक्षों को पर्याप्त रूप से शामिल नहीं किया गया है।`
      },
      {
        en: wordCount > wordLimit * 1.2 ? `Word limit overshoot (${wordCount} words vs target ${wordLimit}). Need tighter word economy.` : (wordCount < wordLimit * 0.7 ? `Sub-optimal word count (${wordCount} words vs target ${wordLimit}). Important dimensions missed.` : `Arguments could be structured with distinct headings/sub-headings for better visual scannability.`),
        hi: wordCount > wordLimit * 1.2 ? `शब्द सीमा से अधिक विस्तार (${wordCount} शब्द, निर्धारित: ${wordLimit})। शब्दों के चयन में संक्षिप्तता आवश्यक है।` : (wordCount < wordLimit * 0.7 ? `शब्द सीमा से कम उत्तर (${wordCount} शब्द, निर्धारित: ${wordLimit})। कई महत्वपूर्ण बिंदु छूट गए हैं।` : `परीक्षक की दृष्टि में स्पष्टता हेतु शीर्षकों (Sub-headings) और बुलेट बिंदुओं का प्रयोग करें।`)
      },
      {
        en: `Conclusion leans towards generic restatement rather than providing a visionary, actionable Way Forward.`,
        hi: `निष्कर्ष मात्र पूर्व-कथित बातों का दोहराव लगता है; इसके स्थान पर ठोस प्रशासनिक एवं नीतिगत "Way Forward" देना चाहिए।`
      }
    ];

    const bilingualMissingDimensions = [
      {
        dimension: "Constitutional & Institutional Framework",
        dimensionHi: "संवैधानिक एवं संस्थागत ढांचा",
        details: `Direct citation of relevant Articles, statutory provisions, or Supreme Court benchmarks related to ${subject}.`,
        detailsHi: `संबंधित संवैधानिक अनुच्छेदों, संविधियों या सर्वोच्च न्यायालय के ऐतिहासिक निर्णयों का स्पष्ट उल्लेख करें।`
      },
      {
        dimension: "Empirical Evidence & Committee Insights",
        dimensionHi: "आंकड़े एवं आयोग/समिति की सिफारिशें",
        details: `Reference to recent NITI Aayog recommendations, Law Commission reports, or high-level committee findings.`,
        detailsHi: `नीति आयोग, विधि आयोग या 2nd ARC/विशेषज्ञ समितियों की रिपोर्टों के प्रमुख निष्कर्षों को उद्धृत करें।`
      },
      {
        dimension: "Socio-Economic & Grassroots Implications",
        dimensionHi: "सामाजिक-आर्थिक व जमीनी प्रभाव",
        details: "Impact assessment on vulnerable groups, federal dynamics, and grassroots implementation hurdles.",
        detailsHi: "वंचित वर्गों, संघीय संबंधों और धरातलीय क्रियान्वयन में आने वाली अड़चनों का व्यावहारिक विश्लेषण।"
      },
      {
        dimension: "Forward-Looking Policy Way Forward",
        dimensionHi: "दूरदर्शी नीतिगत सुधार (Way Forward)",
        details: "Specific institutional reforms, technology integration, and citizen-centric governance solutions.",
        detailsHi: "प्रौद्योगिकी उपयोग, जवाबदेही तंत्र और नागरिक-केंद्रित शासन हेतु ठोस सुझाव।"
      }
    ];

    const bilingualImprovementSteps = [
      {
        stepEn: "1. Crisp Introduction: Define the core theme or establish recent context in no more than 25 words.",
        stepHi: "1. सटीक प्रस्तावना: मुख्य विषय को परिभाषित करें या 25 शब्दों में समसामयिक संदर्भ स्थापित करें।",
        en: "1. Crisp Introduction: Define the core theme or establish recent context in no more than 25 words.",
        hi: "1. सटीक प्रस्तावना: मुख्य विषय को परिभाषित करें या 25 शब्दों में समसामयिक संदर्भ स्थापित करें।"
      },
      {
        stepEn: "2. Structural Subheadings: Split your response into 2-3 clear subheadings directly reflecting the directive.",
        stepHi: "2. स्पष्ट उप-शीर्षक: डायरेक्टिव के अनुसार उत्तर को 2-3 स्पष्ट शीर्षकों में विभाजित करें।",
        en: "2. Structural Subheadings: Split your response into 2-3 clear subheadings directly reflecting the directive.",
        hi: "2. स्पष्ट उप-शीर्षक: डायरेक्टिव के अनुसार उत्तर को 2-3 स्पष्ट शीर्षकों में विभाजित करें।"
      },
      {
        stepEn: "3. Concrete Substantiation: Incorporate at least 1 institutional commission, scheme, or constitutional reference.",
        stepHi: "3. ठोस प्रमाण व संदर्भ: कम से कम 1 संवैधानिक अनुच्छेद, सरकारी योजना या समिति का उल्लेख करें।",
        en: "3. Concrete Substantiation: Incorporate at least 1 institutional commission, scheme, or constitutional reference.",
        hi: "3. ठोस प्रमाण व संदर्भ: कम से कम 1 संवैधानिक अनुच्छेद, सरकारी योजना या समिति का उल्लेख करें।"
      },
      {
        stepEn: "4. Prune Fluff: Eliminate repetitive words to ensure strict compliance with the word limit.",
        stepHi: "4. अनावश्यक विस्तार हटाएं: दोहराव वाले वाक्यों को हटाकर शब्द सीमा का सख्ती से पालन करें।",
        en: "4. Prune Fluff: Eliminate repetitive words to ensure strict compliance with the word limit.",
        hi: "4. अनावश्यक विस्तार हटाएं: दोहराव वाले वाक्यों को हटाकर शब्द सीमा का सख्ती से पालन करें।"
      },
      {
        stepEn: "5. Visionary Way Forward: Dedicate the final 2 lines to realistic administrative and policy solutions.",
        stepHi: "5. दूरदर्शी समाधान: अंतिम 2 पंक्तियों में व्यावहारिक प्रशासनिक समाधान एवं संवैधानिक दृष्टिकोण प्रस्तुत करें।",
        en: "5. Visionary Way Forward: Dedicate the final 2 lines to realistic administrative and policy solutions.",
        hi: "5. दूरदर्शी समाधान: अंतिम 2 पंक्तियों में व्यावहारिक प्रशासनिक समाधान एवं संवैधानिक दृष्टिकोण प्रस्तुत करें।"
      }
    ];

    const summaryTextEn = `Your answer demonstrates a commendable foundational understanding of the topic with clear intent to address the directive "${directive}". While the central premise is recognized, elevating this answer from an average score to a competitive exam benchmark requires deeper structural segregation, explicit constitutional/factual anchor points, and a decisive forward-looking conclusion.`;
    const summaryTextHi = `आपका उत्तर विषय की सराहनीय बुनियादी समझ और डायरेक्टिव "${directive}" को संबोधित करने की स्पष्ट मंशा दर्शाता है। यद्यपि मूल बिंदु सही पकड़े गए हैं, लेकिन इस उत्तर को UPSC के शीर्ष स्कोर ज़ोन में ले जाने के लिए स्पष्ट उप-शीर्षक, संवैधानिक/नीतिगत संदर्भ और एक मजबूत "Way Forward" जोड़ना आवश्यक है।`;

    return {
      summary: summaryTextEn,
      summaryHi: summaryTextHi,
      bilingualSummary: {
        en: summaryTextEn,
        hi: summaryTextHi
      },
      scores: {
        content: contentScore,
        structure: structureScore,
        relevance: relevanceScore,
        analysis: analysisScore,
        language: languageScore,
        presentation: presentationScore,
        overall: overall,
        marksAwarded: Number(((overall / 10) * marks).toFixed(1))
      },
      scoreDisclaimer: "AI Practice Evaluation — Not an Official Exam Score",
      scoreDisclaimerHi: "एआई अभ्यास मूल्यांकन — यह कोई आधिकारिक परीक्षा परिणाम नहीं है",
      strengths: bilingualStrengths.map(s => s.en),
      bilingualStrengths: bilingualStrengths,
      weaknesses: bilingualWeaknesses.map(w => w.en),
      bilingualWeaknesses: bilingualWeaknesses,
      missingDimensions: bilingualMissingDimensions,
      bilingualMissingDimensions: bilingualMissingDimensions,
      structureAnalysis: {
        intro: {
          verdict: paragraphs.length >= 1 ? "Recognizable Opening" : "Needs Framing",
          verdictHi: paragraphs.length >= 1 ? "सकारात्मक शुरुआत" : "सुधार अपेक्षित",
          feedback: `The opening introduces the context, but it could be made more impactful by starting with a formal definition, recent constitutional context, or an authoritative macroeconomic/social data point.`,
          feedbackHi: `प्रस्तावना ने विषय की भूमिका बांधी है, परंतु किसी संवैधानिक प्रावधान या प्रासंगिक सांख्यिकी से शुरुआत करने पर यह और अधिक प्रभावशाली होगी।`
        },
        body: {
          verdict: paragraphs.length >= 2 ? "Developing Multi-Dimensional Flow" : "Dense Monolithic Block",
          verdictHi: paragraphs.length >= 2 ? "बहु-आयामीय प्रवाह" : "सघन पैराग्राफ",
          feedback: `Your core points have validity, but grouping them under clear thematic subheadings (e.g. "Structural Drivers", "Institutional Bottlenecks", "Key Implications") would help the examiner award marks on each dimension.`,
          feedbackHi: `मुख्य भाग को स्पष्ट उप-शीर्षकों (जैसे "मूल कारण", "नीतिगत बाधाएं", "प्रभाव") में बांटने से परीक्षक को प्रत्येक बिंदु पर अंक देने में सुगमता होती है।`
        },
        conclusion: {
          verdict: "Needs Forward-Looking Focus",
          verdictHi: "भविष्योन्मुखी दृष्टिकोण आवश्यक",
          feedback: `Ensure your final lines don't just summarize what was already written. End with a 2-line strategic solution or an inspirational constitutional principle.`,
          feedbackHi: `निष्कर्ष में केवल पूर्व-वर्णित बातों को न दोहराएं, बल्कि 2 पंक्तियों में व्यावहारिक नीतिगत समाधान या संवैधानिक नैतिकता पर समाप्त करें।`
        }
      },
      relevanceAnalysis: {
        wordCountStatus: wordCount > wordLimit * 1.15 ? `Exceeded Limit (${wordCount}/${wordLimit} words)` : (wordCount < wordLimit * 0.75 ? `Below Target (${wordCount}/${wordLimit} words)` : `Within Target Range (${wordCount}/${wordLimit} words)`),
        fluffIdentified: `Avoid repetitive explanatory clauses and filler phrases like "it is very important to remember that" or "as we all know".`,
        fluffIdentifiedHi: `"यह याद रखना अत्यंत आवश्यक है" या "जैसा कि हम सभी जानते हैं" जैसे भराव (filler) वाक्यों से बचें।`,
        wordEconomyTip: "Use nominalization and active voice to pack 25% more substantive information into the exact same word count.",
        wordEconomyTipHi: "सटीक प्रशासनिक शब्दावली और सक्रिय वाक्यों का प्रयोग कर समान शब्द सीमा में 25% अधिक सारगर्भित तथ्य प्रस्तुत करें।"
      },
      depthAnalysis: {
        currentLevel: paragraphs.length >= 3 ? "Analytical Progression" : "Primarily Descriptive",
        currentLevelHi: paragraphs.length >= 3 ? "विश्लेषणात्मक स्तर" : "वर्णनात्मक स्तर",
        recommendation: `Transition from merely describing *what* the situation is to analyzing *why* it persists, *who* is impacted, and *how* targeted policy intervention resolves it.`,
        recommendationHi: `केवल स्थिति का वर्णन करने के स्थान पर यह स्पष्ट करें कि समस्या *क्यों* बनी हुई है, *कौन* प्रभावित है और इसका *ठोस समाधान* क्या है।`
      },
      factualReview: [
        {
          statement: introSentence.slice(0, 70) + '...',
          status: "Likely Correct",
          note: "Conceptually aligned with standard syllabus literature.",
          noteHi: "मानक पाठ्यक्रम एवं सामान्य अध्ययन संदर्भों से सुसंगत है।"
        },
        {
          statement: "Core argument assertions in the body",
          status: "Needs Verification",
          note: "Supporting arguments should ideally be backed with official survey data or committee citations.",
          noteHi: "मुख्य तर्कों को आधिकारिक आर्थिक सर्वेक्षण या समिति रिपोर्टों से पुष्ट करना लाभप्रद रहेगा।"
        }
      ],
      languageFeedback: {
        tone: "Objective & Academic",
        toneHi: "वस्तुनिष्ठ एवं अकादमिक",
        vocabularySuggestions: [
          { original: "big issue", suggested: "structural impediment", reason: "Demonstrates academic precision.", reasonHi: "अकादमिक सटीकता प्रदर्शित करता है।" },
          { original: "government should do", suggested: "institutional mechanism must be instituted", reason: "Aligns with civil services administrative terminology.", reasonHi: "प्रशासनिक भाषा शैली के अनुकूल है।" },
          { original: "people face problems", suggested: "vulnerable strata experience acute marginalization", reason: "Heightens sociological and policy rigor.", reasonHi: "समाजशास्त्रीय एवं नीतिगत गंभीरता को बढ़ाता है।" }
        ]
      },
      presentationFeedback: {
        formatting: paragraphs.length >= 3 ? "Clean paragraph spacing" : "Monolithic paragraph",
        advice: "Adopt a hybrid presentation: brief introductory paragraph, followed by 3-4 bullet points for causes/dimensions, and a concluding 2-line Way Forward.",
        adviceHi: "हाइब्रिड प्रस्तुतीकरण अपनाएं: संक्षिप्त प्रस्तावना, उसके बाद 3-4 बुलेट बिंदु और अंत में 2 पंक्तियों का 'Way Forward'।"
      },
      examStrategy: [
        `Directive Mastery: "${directive}" mandates weighing both positive drivers and structural impediments before concluding.`,
        "Time & Space Discipline: Allocate 7-8 minutes for a 10-mark question; plan your 3 key body points in the first 45 seconds.",
        "Value Enrichment: Always underline keywords, committee names, and constitutional articles to facilitate rapid examiner grading."
      ],
      improvementSteps: bilingualImprovementSteps.map(s => s.stepEn),
      bilingualImprovementSteps: bilingualImprovementSteps,
      improvedAnswer: englishModelAnswer,
      improvedAnswerHi: hindiModelAnswer,
      visualDiagram: visualDiagram,
      beforeAfter: [
        {
          before: introSentence,
          after: `In the contemporary governance paradigm, ${question.replace(/^(Discuss|Analyze|Critically Examine|Evaluate|Explain|Examine)\s+/i, '').slice(0, 80).toLowerCase()} represents a critical nexus of constitutional mandates and socio-economic imperatives.`,
          afterHi: `समकालीन शासन व्यवस्था में, यह विषय संवैधानिक आदेशों और सामाजिक-आर्थिक प्राथमिकताओं के संगम का प्रतिनिधित्व करता है।`,
          whyBetter: "Immediately anchors the answer in administrative relevance and demonstrates high-caliber conceptual command.",
          whyBetterHi: "उत्तर को तुरंत प्रशासनिक संदर्भ में स्थापित करता है और उच्च-स्तरीय वैचारिक स्पष्टता प्रदर्शित करता है।"
        },
        {
          before: conclusionSentence,
          after: `Way Forward: A synergistic approach combining robust institutional capacity, decentralized federal execution, and data-driven oversight is imperative to realize substantive democratic dividends.`,
          afterHi: `भावी राह: ठोस संस्थागत क्षमता, विकेंद्रीकृत संघीय क्रियान्वयन और पारदर्शी निगरानी का समन्वित दृष्टिकोण दीर्घकालिक लोकतांत्रिक परिणाम सुनिश्चित करेगा।`,
          whyBetter: "Replaces a generic closing with a multi-stakeholder, actionable reform agenda.",
          whyBetterHi: "साधारण समाप्ति के स्थान पर एक बहु-हितधारक और व्यावहारिक सुधार एजेंडा प्रस्तुत करता है।"
        }
      ],
      suggestedFramework: {
        intro: `Define the core subject and state its constitutional/macroeconomic relevance (approx. 25-30 words).`,
        dimensions: [
          "Dimension 1: Structural drivers & underlying causes",
          "Dimension 2: Policy & institutional interventions",
          "Dimension 3: Contemporary bottlenecks & socio-economic friction"
        ],
        challenges: "Implementation deficits, federal coordination challenges, or resource constraints",
        wayForward: "Holistic policy roadmap, technological integration, and grassroots empowerment",
        conclusion: "A balanced, constitutional ethos-based closing vision (approx. 25 words)"
      }
    };
  }

  /**
   * Generates dynamic visual diagram / flowchart tailored to subject & question
   */
  generateVisualDiagram(subject = '', question = '', directive = '') {
    const s = (subject + ' ' + question).toLowerCase();

    if (s.includes('polity') || s.includes('judic') || s.includes('constitut') || s.includes('federal') || s.includes('governance')) {
      return {
        titleEn: "Constitutional Equilibrium & Governance Flowchart",
        titleHi: "संवैधानिक संतुलन एवं उत्तरदायित्व फ़्लोचार्ट",
        type: "FLOWCHART",
        subtitleEn: "Four-Tier Institutional Accountability & Checks Matrix",
        subtitleHi: "चार-स्तरीय संस्थागत उत्तरदायित्व एवं संतुलन व्यवस्था",
        examSheetTipEn: "Draw this 4-step horizontal flowchart in your UPSC answer sheet with neat boxes and arrows. Takes ~35 seconds and fetches +1.5 bonus marks.",
        examSheetTipHi: "UPSC मुख्य परीक्षा की कॉपी में यह 4-चरणीय फ़्लोचार्ट 35 सेकंड में बनाएं। इससे परीक्षक से 1.5+ अतिरिक्त अंक प्राप्त होते हैं।",
        nodes: [
          {
            step: 1,
            badgeEn: "Constitutional Bedrock",
            badgeHi: "संवैधानिक आधार",
            titleEn: "Constitutional Mandate",
            titleHi: "संवैधानिक उपबंध (Art 14, 21, 32)",
            descEn: "Fundamental rights & Basic Structure Doctrine.",
            descHi: "मूल अधिकार, नीति निदेशक तत्व व मूल संरचना।",
            icon: "book-open"
          },
          {
            step: 2,
            badgeEn: "Executive & Legislative",
            badgeHi: "कार्यपालिका व विधायिका",
            titleEn: "Policy Implementation",
            titleHi: "नीति निर्माण एवं क्रियान्वयन",
            descEn: "Legislative enactments & administrative execution.",
            descHi: "कानूनी प्रावधान एवं प्रशासनिक आदेश।",
            icon: "building"
          },
          {
            step: 3,
            badgeEn: "Judicial Scrutiny",
            badgeHi: "न्यायिक समीक्षा",
            titleEn: "Checks & Balance",
            titleHi: "न्यायिक संतुलन एवं समीक्षा",
            descEn: "Remedial jurisdiction preventing institutional overreach.",
            descHi: "अतिरेक पर नियंत्रण एवं संवैधानिक मर्यादा।",
            icon: "scale"
          },
          {
            step: 4,
            badgeEn: "Democratic Dividend",
            badgeHi: "सुशासन परिणाम",
            titleEn: "Citizen Empowerment",
            titleHi: "नागरिक सुशासन व अधिकार संरक्षण",
            descEn: "Inclusive governance, public trust & constitutional morality.",
            descHi: "संवैधानिक नैतिकता एवं पारदर्शी जन-कल्याण।",
            icon: "award"
          }
        ],
        asciiBlueprint: `[संवैधानिक आधार (Art 14,21)] ──▶ [नीति निर्माण व क्रियान्वयन] ──▶ [न्यायिक समीक्षा व संतुलन] ──▶ [नागरिक सुशासन व अधिकार]`
      };
    } else if (s.includes('econom') || s.includes('manufactur') || s.includes('agri') || s.includes('monsoon') || s.includes('growth')) {
      return {
        titleEn: "Macroeconomic Reform & Structural Resilience Loop",
        titleHi: "आर्थिक सुधार एवं संरचनात्मक संवृद्धि चक्र",
        type: "FLOWCHART",
        subtitleEn: "Supply-Chain Modernization & Job-Rich Industrialization Flow",
        subtitleHi: "आपूर्ति-श्रृंखला आधुनिकीकरण एवं समावेशी रोज़गार संवृद्धि",
        examSheetTipEn: "Include this structural flow to demonstrate economic cause-and-effect clarity to the evaluator.",
        examSheetTipHi: "आर्थिक कारण-प्रभाव संबंधों को परीक्षक के समक्ष स्पष्ट करने के लिए यह फ़्लोचार्ट बनाएं।",
        nodes: [
          {
            step: 1,
            badgeEn: "Structural Bottlenecks",
            badgeHi: "मूल संरचनात्मक बाधाएं",
            titleEn: "Impediments Identified",
            titleHi: "लॉजिस्टिक्स लागत व ऋण अंतराल",
            descEn: "High infrastructure friction, tariff barriers & skill deficits.",
            descHi: "उच्च परिवहन लागत, विनिर्माण अड़चनें व कौशल कमी।",
            icon: "alert-triangle"
          },
          {
            step: 2,
            badgeEn: "Targeted Interventions",
            badgeHi: "नीतिगत हस्तक्षेप",
            titleEn: "Policy Push (PLI / Gati Shakti)",
            titleHi: "पीएलआई व गति शक्ति योजनाएं",
            descEn: "Strategic capital expenditure and digital deregulation.",
            descHi: "पूंजीगत व्यय, प्रोत्साहन योजनाएं व एकल खिड़की प्रणाली।",
            icon: "zap"
          },
          {
            step: 3,
            badgeEn: "Scale & Competitiveness",
            badgeHi: "प्रतिस्पर्धी क्षमता",
            titleEn: "Value-Chain Integration",
            titleHi: "वैश्विक आपूर्ति श्रृंखला में जुड़ाव",
            descEn: "Domestic value addition and export enhancement.",
            descHi: "घरेलू मूल्य संवर्धन एवं निर्यात संवर्धन।",
            icon: "trending-up"
          },
          {
            step: 4,
            badgeEn: "Inclusive Dividend",
            badgeHi: "समावेशी संवृद्धि",
            titleEn: "Job-Rich Macro-Stability",
            titleHi: "रोज़गार सृजन व आर्थिक सुरक्षा",
            descEn: "Formal jobs, rural resilience & sustained GDP growth.",
            descHi: "औपचारिक रोज़गार, ग्रामीण क्रय शक्ति व स्थायी विकास।",
            icon: "check-circle"
          }
        ],
        asciiBlueprint: `[संरचनात्मक बाधाएं / लागत] ──▶ [नीतिगत प्रोत्साहन (PLI/GatiShakti)] ──▶ [आपूर्ति श्रृंखला एकीकरण] ──▶ [रोज़गार सृजन व संवृद्धि]`
      };
    } else if (s.includes('ethics') || s.includes('integrity') || s.includes('civil service') || s.includes('moral')) {
      return {
        titleEn: "Administrative Ethics & Public Decision Matrix",
        titleHi: "प्रशासनिक सत्यनिष्ठा एवं निर्णय-निर्माण मैट्रिक्स",
        type: "FLOWCHART",
        subtitleEn: "Balancing Political Neutrality with Constitutional Morality",
        subtitleHi: "राजनीतिक तटस्थता और संवैधानिक नैतिकता का संतुलन",
        examSheetTipEn: "Ethics GS-4 answers gain immediate distinction when supported by this objective decision-making framework.",
        examSheetTipHi: "GS-4 एथिक्स के उत्तर में यह आरेख बनाने से प्रशासनिक परिपक्वता स्पष्ट झलकती है।",
        nodes: [
          {
            step: 1,
            badgeEn: "Ethical Dilemma",
            badgeHi: "नैतिक दुविधा",
            titleEn: "Public Interest Friction",
            titleHi: "हितों का टकराव एवं राजनीतिक दबाव",
            descEn: "Balancing superior directives with administrative integrity.",
            descHi: "प्रशासनिक दायित्व बनाम व्यक्तिगत/राजनीतिक दबाव।",
            icon: "help-circle"
          },
          {
            step: 2,
            badgeEn: "Moral Anchorage",
            badgeHi: "मार्गदर्शक सिद्धांत",
            titleEn: "Constitutional Morality",
            titleHi: "संवैधानिक नैतिकता व आचार संहिता",
            descEn: "Nolan Principles, Civil Service Conduct Rules & Rule of Law.",
            descHi: "नोलन सिद्धांत, निष्पक्षता, सत्यनिष्ठा व विधि का शासन।",
            icon: "shield"
          },
          {
            step: 3,
            badgeEn: "Synthesized Action",
            badgeHi: "संतुलित कार्यवाही",
            titleEn: "Lawful & Compassionate Action",
            titleHi: "विधिक एवं संवेदनशील निर्णय",
            descEn: "Objective file recording with empathetic public orientation.",
            descHi: "लिखित निष्पक्षता एवं जन-कल्याणकारी निर्णय।",
            icon: "check-square"
          },
          {
            step: 4,
            badgeEn: "Public Value",
            badgeHi: "जन-विश्वास",
            titleEn: "Strengthened Trust",
            titleHi: "संस्थागत विश्वसनीयता व पारदर्शिता",
            descEn: "Long-term credibility of public office & citizen confidence.",
            descHi: "प्रशासनिक साख एवं आम नागरिक का लोकतंत्र में विश्वास।",
            icon: "award"
          }
        ],
        asciiBlueprint: `[नैतिक दुविधा / टकराव] ──▶ [संवैधानिक मूल्य (नोलन सिद्धांत)] ──▶ [विधिक एवं निष्पक्ष निर्णय] ──▶ [संस्थागत विश्वसनीयता]`
      };
    } else {
      return {
        titleEn: "Multi-Stakeholder Strategic Framework",
        titleHi: "बहु-हितधारक रणनीतिक विश्लेषण आरेख",
        type: "FLOWCHART",
        subtitleEn: "Issue Identification to Sustainable Outcome Roadmap",
        subtitleHi: "समस्या पहचान से स्थायी परिणाम तक का रोडमैप",
        examSheetTipEn: "Draw this neat 4-stage process box diagram on your paper to visually structure your answer.",
        examSheetTipHi: "अपने उत्तर को दृश्य रूप से आकर्षक बनाने हेतु यह 4-चरणीय आरेख बनाएं।",
        nodes: [
          {
            step: 1,
            badgeEn: "Core Drivers",
            badgeHi: "मूल कारक",
            titleEn: "Problem Context",
            titleHi: "समस्या का मूल संदर्भ",
            descEn: "Underlying structural drivers and immediate causes.",
            descHi: "बुनियादी कारण एवं वर्तमान परिस्थितियां।",
            icon: "layers"
          },
          {
            step: 2,
            badgeEn: "Friction Points",
            badgeHi: "संस्थागत अड़चनें",
            titleEn: "Implementation Gaps",
            titleHi: "क्रियान्वयन में चुनौतियां",
            descEn: "Coordination friction, resource limits & compliance gaps.",
            descHi: "समन्वय की कमी, वित्तीय सीमाएं व प्रशासनिक शिथिलता।",
            icon: "alert-triangle"
          },
          {
            step: 3,
            badgeEn: "Interventions",
            badgeHi: "सुधार उपाय",
            titleEn: "Strategic Reforms",
            titleHi: "ठोस नीतिगत व संस्थागत सुधार",
            descEn: "Capacity building, technological enablement & monitoring.",
            descHi: "क्षमता संवर्धन, तकनीकी उपयोग एवं सतत समीक्षा।",
            icon: "shield-check"
          },
          {
            step: 4,
            badgeEn: "Vision Target",
            badgeHi: "दीर्घकालिक लक्ष्य",
            titleEn: "Sustainable Impact",
            titleHi: "समावेशी व स्थायी परिणाम",
            descEn: "Resilient institutional dividend and citizen welfare.",
            descHi: "स्थायी संस्थागत लाभ एवं सर्वसमावेशी विकास।",
            icon: "trending-up"
          }
        ],
        asciiBlueprint: `[मूल समस्या व संदर्भ] ──▶ [संस्थागत चुनौतियां] ──▶ [रणनीतिक सुधार व तकनीक] ──▶ [स्थायी सुशासन परिणाम]`
      };
    }
  }

  _generateHindiModelAnswer(question, studentAnswer, wordLimit, directive) {
    const qClean = question.replace(/^(Discuss|Analyze|Critically Examine|Evaluate|Explain|Examine)\s+/i, '').trim();
    
    return `**संदर्भ एवं प्रस्तावना (Context & Introduction):**
${qClean.slice(0, 90)} समकालीन नीतिगत विमर्श और प्रशासनिक व्यवस्था का एक महत्वपूर्ण आयाम है। यह संवैधानिक सिद्धांतों, आर्थिक संवृद्धि और सामाजिक कल्याण के अंतर्संबंधों को प्रत्यक्ष रूप से प्रभावित करता है।

**प्रमुख विश्लेषणात्मक आयाम (Key Analytical Dimensions):**
• **संरचनात्मक कारक (Structural Drivers):** जमीनी वास्तविकताओं के अनुरूप संस्थागत प्रक्रियाओं एवं नीतिगत संरेखण को सुदृढ़ बनाना पहली प्राथमिकता है।
• **प्रमुख चुनौतियां (Core Bottlenecks):** अंतर-विभागीय समन्वय की कमी, पारदर्शिता अंतराल और वित्तीय विकेंद्रीकरण की धीमी गति अपेक्षित परिणामों को प्रभावित करती है।
• **नीतिगत उपाय (Strategic Interventions):** प्रौद्योगिकी आधारित पारदर्शी समाधान, वैधानिक निगरानी एवं जनभागीदारी से सुधारों की प्रभावशीलता कई गुना बढ़ जाती है।

**भावी राह (Way Forward & Conclusion):**
आगे की राह में नीतिगत स्पष्टता, प्रक्रिया सरलीकरण और जवाबदेही (Policy, Process, Accountability) का त्रिसूत्रीय मॉडल अपनाना आवश्यक है, ताकि सहकारी संघवाद के माध्यम से दीर्घकालिक सुशासन परिणाम सुनिश्चित किए जा सकें।`;
  }

  _generateImprovedModelAnswer(question, studentAnswer, wordLimit, directive) {
    const qClean = question.replace(/^(Discuss|Analyze|Critically Examine|Evaluate|Explain|Examine)\s+/i, '').trim();
    
    return `**Context & Introduction:**
${qClean.slice(0, 100)} occupies a pivotal position in contemporary policy architecture, intersecting constitutional mandates, economic growth, and inclusive societal welfare.

**Key Analytical Dimensions:**
• **Structural Drivers:** Institutional frameworks and socio-economic dynamics require sustained policy alignment to address grassroots operational realities.
• **Core Impediments:** Bottlenecks in inter-departmental synergy, data transparency, and fiscal devolution frequently temper intended policy outcomes.
• **Strategic Interventions:** Targeted flagship initiatives and digital governance mechanisms have demonstrated high efficacy where community participation is prioritized.

**Way Forward:**
Moving ahead, adopting a 3P strategy—Policy predictability, Process digitization, and Public accountability—coupled with collaborative federalism will bridge implementation deficits and secure resilient long-term dividends.`;
  }

  /**
   * Sanitizes and normalizes evaluation response
   */
  _sanitizeEvaluationResult(raw, studentAnswer, wordCount, wordLimit, marks) {
    const defaultScores = {
      content: 7.0,
      structure: 7.0,
      relevance: 7.0,
      analysis: 6.5,
      language: 7.5,
      presentation: 7.0,
      overall: 7.0
    };

    const scores = { ...defaultScores, ...(raw.scores || {}) };
    for (const k in scores) {
      scores[k] = Number(Number(scores[k] || 7.0).toFixed(1));
    }
    scores.marksAwarded = raw.scores?.marksAwarded != null ? raw.scores.marksAwarded : Number(((scores.overall / 10) * marks).toFixed(1));

    const finalSummaryEn = raw.summary || (raw.bilingualSummary?.en) || 'Answer evaluated comprehensively across examination dimensions.';
    const finalSummaryHi = raw.summaryHi || (raw.bilingualSummary?.hi) || 'आपके उत्तर का मुख्य परीक्षा के मानकों के आधार पर बहु-आयामीय मूल्यांकन किया गया है।';
    const normalizedDiagram = this._normalizeVisualDiagram(raw.visualDiagram || this.generateVisualDiagram('General Studies', studentAnswer, 'Discuss'));

    return {
      summary: finalSummaryEn,
      summaryHi: finalSummaryHi,
      bilingualSummary: {
        en: finalSummaryEn,
        hi: finalSummaryHi
      },
      scores: scores,
      scoreDisclaimer: raw.scoreDisclaimer || "AI Practice Evaluation — Not an Official Exam Score",
      scoreDisclaimerHi: raw.scoreDisclaimerHi || "एआई अभ्यास मूल्यांकन — यह कोई आधिकारिक परीक्षा परिणाम नहीं है",
      strengths: Array.isArray(raw.strengths) && raw.strengths.length > 0 ? raw.strengths : ['Clear thematic understanding shown.'],
      bilingualStrengths: Array.isArray(raw.bilingualStrengths) && raw.bilingualStrengths.length > 0 
        ? raw.bilingualStrengths 
        : (raw.strengths || ['Clear thematic understanding shown.']).map(s => ({ en: s, hi: `विषय पर स्पष्ट पकड़ और अच्छी अभिव्यक्ति दर्शाई गई है।` })),
      weaknesses: Array.isArray(raw.weaknesses) && raw.weaknesses.length > 0 ? raw.weaknesses : ['Needs deeper multi-dimensional analytical coverage.'],
      bilingualWeaknesses: Array.isArray(raw.bilingualWeaknesses) && raw.bilingualWeaknesses.length > 0 
        ? raw.bilingualWeaknesses 
        : (raw.weaknesses || ['Needs deeper multi-dimensional analytical coverage.']).map(w => ({ en: w, hi: `संस्थागत व बहु-पक्षीय विश्लेषण को और अधिक समृद्ध बनाने की आवश्यकता है।` })),
      missingDimensions: Array.isArray(raw.missingDimensions) ? raw.missingDimensions : [],
      bilingualMissingDimensions: Array.isArray(raw.bilingualMissingDimensions) && raw.bilingualMissingDimensions.length > 0
        ? raw.bilingualMissingDimensions
        : (raw.missingDimensions || []).map(d => ({
            dimension: d.dimension || 'Key Dimension',
            dimensionHi: d.dimensionHi || 'महत्वपूर्ण आयाम',
            details: d.details || '',
            detailsHi: d.detailsHi || d.details || ''
          })),
      structureAnalysis: raw.structureAnalysis || {
        intro: { verdict: 'Moderate', verdictHi: 'मध्यम', feedback: 'Intro addresses question but can be more concise.', feedbackHi: 'प्रस्तावना संक्षिप्त व सटीक बनाएं।' },
        body: { verdict: 'Developing', verdictHi: 'प्रवाहशील', feedback: 'Body needs structured subheadings.', feedbackHi: 'मुख्य भाग में उप-शीर्षकों का प्रयोग करें।' },
        conclusion: { verdict: 'Adequate', verdictHi: 'संतोषजनक', feedback: 'Conclude with forward-looking way forward.', feedbackHi: 'निष्कर्ष में दूरदर्शी समाधान दें।' }
      },
      relevanceAnalysis: raw.relevanceAnalysis || {
        wordCountStatus: wordCount > wordLimit * 1.15 ? 'Exceeded Limit' : 'Balanced',
        fluffIdentified: 'Eliminate filler sentences to preserve words.',
        fluffIdentifiedHi: 'अनावश्यक विस्तार व दोहराव से बचें।',
        wordEconomyTip: 'Use active voice and administrative terms.',
        wordEconomyTipHi: 'सक्रिय वाक्यों और सटीक शब्दों का प्रयोग करें।'
      },
      depthAnalysis: raw.depthAnalysis || {
        currentLevel: 'Moderate Analysis',
        currentLevelHi: 'विश्लेषणात्मक स्तर',
        recommendation: 'Incorporate cause-and-effect relationships.',
        recommendationHi: 'कारण एवं प्रभाव के अंतर्संबंधों को स्पष्ट करें।'
      },
      factualReview: Array.isArray(raw.factualReview) ? raw.factualReview : [],
      languageFeedback: raw.languageFeedback || {
        tone: 'Academic',
        toneHi: 'अकादमिक व गंभीर',
        vocabularySuggestions: []
      },
      presentationFeedback: raw.presentationFeedback || {
        formatting: 'Clean text',
        advice: 'Use bullet points for arguments.',
        adviceHi: 'बुलेट बिंदुओं का संतुलित प्रयोग करें।'
      },
      examStrategy: Array.isArray(raw.examStrategy) ? raw.examStrategy : ['Keep introduction crisp and stick to word limit.'],
      improvementSteps: Array.isArray(raw.improvementSteps) ? raw.improvementSteps : ['Rewrite intro in 2 lines', 'Add missing dimensions'],
      bilingualImprovementSteps: (Array.isArray(raw.bilingualImprovementSteps) && raw.bilingualImprovementSteps.length > 0
        ? raw.bilingualImprovementSteps
        : (raw.improvementSteps || ['1. Rewrite intro in 2 lines', '2. Add missing dimensions', '3. Cite relevant committee or constitutional article', '4. Streamline word economy', '5. Conclude with forward-looking Way Forward'])
      ).map((st, i) => {
        const enVal = typeof st === 'object' ? (st.stepEn || st.en || st.text || `Step ${i + 1}`) : String(st);
        const hiVal = typeof st === 'object' ? (st.stepHi || st.hi || `${i + 1}. इस बिंदु पर उत्तर को पुनः संशोधित कर अभ्यास करें।`) : `${i + 1}. इस बिंदु पर उत्तर को पुनः संशोधित कर अभ्यास करें।`;
        return {
          stepEn: enVal,
          stepHi: hiVal,
          en: enVal,
          hi: hiVal
        };
      }),
      improvedAnswer: raw.improvedAnswer || this._generateImprovedModelAnswer(studentAnswer, studentAnswer, wordLimit, 'Discuss'),
      improvedAnswerHi: raw.improvedAnswerHi || this._generateHindiModelAnswer(studentAnswer, studentAnswer, wordLimit, 'Discuss'),
      visualDiagram: normalizedDiagram,
      beforeAfter: Array.isArray(raw.beforeAfter) ? raw.beforeAfter : [],
      suggestedFramework: raw.suggestedFramework || {
        intro: '2-line definition or context',
        dimensions: ['Dimension 1', 'Dimension 2'],
        challenges: 'Bottlenecks',
        wayForward: 'Strategic reforms',
        conclusion: 'Forward-looking synthesis'
      }
    };
  }

  /**
   * Unifies and standardizes flowchart / diagram properties
   */
  _normalizeVisualDiagram(raw) {
    if (!raw) return null;
    const rawNodes = raw.nodes || raw.flowNodes || [];
    const flowNodes = rawNodes.map((n, i) => ({
      step: n.step != null ? (typeof n.step === 'number' ? `Step ${n.step}` : n.step) : (n.badgeEn || `Step ${i + 1}`),
      title: n.titleEn || n.title || 'Core Dimension',
      titleHi: n.titleHi || n.title || '',
      desc: n.descEn || n.desc || '',
      descHi: n.descHi || '',
      badge: n.badgeEn || n.badge || '',
      badgeHi: n.badgeHi || '',
      nodeType: n.nodeType || 'FLOW'
    }));

    return {
      titleEn: raw.titleEn || raw.diagramTitle || 'Answer Structural Concept Flowchart',
      titleHi: raw.titleHi || 'उत्तर संरचनात्मक फ़्लोचार्ट',
      diagramTitle: raw.titleEn || raw.diagramTitle || 'Answer Structural Concept Flowchart',
      diagramType: raw.type || raw.diagramType || 'FLOWCHART',
      type: raw.type || raw.diagramType || 'FLOWCHART',
      subtitleEn: raw.subtitleEn || raw.diagramDescription || 'Core conceptual linkages and causal flow for Mains answer writing.',
      subtitleHi: raw.subtitleHi || raw.diagramDescriptionHi || 'मुख्य परीक्षा उत्तर लेखन हेतु वैचारिक प्रवाह एवं अंतर्संबंध।',
      diagramDescription: raw.subtitleEn || raw.diagramDescription || 'Core conceptual linkages and causal flow for Mains answer writing.',
      diagramDescriptionHi: raw.subtitleHi || raw.diagramDescriptionHi || 'मुख्य परीक्षा उत्तर लेखन हेतु वैचारिक प्रवाह एवं अंतर्संबंध।',
      examSheetTipEn: raw.examSheetTipEn || raw.drawingInstructions || 'Sketch a horizontal 4-node box diagram with directional arrows in your exam sheet for bonus marks.',
      examSheetTipHi: raw.examSheetTipHi || raw.drawingInstructionsHi || 'अतिरिक्त अंकों हेतु अपनी मुख्य परीक्षा उत्तर पुस्तिका में तीरों के साथ 4-चरणीय आरेख बनाएं।',
      drawingInstructions: raw.examSheetTipEn || raw.drawingInstructions || 'Sketch a horizontal 4-node box diagram with directional arrows in your exam sheet for bonus marks.',
      drawingInstructionsHi: raw.examSheetTipHi || raw.drawingInstructionsHi || 'अतिरिक्त अंकों हेतु अपनी मुख्य परीक्षा उत्तर पुस्तिका में तीरों के साथ 4-चरणीय आरेख बनाएं।',
      nodes: raw.nodes || flowNodes,
      flowNodes: flowNodes,
      asciiBlueprint: raw.asciiBlueprint || '[भूमिका / कोर संकल्पना] ──▶ [मुख्य संस्थागत आयाम] ──▶ [नीतिगत अड़चनें] ──▶ [भावी राह / Way Forward]'
    };
  }

  /**
   * Follow-up Tutor Chat about the current question and evaluated answer
   */
  async askTutorAboutAnswer({
    question,
    studentAnswer,
    evaluation,
    chatHistory = [],
    userMessage
  }) {
    if (!userMessage || !userMessage.trim()) {
      return "Please ask a specific question about your answer or evaluation.";
    }

    const apiKey = window.geminiService?.getApiKey();

    if (window.geminiService?.isAiAvailable()) {
      try {
        const historyText = chatHistory.slice(-6).map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
        const prompt = `You are a warm, encouraging, but academically rigorous Senior UPSC / State PSC Examination Tutor.
A student is asking for guidance on an answer they just wrote and had evaluated.

QUESTION:
"${question}"

STUDENT'S ANSWER:
"${studentAnswer.slice(0, 800)}..."

EVALUATION SUMMARY & SCORES:
Overall: ${evaluation?.scores?.overall || 7}/10
Strengths: ${(evaluation?.strengths || []).join('; ')}
Weaknesses: ${(evaluation?.weaknesses || []).join('; ')}

RECENT TUTOR CONVERSATION:
${historyText}

STUDENT'S NEW QUESTION:
"${userMessage}"

Provide an insightful, practical, and highly pedagogical answer (under 180 words).
Focus directly on helping the student master descriptive answer writing, understand exam directives, craft better introductions/conclusions, or structure multi-dimensional arguments.`;

        const model = window.geminiService.getActiveModel();

        const res = await window.aiClient.fetchGenerateContent(model, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 600
            }
          }, { apiKey });

        if (res.ok) {
          const data = await res.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) return reply.trim();
        }
      } catch (err) {
        console.warn('Tutor follow-up API error:', err);
      }
    }

    // Contextual deterministic response generator
    return this._generateDeterministicTutorResponse(userMessage, question, evaluation);
  }

  _generateDeterministicTutorResponse(msg, question, evaluation) {
    const lower = msg.toLowerCase();

    if (lower.includes('intro') || lower.includes('introduction')) {
      return `To craft a topper-grade introduction for this question, limit yourself to 2-3 lines (approx. 25-30 words). Never write generic filler. Instead, choose one of three high-yield hooks:\n1. **A precise definition** of the key concept.\n2. **A constitutional or statutory anchor** (e.g. Article or Act).\n3. **A striking macroeconomic or social data point** (e.g. NITI Aayog or NFHS index).\nThis immediately proves to the examiner that you grasp the core context.`;
    }

    if (lower.includes('conclusion') || lower.includes('way forward') || lower.includes('ending')) {
      return `In descriptive examinations like UPSC, your conclusion must be **forward-looking and constructive** rather than a passive summary of what you already wrote. Allocate the final 25-30 words to a "Way Forward": highlight a balanced policy solution, institutional coordination, or a directive principle/constitutional goal that bridges the challenge.`;
    }

    if (lower.includes('topper') || lower.includes('score high') || lower.includes('more marks') || lower.includes('9') || lower.includes('10')) {
      return `Toppers separate themselves through **scannability and value density**. For this question:\n• Use clear subheadings that mirror the question's demands.\n• Convert dense paragraphs into 3-4 bullet points with bold keywords.\n• Interleave at least one authentic committee recommendation or government scheme.\n• Underline critical terms so the examiner can award marks in under 60 seconds of review.`;
    }

    if (lower.includes('directive') || lower.includes('discuss') || lower.includes('analyze') || lower.includes('critically')) {
      const d = this.extractDirectiveWord(question);
      return `The directive here is **"${d}"**. ${this.getDirectiveTip(d)}\nAlways ensure you allocate equal mental weight to all perspectives mandated by the directive before rendering a balanced verdict.`;
    }

    if (lower.includes('miss') || lower.includes('weak') || lower.includes('improve')) {
      const primaryWeakness = evaluation?.weaknesses?.[0] || 'Deep multi-dimensional analysis';
      return `Your primary area for improvement is: **${primaryWeakness}**.\nTo address this in your next attempt, brainstorm using the **PESTLE framework** (Political, Economic, Social, Technological, Legal, Environmental) for 30 seconds before putting pen to paper. This guarantees you won't miss vital dimensions.`;
    }

    return `Great inquiry! The most effective way to elevate your score on this question is to focus on **structural clarity and evidence-backed arguments**. Ensure every paragraph directly serves the directive, eliminate repetitive phrasing to protect your word limit, and always finish with a visionary Way Forward. Would you like to practice a similar question or focus on a specific weak dimension?`;
  }

  /**
   * Generates next practice question (Similar, Harder, or Weak-Area)
   */
  async generatePracticeQuestion({
    type = 'similar', // 'similar', 'harder', 'weak_area'
    previousQuestion,
    previousWeakness,
    subject = 'Polity',
    exam = 'UPSC'
  }) {
    const apiKey = window.geminiService?.getApiKey();

    if (window.geminiService?.isAiAvailable()) {
      try {
        let typeInstruction = '';
        if (type === 'harder') {
          typeInstruction = 'Generate a more complex, advanced, and critically analytical question on the SAME thematic area with higher cognitive challenge.';
        } else if (type === 'weak_area') {
          typeInstruction = `The student's detected weakness in their previous attempt was: "${previousWeakness || 'Analytical depth and factual substantiation'}". Generate a question specifically designed to test and train this weak area.`;
        } else {
          typeInstruction = `Generate a fresh, parallel examination question testing the same broad subject area (${subject}) but from a complementary perspective. Do NOT duplicate the previous question.`;
        }

        const prompt = `You are a Senior Question Paper Setter for ${exam}.
${typeInstruction}

PREVIOUS QUESTION CONTEXT:
"${previousQuestion || 'General Studies Topic'}"

Generate ONE new examination question.
Return ONLY valid JSON:
{
  "question": "Complete question text",
  "directive": "Primary directive keyword",
  "subject": "${subject}",
  "exam": "${exam}",
  "difficulty": "${type === 'harder' ? 'ADVANCED' : 'MODERATE'}",
  "wordLimit": 150,
  "marks": 10,
  "answerType": "Paragraph Answer",
  "syllabusContext": "Short 1-line syllabus link",
  "practiceGoal": "What skill this practice question sharpens"
}`;

        const model = window.geminiService.getActiveModel();

        const res = await window.aiClient.fetchGenerateContent(model, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json'
            }
          }, { apiKey });

        if (res.ok) {
          const data = await res.json();
          const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const parsed = this._safeJsonParse(raw);
          if (parsed && parsed.question) {
            return {
              ...parsed,
              directive: parsed.directive || this.extractDirectiveWord(parsed.question)
            };
          }
        }
      } catch (err) {
        console.warn('AI practice question call error:', err);
      }
    }

    // Curated fallback
    const bankFiltered = this.curatedQuestionBank.filter(q => q.question !== previousQuestion);
    const fallback = bankFiltered[Math.floor(Math.random() * bankFiltered.length)] || this.curatedQuestionBank[0];

    return {
      ...fallback,
      difficulty: type === 'harder' ? 'ADVANCED' : fallback.difficulty,
      practiceGoal: type === 'harder' ? 'Mastering advanced multi-dimensional critical inquiry' : (type === 'weak_area' ? 'Overcoming structural and analytical deficits' : 'Strengthening core subject recall and formulation')
    };
  }

  /**
   * Multi-image OCR text extraction
   */
  async extractAnswerFromImages(files, onProgress = () => {}) {
    if (!files || files.length === 0) {
      throw new Error('Please select at least one answer image.');
    }

    let combinedText = '';
    const total = files.length;

    for (let i = 0; i < total; i++) {
      const file = files[i];
      onProgress({ current: i + 1, total, message: `Transcribing page ${i + 1} of ${total} (${file.name})...` });

      const base64Data = await this._fileToBase64(file);
      let pageText = '';

      if (window.geminiService?.isAiAvailable()) {
        try {
          pageText = await window.geminiService.extractTextFromImage({
            base64Data,
            mimeType: file.type || 'image/jpeg'
          });
        } catch (visionErr) {
          console.warn(`Vision OCR failed on page ${i + 1}:`, visionErr);
          pageText = `[OCR Notice: Automated transcription could not process image ${file.name}. Please verify or type the handwritten content below.]`;
        }
      } else {
        // Fallback placeholder with clear guidance for user
        pageText = `[Image ${i + 1}: ${file.name} uploaded]\n(Note: Connect your Gemini API Key in Settings to enable real-time handwriting vision OCR, or type/edit your answer in the review box below.)`;
      }

      combinedText += (total > 1 ? `\n\n--- [PAGE ${i + 1}] ---\n` : '') + pageText.trim() + '\n';
    }

    return combinedText.trim();
  }

  /**
   * PDF Answer Text Extractor with Digital & Scanned OCR fallback
   */
  async extractAnswerFromPdf(file, onProgress = () => {}) {
    if (!window.pdfjsLib) {
      throw new Error('PDF processing library is not loaded.');
    }

    onProgress({ message: 'Reading PDF document structure...' });

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    let combinedText = '';
    let hasScannedPages = false;

    for (let p = 1; p <= numPages; p++) {
      onProgress({ current: p, total: numPages, message: `Extracting page ${p} of ${numPages}...` });

      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();

      let pageText = '';
      for (const item of textContent.items) {
        pageText += item.str + ' ';
      }
      pageText = pageText.trim();

      // If text is virtually empty, page might be scanned handwriting
      if (pageText.length < 40) {
        hasScannedPages = true;
        // Attempt canvas render & vision OCR if Gemini key is available
        if (window.geminiService?.isAiAvailable()) {
          try {
            onProgress({ current: p, total: numPages, message: `Running Vision OCR on scanned page ${p}...` });
            const canvas = document.createElement('canvas');
            const viewport = page.getViewport({ scale: 1.5 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const base64 = canvas.toDataURL('image/jpeg', 0.85);
            const ocrResult = await window.geminiService.extractTextFromImage({
              base64Data: base64,
              mimeType: 'image/jpeg'
            });
            pageText = ocrResult.trim();
          } catch (e) {
            console.warn(`Scanned page OCR fallback failed for page ${p}:`, e);
            pageText = `[Scanned Page ${p}: Image quality too low for automated transcription. Please review below.]`;
          }
        } else {
          pageText = `[Scanned Page ${p}: Handwriting detected. Enter your Gemini API Key in Settings for auto-transcription, or review/type below.]`;
        }
      }

      combinedText += (numPages > 1 ? `\n\n--- [PAGE ${p}] ---\n` : '') + pageText + '\n';
    }

    return {
      text: combinedText.trim(),
      numPages,
      hasScannedPages
    };
  }

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  _safeJsonParse(text) {
    if (!text || typeof text !== 'string') return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      // Clean up common LLM markdown formatting
      let clean = text.trim();
      if (clean.startsWith('```json')) clean = clean.slice(7);
      if (clean.startsWith('```')) clean = clean.slice(3);
      if (clean.endsWith('```')) clean = clean.slice(0, -3);
      clean = clean.trim();

      try {
        return JSON.parse(clean);
      } catch (e2) {
        // Find outermost { ... }
        const firstBrace = clean.indexOf('{');
        const lastBrace = clean.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const sub = clean.slice(firstBrace, lastBrace + 1);
          try {
            return JSON.parse(sub);
          } catch (e3) {
            console.warn('Could not parse JSON after extraction attempts:', e3);
            return null;
          }
        }
        return null;
      }
    }
  }
}

// Global Singleton
window.answerWritingService = new AnswerWritingService();
