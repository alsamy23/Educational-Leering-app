import { GoogleGenAI, Modality, Type, ThinkingLevel } from "@google/genai";
import Groq from "groq-sdk";
import { QuizQuestion, UserProfile, QuestionType, StudyFocus, DifficultyLevel, SuggestedTopic } from '../types';

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

interface KeyHealth {
  key: string;
  isBlacklisted: boolean;
  blacklistReason?: 'permission_denied' | 'rate_limit';
  consecutiveFailures: number;
  lastFailureTime?: number;
}

const keyHealthMap = new Map<string, KeyHealth>();

export const getHealthyAIKeys = (): string[] => {
  const keys = getAIKeys();
  const now = Date.now();

  for (const key of keys) {
    if (!keyHealthMap.has(key)) {
      keyHealthMap.set(key, {
        key,
        isBlacklisted: false,
        consecutiveFailures: 0,
      });
    }
  }

  const healthyKeys = keys.filter(key => {
    const health = keyHealthMap.get(key);
    if (!health) return true;
    if (health.isBlacklisted) {
      if (health.blacklistReason === 'permission_denied') {
        return false;
      }
      if (health.lastFailureTime && now - health.lastFailureTime < 3 * 60 * 1000) {
        return false;
      }
      // Re-evaluate after 3 mins
      health.isBlacklisted = false;
      health.consecutiveFailures = 0;
    }
    return true;
  });

  if (healthyKeys.length === 0) {
    return keys;
  }

  // Rotate starting from currentKeyIndex
  const startIndex = currentKeyIndex % healthyKeys.length;
  const rotated = [
    ...healthyKeys.slice(startIndex),
    ...healthyKeys.slice(0, startIndex)
  ];

  return rotated;
};

const reportKeySuccess = (key: string) => {
  const health = keyHealthMap.get(key);
  if (health) {
    health.consecutiveFailures = 0;
    health.isBlacklisted = false;
    delete health.blacklistReason;
  }
  currentKeyIndex = (currentKeyIndex + 1) % 1000;
};

const reportKeyFailure = (key: string, error: any) => {
  const health = keyHealthMap.get(key);
  if (health) {
    health.consecutiveFailures += 1;
    health.lastFailureTime = Date.now();
    
    const message = (error?.message || String(error)).toLowerCase();
    if (message.includes("permission") || message.includes("403") || message.includes("not valid") || message.includes("invalid key") || message.includes("unauthorized")) {
      health.isBlacklisted = true;
      health.blacklistReason = 'permission_denied';
      console.error(`Gemini key permanently blacklisted due to permission denied: ...${key.slice(-5)}`);
    } else {
      health.isBlacklisted = true;
      health.blacklistReason = 'rate_limit';
      console.warn(`Gemini key temporarily blacklisted due to rate limit/failure: ...${key.slice(-5)}`);
    }
  }
};

