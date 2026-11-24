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
            if (parsed && typeof parsed === 'object' && parsed.text && Array.isArray(parsed.options)) {
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
    /assertion\s*\(a\)/i.test(rawText) &&
    /reason\s*\(r\)/i.test(rawText) &&
    rawOptions.some((o) => /both assertion/i.test(o));

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
    contextMaterial: q.contextMaterial ? String(q.contextMaterial).trim() : undefined,
    options: finalOptions,
    correctIndex: finalCorrectIndex,
    explanation: q.explanation ? String(q.explanation).trim() : 'Review the core syllabus principle for this step.',
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
- YOU ARE STRICTLY FORBIDDEN FROM GENERATING ISOLATED, SHORT STANDALONE MCQs WITHOUT CONTEXT.
- EVERY SINGLE QUESTION (all 5 questions) MUST be of type 'CASE_STUDY'.
- The 'contextMaterial' field MUST contain a detailed, realistic paragraph (60 to 120 words) describing a practical scenario, scientific experiment, laboratory setup, historical excerpt, case study, or real-world problem strictly from the topic.
- The 'text' field MUST pose an analytical question directly derived from and requiring critical reasoning based on the 'contextMaterial'.
- The 4 options must be thoughtful analytical deductions, calculations, or evaluations testing deep conceptual comprehension.
- 'explanation' MUST reference specific facts and data from the provided case scenario.`,
      promptDirective: `MANDATORY FORMAT ENFORCEMENT (CASE STUDY / PASSAGE-BASED ONLY):
- Selected Board Format: CASE STUDY & PASSAGE-BASED (Strict).
- YOU MUST PROVIDE RICH CONTEXTUAL SCENARIOS (60-120 words) in 'contextMaterial' for ALL 5 questions (type: 'CASE_STUDY').
- The question text and options must test deep analytical deduction from the case passage.
- DO NOT generate bare MCQs without context scenarios.`
    };
  }

  if (/competency|numerical|application/i.test(normalized)) {
    return {
      formatName: 'Competency & Application Focus',
      systemDirective: `MANDATORY SYSTEM DIRECTIVE - STRICT COMPETENCY & NUMERICAL APPLICATION FORMAT:
- The user has explicitly selected the 'Competency & Application' Board Exam format.
- YOU ARE STRICTLY FORBIDDEN FROM GENERATING ROTE-MEMORIZATION OR DEFINITION-ONLY MCQs.
- All 5 questions must be higher-order competency assessments (types: 'WORD_PROBLEM' or 'VISUAL_ANALYSIS').
- Focus on practical real-world applications, quantitative calculations, experimental variable analysis, and graph/data interpretation strictly within the topic syllabus.
- If testing visual or experimental concepts, describe the experimental apparatus or graph setup in 'contextMaterial'.
- 'explanation' MUST include complete step-by-step mathematical calculations or rigorous logical derivations.`,
      promptDirective: `MANDATORY FORMAT ENFORCEMENT (COMPETENCY & NUMERICAL APPLICATION):
- Selected Board Format: COMPETENCY & NUMERICAL APPLICATION (Strict).
- You MUST generate analytical problem-solving and application questions with multi-step derivations (type: 'WORD_PROBLEM' or 'VISUAL_ANALYSIS').
- Avoid simple rote recall questions.`
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
  2. Question 3: Assertion-Reasoning Question formatted with Assertion (A) & Reason (R) and the 4 standard options.
  3. Question 4: Competency / Real-World Applied Word Problem (type: 'WORD_PROBLEM')
  4. Question 5: Case Study / Passage-Based Question with a rich scenario in 'contextMaterial' (type: 'CASE_STUDY').`,
    promptDirective: `MANDATORY FORMAT ENFORCEMENT (MIXED BOARD PATTERN):
- Selected Board Format: MIXED BOARD PATTERN.
- Generate an authentic distribution: 2 MCQs, 1 Assertion-Reasoning, 1 Applied Problem, and 1 Case Study.`
  };
}

