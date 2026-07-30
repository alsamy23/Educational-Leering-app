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
  if (topicLower.includes("chemical kinetics") || topicLower.includes("kinetics") || topicLower.includes("rate of reaction")) {
    matchedKey = "chemical_kinetics";
  } else if (topicLower.includes("electrochem") || topicLower.includes("galvanic") || topicLower.includes("nernst")) {
    matchedKey = "electrochemistry";
  } else if (topicLower.includes("light") || topicLower.includes("reflect") || topicLower.includes("refract") || topicLower.includes("lens") || topicLower.includes("optics")) {
    matchedKey = "light";
  } else if (topicLower.includes("photosynthesis") || topicLower.includes("plant") || topicLower.includes("chloroplast") || topicLower.includes("leaf") || topicLower.includes("biology") || topicLower.includes("life process")) {
    matchedKey = "photosynthesis";
  } else if (topicLower.includes("quadrat") || topicLower.includes("equation") || topicLower.includes("polynomial") || topicLower.includes("math")) {
    matchedKey = "quadratic";
  } else if (topicLower.includes("force") || topicLower.includes("gravit") || topicLower.includes("gravity") || topicLower.includes("physics") || topicLower.includes("weight") || topicLower.includes("motion")) {
    matchedKey = "force";
  } else if (topicLower.includes("right") || topicLower.includes("constitut") || topicLower.includes("polity") || topicLower.includes("fundamental") || topicLower.includes("civics") || topicLower.includes("social")) {
    matchedKey = "rights";
  }

  // Pre-defined database additions for Chemical Kinetics & Electrochemistry
  offlineDatabase["chemical_kinetics"] = [
    {
      id: 1,
      type: QuestionType.MCQ,
      text: `For a first-order reaction A -> Products, if the initial concentration of A is 0.8 M and its half-life (t1/2) is 20 minutes, what will be the concentration of A remaining after 60 minutes?`,
      options: [
        `0.10 M`,
        `0.20 M`,
        `0.05 M`,
        `0.40 M`
      ],
      correctIndex: 0,
      explanation: `For a first-order reaction, concentration decreases by half in each half-life period. Elapsed time = 60 mins = 3 half-lives (3 * 20 mins). Remaining concentration = Initial / (2^3) = 0.8 / 8 = 0.10 M.`,
      inquiryPrompt: `How does the rate constant (k) of a first-order reaction depend on the initial concentration of reactants?`
    },
    {
      id: 2,
      type: QuestionType.WORD_PROBLEM,
      text: `The activation energy (Ea) of a chemical reaction is doubled while keeping the temperature constant at 300 K. According to the Arrhenius equation k = A * e^(-Ea / RT), how does the rate constant 'k' change?`,
      options: [
        `The rate constant k decreases exponentially`,
        `The rate constant k doubles proportionally`,
        `The rate constant k remains unchanged`,
        `The rate constant k quadruples`
      ],
      correctIndex: 0,
      explanation: `In the Arrhenius equation k = A * e^(-Ea / RT), since Ea appears in the negative exponent, increasing the activation energy Ea causes the exponential factor e^(-Ea/RT) to decrease exponentially, thereby lowering the rate constant k.`,
      inquiryPrompt: `What role does a chemical catalyst play regarding activation energy and reaction speed?`
    },
    {
      id: 3,
      type: QuestionType.CASE_STUDY,
      contextMaterial: `A board exam candidate is performing a kinetics laboratory experiment measuring the decomposition of hydrogen peroxide: 2H2O2(aq) -> 2H2O(l) + O2(g). The student measures the volume of O2 gas collected at 30-second intervals and plots a graph of Volume vs. Time.`,
      text: `The student notices that the slope of the curve is steepest in the first 30 seconds and gradually flattens out to horizontal after 5 minutes. What is the correct board-pattern explanation for this observation?`,
      options: [
        `The reaction rate is highest initially due to high reactant concentration and becomes zero when reactants are exhausted`,
        `The reaction rate increases continuously over time as products accumulate`,
        `The oxygen gas leaks out of the tube after 5 minutes`,
        `The temperature drops to absolute zero after 5 minutes`
      ],
      correctIndex: 0,
      explanation: `Reaction rate is directly proportional to reactant concentration. At t=0, H2O2 concentration is highest, producing the steepest slope. As reactants are consumed, concentration drops, slowing the rate until equilibrium/completion is reached (flat slope).`,
      inquiryPrompt: `How would adding manganese dioxide (MnO2) powder alter the slope of this Volume vs. Time graph?`
    },
    {
      id: 4,
      type: QuestionType.VISUAL_ANALYSIS,
      contextMaterial: `A reaction profile diagram plots Potential Energy against Reaction Coordinate for an exothermic reaction: A + B -> C + D. The energy level of reactants (A+B) is 50 kJ/mol, the transition state peak is 120 kJ/mol, and the energy level of products (C+D) is 20 kJ/mol.`,
      text: `What is the Activation Energy (Ea) for the forward reaction, and what is the overall enthalpy change (ΔH) of the reaction?`,
      options: [
        `Activation Energy Ea = 70 kJ/mol; Enthalpy Change ΔH = -30 kJ/mol`,
        `Activation Energy Ea = 120 kJ/mol; Enthalpy Change ΔH = +70 kJ/mol`,
        `Activation Energy Ea = 50 kJ/mol; Enthalpy Change ΔH = -70 kJ/mol`,
        `Activation Energy Ea = 100 kJ/mol; Enthalpy Change ΔH = +30 kJ/mol`
      ],
      correctIndex: 0,
      explanation: `Forward Activation Energy Ea = Peak Energy - Reactant Energy = 120 - 50 = 70 kJ/mol. Overall Enthalpy Change ΔH = Product Energy - Reactant Energy = 20 - 50 = -30 kJ/mol (exothermic).`,
      inquiryPrompt: `What would be the Activation Energy for the reverse reaction (C + D -> A + B)?`
    },
    {
      id: 5,
      type: QuestionType.MCQ,
      text: `Which of the following conditions is required for a bi-molecular collision between two gaseous reactant molecules to successfully lead to product formation according to Collision Theory?`,
      options: [
        `Molecules must collide with energy greater than or equal to Activation Energy (Ea) AND possess proper steric orientation`,
        `Molecules must collide at maximum velocity regardless of orientation`,
        `Molecules must be in liquid phase at standard atmospheric pressure`,
        `Molecules must absorb light photons during every collision`
      ],
      correctIndex: 0,
      explanation: `According to Collision Theory, effective collisions require both sufficient kinetic energy (Threshold Energy / Ea) and correct spatial/steric orientation so that bond breaking and making can occur.`,
      inquiryPrompt: `Why do orientation factors become increasingly critical for larger organic macromolecules?`
    }
  ];

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
      contextMaterial: `Syllabus reference excerpt: "${s1}"`,
      text: `According to the official board curriculum, which statement correctly interprets the core principle of "${topic}" stated above?`,
      options: [
        `It establishes a fundamental rule governing the behavior of ${topic} under standard conditions.`,
        `It asserts that external variables have no impact on the outcome of ${topic}.`,
        `It refutes the established textbook models and suggests alternative theories.`,
        `It applies exclusively to theoretical conditions and cannot be experimentally verified.`
      ],
      correctIndex: 0,
      explanation: `The textbook excerpt directly outlines the fundamental mechanism governing "${topic}".`,
      inquiryPrompt: `How can you apply this rule to solve a board examination numerical or conceptual problem?`
    });

    questions.push({
      id: 2,
      type: QuestionType.WORD_PROBLEM,
      contextMaterial: `Case study excerpt: "${s2}"`,
      text: `In a board exam application scenario testing "${topic}", if key input parameters are increased by 50%, what is the expected outcome?`,
      options: [
        `The output changes proportionally in accordance with the established law of ${topic}`,
        `The reaction or system halts completely due to overload`,
        `The measured result remains strictly zero`,
        `The direction of the reaction or effect is completely reversed`
      ],
      correctIndex: 0,
      explanation: `Applying the law referenced in "${s2}", changing input parameters yields a proportional result predicted by the formula for ${topic}.`,
      inquiryPrompt: `Which variables must be held constant during this experimental setup?`
    });

    questions.push({
      id: 3,
      type: QuestionType.CASE_STUDY,
      contextMaterial: `Board Exam Practical Scenario: "${s3}"
      
An academic group is investigating "${topic}" in a school laboratory. They observe minor variations during trials and need to stabilize their results to match textbook values.`,
      text: `Which step is most essential according to standard board laboratory guidelines?`,
      options: [
        `Formulate precise control variables and record temperature/pressure deviations`,
        `Discard the experiment and write random estimated values`,
        `Increase trial duration without controlling environmental factors`,
        `Ignore the variations and submit unverified theoretical figures`
      ],
      correctIndex: 0,
      explanation: `Standard board exam practical guidelines require controlling environmental variables and systematic documentation when analyzing ${topic}.`,
      inquiryPrompt: `Why is recording environmental conditions essential in board practical examinations?`
    });
  }

  // Smart Academic Board Pattern Fallback Generator for any custom topic
  const isScience = /chem|phys|bio|sci|kinetic|force|light|motion|cell|acid|base|element|reaction|energy/i.test(subject) || /chem|phys|bio|sci|kinetic|force|light|motion|cell|acid|base|element|reaction|energy/i.test(topicLower);
  const isMath = /math|calc|trig|geom|algebra|stat|prob|vector|matrix|quad/i.test(subject) || /math|calc|trig|geom|algebra|stat|prob|vector|matrix|quad/i.test(topicLower);

  if (questions.length < 1) {
    questions.push({
      id: 1,
      type: QuestionType.MCQ,
      text: `According to the official Board examination blueprint for Grade ${profile.gradeLevel || "10/12"} ${profile.subject || "Syllabus"}, which of the following statements represents a fundamental law or principle of "${capTopic}"?`,
      options: [
        `It defines the core quantitative relationship and functional behavior of "${capTopic}" under standard conditions.`,
        `It proves that "${capTopic}" operates independently of physical or mathematical constraints.`,
        `It contradicts standard textbook formulas and is restricted to historical interest.`,
        `It applies solely to qualitative observations with no measurable equations or outcomes.`
      ],
      correctIndex: 0,
      explanation: `Official board examination guidelines emphasize that "${capTopic}" establishes the foundational principles and mathematical/conceptual relationships required in ${profile.subject || "curriculum"}.`,
      inquiryPrompt: `What textbook formula or definition is most frequently used to solve board questions on "${capTopic}"?`
    });
  }

  if (questions.length < 2) {
    questions.push({
      id: 2,
      type: QuestionType.WORD_PROBLEM,
      text: isMath 
        ? `In a board examination problem on "${capTopic}", a student is given a baseline function where value f(x) = 2x + 10. If the value of x is increased from 5 to 10, what is the calculated percentage change in f(x)?`
        : isScience
        ? `In a standard laboratory test investigating "${capTopic}", doubling the concentration or intensity of the primary agent increases the rate by a factor of 2. What is the calculated order or power relationship for "${capTopic}"?`
        : `A student analyzing a historical or social dataset on "${capTopic}" notes a 25% increase in core output over a 4-year period. What is the average annual compound rate of growth?`,
      options: [
        isMath ? `50% increase (from 20 to 30)` : isScience ? `First-order kinetics / linear direct proportionality` : `6.25% per annum`,
        isMath ? `100% increase` : isScience ? `Zero-order independence` : `25% per annum`,
        isMath ? `25% increase` : isScience ? `Second-order exponential scaling` : `12.5% per annum`,
        isMath ? `75% increase` : isScience ? `Inverse square relationship` : `0% growth`
      ],
      correctIndex: 0,
      explanation: isMath
        ? `At x=5, f(5) = 2(5)+10 = 20. At x=10, f(10) = 2(10)+10 = 30. Change = (30-20)/20 = 10/20 = 50% increase.`
        : isScience
        ? `Doubling concentration doubles the rate (2^1 = 2), indicating a first-order direct linear relationship for ${capTopic}.`
        : `Dividing total growth by time period gives an average annual baseline rate of 6.25%.`,
      inquiryPrompt: `What steps would you take to verify this result during a board exam step-wise marking evaluation?`
    });
  }

  if (questions.length < 3) {
    questions.push({
      id: 3,
      type: QuestionType.CASE_STUDY,
      contextMaterial: `Board Examination Case Study: A team of students is conducting an in-depth investigation into "${capTopic}". During their preliminary trials, they observe that slight modifications in initial conditions lead to measurable variations in final results. Their textbook recommends establishing standardized controls before recording final examination readings.`,
      text: `Based on this board examination case study, why is establishing standardized control parameters essential when evaluating "${capTopic}"?`,
      options: [
        `To isolate the primary variable and ensure reproducible, accurate results that match board standards`,
        `To eliminate the need for mathematical calculations in the final report`,
        `To bypass safety and quality protocols in the laboratory`,
        `To force the results to conform to unverified assumptions`
      ],
      correctIndex: 0,
      explanation: `Standardizing controls ensures that observed changes are solely due to the investigated variable of "${capTopic}", fulfilling board exam requirements for experimental accuracy.`,
      inquiryPrompt: `How would you design a control setup for "${capTopic}" in your school laboratory?`
    });
  }

  if (questions.length < 4) {
    questions.push({
      id: 4,
      type: QuestionType.VISUAL_ANALYSIS,
      contextMaterial: `An examination schematic diagram illustrates the key components and sequential workflow of "${capTopic}". Stage 1 represents 'Input Preparation', Stage 2 represents 'Core Transformation / Operation', and Stage 3 represents 'Product / Analytical Outcome'. An arrow indicates feedback from Stage 3 back to Stage 1.`,
      text: `If a bottleneck or error occurs at Stage 2 ('Core Transformation'), how does this affect Stage 3 and the overall feedback loop in "${capTopic}"?`,
      options: [
        `Stage 3 output is degraded or delayed, which in turn distorts the feedback signal sent to Stage 1`,
        `Stage 3 output increases automatically to compensate for Stage 2 failure`,
        `The entire system operates at 100% efficiency regardless of Stage 2`,
        `Stage 1 immediately shuts down without any signal delay`
      ],
      correctIndex: 0,
      explanation: `Since Stage 3 relies directly on the output of Stage 2 in "${capTopic}", a bottleneck in Stage 2 diminishes Stage 3 output and disrupts the regulatory feedback loop.`,
      inquiryPrompt: `What diagnostic indicator would tell an engineer or student that Stage 2 is experiencing a bottleneck in "${capTopic}"?`
    });
  }

  if (questions.length < 5) {
    questions.push({
      id: 5,
      type: QuestionType.MCQ,
      text: `Which student strategy is recommended by Board Exam toppers for achieving 100% mastery and top marks in "${capTopic}"?`,
      options: [
        `Thoroughly understanding textbook concepts, practicing board PYQs (Previous Year Questions), and applying step-wise formula derivations`,
        `Relying exclusively on last-minute cramming without understanding underlying definitions`,
        `Skipping numerical and case-based questions to focus only on 1-mark definitions`,
        `Memorizing option letters (A, B, C, D) from past sample papers`
      ],
      correctIndex: 0,
      explanation: `High performance in Board Examinations on topics like "${capTopic}" requires deep conceptual understanding, practicing board previous year questions, and clear step-by-step presentation.`,
      inquiryPrompt: `What is one key formula or concept from "${capTopic}" that you will revise today?`
    });
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

const extractJsonObjects = (text: string): any[] => {
  const results: any[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const objStr = text.substring(start, i + 1);
          try {
            const parsed = JSON.parse(objStr);
            if (parsed && typeof parsed === 'object' && parsed.text && Array.isArray(parsed.options)) {
              results.push(parsed);
            }
          } catch (e) {
            // Invalid or partial JSON block
          }
          start = -1;
        }
      }
    }
  }
  return results;
};

