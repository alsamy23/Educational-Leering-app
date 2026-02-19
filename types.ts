export enum QuestionType {
  MCQ = 'MCQ',
  WORD_PROBLEM = 'WORD_PROBLEM',
  CASE_STUDY = 'CASE_STUDY',
  VISUAL_ANALYSIS = 'VISUAL_ANALYSIS'
}

export enum StudyFocus {
  SYLLABUS = 'Syllabus',
  PATTERN = 'Exam Pattern',
  TOPICS = 'Specific Topics'
}

export interface UserProfile {
  name: string;
  gradeLevel: string;
  subject: string;
  focus: StudyFocus;
  topic: string;
  level: number; // Progressive level (1, 2, 3...)
  totalQuizzes: number;
}

export interface QuizQuestion {
  id: number;
  type: QuestionType;
  text: string;
  contextMaterial?: string; // Holds the Case Study text or Image Description
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface QuizSession {
  profile: UserProfile;
  questions: QuizQuestion[];
  userAnswers: (number | null)[];
  score: number;
}

export enum AppScreen {
  ENTRY = 'ENTRY',
  LOADING = 'LOADING',
  QUIZ = 'QUIZ',
  RESULTS = 'RESULTS'
}