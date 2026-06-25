import { GoogleGenAI, Modality, Type, ThinkingLevel } from "@google/genai";
import Groq from "groq-sdk";
import { QuizQuestion, UserProfile, QuestionType, StudyFocus, DifficultyLevel } from '../types';

let currentKeyIndex = Math.floor(Math.random() * 10); // Start at random to spread initial load

const getAIKeys = () => {
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
  ].map(k => k?.trim()).filter(Boolean) as string[];
  
  // Deduplicate keys
  return Array.from(new Set(keys));
};

const getAI = () => {
  const keys = getAIKeys();
  if (keys.length === 0) throw new Error("API_KEY missing. Please ensure GEMINI_API_KEY is set in the environment.");
  
  // Round-robin rotation
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  return new GoogleGenAI({ apiKey: keys[currentKeyIndex] });
};

const getAIWithKey = (key: string) => new GoogleGenAI({ apiKey: key });

const isRateLimitError = (err: any): boolean => {
  if (!err) return false;
  const status = err.status || err.statusCode || err.code || (err.error && err.error.code);
  const message = (err.message || "").toLowerCase();
  const statusString = String(status);
  
  return (
    status === 429 ||
    statusString.includes("429") ||
    status === 503 ||
    statusString.includes("503") ||
    message.includes("quota") ||
    message.includes("limit exceeded") ||
    message.includes("resource_exhausted") ||
    message.includes("too many requests") ||
    message.includes("429")
  );
};

const getFallbackAI = () => {
  const groqKey = (process.env.GROQ_API_KEY || "").trim();
  const grokKey = (process.env.GROK_API_KEY || process.env.XAI_API_KEY || "").trim();

  if (grokKey) {
    return {
      type: 'grok' as const,
      apiKey: grokKey,
      baseURL: "https://api.x.ai/v1",
      model: 'grok-2-1212'
    };
  } else if (groqKey) {
    // If they supplied an xAI key inside GROQ_API_KEY (users sometimes do this)
    if (groqKey.startsWith("xai-")) {
      return {
        type: 'grok' as const,
        apiKey: groqKey,
        baseURL: "https://api.x.ai/v1",
        model: 'grok-2-1212'
      };
    }
    return {
      type: 'groq' as const,
      client: new Groq({ apiKey: groqKey, dangerouslyAllowBrowser: true }),
      model: 'llama-3.3-70b-versatile'
    };
  }
  return null;
};

const getGroq = () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new Groq({ apiKey, dangerouslyAllowBrowser: true });
};