const formatSingleQuestion = (q: any, index: number, topic: string = "this topic"): QuizQuestion => {
  const rawOptions = Array.isArray(q.options) && q.options.length === 4 
    ? q.options 
    : ["Option A", "Option B", "Option C", "Option D"];
  const rawCorrectIndex = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
  
  const mappedOptions = rawOptions.map((opt: string, idx: number) => ({
    text: opt,
    isCorrect: idx === rawCorrectIndex
  }));
  
  for (let i = mappedOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = mappedOptions[i];
    mappedOptions[i] = mappedOptions[j];
    mappedOptions[j] = temp;
  }
  
  const shuffledOptions = mappedOptions.map((item: { text: string; isCorrect: boolean }) => item.text);
  const shuffledCorrectIndex = mappedOptions.findIndex((item: { text: string; isCorrect: boolean }) => item.isCorrect);

  return {
    id: q.id || index + 1,
    type: q.type || QuestionType.MCQ,
    text: q.text && q.text.trim() !== "" ? q.text : `Analyze the concepts of ${topic} to find the solution.`,
    contextMaterial: q.contextMaterial || undefined,
    options: shuffledOptions,
    correctIndex: shuffledCorrectIndex >= 0 ? shuffledCorrectIndex : 0,
    explanation: q.explanation || "No explanation provided.",
    inquiryPrompt: q.inquiryPrompt || `How would this change if we altered the initial conditions of the ${topic} problem?`
  };
};

