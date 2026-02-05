
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Difficulty, QuizQuestion, UserProfile } from '../types';

/**
 * Generates quiz questions using the Gemini 3 Pro model.
 */
export const generateQuizQuestions = async (
  profile: UserProfile,
  difficulty: Difficulty,
  count: number = 10
): Promise<QuizQuestion[]> => {
  // Always initialize with named parameter as per @google/genai guidelines.
  // Using process.env.API_KEY directly as assumed to be pre-configured.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Generate a ${count}-question multiple-choice exam for this student:
  - School: ${profile.school}
  - Section: ${profile.section}
  - Grade: ${profile.gradeLevel}
  - Subject: ${profile.subject}
  - Topic: ${profile.topic}
  - Difficulty Level: ${difficulty}
  
  Each question MUST include:
  1. Question text
  2. Four plausible options
  3. The index of the correct answer (0-3)
  4. A helpful 'explanation' for why the answer is correct.
  
  Format strictly as a JSON array.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are an elite academic curriculum designer. Your goal is to assess student knowledge with high-quality, relevant questions. Output only valid JSON.",
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

    // Accessing .text property directly as per modern SDK standards.
    const text = response.text;
    if (!text) throw new Error("The AI examiner provided an empty response.");
    
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw new Error(error.message || "Academic sync failed. Please check your connection.");
  }
};

/**
 * Generates speech for explanations using the Gemini TTS model.
 */
export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  // Direct initialization with process.env.API_KEY.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
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

    // Extracting audio data from the response part.
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Audio generation failed");

    // Manually decode base64 as instructed in guidelines.
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
 * Decodes and plays raw PCM audio bytes.
 */
export const playAudioBuffer = async (buffer: ArrayBuffer) => {
  // Using 24000Hz as standard for Gemini TTS output.
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const dataInt16 = new Int16Array(buffer);
  const audioBuffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = audioBuffer.getChannelData(0);
  
  // Convert 16-bit PCM to normalized float values.
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start();
};
