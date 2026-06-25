import { GoogleGenAI, Modality, Type, ThinkingLevel } from "@google/genai";
import Groq from "groq-sdk";
import { QuizQuestion, UserProfile, QuestionType, StudyFocus, DifficultyLevel } from '../types';

let currentKeyIndex = Math.floor(Math.random() * 10); // Start at random to spread initial load

const getAIKeys = () => {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.API_KEY,
    process.env.GEMINI_API_KEY_SECONDARY,
    process.env.GEMINI_API_KEY_TERTIARY,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY_8,
    process.env.GEMINI_API_KEY_9,
    process.env.GEMINI_API_KEY_10
  ].map(k => k?.trim()).filter(Boolean) as string[];
  
  // Deduplicate keys
  return Array.from(new Set(keys));
};

const getAI = () => {
  const keys = getAIKeys();
  if (keys.length === 0) throw new Error("API_KEY missing. Please ensure GEMINI_API_KEY is set in the environment.");
  
  // Round-robin rotation
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  return new GoogleGenAI({ apiKey: keys[currentKeyIndex] });
};

const getAIWithKey = (key: string) => new GoogleGenAI({ apiKey: key });

const isRateLimitError = (err: any): boolean => {
  if (!err) return false;
  const status = err.status || err.statusCode || err.code || (err.error && err.error.code);
  const message = (err.message || "").toLowerCase();
  const statusString = String(status);
  
  return (
    status === 429 ||
    statusString.includes("429") ||
    status === 503 ||
    statusString.includes("503") ||
    message.includes("quota") ||
    message.includes("limit exceeded") ||
    message.includes("resource_exhausted") ||
    message.includes("too many requests") ||
    message.includes("429")
  );
};

const getFallbackAI = () => {
  const groqKey = (process.env.GROQ_API_KEY || "").trim();
  const grokKey = (process.env.GROK_API_KEY || process.env.XAI_API_KEY || "").trim();

  if (grokKey) {
    return {
      type: 'grok' as const,
      apiKey: grokKey,
      baseURL: "https://api.x.ai/v1",
      model: 'grok-2-1212'
    };
  } else if (groqKey) {
    // If they supplied an xAI key inside GROQ_API_KEY (users sometimes do this)
    if (groqKey.startsWith("xai-")) {
      return {
        type: 'grok' as const,
        apiKey: groqKey,
        baseURL: "https://api.x.ai/v1",
        model: 'grok-2-1212'
      };
    }
    return {
      type: 'groq' as const,
      client: new Groq({ apiKey: groqKey, dangerouslyAllowBrowser: true }),
      model: 'llama-3.3-70b-versatile'
    };
  }
  return null;
};

const getGroq = () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new Groq({ apiKey, dangerouslyAllowBrowser: true });
};

