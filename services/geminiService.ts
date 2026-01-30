import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Difficulty, QuizQuestion } from '../types';

export const generateQuizQuestions = async (
  subject: string,
  topic: string,
  gradeLevel: string,
  difficulty: Difficulty,
  count: number = 10
): Promise<QuizQuestion[]> => {
  // Directly use process.env.API_KEY as per instructions
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Create a ${count}-question multiple-choice quiz to help a student EXCEL in their studies.
  Subject: ${subject}
  Specific Topic: ${topic}
  Grade Level: ${gradeLevel}
  Difficulty: ${difficulty}
  
  Requirements:
  1. High academic rigor suitable for ${gradeLevel}.
  2. Four unique, challenging options.
  3. A deep, conceptual explanation for the correct answer.
  4. Output strictly as JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are an elite academic examiner. Your goal is to challenge students so they can excel. Output only valid JSON.",
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
    if (!text) throw new Error("Received empty response from the AI model.");
    
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw new Error(error.message || "Failed to connect to the AI service. Please verify your connection.");
  }
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Explain clearly for a student: ${text}` }] }],
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
    if (!base64Audio) throw new Error("No audio data generated");

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error("Speech generation failed:", error);
    throw error;
  }
};

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