const getAI = () => {
  const keys = getHealthyAIKeys();
  if (keys.length === 0) throw new Error("API_KEY missing. Please ensure GEMINI_API_KEY is set in the environment.");
  
  // Use first healthy rotated key
  return new GoogleGenAI({ apiKey: keys[0] });
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

const generateOfflineQuizQuestions = (
  profile: UserProfile,
  topic: string,
  sourceMaterial?: string
): QuizQuestion[] => {
  console.log("Generating offline questions for topic:", topic);
  const subject = (profile.subject || "").toLowerCase();
  const topicLower = (topic || "").toLowerCase();
  const isTamil = /tamil/i.test(subject) || /tamil/i.test(topicLower);

  let sentences: string[] = [];
  if (sourceMaterial) {
    sentences = sourceMaterial
      .split(/[.!?\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 25 && s.length < 200);
  }

  const capTopic = topic.charAt(0).toUpperCase() + topic.slice(1);

  if (isTamil) {
    return [
      {
        id: 1,
        type: QuestionType.MCQ,
        text: `விடைத்தேர்க: "${topic}" என்ற தலைப்பில் உள்ள முக்கியக் கருத்து எது?`,
        options: [
          `அடிப்படை விதிகள் மற்றும் கோட்பாடுகள்`,
          `அன்றாட வாழ்வில் அதன் பயன்கள்`,
          `வரலாற்றுப் பின்னணி மற்றும் வளர்ச்சி`,
          `மேலே குறிப்பிட்டுள்ள அனைத்தும்`
        ],
        correctIndex: 3,
        explanation: `${topic} என்பது தமிழ் இலக்கியம் மற்றும் இலக்கணத்தில் மிக முக்கியப் பங்கு வகிக்கிறது. இதன் விதிகள் மற்றும் கோட்பாடுகள் நம் வாழ்விற்கு வழிகாட்டுகின்றன.`,
        inquiryPrompt: `இதைப் பற்றி மேலும் சிந்திக்க: இக்கருத்து தற்காலச் சமூகத்திற்கு எவ்வாறு பொருந்தும்?`
      },
      {
        id: 2,
        type: QuestionType.WORD_PROBLEM,
        text: `கீழ்க்கண்டவற்றுள் எது "${topic}" தொடர்பானது அல்ல?`,
        options: [
          `செம்மொழிப் பண்புகள்`,
          `இலக்கிய நயம் மற்றும் உத்திகள்`,
          `தகாத தர்க்க முறைகள்`,
          `இலக்கண விதிகள்`
        ],
        correctIndex: 2,
        explanation: `${topic} என்பது தமிழ் மொழி அமைப்பில் நேர்மறையான இலக்கண மற்றும் இலக்கியப் பண்புகளைக் குறிக்கும். தகாத தர்க்க முறைகள் இதனுடன் தொடர்பற்றவை.`,
        inquiryPrompt: `இதன் உண்மைத் தன்மையை ஆராய்க.`
      },
      {
        id: 3,
        type: QuestionType.CASE_STUDY,
        contextMaterial: `ஒரு மாணவர் தமிழ் இலக்கியத்தில் "${topic}" பற்றிய கட்டுரையை எழுதுகிறார். அவர் அதன் முக்கியப் பண்புகளையும் அதன் வரலாற்றுத் தாக்கத்தையும் விவரிக்கும் போது, சில இலக்கணப் பிழைகளைச் செய்கிறார்.`,
        text: `அந்த மாணவரின் கட்டுரையை மேம்படுத்த நீங்கள் என்ன ஆலோசனைக் கூறுவீர்கள்?`,
        options: [
          `இலக்கண விதிகளுடன் இலக்கிய நயத்தையும் இணைத்துக் கற்க வேண்டும்`,
          `கட்டுரையை முழுமையாக ஆங்கிலத்தில் எழுத வேண்டும்`,
          `கருத்துகளைக் குறைத்து பக்கங்களை மட்டும் அதிகரிக்க வேண்டும்`,
          `எந்த மாற்றமும் தேவையில்லை`
        ],
        correctIndex: 0,
        explanation: `தமிழ் இலக்கியத்தில் கருத்துச் செறிவோடு இலக்கணப் பிழையின்றி எழுதுவதே கட்டுரையைச் சிறந்ததாக மாற்றும்.`,
        inquiryPrompt: `இலக்கணப் பிழைகளைத் தவிர்க்கும் வழிகள் யாவை?`
      },
      {
        id: 4,
        type: QuestionType.VISUAL_ANALYSIS,
        contextMaterial: `தமிழ் மொழியின் வரலாற்று வரைபடம் ஒன்றை உற்றுநோக்குகிறோம். அதில் "${topic}" என்ற பகுதியானது தமிழ் மொழியின் தொன்மை மற்றும் தொடர்ச்சியை விளக்கும் மையப் புள்ளியாகக் காட்டப்பட்டுள்ளது.`,
        text: `இந்த வரைபடம் உணர்த்தும் மையக் கருத்து என்ன?`,
        options: [
          `தமிழ் மொழி காலந்தோறும் வளர்ந்து வரும் ஒரு சமுதாய மொழி`,
          `தமிழ் மொழியின் சொற்கள் மிகக் குறைவு`,
          `இது பிற மொழிகளைச் சார்ந்துள்ளது`,
          `இது தற்காலத்தில் வழக்கழிந்து வருகிறது`
        ],
        correctIndex: 0,
        explanation: `வரலாற்று வரைபடம் தமிழின் தொன்மை மற்றும் அது காலம் கடந்து நிலைத்து நிற்கும் பேராற்றலைக் காட்டுகிறது.`,
        inquiryPrompt: `தமிழின் தொடர்ச்சியை நிலைநிறுத்த நாம் என்ன செய்ய வேண்டும்?`
      },
      {
        id: 5,
        type: QuestionType.MCQ,
        text: `பின்வருவனவற்றுள் எது "${topic}" கோட்பாட்டின் முக்கியப் பயன்?`,
        options: [
          `மொழி ஆற்றல் மற்றும் படைப்பாற்றலை வளர்த்தல்`,
          `கருத்துகளைப் பகுத்தறிதல்`,
          `அறிவியல் மற்றும் கணித சிந்தனையைத் தூண்டுதல்`,
          `மேலே உள்ள அனைத்தும்`
        ],
        correctIndex: 3,
        explanation: `${topic} பற்றிய முறையான புரிதல் மொழித் திறனையும், பகுத்தறிவையும், இதர அறிவியல் சிந்தனைகளையும் ஒருசேர வளர்க்க உதவுகிறது.`,
        inquiryPrompt: `உமது சொந்தப் பயில்வு முறையை விவரி.`
      }
    ];
  }

  const questions: QuizQuestion[] = [];

  // --- Dynamic Local Database of Precise Subject-Specific Questions ---
  const offlineDatabase: { [key: string]: QuizQuestion[] } = {
    "light": [
      {
        id: 1,
        type: QuestionType.MCQ,
        text: "A convex lens has a focal length of 15 cm. If an object is placed at 30 cm in front of the lens, where is the image formed?",
        options: [
          "At 30 cm on the other side, real and inverted",
          "At 15 cm on the same side, virtual and erect",
          "At infinity on the other side, real and inverted",
          "At 10 cm on the other side, virtual and erect"
        ],
        correctIndex: 0,
        explanation: "Since the object is placed at 2F (30 cm, which is twice the focal length of 15 cm), the convex lens forms a real and inverted image of the same size at 2F on the other side of the lens.",
        inquiryPrompt: "What would happen to the size and nature of the image if the object is moved closer to the lens, say at 10 cm?"
      },
      {
        id: 2,
        type: QuestionType.WORD_PROBLEM,
        text: "If the magnification produced by a spherical mirror is -1, what does this indicate about the nature and size of the image?",
        options: [
          "The image is real, inverted, and of the same size as the object",
          "The image is virtual, erect, and magnified",
          "The image is real, inverted, and diminished",
          "The image is virtual, erect, and of the same size as the object"
        ],
        correctIndex: 0,
        explanation: "A negative sign in magnification indicates that the image is real and inverted. A magnitude of 1 indicates that the image is of the exact same size as the object.",
        inquiryPrompt: "Can you name a specific mirror and position of the object that produces a magnification of -1?"
      },
      {
        id: 3,
        type: QuestionType.CASE_STUDY,
        contextMaterial: "A student named Rahul is conducting an experiment with a glass slab. He shines a ray of light from air into the glass slab at an angle of incidence of 45 degrees. He notices that the light bends towards the normal inside the glass, and when it exits, the emergent ray is parallel to the incident ray but slightly shifted sideways.",
        text: "What causes the light to bend towards the normal when entering the glass slab, and what is the lateral displacement called?",
        options: [
          "The decrease in the speed of light in glass; lateral shift",
          "The increase in the speed of light in glass; vertical shift",
          "Total internal reflection inside the glass slab; normal shift",
          "The gravitational pull of the glass slab; refractive shift"
        ],
        correctIndex: 0,
        explanation: "When light travels from a rarer medium (air) to a denser medium (glass), its speed decreases, causing it to bend towards the normal. The sideways shift of the emergent ray is called lateral displacement.",
        inquiryPrompt: "How would the lateral displacement change if we replaced the glass slab with a diamond slab of the same thickness?"
      },
      {
        id: 4,
        type: QuestionType.VISUAL_ANALYSIS,
        contextMaterial: "A ray diagram shows a ray of light passing through a glass prism. The incident ray enters the prism, refracts inside, and then emerges on the other side. The angle between the incident ray produced forward and the emergent ray produced backward is labeled as 'D'.",
        text: "What is the correct physical term for this angle 'D', and what factors does it depend on?",
        options: [
          "Angle of Deviation; depends on the angle of incidence, prism angle, and refractive index",
          "Angle of Refraction; depends only on the color of light",
          "Angle of Dispersion; depends only on the length of the prism",
          "Angle of Incidence; depends on the speed of the prism rotation"
        ],
        correctIndex: 0,
        explanation: "The angle between the incident ray and the emergent ray in a prism is called the angle of deviation (D). It depends on the angle of incidence, the angle of the prism, the refractive index of the prism material, and the wavelength of light used.",
        inquiryPrompt: "Which color of white light deviates the most when passing through a glass prism, and why?"
      },
      {
        id: 5,
        type: QuestionType.MCQ,
        text: "A person cannot see distant objects clearly but can see nearby objects distinctly. Which eye defect is this, and how can it be corrected?",
        options: [
          "Myopia (Short-sightedness); corrected using a concave lens",
          "Hypermetropia (Long-sightedness); corrected using a convex lens",
          "Presbyopia; corrected using a bifocal lens",
          "Astigmatism; corrected using cylindrical lenses"
        ],
        correctIndex: 0,
        explanation: "Myopia is a defect in which a person can see nearby objects clearly but cannot see distant objects distinctly. It occurs because the image of distant objects is formed in front of the retina. A concave lens of appropriate power diverges the incoming rays to focus them exactly on the retina.",
        inquiryPrompt: "What are the two common causes of myopia in young students?"
      }
    ],
    "photosynthesis": [
      {
        id: 1,
        type: QuestionType.MCQ,
        text: "Which of the following represents the correct balanced chemical equation for the overall process of photosynthesis?",
        options: [
          "6CO2 + 6H2O + Light energy -> C6H12O6 + 6O2",
          "C6H12O6 + 6O2 -> 6CO2 + 6H2O + ATP",
          "6CO2 + 6O2 + Chlorophyll -> C6H12O6 + 6H2O",
          "CO2 + H2O + Chlorophyll -> C6H12O6 + O2"
        ],
        correctIndex: 0,
        explanation: "Photosynthesis is the process by which green plants synthesize glucose from carbon dioxide and water in the presence of sunlight and chlorophyll, releasing oxygen as a byproduct. The balanced chemical equation is 6CO2 + 6H2O -> C6H12O6 + 6O2.",
        inquiryPrompt: "What is the primary fate of the oxygen molecules released during this reaction?"
      },
      {
        id: 2,
        type: QuestionType.WORD_PROBLEM,
        text: "In a laboratory experiment, a plant leaf is exposed to carbon dioxide containing a heavy isotope of oxygen (O-18), while the water supplied contains normal oxygen. After several hours, the oxygen gas released by the plant is analyzed. Which of the following will contain the O-18 isotope?",
        options: [
          "The synthesized glucose will contain O-18; the released oxygen gas will contain normal oxygen",
          "The released oxygen gas will contain O-18; the glucose will contain normal oxygen",
          "Both glucose and oxygen gas will contain O-18",
          "Neither will contain O-18; this indicates carbon dioxide was not absorbed"
        ],
        correctIndex: 0,
        explanation: "During light-dependent reactions, photolysis of water splits water molecules into hydrogen ions and oxygen gas. The oxygen gas released comes entirely from water (H2O), while the oxygen in CO2 is incorporated into the glucose (C6H12O6) molecule.",
        inquiryPrompt: "How would the rate of oxygen release change if the plant is placed in a nitrogen-rich atmosphere under full sunlight?"
      },
      {
        id: 3,
        type: QuestionType.CASE_STUDY,
        contextMaterial: "An agricultural researcher is studying a group of tomato plants. She notices that during hot and dry summer days, the rate of photosynthesis in the afternoon drops significantly, a phenomenon known as the 'midday depression', despite there being plenty of sunlight.",
        text: "What physiological response in the plants causes this drop in photosynthesis, and why is it beneficial for the plant's survival?",
        options: [
          "Closure of stomata to prevent water loss (transpiration), which limits CO2 intake; benefits survival by preventing dehydration",
          "Degradation of chlorophyll due to excess heat; benefits survival by reducing metabolic stress",
          "Rapid increase in respiration rate; benefits survival by producing ATP in the dark",
          "Plasmolysis of root hair cells; benefits survival by halting nutrient absorption"
        ],
        correctIndex: 0,
        explanation: "To prevent excessive water loss (transpiration) in dry, hot conditions, plants close their stomata. This closure restricts the entry of carbon dioxide (CO2), which is a crucial reactant for the Calvin Cycle, thereby reducing the rate of photosynthesis.",
        inquiryPrompt: "How do desert plants (CAM plants) overcome this conflict between water conservation and photosynthesis?"
      },
      {
        id: 4,
        type: QuestionType.VISUAL_ANALYSIS,
        contextMaterial: "Under a light microscope, a cross-section of a green leaf reveals several layers: the upper epidermis, the palisade mesophyll layer containing numerous tightly packed elongated cells with chloroplasts, the spongy mesophyll layer with large air spaces, and the lower epidermis with stomatal openings.",
        text: "Based on this structural organization, why are palisade mesophyll cells located directly beneath the upper epidermis, and what is the function of the spongy mesophyll's air spaces?",
        options: [
          "Palisade cells are at the top to maximize light absorption; spongy mesophyll air spaces facilitate rapid gas diffusion of CO2 and O2",
          "Palisade cells are at the top to absorb water directly from dew; spongy spaces store excess sugars",
          "Palisade cells act as a protective barrier; spongy spaces insulate the leaf against freezing",
          "Palisade cells absorb nitrogen; spongy spaces serve as structural floatation devices"
        ],
        correctIndex: 0,
        explanation: "Palisade mesophyll cells contain the highest concentration of chloroplasts and are situated at the upper surface to capture maximum sunlight. Spongy mesophyll air spaces allow carbon dioxide to easily diffuse to the photosynthesizing cells and oxygen to diffuse out towards the stomata.",
        inquiryPrompt: "How would you modify this leaf structure to design a plant optimized for extremely low-light undergrowth conditions?"
      },
      {
        id: 5,
        type: QuestionType.MCQ,
        text: "In which specific areas of the chloroplast do the light-dependent reactions and the light-independent (dark) reactions take place?",
        options: [
          "Light reactions occur in the thylakoid membranes; dark reactions occur in the stroma",
          "Light reactions occur in the stroma; dark reactions occur in the thylakoid membranes",
          "Light reactions occur in the outer membrane; dark reactions occur in the cytoplasm",
          "Both reactions occur completely within the thylakoid lumen"
        ],
        correctIndex: 0,
        explanation: "Light-dependent reactions take place in the thylakoid membranes (grana) because that is where chlorophyll and photosystems are located. The light-independent reactions (Calvin Cycle) take place in the fluid stroma where the necessary enzymes (like RuBisCO) are suspended.",
        inquiryPrompt: "Why is the term 'dark reactions' considered a misnomer in modern botany?"
      }
    ],
    "quadratic": [
      {
        id: 1,
        type: QuestionType.MCQ,
        text: "What are the roots of the quadratic equation x^2 - 5x + 6 = 0, and what is the nature of these roots?",
        options: [
          "x = 2 and x = 3; real and distinct roots",
          "x = -2 and x = -3; real and distinct roots",
          "x = 1 and x = 6; imaginary roots",
          "x = 2 and x = 3; real and equal roots"
        ],
        correctIndex: 0,
        explanation: "Factoring the quadratic equation: x^2 - 5x + 6 = 0 gives (x - 2)(x - 3) = 0. Therefore, x = 2 and x = 3. Since the discriminant D = b^2 - 4ac = 25 - 24 = 1 > 0, the roots are real and distinct.",
        inquiryPrompt: "What would the value of the constant term have to be for this equation to have real and equal roots?"
      },
      {
        id: 2,
        type: QuestionType.WORD_PROBLEM,
        text: "For what values of 'k' will the quadratic equation 2x^2 + kx + 8 = 0 have equal and real roots?",
        options: [
          "k = 8 or k = -8",
          "k = 4 or k = -4",
          "k = 16 or k = -16",
          "k = 0"
        ],
        correctIndex: 0,
        explanation: "For equal roots, the discriminant D must be equal to 0. Here, D = b^2 - 4ac = k^2 - 4(2)(8) = k^2 - 64. Setting k^2 - 64 = 0 gives k^2 = 64, which means k = 8 or k = -8.",
        inquiryPrompt: "If k is greater than 8, what can we say about the graph of this quadratic function in relation to the x-axis?"
      },
      {
        id: 3,
        type: QuestionType.CASE_STUDY,
        contextMaterial: "An aerospace engineer is designing a rocket launch path. The altitude 'h' (in meters) of the rocket 't' seconds after launch is modeled by the quadratic function: h(t) = -5t^2 + 40t + 10. The team needs to determine when the rocket reaches its maximum height and what that maximum height is.",
        text: "At what time 't' does the rocket reach its maximum altitude, and what is this peak altitude?",
        options: [
          "t = 4 seconds; peak altitude is 90 meters",
          "t = 8 seconds; peak altitude is 10 meters",
          "t = 2 seconds; peak altitude is 70 meters",
          "t = 5 seconds; peak altitude is 85 meters"
        ],
        correctIndex: 0,
        explanation: "The vertex of a parabola y = at^2 + bt + c occurs at t = -b / (2a). For h(t) = -5t^2 + 40t + 10, the vertex is at t = -40 / (2 * -5) = 4 seconds. Substituting t = 4 into the function gives h(4) = -5(16) + 40(4) + 10 = -80 + 160 + 10 = 90 meters.",
        inquiryPrompt: "At what time will the rocket impact the ground (h = 0)?"
      },
      {
        id: 4,
        type: QuestionType.VISUAL_ANALYSIS,
        contextMaterial: "A graphing software displays a parabola that represents the quadratic equation y = ax^2 + bx + c. The parabola opens downwards, has its vertex in the second quadrant, and cuts the x-axis at two distinct points on the negative x-axis.",
        text: "Based on this visual representation, what can you conclude about the signs of the coefficients 'a', 'b', and 'c', and the value of the discriminant 'D'?",
        options: [
          "a < 0 (opens down), D > 0 (two roots), c < 0 (y-intercept is negative), b < 0",
          "a > 0 (opens up), D < 0 (no roots), c > 0, b > 0",
          "a < 0, D = 0, c > 0, b = 0",
          "a > 0, D > 0, c < 0, b < 0"
        ],
        correctIndex: 0,
        explanation: "Since the parabola opens downwards, a < 0. Since it cuts the x-axis at two distinct points, D > 0. Since the vertex lies in the second quadrant (negative x, positive y) and it opens down, the y-intercept (when x=0) must be on the negative y-axis, meaning c < 0.",
        inquiryPrompt: "How would the graph change if the value of coefficient 'a' is doubled while keeping 'b' and 'c' constant?"
      },
      {
        id: 5,
        type: QuestionType.MCQ,
        text: "What is the relationship between the coefficients of a quadratic equation ax^2 + bx + c = 0 and the sum and product of its roots?",
        options: [
          "Sum of roots = -b/a; Product of roots = c/a",
          "Sum of roots = b/a; Product of roots = -c/a",
          "Sum of roots = c/a; Product of roots = b/a",
          "Sum of roots = -c/a; Product of roots = -b/a"
        ],
        correctIndex: 0,
        explanation: "According to Vieta's formulas, for any quadratic equation ax^2 + bx + c = 0 with roots alpha and beta, the sum of the roots is alpha + beta = -b/a, and the product of the roots is alpha * beta = c/a.",
        inquiryPrompt: "If one root of a quadratic equation is the reciprocal of the other, what must be the relationship between 'a' and 'c'?"
      }
    ],
    "force": [
      {
        id: 1,
        type: QuestionType.MCQ,
        text: "According to Newton's universal law of gravitation, how does the gravitational force (F) between two masses change if the distance (d) between their centers is doubled?",
        options: [
          "The force becomes 1/4th of the original force",
          "The force is halved",
          "The force is doubled",
          "The force becomes 4 times the original force"
        ],
        correctIndex: 0,
        explanation: "Newton's Universal Law of Gravitation states that F = G * (m1 * m2) / d^2. Since the force is inversely proportional to the square of the distance, doubling the distance (2d) results in a force of 1/(2^2) = 1/4th of the original force.",
        inquiryPrompt: "What would happen to the force if the mass of both objects was also doubled simultaneously?"
      },
      {
        id: 2,
        type: QuestionType.WORD_PROBLEM,
        text: "An object of mass 12 kg is taken to the surface of the Moon. What will be its mass and its weight on the Moon? (Take acceleration due to gravity on Earth g = 10 m/s^2, and on Moon g_m = 1.63 m/s^2)",
        options: [
          "Mass is 12 kg; Weight is approximately 19.6 N",
          "Mass is 2 kg; Weight is approximately 120 N",
          "Mass is 12 kg; Weight is approximately 120 N",
          "Mass is 72 kg; Weight is approximately 19.6 N"
        ],
        correctIndex: 0,
        explanation: "Mass is an intrinsic property of matter and remains constant everywhere (12 kg on Moon). Weight depends on the local gravity: W = m * g_m = 12 * 1.63 = 19.56 N (approximately 19.6 N).",
        inquiryPrompt: "Why does weight change on different celestial bodies while mass remains identical?"
      },
      {
        id: 3,
        type: QuestionType.CASE_STUDY,
        contextMaterial: "During an educational space mission, astronauts drop a 5 kg steel ball and a 10 g feather inside a giant vacuum chamber on the surface of the Earth. In another test, they drop the same objects in a normal atmospheric classroom.",
        text: "What will be observed in both test environments regarding the acceleration and time of fall?",
        options: [
          "In the vacuum chamber, both objects fall with the exact same acceleration and hit the ground together; in the classroom, the steel ball hits first due to air resistance on the feather",
          "In both environments, the steel ball falls faster because it is heavier",
          "In both environments, they hit the ground together because gravity is constant",
          "In the vacuum chamber, the feather falls faster because it has less mass and less inertia"
        ],
        correctIndex: 0,
        explanation: "In a vacuum, there is no air resistance (drag). According to Galileo's principle and Newton's laws, all objects accelerate at the same rate 'g' regardless of their mass. In air, the feather experiences a large upward drag compared to its tiny weight, reaching terminal velocity almost instantly.",
        inquiryPrompt: "Can you explain why a heavier object does not fall faster than a lighter object in a vacuum, despite experiencing a larger gravitational pull?"
      },
      {
        id: 4,
        type: QuestionType.VISUAL_ANALYSIS,
        contextMaterial: "A high-precision linear graph plots the velocity of a free-falling stone against elapsed time. The stone was released from rest at a great height with no air resistance. The plot is a straight line passing through the origin (0,0) and ascending steadily.",
        text: "What does the slope of this line represent, and what is its value in standard SI units near the Earth's surface?",
        options: [
          "Acceleration due to gravity; approximately 9.8 m/s^2",
          "The mass of the stone; approximately 10 kg",
          "The height from which the stone was dropped; approximately 100 meters",
          "The kinetic energy of the stone; approximately 98 Joules"
        ],
        correctIndex: 0,
        explanation: "On a velocity-time graph, the slope represents acceleration. For a free-falling body with no air resistance, the acceleration is constant and equals the acceleration due to gravity (g), which is approximately 9.8 m/s^2.",
        inquiryPrompt: "How would the velocity-time graph look if air resistance was taken into account?"
      },
      {
        id: 5,
        type: QuestionType.MCQ,
        text: "Which of Newton's laws of motion provides a qualitative definition of force, and which provides a quantitative measurement of force?",
        options: [
          "Newton's First Law defines force qualitatively (inertia); Newton's Second Law measures force quantitatively (F=ma)",
          "Newton's Second Law defines force qualitatively; Newton's Third Law measures force quantitatively",
          "Newton's Third Law defines force qualitatively; Newton's First Law measures force quantitatively",
          "Newton's First Law measures force; Newton's Third Law defines it qualitatively"
        ],
        correctIndex: 0,
        explanation: "Newton's First Law states that a body remains at rest or in uniform motion unless acted upon by an external force, providing the qualitative concept of force. Newton's Second Law quantifies force by stating that the force is the rate of change of momentum, leading to the formula F = ma.",
        inquiryPrompt: "State Newton's Third Law of Motion and give one example of it in jet propulsion."
      }
    ],
    "rights": [
      {
        id: 1,
        type: QuestionType.MCQ,
        text: "Which article of the Constitution of India guarantees the Right to Equality, and what is its core legal tenet?",
        options: [
          "Article 14; State shall not deny to any person equality before the law or equal protection of laws within India",
          "Article 21; Protection of life and personal liberty",
          "Article 19; Protection of freedom of speech and expression",
          "Article 32; Right to constitutional remedies"
        ],
        correctIndex: 0,
        explanation: "Article 14 of the Indian Constitution guarantees equality before the law and equal protection of the laws to all persons within the territory of India, prohibiting discrimination on grounds of religion, race, caste, sex, or place of birth.",
        inquiryPrompt: "What is the difference between 'Equality before Law' and 'Equal Protection of Laws'?"
      },
      {
        id: 2,
        type: QuestionType.MCQ,
        text: "Which Fundamental Right, described by Dr. B.R. Ambedkar as the 'Heart and Soul' of the Constitution, allows citizens to approach the Supreme Court directly for the enforcement of their rights?",
        options: [
          "Right to Constitutional Remedies (Article 32)",
          "Right to Freedom of Religion (Article 25)",
          "Right to Freedom (Article 19)",
          "Right against Exploitation (Article 23)"
        ],
        correctIndex: 0,
        explanation: "Dr. B.R. Ambedkar called Article 32 (Right to Constitutional Remedies) the 'Heart and Soul' because it provides a mechanism for citizens to petition the Supreme Court directly to enforce their Fundamental Rights via writs like Habeas Corpus, Mandamus, Prohibition, Certiorari, and Quo Warranto.",
        inquiryPrompt: "What is a writ of Habeas Corpus, and when is it issued?"
      },
      {
        id: 3,
        type: QuestionType.CASE_STUDY,
        contextMaterial: "A local municipality passes a regulation prohibiting street vendors from operating in any commercial zone. A group of affected vendors petitions the High Court, claiming that this regulation completely deprives them of their livelihood without reasonable justification, violating their constitutional rights.",
        text: "Which article of the Constitution of India is most directly violated by the municipality's blanket ban, and what legal test must the regulation pass?",
        options: [
          "Article 19(1)(g) (Right to practice any profession or carry on any trade or business); must pass the test of 'reasonable restrictions' in public interest",
          "Article 25 (Freedom of religion); must pass the secular test",
          "Article 17 (Abolition of untouchability); must pass the social equality test",
          "Article 30 (Right of minorities to establish educational institutions); must pass the autonomy test"
        ],
        correctIndex: 0,
        explanation: "Article 19(1)(g) guarantees the right to practice any profession, trade, or business. However, the State can impose 'reasonable restrictions' in the interest of the general public under Article 19(6). A total, arbitrary ban without balancing public interest is usually held unconstitutional as an unreasonable restriction.",
        inquiryPrompt: "How can a city balance the fundamental rights of street vendors with public safety and traffic management?"
      },
      {
        id: 4,
        type: QuestionType.VISUAL_ANALYSIS,
        contextMaterial: "A public chart displays the Fundamental Rights guaranteed by the Constitution of India. It shows six main pillars: Right to Equality, Right to Freedom, Right against Exploitation, Right to Freedom of Religion, Cultural and Educational Rights, and Right to Constitutional Remedies. A historical note mentions that there were originally seven pillars.",
        text: "Which fundamental right was removed from the list of Fundamental Rights, and by which amendment?",
        options: [
          "Right to Property; removed by the 44th Constitutional Amendment Act in 1978",
          "Right to Education; removed by the 86th Constitutional Amendment",
          "Right to Information; removed by the 42nd Constitutional Amendment",
          "Right to Work; removed by the 24th Constitutional Amendment"
        ],
        correctIndex: 0,
        explanation: "The Right to Property was originally a Fundamental Right under Article 19(1)(f) and Article 31. The 44th Amendment Act of 1978 deleted it from the list of Fundamental Rights and made it a simple legal right under Article 300A.",
        inquiryPrompt: "What is the primary legal difference between a Fundamental Right and a Constitutional/Legal Right?"
      },
      {
        id: 5,
        type: QuestionType.MCQ,
        text: "Which of the following statements correctly distinguishes between Fundamental Rights and Directive Principles of State Policy (DPSP) in the Indian Constitution?",
        options: [
          "Fundamental Rights are justiciable (enforceable in court); DPSPs are non-justiciable (moral guidelines for the State)",
          "Fundamental Rights are non-justiciable; DPSPs are justiciable",
          "Both are justiciable and can be enforced in court with equal authority",
          "Neither can be enforced in court, they are merely symbolic preamble statements"
        ],
        correctIndex: 0,
        explanation: "Fundamental Rights are justiciable, meaning a citizen can move courts if they are violated. DPSPs (Part IV) are non-justiciable; they are fundamental in the governance of the country and it is the duty of the State to apply them in making laws, but courts cannot force their implementation due to financial and resource constraints.",
        inquiryPrompt: "Why did the makers of the Constitution make DPSPs non-justiciable while making Fundamental Rights justiciable?"
      }
    ]
  };

  // Check if topic is a pre-defined offline topic
  let matchedKey = "";
  if (topicLower.includes("light") || topicLower.includes("reflect") || topicLower.includes("refract") || topicLower.includes("lens")) {
    matchedKey = "light";
  } else if (topicLower.includes("photosynthesis") || topicLower.includes("plant") || topicLower.includes("chloroplast") || topicLower.includes("leaf") || topicLower.includes("biology") || topicLower.includes("life process")) {
    matchedKey = "photosynthesis";
  } else if (topicLower.includes("quadrat") || topicLower.includes("equation") || topicLower.includes("polynomial") || topicLower.includes("math")) {
    matchedKey = "quadratic";
  } else if (topicLower.includes("force") || topicLower.includes("gravit") || topicLower.includes("gravity") || topicLower.includes("physics") || topicLower.includes("weight")) {
    matchedKey = "force";
  } else if (topicLower.includes("right") || topicLower.includes("constitut") || topicLower.includes("polity") || topicLower.includes("fundamental") || topicLower.includes("civics") || topicLower.includes("social")) {
    matchedKey = "rights";
  }

  if (matchedKey && offlineDatabase[matchedKey]) {
    // Return copies of the pre-defined questions
    return JSON.parse(JSON.stringify(offlineDatabase[matchedKey]));
  }

  // Fallback to sentence extraction if source material is supplied
  if (sentences.length >= 3) {
    const s1 = sentences[0];
    const s2 = sentences[1];
    const s3 = sentences[2];
    
    questions.push({
      id: 1,
      type: QuestionType.MCQ,
      contextMaterial: `Based on the provided syllabus material: "${s1}"`,
      text: `According to the educational guidelines, which statement best aligns with the core thesis of "${topic}" discussed above?`,
      options: [
        `It represents a foundational mechanism within the study of ${topic}.`,
        `It indicates that the primary variables are static and do not interact.`,
        `It is largely obsolete and replaced by alternative methods.`,
        `It has no direct application in modern diagnostic environments.`
      ],
      correctIndex: 0,
      explanation: `The material states: "${s1}". This confirms its fundamental role and modern relevance in our analysis of ${topic}.`,
      inquiryPrompt: `How would you explain this core concept to a peer using a real-world analogy?`
    });

    questions.push({
      id: 2,
      type: QuestionType.WORD_PROBLEM,
      contextMaterial: `Consider the following excerpt: "${s2}"`,
      text: `In a practical scenario applying this principle to "${topic}", if we increase the scope or intensity by 50%, what is the expected outcome?`,
      options: [
        `Proportional advancement and optimized feedback loops`,
        `Immediate system failure and resource exhaustion`,
        `No change in the final outcomes or diagnostic accuracy`,
        `A complete reversal of the underlying mechanics`
      ],
      correctIndex: 0,
      explanation: `The concept defined as "${s2}" suggests that increasing input parameters leads to an active scale of outcomes, enhancing the study of ${topic}.`,
      inquiryPrompt: `What variables would you need to keep constant to test this hypothesis?`
    });

    questions.push({
      id: 3,
      type: QuestionType.CASE_STUDY,
      contextMaterial: `Case Study Excerpt: "${s3}"
      
An academic group is attempting to implement this specific concept of ${topic} in their diagnostic laboratory under a tight deadline. They notice that minor deviations in initial parameters lead to compound variations.`,
      text: `What is the most methodical approach for the group to stabilize their diagnostic results?`,
      options: [
        `Formulate standardized controls and document all system deviations`,
        `Disregard the source material and build an entirely new framework`,
        `Increase the test timer limit and accept high margin of error`,
        `Rely purely on mock parameters without empirical verification`
      ],
      correctIndex: 0,
      explanation: `The case study highlights that standardizing controls and systematic documentation is critical to manage compound variations when analyzing "${s3}".`,
      inquiryPrompt: `What is the risk of not documenting minor parameter variations in this study?`
    });
  }

  // Standard Smart General Fallback Generator (Ensuring highly realistic & specific questions incorporating topic name)
  const isTechnical = /science|physic|chem|biolog|math|calcul|comput|tech|engine|circuit|program|lab|algorithm|mechanic/i.test(subject) ||
                      /science|physic|chem|biolog|math|calcul|comput|tech|engine|circuit|program|lab|algorithm|mechanic/i.test(topicLower);

  if (isTechnical) {
    if (questions.length < 1) {
      questions.push({
        id: 1,
        type: QuestionType.MCQ,
        text: `In the academic study of "${capTopic}", which of the following represents a major foundational challenge or primary principle?`,
        options: [
          `Developing systematic empirical models to measure how ${topic} behaves under altered parameters.`,
          `Disregarding experimental feedback loops entirely to focus on qualitative historical archives.`,
          `Assuming all external environments remain static and have no influence on ${topic}.`,
          `Limiting research to simplified ancient models that can no longer be verified.`
        ],
        correctIndex: 0,
        explanation: `Studying "${capTopic}" requires establishing methodical, empirical models to predict behavior when critical parameters are changed, which is essential for advanced concept application.`,
        inquiryPrompt: `Can you identify a real-life situation where this foundational challenge of "${capTopic}" is directly observed?`
      });
    }

    if (questions.length < 2) {
      questions.push({
        id: 2,
        type: QuestionType.WORD_PROBLEM,
        text: `Consider a diagnostic test environment evaluating a "${capTopic}" system. If the baseline efficiency is 75%, and introducing a standardized catalyst parameter increases its performance by a factor of 1.2x, what is the new calculated system output?`,
        options: [
          `90% output (reflecting high responsive scaling)`,
          `85% output`,
          `80% output`,
          `95% output`
        ],
        correctIndex: 0,
        explanation: `Multiplying the baseline efficiency by the performance enhancement factor: 75% * 1.2 = 90%. This reflects a highly positive, scalable relationship.`,
        inquiryPrompt: `What physical or structural limits might prevent this "${capTopic}" system from achieving a theoretical 100% efficiency?`
      });
    }

    if (questions.length < 3) {
      questions.push({
        id: 3,
        type: QuestionType.CASE_STUDY,
        contextMaterial: `A specialized research team is investigating the practical implications of "${capTopic}" in a high-performance environment. While traditional theories suggest a simple linear correlation between inputs and outputs, new experimental data strongly implies a non-linear threshold behavior where progress scales exponentially after a critical point.`,
        text: `Based on this case study, how should the team adjust their analytical framework to model "${capTopic}" accurately?`,
        options: [
          `Adopt non-linear mathematical models and closely observe behavior near the critical threshold.`,
          `Ignore the new data as a minor anomaly and maintain their simple linear models.`,
          `Reduce the scope of the study to exclude complex variable interactions.`,
          `Suspend the research project completely until ideal conditions are met.`
        ],
        correctIndex: 0,
        explanation: `Because "${capTopic}" exhibits non-linear threshold behavior in this scenario, the team must implement non-linear modeling and pay close attention to the boundary conditions near the critical point to ensure correct findings.`,
        inquiryPrompt: `How would you design a simple, controlled experiment to identify the exact numerical threshold of "${capTopic}"?`
      });
    }

    if (questions.length < 4) {
      questions.push({
        id: 4,
        type: QuestionType.VISUAL_ANALYSIS,
        contextMaterial: `An academic flowchart maps the relationships between the components of "${capTopic}". A central coordinate, labeled 'Core Dynamics', connects directly to three adjacent nodes: 'Structural Inputs', 'Process Controls', and 'Feedback Optimization'.`,
        text: `If an operational block or bottleneck occurs at the 'Process Controls' node, which connected component of "${capTopic}" is most likely to suffer immediate degradation?`,
        options: [
          `Feedback Optimization (which relies on processed inputs from controls)`,
          `Structural Inputs (which acts as a preceding generator)`,
          `The parent subject entirely`,
          `None of the connected subsystems are affected`
        ],
        correctIndex: 0,
        explanation: `In the flow of "${capTopic}", Feedback Optimization is downstream of Process Controls, meaning any restriction in control immediately limits the optimization feedback cycle.`,
        inquiryPrompt: `How could you introduce an alternative bypass loop to preserve system stability in "${capTopic}" if the primary controls fail?`
      });
    }

    if (questions.length < 5) {
      questions.push({
        id: 5,
        type: QuestionType.MCQ,
        text: `In professional academic testing, which approach consistently yields the most reliable, long-term mastery of "${capTopic}"?`,
        options: [
          `A balanced approach combining strong conceptual definitions with interactive, case-based problem solving.`,
          `Memorizing key terms and standard answers without understanding the underlying mechanics.`,
          `Focusing only on basic, low-difficulty questions to avoid challenging concepts.`,
          `Bypassing systematic practice to rely on instinctual guessing during assessments.`
        ],
        correctIndex: 0,
        explanation: `Consistent mastery of "${capTopic}" is achieved by pairing solid theoretical foundation with contextual, applied problem-solving practice.`,
        inquiryPrompt: `Give an example of how you can apply the theory of "${capTopic}" to solve a practical problem in your community.`
      });
    }
  } else {
    // Non-Technical / Applied Skills / Humanities / Sports Fallbacks
    if (questions.length < 1) {
      questions.push({
        id: 1,
        type: QuestionType.MCQ,
        text: `In the systematic study of "${capTopic}", which of the following represents a primary core value or foundational principle?`,
        options: [
          `Establishing consistent, structured practices and methods to sustain improvement.`,
          `Restricting the practice only to rigid historical guidelines without any adaptation.`,
          `Assuming that external factors have absolutely no impact on overall performance.`,
          `Ignoring feedback and performing routines at random intervals.`
        ],
        correctIndex: 0,
        explanation: `Mastery of "${capTopic}" relies on regular, structured practice combined with purposeful execution to build stable, long-term progression.`,
        inquiryPrompt: `What is the risk of not having a structured routine in "${capTopic}"?`
      });
    }

    if (questions.length < 2) {
      questions.push({
        id: 2,
        type: QuestionType.WORD_PROBLEM,
        text: `Consider a group practicing "${capTopic}". If the base participation efficiency is 75%, and introducing a standardized guidance parameter increases performance by a factor of 1.2x, what is the new active performance output?`,
        options: [
          `90% active performance`,
          `85% active performance`,
          `80% active performance`,
          `95% active performance`
        ],
        correctIndex: 0,
        explanation: `Multiplying the base efficiency by the guidance factor: 75% * 1.2 = 90%. This shows how structured guidance directly improves active output.`,
        inquiryPrompt: `What common challenges might limit progression under this "${capTopic}" framework?`
      });
    }

    if (questions.length < 3) {
      questions.push({
        id: 3,
        type: QuestionType.CASE_STUDY,
        contextMaterial: `A training group is investigating the long-term benefits of "${capTopic}". Traditional approaches suggest progress is linear, but new longitudinal tracking demonstrates that regular practice combined with proper technique yields rapid, exponential progression after an initial developmental phase.`,
        text: `Based on this case study, how should the group structure their sessions to optimize the benefits of "${capTopic}"?`,
        options: [
          `Focus on consistent, proper technique first to establish a solid foundation before increasing intensity.`,
          `Increase intensity immediately, regardless of form or foundational technique.`,
          `Maintain a low, unchanging level of practice and avoid challenging routines.`,
          `Discontinue the sessions entirely as soon as minor fatigue is experienced.`
        ],
        correctIndex: 0,
        explanation: `Establishing proper technique and a consistent foundation in "${capTopic}" is vital to safely unlocking the exponential benefits that accumulate over time.`,
        inquiryPrompt: `How would you design a simple schedule to monitor consistent progress in "${capTopic}"?`
      });
    }

    if (questions.length < 4) {
      questions.push({
        id: 4,
        type: QuestionType.VISUAL_ANALYSIS,
        contextMaterial: `An academic structural map charts the main domains of "${capTopic}". The central pillar, labeled 'Core Practice', connects directly to three adjacent modules: 'Foundational Knowledge', 'Active Training', and 'Mindful Integration'.`,
        text: `If a participant experiences a bottleneck or lack of progress in 'Foundational Knowledge', which adjacent module of "${capTopic}" is most likely to suffer immediate difficulties?`,
        options: [
          `Mindful Integration (which relies on a deep, stable understanding of foundational principles)`,
          `Active Training (which acts as a completely separate isolated speed drill)`,
          `The subject title page`,
          `None of the connected areas are affected in any way`
        ],
        correctIndex: 0,
        explanation: `In the practice map of "${capTopic}", holistic integration and progression rely on foundational understanding; a weak foundation limits the ability to integrate advanced techniques.`,
        inquiryPrompt: `How would you address a decline in foundational knowledge during active training of "${capTopic}"?`
      });
    }

    if (questions.length < 5) {
      questions.push({
        id: 5,
        type: QuestionType.MCQ,
        text: `In professional education and training, which methodology consistently yields the best long-term retention of "${capTopic}"?`,
        options: [
          `A balanced approach combining clear conceptual definitions, regular practical sessions, and active self-reflection.`,
          `Memorizing key definitions for exams without ever practicing the physical or mental components.`,
          `Sprinting through the syllabus to finish early without checking for depth of understanding.`,
          `Relying entirely on passive observation of others without any personal participation.`
        ],
        correctIndex: 0,
        explanation: `Long-term retention and mastery of "${capTopic}" are best achieved by balancing clear concept knowledge with hands-on practice and self-assessment.`,
        inquiryPrompt: `How can you integrate the principles of "${capTopic}" into your daily academic routine?`
      });
    }
  }

  return questions;
};

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
  let difficultyContext = "";
  if (difficulty && difficulty !== DifficultyLevel.DEFAULT) {
    if (difficulty === DifficultyLevel.LOW) {
      difficultyContext = "CRITICAL DIFFICULTY LEVEL: Beginner. The questions MUST be suitable for a beginner/introductory level. Focus on foundational concepts, fundamental recall, direct textbook definitions, and basic conceptual application. Avoid tricky multi-step logic, complex mathematical derivations, or highly technical scenarios. Provide clear, straightforward distractor choices.";
    } else if (difficulty === DifficultyLevel.MEDIUM) {
      difficultyContext = "CRITICAL DIFFICULTY LEVEL: Intermediate. The questions MUST be of standard/moderate difficulty. Focus on standard syllabus applications, moderate multi-step reasoning, analytical understanding, and standard problem solving. Distractors should be realistic and require solid concept comprehension to rule out.";
    } else if (difficulty === DifficultyLevel.HIGH) {
      difficultyContext = "CRITICAL DIFFICULTY LEVEL: Advanced. The questions MUST be highly challenging and advanced. Focus on elite cognitive demands, deep synthesis, tricky or subtle scenarios, multi-layered problem-solving, and critical thinking. Distractors must be highly plausible and require precise mastery to differentiate.";
    } else {
      difficultyContext = `The difficulty level is: ${difficulty}. Adjust question complexity and cognitive depth accordingly.`;
    }
  }
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

  // Speed & Grade Level customization
  let speedAndGradePrompt = "";
  let allowedQuestionTypes = "MCQ, WORD_PROBLEM";
  
  if (eduLevel === 'School') {
    if (gradeInt <= 5) {
      allowedQuestionTypes = "MCQ"; // Keep it ultra fast and basic
      speedAndGradePrompt = `
        TARGET LEVEL: PRIMARY SCHOOL (Grade ${gradeInt}).
        CRITICAL ACCESSIBILITY & COMPLEXITY RULE:
        1. Keep everything exceptionally simple, enjoyable, and clear.
        2. Use vocabulary appropriate for a young learner (7-10 years old).
        3. Do NOT make the questions difficult, subtle, or complex. Focus on straightforward definitions and fundamental recall.
        4. Absolutely NO Case Studies or Visual Analyses. Keep questions strictly as single-question MCQs.
      `;
    } else if (gradeInt <= 9) {
      allowedQuestionTypes = "MCQ, WORD_PROBLEM";
      speedAndGradePrompt = `
        TARGET LEVEL: MIDDLE SCHOOL / LOWER SECONDARY (Grade ${gradeInt}).
        CRITICAL ACCESSIBILITY & COMPLEXITY RULE:
        1. Keep questions straightforward, clear, and focused on core textbook facts.
        2. Do NOT use complicated reasoning or trick options. Make them approachable and encouraging.
        3. Only generate basic MCQs and very simple WORD_PROBLEMs. Do NOT generate CASE_STUDYs or VISUAL_ANALYSISs as they slow down the generation.
      `;
    } else if (gradeInt === 10 || gradeInt === 12) {
      allowedQuestionTypes = "MCQ, WORD_PROBLEM, CASE_STUDY, VISUAL_ANALYSIS";
      speedAndGradePrompt = `
        TARGET LEVEL: BOARD CLASS (Grade ${gradeInt}).
        CRITICAL ACCESSIBILITY & COMPLEXITY RULE:
        1. Align strictly with the official national/state Board Examination Blueprint (e.g., CBSE/ICSE Board papers).
        2. Maintain standard board-level rigor and structure.
        3. Include standard questions matching the official alignment paper format.
      `;
    } else {
      allowedQuestionTypes = "MCQ, WORD_PROBLEM, CASE_STUDY, VISUAL_ANALYSIS";
      speedAndGradePrompt = `
        TARGET LEVEL: HIGH SCHOOL (Grade ${gradeInt}).
        CRITICAL ACCESSIBILITY & COMPLEXITY RULE:
        1. Align with secondary school textbook curriculum and level-appropriate questions.
      `;
    }
  } else {
    allowedQuestionTypes = "MCQ, WORD_PROBLEM, CASE_STUDY, VISUAL_ANALYSIS";
  }

  // Simple-to-complex progressive round logic (Round 1 attraction)
  const activeLevel = profile.level || 1;
  let roundProgressivePrompt = "";
  if (activeLevel === 1) {
    roundProgressivePrompt = `
      CURRENT ROUND: Round 1 (Confidence Builder & Topic Attraction).
      CRITICAL RULE:
      1. This is the student's very first contact with this topic in this session.
      2. You MUST make the questions extremely encouraging, clear, and simple to "attract" and motivate the student.
      3. Focus on highly attractive, fundamental core facts or interesting everyday applications of "${topic}".
      4. Avoid high complexity, fine details, or confusing distractors. Build confidence first!
    `;
  } else if (activeLevel === 2) {
    roundProgressivePrompt = `
      CURRENT ROUND: Round 2 (Syllabus Application).
      CRITICAL RULE:
      1. Introduce standard textbook difficulty and core curriculum applications of "${topic}".
      2. Questions should transition from simple to moderate, testing active recall and standard usage of terminology.
    `;
  } else {
    roundProgressivePrompt = `
      CURRENT ROUND: Round ${activeLevel} (Advanced Integration).
      CRITICAL RULE:
      1. Step-by-step progression from simple to complex. Focus on multi-step analytical thinking, integration, and thorough mastery of "${topic}".
    `;
  }

  // Strict Token Optimization Instructions to fix "taking too long"
  const latencyOptimizationPrompt = `
    LATENCY/SPEED OPTIMIZATION (MANDATORY):
    To ensure extremely fast question generation and low API latency, you MUST keep the output highly compressed, compact, and concise:
    1. Keep 'text' (question body) clear but short (maximum 15-20 words).
    2. Keep each of the 4 'options' concise and direct (maximum 5-8 words).
    3. Keep the 'explanation' clear and brief (maximum 15-20 words). Avoid long paragraphs.
    4. Keep 'inquiryPrompt' brief and punchy (maximum 10 words).
    5. For MCQ and WORD_PROBLEM types, leave 'contextMaterial' as an empty string "".
    By strictly limiting output length, response generation will complete 3x faster.
  `;

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
    1. Your absolute primary task is to generate questions derived EXCLUSIVELY from this source material, focusing strictly on the specific topic "${topic}" within it.
    2. However, you MUST still respect the Educational Setting / Stream (${eduLevel}), target year/academic stage (${profile.gradeLevel}), and standards (${profile.board || "General"}).
    3. Ensure the vocabulary and complexity are completely appropriate for ${profile.gradeLevel} and relevant to "${topic}".
    
    SOURCE MATERIAL:
    """
    ${sourceMaterial}
    """
    ` 
    : `CURRICULUM-BASELINE MODE (STRICT):
    No private source material was provided. 
    1. You MUST generate questions based on the official curriculum/course standards for ${eduLevel} - ${profile.board || "General"}.
    2. Every single question MUST focus on the core pillars, concepts, and details of the specific topic "${topic}" within the subject "${profile.subject}". Do not generate questions from other areas of "${profile.subject}".
    3. Refer to standard academic structures matching ${profile.gradeLevel} for this specific topic "${topic}".`;

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
  
  ${speedAndGradePrompt}
  ${roundProgressivePrompt}
  ${latencyOptimizationPrompt}

  TASK: Generate exactly 5 questions for this Batch. 
  
  PEDAGOGICAL GOAL (EXAM EXCELLENCE):
  - PRIMARY OBJECTIVE: Every single question, scenario, and answer option must be 100% relevant and directly related to "${topic}" in the context of "${profile.subject}". Do NOT stray from "${topic}". Do NOT generate generic general-knowledge questions.
  - Test foundational understanding, conceptual clarity, and the ability to apply the specific topic "${topic}".
  - Questions must mirror the complexity (MCQs, Case Studies, etc.) of actual board or exam patterns.
  - Provide an 'inquiryPrompt' as a "Diagnostic Challenge" to help students identify areas for further study.
  
  MODE-SPECIFIC GUIDANCE:
  - INDIVIDUAL CHALLENGE: Focus on incremental mastery. Questions should help the student identify gaps in their understanding of the "${topic}" syllabus.
  - CLASSROOM BATTLE: Questions should be competitive and balanced, designed to test the group's collective knowledge of core curriculum points of "${topic}" under pressure.
  
  CRITICAL ACCORDING TO CURRICULUM & UNIQUENESS (CLASSROOM ANTI-REPEAT PROTOCOL):
  - Ensure 100% adherence strictly to the official curriculum of "${topic}" for this level. No generic questions. Use exact curriculum terminology.
  - To absolutely prevent repeating questions between different groups, you MUST use the RandomSeed (${seed}) to deeply alter the sub-topic focus, problem formats, and numerical values of "${topic}". 
  - Group ${groupName || "N/A"} must receive an entirely distinct set of 5 questions than any other group. DO NOT recycle common starter questions.
  
  QUESTION TYPES DISTRIBUTION:
  - Allowed types for this level are: ${allowedQuestionTypes}.
  - Only use CASE_STUDY or VISUAL_ANALYSIS if permitted by the allowed types, otherwise strictly generate high quality MCQ and WORD_PROBLEM.
  
  GUIDELINES:
  - CASE_STUDY: Provide a short paragraph (50-100 words) in 'contextMaterial' directly about a real-world scenario of "${topic}" that the student must analyze to answer the question.
  - VISUAL_ANALYSIS: Describe a diagram, graph, or physical setup of "${topic}" in 'contextMaterial' (e.g., "A diagram shows standard structures/equations of ${topic}...") and ask a question based on it. (Do NOT provide images, purely textual visual descriptions).
  - The 'explanation' must be detailed but highly concise.
  - The 'text' field MUST contain the actual question and MUST NOT be empty.`;

  try {
    // Try Gemini first with rotation
    const geminiKeys = getHealthyAIKeys();

    let lastError: any = null;

    for (const key of geminiKeys) {
      try {
        console.log(`Attempting question generation with Gemini key ending in ...${key.slice(-5)}`);
        const ai = getAIWithKey(key);
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            systemInstruction: `You are an expert AI Tutor and curriculum designer. 
YOUR ABSOLUTE HIGHEST PRIORITY: Every generated question, scenario, answer option, and explanation MUST be deeply, strictly, and 100% relevant to the Subject "${profile.subject}" and the specific Topic "${topic}". 
Do NOT generate generic, loosely-connected, or general subject questions. If the topic is "${topic}", every single question must directly assess concepts, definitions, or applications of "${topic}".
Output valid JSON only.`,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.NUMBER },
                  type: { type: Type.STRING, description: "MCQ, WORD_PROBLEM, CASE_STUDY, or VISUAL_ANALYSIS" },
                  contextMaterial: { type: Type.STRING, description: "Scenario text (only for CASE_STUDY or VISUAL_ANALYSIS, max 40 words, otherwise empty)" },
                  text: { type: Type.STRING, description: "The question text, clear and concise, max 20 words" },
                  options: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "Exactly 4 options, very concise, max 8 words each"
                  },
                  correctIndex: { type: Type.NUMBER, description: "0-3" },
                  explanation: { type: Type.STRING, description: "Brief explanation, max 15 words" },
                  inquiryPrompt: { type: Type.STRING, description: "Brief follow-up challenge, max 8 words" }
                },
                required: ["id", "type", "text", "options", "correctIndex", "explanation", "inquiryPrompt"]
              }
            },
            temperature: 0.2,
            maxOutputTokens: 1000
          }
        });

        const cleaned = repairJson(response.text || "[]");
        const parsed = JSON.parse(cleaned);
        
        // Report success so this key is prioritized as healthy
        reportKeySuccess(key);
        
        return validateAndFormatQuestions(parsed, topic);
      } catch (geminiErr: any) {
        lastError = geminiErr;
        console.warn(`Gemini key failed: ${geminiErr.message || geminiErr}. Trying next key...`);
        
        // Report failure to blacklist this key instantly
        reportKeyFailure(key, geminiErr);
        
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
        console.warn("No Groq/Grok fallback configured. Falling back to offline question generator.");
        return validateAndFormatQuestions(generateOfflineQuizQuestions(profile, topic, sourceMaterial), topic);
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
      if (!Array.isArray(parsed) && parsed.items) parsed = parsed.items;
      if (!Array.isArray(parsed) && parsed.quiz) parsed = parsed.quiz;
      if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
        const foundArray = Object.values(parsed).find(val => Array.isArray(val));
        if (foundArray) {
          parsed = foundArray;
        }
      }
      
      return validateAndFormatQuestions(parsed, topic);
    } catch (fallbackErr: any) {
      console.warn("Groq/Grok fallback failed, activating offline question generator:", fallbackErr);
      return validateAndFormatQuestions(generateOfflineQuizQuestions(profile, topic, sourceMaterial), topic);
    }
  } catch (err: any) {
    console.error("Generation Error (falling back to offline generator):", err);
    return validateAndFormatQuestions(generateOfflineQuizQuestions(profile, topic, sourceMaterial), topic);
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
  const geminiKeys = getHealthyAIKeys();
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
      
      reportKeySuccess(key);
      return bytes.buffer;
    } catch (e: any) {
      console.warn("TTS generation failed with key:", e.message || e);
      reportKeyFailure(key, e);
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
    
    try {
      window.speechSynthesis.cancel(); // Stop any pending reading
    } catch (cancelErr) {
      console.warn("speechSynthesis.cancel failed: ", cancelErr);
    }
    
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
        console.warn("SpeechSynthesis status (non-critical):", err.error || err);
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        if (onEnd) onEnd();
        resolve();
      };
      
      try {
        window.speechSynthesis.speak(utterance);
      } catch (speakErr) {
        console.warn("speechSynthesis.speak failed synchronously (iframe security restriction):", speakErr);
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        if (onEnd) onEnd();
        resolve();
      }
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

