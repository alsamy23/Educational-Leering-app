import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Difficulty, QuizQuestion, UserProfile, BoardSection, QuestionType } from '../types';

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
      type: { type: Type.STRING, enum: Object.values(QuestionType) },
      section: { type: Type.STRING },
      text: { type: Type.STRING },
      caseText: { type: Type.STRING },
      visualDescription: { type: Type.STRING },
      options: { type: Type.ARRAY, items: { type: Type.STRING } },
      correctIndex: { type: Type.INTEGER },
      explanation: { type: Type.STRING },
      modelAnswer: { type: Type.STRING },
      markingScheme: { type: Type.ARRAY, items: { type: Type.STRING } },
      boardFavoriteReason: { type: Type.STRING }
    },
    required: ["id", "type", "text", "explanation"]
  }
};

/**
 * Attempts to repair common AI JSON truncation errors, including unterminated strings.
 */
const repairJson = (text: string): string => {
  let cleaned = text.trim();
  
  // Remove markdown formatting
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
  }
  
  // Check if we are inside a string by counting unescaped double quotes
  let isInsideString = false;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '"' && (i === 0 || cleaned[i - 1] !== '\\')) {
      isInsideString = !isInsideString;
    }
  }

  // If we ended inside a string, close it
  if (isInsideString) {
    cleaned += '"';
  }
  
  // Balance brackets and braces
  const stack: string[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    // Ignore brackets inside strings when balancing
    let insideStr = false;
    for(let j=0; j<=i; j++) {
       if (cleaned[j] === '"' && (j === 0 || cleaned[j - 1] !== '\\')) insideStr = !insideStr;
    }
    if (insideStr) continue;

    if (char === '{' || char === '[') {
      stack.push(char);
    } else if (char === '}' || char === ']') {
      const last = stack[stack.length - 1];
      if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
        stack.pop();
      }
    }
  }

  // Close remaining open brackets in reverse order
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') cleaned += '}';
    if (last === '[') cleaned += ']';
  }
  
  return cleaned;
};

export const generateQuizQuestions = async (
  profile: UserProfile,
  difficulty: Difficulty
): Promise<QuizQuestion[]> => {
  const ai = getAI();
  const topicContext = profile.isFullSyllabus ? "the Entire Syllabus" : `the Chapter: ${profile.topic}`;
  
  let count = 5;
  let patternInfo = "";

  if (profile.selectedSection === BoardSection.FULL_MOCK) {
    count = 6; // Reduced to 6 for maximum reliability in complex pattern generation
    patternInfo = "Mix: Section A (MCQ), Section B (VSA), Section C (SA), Section E (Case Study). Include 1 Assertion-Reason.";
  } else if (profile.selectedSection === BoardSection.SECTION_A) {
    count = 10;
    patternInfo = "Strictly 10 MCQs and Assertion-Reasoning questions.";
  } else {
    count = 5;
    patternInfo = `Strictly ${profile.selectedSection} style.`;
  }

  const prompt = `Act as Senior Board Examiner for Grade ${profile.gradeLevel} ${profile.subject}.
  School: ${profile.school}, Section: ${profile.section}.
  Generate exactly ${count} high-yield questions for ${topicContext}.
  
  Section requirement: ${patternInfo}
  Difficulty: ${difficulty}.

  CRITICAL BRAVITY RULES:
  1. ALL explanations must be UNDER 100 characters.
  2. 'caseText' must be UNDER 150 characters.
  3. 'markingScheme' max 2 short points.
  4. 'boardFavoriteReason' max 10 words.
  5. DO NOT be verbose. Short, crisp board-style language only.
  
  Ensure calculation-based questions (like tournament byes) are mathematically accurate.
  Output only raw JSON array matching schema.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: `You are a CBSE Board Exam Generator. You output valid JSON only. Every second matters. Be extremely concise to fit within token limits.`,
        responseMimeType: "application/json",
        responseSchema: QUESTION_SCHEMA,
        maxOutputTokens: 4000, // Increased headroom
        thinkingConfig: { thinkingBudget: 500 }, // Added thinking for logic/math accuracy
        temperature: 0.1
      }
    });

    const rawText = response.text;
    if (!rawText) throw new Error("AI returned nothing.");
    
    // Attempt repair if necessary
    const repairedText = repairJson(rawText);
    
    try {
      return JSON.parse(repairedText);
    } catch (parseError) {
      console.error("Parse error after repair:", parseError, "Text:", repairedText);
      throw new Error("JSON structure failed. Try a smaller section like 'Section A'.");
    }
  } catch (err: any) {
    console.error("Gemini Failure:", err);
    throw err;
  }
};

export const generateQuestionImage = async (description: string): Promise<string> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `Educational diagram: ${description}. Clear, simple, textbook style, white background.` }]
      },
      config: {
        imageConfig: { aspectRatio: "16:9" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return "";
  } catch (err) {
    return "";
  }
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Board Alert: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  });
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Audio generation failed");
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
};

export const playAudioBuffer = async (buffer: ArrayBuffer) => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const dataInt16 = new Int16Array(buffer);
  const audioBuffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start();
};