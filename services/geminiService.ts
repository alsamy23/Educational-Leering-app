import { GoogleGenAI, Modality, Type } from "@google/genai";
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
  ].filter(Boolean) as string[];
  return keys;
};

const getAI = () => {
  const keys = getAIKeys();
  if (keys.length === 0) throw new Error("API_KEY missing. Please ensure GEMINI_API_KEY is set in the environment.");
  
  // Round-robin rotation
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  return new GoogleGenAI({ apiKey: keys[currentKeyIndex] });
};

const getAIWithKey = (key: string) => new GoogleGenAI({ apiKey: key });

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
  const ai = getAI();
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
  const boardContext = profile.board ? `Educational Board: ${profile.board}. 
  CRITICAL: Follow the STRIKE PATTERN and SYLLABUS of the LATEST VERSION (Academic Year 2025-2026). 
  Refer to official 2026 sample question papers and question patterns for ${profile.board}. 
  Ensure questions align with the most recent curriculum updates and exam structures.` : "";

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
    2. However, you MUST still respect the Grade Level (${profile.gradeLevel}) and Board Standards (${profile.board || "General"}).
    3. Ensure the vocabulary and complexity are appropriate for Grade ${profile.gradeLevel}.
    
    SOURCE MATERIAL:
    """
    ${sourceMaterial}
    """
    ` 
    : `CURRICULUM-BASELINE MODE (STRICT):
    No private source material was provided. 
    1. You MUST generate questions based on the official ${profile.board || "Global"} curriculum standards for Grade ${profile.gradeLevel}.
    2. Focus on the core pillars of the ${profile.board} syllabus for the subject "${profile.subject}".
    3. Refer to the standard academic patterns for the current year.`;

  const prompt = `Act as an Expert Curriculum Designer and Academic Strategist for Grade ${profile.gradeLevel}.
  Current Academic Year: ${currentYear} (Targeting 2026 Exams).
  Subject: ${profile.subject}.
  Board: ${profile.board || "General"}.
  Topic: ${topic}.
  Context: ${focusContext}.
  ${boardContext}
  ${languageInstruction}
  ${groupContext}
  ${difficultyContext}
  Current Level: ${isMockMode ? "Exam Standard" : profile.level}.
  RandomSeed: ${seed}.
  
  ${groundedInstruction}
  
  TASK: Generate exactly 5 questions for this Batch. 
  
  PEDAGOGICAL GOAL (EXAM EXCELLENCE):
  - PRIMARY OBJECTIVE: ${sourceMaterial ? "Synthesize the source material into high-quality assessments aligned with exam patterns." : "Strictly follow Board curriculum standards to ensure exam readiness."}
  - Test foundational understanding, conceptual clarity, and the ability to apply the specific topic.
  - Questions must mirror the complexity (MCQs, Case Studies, etc.) of actual board exam patterns.
  - ${gradeInt < 6 
      ? "For PRIMARY SCHOOL: Focus on simplified core curriculum pillars. Ensure questions reflect standard educational early-years patterns." 
      : "For High School: Focus on analytical rigor. Every question must evaluate syllabus-specific mastery."}
  - Provide an 'inquiryPrompt' as a "Diagnostic Challenge" to help students identify areas for further study.
  
  MODE-SPECIFIC GUIDANCE:
  - INDIVIDUAL CHALLENGE: Focus on incremental mastery. Questions should help the student identify gaps in their understanding of the ${topic} syllabus.
  - CLASSROOM BATTLE: Questions should be competitive and balanced, designed to test the group's collective knowledge of core curriculum points under pressure.
  
  CRITICAL ACCORDING TO CURRICULUM & UNIQUENESS (CLASSROOM ANTI-REPEAT PROTOCOL):
  - Ensure 100% adherence strictly to the official board curriculum for this grade. No generic questions. Use exact curriculum terminology.
  - To absolutely prevent repeating questions between different groups, you MUST use the RandomSeed (${seed}) to deeply alter the sub-topic focus, problem formats, and numerical values. 
  - Group ${groupName || "N/A"} must receive an entirely distinct set of 5 questions than any other group. DO NOT recycle common starter questions.
  
  QUESTION TYPES DISTRIBUTION:
  - If Grade >= 9: Include at least 1 'CASE_STUDY' and 1 'VISUAL_ANALYSIS'.
  - If Grade < 9: Mostly MCQ and WORD_PROBLEM.
  
  GUIDELINES:
  - CASE_STUDY: Provide a short paragraph (50-80 words) in 'contextMaterial' that the student must analyze to answer the question.
  - VISUAL_ANALYSIS: Describe a diagram, graph, or physical setup in 'contextMaterial' (e.g., "A circuit diagram shows two resistors in parallel...") and ask a question based on it. (Do NOT provide images, purely textual visual descriptions).
  - The 'explanation' must be detailed.
  - The 'text' field MUST contain the actual question and MUST NOT be empty.`;

  try {
    // Try Gemini first with rotation
    const geminiKeys = getAIKeys();

    let lastError: any = null;

    for (const key of geminiKeys) {
      try {
        const ai = getAIWithKey(key);
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
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
            temperature: 0.95
          }
        });

        const cleaned = repairJson(response.text || "[]");
        const parsed = JSON.parse(cleaned);
        return validateAndFormatQuestions(parsed, topic);
      } catch (geminiErr: any) {
        lastError = geminiErr;
        // If it's a rate limit or overload, try the next key
        if (geminiErr.status === 429 || geminiErr.status === 503) {
          console.warn(`Key rate limited or overloaded. Trying next key...`);
          continue;
        }
        // For other errors, break and try fallback
        break;
      }
    }

    // If all Gemini keys failed or we hit a non-retryable error
    try {
      if (lastError && (lastError.status === 429 || lastError.status === 503) && retryCount < 2) {
        console.warn(`All Gemini keys rate limited. Retrying in ${2000 * (retryCount + 1)}ms...`);
        await sleep(2000 * (retryCount + 1));
        return generateQuizQuestions(profile, isMockMode, groupName, topicOverride, difficulty, retryCount + 1, seed, sourceMaterial);
      }

      console.warn("Gemini rotation failed, trying Groq fallback...", lastError);
      const groq = getGroq();
      if (!groq) throw lastError || new Error("All AI models failed");

      const groqResponse = await groq.chat.completions.create({
        messages: [
          { role: "system", content: `You are an AI Tutor. Output valid JSON only. Return a JSON array of 5 questions. ${groupName ? `This batch is for Group ${groupName}.` : ''}` },
          { role: "user", content: prompt + "\n\nIMPORTANT: Return ONLY a raw JSON array. No markdown, no explanations outside JSON." }
        ],
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" }
      });

      const content = groqResponse.choices[0]?.message?.content || "[]";
      // Groq json_object mode might return { "questions": [...] } or just the array if we are lucky
      // but usually it wants an object. Let's try to parse it.
      let parsed = JSON.parse(content);
      if (!Array.isArray(parsed) && parsed.questions) parsed = parsed.questions;
      if (!Array.isArray(parsed) && parsed.data) parsed = parsed.data;
      
      return validateAndFormatQuestions(parsed, topic);
    } catch (fallbackErr: any) {
      console.error("Groq fallback failed:", fallbackErr);
      throw lastError || fallbackErr;
    }
  } catch (err: any) {
    console.error("Generation Error:", err);
    if (err instanceof SyntaxError) {
      throw new Error("AI returned malformed data. Please try again.");
    }
    throw new Error(err.message || "Failed to generate questions. Please try again.");
  }
};

const validateAndFormatQuestions = (parsed: any[], topic: string = "this topic"): QuizQuestion[] => {
  if (!Array.isArray(parsed)) throw new Error("Response is not an array");
  return parsed.map((q: any, index: number) => ({
      id: q.id || index,
      type: q.type || QuestionType.MCQ,
      text: q.text && q.text.trim() !== "" ? q.text : `Analyze the concepts of ${topic} to find the solution.`,
      contextMaterial: q.contextMaterial || undefined,
      options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ["Option A", "Option B", "Option C", "Option D"],
      correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
      explanation: q.explanation || "No explanation provided.",
      inquiryPrompt: q.inquiryPrompt || `How would this change if we altered the initial conditions of the ${topic} problem?`
  }));
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  if (!text.trim()) return new ArrayBuffer(0);
  const ai = getAI();
  try {
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
  } catch (e) {
    console.error("TTS Error", e);
    return new ArrayBuffer(0); // Fail silently for audio
  }
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