export const generateQuizQuestions = async (
  profile: UserProfile, 
  isMockMode: boolean = false, 
  groupName?: string,
  topicOverride?: string,
  difficulty?: DifficultyLevel,
  retryCount = 0,
  seedOverride?: string,
  sourceMaterial?: string,
  onQuestionGenerated?: (question: QuizQuestion, index: number) => void
): Promise<QuizQuestion[]> => {
  const gradeInt = parseInt(profile.gradeLevel) || 10;
  const topic = topicOverride || profile.topic;
  const deliveredQuestions: QuizQuestion[] = [];
  const deliveredTexts = new Set<string>();

  const emitQuestion = (q: QuizQuestion) => {
    if (!deliveredTexts.has(q.text)) {
      deliveredTexts.add(q.text);
      deliveredQuestions.push(q);
      if (onQuestionGenerated) {
        onQuestionGenerated(q, deliveredQuestions.length - 1);
      }
    }
  };
  
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

        let accumulatedText = "";
        const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        let modelSuccess = false;

        for (const modelName of candidateModels) {
          try {
            console.log(`Attempting question generation with model ${modelName} and key ending in ...${key.slice(-5)}`);
            const responseStream = await ai.models.generateContentStream({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction: `You are a Senior Board Examination Author and Academic Curriculum Master. Output valid JSON only. Generate authentic, board-pattern questions matching official examination standards for ${profile.board || "CBSE/NCERT"}. Never output generic placeholders or abstract phrases like "Core Dynamics" or "Process Controls". Every question must use exact, realistic academic terminology for the requested subject and topic. ${groupName ? `This batch is specifically for Group ${groupName}. Ensure 100% uniqueness.` : ''}`,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.NUMBER },
                      type: { type: Type.STRING, description: "MCQ, WORD_PROBLEM, CASE_STUDY, or VISUAL_ANALYSIS" },
                      contextMaterial: { type: Type.STRING, description: "Scenario text for CASE_STUDY or VISUAL_ANALYSIS" },
                      text: { type: Type.STRING, description: "The question text. Must be a complete, challenging board-style question." },
                      options: { 
                        type: Type.ARRAY, 
                        items: { type: Type.STRING },
                        description: "Exactly 4 options with 1 correct answer and 3 realistic distractors"
                      },
                      correctIndex: { type: Type.NUMBER, description: "0-3" },
                      explanation: { type: Type.STRING, description: "Detailed explanation of the correct answer based on textbook principles" },
                      inquiryPrompt: { type: Type.STRING, description: "A follow-up challenge or inquiry for the student" }
                    },
                    required: ["id", "type", "text", "options", "correctIndex", "explanation", "inquiryPrompt"]
                  }
                },
                temperature: 0.3
              }
            });

            for await (const chunk of responseStream) {
              accumulatedText += chunk.text || "";
              const rawObjects = extractJsonObjects(accumulatedText);
              for (const rawObj of rawObjects) {
                const formatted = formatSingleQuestion(rawObj, deliveredQuestions.length, topic);
                emitQuestion(formatted);
              }
            }

            if (deliveredQuestions.length === 0 && accumulatedText.trim().length > 0) {
              const cleaned = repairJson(accumulatedText || "[]");
              const parsed = JSON.parse(cleaned);
              const formattedBatch = validateAndFormatQuestions(parsed, topic);
              for (const q of formattedBatch) {
                emitQuestion(q);
              }
            }

            if (deliveredQuestions.length > 0) {
              modelSuccess = true;
              break;
            }
          } catch (mErr: any) {
            console.warn(`Model ${modelName} failed on key: ${mErr.message || mErr}`);
          }
        }

        if (modelSuccess && deliveredQuestions.length > 0) {
          return deliveredQuestions;
        }
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
        return generateQuizQuestions(profile, isMockMode, groupName, topicOverride, difficulty, retryCount + 1, seed, sourceMaterial, onQuestionGenerated);
      }

      console.warn("Gemini rotation exhausted. Attempting Groq/Grok fallback...", lastError);
      const fallback = getFallbackAI();
      if (!fallback) {
        console.warn("No Groq/Grok fallback configured. Falling back to offline question generator.");
        const offlineList = validateAndFormatQuestions(generateOfflineQuizQuestions(profile, topic, sourceMaterial), topic);
        for (const q of offlineList) emitQuestion(q);
        return deliveredQuestions;
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
      
      const formattedBatch = validateAndFormatQuestions(parsed, topic);
      for (const q of formattedBatch) emitQuestion(q);
      return deliveredQuestions;
    } catch (fallbackErr: any) {
      console.warn("Groq/Grok fallback failed, activating offline question generator:", fallbackErr);
      const offlineList = validateAndFormatQuestions(generateOfflineQuizQuestions(profile, topic, sourceMaterial), topic);
      for (const q of offlineList) emitQuestion(q);
      return deliveredQuestions;
    }
  } catch (err: any) {
    console.error("Generation Error (falling back to offline generator):", err);
    const offlineList = validateAndFormatQuestions(generateOfflineQuizQuestions(profile, topic, sourceMaterial), topic);
    for (const q of offlineList) emitQuestion(q);
    return deliveredQuestions;
  }
};

const validateAndFormatQuestions = (parsed: any[], topic: string = "this topic"): QuizQuestion[] => {
  if (!Array.isArray(parsed)) throw new Error("Response is not an array");
  return parsed.map((q: any, index: number) => formatSingleQuestion(q, index, topic));
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