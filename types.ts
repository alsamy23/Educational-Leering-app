export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
  EXPERT = 'Expert'
}

export interface UserProfile {
  name: string;
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
  topic: string;
  subject: string;
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