/**
 * Advanced Google Analytics (GA4) Tracking Service
 * Designed by a Senior Software Engineer for deep learning-funnel optimization
 */

export interface TrackParams {
  [key: string]: any;
}

// Low-level helper to track an event with GA4 and console fallback
export const trackEvent = (eventName: string, params?: TrackParams) => {
  try {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, params);
      console.log(`[GA4 Event logged]: ${eventName}`, params);
    } else {
      console.warn(`[GA4 Event queued/skipped - gtag not ready]: ${eventName}`, params);
    }
  } catch (error) {
    console.error(`[GA4 Error logging event]: ${eventName}`, error);
  }
};

// Funnel Step 1: User Onboarding / Profile Configured
export const trackProfileUpdate = (profile: { name: string; gradeLevel: string; board?: string; subject: string; focus: string }) => {
  trackEvent('profile_update', {
    student_name_length: profile.name ? profile.name.trim().length : 0,
    grade_level: profile.gradeLevel,
    education_board: profile.board || 'unknown',
    selected_subject: profile.subject,
    study_focus: profile.focus,
  });
};

// Funnel Step 2: Validation Errors (Critical to understand friction/bounce reasons!)
export const trackValidationError = (errorType: 'missing_name' | 'missing_topic' | 'quiz_initiation_fail', message: string) => {
  trackEvent('validation_error', {
    error_type: errorType,
    error_message: message,
    screen_context: 'onboarding_setup',
  });
};

// Funnel Step 3: Quiz/Battle Started
export const trackQuizStart = (params: {
  topic: string;
  difficulty: string;
  mode: 'individual' | 'classroom';
  num_teams?: number;
  has_material: boolean;
}) => {
  trackEvent('quiz_start', {
    quiz_topic: params.topic,
    difficulty_level: params.difficulty,
    session_mode: params.mode,
    number_of_teams: params.num_teams || 1,
    custom_study_material_used: params.has_material,
  });
};

// Funnel Step 4: Individual Question Answer Attempt
export const trackQuestionAttempt = (params: {
  question_id: number;
  question_type: string;
  answer_method: 'click' | 'speech';
  is_correct: boolean;
  score_so_far: number;
  mode: 'individual' | 'classroom';
}) => {
  trackEvent('question_attempt', {
    question_id: params.question_id,
    question_category: params.question_type,
    answer_modality: params.answer_method,
    is_answer_correct: params.is_correct ? 1 : 0,
    cumulative_score: params.score_so_far,
    session_mode: params.mode,
  });
};

// Funnel Step 5: Screen Transition Tracking
export const trackScreenView = (screenName: string, durationMs?: number) => {
  trackEvent('screen_view_custom', {
    screen_name: screenName,
    duration_spent_ms: durationMs,
  });
};

// Funnel Step 6: Quiz Completion / Educational Success
export const trackQuizCompletion = (params: {
  score: number;
  total_questions: number;
  points_earned: number;
  mode: 'individual' | 'classroom';
  topic: string;
}) => {
  trackEvent('quiz_completion', {
    final_score: params.score,
    out_of: params.total_questions,
    points_credited: params.points_earned,
    session_mode: params.mode,
    quiz_topic: params.topic,
    performance_ratio: params.total_questions > 0 ? params.score / params.total_questions : 0,
  });
};