function buildDifficultyCalibrationPrompt(level, eduLevel, board, gradeLevel, subject, topic) {
  const safeLevel = Math.max(1, Number(level) || 1);

  const tierDescription =
    safeLevel === 1
      ? `LEVEL 1 — FOUNDATIONAL SYLLABUS MASTERY:
- Focus on core textbook definitions, fundamental laws, standard formulas, direct conceptual checks, and single-step numericals from "${topic}".
- Questions should test clear, accurate understanding of basic principles without trick traps.`
      : safeLevel === 2
      ? `LEVEL 2 — APPLIED CONCEPTUAL UNDERSTANDING:
- Step up to 2-step applications, unit conversions, sign-convention checks, comparing two textbook cases/outcomes, and spotting common student misconceptions within "${topic}".
- Every question must require reasoning beyond pure definition recall.`
      : safeLevel === 3
      ? `LEVEL 3 — OFFICIAL BOARD EXAM RIGOR:
- Match tough official ${board} ${gradeLevel} Board Examination questions for "${topic}".
- Include multi-step calculations, experimental/diagrammatic reasoning, nuanced Assertion-Reasoning traps, and data-driven Case Studies strictly from the "${topic}" chapter.`
      : safeLevel === 4
      ? `LEVEL 4 — BOARD EXEMPLAR & HOTS (HIGHER-ORDER THINKING SKILLS):
- Combine 2 or more sub-concepts from the SAME chapter "${topic}" (e.g., formula chaining, boundary/limiting cases, comparative proportionality, experimental error diagnosis).
- Require careful multi-step analytical deduction rather than straightforward substitution.
- STAY STRICTLY INSIDE ${board} ${gradeLevel} "${topic}" SYLLABUS!`
      : `LEVEL ${safeLevel} — TOPPER / EXEMPLAR MASTERY WITHIN SYLLABUS:
- Deliver maximum analytical rigor WITHIN the exact ${board} ${gradeLevel} ${subject} syllabus for "${topic}".
- Use inverse problems (e.g., given the observed final behavior/output, deduce the unknown initial setup/parameter), multi-variable comparisons, ratio derivations, and subtle textbook edge cases.
- DO NOT break grade boundaries or import higher-grade topics to fake difficulty!`;

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
  const { profile, isMockMode, groupName, topic, difficulty, seed, sourceMaterial, previousQuestions = [] } = params;
  const gradeInt = parseInt(profile.gradeLevel) || 10;
  const eduLevel = profile.educationLevel || 'School';
  const board = profile.board || 'CBSE';
  const currentLevel = Math.max(1, Number(profile.level) || 1);

  const focusContext = isMockMode
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
ACADEMIC BOUNDARY: Strictly adhere to Grade ${profile.gradeLevel} ${board} textbook scope and terminology.`;
  } else if (eduLevel === 'College') {
    educationalSettingPrompt = `ROLE: University Professor and Senior Lecturer.
EDUCATION STREAM: College / Higher Education (${profile.gradeLevel || 'Undergraduate'}), Major: ${board}.
ACADEMIC BOUNDARY: Match undergraduate/postgraduate rigor strictly within the specified course topic.`;
  } else if (eduLevel === 'Competitive') {
    educationalSettingPrompt = `ROLE: Master Coach for Competitive Entrance Examinations (${board}).
EDUCATION STREAM: Competitive Exam Prep, Stage: ${profile.gradeLevel || 'Main'}.
ACADEMIC BOUNDARY: Entrance-exam analytical rigor strictly aligned to ${board} syllabus for "${topic}".`;
  } else {
    educationalSettingPrompt = `ROLE: Expert Subject Mentor for Self-Paced Mastery (${board}).
EDUCATION STREAM: Personal Upskilling (${profile.gradeLevel || 'Self-Paced'}).
ACADEMIC BOUNDARY: Clear, accurate, practical mastery questions strictly on "${topic}".`;
  }

  const isTargetLanguageOtherThanEnglish =
    /tamil|hindi|telugu|kannada|malayalam|french|spanish|german/i.test(profile.subject || '') ||
    /tamil|hindi|telugu|kannada|malayalam|french|spanish|german/i.test(topic || '');

  const languageInstruction = isTargetLanguageOtherThanEnglish
    ? `CRITICAL LANGUAGE RULE: Write ALL question text, options, explanations, and inquiryPrompts strictly in the language of the subject (${profile.subject}). For Tamil, use Tamil script only.`
    : 'Language: English.';

  const clippedSource = sourceMaterial ? sourceMaterial.slice(0, 24000) : '';
  const groundedInstruction = clippedSource
    ? `SOURCE-GROUNDED MODE (STRICT):
Generate questions derived EXCLUSIVELY from the textbook/curriculum excerpt below, formatted to match ${eduLevel} Grade ${profile.gradeLevel} (${board}) standards.
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
    topic
  );

  const cleanPrev = previousQuestions
    .map((q) => String(q || '').trim())
    .filter(Boolean)
    .slice(-25);

  const antiRepeatBlock =
    cleanPrev.length > 0
      ? `PREVIOUSLY ASKED QUESTIONS IN EARLIER ROUNDS (STRICTLY DO NOT REPEAT, REWORD, OR REUSE THESE SCENARIOS):
${cleanPrev.map((q, idx) => `${idx + 1}. ${q.slice(0, 220)}`).join('\n')}
You MUST explore fresh sub-concepts, fresh numerical parameters, and deeper Level ${currentLevel} angles within "${topic}".`
      : '';

  const currentYear = new Date().getFullYear();

  const prompt = `
${educationalSettingPrompt}
Academic Year: ${currentYear}-${currentYear + 1}.
Subject: ${profile.subject}.
Topic: ${topic}.
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

TASK: Generate an array of EXACTLY 5 distinct, syllabus-accurate questions for "${topic}" at Progressive Level ${currentLevel} following "${boardPatternFormat}".

QUALITY CHECKLIST:
1. Every question MUST test real, concrete subject concepts/equations/facts from ${board} Grade ${profile.gradeLevel} ${profile.subject} — "${topic}".
2. ${eduLevel === 'School' && gradeInt < 6 ? 'Use age-appropriate Grade ' + gradeInt + ' vocabulary while staying accurate to the syllabus.' : 'Provide rigorous conceptual & quantitative clarity expected on board exams.'}
3. Never use vague abstractions or study-tip questions.
4. Provide 4 distinct, plausible options (1 correct answer and 3 realistic textbook-misconception distractors).
5. Provide a detailed step-by-step 'explanation' and a thought-provoking 'inquiryPrompt'.
6. Output valid JSON array of 5 items ONLY.
`.trim();

  const systemInstruction = `You are a Senior Board Examination Author and Academic Curriculum Master for ${board} Grade ${profile.gradeLevel} ${profile.subject}.
Output valid JSON only — an array of exactly 5 question objects.

${boardPatternSystemDirective}

${difficultyPrompt}

CRITICAL: Every question must stay strictly inside the ${board} Grade ${profile.gradeLevel} syllabus for "${topic}". Never output generic placeholders, study advice questions, or out-of-syllabus higher-grade material.
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
    const previousQuestions = Array.isArray(body.previousQuestions) ? body.previousQuestions : [];

    const { prompt, systemInstruction } = buildQuizPrompt({
      profile,
      isMockMode,
      groupName,
      topic,
      difficulty,
      seed,
      sourceMaterial,
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
          contextMaterial: { type: Type.STRING, description: 'Scenario text for CASE_STUDY or VISUAL_ANALYSIS' },
          text: { type: Type.STRING, description: 'The complete, syllabus-aligned question text' },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exactly 4 options with 1 correct answer and 3 realistic distractors'
          },
          correctIndex: { type: Type.NUMBER, description: '0-3' },
          explanation: { type: Type.STRING, description: 'Step-by-step syllabus explanation' },
          inquiryPrompt: { type: Type.STRING, description: 'Follow-up diagnostic challenge' }
        },
        required: ['id', 'type', 'text', 'options', 'correctIndex', 'explanation', 'inquiryPrompt']
      }
    };

    for (let kIdx = 0; kIdx < geminiKeys.length && deliveredQuestions.length < 5; kIdx++) {
      const key = geminiKeys[kIdx];
      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      let keyMarkedInvalid = false;

      for (const modelName of candidateModels) {
        if (deliveredQuestions.length >= 5 || keyMarkedInvalid) break;

        const maxAttempts = kIdx === 0 && modelName === 'gemini-3.1-flash-lite' ? 2 : 1;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const tStart = Date.now();
          const abortController = new AbortController();
          let gotAnyChunk = false;
          const firstChunkTimer = setTimeout(() => {
            if (!gotAnyChunk) {
              abortController.abort(new Error(`${modelName} timed out after 12s waiting for first chunk`));
            }
          }, 12000);

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
                thinkingLevel: currentLevel <= 2 ? ThinkingLevel.LOW : ThinkingLevel.MEDIUM
              };
            }

            const responseStream = await ai.models.generateContentStream({
              model: modelName,
              contents: prompt,
              config
            });

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
            const errStr = String(mErr?.message || mErr);
            if (/api_key_invalid|api key not valid/i.test(errStr)) {
              keyMarkedInvalid = true;
              invalidGeminiKeys.add(key);
              console.info(`[Gemini] Skipping invalid key index ${kIdx}`);
            } else {
              if (!validGeminiKeys.includes(key)) validGeminiKeys.push(key);
              if (isRateLimitError(mErr)) {
                quotaError = mErr;
              }
              console.info(`[Gemini] ${modelName} (key ${kIdx}) attempt ${attempt + 1} unavailable (${Date.now() - tStart}ms)`);
            }
            sendEvent({ type: 'status', model: modelName, keyIndex: kIdx, error: errStr.slice(0, 120), elapsedMs: Date.now() - tStart });
            if (isRateLimitError(mErr) && attempt + 1 < maxAttempts) {
              await sleep(600);
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
      "contextMaterial": "Scenario/experiment paragraph (60-120 words, required for CASE_STUDY/VISUAL_ANALYSIS, omit if MCQ)",
      "text": "Complete syllabus question text",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctIndex": 0,
      "explanation": "Step-by-step syllabus explanation",
      "inquiryPrompt": "Follow-up analytical question"
    }
  ]
}`;

      const providers = getFallbackProviders();
      for (const fallback of providers) {
        if (deliveredQuestions.length > 0) break;
        const fallbackSystemPrompt = `${systemInstruction}\n\n${jsonShapeSpec}\nReturn ONLY a JSON object containing a "questions" array of 5 items matching those exact keys.`;
        const fallbackUserPrompt = `${prompt}\n\n${jsonShapeSpec}\nIMPORTANT: Return ONLY valid JSON with all 5 syllabus questions in the "questions" array using keys "id", "type", "contextMaterial", "text", "options" (4 strings), "correctIndex" (0-3), "explanation", "inquiryPrompt".`;

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

    // Final brief non-streaming recovery attempt on valid Gemini key after transient 503/429
    if (deliveredQuestions.length === 0 && validGeminiKeys.length > 0 && quotaError) {
      await sleep(1200);
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
        quotaError = recErr;
      }
    }

    if (deliveredQuestions.length === 0) {
      const hasAnyKey = geminiKeys.length > 0 || getFallbackProviders().length > 0;
      const effectiveError = quotaError || lastError;
      const errMsg = effectiveError?.message || '';
      const isAuthErr = !quotaError && validGeminiKeys.length === 0 && /api_key_invalid|api key not valid|permission_denied|403|400/i.test(errMsg);
      const isQuotaErr = Boolean(quotaError) || isRateLimitError(effectiveError);

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
