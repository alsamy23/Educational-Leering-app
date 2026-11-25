import { QuizQuestion, UserProfile, QuestionType, DifficultyLevel } from '../types';

export class QuizGenerationError extends Error {
  code: string;
  constructor(message: string, code = 'GENERATION_FAILED') {
    super(message);
    this.name = 'QuizGenerationError';
    this.code = code;
  }
}

let currentAudioSource: AudioBufferSourceNode | null = null;
let audioContext: AudioContext | null = null;

export const stopAudio = () => {
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
    } catch {
      // Ignore stop error if already stopped
    }
    currentAudioSource = null;
  }
};

const shuffleQuestionOptions = (q: QuizQuestion): QuizQuestion => {
  const isAssertionReason =
    /assertion/i.test(String(q.type || '')) ||
    (/assertion\s*\(?a\)?/i.test(q.text) &&
      /reason\s*\(?r\)?/i.test(q.text) &&
      q.options.some(o => /both\s+(assertion|a)\s+and\s+(reason|r)/i.test(o)));

  if (isAssertionReason) return q;

  const mapped = q.options.map((text, idx) => ({
    text,
    isCorrect: idx === q.correctIndex
  }));

  for (let i = mapped.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = mapped[i];
    mapped[i] = mapped[j];
    mapped[j] = tmp;
  }

  return {
    ...q,
    options: mapped.map(m => m.text),
    correctIndex: Math.max(0, mapped.findIndex(m => m.isCorrect))
  };
};

