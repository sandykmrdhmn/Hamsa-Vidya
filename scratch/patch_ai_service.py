import re

file_path = "f:/AI Projects/Hamsa Vidya Website/js/ai-teacher-service.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update explain method signature to accept advancedModes
if "advancedModes = {}" not in content:
    content = re.sub(
        r"pdfContext = null",
        "pdfContext = null,\n    advancedModes = {}",
        content
    )

    content = re.sub(
        r"pdfContext\n    \}\);",
        "pdfContext,\n      advancedModes\n    });",
        content
    )

# 2. Update _buildPrompt method signature to accept advancedModes
if "advancedModes = {}" not in content:
    content = re.sub(
        r"pdfContext \}",
        "pdfContext, advancedModes = {} }",
        content
    )

# 3. Modify the prompt builder
if "advancedModesInstructions = '';" not in content:
    advanced_logic = """
    let advancedModesInstructions = '';
    let extraSchema = '';
    
    if (advancedModes.socratic) {
      advancedModesInstructions += '\\n- SOCRATIC TUTOR MODE IS ENABLED: Do NOT give the final answer easily. Give a hint, explain the setup, and end with a guiding question that forces the student to think. Keep it highly interactive.\\n';
    }
    if (advancedModes.debate) {
      advancedModesInstructions += '\\n- DEBATE MODE IS ENABLED: Play the Devils Advocate. Challenge the student\\'s thesis, provide counter-arguments, and ask them to defend their stance.\\n';
    }
    if (advancedModes.mindmap) {
      advancedModesInstructions += '\\n- MIND MAP MODE IS ENABLED: Generate a valid Mermaid.js graph string to visualize the concept.\\n';
      extraSchema += '\\n  "mermaidMindmap": "Valid Mermaid.js syntax for an interactive graph or flowchart (optional)",';
    }
    if (advancedModes.connections) {
      advancedModesInstructions += '\\n- HAMSA CONNECTIONS ENABLED: Show how this topic uniquely connects to at least 2 other completely different subjects (e.g. Math connecting to Art/Biology).\\n';
      extraSchema += '\\n  "hamsaConnections": { "subject1": "Connection detail", "subject2": "Connection detail" },';
    }
    if (advancedModes.teachBack) {
      advancedModesInstructions += '\\n- TEACH BACK MODE ENABLED: The student will explain this back to you later. Add a specific challenge or prompt telling them what exactly they need to prepare to teach back.\\n';
      extraSchema += '\\n  "teachBackChallenge": "Prompt challenging the student to explain a specific tricky part back to you",';
    }

    const finalJsonSchema = `{
  "questionAnalysis": {
    "subject": "Mathematics | Physics | Chemistry | Biology | History | Geography | Indian Polity | Economics | English | Hindi | Computer Science | Reasoning | Quantitative Aptitude | Current Affairs | General Knowledge | Other",
    "topic": "Specific topic name",
    "subtopic": "Specific subtopic or null",
    "questionType": "FACTUAL | CONCEPTUAL | ANALYTICAL | NUMERICAL | COMPARATIVE | PROCEDURAL | EXAM_ORIENTED",
    "difficulty": "BEGINNER | INTERMEDIATE | ADVANCED | EXAM_FOCUSED",
    "examRelevance": "Brief exam relevance note or null"
  },
  "subject": "Same as questionAnalysis.subject",
  "topic": "Concise topic title",
  "difficulty": "BEGINNER | INTERMEDIATE | ADVANCED | EXAM_FOCUSED",
  "isMath": false,
  "quickAnswer": "Direct, clear answer in 1-3 sentences — the core takeaway",
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
    "Key takeaway 1 (ONLY if not already stated in explanation)",
    "Key takeaway 2 (2-3 points max)"
  ],
  "practiceQuestions": [
    {
      "type": "MCQ | CONCEPTUAL | NUMERICAL",
      "question": "ONE concise practice question to test understanding",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Correct answer",
      "explanation": "Brief reasoning"
    }
  ],
  "sources": [
    { "name": "Source Name (e.g. NCERT, Constitution of India)", "detail": "Brief detail or null" }
  ],
  "followUpSuggestions": [
    "Natural follow-up question 1",
    "Natural follow-up question 2"
  ]${extraSchema}
}`;
"""
    
    # We replace the static schema block with this dynamic one
    # Find the block starting with `Return a JSON object.`
    pattern = r"Return a JSON object\. Include ONLY fields relevant to this question \(return null for irrelevant ones\):\n\{[\s\S]*?followUpSuggestions\": \[\n    \"Natural follow-up question 1\",\n    \"Natural follow-up question 2\"\n  \]\n\}"
    
    replacement = "Return a JSON object. Include ONLY fields relevant to this question (return null for irrelevant ones):\n${finalJsonSchema}"
    
    content = re.sub(pattern, replacement, content)
    
    # Inject advanced modes string into CRITICAL INSTRUCTIONS
    instr_pattern = r"5\. Teach like a professional teacher: concept first, then structured explanation, then exam connection if relevant\."
    content = re.sub(instr_pattern, r"5. Teach like a professional teacher: concept first, then structured explanation, then exam connection if relevant.\n${advancedModesInstructions}", content)
    
    # Prepend the advanced_logic definition before `return \`\${this.systemPrompt}`
    ret_pattern = r"return `\$\{this\.systemPrompt\}"
    content = re.sub(ret_pattern, advanced_logic + "\n    " + r"return `${this.systemPrompt}", content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated ai-teacher-service.js.")