/**
 * Calls Gemini to analyze student diagnostics and test history,
 * and outputs a structured Markdown roadmap.
 */
export const generateRoadmapText = async (profile: UserProfile): Promise<string> => {
  const geminiKeys = getHealthyAIKeys();
  const history = profile.testHistory || [];
  
  const testHistoryStr = history.length > 0
    ? history.map(t => `- Subject: ${t.subject}, Topic: "${t.topic}", Score: ${t.score}/${t.total} (${Math.round((t.score / t.total) * 100)}%) on ${t.date}`).join('\n')
    : "No test records found yet. Suggest starting their first diagnostic quiz or uploading source readings.";

  const prompt = `You are an elite, highly precise Academic Mentor and Study Planner at ScholarEarn. Your objective is to design a highly personalized, structured study roadmap for a student.

Analyze the student's academic profile below:
- Name: ${profile.name || 'Scholar Student'}
- Grade / Education Level: ${profile.gradeLevel || 'Not configured'}
- Syllabus Board: ${profile.board || 'Not configured'}
- Target Subject: ${profile.subject || 'All subjects'}
- Current Active Topic: ${profile.topic || 'General study'}
- Focus Theme: ${profile.focus || 'General Studies'}
- Current Level: Level ${profile.level || 1}
- Total Points: ${profile.totalPoints || 0}
- Current General Study Difficulty Level: ${profile.difficulty || 'Beginner'}

Student Test History:
${testHistoryStr}

STYLING & COMPOSITION RULES:
1. Do not use complex raw HTML. Rely on standard clean Markdown formatting.
2. Use markdown titles ("# Heading", "## Subheading", "### Smaller Heading") and standard list items ("- Item").
3. DO NOT output code blocks or JSON. Output plain text with Markdown headers only.

Structure your response using these exact sections:

# Core Diagnostics & Academic Strengths
Assess their mastery levels. Mention their strengths (based on test history with high scores) and highlight structural gaps (topics with low scores, i.e., score/total ratio < 70%, or topics they haven't practiced enough yet).

# Targeted Topics to Master Next
List 3 to 4 specific learning topics or sub-topics they must study next to overcome their weaknesses or progress within their syllabus focus (${profile.focus}). For each recommended topic, provide a 1-sentence rationale explaining why it is critical.

# Actionable 4-Week Study Plan
Provide a clear, week-by-week timeline:
- Week 1: High-priority foundations (addressing immediate gaps)
- Week 2: Concept consolidation and practice drills
- Week 3: Active recall challenges and advanced application
- Week 4: Multi-team battles and mock evaluation

# Pro-Level Study Techniques
Suggest 2 targeted pedagogical methods (e.g., Feynman Technique, Pomodoro variation, Spaced Repetition) customized to their focus (${profile.focus}) and current difficulty setting (${profile.difficulty || 'Beginner'}).

Be extremely professional, encouraging, and academically precise. Avoid generic fluff.`;

  for (const key of geminiKeys) {
    try {
      const ai = getAIWithKey(key);
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
      });
      const responseText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (responseText) {
        reportKeySuccess(key);
        return responseText;
      }
    } catch (e: any) {
      console.warn("Roadmap text generation failed with key, trying fallback:", e.message || e);
      reportKeyFailure(key, e);
    }
  }

  // Fallback if all keys fail or no keys
  return `# Core Diagnostics & Academic Strengths
Based on your current profile settings and level ${profile.level}, you are building foundations in ${profile.subject || 'General Topics'}.

# Targeted Topics to Master Next
- Deep review of "${profile.topic || 'current topics'}": Essential for mastering core curriculum standards.
- Active recall exercises on weak test areas: Builds robust retrieval capability.

# Actionable 4-Week Study Plan
- Week 1: Concept mapping & definitions.
- Week 2: Ingest study textbooks in your ScholarEarn library and attempt 5 single quizzes.
- Week 3: Expand difficulties to Intermediate to build confidence.
- Week 4: Challenge top scores in Multi-Team Arena mode.

# Pro-Level Study Techniques
- Spaced Retrieval Practice: Test yourself 1 day, 3 days, and 7 days after reading.
- Feynman Technique: Explain a challenging topic in your own words to verify absolute comprehension.`;
};

