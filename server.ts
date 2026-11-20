import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Modality, Type, ThinkingLevel } from '@google/genai';
import Groq from 'groq-sdk';
import type { UserProfile, QuizQuestion } from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolvePort = (): number => {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      const p = Number(argv[i + 1]);
      if (Number.isFinite(p) && p > 0) return p;
    } else if (arg.startsWith('--port=')) {
      const p = Number(arg.slice('--port='.length));
      if (Number.isFinite(p) && p > 0) return p;
    }
  }
  return Number(process.env.PORT) || 3000;
};

const PORT = resolvePort();
const IS_PROD = process.env.NODE_ENV === 'production';

const getAIKeys = (): string[] => {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.API_KEY,
    process.env.GEMINI_API_KEY_SECONDARY,
    process.env.GEMINI_API_KEY_TERTIARY,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY_8,
    process.env.GEMINI_API_KEY_9,
    process.env.GEMINI_API_KEY_10
  ]
    .map(k => k?.trim())
    .filter(Boolean) as string[];

  return Array.from(new Set(keys));
};

const getFallbackAI = () => {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const grokKey = (process.env.GROK_API_KEY || process.env.XAI_API_KEY || '').trim();

  if (grokKey) {
    return {
      type: 'grok' as const,
      apiKey: grokKey,
      baseURL: 'https://api.x.ai/v1',
      models: ['grok-2-1212', 'grok-beta']
    };
  }

  if (groqKey) {
    if (groqKey.startsWith('xai-')) {
      return {
        type: 'grok' as const,
        apiKey: groqKey,
        baseURL: 'https://api.x.ai/v1',
        models: ['grok-2-1212', 'grok-beta']
      };
    }

    const envModel = (process.env.GROQ_MODEL || '').trim();
    const candidateModels = [
      envModel,
      'gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'mixtral-8x7b-32768'
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx && m !== 'llama-3.1-8b-instant' && m !== 'llama3-8b-8192');

    return {
      type: 'groq' as const,
      client: new Groq({ apiKey: groqKey }),
      models: candidateModels
    };
  }

  return null;
};

