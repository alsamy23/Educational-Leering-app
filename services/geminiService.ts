import { GoogleGenAI, Modality, Type } from "@google/genai";
import Groq from "groq-sdk";
import { QuizQuestion, UserProfile, QuestionType, StudyFocus, DifficultyLevel } from '../types';

const getAI = () => {
  // Rotate through available keys to handle limits
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.API_KEY,
    process.env.GEMINI_API_KEY_SECONDARY,
    process.env.GEMINI_API_KEY_TERTIARY
  ].filter(Boolean);

  if (keys.length === 0) throw new Error("API_KEY missing. Please ensure GEMINI_API_KEY is set in the environment.");
  
  // Use a simple rotation based on current time or a global counter if we had one
  // For now, we'll try them in order in the generation logic if one fails
  return new GoogleGenAI({ apiKey: keys[0]! });
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

export const generateQuizQuestions = async (
  profile: UserProfile, 
  isMockMode: boolean = false, 
  groupName?: string,
  topicOverride?: string,
  difficulty?: DifficultyLevel,
  retryCount = 0,
  seedOverride?: string
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

  // Randomizer or Seeded
  const seed = seedOverride || (Math.random().toString(36).substring(7) + Date.now());
  const currentYear = new Date().getFullYear();

  const prompt = `Act as an Inquiry-Based Academic Mentor for Grade ${profile.gradeLevel}.
  Current Academic Year: ${currentYear} (Targeting 2026 Exams).
  Subject: ${profile.subject}.
  Board: ${profile.board || "General"}.
  Topic: ${topic}.
  Context: ${focusContext}.
  ${boardContext}
  ${groupContext}
  ${difficultyContext}
  Current Level: ${isMockMode ? "Exam Standard" : profile.level}.
  RandomSeed: ${seed}.
  
  TASK: Generate exactly 5 questions for this Batch. 
  
  PEDAGOGICAL GOAL:
  - Promote critical thinking and deep understanding.
  - Avoid simple recall or "fixed" answers that are too obvious.
  - For High School (Grade 9-12): Link questions to real-world career applications (e.g., how an engineer, doctor, or data scientist uses this concept).
  - Promote questions that require students to solve complex problems, analyze scenarios, or ask further "What if" questions.
  - For each question, provide an 'inquiryPrompt' which is a follow-up challenge or a question the student should explore further after solving this one.
  - Provide an 'imageKeyword' for EVERY question. This should be a 2-3 word descriptive keyword that represents the visual context of the question (e.g., "solar system", "chemical reaction", "ancient rome", "geometry diagram").
  
  CRITICAL: Ensure these questions are unique and different from any other groups in this classroom session. 
  Even if the topic is the same, vary the scenarios and numerical values.
  
  QUESTION TYPES DISTRIBUTION:
  - If Grade >= 9: Include at least 1 'CASE_STUDY' and 1 'VISUAL_ANALYSIS'.
  - If Grade < 9: Mostly MCQ and WORD_PROBLEM.
  
  GUIDELINES:
  - CASE_STUDY: Provide a short paragraph (50-80 words) in 'contextMaterial' that the student must analyze to answer the question.
  - VISUAL_ANALYSIS: Describe a diagram, graph, or physical setup in 'contextMaterial' (e.g., "A circuit diagram shows two resistors in parallel...") and ask a question based on it.
  - The 'explanation' must be detailed.
  - The 'text' field MUST contain the actual question and MUST NOT be empty.`;

  try {
    // Try Gemini first with rotation
    const geminiKeys = [
      process.env.GEMINI_API_KEY,
      process.env.API_KEY,
      process.env.GEMINI_API_KEY_SECONDARY,
      process.env.GEMINI_API_KEY_TERTIARY
    ].filter(Boolean) as string[];

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
                  inquiryPrompt: { type: Type.STRING, description: "A follow-up challenge or inquiry for the student" },
                  imageKeyword: { type: Type.STRING, description: "2-3 word keyword for a relevant image" }
                },
                required: ["id", "type", "text", "options", "correctIndex", "explanation", "inquiryPrompt", "imageKeyword"]
              }
            },
            temperature: 0.8
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
        return generateQuizQuestions(profile, isMockMode, groupName, topicOverride, difficulty, retryCount + 1);
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
      inquiryPrompt: q.inquiryPrompt || `How would this change if we altered the initial conditions of the ${topic} problem?`,
      imageKeyword: q.imageKeyword || topic
  }));
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  if (!text.trim()) return new ArrayBuffer(0);
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
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
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const data = new Int16Array(buffer);
    const audioBuffer = ctx.createBuffer(1, data.length, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) channel[i] = data[i] / 32768.0;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
  } catch (e) {
    console.error("Audio Playback Error", e);
  }
};