/**
 * Generates AI-driven study topic suggestions based on the student's active Focus Topic.
 */
export const generateSuggestedTopics = async (
  userTopic: string,
  subject: string,
  gradeLevel: string,
  board?: string
): Promise<SuggestedTopic[]> => {
  const geminiKeys = getHealthyAIKeys();
  const prompt = `You are an elite academic curriculum architect. 
Given the student's current details:
- Subject: ${subject}
- Education Level/Grade: ${gradeLevel}
- Board/Syllabus: ${board || 'Standard Curriculum'}
- Current Focus Topic: "${userTopic}"

Recommend 3 logically consecutive next-step study topics or advanced sub-topics that the student should study next.
Categorize each into one of the following difficulties exactly:
1. 'Prerequisite' (if it's a foundational gap they must cover first to master the current topic)
2. 'Standard Extension' (the logical next topic in standard curriculum order)
3. 'Elite Mastery' (an advanced application or higher-tier topic to truly challenge them)

You must output a JSON array of exactly 3 suggested topics matching the following schema. Use standard, highly compelling academic phrasing.`;

  for (const key of geminiKeys) {
    try {
      const ai = getAIWithKey(key);
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are an AI Curriculum Advisor. Output valid JSON array only.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING, description: "Highly precise study topic name, e.g., 'Thin Lens Formula & Linear Magnification'" },
                difficulty: { type: Type.STRING, description: "Must be exactly one of: 'Prerequisite', 'Standard Extension', 'Elite Mastery'" },
                rationale: { type: Type.STRING, description: "A high-quality 1-sentence explanation of why they should learn this next relative to their focus topic." }
              },
              required: ["topic", "difficulty", "rationale"]
            }
          },
          temperature: 0.3
        }
      });

      const responseText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (responseText) {
        const cleaned = repairJson(responseText);
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          reportKeySuccess(key);
          return parsed as SuggestedTopic[];
        }
      }
    } catch (e: any) {
      console.warn("Suggested topics generation failed with key, trying fallback:", e.message || e);
      reportKeyFailure(key, e);
    }
  }

  // Robust Fallback suggestions based on current Focus Topic
  return [
    {
      topic: `${userTopic} - Core Foundations`,
      difficulty: 'Prerequisite',
      rationale: 'Solidifies fundamental theorems and prerequisite terminology required to master the active topic.'
    },
    {
      topic: `${userTopic} - Practical Applications`,
      difficulty: 'Standard Extension',
      rationale: 'Builds directly on your current syllabus focus with standard analytical problems and exam patterns.'
    },
    {
      topic: `${userTopic} - Advanced Scenarios`,
      difficulty: 'Elite Mastery',
      rationale: 'Connects this topic to higher-level concepts and experimental real-world problem sets.'
    }
  ];
};

