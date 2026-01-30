export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
  EXPERT = 'Expert'
}

export interface UserProfile {
  name: string;
  school: string;
  section: string;
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