const repairJson = (text: string): string => {
  let cleaned = text.trim();
  // Remove markdown code blocks if present
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?/g, '').replace(/```/g, '');
  }
  return cleaned.trim();
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const generateOfflineQuizQuestions = (
  profile: UserProfile,
  topic: string,
  sourceMaterial?: string
): QuizQuestion[] => {
  console.log("Generating offline questions for topic:", topic);
  const subject = (profile.subject || "").toLowerCase();
  const topicLower = (topic || "").toLowerCase();
  const isTamil = /tamil/i.test(subject) || /tamil/i.test(topicLower);

  let sentences: string[] = [];
  if (sourceMaterial) {
    sentences = sourceMaterial
      .split(/[.!?\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 25 && s.length < 200);
  }

  const questions: QuizQuestion[] = [];
  const capTopic = topic.charAt(0).toUpperCase() + topic.slice(1);

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
        explanation: `${topic} என்பது தமிழ் மொழி அமைப்பில் நேர்மறையான இலக்கண மற்றும் இலக்கியப் பண்புகளைக் குறிக்கும். தகாத தர்க்க முறைகள் இதனுடன் தொடர்பற்றவை.`,
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
    ];
  }

  if (sentences.length >= 3) {
    const s1 = sentences[0];
    const s2 = sentences[1];
    const s3 = sentences[2];
    
    questions.push({
      id: 1,
      type: QuestionType.MCQ,
      contextMaterial: `Based on the provided syllabus material: "${s1}"`,
      text: `According to the educational guidelines, which statement best aligns with the core thesis discussed above?`,
      options: [
        `It represents a foundational mechanism within the study of ${topic}.`,
        `It indicates that the primary variables are static and do not interact.`,
        `It is largely obsolete and replaced by alternative methods.`,
        `It has no direct application in modern diagnostic environments.`
      ],
      correctIndex: 0,
      explanation: `The material states: "${s1}". This confirms its fundamental role and modern relevance in our analysis of ${topic}.`,
      inquiryPrompt: `How would you explain this core concept to a peer using a real-world analogy?`
    });

    questions.push({
      id: 2,
      type: QuestionType.WORD_PROBLEM,
      contextMaterial: `Consider the following excerpt: "${s2}"`,
      text: `In a practical scenario applying this principle to ${topic}, if we increase the scope or intensity by 50%, what is the expected outcome?`,
      options: [
        `Proportional advancement and optimized feedback loops`,
        `Immediate system failure and resource exhaustion`,
        `No change in the final outcomes or diagnostic accuracy`,
        `A complete reversal of the underlying mechanics`
      ],
      correctIndex: 0,
      explanation: `The concept defined as "${s2}" suggests that increasing input parameters leads to an active scale of outcomes, enhancing the study of ${topic}.`,
      inquiryPrompt: `What variables would you need to keep constant to test this hypothesis?`
    });

    questions.push({
      id: 3,
      type: QuestionType.CASE_STUDY,
      contextMaterial: `Case Study Excerpt: "${s3}"
      
An academic group is attempting to implement this specific concept of ${topic} in their diagnostic laboratory under a tight deadline. They notice that minor deviations in initial parameters lead to compound variations.`,
      text: `What is the most methodical approach for the group to stabilize their diagnostic results?`,
      options: [
        `Formulate standardized controls and document all system deviations`,
        `Disregard the source material and build an entirely new framework`,
        `Increase the test timer limit and accept high margin of error`,
        `Rely purely on mock parameters without empirical verification`
      ],
      correctIndex: 0,
      explanation: `The case study highlights that standardizing controls and systematic documentation is critical to manage compound variations when analyzing "${s3}".`,
      inquiryPrompt: `What is the risk of not documenting minor parameter variations in this study?`
    });
  }

  if (questions.length < 1) {
    questions.push({
      id: 1,
      type: QuestionType.MCQ,
      text: `Which of the following best defines the primary concept of ${capTopic}?`,
      options: [
        `The systematic study and execution of its core principles and application frameworks.`,
        `A secondary, non-essential variable that has no direct influence on performance.`,
        `An outdated methodology used only in ancient educational structures.`,
        `A theoretical model that cannot be tested empirically.`
      ],
      correctIndex: 0,
      explanation: `${capTopic} represents a fundamental concept in this subject. Understanding its core framework is essential for higher-level problem solving.`,
      inquiryPrompt: `Can you identify a real-life example where this primary definition of ${capTopic} is directly visible?`
    });
  }

  if (questions.length < 2) {
    questions.push({
      id: 2,
      type: QuestionType.WORD_PROBLEM,
      text: `A diagnostic study is evaluating ${capTopic} under controlled parameters. If the target system achieves an initial efficiency rate of 75%, and a new parameter enhances it by a factor of 1.2x, what is the new efficiency?`,
      options: [
        `90%`,
        `85%`,
        `80%`,
        `95%`
      ],
      correctIndex: 0,
      explanation: `Calculating the efficiency enhancement: 75% * 1.2 = 90%. This reflects the highly responsive nature of the system.`,
      inquiryPrompt: `What limiting factors might prevent this system from reaching 100% efficiency?`
    });
  }

  if (questions.length < 3) {
    questions.push({
      id: 3,
      type: QuestionType.CASE_STUDY,
      contextMaterial: `A specialized taskforce is investigating the practical implications of ${capTopic} in modern high-performance environments. While traditional approaches suggest a linear correlation, recent data implies a non-linear threshold behavior.`,
      text: `Based on this scenario, how should the taskforce adapt their strategic framework to study ${capTopic}?`,
      options: [
        `Integrate non-linear modeling and analyze boundary conditions`,
        `Disregard the recent data as an anomaly and keep linear models`,
        `Scale down the project scope to avoid complex variables`,
        `Suspend the diagnostics until complete perfect data is available`
      ],
      correctIndex: 0,
      explanation: `To achieve pristine accuracy under non-linear threshold behaviors, the taskforce must integrate non-linear models and pay close attention to boundary conditions.`,
      inquiryPrompt: `How would you design a simple test to find the exact threshold where the behavior becomes non-linear?`
    });
  }

  if (questions.length < 4) {
    questions.push({
      id: 4,
      type: QuestionType.VISUAL_ANALYSIS,
      contextMaterial: `Imagine a conceptual flowchart mapping the relationships between the subsystems of ${capTopic}. A central node, labeled 'Core Dynamics', connects directly to three peripheral nodes: 'Structural Inputs', 'Process Controls', and 'Feedback Optimization'.`,
      text: `If a bottleneck occurs in the 'Process Controls' node, which subsystem is most likely to suffer immediate performance degradation?`,
      options: [
        `Feedback Optimization`,
        `Structural Inputs`,
        `The parent subject entirely`,
        `None of the subsystems are affected`
      ],
      correctIndex: 0,
      explanation: `Since 'Feedback Optimization' relies directly on the outputs processed by 'Process Controls', any bottleneck in control immediately cascades to the optimization phase.`,
      inquiryPrompt: `How could you introduce a redundant loop to bypass a potential bottleneck in 'Process Controls'?`
    });
  }

  if (questions.length < 5) {
    questions.push({
      id: 5,
      type: QuestionType.MCQ,
      text: `In the context of competitive diagnostics, which approach yields the most reliable results when analyzing ${capTopic}?`,
      options: [
        `A multi-perspective analytical approach combining theory with empirical test cases.`,
        `Relying entirely on historical memorization without concept application.`,
        `Avoiding difficult questions and focusing only on standard baseline cases.`,
        `Bypassing structured analysis to use intuitive guessing.`
      ],
      correctIndex: 0,
      explanation: `Prone to high accuracy, a multi-perspective analytical approach ensures that both theoretical foundations and active empirical results are fully verified.`,
      inquiryPrompt: `What is one scenario where theory might temporarily diverge from empirical results in ${capTopic}?`
    });
  }

  return questions;
};

let currentAudioSource: AudioBufferSourceNode | null = null;
let audioContext: AudioContext | null = null;

export const stopAudio = () => {
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
    } catch (e) {}
    currentAudioSource = null;
  }
};

export const generateQuizQuestions = async (
  profile: UserProfile, 
  isMockMode: boolean = false, 
  groupName?: string,
  topicOverride?: string,
  difficulty?: DifficultyLevel,
  retryCount = 0,
  seedOverride?: string,
  sourceMaterial?: string
): Promise<QuizQuestion[]> => {
  const gradeInt = parseInt(profile.gradeLevel) || 10;
  const topic = topicOverride || profile.topic;
  
  let focusContext = "";
  if (isMockMode) {
    focusContext = "a full Mock Exam covering mixed topics and patterns";
  } else {
    focusContext = profile.focus === StudyFocus.SYLLABUS 
      ? `Level ${profile.level} coverage of the syllabus` 
      : profile.focus === StudyFocus.PATTERN 
      ? "Board Exam Pattern questions" 
      : `Level ${profile.level} questions on: ${topic}`;
  }

  const groupContext = groupName ? `This is for Group: ${groupName} in a Classroom Battle.` : "";
  const difficultyContext = difficulty && difficulty !== DifficultyLevel.DEFAULT 
    ? `The difficulty level for this group is: ${difficulty}. Adjust question complexity accordingly.` 
    : "";
  const eduLevel = profile.educationLevel || 'School';
  let educationalSettingPrompt = "";
  
  if (eduLevel === 'School') {
    educationalSettingPrompt = `
      ROLE: Act as an Expert school curriculum designer and board examination author for Grade ${profile.gradeLevel}.
      EDUCATION STREAM: School Education (K-12).
      GRADE TARGET: Grade ${profile.gradeLevel}.
      CURRICULUM/BOARD: ${profile.board || "General Board"}.
      ACADEMIC LEVEL: Focus on grade-appropriate curriculum pillars, core textbooks syllabus, and official blueprint model.
    `;
  } else if (eduLevel === 'College') {
    educationalSettingPrompt = `
      ROLE: Act as an elite University Professor, Academic Dean, and Senior College Lecturer.
      EDUCATION STREAM: Higher Education / College Level.
      YEAR/SEMESTER: ${profile.gradeLevel || "General Year"}.
      DEGREE STREAM & MAJOR: ${profile.board || "General Major / Arts & Sciences"}.
      ACADEMIC LEVEL: College level rigor. Focus on theoretical depth, research application, critical analytical thinking, and complex academic insights. Ensure content matches undergraduate or postgraduate examination level.
    `;
  } else if (eduLevel === 'Competitive') {
    educationalSettingPrompt = `
      ROLE: Act as a master Trainer for Competitive Entrance Exams and Professional Certification Panels.
      EDUCATION STREAM: Competitive Exam Preparation & Career Certifications.
      TARGET EXAM / BOARD: ${profile.board || "General Competitive Exam"}.
      ACADEMIC LEVEL: Tough entrance assessment standards with a focus on core exam patterns (analytical, logical, and concept integration). Focus on maximizing score diagnostics, trick questions, and solving professional-grade problems.
    `;
  } else {
    educationalSettingPrompt = `
      ROLE: Act as an Expert Personal Mentor and Subject Matter Genius.
      EDUCATION STREAM: Personal Learning, Lifelong Education & Custom Upskilling.
      TARGET LEVEL: ${profile.board || "General / Adaptive"}.
      ACADEMIC LEVEL: Customized individual development, clear analogies, active practice, and concept reinforcement. Ideal for self-learners, hobbyists, or professionals upskilling.
    `;
  }

  // Check for non-English subject/topic (e.g. Tamil)
  const isTargetLanguageOtherThanEnglish = /tamil|hindi|telugu|kannada|malayalam|french|spanish|german/i.test(profile.subject) || /tamil|hindi|telugu|kannada|malayalam|french|spanish|german/i.test(topic);
  const languageInstruction = isTargetLanguageOtherThanEnglish 
    ? `CRITICAL LANGUAGE RULE: The entire question text, options, explanations, and prompts MUST be written in the language of the subject (${profile.subject}). If the subject is Tamil, use Tamil script. NEVER switch to English for the question content.` 
    : "Language: English.";

  // Randomizer or Seeded
  const seed = seedOverride || (Math.random().toString(36).substring(7) + Date.now());
  const currentYear = new Date().getFullYear();

  const groundedInstruction = sourceMaterial 
    ? `SOURCE-GROUNDED MODE (STRICT):
    A specific curriculum segment or textbook material has been provided below. 
    1. Your primary task is to generate questions derived EXCLUSIVELY from this source material.
    2. However, you MUST still respect the Educational Setting / Stream (${eduLevel}), target year/academic stage (${profile.gradeLevel}), and standards (${profile.board || "General"}).
    3. Ensure the vocabulary and complexity are completely appropriate for ${profile.gradeLevel}.
    
    SOURCE MATERIAL:
    """
    ${sourceMaterial}
    """
    ` 
    : `CURRICULUM-BASELINE MODE (STRICT):
    No private source material was provided. 
    1. You MUST generate questions based on the official curriculum/course standards for ${eduLevel} - ${profile.board || "General"}.
    2. Focus on the core pillars of the syllabus/topic for the subject "${profile.subject}".
    3. Refer to standard academic structures matching ${profile.gradeLevel}.`;

  const prompt = `
  ${educationalSettingPrompt}
  Current Academic Year: ${currentYear}-${currentYear + 1} (Targeting ${currentYear + 1} Exams).
  Subject: ${profile.subject}.
  Topic: ${topic}.
  Context: ${focusContext}.
  ${languageInstruction}
  ${groupContext}
  ${difficultyContext}
  Current Level: ${isMockMode ? "Exam Standard" : profile.level}.
  RandomSeed: ${seed}.
  
  ${groundedInstruction}
  
  TASK: Generate exactly 5 questions for this Batch. 
  
  PEDAGOGICAL GOAL (EXAM EXCELLENCE):
  - PRIMARY OBJECTIVE: ${sourceMaterial ? "Synthesize the source material into high-quality assessments aligned with exam patterns." : "Strictly follow curriculum and textbook standards to ensure exam readiness."}
  - Test foundational understanding, conceptual clarity, and the ability to apply the specific topic.
  - Questions must mirror the complexity (MCQs, Case Studies, etc.) of actual board or exam patterns.
  - ${eduLevel === 'School' && gradeInt < 6 
      ? "For PRIMARY SCHOOL: Focus on simplified core curriculum pillars. Ensure questions reflect standard educational early-years patterns." 
      : "Focus on analytical rigor. Every question must evaluate syllabus-specific mastery."}
  - Provide an 'inquiryPrompt' as a "Diagnostic Challenge" to help students identify areas for further study.
  
  MODE-SPECIFIC GUIDANCE:
  - INDIVIDUAL CHALLENGE: Focus on incremental mastery. Questions should help the student identify gaps in their understanding of the ${topic} syllabus.
  - CLASSROOM BATTLE: Questions should be competitive and balanced, designed to test the group's collective knowledge of core curriculum points under pressure.
  
  CRITICAL ACCORDING TO CURRICULUM & UNIQUENESS (CLASSROOM ANTI-REPEAT PROTOCOL):
  - Ensure 100% adherence strictly to the official curriculum for this level. No generic questions. Use exact curriculum terminology.
  - To absolutely prevent repeating questions between different groups, you MUST use the RandomSeed (${seed}) to deeply alter the sub-topic focus, problem formats, and numerical values. 
  - Group ${groupName || "N/A"} must receive an entirely distinct set of 5 questions than any other group. DO NOT recycle common starter questions.
  
  QUESTION TYPES DISTRIBUTION:
  - Match question complexity and types with the target educational tier (${eduLevel}). For advanced levels (College, Competitive), include Case Studies and complex situations.
  - Include at least 1 'CASE_STUDY' and 1 'VISUAL_ANALYSIS' if possible.
  
  GUIDELINES:
  - CASE_STUDY: Provide a short paragraph (50-100 words) in 'contextMaterial' that the student must analyze to answer the question.
  - VISUAL_ANALYSIS: Describe a diagram, graph, or physical setup in 'contextMaterial' (e.g., "A circuit diagram shows two resistors in parallel...") and ask a question based on it. (Do NOT provide images, purely textual visual descriptions).
  - The 'explanation' must be detailed.
  - The 'text' field MUST contain the actual question and MUST NOT be empty.`;

  try {
    // Try Gemini first with rotation
    const geminiKeys = getAIKeys();

    let lastError: any = null;

    for (const key of geminiKeys) {
      try {
        console.log(`Attempting question generation with Gemini key ending in ...${key.slice(-5)}`);
        const ai = getAIWithKey(key);
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            systemInstruction: `You are an AI Tutor. Output valid JSON only. Focus on Case Studies for higher grades. ${groupName ? `This batch is specifically for Group ${groupName}. Ensure uniqueness.` : ''}`,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.NUMBER },
                  type: { type: Type.STRING, description: "MCQ, WORD_PROBLEM, CASE_STUDY, or VISUAL_ANALYSIS" },
                  contextMaterial: { type: Type.STRING, description: "Scenario text for CASE_STUDY or VISUAL_ANALYSIS" },
                  text: { type: Type.STRING, description: "The question text. Must be a complete, challenging question." },
                  options: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "Exactly 4 options"
                  },
                  correctIndex: { type: Type.NUMBER, description: "0-3" },
                  explanation: { type: Type.STRING, description: "Detailed explanation of the correct answer" },
                  inquiryPrompt: { type: Type.STRING, description: "A follow-up challenge or inquiry for the student" }
                },
                required: ["id", "type", "text", "options", "correctIndex", "explanation", "inquiryPrompt"]
              }
            },
            temperature: 0.2
          }
        });

        const cleaned = repairJson(response.text || "[]");
        const parsed = JSON.parse(cleaned);
        return validateAndFormatQuestions(parsed, topic);
      } catch (geminiErr: any) {
        lastError = geminiErr;
        console.warn(`Gemini key failed: ${geminiErr.message || geminiErr}. Trying next key...`);
        continue;
      }
    }

    // If all Gemini keys failed or we hit a rate limit
    try {
      if (lastError && isRateLimitError(lastError) && retryCount < 2) {
        console.warn(`All Gemini keys rate limited. Retrying in ${2000 * (retryCount + 1)}ms...`);
        await sleep(2000 * (retryCount + 1));
        return generateQuizQuestions(profile, isMockMode, groupName, topicOverride, difficulty, retryCount + 1, seed, sourceMaterial);
      }

      console.warn("Gemini rotation exhausted. Attempting Groq/Grok fallback...", lastError);
      const fallback = getFallbackAI();
      if (!fallback) {
        console.warn("No Groq/Grok fallback configured. Falling back to offline question generator.");
        return generateOfflineQuizQuestions(profile, topic, sourceMaterial);
      }

      console.log(`Calling Fallback AI (${fallback.type})...`);
      const systemPrompt = `You are an AI Tutor. Output valid JSON only. Return a JSON array of 5 questions. ${groupName ? `This batch is for Group ${groupName}.` : ''}`;
      const userPrompt = prompt + "\n\nIMPORTANT: Return ONLY a raw JSON array of 5 items. No markdown wrapper, no extra explanations.";
      
      let content = "[]";
      if (fallback.type === 'groq') {
        const groqResponse = await fallback.client.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          model: fallback.model,
          response_format: { type: "json_object" }
        });
        content = groqResponse.choices[0]?.message?.content || "[]";
      } else {
        // xAI Grok (direct API call via fetch)
        const response = await fetch(`${fallback.baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${fallback.apiKey}`
          },
          body: JSON.stringify({
            model: fallback.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Grok API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        content = data.choices[0]?.message?.content || "[]";
      }

      let parsed = JSON.parse(repairJson(content));
      if (!Array.isArray(parsed) && parsed.questions) parsed = parsed.questions;
      if (!Array.isArray(parsed) && parsed.data) parsed = parsed.data;
      if (!Array.isArray(parsed) && parsed.items) parsed = parsed.items;
      if (!Array.isArray(parsed) && parsed.quiz) parsed = parsed.quiz;
      if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
        const foundArray = Object.values(parsed).find(val => Array.isArray(val));
        if (foundArray) {
          parsed = foundArray;
        }
      }
      
      return validateAndFormatQuestions(parsed, topic);
    } catch (fallbackErr: any) {
      console.warn("Groq/Grok fallback failed, activating offline question generator:", fallbackErr);
      return generateOfflineQuizQuestions(profile, topic, sourceMaterial);
    }
  } catch (err: any) {
    console.error("Generation Error (falling back to offline generator):", err);
    return generateOfflineQuizQuestions(profile, topic, sourceMaterial);
  }
};

const validateAndFormatQuestions = (parsed: any[], topic: string = "this topic"): QuizQuestion[] => {
  if (!Array.isArray(parsed)) throw new Error("Response is not an array");
  return parsed.map((q: any, index: number) => {
    const rawOptions = Array.isArray(q.options) && q.options.length === 4 
      ? q.options 
      : ["Option A", "Option B", "Option C", "Option D"];
    const rawCorrectIndex = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
    
    // Shuffle options client-side and dynamically adjust correctIndex to eliminate LLM biases (like B, B, B)
    const mappedOptions = rawOptions.map((opt: string, idx: number) => ({
      text: opt,
      isCorrect: idx === rawCorrectIndex
    }));
    
    // Perform standard Fisher-Yates shuffle
    for (let i = mappedOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = mappedOptions[i];
      mappedOptions[i] = mappedOptions[j];
      mappedOptions[j] = temp;
    }
    
    const shuffledOptions = mappedOptions.map((item: { text: string; isCorrect: boolean }) => item.text);
    const shuffledCorrectIndex = mappedOptions.findIndex((item: { text: string; isCorrect: boolean }) => item.isCorrect);

    return {
      id: q.id || index,
      type: q.type || QuestionType.MCQ,
      text: q.text && q.text.trim() !== "" ? q.text : `Analyze the concepts of ${topic} to find the solution.`,
      contextMaterial: q.contextMaterial || undefined,
      options: shuffledOptions,
      correctIndex: shuffledCorrectIndex >= 0 ? shuffledCorrectIndex : 0,
      explanation: q.explanation || "No explanation provided.",
      inquiryPrompt: q.inquiryPrompt || `How would this change if we altered the initial conditions of the ${topic} problem?`
    };
  });
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  if (!text.trim()) return new ArrayBuffer(0);
  const geminiKeys = getAIKeys();
  for (const key of geminiKeys) {
    try {
      const ai = getAIWithKey(key);
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Read this academic content clearly and encouragingly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64) throw new Error("TTS Failed");
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    } catch (e: any) {
      console.warn("TTS generation failed with key:", e.message || e);
    }
  }
  return new ArrayBuffer(0); // Fail silently for audio
};

let currentUtterance: SpeechSynthesisUtterance | null = null;

export const speakTextLocal = (text: string, onStart?: () => void, onEnd?: () => void): Promise<void> => {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }
    
    window.speechSynthesis.cancel(); // Stop any pending reading
    
    // Clean text of markdown characters
    const cleanedText = text.replace(/[*_`#]/g, '').trim();
    if (!cleanedText) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    currentUtterance = utterance;

    const setVoiceAndSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      
      // Look for en-IN or hi-IN voices
      // 1. Try to find an Indian English male voice (e.g. Microsoft Ravi, Google Ravi, en-IN with male/guy)
      let chosenVoice = voices.find(v => 
        (v.lang.toLowerCase().includes('en-in') || v.lang.toLowerCase().includes('en_in')) && 
        (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('ravi') || v.name.toLowerCase().includes('dilip') || v.name.toLowerCase().includes('guy') || v.name.toLowerCase().includes('prakash'))
      );
      
      // 2. Fall back to any en-IN voice (Indian English)
      if (!chosenVoice) {
        chosenVoice = voices.find(v => v.lang.toLowerCase().includes('en-in') || v.lang.toLowerCase().includes('en_in'));
      }
      
      // 3. Fall back to hi-IN (Hindi India)
      if (!chosenVoice) {
        chosenVoice = voices.find(v => v.lang.toLowerCase().includes('hi-in') || v.lang.toLowerCase().includes('hi_in'));
      }
      
      // 4. Fall back to any English male voice
      if (!chosenVoice) {
        chosenVoice = voices.find(v => 
          v.lang.toLowerCase().startsWith('en') && 
          (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('guy') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('george'))
        );
      }
      
      // 5. Fall back to any English voice
      if (!chosenVoice) {
        chosenVoice = voices.find(v => v.lang.toLowerCase().startsWith('en'));
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }
      
      // Apply exact low-pitched, Indian-accent friendly voice adjustments
      utterance.pitch = 0.82; // Lower, deeper voice pitch
      utterance.rate = 0.88;  // Slightly slower/composed pace for classroom understanding
      
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
      
      utterance.onerror = (err) => {
        console.error("SpeechSynthesis error:", err);
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
      // Timeout fallback in case onvoiceschanged does not trigger
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
    if (!audioContext) audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    if (audioContext.state === 'suspended') await audioContext.resume();

    const data = new Int16Array(buffer);
    const audioBuffer = audioContext.createBuffer(1, data.length, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) channel[i] = data[i] / 32768.0;
    
    currentAudioSource = audioContext.createBufferSource();
    currentAudioSource.buffer = audioBuffer;
    currentAudioSource.playbackRate.value = 1.35; // Slightly faster for academic efficiency
    currentAudioSource.connect(audioContext.destination);
    currentAudioSource.onended = () => { currentAudioSource = null; };
    currentAudioSource.start();
  } catch (e) {
    console.error("Audio Playback Error", e);
  }
};