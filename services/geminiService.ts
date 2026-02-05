import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Difficulty, QuizQuestion, UserProfile } from '../types';

export const generateQuizQuestions = async (
  profile: UserProfile,
  difficulty: Difficulty,
  count: number = 10
): Promise<QuizQuestion[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "") {
    throw new Error("Gemini API Key is missing. Create a .env file with API_KEY=your_key or set it in your environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Create a ${count}-question multiple-choice academic exam for a student.
  Context:
  - Student Name: ${profile.name}
  - School: ${profile.school}
  - Section: ${profile.section}
  - Grade: ${profile.gradeLevel}
  - Subject: ${profile.subject}
  - Topic: ${profile.topic}
  - Difficulty: ${difficulty}
  
  Instructions:
  1. Questions must be challenging but fair for ${profile.gradeLevel}.
  2. Provide 4 distinct options per question.
  3. Include a 'correctIndex' (0-3).
  4. Provide a 'explanation' that teaches the core concept.
  5. Format your response strictly as a JSON array of objects.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a professional academic examiner. Ensure accuracy and pedagogical value. Return only the JSON array.",
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
    if (!text) throw new Error("Received an empty response from the examiner.");
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw new Error(error.message || "Failed to generate exam. Please check your API key and connection.");
  }
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  const apiKey = process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: apiKey! });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Explain this concept clearly: ${text}` }] }],
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