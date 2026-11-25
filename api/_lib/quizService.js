import { GoogleGenAI, Modality, Type, ThinkingLevel } from '@google/genai';
import Groq from 'groq-sdk';

const invalidGeminiKeys = new Set();
const invalidFallbackKeys = new Set();
const unavailableFallbackModels = new Set();
let cachedGroqModels = null;

const isUsableKey = (k) => {
  if (!k || typeof k !== 'string') return false;
  const trimmed = k.trim();
  if (trimmed.length < 20) return false;
  if (/placeholder|your_|insert|example|changeme|<|>/i.test(trimmed)) return false;
  return true;
};

const getAIKeys = () => {
  const rawKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_SECONDARY,
    process.env.GEMINI_API_KEY_TERTIARY,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY_8,
    process.env.GEMINI_API_KEY_9,
    process.env.GEMINI_API_KEY_10,
    process.env.API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    process.env.VITE_API_KEY
  ]
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter((k) => isUsableKey(k) && !invalidGeminiKeys.has(k));

  return Array.from(new Set(rawKeys));
};

const getFallbackProviders = () => {
  const providers = [];
  const groqKey = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '').trim();
  const grokKey = (process.env.GROK_API_KEY || process.env.XAI_API_KEY || '').trim();

  if (isUsableKey(groqKey) && !invalidFallbackKeys.has(groqKey)) {
    if (groqKey.startsWith('xai-')) {
      providers.push({
        type: 'grok',
        apiKey: groqKey,
        baseURL: 'https://api.x.ai/v1',
        models: ['grok-3-mini', 'grok-2-1212', 'grok-beta'].filter(
          (m) => !unavailableFallbackModels.has(`grok:${m}`)
        )
      });
    } else {
      const envModel = (process.env.GROQ_MODEL || '').trim();
      const candidateModels = [
        envModel,
        'llama-3.3-70b-versatile',
        'openai/gpt-oss-20b',
        'gpt-oss-20b'
      ].filter(
        (m, idx, arr) =>
          m &&
          arr.indexOf(m) === idx &&
          m !== 'llama-3.1-8b-instant' &&
          m !== 'llama3-8b-8192' &&
          !unavailableFallbackModels.has(`groq:${m}`)
      );

      if (candidateModels.length > 0) {
        providers.push({
          type: 'groq',
          apiKey: groqKey,
          client: new Groq({ apiKey: groqKey }),
          models: candidateModels
        });
      }
    }
  }

  if (isUsableKey(grokKey) && !invalidFallbackKeys.has(grokKey)) {
    const grokModels = ['grok-3-mini', 'grok-2-1212', 'grok-beta'].filter(
      (m) => !unavailableFallbackModels.has(`grok:${m}`)
    );
    if (grokModels.length > 0) {
      providers.push({
        type: 'grok',
        apiKey: grokKey,
        baseURL: 'https://api.x.ai/v1',
        models: grokModels
      });
    }
  }

  return providers;
};

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req) => {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8'));
    } catch {
      return {};
    }
  }
  if (req.readableEnded) {
    return {};
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const isRateLimitError = (err) => {
  if (!err) return false;
  const status = err.status || err.statusCode || err.code || (err.error && err.error.code);
  const message = String(err.message || '').toLowerCase();
  const statusString = String(status);

  return (
    status === 429 ||
    statusString.includes('429') ||
    status === 503 ||
    statusString.includes('503') ||
    message.includes('quota') ||
    message.includes('limit exceeded') ||
    message.includes('resource_exhausted') ||
    message.includes('too many requests') ||
    message.includes('429')
  );
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const repairJson = (text) => {
  let cleaned = text.trim();
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?/g, '').replace(/```/g, '');
  }
  return cleaned.trim();
};

const extractJsonObjects = (text) => {
  const results = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const objStr = text.substring(start, i + 1);
          try {
            const parsed = JSON.parse(objStr);
            if (parsed && typeof parsed === 'object' && (parsed.question || parsed.text) && Array.isArray(parsed.options)) {
              results.push(parsed);
            }
          } catch {
            // Partial or malformed JSON object
          }
          start = -1;
        }
      }
    }
  }
  return results;
};

const extractRawOptions = (q) => {
  const candidate = q?.options ?? q?.choices ?? q?.answers;
  if (Array.isArray(candidate) && candidate.length === 4) {
    const cleaned = candidate.map((o) => String(o ?? '').trim()).filter(Boolean);
    return cleaned.length === 4 ? cleaned : null;
  }
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    const vals = Object.values(candidate).map((o) => String(o ?? '').trim()).filter(Boolean);
    return vals.length === 4 ? vals : null;
  }
  return null;
};

const resolveCorrectIndex = (q, rawOptions) => {
  const numCandidate = q?.correctIndex ?? q?.correct_index ?? q?.answerIndex ?? q?.answer_index;
  if (typeof numCandidate === 'number' && Number.isFinite(numCandidate) && numCandidate >= 0 && numCandidate < 4) {
    return Math.floor(numCandidate);
  }
  if (typeof numCandidate === 'string' && /^[0-3]$/.test(numCandidate.trim())) {
    return Number(numCandidate.trim());
  }
  const ansStr = String(q?.correctAnswer ?? q?.correct_answer ?? q?.answer ?? '').trim();
  if (ansStr) {
    const letterIdx = ['A', 'B', 'C', 'D'].indexOf(ansStr.toUpperCase());
    if (letterIdx !== -1) return letterIdx;
    const exactIdx = rawOptions.findIndex((o) => o.toLowerCase() === ansStr.toLowerCase());
    if (exactIdx !== -1) return exactIdx;
  }
  return 0;
};

const formatSingleQuestion = (q, index, topic) => {
  if (!q || typeof q !== 'object') return null;

  const rawText = String(q.text ?? q.question ?? q.stem ?? q.prompt ?? '').trim();
  if (rawText.length < 8) return null;

  const rawOptions = extractRawOptions(q);
  if (!rawOptions) return null;

  const rawCorrectIndex = resolveCorrectIndex(q, rawOptions);

  const isAssertionReason =
    /assertion/i.test(String(q.type || '')) ||
    (/assertion\s*\(?a\)?/i.test(rawText) &&
      /reason\s*\(?r\)?/i.test(rawText) &&
      rawOptions.some((o) => /both\s+(assertion|a)\s+and\s+(reason|r)/i.test(o)));

  let finalOptions = rawOptions;
  let finalCorrectIndex = rawCorrectIndex;

  if (!isAssertionReason) {
    const mappedOptions = rawOptions.map((opt, idx) => ({
      text: opt,
      isCorrect: idx === rawCorrectIndex
    }));

    for (let i = mappedOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = mappedOptions[i];
      mappedOptions[i] = mappedOptions[j];
      mappedOptions[j] = temp;
    }

    finalOptions = mappedOptions.map((item) => item.text);
    finalCorrectIndex = Math.max(0, mappedOptions.findIndex((item) => item.isCorrect));
  }

  return {
    id: Number(q.id) || index + 1,
    type: q.type || 'MCQ',
    text: rawText,
    question: rawText,
    topicTag: q.topicTag ? String(q.topicTag).trim() : topic,
    chapterTag: q.chapterTag ? String(q.chapterTag).trim() : (q.topicTag ? String(q.topicTag).trim() : topic),
    contextMaterial: q.contextMaterial ? String(q.contextMaterial).trim() : undefined,
    options: finalOptions,
    correctIndex: finalCorrectIndex,
    explanation: q.explanation ? String(q.explanation).trim() : 'Review the core syllabus principle for this step.',
    stepByStepSolution: q.stepByStepSolution
      ? String(q.stepByStepSolution).trim()
      : (q.explanation ? String(q.explanation).trim() : 'Step 1: Identify the governing concept. Step 2: Apply the rule or formula with proper units to verify the correct choice.'),
    commonMistakeNote: q.commonMistakeNote
      ? String(q.commonMistakeNote).trim()
      : 'Distractors look tempting when sign conventions, inverse ratios, or unit conversions are overlooked—double-check each step against the core rule.',
    inquiryPrompt: q.inquiryPrompt
      ? String(q.inquiryPrompt).trim()
      : `How would the outcome change if we varied a key condition in this ${topic} problem?`
  };
};

const validateAndFormatQuestions = (questions, topic) => {
  if (!Array.isArray(questions)) return [];
  return questions.map((q, index) => formatSingleQuestion(q, index, topic)).filter(Boolean);
};

function getBoardPatternPromptDirectives(boardPattern) {
  const normalized = (boardPattern || 'Mixed Board Pattern').trim();

  if (/assertion/i.test(normalized)) {
    return {
      formatName: 'Assertion-Reasoning Focus',
      systemDirective: `MANDATORY SYSTEM DIRECTIVE - STRICT ASSERTION-REASONING FORMAT:
- The user has explicitly selected the 'Assertion-Reasoning' Board Exam format.
- YOU ARE STRICTLY FORBIDDEN FROM GENERATING GENERIC MULTIPLE CHOICE QUESTIONS.
- EVERY SINGLE QUESTION (all 5 questions) MUST be an authentic Assertion (A) and Reason (R) question.
- The 'text' field of each question MUST be strictly formatted as:
  "Assertion (A): [Factual or conceptual statement regarding the syllabus/topic]
Reason (R): [Supporting, contradictory, or causal statement regarding the assertion]"
- The 'options' array MUST STRICTLY contain these exact 4 standard options:
  [
    "Both Assertion (A) and Reason (R) are true and Reason (R) is the correct explanation of Assertion (A).",
    "Both Assertion (A) and Reason (R) are true but Reason (R) is NOT the correct explanation of Assertion (A).",
    "Assertion (A) is true but Reason (R) is false.",
    "Assertion (A) is false but Reason (R) is true."
  ]
- 'correctIndex' (0, 1, 2, or 3) MUST reflect the true scientific/logical relationship between Assertion (A) and Reason (R).
- 'explanation' MUST clearly evaluate both Assertion and Reason statements individually and explain why the selected option is correct.`,
      promptDirective: `MANDATORY FORMAT ENFORCEMENT (ASSERTION-REASONING ONLY):
- Selected Board Format: ASSERTION-REASONING (Strict).
- YOU MUST FORMAT ALL 5 QUESTIONS EXCLUSIVELY AS ASSERTION (A) AND REASON (R) STATEMENTS.
- The 'text' field MUST contain "Assertion (A): ..." and "Reason (R): ...".
- The 4 options MUST strictly match the standard 4 board choices.
- DO NOT generate regular or standard standalone MCQs.`
    };
  }

  if (/case/i.test(normalized) || /passage/i.test(normalized)) {
    return {
      formatName: 'Case Study & Passage-Based Focus',
      systemDirective: `MANDATORY SYSTEM DIRECTIVE - STRICT CASE STUDY / PASSAGE-BASED FORMAT:
- The user has explicitly selected the 'Case Study / Passage-Based' Board Exam format.
- YOU ARE STRICTLY FORBIDDEN FROM GENERATING ISOLATED, UNRELATED STANDALONE MCQs WITHOUT CONTEXT.
- Author ONE cohesive, realistic shared stimulus paragraph/case (60 to 110 words) containing concrete experimental observations, numerical measurements, or real-world facts strictly from the topic/notes.
- Place this exact shared stimulus case inside 'contextMaterial' across ALL 5 questions (type: 'CASE_STUDY'), and write 5 linked, progressive sub-questions ("Sub-question 1" through "Sub-question 5") testing distinct aspects, deductions, and calculations drawn directly from that shared stimulus passage.
- Every option set must test careful analytical interpretation or quantitative reasoning based on the shared case.
- 'stepByStepSolution' and 'explanation' MUST cite the exact facts/values from the shared stimulus paragraph.`,
      promptDirective: `MANDATORY FORMAT ENFORCEMENT (CASE STUDY / PASSAGE-BASED — SHARED STIMULUS + LINKED SUB-QUESTIONS):
- Selected Board Format: CASE STUDY & PASSAGE-BASED (Strict).
- Create ONE shared stimulus paragraph/case (60-110 words) and include it in 'contextMaterial' for ALL 5 linked sub-questions (type: 'CASE_STUDY').
- Make the 5 questions linked sub-questions probing different facets, calculations, and inferences from that same shared passage.`
    };
  }

  if (/competency|numerical|application/i.test(normalized)) {
    return {
      formatName: 'Competency & Application Focus',
      systemDirective: `MANDATORY SYSTEM DIRECTIVE - STRICT COMPETENCY & NUMERICAL APPLICATION FORMAT:
- The user has explicitly selected the 'Competency & Application' Board Exam format.
- YOU ARE STRICTLY FORBIDDEN FROM GENERATING ROTE-MEMORIZATION OR DEFINITION-ONLY MCQs.
- All 5 questions must be higher-order competency/numerical assessments (types: 'WORD_PROBLEM' or 'VISUAL_ANALYSIS').
- ALWAYS include explicit physical/measurement units (e.g., cm, m, s, kg, V, A, Ω, J, mol, %) in the question stem AND in all 4 options whenever quantitative values appear.
- Focus on practical real-world applications, quantitative multi-step calculations, experimental variable analysis, and data interpretation strictly within the topic syllabus.
- 'stepByStepSolution' MUST show: (1) Given values with units, (2) Formula/principle, (3) Step-by-step substitution and arithmetic, and (4) Final answer with explicit units.`,
      promptDirective: `MANDATORY FORMAT ENFORCEMENT (COMPETENCY & NUMERICAL APPLICATION — EXPLICIT UNITS & STEP-BY-STEP MATH):
- Selected Board Format: COMPETENCY & NUMERICAL APPLICATION (Strict).
- Generate analytical and numerical problem-solving questions with EXPLICIT UNITS in stems/options (type: 'WORD_PROBLEM' or 'VISUAL_ANALYSIS').
- Include full step-by-step calculations with units in 'stepByStepSolution' and 'explanation'.`
    };
  }

  if (/mcq/i.test(normalized)) {
    return {
      formatName: 'MCQ Focus',
      systemDirective: `MANDATORY SYSTEM DIRECTIVE - STRICT MULTIPLE CHOICE FORMAT:
- The user has explicitly selected the 'MCQ Focus' Board Exam format.
- Generate high-quality, syllabus-aligned Multiple Choice Questions (type: 'MCQ') testing conceptual accuracy, terminology, and core principles.
- Ensure all 4 options are plausible, unambiguous, and realistic distractors.`,
      promptDirective: `MANDATORY FORMAT ENFORCEMENT (MCQ FOCUS):
- Selected Board Format: MCQ ONLY.
- Generate 5 high-yield Multiple Choice Questions with 4 well-calibrated option choices.`
    };
  }

  return {
    formatName: 'Mixed Board Pattern',
    systemDirective: `MANDATORY SYSTEM DIRECTIVE - OFFICIAL BOARD MIXED PATTERN:
- The user has selected the official 'Mixed Board Pattern' blueprint.
- Generate an authentic, official board examination distribution across the 5 questions:
  1. Question 1 & 2: Standard Conceptual MCQs (type: 'MCQ')
  2. Question 3: Assertion-Reasoning Question formatted with Assertion (A) & Reason (R) and the 4 standard relationship options.
  3. Question 4: Competency / Numerical Word Problem with explicit units and step-by-step calculation (type: 'WORD_PROBLEM')
  4. Question 5: Case Study / Passage-Based Question with a rich stimulus scenario in 'contextMaterial' (type: 'CASE_STUDY').`,
    promptDirective: `MANDATORY FORMAT ENFORCEMENT (MIXED BOARD PATTERN):
- Selected Board Format: MIXED BOARD PATTERN.
- Generate an authentic distribution: 2 MCQs, 1 Assertion-Reasoning (with standard 4 relationship options), 1 Competency/Numerical Problem (with explicit units), and 1 Case Study.`
  };
}

function buildDifficultyCalibrationPrompt(level, eduLevel, board, gradeLevel, subject, topic, hasSourceMaterial = false, sourceTitles = []) {
  const safeLevel = Math.max(1, Number(level) || 1);
  const effectiveFocusLabel = hasSourceMaterial
    ? (sourceTitles.length > 0 ? sourceTitles.join(', ') : topic || 'Selected Study Library Notes')
    : topic;

  const tierDescription =
    safeLevel === 1
      ? `LV 1 · FOUNDATIONAL — BLOOM'S TAXONOMY: RECALL & BASIC COMPREHENSION:
- Bloom Stage: Remembering & Understanding (Recall -> Conceptual Understanding).
- Focus on core definitions, fundamental principles, key formulas, units, direct conceptual checks, and single-step problems from "${effectiveFocusLabel}".
- Questions should test clear, accurate recall and foundational grasp without trick traps.`
      : safeLevel === 2
      ? `LV 2 · INTERMEDIATE — BLOOM'S TAXONOMY: CONCEPTUAL UNDERSTANDING & EARLY APPLICATION:
- Bloom Stage: Conceptual Understanding -> Application.
- Step up to explaining cause-and-effect relationships, 2-step applications, unit conversions, sign/logic checks, comparing outcomes, and spotting common misconceptions within "${effectiveFocusLabel}".`
      : safeLevel === 3
      ? `LV 3 · BOARD RIGOR — BLOOM'S TAXONOMY: MULTI-STEP APPLICATION & ANALYSIS:
- Bloom Stage: Multi-step Application -> Analysis.
- Match rigorous ${board} ${gradeLevel} assessment questions for "${effectiveFocusLabel}".
- Include multi-step quantitative/logical problems, experimental/scenario reasoning, Assertion-Reasoning validation, and Case-Based analysis.`
      : safeLevel === 4
      ? `LV 4 · ADVANCED HOTS — BLOOM'S TAXONOMY: ANALYSIS & HIGHER-ORDER SYNTHESIS:
- Bloom Stage: Analysis / Higher-Order Thinking Skills (HOTS).
- Combine 2 or more sub-concepts from "${effectiveFocusLabel}" (e.g., chaining laws, boundary/limiting cases, comparative proportionality, experimental error diagnosis).
- Require analytical deduction rather than straightforward formula substitution.`
      : `LV ${safeLevel} · MASTERY / ADVANCED HOTS — BLOOM'S TAXONOMY: ANALYSIS, EVALUATION & INVERSE SYNTHESIS:
- Bloom Stage: Analysis / Evaluation / HOTS (Bloom's Peak).
- Deliver maximum analytical rigor strictly within "${effectiveFocusLabel}".
- Use inverse problems (e.g., given observed output, deduce unknown setup/parameter), multi-variable ratio derivations, critical error evaluation, and subtle edge cases.`;

  if (hasSourceMaterial) {
    return `
STRICT STUDY LIBRARY SOURCE LOCK (NON-NEGOTIABLE):
- Active Study Library Source(s): ${sourceTitles.length > 0 ? sourceTitles.join(' | ') : effectiveFocusLabel}
- Stream: ${eduLevel} | Curriculum/Exam: ${board} | Stage: ${gradeLevel} | Format Calibration ONLY
- EVERY SINGLE QUESTION (all 5) MUST BE GENERATED DIRECTLY AND EXCLUSIVELY FROM THE UPLOADED/SELECTED STUDY LIBRARY SOURCE MATERIAL PROVIDED BELOW.
- DO NOT fall back to unrelated Mastery Configurator topics or external textbook chapters! If the Study Library notes cover Biology, History, AI, Law, or Finance, ALL questions MUST test those exact notes.
- NEVER generate vague or generic placeholder questions ("study strategies", "Stage 1 Input Preparation", etc.).

PROGRESSIVE DIFFICULTY TIER (CURRENT TARGET: LEVEL ${safeLevel}):
${tierDescription}
`;
  }

  return `
STRICT SYLLABUS BOUNDARY LOCK (NON-NEGOTIABLE):
- Stream: ${eduLevel} | Curriculum/Board: ${board} | Stage/Grade: ${gradeLevel} | Subject: ${subject} | Chapter/Topic: "${topic}"
- EVERY SINGLE QUESTION MUST BE 100% INSIDE THE OFFICIAL ${board} ${gradeLevel} ${subject} SYLLABUS FOR "${topic}".
- NEVER drift into higher grades (e.g., if Grade 10, NEVER use Grade 11/12 or university formulas/topics; if Grade 8, NEVER use Grade 10/12 topics) and NEVER drift into unrelated chapters!
- Difficulty MUST be built strictly by increasing conceptual depth, multi-step reasoning, inverse deduction, and distractor subtlety ON THIS EXACT TOPIC ("${topic}").
- NEVER generate vague, meta, or generic placeholder questions (such as questions about "study strategies", "topper habits", "Stage 1 Input Preparation", or generic systems not grounded in real facts/equations of "${topic}").

PROGRESSIVE DIFFICULTY TIER (CURRENT TARGET: LEVEL ${safeLevel}):
${tierDescription}
`;
}

function buildQuizPrompt(params) {
  const { profile, isMockMode, groupName, topic, difficulty, seed, sourceMaterial, sourceTitles = [], previousQuestions = [] } = params;
  const gradeInt = parseInt(profile.gradeLevel) || 10;
  const eduLevel = profile.educationLevel || 'School';
  const board = profile.board || 'CBSE';
  const currentLevel = Math.max(1, Number(profile.level) || 1);
  const clippedSource = sourceMaterial ? String(sourceMaterial).trim().slice(0, 60000) : '';
  const hasSourceMaterial = clippedSource.length > 0;
  const activeSourceLabel = sourceTitles.length > 0 ? sourceTitles.join(' + ') : topic;

  const focusContext = hasSourceMaterial
    ? `Level ${currentLevel} diagnostic questions grounded directly in the selected Study Library notes (${activeSourceLabel})`
    : isMockMode
    ? 'a full Mock Exam covering mixed syllabus questions'
    : profile.focus === 'Exam Pattern'
    ? 'Board Exam Pattern questions'
    : `Level ${currentLevel} diagnostic questions strictly on "${topic}"`;

  const groupContext = groupName ? `This batch is for Group: ${groupName} in a Classroom Battle.` : '';
  const difficultyContext =
    difficulty && difficulty !== 'Default'
      ? `Classroom team difficulty preference: ${difficulty}. Balance complexity accordingly while respecting Level ${currentLevel}.`
      : '';

  let educationalSettingPrompt = '';
  if (eduLevel === 'School') {
    educationalSettingPrompt = `ROLE: Senior Board Examination Author and NCERT/Curriculum Specialist for Grade ${profile.gradeLevel} (${board}).
EDUCATION STREAM: School Education (K-12), Grade ${profile.gradeLevel}, Curriculum: ${board}.
ACADEMIC BOUNDARY: ${hasSourceMaterial ? 'Match Grade ' + profile.gradeLevel + ' question clarity while deriving content strictly from the provided Study Library notes.' : `Strictly adhere to Grade ${profile.gradeLevel} ${board} textbook scope and terminology.`}`;
  } else if (eduLevel === 'College') {
    educationalSettingPrompt = `ROLE: University Professor and Senior Lecturer.
EDUCATION STREAM: College / Higher Education (${profile.gradeLevel || 'Undergraduate'}), Major: ${board}.
ACADEMIC BOUNDARY: Match undergraduate/postgraduate rigor strictly within the specified source/course topic.`;
  } else if (eduLevel === 'Competitive') {
    educationalSettingPrompt = `ROLE: Master Coach for Competitive Entrance Examinations (${board}).
EDUCATION STREAM: Competitive Exam Prep, Stage: ${profile.gradeLevel || 'Main'}.
ACADEMIC BOUNDARY: Entrance-exam analytical rigor strictly aligned to ${hasSourceMaterial ? 'the provided Study Library notes' : `${board} syllabus for "${topic}"`}.`;
  } else {
    educationalSettingPrompt = `ROLE: Expert Subject Mentor for Self-Paced Mastery (${board}).
EDUCATION STREAM: Personal Upskilling (${profile.gradeLevel || 'Self-Paced'}).
ACADEMIC BOUNDARY: Clear, accurate, practical mastery questions strictly on "${activeSourceLabel}".`;
  }

  const isTargetLanguageOtherThanEnglish =
    /tamil|hindi|telugu|kannada|malayalam|french|spanish|german/i.test(profile.subject || '') ||
    /tamil|hindi|telugu|kannada|malayalam|french|spanish|german/i.test(activeSourceLabel || '');

  const languageInstruction = isTargetLanguageOtherThanEnglish
    ? `CRITICAL LANGUAGE RULE: Write ALL question text, options, explanations, and inquiryPrompts strictly in the language of the subject (${profile.subject}). For Tamil, use Tamil script only.`
    : 'Language: English.';

  const groundedInstruction = hasSourceMaterial
    ? `PRIMARY SOURCE MATERIAL MODE (SELECTED STUDY LIBRARY NOTES — EXCLUSIVE SOURCE):
Active Study Library Titles: ${sourceTitles.length > 0 ? sourceTitles.join(', ') : activeSourceLabel}
Generate ALL 5 questions DIRECTLY AND EXCLUSIVELY from the selected Study Library text below. Do NOT rely on or fall back to any unrelated Mastery Configurator topic.
SOURCE MATERIAL:
"""
${clippedSource}
"""`
    : `CURRICULUM-BASELINE MODE (STRICT):
Generate questions anchored directly to the official ${eduLevel} ${board} Grade ${profile.gradeLevel} ${profile.subject} textbook syllabus for "${topic}".`;

  const { formatName: boardPatternFormat, systemDirective: boardPatternSystemDirective, promptDirective: boardPatternPromptDirective } =
    getBoardPatternPromptDirectives(profile.boardPattern);

  const difficultyPrompt = buildDifficultyCalibrationPrompt(
    currentLevel,
    eduLevel,
    board,
    profile.gradeLevel,
    profile.subject,
    topic,
    hasSourceMaterial,
    sourceTitles
  );

  const cleanPrev = previousQuestions
    .map((q) => String(q || '').trim())
    .filter(Boolean)
    .slice(-25);

  const antiRepeatBlock =
    cleanPrev.length > 0
      ? `PREVIOUSLY ASKED QUESTIONS IN EARLIER ROUNDS (STRICTLY DO NOT REPEAT, REWORD, OR REUSE THESE SCENARIOS):
${cleanPrev.map((q, idx) => `${idx + 1}. ${q.slice(0, 220)}`).join('\n')}
You MUST explore fresh sub-concepts, fresh numerical parameters, and deeper Level ${currentLevel} angles within "${activeSourceLabel}".`
      : '';

  const currentYear = new Date().getFullYear();

  const prompt = `
${educationalSettingPrompt}
Academic Year: ${currentYear}-${currentYear + 1}.
Subject: ${hasSourceMaterial ? activeSourceLabel : profile.subject}.
Topic: ${activeSourceLabel}.
Context: ${focusContext}.
Target Board Format: ${boardPatternFormat}.
${languageInstruction}
${groupContext}
${difficultyContext}
Progressive Level: ${isMockMode ? 'Exam Standard' : currentLevel}.
RandomSeed: ${seed}.

${groundedInstruction}
${difficultyPrompt}
${boardPatternPromptDirective}
${antiRepeatBlock}

TASK: Generate an array of EXACTLY 5 distinct, accurate questions grounded in "${activeSourceLabel}" at Progressive Level ${currentLevel} following "${boardPatternFormat}".

QUALITY CHECKLIST:
1. ${hasSourceMaterial ? `Every question MUST be directly derived from the facts, concepts, equations, or passages in the selected Study Library SOURCE MATERIAL (${activeSourceLabel}).` : `Every question MUST test real, concrete subject concepts/equations/facts from ${board} Grade ${profile.gradeLevel} ${profile.subject} — "${topic}".`}
2. ${eduLevel === 'School' && gradeInt < 6 ? 'Use age-appropriate Grade ' + gradeInt + ' vocabulary while staying accurate.' : 'Provide rigorous conceptual & quantitative clarity expected on board exams.'}
3. Never use vague abstractions or study-tip questions.
4. Provide 4 distinct, plausible options (1 correct answer and 3 realistic misconception distractors), and populate ALL required keys: 'question', 'options', 'correctIndex', 'explanation', 'stepByStepSolution', 'commonMistakeNote', 'chapterTag', and 'topicTag'.
5. In 'stepByStepSolution', write clear sequential steps (with formulas and explicit units for numericals). In 'commonMistakeNote', explicitly explain why the tempting wrong options are incorrect and what misconception traps students. In 'chapterTag', name the exact syllabus chapter/unit.
6. Output valid JSON array of 5 items ONLY.
`.trim();

  const systemInstruction = `You are a Senior Board Examination Author and Academic Curriculum Master.
Output valid JSON only — an array of exactly 5 question objects with keys: question, options, correctIndex, explanation, stepByStepSolution, commonMistakeNote, chapterTag, topicTag, id, type, contextMaterial, inquiryPrompt.

${boardPatternSystemDirective}

${difficultyPrompt}

CRITICAL: ${hasSourceMaterial ? `Ground 100% of your questions exclusively in the provided Study Library SOURCE MATERIAL (${activeSourceLabel}). Ignore any unrelated default topic.` : `Every question must stay strictly inside the ${board} Grade ${profile.gradeLevel} syllabus for "${topic}".`} Never output generic placeholders or study advice questions.
${groupName ? `This batch is specifically for Group ${groupName}. Ensure 100% uniqueness.` : ''}`;

  return { prompt, systemInstruction, boardPatternFormat };
}

export async function handleHealth(_req, res) {
  sendJson(res, 200, {
    ok: true,
    geminiConfigured: getAIKeys().length > 0,
    fallbackConfigured: getFallbackProviders().length > 0
  });
}

export async function handleGenerateQuestions(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  if (!res.writableEnded) {
    res.write(': connected\n\n');
  }

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keep-alive\n\n');
    }
  }, 4000);

  const sendEvent = (payload) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  };

  try {
    const body = await readJsonBody(req);
    const profile = body.profile || {};
    const isMockMode = Boolean(body.isMockMode);
    const groupName = body.groupName ? String(body.groupName) : undefined;
    const topic = String(body.topicOverride || profile.topic || 'General Science').trim();
    const difficulty = body.difficulty ? String(body.difficulty) : undefined;
    const seed = String(body.seedOverride || Math.random().toString(36).substring(7) + Date.now());
    const sourceMaterial = body.sourceMaterial ? String(body.sourceMaterial) : undefined;
    const sourceTitles = Array.isArray(body.sourceTitles) ? body.sourceTitles.map((t) => String(t).trim()).filter(Boolean) : [];
    const previousQuestions = Array.isArray(body.previousQuestions) ? body.previousQuestions : [];

    const { prompt, systemInstruction } = buildQuizPrompt({
      profile,
      isMockMode,
      groupName,
      topic,
      difficulty,
      seed,
      sourceMaterial,
      sourceTitles,
      previousQuestions
    });

    const deliveredQuestions = [];
    const seenNormalizedTexts = new Set(
      previousQuestions.map((q) => String(q || '').trim().toLowerCase()).filter(Boolean)
    );

    const emitQuestion = (q) => {
      if (deliveredQuestions.length >= 5) return;
      const norm = q.text.trim().toLowerCase();
      if (!norm || seenNormalizedTexts.has(norm)) return;
      seenNormalizedTexts.add(norm);
      const numbered = { ...q, id: deliveredQuestions.length + 1 };
      deliveredQuestions.push(numbered);
      sendEvent({ type: 'question', question: numbered, index: deliveredQuestions.length - 1 });
    };

    const requestStart = Date.now();
    const geminiKeys = getAIKeys();
    let lastError = null;
    let quotaError = null;
    const validGeminiKeys = [];

    const currentLevel = Math.max(1, Number(profile.level) || 1);
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];

    const questionResponseSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.NUMBER },
          type: { type: Type.STRING, description: 'MCQ, WORD_PROBLEM, CASE_STUDY, or VISUAL_ANALYSIS' },
          topicTag: { type: Type.STRING, description: 'Concise concept/sub-topic tag from the source notes or syllabus' },
          chapterTag: { type: Type.STRING, description: 'Syllabus chapter or module tag (e.g., Chapter 10: Light - Mirror Formula)' },
          contextMaterial: { type: Type.STRING, description: 'Shared stimulus paragraph/case for CASE_STUDY or apparatus/graph description for VISUAL_ANALYSIS' },
          question: { type: Type.STRING, description: 'The complete, source-grounded or syllabus-aligned question text' },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exactly 4 options with 1 correct answer and 3 realistic distractors'
          },
          correctIndex: { type: Type.NUMBER, description: '0-3' },
          explanation: { type: Type.STRING, description: 'Concise conceptual takeaway explaining why the answer is right' },
          stepByStepSolution: { type: Type.STRING, description: 'Numbered step-by-step reasoning or mathematical derivation with explicit units' },
          commonMistakeNote: { type: Type.STRING, description: 'Explains why the tempting wrong options are incorrect and the misconception to avoid' },
          inquiryPrompt: { type: Type.STRING, description: 'Follow-up diagnostic challenge' }
        },
        required: ['question', 'options', 'correctIndex', 'explanation', 'stepByStepSolution', 'commonMistakeNote', 'chapterTag', 'topicTag']
      }
    };

    for (let kIdx = 0; kIdx < geminiKeys.length && deliveredQuestions.length < 5; kIdx++) {
      if (Date.now() - requestStart > 22000) break;
      const key = geminiKeys[kIdx];
      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      let keyMarkedInvalid = false;

      for (const modelName of candidateModels) {
        if (deliveredQuestions.length >= 5 || keyMarkedInvalid) break;
        if (Date.now() - requestStart > 22000) break;

        const maxAttempts =
          kIdx === 0 && modelName === 'gemini-3.1-flash-lite'
            ? 2
            : 1;
        const attemptTimeoutMs = 15000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (Date.now() - requestStart > 22000) break;
          const tStart = Date.now();
          const abortController = new AbortController();
          let gotAnyChunk = false;
          let timedOut = false;
          const firstChunkTimer = setTimeout(() => {
            if (!gotAnyChunk) {
              timedOut = true;
              abortController.abort(new Error(`${modelName} timed out waiting for response`));
            }
          }, attemptTimeoutMs);

          try {
            sendEvent({ type: 'status', model: modelName, keyIndex: kIdx, attempt: attempt + 1 });

            const config = {
              systemInstruction,
              responseMimeType: 'application/json',
              abortSignal: abortController.signal,
              responseSchema: questionResponseSchema
            };

            if (modelName === 'gemini-4-hydrogen') {
              config.thinkingConfig = {
                thinkingLevel: ThinkingLevel.LOW
              };
            }

            const streamTimeoutPromise = new Promise((_, reject) => {
              setTimeout(() => {
                if (!gotAnyChunk) {
                  timedOut = true;
                  abortController.abort(new Error(`${modelName} timed out after 15s`));
                  reject(new Error(`${modelName} timed out after 15s`));
                }
              }, attemptTimeoutMs + 500);
            });

            const responseStream = await Promise.race([
              ai.models.generateContentStream({
                model: modelName,
                contents: prompt,
                config
              }),
              streamTimeoutPromise
            ]);

            if (!validGeminiKeys.includes(key)) validGeminiKeys.push(key);

            let accumulatedText = '';
            for await (const chunk of responseStream) {
              if (!gotAnyChunk) {
                gotAnyChunk = true;
                clearTimeout(firstChunkTimer);
              }
              accumulatedText += chunk.text || '';
              const rawObjects = extractJsonObjects(accumulatedText);
              for (const rawObj of rawObjects) {
                const formatted = formatSingleQuestion(rawObj, deliveredQuestions.length, topic);
                if (formatted) emitQuestion(formatted);
              }
            }

            if (deliveredQuestions.length < 5 && accumulatedText.trim().length > 0) {
              try {
                const cleaned = repairJson(accumulatedText);
                const parsed = JSON.parse(cleaned);
                const formattedBatch = validateAndFormatQuestions(parsed, topic);
                for (const q of formattedBatch) {
                  emitQuestion(q);
                }
              } catch {
                // Ignore final JSON parse fallback if streaming already extracted objects
              }
            }

            if (deliveredQuestions.length > 0) {
              console.log(`[Gemini] ${modelName} (key ${kIdx}) delivered ${deliveredQuestions.length} questions in ${Date.now() - tStart}ms`);
              break;
            }
          } catch (mErr) {
            lastError = mErr;
            const elapsed = Date.now() - tStart;
            const errStr = timedOut
              ? `${modelName} timed out after 15s`
              : String(mErr?.message || mErr);
            if (/api_key_invalid|api key not valid/i.test(errStr)) {
              keyMarkedInvalid = true;
              invalidGeminiKeys.add(key);
              console.info(`[Gemini] Skipping invalid key index ${kIdx}`);
            } else {
              if (!validGeminiKeys.includes(key)) validGeminiKeys.push(key);
              if (isRateLimitError(mErr)) {
                quotaError = mErr;
              }
              console.info(`[Gemini] ${modelName} (key ${kIdx}) attempt ${attempt + 1} unavailable (${elapsed}ms)`);
            }
            sendEvent({ type: 'status', model: modelName, keyIndex: kIdx, error: errStr.slice(0, 120), elapsedMs: elapsed });
            if (
              !timedOut &&
              isRateLimitError(mErr) &&
              attempt + 1 < maxAttempts &&
              Date.now() - requestStart < 18000
            ) {
              await sleep(500);
              continue;
            }
            break;
          } finally {
            clearTimeout(firstChunkTimer);
          }
        }
      }
    }

    // Secondary fallback providers (Groq / Grok) if Gemini is temporarily overloaded
    if (deliveredQuestions.length === 0) {
      const jsonShapeSpec = `REQUIRED JSON OUTPUT SHAPE (USE THESE EXACT PROPERTY NAMES):
{
  "questions": [
    {
      "id": 1,
      "type": "MCQ" | "WORD_PROBLEM" | "CASE_STUDY" | "VISUAL_ANALYSIS",
      "topicTag": "Concise sub-topic or concept tag",
      "chapterTag": "Syllabus chapter or unit tag",
      "contextMaterial": "Shared stimulus paragraph/case (60-110 words, required for CASE_STUDY/VISUAL_ANALYSIS, omit if MCQ)",
      "question": "Complete source-grounded question text",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctIndex": 0,
      "explanation": "Core conceptual explanation",
      "stepByStepSolution": "Step 1: ... Step 2: ... (include explicit units for numericals)",
      "commonMistakeNote": "Why the tempting wrong options are incorrect and the misconception to avoid",
      "inquiryPrompt": "Follow-up analytical question"
    }
  ]
}`;

      const providers = getFallbackProviders();
      for (const fallback of providers) {
        if (deliveredQuestions.length > 0) break;
        const safeFallbackUserPrompt = prompt.length > 18000 ? prompt.slice(0, 18000) : prompt;
        const fallbackSystemPrompt = `${systemInstruction}\n\n${jsonShapeSpec}\nReturn ONLY a JSON object containing a "questions" array of 5 items matching those exact keys.`;
        const fallbackUserPrompt = `${safeFallbackUserPrompt}\n\n${jsonShapeSpec}\nIMPORTANT: Return ONLY valid JSON with all 5 questions in the "questions" array using keys "id", "type", "topicTag", "chapterTag", "contextMaterial", "question", "options" (4 strings), "correctIndex" (0-3), "explanation", "stepByStepSolution", "commonMistakeNote", "inquiryPrompt".`;

        const tryEmitPayload = (rawText) => {
          let added = 0;
          const emitList = (list) => {
            const formattedBatch = validateAndFormatQuestions(list, topic);
            for (const q of formattedBatch) {
              const before = deliveredQuestions.length;
              emitQuestion(q);
              if (deliveredQuestions.length > before) added++;
            }
          };

          const tryParseObject = (candidateStr) => {
            try {
              let parsed = JSON.parse(repairJson(candidateStr));
              if (parsed && !Array.isArray(parsed)) {
                if (Array.isArray(parsed.questions)) {
                  parsed = parsed.questions;
                } else if (Array.isArray(parsed.data)) {
                  parsed = parsed.data;
                } else if (Array.isArray(parsed.items)) {
                  parsed = parsed.items;
                } else if (Array.isArray(parsed.quiz)) {
                  parsed = parsed.quiz;
                } else if (parsed.text || parsed.question) {
                  parsed = [parsed];
                } else {
                  parsed = Object.values(parsed).find((v) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') || [];
                }
              }
              if (Array.isArray(parsed) && parsed.length > 0) {
                emitList(parsed);
                return added > 0;
              }
            } catch {
              // Fall through to substring extraction
            }
            return false;
          };

          if (tryParseObject(rawText)) return added;

          const firstBrace = rawText.indexOf('{');
          const lastBrace = rawText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            if (tryParseObject(rawText.slice(firstBrace, lastBrace + 1))) return added;
          }

          const firstBracket = rawText.indexOf('[');
          const lastBracket = rawText.lastIndexOf(']');
          if (firstBracket !== -1 && lastBracket > firstBracket) {
            if (tryParseObject(rawText.slice(firstBracket, lastBracket + 1))) return added;
          }

          const scanTarget = firstBracket !== -1 ? rawText.slice(firstBracket) : rawText;
          const objs = extractJsonObjects(scanTarget);
          if (objs.length > 0) {
            emitList(objs);
          }
          return added;
        };

        if (fallback.type === 'groq') {
          let activeGroqModels = fallback.models;
          const now = Date.now();
          if (!cachedGroqModels || cachedGroqModels.apiKey !== fallback.apiKey || now - cachedGroqModels.fetchedAt > 600000) {
            try {
              const listResp = await fallback.client.models.list();
              const ids = (listResp?.data || [])
                .map((m) => String(m?.id || ''))
                .filter(
                  (id) =>
                    id &&
                    !/whisper|guard|tts|playai|distil|compound-beta|allam/i.test(id) &&
                    !unavailableFallbackModels.has(`groq:${id}`)
                );
              if (ids.length > 0) {
                const priority = [
                  (process.env.GROQ_MODEL || '').trim(),
                  'llama-3.3-70b-versatile',
                  'qwen/qwen3-32b',
                  'openai/gpt-oss-120b',
                  'meta-llama/llama-4-scout-17b-16e-instruct',
                  'meta-llama/llama-4-maverick-17b-128e-instruct',
                  'openai/gpt-oss-20b',
                  'llama-3.1-8b-instant'
                ].filter(Boolean);
                const sorted = [
                  ...priority.filter((p) => ids.includes(p)),
                  ...ids.filter((id) => !priority.includes(id))
                ];
                cachedGroqModels = { apiKey: fallback.apiKey, models: sorted.slice(0, 4), fetchedAt: now };
                activeGroqModels = cachedGroqModels.models;
              }
            } catch {
              // Keep default candidate list if models.list() is unavailable
            }
          } else if (cachedGroqModels.models.length > 0) {
            activeGroqModels = cachedGroqModels.models.filter((m) => !unavailableFallbackModels.has(`groq:${m}`));
          }

          for (const groqModel of activeGroqModels) {
            if (deliveredQuestions.length > 0) break;
            try {
              const groqResponse = await fallback.client.chat.completions.create({
                messages: [
                  { role: 'system', content: fallbackSystemPrompt },
                  { role: 'user', content: fallbackUserPrompt }
                ],
                model: groqModel,
                max_completion_tokens: 4096,
                response_format: { type: 'json_object' }
              });
              const content = groqResponse.choices[0]?.message?.content || '';
              if (content && tryEmitPayload(content) > 0) {
                console.log(`[Fallback:groq] ${groqModel} delivered ${deliveredQuestions.length} questions`);
                break;
              }
            } catch (gErr) {
              lastError = gErr;
              let gMsg = String(gErr?.message || gErr);
              const failedGen =
                gErr?.error?.error?.failed_generation ||
                gErr?.error?.failed_generation ||
                gErr?.body?.error?.failed_generation ||
                '';
              if (typeof failedGen === 'string' && failedGen.trim() && tryEmitPayload(failedGen) > 0) {
                console.log(`[Fallback:groq] ${groqModel} delivered ${deliveredQuestions.length} questions (recovered)`);
                break;
              }

              if (/401|invalid_api_key|unauthorized/i.test(gMsg)) {
                invalidFallbackKeys.add(fallback.apiKey);
                break;
              }
              if (/404|model_not_found|does not exist/i.test(gMsg)) {
                unavailableFallbackModels.add(`groq:${groqModel}`);
              } else if (/json_validate_failed|failed to (generate|validate) json/i.test(gMsg)) {
                try {
                  const plainResp = await fallback.client.chat.completions.create({
                    messages: [
                      { role: 'system', content: fallbackSystemPrompt },
                      { role: 'user', content: fallbackUserPrompt }
                    ],
                    model: groqModel,
                    max_completion_tokens: 4096
                  });
                  const plainContent = plainResp.choices[0]?.message?.content || '';
                  if (plainContent && tryEmitPayload(plainContent) > 0) {
                    console.log(`[Fallback:groq] ${groqModel} delivered ${deliveredQuestions.length} questions (plain JSON mode)`);
                    break;
                  }
                  gMsg = `Plain mode unparseable (${plainContent.length} chars): ${plainContent.slice(0, 80)}`;
                } catch (plainErr) {
                  lastError = plainErr;
                  gMsg = `Plain retry failed: ${String(plainErr?.message || plainErr)}`;
                }
              }
              sendEvent({ type: 'status', model: groqModel, provider: 'groq', error: gMsg.slice(0, 120) });
            }
          }
        } else {
          for (const grokModel of fallback.models) {
            if (deliveredQuestions.length > 0) break;
            try {
              const resp = await fetch(`${fallback.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${fallback.apiKey}`
                },
                body: JSON.stringify({
                  model: grokModel,
                  messages: [
                    { role: 'system', content: fallbackSystemPrompt },
                    { role: 'user', content: fallbackUserPrompt }
                  ],
                  response_format: { type: 'json_object' }
                })
              });
              if (!resp.ok) {
                lastError = new Error(`Grok HTTP ${resp.status}`);
                if (resp.status === 401 || resp.status === 403) {
                  invalidFallbackKeys.add(fallback.apiKey);
                  break;
                }
                if (resp.status === 400 || resp.status === 404) {
                  unavailableFallbackModels.add(`grok:${grokModel}`);
                }
                sendEvent({ type: 'status', model: grokModel, provider: 'grok', error: `HTTP ${resp.status}` });
                continue;
              }
              const data = await resp.json();
              const content = data.choices?.[0]?.message?.content || '';
              if (content && tryEmitPayload(content) > 0) {
                console.log(`[Fallback:grok] ${grokModel} delivered ${deliveredQuestions.length} questions`);
                break;
              }
            } catch (xErr) {
              lastError = xErr;
              sendEvent({ type: 'status', model: grokModel, provider: 'grok', error: String(xErr?.message || xErr).slice(0, 120) });
            }
          }
        }
      }
    }

    // Final brief non-streaming recovery attempt with explicit 25s AbortController timeout
    if (deliveredQuestions.length === 0 && validGeminiKeys.length > 0 && Date.now() - requestStart < 23000) {
      await sleep(500);
      const recAbort = new AbortController();
      const recTimer = setTimeout(() => recAbort.abort(new Error('Recovery timed out after 15s')), 15000);
      try {
        const ai = new GoogleGenAI({
          apiKey: validGeminiKeys[0],
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });
        const resp = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            abortSignal: recAbort.signal,
            responseSchema: questionResponseSchema
          }
        });
        if (resp.text) {
          const parsed = JSON.parse(repairJson(resp.text));
          const formattedBatch = validateAndFormatQuestions(parsed, topic);
          for (const q of formattedBatch) {
            emitQuestion(q);
          }
        }
      } catch (recErr) {
        if (isRateLimitError(recErr)) {
          quotaError = recErr;
        }
        lastError = recErr;
      } finally {
        clearTimeout(recTimer);
      }
    }

    if (deliveredQuestions.length === 0) {
      const hasAnyKey = geminiKeys.length > 0 || getFallbackProviders().length > 0;
      const effectiveError = quotaError || lastError;
      const errMsg = effectiveError?.message || '';
      const isAuthErr = !quotaError && validGeminiKeys.length === 0 && /api_key_invalid|api key not valid|permission_denied|403|400/i.test(errMsg);
      const isQuotaErr = Boolean(quotaError) || isRateLimitError(effectiveError) || /timed out|aborted/i.test(errMsg);

      const code = !hasAnyKey
        ? 'MISSING_API_KEY'
        : isAuthErr
        ? 'INVALID_API_KEY'
        : isQuotaErr
        ? 'RATE_LIMITED'
        : 'GENERATION_FAILED';

      const userMessage = !hasAnyKey
        ? 'No AI API key is configured on this server. Add GEMINI_API_KEY in your host/Vercel Environment Variables (or Settings > Secrets) to generate live syllabus questions, or use the Offline Practice Set below.'
        : isAuthErr
        ? 'The configured Gemini API key could not be authorized. Please verify your GEMINI_API_KEY in Environment Variables.'
        : isQuotaErr
        ? 'The AI service is temporarily experiencing high demand (503/429). Please tap Retry Live AI in a few seconds, or use the Offline Practice Set.'
        : `Could not generate questions right now (${errMsg || 'Upstream error'}). Please tap Retry or use the Offline Practice Set.`;

      sendEvent({ type: 'error', code, message: userMessage });
    } else {
      sendEvent({ type: 'done', count: deliveredQuestions.length });
    }
  } catch (err) {
    console.error('Server generation error:', err);
    sendEvent({
      type: 'error',
      code: 'SERVER_ERROR',
      message: err?.message || 'Unexpected server error while generating questions.'
    });
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) {
      res.end();
    }
  }
}

export async function handleGenerateSpeech(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const text = String(body?.text || '').trim();
    if (!text) {
      sendJson(res, 400, { error: 'Text is required' });
      return;
    }

    const geminiKeys = getAIKeys();
    for (const key of geminiKeys) {
      try {
        const ai = new GoogleGenAI({
          apiKey: key,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [{ parts: [{ text: `Read this academic content clearly and encouragingly: ${text}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
          }
        });
        const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64) {
          sendJson(res, 200, { audioBase64: base64 });
          return;
        }
      } catch (err) {
        const msg = String(err?.message || err);
        if (/api_key_invalid|api key not valid/i.test(msg)) {
          invalidGeminiKeys.add(key);
        } else {
          console.info('[TTS] Key unavailable:', msg.slice(0, 120));
        }
      }
    }

    sendJson(res, 503, { error: 'Speech synthesis unavailable' });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'TTS server error' });
  }
}