const repairJson = (text: string): string => {
  let cleaned = text.trim();
  // Remove markdown code blocks if present
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?/g, '').replace(/```/g, '');
  }
  return cleaned.trim();
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

let currentAudioSource: AudioBufferSourceNode | null = null;
let audioContext: AudioContext | null = null;

export const stopAudio = () => {
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
    } catch (e) {}
    currentAudioSource = null;
  }
};

export const generateQuizQuestions = async (
  profile: UserProfile, 
  isMockMode: boolean = false, 
  groupName?: string,
  topicOverride?: string,
  difficulty?: DifficultyLevel,
  retryCount = 0,
  seedOverride?: string,
  sourceMaterial?: string
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

  const groupContext = groupName ? `This is for Group: ${groupName} in a Classroom Battle.` : "";
  const difficultyContext = difficulty && difficulty !== DifficultyLevel.DEFAULT 
    ? `The difficulty level for this group is: ${difficulty}. Adjust question complexity accordingly.` 
    : "";
  const eduLevel = profile.educationLevel || 'School';
  let educationalSettingPrompt = "";
  
  if (eduLevel === 'School') {
    educationalSettingPrompt = `
      ROLE: Act as an Expert school curriculum designer and board examination author for Grade ${profile.gradeLevel}.
      EDUCATION STREAM: School Education (K-12).
      GRADE TARGET: Grade ${profile.gradeLevel}.
      CURRICULUM/BOARD: ${profile.board || "General Board"}.
      ACADEMIC LEVEL: Focus on grade-appropriate curriculum pillars, core textbooks syllabus, and official blueprint model.
    `;
  } else if (eduLevel === 'College') {
    educationalSettingPrompt = `
      ROLE: Act as an elite University Professor, Academic Dean, and Senior College Lecturer.
      EDUCATION STREAM: Higher Education / College Level.
      YEAR/SEMESTER: ${profile.gradeLevel || "General Year"}.
      DEGREE STREAM & MAJOR: ${profile.board || "General Major / Arts & Sciences"}.
      ACADEMIC LEVEL: College level rigor. Focus on theoretical depth, research application, critical analytical thinking, and complex academic insights. Ensure content matches undergraduate or postgraduate examination level.
    `;
  } else if (eduLevel === 'Competitive') {
    educationalSettingPrompt = `
      ROLE: Act as a master Trainer for Competitive Entrance Exams and Professional Certification Panels.
      EDUCATION STREAM: Competitive Exam Preparation & Career Certifications.
      TARGET EXAM / BOARD: ${profile.board || "General Competitive Exam"}.
      ACADEMIC LEVEL: Tough entrance assessment standards with a focus on core exam patterns (analytical, logical, and concept integration). Focus on maximizing score diagnostics, trick questions, and solving professional-grade problems.
    `;
  } else {
    educationalSettingPrompt = `
      ROLE: Act as an Expert Personal Mentor and Subject Matter Genius.
      EDUCATION STREAM: Personal Learning, Lifelong Education & Custom Upskilling.
      TARGET LEVEL: ${profile.board || "General / Adaptive"}.
      ACADEMIC LEVEL: Customized individual development, clear analogies, active practice, and concept reinforcement. Ideal for self-learners, hobbyists, or professionals upskilling.
    `;
  }

  // Check for non-English subject/topic (e.g. Tamil)
  const isTargetLanguageOtherThanEnglish = /tamil|hindi|telugu|kannada|malayalam|french|spanish|german/i.test(profile.subject) || /tamil|hindi|telugu|kannada|malayalam|french|spanish|german/i.test(topic);
  const languageInstruction = isTargetLanguageOtherThanEnglish 
    ? `CRITICAL LANGUAGE RULE: The entire question text, options, explanations, and prompts MUST be written in the language of the subject (${profile.subject}). If the subject is Tamil, use Tamil script. NEVER switch to English for the question content.` 
    : "Language: English.";

  // Randomizer or Seeded
  const seed = seedOverride || (Math.random().toString(36).substring(7) + Date.now());
  const currentYear = new Date().getFullYear();

  const groundedInstruction = sourceMaterial 
    ? `SOURCE-GROUNDED MODE (STRICT):
    A specific curriculum segment or textbook material has been provided below. 
    1. Your primary task is to generate questions derived EXCLUSIVELY from this source material.
    2. However, you MUST still respect the Educational Setting / Stream (${eduLevel}), target year/academic stage (${profile.gradeLevel}), and standards (${profile.board || "General"}).
    3. Ensure the vocabulary and complexity are completely appropriate for ${profile.gradeLevel}.
    
    SOURCE MATERIAL:
    """
    ${sourceMaterial}
    """
    ` 
    : `CURRICULUM-BASELINE MODE (STRICT):
    No private source material was provided. 
    1. You MUST generate questions based on the official curriculum/course standards for ${eduLevel} - ${profile.board || "General"}.
    2. Focus on the core pillars of the syllabus/topic for the subject "${profile.subject}".
    3. Refer to standard academic structures matching ${profile.gradeLevel}.`;

  const prompt = `
  ${educationalSettingPrompt}
  Current Academic Year: ${currentYear}-${currentYear + 1} (Targeting ${currentYear + 1} Exams).
  Subject: ${profile.subject}.
  Topic: ${topic}.
  Context: ${focusContext}.
  ${languageInstruction}
  ${groupContext}
  ${difficultyContext}
  Current Level: ${isMockMode ? "Exam Standard" : profile.level}.
  RandomSeed: ${seed}.
  
  ${groundedInstruction}
  
  TASK: Generate exactly 5 questions for this Batch. 
  
  PEDAGOGICAL GOAL (EXAM EXCELLENCE):
  - PRIMARY OBJECTIVE: ${sourceMaterial ? "Synthesize the source material into high-quality assessments aligned with exam patterns." : "Strictly follow curriculum and textbook standards to ensure exam readiness."}
  - Test foundational understanding, conceptual clarity, and the ability to apply the specific topic.
  - Questions must mirror the complexity (MCQs, Case Studies, etc.) of actual board or exam patterns.
  - ${eduLevel === 'School' && gradeInt < 6 
      ? "For PRIMARY SCHOOL: Focus on simplified core curriculum pillars. Ensure questions reflect standard educational early-years patterns." 
      : "Focus on analytical rigor. Every question must evaluate syllabus-specific mastery."}
  - Provide an 'inquiryPrompt' as a "Diagnostic Challenge" to help students identify areas for further study.
  
  MODE-SPECIFIC GUIDANCE:
  - INDIVIDUAL CHALLENGE: Focus on incremental mastery. Questions should help the student identify gaps in their understanding of the ${topic} syllabus.
  - CLASSROOM BATTLE: Questions should be competitive and balanced, designed to test the group's collective knowledge of core curriculum points under pressure.
  
  CRITICAL ACCORDING TO CURRICULUM & UNIQUENESS (CLASSROOM ANTI-REPEAT PROTOCOL):
  - Ensure 100% adherence strictly to the official curriculum for this level. No generic questions. Use exact curriculum terminology.
  - To absolutely prevent repeating questions between different groups, you MUST use the RandomSeed (${seed}) to deeply alter the sub-topic focus, problem formats, and numerical values. 
  - Group ${groupName || "N/A"} must receive an entirely distinct set of 5 questions than any other group. DO NOT recycle common starter questions.
  
  QUESTION TYPES DISTRIBUTION:
  - Match question complexity and types with the target educational tier (${eduLevel}). For advanced levels (College, Competitive), include Case Studies and complex situations.
  - Include at least 1 'CASE_STUDY' and 1 'VISUAL_ANALYSIS' if possible.
  
  GUIDELINES:
  - CASE_STUDY: Provide a short paragraph (50-100 words) in 'contextMaterial' that the student must analyze to answer the question.
  - VISUAL_ANALYSIS: Describe a diagram, graph, or physical setup in 'contextMaterial' (e.g., "A circuit diagram shows two resistors in parallel...") and ask a question based on it. (Do NOT provide images, purely textual visual descriptions).
  - The 'explanation' must be detailed.
  - The 'text' field MUST contain the actual question and MUST NOT be empty.`;

  try {
    // Try Gemini first with rotation
    const geminiKeys = getAIKeys();

    let lastError: any = null;

    for (const key of geminiKeys) {
      try {
        console.log(`Attempting question generation with Gemini key ending in ...${key.slice(-5)}`);
        const ai = getAIWithKey(key);
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            systemInstruction: `You are an AI Tutor. Output valid JSON only. Focus on Case Studies for higher grades. ${groupName ? `This batch is specifically for Group ${groupName}. Ensure uniqueness.` : ''}`,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.NUMBER },
                  type: { type: Type.STRING, description: "MCQ, WORD_PROBLEM, CASE_STUDY, or VISUAL_ANALYSIS" },
                  contextMaterial: { type: Type.STRING, description: "Scenario text for CASE_STUDY or VISUAL_ANALYSIS" },
                  text: { type: Type.STRING, description: "The question text. Must be a complete, challenging question." },
                  options: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "Exactly 4 options"
                  },
                  correctIndex: { type: Type.NUMBER, description: "0-3" },
                  explanation: { type: Type.STRING, description: "Detailed explanation of the correct answer" },
                  inquiryPrompt: { type: Type.STRING, description: "A follow-up challenge or inquiry for the student" }
                },
                required: ["id", "type", "text", "options", "correctIndex", "explanation", "inquiryPrompt"]
              }
            },
            temperature: 0.2
          }
        });

        const cleaned = repairJson(response.text || "[]");
        const parsed = JSON.parse(cleaned);
        return validateAndFormatQuestions(parsed, topic);
      } catch (geminiErr: any) {
        lastError = geminiErr;
        console.warn(`Gemini key failed: ${geminiErr.message || geminiErr}. Trying next key...`);
        continue;
      }
    }

    // If all Gemini keys failed or we hit a rate limit
    try {
      if (lastError && isRateLimitError(lastError) && retryCount < 2) {
        console.warn(`All Gemini keys rate limited. Retrying in ${2000 * (retryCount + 1)}ms...`);
        await sleep(2000 * (retryCount + 1));
        return generateQuizQuestions(profile, isMockMode, groupName, topicOverride, difficulty, retryCount + 1, seed, sourceMaterial);
      }

      console.warn("Gemini rotation exhausted. Attempting Groq/Grok fallback...", lastError);
      const fallback = getFallbackAI();
      if (!fallback) {
        throw lastError || new Error("All Gemini keys failed, and no Groq/Grok fallback is configured.");
      }

      console.log(`Calling Fallback AI (${fallback.type})...`);
      const systemPrompt = `You are an AI Tutor. Output valid JSON only. Return a JSON array of 5 questions. ${groupName ? `This batch is for Group ${groupName}.` : ''}`;
      const userPrompt = prompt + "\n\nIMPORTANT: Return ONLY a raw JSON array of 5 items. No markdown wrapper, no extra explanations.";
      
      let content = "[]";
      if (fallback.type === 'groq') {
        const groqResponse = await fallback.client.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          model: fallback.model,
          response_format: { type: "json_object" }
        });
        content = groqResponse.choices[0]?.message?.content || "[]";
      } else {
        // xAI Grok (direct API call via fetch)
        const response = await fetch(`${fallback.baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${fallback.apiKey}`
          },
          body: JSON.stringify({
            model: fallback.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Grok API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        content = data.choices[0]?.message?.content || "[]";
      }

      let parsed = JSON.parse(repairJson(content));
      if (!Array.isArray(parsed) && parsed.questions) parsed = parsed.questions;
      if (!Array.isArray(parsed) && parsed.data) parsed = parsed.data;
      
      return validateAndFormatQuestions(parsed, topic);
    } catch (fallbackErr: any) {
      console.error("Groq/Grok fallback failed:", fallbackErr);
      throw lastError || fallbackErr;
    }
  } catch (err: any) {
    console.error("Generation Error:", err);
    if (err instanceof SyntaxError) {
      throw new Error("AI returned malformed data. Please try again.");
    }
    throw new Error(err.message || "Failed to generate questions. Please try again.");
  }
};

const validateAndFormatQuestions = (parsed: any[], topic: string = "this topic"): QuizQuestion[] => {
  if (!Array.isArray(parsed)) throw new Error("Response is not an array");
  return parsed.map((q: any, index: number) => {
    const rawOptions = Array.isArray(q.options) && q.options.length === 4 
      ? q.options 
      : ["Option A", "Option B", "Option C", "Option D"];
    const rawCorrectIndex = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
    
    // Shuffle options client-side and dynamically adjust correctIndex to eliminate LLM biases (like B, B, B)
    const mappedOptions = rawOptions.map((opt: string, idx: number) => ({
      text: opt,
      isCorrect: idx === rawCorrectIndex
    }));
    
    // Perform standard Fisher-Yates shuffle
    for (let i = mappedOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = mappedOptions[i];
      mappedOptions[i] = mappedOptions[j];
      mappedOptions[j] = temp;
    }
    
    const shuffledOptions = mappedOptions.map((item: { text: string; isCorrect: boolean }) => item.text);
    const shuffledCorrectIndex = mappedOptions.findIndex((item: { text: string; isCorrect: boolean }) => item.isCorrect);

    return {
      id: q.id || index,
      type: q.type || QuestionType.MCQ,
      text: q.text && q.text.trim() !== "" ? q.text : `Analyze the concepts of ${topic} to find the solution.`,
      contextMaterial: q.contextMaterial || undefined,
      options: shuffledOptions,
      correctIndex: shuffledCorrectIndex >= 0 ? shuffledCorrectIndex : 0,
      explanation: q.explanation || "No explanation provided.",
      inquiryPrompt: q.inquiryPrompt || `How would this change if we altered the initial conditions of the ${topic} problem?`
    };
  });
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  if (!text.trim()) return new ArrayBuffer(0);
  const geminiKeys = getAIKeys();
  for (const key of geminiKeys) {
    try {
      const ai = getAIWithKey(key);
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Read this academic content clearly and encouragingly: ${text}` }] }],
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
    } catch (e: any) {
      console.warn("TTS generation failed with key:", e.message || e);
    }
  }
  return new ArrayBuffer(0); // Fail silently for audio
};

