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
  CBSE_FULL_PATTERN = 'CBSE_FULL_PATTERN',
  SECTION_WISE = 'SECTION_WISE'
}

export enum BoardSection {
  SECTION_A = 'Section A (MCQs)',
  SECTION_B = 'Section B (VSA)',
  SECTION_C = 'Section C (SA)',
  SECTION_D = 'Section D (LA)',
  SECTION_E = 'Section E (Case Study)',
  FULL_MOCK = 'Full Pattern (A-E)'
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  condition: string;
  color: string;
  maxValue: number;
}

export interface UserProfile {
  name: string;
  school: string;
  section: string;
  board: string;
  gradeLevel: string;
  subject: string;
  topic: string;
  isFullSyllabus: boolean;
  totalQuizzes: number;
  earnedBadges: string[];
  equippedBadgeId?: string;
  examMode: ExamMode;
  selectedSection: BoardSection;
}

export interface QuizQuestion {
  id: number;
  type: QuestionType;
  section: string;
  text: string;
  caseText?: string;
  visualDescription?: string;
  options?: string[];
  correctIndex?: number;
  explanation: string;
  modelAnswer?: string;
  markingScheme?: string[];
  boardFavoriteReason?: string;
}

export interface QuizSession {
  profile: UserProfile;
  difficulty: Difficulty;
  questions: QuizQuestion[];
  userAnswers: any[];
  score: number;
  totalQuestions: number;
  earnedPoints: number;
  batchNumber: number;
}

export enum AppScreen {
  ENTRY = 'ENTRY',
  LOADING = 'LOADING',
  QUIZ = 'QUIZ',
  RESULTS = 'RESULTS',
  BADGES = 'BADGES'
}

export const BADGES: Badge[] = [
  { id: 'board_ready', name: 'Board Ready', icon: '📝', description: 'Completed a 10-question CBSE Batch.', condition: '1 Batch', color: '#4F46E5', maxValue: 1 },
  { id: 'case_master', name: 'Analyst', icon: '🧐', description: 'Mastered CBSE Case Studies.', condition: '5 Case Studies', color: '#10B981', maxValue: 5 },
  { id: 'centum', name: 'Centum Scorer', icon: '💯', description: 'Scored 10/10 in a Mock Batch.', condition: 'Perfect Score', color: '#F59E0B', maxValue: 1 }
];