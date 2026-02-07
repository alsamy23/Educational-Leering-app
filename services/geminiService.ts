import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Difficulty, QuizQuestion, UserProfile } from '../types';

/**
 * Creates a fresh AI instance using the environment-provided API key.
 */
const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Missing API_KEY environment variable.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Helper for exponential backoff retry.
 */
const fetchWithRetry = async <T>(fn: () => Promise<T>, retries: number = 3, delay: number = 2000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.message?.includes('503') || error.message?.includes('overloaded') || error.message?.includes('429'))) {
      await new Promise(res => setTimeout(res, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

/**
 * Generates academic quiz questions based on board syllabus and difficulty.
 */
export const generateQuizQuestions = async (
  profile: UserProfile,
  difficulty: Difficulty,
  count: number = 10
): Promise<QuizQuestion[]> => {
  return fetchWithRetry(async () => {
    const ai = getAI();

    const prompt = `Generate a ${count}-question ${difficulty} difficulty exam.
    Student Profile:
    - Board Pattern: ${profile.board}
    - Grade: ${profile.gradeLevel}
    - Subject: ${profile.subject}
    - Topic: ${profile.topic}
    
    Curriculum Guidelines:
    1. Follow the latest 2024-25 syllabus framework for ${profile.board}.
    2. Question Pattern: Use board-specific assessment styles (e.g., Application-based for CBSE, High-Order Thinking for ICSE/IGCSE).
    3. Difficulty ${difficulty}: Adjust complexity of distractors and reasoning required.
    4. Feedback: The 'explanation' field must explain the concept where the student might fail, acting like a tutor.
    
    Output MUST be a JSON array of objects following the schema.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: `You are a Senior Academic Examiner for the ${profile.board} curriculum. Your goal is to assess student mastery of ${profile.topic} according to the latest Indian educational standards and international frameworks (if IGCSE/IB). Ensure explanations are pedagogically sound.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER },
              text: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctIndex: { type: Type.INTEGER },
              explanation: { type: Type.STRING }
            },
            required: ["id", "text", "options", "correctIndex", "explanation"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty AI response.");
    return JSON.parse(text);
  });
};

/**
 * Generates an audio explanation for the provided text using Gemini TTS.
 */
export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Clearly explain this academic concept for a student: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Audio generation failed");

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};

/**
 * Plays raw PCM audio data in the browser.
 */
export const playAudioBuffer = async (buffer: ArrayBuffer) => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const dataInt16 = new Int16Array(buffer);
  const audioBuffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start();
};