let currentUtterance: SpeechSynthesisUtterance | null = null;

export const speakTextLocal = (text: string, onStart?: () => void, onEnd?: () => void): Promise<void> => {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }
    
    window.speechSynthesis.cancel(); // Stop any pending reading
    
    // Clean text of markdown characters
    const cleanedText = text.replace(/[*_`#]/g, '').trim();
    if (!cleanedText) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    currentUtterance = utterance;

    const setVoiceAndSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      
      // Look for en-IN or hi-IN voices
      // 1. Try to find an Indian English male voice (e.g. Microsoft Ravi, Google Ravi, en-IN with male/guy)
      let chosenVoice = voices.find(v => 
        (v.lang.toLowerCase().includes('en-in') || v.lang.toLowerCase().includes('en_in')) && 
        (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('ravi') || v.name.toLowerCase().includes('dilip') || v.name.toLowerCase().includes('guy') || v.name.toLowerCase().includes('prakash'))
      );
      
      // 2. Fall back to any en-IN voice (Indian English)
      if (!chosenVoice) {
        chosenVoice = voices.find(v => v.lang.toLowerCase().includes('en-in') || v.lang.toLowerCase().includes('en_in'));
      }
      
      // 3. Fall back to hi-IN (Hindi India)
      if (!chosenVoice) {
        chosenVoice = voices.find(v => v.lang.toLowerCase().includes('hi-in') || v.lang.toLowerCase().includes('hi_in'));
      }
      
      // 4. Fall back to any English male voice
      if (!chosenVoice) {
        chosenVoice = voices.find(v => 
          v.lang.toLowerCase().startsWith('en') && 
          (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('guy') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('george'))
        );
      }
      
      // 5. Fall back to any English voice
      if (!chosenVoice) {
        chosenVoice = voices.find(v => v.lang.toLowerCase().startsWith('en'));
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }
      
      // Apply exact low-pitched, Indian-accent friendly voice adjustments
      utterance.pitch = 0.82; // Lower, deeper voice pitch
      utterance.rate = 0.88;  // Slightly slower/composed pace for classroom understanding
      
      utterance.onstart = () => {
        if (onStart) onStart();
      };
      
      utterance.onend = () => {
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        if (onEnd) onEnd();
        resolve();
      };
      
      utterance.onerror = (err) => {
        console.error("SpeechSynthesis error:", err);
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        if (onEnd) onEnd();
        resolve();
      };
      
      window.speechSynthesis.speak(utterance);
    };

    const initialVoices = window.speechSynthesis.getVoices();
    if (initialVoices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        setVoiceAndSpeak();
      };
      // Timeout fallback in case onvoiceschanged does not trigger
      setTimeout(() => {
        setVoiceAndSpeak();
      }, 500);
    } else {
      setVoiceAndSpeak();
    }
  });
};

export const playAudio = async (buffer: ArrayBuffer) => {
  if (buffer.byteLength === 0) return;
  try {
    stopAudio();
    if (!audioContext) audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    if (audioContext.state === 'suspended') await audioContext.resume();

    const data = new Int16Array(buffer);
    const audioBuffer = audioContext.createBuffer(1, data.length, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) channel[i] = data[i] / 32768.0;
    
    currentAudioSource = audioContext.createBufferSource();
    currentAudioSource.buffer = audioBuffer;
    currentAudioSource.playbackRate.value = 1.35; // Slightly faster for academic efficiency
    currentAudioSource.connect(audioContext.destination);
    currentAudioSource.onended = () => { currentAudioSource = null; };
    currentAudioSource.start();
  } catch (e) {
    console.error("Audio Playback Error", e);
  }
};