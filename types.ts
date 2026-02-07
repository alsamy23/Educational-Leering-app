export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
  EXPERT = 'Expert'
}

export interface UserProfile {
  name: string;
  school?: string;
  board: string;
  gradeLevel: string;
  subject: string;
  topic: string;
}

export interface QuizQuestion {
  id: number;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface QuizSession {
  profile: UserProfile;
  difficulty: Difficulty;
  questions: QuizQuestion[];
  userAnswers: number[];
  score: number;
  totalQuestions: number;
  earnedPoints: number;
}

export enum AppScreen {
  ENTRY = 'ENTRY',
  LOADING = 'LOADING',
  QUIZ = 'QUIZ',
  RESULTS = 'RESULTS'
}

export const INDIAN_BOARDS = [
  "CBSE",
  "ICSE",
  "IGCSE",
  "IB",
  "Andhra Pradesh State Board",
  "Bihar State Board",
  "Gujarat State Board",
  "Karnataka State Board",
  "Kerala State Board",
  "Maharashtra State Board",
  "Rajasthan State Board",
  "Tamil Nadu State Board",
  "Telangana State Board",
  "Uttar Pradesh State Board",
  "West Bengal State Board",
  "Other State Board"
];