export interface KeyDiagnosticResult {
  name: string;
  hasValue: boolean;
  status: 'SUCCESS' | 'FAILED' | 'NOT_CONFIGURED';
  latencyMs?: number;
  errorMessage?: string;
  maskedValue?: string;
}

export interface DiagnosticSummary {
  geminiKeys: KeyDiagnosticResult[];
  fallbackConfigured: boolean;
  fallbackType?: 'groq' | 'grok' | 'none';
  fallbackModel?: string;
  overallStatus: 'ALL_OK' | 'PARTIAL_OK' | 'ALL_FAILED';
  advice: string;
}

export const runAPIKeyDiagnostics = async (): Promise<DiagnosticSummary> => {
  const envKeys = [
    { envVar: 'GEMINI_API_KEY', value: process.env.GEMINI_API_KEY },
    { envVar: 'API_KEY', value: process.env.API_KEY },
    { envVar: 'GEMINI_API_KEY_SECONDARY', value: process.env.GEMINI_API_KEY_SECONDARY },
    { envVar: 'GEMINI_API_KEY_TERTIARY', value: process.env.GEMINI_API_KEY_TERTIARY },
    { envVar: 'GEMINI_API_KEY_4', value: process.env.GEMINI_API_KEY_4 },
    { envVar: 'GEMINI_API_KEY_5', value: process.env.GEMINI_API_KEY_5 },
    { envVar: 'GEMINI_API_KEY_6', value: process.env.GEMINI_API_KEY_6 },
    { envVar: 'GEMINI_API_KEY_7', value: process.env.GEMINI_API_KEY_7 },
    { envVar: 'GEMINI_API_KEY_8', value: process.env.GEMINI_API_KEY_8 },
    { envVar: 'GEMINI_API_KEY_9', value: process.env.GEMINI_API_KEY_9 },
    { envVar: 'GEMINI_API_KEY_10', value: process.env.GEMINI_API_KEY_10 },
  ];

  const results: KeyDiagnosticResult[] = [];
  const valueToStatus = new Map<string, { status: 'SUCCESS' | 'FAILED'; latency?: number; error?: string }>();

  for (const item of envKeys) {
    const val = (item.value || "").trim();
    if (!val) {
      results.push({
        name: item.envVar,
        hasValue: false,
        status: 'NOT_CONFIGURED',
        maskedValue: 'Not defined in environment'
      });
      continue;
    }

    const masked = val.length > 8 ? `${val.slice(0, 4)}...${val.slice(-4)}` : '••••••••';
    
    if (valueToStatus.has(val)) {
      const cached = valueToStatus.get(val)!;
      results.push({
        name: item.envVar,
        hasValue: true,
        status: cached.status,
        latencyMs: cached.latency,
        errorMessage: cached.error,
        maskedValue: masked
      });
      continue;
    }

    const start = Date.now();
    try {
      const ai = getAIWithKey(val);
      await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: 'Hi',
        config: { maxOutputTokens: 2 }
      });
      const latency = Date.now() - start;
      valueToStatus.set(val, { status: 'SUCCESS', latency });
      results.push({
        name: item.envVar,
        hasValue: true,
        status: 'SUCCESS',
        latencyMs: latency,
        maskedValue: masked
      });
    } catch (err: any) {
      const errMsg = err.message || String(err);
      valueToStatus.set(val, { status: 'FAILED', error: errMsg });
      results.push({
        name: item.envVar,
        hasValue: true,
        status: 'FAILED',
        errorMessage: errMsg,
        maskedValue: masked
      });
    }
  }

  const fallback = getFallbackAI();
  const fallbackConfigured = !!fallback;
  const fallbackType = fallback ? fallback.type : 'none';
  const fallbackModel = fallback ? fallback.model : undefined;

  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  const configuredCount = results.filter(r => r.hasValue).length;

  let overallStatus: 'ALL_OK' | 'PARTIAL_OK' | 'ALL_FAILED' = 'ALL_FAILED';
  if (successCount === configuredCount && configuredCount > 0) {
    overallStatus = 'ALL_OK';
  } else if (successCount > 0) {
    overallStatus = 'PARTIAL_OK';
  }

  let advice = '';
  if (overallStatus === 'ALL_OK') {
    advice = 'All configured Gemini API keys are fully functional and ready to deliver ultra-fast learning diagnostics!';
  } else if (overallStatus === 'PARTIAL_OK') {
    advice = 'Some Gemini API keys failed or are rate limited. The system will automatically rotate past them to active ones, but you should update/remove the failing keys in your Settings.';
  } else {
    advice = 'All configured Gemini keys are failing. ';
    if (fallbackConfigured) {
      advice += `We found a preconfigured fallback API (${fallbackType === 'groq' ? 'Groq/Llama' : 'xAI/Grok'}) in your environment! The system will automatically reroute synthesis tasks to keep ScholarEarn fully online.`;
    } else {
      advice += 'No active fallbacks are configured. Please check your GEMINI_API_KEY or provide a high-speed GROQ_API_KEY (with model llama-3.3-70b-versatile) or GROK_API_KEY / XAI_API_KEY in your App Settings.';
    }
  }

  return {
    geminiKeys: results,
    fallbackConfigured,
    fallbackType,
    fallbackModel,
    overallStatus,
    advice
  };
};