export const generateOfflineQuizQuestions = (
  profile: UserProfile,
  topic: string,
  sourceMaterial?: string
): QuizQuestion[] => {
  const subject = (profile.subject || '').toLowerCase();
  const topicLower = (topic || '').toLowerCase();
  const level = Math.max(1, Number(profile.level) || 1);
  const isTamil = /tamil/i.test(subject) || /tamil/i.test(topicLower);
  const isAssertionMode = /assertion/i.test(profile.boardPattern || '');

  const enrichQuestion = (q: QuizQuestion): QuizQuestion => ({
    ...q,
    question: q.question || q.text,
    topicTag: q.topicTag || topic,
    chapterTag: q.chapterTag || `${profile.subject || 'Syllabus'} · ${topic}`,
    stepByStepSolution:
      q.stepByStepSolution ||
      `Step 1: Identify the key concept in ${topic}.\nStep 2: ${q.explanation}`,
    commonMistakeNote:
      q.commonMistakeNote ||
      'Other options swap signs, skip unit conversions, or confuse related textbook rules—verify against the core definition.'
  });

  if (isTamil) {
    return [
      {
        id: 1,
        type: QuestionType.MCQ,
        text: `விடைத்தேர்க: "${topic}" என்ற தலைப்பில் உள்ள முக்கியக் கருத்து எது?`,
        options: [
          `அடிப்படை விதிகள் மற்றும் கோட்பாடுகள்`,
          `அன்றாட வாழ்வில் அதன் பயன்கள்`,
          `வரலாற்றுப் பின்னணி மற்றும் வளர்ச்சி`,
          `மேலே குறிப்பிட்டுள்ள அனைத்தும்`
        ],
        correctIndex: 3,
        explanation: `${topic} என்பது தமிழ் இலக்கியம் மற்றும் இலக்கணத்தில் மிக முக்கியப் பங்கு வகிக்கிறது. இதன் விதிகள் மற்றும் கோட்பாடுகள் நம் வாழ்விற்கு வழிகாட்டுகின்றன.`,
        inquiryPrompt: `இதைப் பற்றி மேலும் சிந்திக்க: இக்கருத்து தற்காலச் சமூகத்திற்கு எவ்வாறு பொருந்தும்?`
      },
      {
        id: 2,
        type: QuestionType.WORD_PROBLEM,
        text: `கீழ்க்கண்டவற்றுள் எது "${topic}" தொடர்பானது அல்ல?`,
        options: [
          `செம்மொழிப் பண்புகள்`,
          `இலக்கிய நயம் மற்றும் உத்திகள்`,
          `தகாத தர்க்க முறைகள்`,
          `இலக்கண விதிகள்`
        ],
        correctIndex: 2,
        explanation: `${topic} என்பது தமிழ் மொழி அமைப்பில் நேர்மறையான இலக்கண மற்றும் இலக்கியப் பண்புகளைக் குறிக்கும்.`,
        inquiryPrompt: `இதன் உண்மைத் தன்மையை ஆராய்க.`
      },
      {
        id: 3,
        type: QuestionType.CASE_STUDY,
        contextMaterial: `ஒரு மாணவர் தமிழ் இலக்கியத்தில் "${topic}" பற்றிய கட்டுரையை எழுதுகிறார். அவர் அதன் முக்கியப் பண்புகளையும் அதன் வரலாற்றுத் தாக்கத்தையும் விவரிக்கும் போது, சில இலக்கணப் பிழைகளைச் செய்கிறார்.`,
        text: `அந்த மாணவரின் கட்டுரையை மேம்படுத்த நீங்கள் என்ன ஆலோசனைக் கூறுவீர்கள்?`,
        options: [
          `இலக்கண விதிகளுடன் இலக்கிய நயத்தையும் இணைத்துக் கற்க வேண்டும்`,
          `கட்டுரையை முழுமையாக ஆங்கிலத்தில் எழுத வேண்டும்`,
          `கருத்துகளைக் குறைத்து பக்கங்களை மட்டும் அதிகரிக்க வேண்டும்`,
          `எந்த மாற்றமும் தேவையில்லை`
        ],
        correctIndex: 0,
        explanation: `தமிழ் இலக்கியத்தில் கருத்துச் செறிவோடு இலக்கணப் பிழையின்றி எழுதுவதே கட்டுரையைச் சிறந்ததாக மாற்றும்.`,
        inquiryPrompt: `இலக்கணப் பிழைகளைத் தவிர்க்கும் வழிகள் யாவை?`
      },
      {
        id: 4,
        type: QuestionType.VISUAL_ANALYSIS,
        contextMaterial: `தமிழ் மொழியின் வரலாற்று வரைபடம் ஒன்றை உற்றுநோக்குகிறோம். அதில் "${topic}" என்ற பகுதியானது தமிழ் மொழியின் தொன்மை மற்றும் தொடர்ச்சியை விளக்கும் மையப் புள்ளியாகக் காட்டப்பட்டுள்ளது.`,
        text: `இந்த வரைபடம் உணர்த்தும் மையக் கருத்து என்ன?`,
        options: [
          `தமிழ் மொழி காலந்தோறும் வளர்ந்து வரும் ஒரு சமுதாய மொழி`,
          `தமிழ் மொழியின் சொற்கள் மிகக் குறைவு`,
          `இது பிற மொழிகளைச் சார்ந்துள்ளது`,
          `இது தற்காலத்தில் வழக்கழிந்து வருகிறது`
        ],
        correctIndex: 0,
        explanation: `வரலாற்று வரைபடம் தமிழின் தொன்மை மற்றும் அது காலம் கடந்து நிலைத்து நிற்கும் பேராற்றலைக் காட்டுகிறது.`,
        inquiryPrompt: `தமிழின் தொடர்ச்சியை நிலைநிறுத்த நாம் என்ன செய்ய வேண்டும்?`
      },
      {
        id: 5,
        type: QuestionType.MCQ,
        text: `பின்வருவனவற்றுள் எது "${topic}" கோட்பாட்டின் முக்கியப் பயன்?`,
        options: [
          `மொழி ஆற்றல் மற்றும் படைப்பாற்றலை வளர்த்தல்`,
          `கருத்துகளைப் பகுத்தறிதல்`,
          `அறிவியல் மற்றும் கணித சிந்தனையைத் தூண்டுதல்`,
          `மேலே உள்ள அனைத்தும்`
        ],
        correctIndex: 3,
        explanation: `${topic} பற்றிய முறையான புரிதல் மொழித் திறனையும், பகுத்தறிவையும், இதர அறிவியல் சிந்தனைகளையும் ஒருசேர வளர்க்க உதவுகிறது.`,
        inquiryPrompt: `உமது சொந்தப் பயில்வு முறையை விவரி.`
      }
    ].map(q => enrichQuestion(shuffleQuestionOptions(q)));
  }

  // Built-in curriculum banks with level-scaled variations
  const lightBankLv1: QuizQuestion[] = [
    {
      id: 1,
      type: QuestionType.MCQ,
      text: 'A convex lens has a focal length of 15 cm. If an object is placed at 30 cm in front of the lens, where is the image formed?',
      options: [
        'At 30 cm on the other side, real, inverted, and same size',
        'At 15 cm on the same side, virtual and erect',
        'At infinity on the other side, real and inverted',
        'At 10 cm on the other side, virtual and erect'
      ],
      correctIndex: 0,
      explanation: 'Since u = -30 cm = -2f, the object is at 2F1, so a convex lens forms a real, inverted image of the same size at 2F2 (30 cm on the opposite side).',
      inquiryPrompt: 'What happens to the image nature if the object is moved to 10 cm from this lens?'
    },
    {
      id: 2,
      type: QuestionType.WORD_PROBLEM,
      text: 'If the magnification produced by a spherical mirror is -1, what does this indicate about the nature and size of the image?',
      options: [
        'The image is real, inverted, and of the same size as the object',
        'The image is virtual, erect, and magnified',
        'The image is real, inverted, and diminished',
        'The image is virtual, erect, and of the same size as the object'
      ],
      correctIndex: 0,
      explanation: 'Negative magnification (m < 0) means the image is real and inverted; |m| = 1 means image height equals object height.',
      inquiryPrompt: 'Which mirror and object position produce a magnification of -1?'
    },
    {
      id: 3,
      type: QuestionType.CASE_STUDY,
      contextMaterial: 'A student shines a ray of light from air into a rectangular glass slab at an angle of incidence of 45 degrees. Inside the glass, the ray bends towards the normal, and upon exiting back into air, the emergent ray is parallel to the incident ray but shifted sideways.',
      text: 'Why does the light bend towards the normal when entering glass, and what is the sideways shift called?',
      options: [
        'Speed of light decreases in glass; lateral displacement',
        'Speed of light increases in glass; vertical shift',
        'Total internal reflection inside glass; normal shift',
        'Absorption of photons by glass; dispersion'
      ],
      correctIndex: 0,
      explanation: 'Glass is optically denser than air, so light slows down and bends towards the normal. The perpendicular shift between incident and emergent rays is lateral displacement.',
      inquiryPrompt: 'How does lateral displacement change if slab thickness is doubled?'
    },
    {
      id: 4,
      type: QuestionType.MCQ,
      text: 'Which mirror is always used as a rear-view mirror in vehicles and why?',
      options: [
        'Convex mirror, because it gives an erect, diminished image with a wider field of view',
        'Concave mirror, because it produces a magnified inverted image',
        'Plane mirror, because it converges light to a focus',
        'Concave mirror, because it always forms a virtual diminished image'
      ],
      correctIndex: 0,
      explanation: 'A convex mirror always produces an erect, diminished image regardless of distance and curves outward, providing a much wider field of view.',
      inquiryPrompt: 'What would a driver see if a concave mirror were used instead as a rear-view mirror?'
    },
    {
      id: 5,
      type: QuestionType.MCQ,
      text: 'The refractive index of diamond is 2.42. What is the physical meaning of this statement?',
      options: [
        'The speed of light in vacuum is 2.42 times the speed of light in diamond',
        'The speed of light in diamond is 2.42 times faster than in air',
        'Diamond reflects 2.42% of incident light',
        'The critical angle of diamond is 24.2 degrees'
      ],
      correctIndex: 0,
      explanation: 'Absolute refractive index n = c / v, meaning the ratio of speed of light in vacuum (c) to speed of light in diamond (v) is 2.42.',
      inquiryPrompt: 'Between water (n=1.33), crown glass (n=1.52), and diamond (n=2.42), in which medium does light travel fastest?'
    }
  ];

  const lightBankAdvanced: QuizQuestion[] = [
    {
      id: 1,
      type: QuestionType.WORD_PROBLEM,
      text: 'An object 4 cm tall is placed 25 cm in front of a concave mirror of focal length 15 cm. At what distance from the mirror should a screen be placed to obtain a sharp image, and what is its height?',
      options: [
        '37.5 cm in front of the mirror; image height = -6 cm (inverted)',
        '18.75 cm in front of the mirror; image height = +3 cm (erect)',
        '75 cm behind the mirror; image height = -12 cm (inverted)',
        '37.5 cm behind the mirror; image height = +6 cm (erect)'
      ],
      correctIndex: 0,
      explanation: 'By New Cartesian Sign Convention: u = -25 cm, f = -15 cm. Using 1/v + 1/u = 1/f => 1/v = -1/15 - (-1/25) = (-5 + 3)/75 = -2/75 => v = -37.5 cm. Magnification m = -v/u = -(-37.5)/(-25) = -1.5, so h_i = -1.5 * 4 = -6 cm.',
      inquiryPrompt: 'If the object is moved 15 cm closer to the mirror (to u = -10 cm), can a screen capture the image?'
    },
    {
      id: 2,
      type: QuestionType.WORD_PROBLEM,
      text: 'Two thin lenses of power +3.5 D and -1.5 D are placed in contact. What is the focal length and nature of the combined lens system?',
      options: [
        '+50 cm (+0.5 m); converging (convex) lens',
        '-50 cm (-0.5 m); diverging (concave) lens',
        '+20 cm (+0.2 m); converging (convex) lens',
        '+200 cm (+2.0 m); diverging (concave) lens'
      ],
      correctIndex: 0,
      explanation: 'Net power P = P1 + P2 = +3.5 D + (-1.5 D) = +2.0 D. Focal length f = 1/P = 1/2.0 m = +0.5 m = +50 cm. Positive focal length indicates a converging lens.',
      inquiryPrompt: 'What power of a third lens placed in contact would turn this combination into a glass plate of zero net power?'
    },
    {
      id: 3,
      type: QuestionType.CASE_STUDY,
      contextMaterial: 'Light enters from medium A into medium B with an angle of incidence of 60 degrees and angle of refraction of 30 degrees. Next, light passes from medium B into medium C where the refractive index of C with respect to B is 0.8.',
      text: 'Using Snell’s law and relative refractive index relations, how does the speed of light compare across media A, B, and C?',
      options: [
        'v_A > v_C > v_B (light is slowest in medium B)',
        'v_B > v_A > v_C (light is fastest in medium B)',
        'v_C > v_B > v_A (light slows down continuously)',
        'v_A = v_B = v_C (speed remains constant across media)'
      ],
      correctIndex: 0,
      explanation: 'n_BA = sin(60)/sin(30) = (sqrt(3)/2)/(1/2) = 1.732 > 1, so medium B is denser than A (v_B < v_A). Also n_CB = 0.8 < 1, meaning C is rarer than B (v_C > v_B), and n_CA = n_CB * n_BA = 0.8 * 1.732 = 1.386 > 1, so C is still denser than A (v_A > v_C > v_B).',
      inquiryPrompt: 'If medium A is air, which pair of media would show light bending away from the normal when crossing from B to C?'
    },
    {
      id: 4,
      type: QuestionType.VISUAL_ANALYSIS,
      contextMaterial: 'A ray of light passes undeviated through point O on the principal axis of a thin spherical lens. Another ray parallel to the principal axis after refraction appears to diverge from a point 20 cm in front of the lens on the same side as the incoming light.',
      text: 'Identify the lens type, the point O, and the power of this lens.',
      options: [
        'Concave lens; Optical Centre; Power = -5.0 D',
        'Convex lens; Principal Focus; Power = +5.0 D',
        'Concave lens; Centre of Curvature; Power = -0.05 D',
        'Convex lens; Optical Centre; Power = +20 D'
      ],
      correctIndex: 0,
      explanation: 'Rays parallel to the principal axis diverge as if coming from the principal focus on the incoming side in a concave lens. Point O where rays pass undeviated is the optical centre. With f = -20 cm = -0.2 m, P = 1/(-0.2) = -5.0 D.',
      inquiryPrompt: 'Where would an image form if an object is placed 20 cm in front of this concave lens?'
    },
    {
      id: 5,
      type: QuestionType.MCQ,
      text: 'A student obtains a blurred image of a distant illuminated tower on a screen using a convex lens. To obtain a sharper image of a closer candle flame kept at 2f without moving the lens, in which direction should the screen be moved?',
      options: [
        'Away from the lens, because moving the object closer increases the image distance',
        'Towards the lens, because the focal length decreases for nearby objects',
        'Keep the screen at F, since all images form at the focus',
        'Move the screen behind the candle flame'
      ],
      correctIndex: 0,
      explanation: 'A distant object forms its image at F (v = f). When the object is at 2F, the real image forms at 2F (v = 2f), which is farther from the lens than F. Thus the screen must move away from the lens.',
      inquiryPrompt: 'Does the focal length of a glass lens change when the candle moves closer?'
    }
  ];

  const assertionBank: QuizQuestion[] = [
    {
      id: 1,
      type: QuestionType.MCQ,
      text: `Assertion (A): In "${topic}", core textbook laws govern how measurable quantities respond when initial parameters are varied.\nReason (R): Understanding the exact mathematical or conceptual relationship prevents sign and unit errors in board evaluations.`,
      options: [
        'Both Assertion (A) and Reason (R) are true and Reason (R) is the correct explanation of Assertion (A).',
        'Both Assertion (A) and Reason (R) are true but Reason (R) is NOT the correct explanation of Assertion (A).',
        'Assertion (A) is true but Reason (R) is false.',
        'Assertion (A) is false but Reason (R) is true.'
      ],
      correctIndex: 1,
      explanation: 'Both statements are true, though Reason (R) describes exam accuracy rather than why the underlying law governs the quantities.',
      inquiryPrompt: `Write one specific equation or principle from "${topic}" and state its SI units.`
    }
  ];

  let chosenBank: QuizQuestion[] | null = null;
  if (topicLower.includes('light') || topicLower.includes('reflect') || topicLower.includes('refract') || topicLower.includes('lens') || topicLower.includes('optics')) {
    chosenBank = level >= 2 ? lightBankAdvanced : lightBankLv1;
  }

  if (chosenBank) {
    if (isAssertionMode) {
      return chosenBank.map((q, idx) => enrichQuestion({
        id: idx + 1,
        type: QuestionType.MCQ,
        text: `Assertion (A): ${q.explanation.split('.')[0]}.\nReason (R): ${q.text}`,
        options: assertionBank[0].options,
        correctIndex: 0,
        explanation: q.explanation,
        inquiryPrompt: q.inquiryPrompt
      }));
    }
    return chosenBank.map(q => enrichQuestion(shuffleQuestionOptions(q)));
  }

  // Extract meaningful excerpts from user-uploaded sourceMaterial if provided
  if (sourceMaterial && sourceMaterial.trim().length > 40) {
    const sentences = sourceMaterial
      .split(/[.!?\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 30 && s.length < 220);

    if (sentences.length >= 3) {
      const extracted: QuizQuestion[] = sentences.slice(0, 5).map((sentence, idx) => enrichQuestion({
        id: idx + 1,
        type: idx === 2 ? QuestionType.CASE_STUDY : QuestionType.MCQ,
        contextMaterial: `Textbook Excerpt (${topic}): "${sentence}."`,
        text: isAssertionMode
          ? `Assertion (A): ${sentence}.\nReason (R): This statement directly describes a core principle of ${topic}.`
          : `Based on the textbook excerpt above for "${topic}" (Level ${level}), which interpretation is accurate?`,
        options: isAssertionMode
          ? assertionBank[0].options
          : [
              `It accurately states a core principle or mechanism from "${topic}"`,
              `It contradicts the standard laws established in "${topic}"`,
              `It applies only outside the scope of Grade ${profile.gradeLevel || '10'} "${topic}"`,
              `It indicates that no measurable variables exist in "${topic}"`
            ],
        correctIndex: 0,
        explanation: `Derived directly from your uploaded material on "${topic}": "${sentence}."`,
        inquiryPrompt: `How does this excerpt connect to numerical or board problems in "${topic}"?`
      }));
      return isAssertionMode ? extracted : extracted.map(q => enrichQuestion(shuffleQuestionOptions(q)));
    }
  }

  // Last-resort minimal offline bank when no AI key and no built-in match exist
  return lightBankLv1.map(q => enrichQuestion(shuffleQuestionOptions(q)));
};

const GENERATION_TIMEOUT_MS = 25000;

export const generateQuizQuestions = async (
  profile: UserProfile,
  isMockMode = false,
  groupName?: string,
  topicOverride?: string,
  difficulty?: DifficultyLevel,
  _retryCount = 0,
  seedOverride?: string,
  sourceMaterial?: string,
  onQuestionGenerated?: (question: QuizQuestion, index: number) => void,
  previousQuestions: string[] = [],
  sourceTitles: string[] = [],
  externalSignal?: AbortSignal
): Promise<QuizQuestion[]> => {
  const controller = new AbortController();
  let timedOut = false;
  let cancelledByUser = false;

  const onExternalAbort = () => {
    cancelledByUser = true;
    controller.abort(new Error('Diagnostic cancelled by user'));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      throw new QuizGenerationError('Diagnostic cancelled by user.', 'CANCELLED');
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('Generation timed out after 25 seconds'));
      reject(
        new QuizGenerationError(
          'Live question generation timed out after 25 seconds. Please tap Retry to try again, or use the Offline Practice Set.',
          'TIMEOUT'
        )
      );
    }, GENERATION_TIMEOUT_MS);
  });

  const delivered: QuizQuestion[] = [];
  const seenTexts = new Set<string>();
  let streamError: QuizGenerationError | null = null;

  const runStream = async (): Promise<QuizQuestion[]> => {
    const response = await fetch('/api/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        profile,
        isMockMode,
        groupName,
        topicOverride,
        difficulty,
        seedOverride,
        sourceMaterial,
        sourceTitles,
        previousQuestions
      })
    });

    if (!response.ok || !response.body) {
      const msg =
        response.status === 404
          ? 'The Live AI server endpoint (/api/generate-questions) was not found (HTTP 404). Make sure the app is running with its full-stack Node server (re-open or re-deploy the app), or use the Offline Practice Set below.'
          : `Server returned HTTP ${response.status} while generating questions.`;
      throw new QuizGenerationError(msg, response.status === 404 ? 'BACKEND_NOT_FOUND' : 'SERVER_HTTP_ERROR');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processSseLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) return;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) return;

      try {
        const evt = JSON.parse(jsonStr);
        if (evt.type === 'question' && evt.question) {
          const rawQ = evt.question;
          const q: QuizQuestion = {
            ...rawQ,
            text: rawQ.text || rawQ.question || '',
            question: rawQ.question || rawQ.text || '',
            chapterTag: rawQ.chapterTag || rawQ.topicTag || topicOverride || profile.topic,
            stepByStepSolution: rawQ.stepByStepSolution || rawQ.explanation || '',
            commonMistakeNote: rawQ.commonMistakeNote || ''
          };
          const norm = q.text.trim().toLowerCase();
          if (norm && !seenTexts.has(norm)) {
            seenTexts.add(norm);
            delivered.push(q);
            if (onQuestionGenerated) {
              onQuestionGenerated(q, delivered.length - 1);
            }
          }
        } else if (evt.type === 'error') {
          streamError = new QuizGenerationError(
            evt.message || 'AI failed to generate questions.',
            evt.code || 'GENERATION_FAILED'
          );
        }
      } catch {
        // Ignore malformed SSE chunk line
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const rawLine of lines) {
          processSseLine(rawLine);
        }
        if (streamError && delivered.length === 0) {
          throw streamError;
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const rawLine of buffer.split('\n')) {
          processSseLine(rawLine);
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Ignore stream cancel error
      }
    }

    if (delivered.length === 0) {
      if (streamError) throw streamError;
      throw new QuizGenerationError('No questions were returned by the AI service.', 'EMPTY_RESPONSE');
    }

    return delivered;
  };

  try {
    return await Promise.race([runStream(), timeoutPromise]);
  } catch (err: any) {
    if (cancelledByUser) {
      throw new QuizGenerationError('Diagnostic cancelled by user.', 'CANCELLED');
    }
    if (timedOut) {
      if (delivered.length > 0) {
        return delivered;
      }
      throw new QuizGenerationError(
        'Live question generation timed out after 25 seconds. Please tap Retry to try again, or use the Offline Practice Set.',
        'TIMEOUT'
      );
    }
    if (err instanceof QuizGenerationError) {
      throw err;
    }
    if (err?.name === 'AbortError') {
      throw new QuizGenerationError(
        'Live question generation timed out after 25 seconds. Please tap Retry to try again, or use the Offline Practice Set.',
        'TIMEOUT'
      );
    }
    throw new QuizGenerationError(
      err?.message || 'Unable to connect to the AI question generator. Please tap Retry.',
      'NETWORK_ERROR'
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  if (!text.trim()) return new ArrayBuffer(0);
  try {
    const resp = await fetch('/api/generate-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!resp.ok) return new ArrayBuffer(0);
    const data = await resp.json();
    const base64 = data?.audioBase64;
    if (!base64) return new ArrayBuffer(0);

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return new ArrayBuffer(0);
  }
};

let currentUtterance: SpeechSynthesisUtterance | null = null;

export const speakTextLocal = (text: string, onStart?: () => void, onEnd?: () => void): Promise<void> => {
  return new Promise(resolve => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const cleanedText = text.replace(/[*_`#]/g, '').trim();
    if (!cleanedText) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    currentUtterance = utterance;

    const setVoiceAndSpeak = () => {
      const voices = window.speechSynthesis.getVoices();

      let chosenVoice = voices.find(
        v =>
          (v.lang.toLowerCase().includes('en-in') || v.lang.toLowerCase().includes('en_in')) &&
          (v.name.toLowerCase().includes('male') ||
            v.name.toLowerCase().includes('ravi') ||
            v.name.toLowerCase().includes('dilip') ||
            v.name.toLowerCase().includes('guy') ||
            v.name.toLowerCase().includes('prakash'))
      );

      if (!chosenVoice) {
        chosenVoice = voices.find(v => v.lang.toLowerCase().includes('en-in') || v.lang.toLowerCase().includes('en_in'));
      }
      if (!chosenVoice) {
        chosenVoice = voices.find(v => v.lang.toLowerCase().includes('hi-in') || v.lang.toLowerCase().includes('hi_in'));
      }
      if (!chosenVoice) {
        chosenVoice = voices.find(
          v =>
            v.lang.toLowerCase().startsWith('en') &&
            (v.name.toLowerCase().includes('male') ||
              v.name.toLowerCase().includes('guy') ||
              v.name.toLowerCase().includes('david') ||
              v.name.toLowerCase().includes('george'))
        );
      }
      if (!chosenVoice) {
        chosenVoice = voices.find(v => v.lang.toLowerCase().startsWith('en'));
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }

      utterance.pitch = 0.82;
      utterance.rate = 0.88;

      utterance.onstart = () => {
        if (onStart) onStart();
      };

      utterance.onend = () => {
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        if (onEnd) onEnd();
        resolve();
      };

      utterance.onerror = err => {
        console.error('SpeechSynthesis error:', err);
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        if (onEnd) onEnd();
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    };

    const initialVoices = window.speechSynthesis.getVoices();
    if (initialVoices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        setVoiceAndSpeak();
      };
      setTimeout(() => {
        setVoiceAndSpeak();
      }, 500);
    } else {
      setVoiceAndSpeak();
    }
  });
};

export const playAudio = async (buffer: ArrayBuffer) => {
  if (buffer.byteLength === 0) return;
  try {
    stopAudio();
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContext.state === 'suspended') await audioContext.resume();

    const data = new Int16Array(buffer);
    const audioBuffer = audioContext.createBuffer(1, data.length, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) channel[i] = data[i] / 32768.0;

    currentAudioSource = audioContext.createBufferSource();
    currentAudioSource.buffer = audioBuffer;
    currentAudioSource.playbackRate.value = 1.35;
    currentAudioSource.connect(audioContext.destination);
    currentAudioSource.onended = () => {
      currentAudioSource = null;
    };
    currentAudioSource.start();
  } catch (e) {
    console.error('Audio Playback Error', e);
  }
};