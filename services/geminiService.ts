
import { GoogleGenAI, Type } from "@google/genai";
import { Difficulty, QuizQuestion } from '../types';

export const generateQuizQuestions = async (
  topic: string,
  gradeLevel: string,
  difficulty: Difficulty,
  count: number = 10 // Increased to 10 for better 100-point scale granularity
): Promise<QuizQuestion[]> => {
  
  // Create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Create a ${count}-question multiple-choice quiz about "${topic}".
  Target Audience: Grade ${gradeLevel} students.
  Difficulty Level: ${difficulty}.
  
  Ensure the questions are educational, factual, and strictly relevant to the topic.
  Include 4 options for each question.
  Provide the correct answer index (0-3) and a brief explanation.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a strict academic examiner. You output only valid JSON. Ensure questions are challenging but appropriate for the grade level.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER },
              text: { type: Type.STRING, description: "The question text" },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of 4 possible answers"
              },
              correctIndex: { type: Type.INTEGER, description: "The index (0-3) of the correct answer" },
              explanation: { type: Type.STRING, description: "Why this answer is correct" }
            },
            required: ["id", "text", "options", "correctIndex", "explanation"]
          }
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return data.map((q: any, index: number) => ({
        ...q,
        id: index + 1
      }));
    }
    
    throw new Error("No data received from AI");

  } catch (error) {
    console.error("Quiz generation failed:", error);
    throw error;
  }
};
