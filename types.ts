export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
  EXPERT = 'Expert'
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  condition: string;
  color: string;
  maxValue: number; // For progression tracking
}

export interface UserProfile {
  name: string;
  school?: string;
  board: string;
  gradeLevel: string;
  subject: string;
  topic: string;
  totalQuizzes: number;
  earnedBadges: string[];
  equippedBadgeId?: string; // The badge currently shown in profile
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
  RESULTS = 'RESULTS',
  BADGES = 'BADGES'
}

export const BADGES: Badge[] = [
  { id: 'first_step', name: 'Novice', icon: '🌱', description: 'Completed your first assessment.', condition: 'First Quiz', color: '#6366F1', maxValue: 1 },
  { id: 'perfect_10', name: 'Perfect Scholar', icon: '🏆', description: 'Scored 100% in an assessment!', condition: 'Score 100%', color: '#F59E0B', maxValue: 1 },
  { id: 'board_master', name: 'Board Specialist', icon: '🧠', description: 'Complete 5 quizzes in your board.', condition: '5 Quizzes', color: '#4F46E5', maxValue: 5 },
  { id: 'high_roller', name: 'Point Baron', icon: '💰', description: 'Earn over 1,000 total points.', condition: '1000+ Points', color: '#10B981', maxValue: 1000 }
];

export const INDIAN_BOARDS = [
  "CBSE (National)",
  "ICSE (National)",
  "IGCSE (International)",
  "IB (International)",
  "Andhra Pradesh (BIEAP)",
  "Assam (AHSEC)",
  "Bihar (BSEB)",
  "Chhattisgarh (CGBSE)",
  "Goa (GBSHSE)",
  "Gujarat (GSEB)",
  "Haryana (HBSE)",
  "Himachal Pradesh (HPBOSE)",
  "Jharkhand (JAC)",
  "Karnataka (KSEEB)",
  "Kerala (DHSE)",
  "Madhya Pradesh (MPBSE)",
  "Maharashtra (MSBSHSE)",
  "Manipur (COHSEM)",
  "Meghalaya (MBOSE)",
  "Mizoram (MBSE)",
  "Nagaland (NBSE)",
  "Odisha (CHSE)",
  "Punjab (PSEB)",
  "Rajasthan (RBSE)",
  "Sikkim (SBSE)",
  "Tamil Nadu (TNBSE)",
  "Telangana (TSBIE)",
  "Tripura (TBSE)",
  "Uttar Pradesh (UPMSP)",
  "Uttarakhand (UBSE)",
  "West Bengal (WBBSE)"
];