import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Difficulty, QuizQuestion, UserProfile } from '../types';

export const generateQuizQuestions = async (
  profile: UserProfile,
  difficulty: Difficulty,
  count: number = 10
): Promise<QuizQuestion[]> => {
  // Always use process.env.API_KEY directly as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Create a ${count}-question multiple-choice academic exam.
  Student Context:
  - Name: ${profile.name}
  - School: ${profile.school}
  - Section: ${profile.section}
  - Grade: ${profile.gradeLevel}
  - Subject: ${profile.subject}
  - Specific Topic: ${profile.topic}
  - Difficulty: ${difficulty}
  
  Requirements:
  1. High academic quality appropriate for ${profile.gradeLevel}.
  2. Four unique, plausible options per question.
  3. A detailed pedagogical explanation for why the correct answer is right.
  4. Ensure the content is strictly related to the subject and topic.
  5. Output strictly as JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a world-class academic examiner. Your mission is to provide challenging, accurate, and educational assessments. Output only valid JSON.",
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
    if (!text) throw new Error("The AI examiner provided an empty response.");
    
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    throw new Error(error.message || "Failed to generate your exam. Please check your network.");
  }
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Explain clearly: ${text}` }] }],
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