const isRateLimitError = (err: any): boolean => {
  if (!err) return false;
  const status = err.status || err.statusCode || err.code || (err.error && err.error.code);
  const message = (err.message || '').toLowerCase();
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

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const repairJson = (text: string): string => {
  let cleaned = text.trim();
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?/g, '').replace(/```/g, '');
  }
  return cleaned.trim();
};

const extractJsonObjects = (text: string): any[] => {
  const results: any[] = [];
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

const formatSingleQuestion = (q: any, index: number, topic: string): QuizQuestion => {
  const rawOptions: string[] =
    Array.isArray(q.options) && q.options.length === 4
      ? q.options.map((o: unknown) => String(o))
      : ['Option A', 'Option B', 'Option C', 'Option D'];
  const rawCorrectIndex = typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < 4 ? q.correctIndex : 0;

  const isAssertionReason =
    /assertion\s*\(a\)/i.test(String(q.text || '')) &&
    /reason\s*\(r\)/i.test(String(q.text || '')) &&
    rawOptions.some(o => /both assertion/i.test(o));

  let finalOptions = rawOptions;
  let finalCorrectIndex = rawCorrectIndex;

  // Keep standard board order for Assertion-Reasoning options; shuffle all other question types
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

    finalOptions = mappedOptions.map(item => item.text);
    finalCorrectIndex = Math.max(0, mappedOptions.findIndex(item => item.isCorrect));
  }

  return {
    id: Number(q.id) || index + 1,
    type: q.type || ('MCQ' as QuizQuestion['type']),
    text: q.text && String(q.text).trim() !== '' ? String(q.text).trim() : `Analyze the concepts of ${topic} to find the solution.`,
    contextMaterial: q.contextMaterial ? String(q.contextMaterial).trim() : undefined,
    options: finalOptions,
    correctIndex: finalCorrectIndex,
    explanation: q.explanation ? String(q.explanation).trim() : 'No explanation provided.',
    inquiryPrompt: q.inquiryPrompt
      ? String(q.inquiryPrompt).trim()
      : `How would this change if we altered the initial conditions of the ${topic} problem?`
  };
};

const validateAndFormatQuestions = (questions: any[], topic: string): QuizQuestion[] => {
  if (!Array.isArray(questions)) return [];
  return questions.map((q, index) => formatSingleQuestion(q, index, topic));
};

function getBoardPatternPromptDirectives(boardPattern?: string): {
  formatName: string;
  systemDirective: string;
  promptDirective: string;
} {
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

function buildDifficultyCalibrationPrompt(
  level: number,
  eduLevel: string,
  board: string,
  gradeLevel: string,
  subject: string,
  topic: string
): string {
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

function buildQuizPrompt(params: {
  profile: UserProfile;
  isMockMode: boolean;
  groupName?: string;
  topic: string;
  difficulty?: string;
  seed: string;
  sourceMaterial?: string;
  previousQuestions?: string[];
}) {
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
    .map(q => String(q || '').trim())
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

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, geminiConfigured: getAIKeys().length > 0, fallbackConfigured: !!getFallbackAI() });
  });

  app.post('/api/generate-questions', async (req: Request, res: Response) => {
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

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const body = req.body || {};
      const profile: UserProfile = body.profile || {};
      const isMockMode = Boolean(body.isMockMode);
      const groupName = body.groupName ? String(body.groupName) : undefined;
      const topic = String(body.topicOverride || profile.topic || 'General Science').trim();
      const difficulty = body.difficulty ? String(body.difficulty) : undefined;
      const seed = String(body.seedOverride || Math.random().toString(36).substring(7) + Date.now());
      const sourceMaterial = body.sourceMaterial ? String(body.sourceMaterial) : undefined;
      const previousQuestions: string[] = Array.isArray(body.previousQuestions) ? body.previousQuestions : [];

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

      const deliveredQuestions: QuizQuestion[] = [];
      const seenNormalizedTexts = new Set<string>(
        previousQuestions.map(q => String(q || '').trim().toLowerCase()).filter(Boolean)
      );

      const emitQuestion = (q: QuizQuestion) => {
        if (deliveredQuestions.length >= 5) return;
        const norm = q.text.trim().toLowerCase();
        if (!norm || seenNormalizedTexts.has(norm)) return;
        seenNormalizedTexts.add(norm);
        const numbered: QuizQuestion = { ...q, id: deliveredQuestions.length + 1 };
        deliveredQuestions.push(numbered);
        sendEvent({ type: 'question', question: numbered, index: deliveredQuestions.length - 1 });
      };

      const geminiKeys = getAIKeys();
      let lastError: any = null;

      // Primary path: Gemini 4 Hydrogen -> Gemini 3.1 Flash Lite across available keys
      for (let kIdx = 0; kIdx < geminiKeys.length && deliveredQuestions.length < 5; kIdx++) {
        const key = geminiKeys[kIdx];
        const ai = new GoogleGenAI({
          apiKey: key,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const currentLevel = Math.max(1, Number(profile.level) || 1);
        const candidateModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];

        for (const modelName of candidateModels) {
          if (deliveredQuestions.length >= 5) break;

          for (let attempt = 0; attempt < 2; attempt++) {
            const tStart = Date.now();
            try {
              const config: Record<string, any> = {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
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
                }
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

              let accumulatedText = '';
              for await (const chunk of responseStream) {
                accumulatedText += chunk.text || '';
                const rawObjects = extractJsonObjects(accumulatedText);
                for (const rawObj of rawObjects) {
                  const formatted = formatSingleQuestion(rawObj, deliveredQuestions.length, topic);
                  emitQuestion(formatted);
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

              console.log(`[Gemini] ${modelName} attempt ${attempt + 1} delivered ${deliveredQuestions.length} questions in ${Date.now() - tStart}ms`);
              if (deliveredQuestions.length >= 5) {
                break;
              }
              if (deliveredQuestions.length > 0) {
                break;
              }
            } catch (mErr: any) {
              lastError = mErr;
              console.warn(`[Gemini] ${modelName} attempt ${attempt + 1} failed after ${Date.now() - tStart}ms:`, mErr?.message || mErr);
              if (isRateLimitError(mErr) && attempt === 0) {
                await sleep(1500);
                continue;
              }
              break;
            }
          }
        }
      }

      // Secondary path: Groq / Grok fallback if Gemini didn't deliver a full 5-question batch
      if (deliveredQuestions.length === 0) {
        const fallback = getFallbackAI();
        if (fallback) {
          const fallbackSystemPrompt = `${systemInstruction}\nReturn ONLY a JSON object with a "questions" array of 5 items.`;
          const fallbackUserPrompt = `${prompt}\n\nIMPORTANT: Return ONLY a valid JSON object: {"questions": [ ...5 items... ]}. No markdown.`;

          let content = '';
          if (fallback.type === 'groq') {
            for (const groqModel of fallback.models) {
              try {
                const groqResponse = await fallback.client.chat.completions.create({
                  messages: [
                    { role: 'system', content: fallbackSystemPrompt },
                    { role: 'user', content: fallbackUserPrompt }
                  ],
                  model: groqModel,
                  response_format: { type: 'json_object' }
                });
                content = groqResponse.choices[0]?.message?.content || '';
                if (content && content.trim() !== '{}' && content.trim() !== '[]') break;
              } catch (gErr: any) {
                lastError = gErr;
                console.warn(`[Groq] ${groqModel} failed:`, gErr?.message || gErr);
              }
            }
          } else {
            for (const grokModel of fallback.models) {
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
                  continue;
                }
                const data = (await resp.json()) as any;
                content = data.choices?.[0]?.message?.content || '';
                if (content && content.trim() !== '{}' && content.trim() !== '[]') break;
              } catch (xErr: any) {
                lastError = xErr;
                console.warn(`[Grok] ${grokModel} failed:`, xErr?.message || xErr);
              }
            }
          }

          if (content) {
            try {
              let parsed: any = JSON.parse(repairJson(content));
              if (!Array.isArray(parsed)) {
                parsed = parsed.questions || parsed.data || parsed.items || parsed.quiz || Object.values(parsed).find(v => Array.isArray(v)) || [];
              }
              const formattedBatch = validateAndFormatQuestions(parsed, topic);
              for (const q of formattedBatch) {
                emitQuestion(q);
              }
            } catch (parseErr: any) {
              lastError = parseErr;
            }
          }
        }
      }

      if (deliveredQuestions.length === 0) {
        const hasAnyKey = geminiKeys.length > 0 || !!getFallbackAI();
        const errMsg = lastError?.message || '';
        const isAuthErr = /api_key_invalid|permission_denied|403|400/i.test(errMsg);
        const isQuotaErr = isRateLimitError(lastError);

        const code = !hasAnyKey
          ? 'MISSING_API_KEY'
          : isAuthErr
          ? 'INVALID_API_KEY'
          : isQuotaErr
          ? 'RATE_LIMITED'
          : 'GENERATION_FAILED';

        const userMessage = !hasAnyKey
          ? 'No AI API key is configured in Settings > Secrets. Please add GEMINI_API_KEY to generate live syllabus questions, or use the Offline Practice Set below.'
          : isAuthErr
          ? 'The configured Gemini API key could not be authorized. Please verify your API key in Settings > Secrets.'
          : isQuotaErr
          ? 'The AI service is temporarily busy (rate limit reached). Please wait a moment and tap Retry, or use the Offline Practice Set.'
          : `Could not generate questions right now (${errMsg || 'Upstream error'}). Please tap Retry or use the Offline Practice Set.`;

        sendEvent({ type: 'error', code, message: userMessage });
      } else {
        sendEvent({ type: 'done', count: deliveredQuestions.length });
      }
    } catch (err: any) {
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
  });

  app.post('/api/generate-speech', async (req: Request, res: Response) => {
    try {
      const text = String(req.body?.text || '').trim();
      if (!text) {
        res.status(400).json({ error: 'Text is required' });
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
            res.json({ audioBase64: base64 });
            return;
          }
        } catch (err: any) {
          console.warn('[TTS] Key failed:', err?.message || err);
        }
      }

      res.status(503).json({ error: 'Speech synthesis unavailable' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'TTS server error' });
    }
  });

  const serveStaticDist = () => {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  };

  if (!IS_PROD) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    } catch {
      serveStaticDist();
    }
  } else {
    serveStaticDist();
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ScholarEarn server running on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`);
  });
}

createApp();
