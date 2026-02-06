import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Difficulty, QuizQuestion, UserProfile } from '../types';

/**
 * Helper to ensure the AI client is always initialized with the correctly injected key.
 */
const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "") {
    throw new Error("API_KEY is missing. In Vercel, go to Settings -> Environment Variables and add API_KEY.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Generates academic quiz questions based on the user's profile and desired difficulty.
 */
export const generateQuizQuestions = async (
  profile: UserProfile,
  difficulty: Difficulty,
  count: number = 10
): Promise<QuizQuestion[]> => {
  const ai = getAIClient();

  const prompt = `Generate a ${count}-question multiple-choice exam for this student:
  - Name: ${profile.name}
  - School: ${profile.school || 'Private Student'}
  - Grade Level: ${profile.gradeLevel}
  - Subject: ${profile.subject}
  - Topic: ${profile.topic}
  - Difficulty Level: ${difficulty}
  
  Instructions:
  1. Questions must be challenging but fair for a ${profile.gradeLevel} student.
  2. Topics should focus on: ${profile.topic}.
  
  Output MUST be a JSON array of objects.
  Each object: { "id": number, "text": string, "options": string[], "correctIndex": number, "explanation": string }`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are an elite academic curriculum designer. Your goal is to assess student knowledge with high-quality, relevant questions that match their educational level. Return ONLY valid JSON.",
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
    if (!text) throw new Error("Empty response from AI examiner.");
    
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw new Error(error.message || "Failed to generate academic content. Ensure your API_KEY is set correctly.");
  }
};

/**
 * Generates an audio explanation for the provided text using Gemini TTS.
 */
export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  const ai = getAIClient();
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Explain this academic concept clearly: ${text}` }] }],
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