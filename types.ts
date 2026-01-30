
export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
  EXPERT = 'Expert'
}

export interface UserProfile {
  name: string;
  gradeLevel: string;
}

export interface QuizQuestion {
  id: number;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface QuizSession {
  topic: string;
  difficulty: Difficulty;
  questions: QuizQuestion[];
  userAnswers: number[]; // Array of indices
  score: number; // Number of correct answers
  totalQuestions: number;
  earnedPoints: number; // Gamified points
}

export enum AppScreen {
  ENTRY = 'ENTRY',
  LOADING = 'LOADING',
  QUIZ = 'QUIZ',
  RESULTS = 'RESULTS'
}
