export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
  EXPERT = 'Expert'
}

export enum QuestionType {
  MCQ = 'MCQ',
  CASE_STUDY = 'CASE_STUDY',
  THEORY = 'THEORY',
  ASSERTION_REASON = 'ASSERTION_REASON'
}

export enum ExamMode {
  MCQ_ONLY = 'MCQ_ONLY',
  CBSE_FULL_PATTERN = 'CBSE_FULL_PATTERN'
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
  difficulty: Difficulty;
  totalQuizzes: number;
}

export interface QuizQuestion {
  id: number;
  type: QuestionType;
  text: string;
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