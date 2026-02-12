import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Difficulty, QuizQuestion, UserProfile, QuestionType, StudyFocus } from '../types';

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY missing");
  return new GoogleGenAI({ apiKey });
};

const QUESTION_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.INTEGER },
      type: { type: Type.STRING, enum: [QuestionType.MCQ] },
      text: { type: Type.STRING },
      options: { type: Type.ARRAY, items: { type: Type.STRING } },
      correctIndex: { type: Type.INTEGER },
      explanation: { type: Type.STRING }
    },
    required: ["id", "type", "text", "options", "correctIndex", "explanation"]
  }
};

const repairJson = (text: string): string => {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
  }
  return cleaned;
};

export const generateQuizQuestions = async (profile: UserProfile): Promise<QuizQuestion[]> => {
  const ai = getAI();
  const focusContext = profile.focus === StudyFocus.SYLLABUS 
    ? "the entire syllabus" 
    : profile.focus === StudyFocus.PATTERN 
    ? "the latest board exam pattern" 
    : `the specific topic: ${profile.topic}`;

  const prompt = `Act as an Expert Educator for Grade ${profile.gradeLevel}.
  Subject: ${profile.subject}.
  Study Focus: ${focusContext}.
  Difficulty: ${profile.difficulty}.
  
  TASK: Generate exactly 5 high-yield MCQs to test subject knowledge.
  
  RULES:
  1. The 'explanation' must be deep and helpful for a student who gets the answer wrong.
  2. Questions must strictly follow Grade ${profile.gradeLevel} standards.
  3. Difficulty should be ${profile.difficulty}.
  
  Output only a raw JSON array.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are an AI Exam Proctor. Generate valid JSON for 5 MCQs. Be precise and conceptually accurate.",
        responseMimeType: "application/json",
        responseSchema: QUESTION_SCHEMA,
        maxOutputTokens: 2500,
        temperature: 0.3
      }
    });

    const cleaned = repairJson(response.text || "[]");
    return JSON.parse(cleaned);
  } catch (err: any) {
    console.error("Gemini Error:", err);
    throw err;
  }
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Correction: ${text}` }] }],
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
};

export const playAudio = async (buffer: ArrayBuffer) => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const data = new Int16Array(buffer);
  const audioBuffer = ctx.createBuffer(1, data.length, 24000);
  const channel = audioBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) channel[i] = data[i] / 32768.0;
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start();
};