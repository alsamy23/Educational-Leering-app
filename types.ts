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

export interface TestRecord {
  topic: string;
  score: number;
  total: number;
  date: string;
  type: 'individual' | 'classroom';
  subject: string;
  grade?: string;
  section?: string;
}

export interface StudyMaterial {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}

export interface UserProfile {
  name: string;
  gradeLevel: string;
  section?: string;
  subject: string;
  board?: string; // e.g. CBSE, ICSE, IGCSE, State Board, or Major stream
  focus: StudyFocus;
  topic: string;
  level: number; // Progressive level (1, 2, 3...)
  totalQuizzes: number;
  totalPoints: number;
  testHistory?: TestRecord[];
  progressMap?: Record<string, number>;
  role?: 'admin' | 'user';
  isGuest?: boolean;
  educationLevel?: 'School' | 'College' | 'Competitive' | 'Personal';
  difficulty?: DifficultyLevel;
}

export interface QuizQuestion {
  id: number;
  type: QuestionType;
  text: string;
  contextMaterial?: string; // Holds the Case Study text or Image Description
  options: string[];
  correctIndex: number;
  explanation: string;
  inquiryPrompt?: string; // A challenge or question for the student to explore further
}

export interface QuizSession {
  profile: UserProfile;
  questions: QuizQuestion[];
  userAnswers: (number | null)[];
  score: number;
  questionTimer?: number; // in seconds
}

export enum DifficultyLevel {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  DEFAULT = 'Default'
}

export interface Group {
  id: string;
  name: string;
  score: number;
  members: string[];
  difficulty?: DifficultyLevel;
}

export interface ClassroomSession {
  id: string;
  groups: Group[];
  currentGroupIndex: number;
  subject: string;
  gradeLevel: string;
  section: string;
  topic: string;
  isStarted: boolean;
  questionTimer?: number; // in seconds
}

export enum AppScreen {
  LANDING = 'LANDING',
  SIGN_IN = 'SIGN_IN',
  ENTRY = 'ENTRY',
  CLASSROOM_SETUP = 'CLASSROOM_SETUP',
  LOADING = 'LOADING',
  QUIZ = 'QUIZ',
  RESULTS = 'RESULTS',
  LEADERBOARD = 'LEADERBOARD',
  API_KEY_REQUIRED = 'API_KEY_REQUIRED',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  PROGRESS = 'PROGRESS'
}

export interface SuggestedTopic {
  topic: string;
  difficulty: 'Prerequisite' | 'Standard Extension' | 'Elite Mastery';
  rationale: string;
}

