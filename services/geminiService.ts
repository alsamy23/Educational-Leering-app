import { GoogleGenAI, Modality, Type } from "@google/genai";
import { QuizQuestion, UserProfile, QuestionType, StudyFocus } from '../types';

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY missing. Please ensure GEMINI_API_KEY is set in the environment.");
  return new GoogleGenAI({ apiKey });
};

const repairJson = (text: string): string => {
  let cleaned = text.trim();
  // Remove markdown code blocks if present
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?/g, '').replace(/```/g, '');
  }
  return cleaned.trim();
};

export const generateQuizQuestions = async (
  profile: UserProfile, 
  isMockMode: boolean = false, 
  groupName?: string,
  topicOverride?: string
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

  const groupContext = groupName ? `This is for Group: ${groupName}. Ensure questions are unique and challenging for this group.` : "";

  // Randomizer
  const seed = Math.random().toString(36).substring(7) + Date.now();

  const prompt = `Act as an Expert Academic Mentor for Grade ${profile.gradeLevel}.
  Subject: ${profile.subject}.
  Topic: ${topic}.
  Context: ${focusContext}.
  ${groupContext}
  Current Level: ${isMockMode ? "Exam Standard" : profile.level}.
  RandomSeed: ${seed}.
  
  TASK: Generate exactly 5 questions for this Batch.
  
  QUESTION TYPES DISTRIBUTION:
  - If Grade >= 9: Include at least 1 'CASE_STUDY' and 1 'VISUAL_ANALYSIS'.
  - If Grade < 9: Mostly MCQ and WORD_PROBLEM.
  
  GUIDELINES:
  - CASE_STUDY: Provide a short paragraph (50-80 words) in 'contextMaterial' that the student must analyze to answer the question.
  - VISUAL_ANALYSIS: Describe a diagram, graph, or physical setup in 'contextMaterial' (e.g., "A circuit diagram shows two resistors in parallel...") and ask a question based on it.
  - The 'explanation' must be detailed.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are an AI Tutor. Output valid JSON only. Focus on Case Studies for higher grades.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.NUMBER },
              type: { type: Type.STRING, description: "MCQ, WORD_PROBLEM, CASE_STUDY, or VISUAL_ANALYSIS" },
              contextMaterial: { type: Type.STRING, description: "Scenario text for CASE_STUDY or VISUAL_ANALYSIS" },
              text: { type: Type.STRING, description: "The question text" },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "Exactly 4 options"
              },
              correctIndex: { type: Type.NUMBER, description: "0-3" },
              explanation: { type: Type.STRING, description: "Detailed explanation of the correct answer" }
            },
            required: ["id", "type", "text", "options", "correctIndex", "explanation"]
          }
        },
        maxOutputTokens: 8192,
        temperature: 0.7
      }
    });

    const cleaned = repairJson(response.text || "[]");
    const parsed = JSON.parse(cleaned);
    
    // Basic validation
    if (!Array.isArray(parsed)) throw new Error("Response is not an array");
    return parsed.map((q: any, index: number) => ({
        id: q.id || index,
        type: q.type || QuestionType.MCQ,
        text: q.text || "Question text missing",
        contextMaterial: q.contextMaterial || undefined,
        options: Array.isArray(q.options) ? q.options : ["A", "B", "C", "D"],
        correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
        explanation: q.explanation || "No explanation provided."
    }));

  } catch (err: any) {
    console.error("Gemini Generation Error:", err);
    if (err instanceof SyntaxError) {
      throw new Error("AI returned malformed data. This usually happens when the response is too long or complex. Please try again.");
    }
    throw new Error(err.message || "Failed to generate questions. Please try again.");
  }
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Insight: ${text}` }] }],
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