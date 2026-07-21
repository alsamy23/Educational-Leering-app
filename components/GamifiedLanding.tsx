import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Sparkles, Rocket, Trophy, Play, CheckCircle, 
  ChevronRight, Shield, Plus, Trash2, Award, Clock, GraduationCap, 
  FileText, User, ShieldCheck, HelpCircle, Lightbulb, Users,
  Check, X, SignalMedium, Settings, Info, RefreshCw, Flame, Coins, Lock, ShoppingBag, Calendar, Heart, ArrowRight, AlertCircle, RefreshCw as SpinnerIcon,
  Download
} from 'lucide-react';
import { 
  UserProfile, StudyMaterial, SuggestedTopic, DifficultyLevel, AppScreen, TestRecord
} from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import { shareBadgeImage } from '../services/badgeShareService';
import { getCBSEPrepAnalysis } from '../services/cbseCompanionService';

interface GamifiedLandingProps {
  user: UserProfile;
  materials: StudyMaterial[];
  selectedMaterialId: string | null;
  setSelectedMaterialId: (id: string | null) => void;
  handleAddNewMaterial: (title: string, content: string) => void;
  handleDeleteMaterial: (id: string) => void;
  initiateDiagnosis: () => Promise<void>;
  launchClassroomBattleSetup: () => void;
  syncLocalUserProfile: (updated: UserProfile) => void;
  fetchSuggestedTopics: (topic: string, subject: string, grade: string, board: string) => void;
  suggestedTopics: SuggestedTopic[];
  isFetchingSuggestions: boolean;
  suggestionError: string | null;
  individualTimer: number;
  setIndividualTimer: (value: number) => void;
  isRunningDiagnostics: boolean;
  handleRunDiagnostics: () => void;
  unlockedBadgesInSession: string[];
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  setCurrentScreen: (screen: AppScreen) => void;
  authError: string | null;
  setAuthError: (value: string | null) => void;
  handleAnonymousLogin: () => void;
  handleGoogleLogin: () => void;
  currentUser: any;
  xpBoostActive: boolean;
  setXpBoostActive: (active: boolean) => void;
  streakShields: number;
  setStreakShields: (count: number | ((prev: number) => number)) => void;
  userCoins: number;
  setUserCoins: (count: number | ((prev: number) => number)) => void;
  downloadSingleRecordHtml: (record: TestRecord) => void;
  downloadSingleRecordText: (record: TestRecord) => void;
  downloadBatchHtml: () => void;
  downloadBatchText: () => void;
}

export const GamifiedLanding: React.FC<GamifiedLandingProps> = ({
  user,
  materials,
  selectedMaterialId,
  setSelectedMaterialId,
  handleAddNewMaterial,
  handleDeleteMaterial,
  initiateDiagnosis,
  launchClassroomBattleSetup,
  syncLocalUserProfile,
  fetchSuggestedTopics,
  suggestedTopics,
  isFetchingSuggestions,
  suggestionError,
  individualTimer,
  setIndividualTimer,
  isRunningDiagnostics,
  handleRunDiagnostics,
  unlockedBadgesInSession,
  showToast,
  setCurrentScreen,
  authError,
  setAuthError,
  handleAnonymousLogin,
  handleGoogleLogin,
  currentUser,
  xpBoostActive,
  setXpBoostActive,
  streakShields,
  setStreakShields,
  userCoins,
  setUserCoins,
  downloadSingleRecordHtml,
  downloadSingleRecordText,
  downloadBatchHtml,
  downloadBatchText
}) => {
  const [entryMobileTab, setEntryMobileTab] = useState<'study' | 'library' | 'records'>('study');
  const [sidebarSubTab, setSidebarSubTab] = useState<'library' | 'companion'>('companion');
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(null);
  const [isConfiguratorOpen, setIsConfiguratorOpen] = useState<boolean>(false);
  const [configStep, setConfigStep] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'text' | 'pdf'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);
  const [libError, setLibError] = useState('');

  // Workspace Focus Mode & Onboarding Guide States
  const [showSidebars, setShowSidebars] = useState<boolean>(false);
  const [tourActive, setTourActive] = useState<boolean>(() => {
    const completed = localStorage.getItem('scholar_earn_tour_completed');
    return !completed; // Auto-activate for first-time entering users to guide them
  });
  const [tourStep, setTourStep] = useState<number>(0);

  const tourSteps = [
    {
      title: "Welcome to ScholarEarn! 🎓",
      description: "This is your personalized Academic Diagnosis and Syllabus Mastery Platform. Let's take a quick 1-minute interactive tour to understand how it helps you master your syllabus.",
      target: "welcome",
      actionLabel: "Let's Go!"
    },
    {
      title: "Focus Mode (Distraction-Free) 🎯",
      description: "By default, ScholarEarn hides all side companion panels when you enter, keeping your view focused 'only on the learning things'. You can toggle the companion sidebar tools at any time to check your consistency streak, rewards store, and notes.",
      target: "sidebar-toggle",
      actionLabel: "Next Step"
    },
    {
      title: "Your Active Syllabus Target 📋",
      description: "This is your current study subject and active topic. Tap 'Change Goal' at any time to switch boards (e.g. CBSE), grade levels, or choose custom focus areas.",
      target: "active-target",
      actionLabel: "Next Step"
    },
    {
      title: "Personalized Progress Map 🗺️",
      description: "Your path is divided into 4 scientific learning phases: Learn, Practice, Revise, and Test. Progress through each phase to build full exam-readiness and earn ScholarCoins!",
      target: "progress-map",
      actionLabel: "Next Step"
    },
    {
      title: "Level 1 & 2 Topic Practice & Rescue 🚨",
      description: "ScholarEarn analyzes your level 1 and level 2 responses for your active topic and automatically highlights weak areas. Launch 'Rescue Practice' to instantly clear any academic hurdles.",
      target: "rescue-practice",
      actionLabel: "Next Step"
    },
    {
      title: "Study Companion Tools & Classroom Arena 👥",
      description: "Now we've enabled the Companion Panels! You can check your study consistency streak, buy power-ups in the ScholarCoins store, upload custom textbook PDFs/notes, or setup collaborative arena games with friends. You are all set!",
      target: "companion-tools",
      actionLabel: "Start Learning! 🎉"
    }
  ];

  // Academic syllabus milestones replacing Duolingo-game visual roads
  const studyMilestones = [
    { phase: "Learn", name: "Concept Foundations", desc: "Revise terms and fundamental definitions using adaptive flash learning.", duration: "5 mins", icon: BookOpen },
    { phase: "Practice", name: "Curriculum Application", desc: "Solve basic application cases and high-yield question patterns.", duration: "8 mins", icon: Sparkles },
    { phase: "Revise", name: "Level 1 & 2 Specifics", desc: "Target weaker focus areas with focused Level 1 & Level 2 topic revision.", duration: "6 mins", icon: HelpCircle },
    { phase: "Test", name: "Exam readiness", desc: "Simulate exact board examination patterns under full timing parameters.", duration: "10 mins", icon: Trophy }
  ];

  // Dynamically compute progress stats
  const totalCompletedQuizzes = user.totalQuizzes || 0;
  const progressPercentage = Math.min(95, Math.max(10, totalCompletedQuizzes * 15));
  
  // Find weak topics based on test scores < 4 (out of 5)
  const weakTopics = (user.testHistory || [])
    .filter(record => record.score < 4)
    .map(record => record.topic)
    .filter((v, i, self) => self.indexOf(v) === i)
    .slice(0, 2);

  const defaultWeakTopic = weakTopics.length > 0 ? weakTopics[0] : `${user.topic} (Conceptual Application)`;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handlePdfFile(e.dataTransfer.files[0]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handlePdfFile(e.target.files[0]);
  };

  const handlePdfFile = async (file: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith('.pdf')) {
      setLibError("Please select a valid PDF file.");
      return;
    }
    setPdfParsing(true); setLibError(""); setPdfProgress({ current: 0, total: 0 });
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;
      setPdfProgress({ current: 0, total: totalPages });
      let fullText = "";
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        setPdfProgress({ current: pageNum, total: totalPages });
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str || '').join(' ');
        fullText += `--- Page ${pageNum} ---\n` + pageText + '\n\n';
      }
      const trimmedText = fullText.trim();
      if (!trimmedText || trimmedText.length < 15) throw new Error("Could not extract any text.");
      const displayTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
      handleAddNewMaterial(displayTitle, trimmedText);
      setPdfParsing(false);
    } catch (err: any) {
      setLibError(err?.message || "Failure parsing PDF.");
      setPdfParsing(false);
    }
  };

  // Launch direct action lesson
  const handleLaunchLesson = async (milestoneName?: string) => {
    const updatedUser: UserProfile = {
      ...user,
      topic: milestoneName ? `${user.topic} - ${milestoneName}` : user.topic,
      difficulty: DifficultyLevel.MEDIUM
    };
    syncLocalUserProfile(updatedUser);
    await initiateDiagnosis();
  };

  // Virtual rewards shop implementation (Credible academic rewards)
  const buyXpBoost = () => {
    if (userCoins < 100) {
      showToast("Earn more ScholarCoins by completing mock tests!", "warning");
      return;
    }
    setUserCoins(prev => prev - 100);
    setXpBoostActive(true);
    showToast("⚡ Double XP Active! Next lesson completion rewards double score parameters.", "success");
  };

  const buyStreakShield = () => {
    if (userCoins < 150) {
      showToast("Earn more ScholarCoins!", "warning");
      return;
    }
    setUserCoins(prev => prev - 150);
    setStreakShields(prev => prev + 1);
    showToast("🛡️ Streak shield active! Consistency metrics secured for the next 24 hours.", "success");
  };

  const buyCheatSheet = () => {
    if (userCoins < 200) {
      showToast("Earn more ScholarCoins!", "warning");
      return;
    }
    setUserCoins(prev => prev - 200);
    showToast("📚 High-yield Study Guide downloaded successfully!", "success");
    const link = document.createElement("a");
    link.href = "data:text/plain;charset=utf-8," + encodeURIComponent(`ScholarEarn High-Yield Syllabus Guide\nSubject: ${user.subject}\nTopic: ${user.topic}\n\nKey Concepts:\n1. Core definitions & laws\n2. Analytical application guide\n3. Weak areas targeting summary`);
    link.download = `ScholarEarn_${user.topic.replace(/\s+/g, "_")}_SyllabusGuide.txt`;
    link.click();
  };

  const donateScholarship = () => {
    if (userCoins < 400) {
      showToast("Earn 400 ScholarCoins to unlock this donation reward!", "warning");
      return;
    }
    setUserCoins(prev => prev - 400);
    showToast("❤️ Remarkable! You successfully donated 400 coins to the Youth Science Scholarship Fund.", "success");
  };

  const handleMaterialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setLibError('Please fill in both title and content.');
      return;
    }
    handleAddNewMaterial(title.trim(), content.trim());
    setTitle('');
    setContent('');
    setLibError('');
    showToast(`Study notes "${title}" saved to library.`, 'success');
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">

      {/* Dynamic Workspace Focus Header & Mode Toggle Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 shadow-sm relative overflow-hidden">
        {/* Subdued glow effect */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex items-center gap-2.5 z-10">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
            <Sparkles className="w-4.5 h-4.5 text-indigo-400 animate-pulse" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Workspace Focus Center</p>
            <p className="text-[10px] text-slate-400">
              {showSidebars ? "All Tools Expanded" : "🎯 High-Focus Mode Active (Sidebars Hidden)"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 z-10 w-full sm:w-auto justify-end">
          {/* Guide Tour Button */}
          <button
            onClick={() => {
              setTourStep(0);
              setTourActive(true);
            }}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-indigo-300 hover:text-white transition-all border border-white/5"
            title="Launch step-by-step app workspace tour"
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
            <span>App Guide Tour</span>
          </button>

          {/* Toggle Sidebars Button */}
          <button
            onClick={() => setShowSidebars(!showSidebars)}
            type="button"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md hover:shadow-indigo-500/10 active:scale-95"
          >
            {showSidebars ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Focus: Learning Only</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Show Companion Tools</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Onboarding Interactive Tour Guide Modal */}
      <AnimatePresence>
        {tourActive && (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.92, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 15, opacity: 0 }}
              className="bg-white border border-slate-200 shadow-2xl rounded-3xl max-w-md w-full overflow-hidden text-left relative"
            >
              {/* Highlight gradient at top */}
              <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 h-2 w-full"></div>
              
              <button 
                onClick={() => {
                  localStorage.setItem('scholar_earn_tour_completed', 'true');
                  setTourActive(false);
                }}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full transition-all"
                title="Skip Tour"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="p-6 space-y-4">
                {/* Step badge */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                    Syllabus Guide Step {tourStep + 1} of {tourSteps.length}
                  </span>
                  <span className="text-xs text-slate-500 font-bold font-mono">
                    {Math.round(((tourStep + 1) / tourSteps.length) * 100)}% Complete
                  </span>
                </div>

                {/* Illustrated / Icon state */}
                <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-center shrink-0">
                    {tourStep === 0 && <GraduationCap className="w-7 h-7 text-indigo-600 animate-bounce" />}
                    {tourStep === 1 && <Lock className="w-7 h-7 text-indigo-600" />}
                    {tourStep === 2 && <Settings className="w-7 h-7 text-indigo-600" />}
                    {tourStep === 3 && <BookOpen className="w-7 h-7 text-indigo-600 animate-pulse" />}
                    {tourStep === 4 && <AlertCircle className="w-7 h-7 text-red-500 animate-pulse" />}
                    {tourStep === 5 && <Users className="w-7 h-7 text-indigo-600" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                      {tourSteps[tourStep].title}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Workspace Tutorial</p>
                  </div>
                </div>

                {/* Tour description text */}
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  {tourSteps[tourStep].description}
                </p>

                {/* Dynamic visual preview hint so they see exactly how it works */}
                {tourStep === 1 && (
                  <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 text-left space-y-1">
                    <p className="text-[10px] font-bold text-indigo-900 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Focus Principle:
                    </p>
                    <p className="text-[9px] text-indigo-800 leading-normal">
                      By eliminating the sidebars, we remove cognitive load. You see only the syllabus map, so you spend 100% of your brain power on learning the topics!
                    </p>
                  </div>
                )}

                {tourStep === 2 && (
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-left space-y-1">
                    <p className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                      <Settings className="w-3 h-3" /> Goal Setting:
                    </p>
                    <p className="text-[9px] text-amber-800 leading-normal">
                      Current Target: <span className="font-extrabold">{user.subject}</span> • <span className="font-bold">{user.topic}</span>. Switch subjects easily to align with your school timetable.
                    </p>
                  </div>
                )}

                {tourStep === 3 && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-left space-y-1 font-mono">
                    <p className="text-[9px] font-bold text-slate-700">Recommended Order:</p>
                    <p className="text-[8px] text-slate-500">
                      1. Learn Concepts ➔ 2. Practice Cases ➔ 3. Diagnose Weak Spots ➔ 4. Exam-pattern Test
                    </p>
                  </div>
                )}

                {tourStep === 4 && (
                  <div className="bg-red-50 p-3 rounded-xl border border-red-100 text-left space-y-1">
                    <p className="text-[10px] font-bold text-red-900 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> AI Diagnostic:
                    </p>
                    <p className="text-[9px] text-red-800 leading-normal">
                      Whenever you score poorly on any topic, it automatically lists it under Rescue Practice to guide your recovery loop.
                    </p>
                  </div>
                )}

                {tourStep === 5 && (
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-left space-y-1">
                    <p className="text-[10px] font-bold text-emerald-900 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Companion Panels Active:
                    </p>
                    <p className="text-[9px] text-emerald-800 leading-normal">
                      Keep your Flame streak alive, level up, buy rewards like Double XP or Revision Cheat Sheets with your 🪙, and upload custom PDFs.
                    </p>
                  </div>
                )}

                {/* Navigation Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      localStorage.setItem('scholar_earn_tour_completed', 'true');
                      setTourActive(false);
                    }}
                    type="button"
                    className="text-xs text-slate-600 hover:text-slate-900 font-extrabold px-2 py-1 cursor-pointer"
                  >
                    Skip Guide
                  </button>

                  <div className="flex items-center gap-2">
                    {tourStep > 0 && (
                      <button
                        onClick={() => {
                          const prev = tourStep - 1;
                          setTourStep(prev);
                          if (prev === 5) {
                            setShowSidebars(true);
                          } else {
                            setShowSidebars(false);
                          }
                        }}
                        type="button"
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all"
                      >
                        Back
                      </button>
                    )}
                    
                    <button
                      onClick={() => {
                        if (tourStep < tourSteps.length - 1) {
                          const next = tourStep + 1;
                          setTourStep(next);
                          if (next === 5) {
                            setShowSidebars(true);
                            showToast("Expanding sidebars to showcase Companion Tools!", "info");
                          } else {
                            setShowSidebars(false);
                          }
                        } else {
                          localStorage.setItem('scholar_earn_tour_completed', 'true');
                          setTourActive(false);
                          showToast("Guide complete! Happy learning!", "success");
                        }
                      }}
                      type="button"
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition-all shadow-md hover:shadow-indigo-500/10 active:scale-95 flex items-center gap-1"
                    >
                      <span>{tourSteps[tourStep].actionLabel}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* 3-Column Balanced Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ================= LEFT COLUMN: Consistency & Goal Tracker (3/12 cols) ================= */}
        <div className={`${entryMobileTab === 'records' ? 'block' : 'hidden'} ${showSidebars ? 'lg:block lg:col-span-3' : 'lg:hidden'} space-y-4`}>
          
          {/* Duolingo Streak Psychology Card (Academic Theme) */}
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Consistency Tracker</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
                <Flame className="w-6 h-6 text-amber-500 animate-pulse" />
              </div>
              <div className="text-left">
                <p className="text-xl font-extrabold text-white">
                  {user.totalQuizzes > 0 ? `${Math.min(7, user.totalQuizzes)} Day Streak` : "0 Day Streak"}
                </p>
                <p className="text-[10px] text-slate-400 font-medium">Study 5 mins daily for consistency multiplier</p>
              </div>
            </div>

            {/* Clean Mon-Sun checkoff row */}
            <div className="grid grid-cols-7 gap-1 bg-slate-950/40 border border-white/5 p-2 rounded-xl text-center">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
                const checked = user.totalQuizzes > 0 && i <= Math.min(5, user.totalQuizzes - 1);
                return (
                  <div key={i} className="space-y-1">
                    <p className="text-[9px] font-bold text-slate-400">{day}</p>
                    <div className={`w-5 h-5 mx-auto rounded-full flex items-center justify-center text-[9px] font-bold ${
                      checked 
                        ? 'bg-amber-500 text-slate-950 shadow-sm font-black' 
                        : 'bg-slate-900 border border-white/5 text-slate-600'
                    }`}>
                      {checked ? "✓" : "•"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Academic Profile & XP Tracker */}
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Syllabus Level</span>
              <span className="text-[10px] font-bold text-indigo-300 bg-indigo-950/50 border border-indigo-900 px-2 py-0.5 rounded-full">
                Level {user.level || 1}
              </span>
            </div>

            <div className="text-left space-y-1">
              <p className="text-sm font-extrabold text-white truncate">{user.name || "Syllabus Student"}</p>
              <p className="text-[10px] text-slate-400">{user.board || "School Board"} Grade {user.gradeLevel || "10"}</p>
            </div>

            {/* Milestone target slider */}
            <div className="space-y-1.5 pt-1 text-left">
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                <span>Today's Study Goal</span>
                <span>{Math.min(50, user.totalPoints % 50)} / 50 XP</span>
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, ((user.totalPoints % 50) / 50) * 100)}%` }}
                />
              </div>
              <p className="text-[9px] text-slate-400 italic">Earn 50 XP to hit today's syllabus master target.</p>
            </div>
          </div>

          {/* Reward preview store */}
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ScholarCoins & Store</span>
              <div className="flex items-center gap-1 text-amber-400 font-extrabold text-xs">
                <Coins className="w-3.5 h-3.5" />
                <span>{userCoins} 🪙</span>
              </div>
            </div>

            {/* List of Store items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-white/5 text-left">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold text-white truncate">⚡ Double XP Boost</p>
                  <p className="text-[9px] text-slate-400">Earn 2x score parameters</p>
                </div>
                <button 
                  onClick={buyXpBoost}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  100 🪙
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-white/5 text-left">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold text-white truncate">🛡️ Streak Freeze</p>
                  <p className="text-[9px] text-slate-400">Shields consecutive study metrics</p>
                </div>
                <button 
                  onClick={buyStreakShield}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  150 🪙
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-white/5 text-left">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold text-white truncate">📚 Syllabus Revision PDF</p>
                  <p className="text-[9px] text-slate-400">Download formula summary</p>
                </div>
                <button 
                  onClick={buyCheatSheet}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  200 🪙
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-rose-950/10 border border-rose-900/30 text-left">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold text-rose-300 truncate">❤️ Education Fund Donation</p>
                  <p className="text-[9px] text-slate-400">Support underprivileged students</p>
                </div>
                <button 
                  onClick={donateScholarship}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  400 🪙
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Badges & Academic Milestones */}
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Academic Badges & Milestones</span>
              <Award className="w-4 h-4 text-amber-400" />
            </div>
            
            <p className="text-[10px] text-slate-400 leading-normal text-left">
              Every badge represents an academic milestone you've reached through dedication and study consistency. Keep going!
            </p>

            <div className="space-y-2 text-left pt-1">
              {[
                { 
                  id: 'first-quiz', 
                  name: 'First Steps', 
                  desc: 'Completed your first dynamic quiz', 
                  unlocked: user.totalQuizzes >= 1,
                  criteria: '1 quiz completed'
                },
                { 
                  id: '10-quizzes', 
                  name: 'Quiz Master', 
                  desc: 'Completed 10 dynamic quizzes', 
                  unlocked: user.totalQuizzes >= 10,
                  criteria: '10 quizzes completed'
                },
                { 
                  id: '100-points', 
                  name: 'Centurion Scholar', 
                  desc: 'Accumulated 100 mastery points', 
                  unlocked: user.totalPoints >= 100,
                  criteria: '100 points earned'
                },
                { 
                  id: 'level-5', 
                  name: 'Expert Scholar', 
                  desc: 'Syllabus Level 5 or higher reached', 
                  unlocked: (user.level || 1) >= 5,
                  criteria: 'Level 5 reached'
                },
                { 
                  id: 'level-10', 
                  name: 'Elite Scholar', 
                  desc: 'Syllabus Level 10 or higher reached', 
                  unlocked: (user.level || 1) >= 10,
                  criteria: 'Level 10 reached'
                }
              ].map(badge => (
                <div 
                  key={badge.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                    badge.unlocked 
                      ? 'bg-amber-500/5 border-amber-500/20 text-white animate-fade-in' 
                      : 'bg-slate-950/40 border-white/5 text-slate-500'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                    badge.unlocked 
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                      : 'bg-slate-900 border-white/5 text-slate-600'
                  }`}>
                    {badge.unlocked ? <Award className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-xs font-extrabold ${badge.unlocked ? 'text-white' : 'text-slate-400'}`}>
                        {badge.name}
                      </p>
                      {badge.unlocked && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[8px] bg-amber-500/20 text-amber-300 font-extrabold uppercase px-1.5 py-0.5 rounded-full">Earned</span>
                          <button 
                            type="button"
                            title="Download verified board level badge credential"
                            onClick={(e) => {
                              e.stopPropagation();
                              shareBadgeImage(user, badge);
                              showToast(`Downloading credential badge: ${badge.name}`, 'success');
                            }}
                            className="p-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 active:scale-95 transition-all text-[8px] font-black uppercase cursor-pointer"
                          >
                            Download
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 truncate leading-snug">{badge.desc}</p>
                    <p className="text-[8px] text-indigo-400 font-semibold uppercase tracking-wider mt-0.5">{badge.criteria}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Academic Records & History */}
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Academic Records & History</span>
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>

            {/* Batch Downloads Section */}
            {user.testHistory && user.testHistory.length > 0 ? (
              <div className="bg-slate-950/40 border border-white/5 p-3 rounded-xl space-y-2 text-left">
                <p className="text-[10px] font-bold text-slate-300">Download Consolidated Batch Reports</p>
                <p className="text-[8px] text-slate-400 leading-normal">
                  Export all of your completed syllabus test records into a single consolidated academic transcript.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={downloadBatchHtml}
                    className="py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[8px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" /> Batch Board PDF
                  </button>
                  <button
                    type="button"
                    onClick={downloadBatchText}
                    className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[8px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <FileText className="w-3 h-3" /> Batch Text Report
                  </button>
                </div>
              </div>
            ) : null}

            {/* List of Previous Tests */}
            <div className="space-y-2 text-left pt-1 max-h-[300px] overflow-y-auto pr-1">
              {!user.testHistory || user.testHistory.length === 0 ? (
                <div className="text-center py-4 bg-slate-950/20 border border-dashed border-white/5 rounded-xl">
                  <p className="text-[10px] text-slate-500">No previous test history logged.</p>
                  <p className="text-[8px] text-slate-600 mt-1">Complete a quiz challenge to log records here.</p>
                </div>
              ) : (
                [...user.testHistory].reverse().map((record, index) => {
                  const percent = Math.round((record.score / record.total) * 100);
                  return (
                    <div
                      key={index}
                      className="p-3 bg-slate-950/40 border border-white/5 rounded-xl space-y-2 transition-all hover:border-indigo-500/20"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{record.topic}</p>
                          <p className="text-[8px] text-slate-400 mt-0.5">
                            {record.subject} • Grade {record.grade}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-black text-indigo-400">
                            {record.score} / {record.total}
                          </p>
                          <p className="text-[8px] text-slate-500 font-semibold">{percent}% Acc</p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[8px] text-slate-500 border-t border-white/5 pt-1.5">
                        <span>{record.date}</span>
                        <span className="capitalize px-1 bg-indigo-950/50 border border-indigo-900 text-indigo-300 rounded">
                          {record.type}
                        </span>
                      </div>

                      {/* Downloads for this specific record */}
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => downloadSingleRecordHtml(record)}
                          className="py-1 px-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 text-[8px] font-black uppercase rounded transition-all cursor-pointer text-center"
                        >
                          Print Board PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadSingleRecordText(record)}
                          className="py-1 px-1.5 bg-slate-800/50 hover:bg-slate-800/80 text-slate-300 border border-slate-700/30 text-[8px] font-black uppercase rounded transition-all cursor-pointer text-center"
                        >
                          Download TXT
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ================= CENTER COLUMN: Study Configuration & Launchpad (6/12 cols) ================= */}
        <div className={`${entryMobileTab === 'study' ? 'block' : 'hidden'} lg:block ${showSidebars ? 'lg:col-span-6' : 'lg:col-span-12 max-w-3xl mx-auto w-full'} space-y-6`}>
          
          <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
            <div className="border-b border-white/5 pb-4 text-left">
              <h3 className="text-lg font-headline font-black text-white tracking-tight flex items-center gap-2">
                <GraduationCap className="w-6 h-6 text-indigo-400 animate-pulse" />
                Syllabus & Study Goal Configurator
              </h3>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-1">Configure your personal learning profile and syllabus goals</p>
            </div>

            <div className="space-y-5">
              {/* 1. Educational Stream (Slash Layout: School vs Other Categories Dropdown) */}
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-indigo-400" /> Educational Stream Level
                </label>
                
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-950/40 border border-white/5 p-3 rounded-2xl">
                  {/* Option A: School K-12 */}
                  <button
                    type="button"
                    onClick={() => {
                      syncLocalUserProfile({
                        ...user,
                        educationLevel: 'School',
                        board: 'CBSE',
                        gradeLevel: '10',
                        subject: 'Science',
                        topic: 'Light - Reflection and Refraction'
                      });
                      fetchSuggestedTopics('Light - Reflection and Refraction', 'Science', '10', 'CBSE');
                    }}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold transition-all cursor-pointer grow sm:grow-0 ${
                      (user.educationLevel || 'School') === 'School'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                        : 'bg-slate-950 border-white/5 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>School (K-12)</span>
                  </button>

                  {/* Slash Separator */}
                  <span className="hidden sm:inline text-slate-600 font-black text-lg select-none px-1">/</span>

                  {/* Option B: Other Category Dropdown Menu */}
                  <div className="flex-1 min-w-0">
                    <select
                      value={(user.educationLevel || 'School') === 'School' ? '' : (user.educationLevel || 'College')}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        
                        let defaultBoard = '';
                        let defaultGrade = '';
                        let defaultSubject = '';
                        let defaultTopic = '';
                        let finalLevel: 'School' | 'College' | 'Competitive' | 'Personal' = 'Competitive';

                        if (val === 'College') {
                          defaultBoard = 'Undergraduate Degree';
                          defaultGrade = 'Third Year';
                          defaultSubject = 'Computer Science';
                          defaultTopic = 'Data Structures and Algorithms';
                          finalLevel = 'College';
                        } else if (val === 'Competitive') {
                          defaultBoard = 'Competitive Entrance Exam';
                          defaultGrade = 'General Phase';
                          defaultSubject = 'Quantitative Aptitude';
                          defaultTopic = 'Percentage & Interest Math';
                          finalLevel = 'Competitive';
                        } else if (val === 'JEE') {
                          defaultBoard = 'JEE Advanced Prep';
                          defaultGrade = 'Mains Stage';
                          defaultSubject = 'Physics';
                          defaultTopic = 'Kinematics & Mechanics';
                          finalLevel = 'Competitive';
                        } else if (val === 'NEET') {
                          defaultBoard = 'NEET Medical Entrance';
                          defaultGrade = 'Biology Stage';
                          defaultSubject = 'Human Physiology';
                          defaultTopic = 'Circulatory System';
                          finalLevel = 'Competitive';
                        } else if (val === 'UPSC') {
                          defaultBoard = 'UPSC Civil Services';
                          defaultGrade = 'Prelims Phase';
                          defaultSubject = 'Indian Polity';
                          defaultTopic = 'Fundamental Rights';
                          finalLevel = 'Competitive';
                        } else if (val === 'Personal') {
                          defaultBoard = 'Self-Paced Learning';
                          defaultGrade = 'Intermediate Level';
                          defaultSubject = 'Creative Writing';
                          defaultTopic = 'Syllabus and Essay Outlining';
                          finalLevel = 'Personal';
                        }

                        syncLocalUserProfile({
                          ...user,
                          educationLevel: finalLevel,
                          board: defaultBoard,
                          gradeLevel: defaultGrade,
                          subject: defaultSubject,
                          topic: defaultTopic
                        });
                        fetchSuggestedTopics(defaultTopic, defaultSubject, defaultGrade, defaultBoard);
                      }}
                      className={`w-full px-4 py-3 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold custom-select cursor-pointer ${
                        (user.educationLevel || 'School') !== 'School'
                          ? 'bg-indigo-600 border-indigo-500 text-white font-extrabold shadow-lg shadow-indigo-600/20'
                          : 'bg-slate-950 border-white/5 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <option value="" disabled>-- Choose Competitive Exam & Others --</option>
                      <option value="College">🎓 College / University Degrees</option>
                      <option value="Competitive">🏆 General Competitive Exam</option>
                      <option value="JEE">🏎️ JEE Exam Prep (Engineering)</option>
                      <option value="NEET">🩺 NEET Exam Prep (Medical Entrance)</option>
                      <option value="UPSC">🏛️ UPSC IAS Civil Services CSE</option>
                      <option value="Personal">✨ Personal / Self-Paced Study</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Scholar Profile Name */}
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-400" /> Student Name / Nickname
                </label>
                <input 
                  type="text" 
                  value={user.name}
                  onChange={e => syncLocalUserProfile({ ...user, name: e.target.value })}
                  className="w-full px-4 py-3 text-xs rounded-xl bg-slate-950 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white placeholder-slate-500"
                  placeholder="Enter Student Name / Nickname"
                />
              </div>

              {/* 3. Board Syllabus (Dropdown dynamically determined by Stream) */}
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Board Syllabus
                </label>
                {(() => {
                  const stream = user.educationLevel || 'School';
                  if (stream === 'School') {
                    return (
                      <select
                        value={user.board || 'CBSE'}
                        onChange={e => syncLocalUserProfile({ ...user, board: e.target.value })}
                        className="w-full px-4 py-3 text-xs rounded-xl bg-slate-950 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white custom-select"
                      >
                        <option value="CBSE">CBSE Board (Academic Year 2026-2027)</option>
                        <option value="ICSE">ICSE Board Standards</option>
                        <option value="IGCSE">International IGCSE Syllabus</option>
                        <option value="State Board">State Board Curriculum</option>
                      </select>
                    );
                  } else if (stream === 'College') {
                    return (
                      <select
                        value={user.board || 'Undergraduate Degree'}
                        onChange={e => syncLocalUserProfile({ ...user, board: e.target.value })}
                        className="w-full px-4 py-3 text-xs rounded-xl bg-slate-955 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white custom-select"
                      >
                        <option value="Undergraduate Degree">Undergraduate Degree Program</option>
                        <option value="Postgraduate Degree">Postgraduate Degree Program</option>
                        <option value="PhD Research Study">PhD Research Study Course</option>
                      </select>
                    );
                  } else if (stream === 'Competitive') {
                    return (
                      <select
                        value={user.board || 'UPSC Civil Services'}
                        onChange={e => syncLocalUserProfile({ ...user, board: e.target.value })}
                        className="w-full px-4 py-3 text-xs rounded-xl bg-slate-950 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white custom-select"
                      >
                        <option value="UPSC Civil Services">UPSC Civil Services Examination</option>
                        <option value="JEE Advanced Prep">JEE Advanced / Mains (Engineering Entrance)</option>
                        <option value="NEET Medical Entrance">NEET Medical entrance exam coverage</option>
                        <option value="SAT / GRE Exams">SAT / GRE Standardized Tests</option>
                        <option value="GMAT / CAT MBA Prep">GMAT / CAT MBA Entrance Prep</option>
                      </select>
                    );
                  } else {
                    return (
                      <select
                        value={user.board || 'Self-Paced Learning'}
                        onChange={e => syncLocalUserProfile({ ...user, board: e.target.value })}
                        className="w-full px-4 py-3 text-xs rounded-xl bg-slate-950 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white custom-select"
                      >
                        <option value="Self-Paced Learning">Self-Paced Skills Acquisition</option>
                        <option value="Hobbies & Trivia">Hobbies & General Knowledge Trivia</option>
                        <option value="Skill Certification">Professional Certification Guide</option>
                      </select>
                    );
                  }
                })()}
              </div>

              {/* 4. Target Stage & Learning Focus (Side-by-Side selects) */}
              <div className="grid grid-cols-2 gap-4 text-left">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" /> Target Stage
                  </label>
                  {(() => {
                    const stream = user.educationLevel || 'School';
                    if (stream === 'School') {
                      return (
                        <select
                          value={user.gradeLevel || '10'}
                          onChange={e => syncLocalUserProfile({ ...user, gradeLevel: e.target.value })}
                          className="w-full px-4 py-3 text-xs rounded-xl bg-slate-950 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white custom-select"
                        >
                          <option value="1">Grade 1</option>
                          <option value="2">Grade 2</option>
                          <option value="3">Grade 3</option>
                          <option value="4">Grade 4</option>
                          <option value="5">Grade 5</option>
                          <option value="6">Grade 6</option>
                          <option value="7">Grade 7</option>
                          <option value="8">Grade 8</option>
                          <option value="9">Grade 9</option>
                          <option value="10">Grade 10</option>
                          <option value="11">Grade 11</option>
                          <option value="12">Grade 12</option>
                        </select>
                      );
                    } else if (stream === 'College') {
                      return (
                        <select
                          value={user.gradeLevel || 'Third Year'}
                          onChange={e => syncLocalUserProfile({ ...user, gradeLevel: e.target.value })}
                          className="w-full px-4 py-3 text-xs rounded-xl bg-slate-950 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white custom-select"
                        >
                          <option value="First Year">First Year</option>
                          <option value="Second Year">Second Year</option>
                          <option value="Third Year">Third Year</option>
                          <option value="Final Year">Final Year</option>
                        </select>
                      );
                    } else if (stream === 'Competitive') {
                      return (
                        <select
                          value={user.gradeLevel || 'Prelims Phase'}
                          onChange={e => syncLocalUserProfile({ ...user, gradeLevel: e.target.value })}
                          className="w-full px-4 py-3 text-xs rounded-xl bg-slate-950 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white custom-select"
                        >
                          <option value="Prelims Phase">Prelims Stage Prep</option>
                          <option value="Mains Challenge">Mains Challenge Syllabus</option>
                          <option value="Mock Test Phase">Full Mock Test Phase</option>
                          <option value="Final Interview Prep">Interview & Viva Voce</option>
                        </select>
                      );
                    } else {
                      return (
                        <select
                          value={user.gradeLevel || 'Intermediate Level'}
                          onChange={e => syncLocalUserProfile({ ...user, gradeLevel: e.target.value })}
                          className="w-full px-4 py-3 text-xs rounded-xl bg-slate-950 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white custom-select"
                        >
                          <option value="Beginner Phase">Beginner Coursework</option>
                          <option value="Intermediate Level">Intermediate Stage</option>
                          <option value="Expert Mastery">Expert / Mastery Level</option>
                        </select>
                      );
                    }
                  })()}
                </div>

                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5 text-indigo-400" /> Learning Focus
                  </label>
                  <select
                    value={user.focus || 'Syllabus'}
                    onChange={e => syncLocalUserProfile({ ...user, focus: e.target.value as any })}
                    className="w-full px-4 py-3 text-xs rounded-xl bg-slate-955 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white custom-select"
                  >
                    <option value="Syllabus">Core Syllabus Coverage</option>
                    <option value="Exam Pattern">Advanced Exam Mastery</option>
                    <option value="Specific Topics">Formula & Key revision</option>
                  </select>
                </div>
              </div>

              {/* 5. Subject & Focus Topic (Side-by-Side) */}
              <div className="grid grid-cols-2 gap-4 text-left">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> Subject
                  </label>
                  <input 
                    type="text" 
                    value={user.subject}
                    onChange={e => syncLocalUserProfile({ ...user, subject: e.target.value })}
                    className="w-full px-4 py-3 text-xs rounded-xl bg-slate-950 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white placeholder-slate-500"
                    placeholder="e.g. Science"
                  />
                </div>

                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" /> Focus Topic
                  </label>
                  <input 
                    type="text" 
                    value={user.topic}
                    onChange={e => syncLocalUserProfile({ ...user, topic: e.target.value })}
                    className="w-full px-4 py-3 text-xs rounded-xl bg-slate-955 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-white placeholder-slate-500"
                    placeholder="e.g. Light - Reflection"
                  />
                </div>
              </div>

              {/* AI suggested subtopics section */}
              <div className="bg-slate-950/40 border border-white/5 p-4 rounded-2xl space-y-3">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-[10px] font-headline font-extrabold text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                    <Lightbulb className="w-3.5 h-3.5 text-indigo-400" /> AI Suggested Weak Subtopics
                  </span>
                  <button 
                    type="button"
                    onClick={() => fetchSuggestedTopics(user.topic, user.subject, user.gradeLevel, user.board || 'CBSE')}
                    className="text-indigo-400 hover:text-indigo-300 font-bold text-[9px] uppercase tracking-wider flex items-center gap-1 cursor-pointer bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20"
                    disabled={isFetchingSuggestions}
                  >
                    {isFetchingSuggestions ? <SpinnerIcon className="w-3 h-3 animate-spin" /> : "Fetch Suggested Areas"}
                  </button>
                </div>

                {suggestionError && <p className="text-[9px] text-red-400 font-medium text-left">{suggestionError}</p>}

                <div className="space-y-1.5 text-left max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                  {suggestedTopics.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic leading-relaxed py-2">
                      Click "Fetch Suggested Areas" to dynamically pull high-yield curriculum subtopics matching your active topic of study.
                    </p>
                  ) : (
                    suggestedTopics.map((item, index) => {
                      const isCurrent = user.topic.toLowerCase().trim() === item.topic.toLowerCase().trim();
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            syncLocalUserProfile({ ...user, topic: item.topic });
                            showToast(`Active study target switched to: ${item.topic}`, 'info');
                          }}
                          className={`w-full text-left p-2 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                            isCurrent 
                              ? 'bg-indigo-950/50 border-indigo-500 text-indigo-200 shadow-md ring-1 ring-indigo-500/30' 
                              : 'bg-slate-900 border-white/5 hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <span className="truncate font-semibold text-[11px]">{item.topic}</span>
                          <span className="text-[8px] uppercase bg-indigo-900/50 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-md shrink-0 ml-2">
                            {item.difficulty}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 6. Target Level */}
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <SignalMedium className="w-4 h-4 text-indigo-400" /> Target Level / Study Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: DifficultyLevel.LOW, label: 'Level 1: Recall', desc: 'Recall & basic terms', activeClass: 'bg-emerald-950/40 border-emerald-500 text-emerald-200 ring-2 ring-emerald-500/20' },
                    { id: DifficultyLevel.MEDIUM, label: 'Level 2: Analysis', desc: 'Analysis & application', activeClass: 'bg-amber-950/40 border-amber-500 text-amber-200 ring-2 ring-amber-500/20' },
                    { id: DifficultyLevel.HIGH, label: 'Level 3: Exam Prep', desc: 'Syllabus board level', activeClass: 'bg-rose-950/40 border-rose-500 text-rose-200 ring-2 ring-rose-500/20' }
                  ].map((opt) => {
                    const isSelected = (user.difficulty || DifficultyLevel.LOW) === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => syncLocalUserProfile({ ...user, difficulty: opt.id })}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? opt.activeClass
                            : 'bg-slate-950 border-white/5 text-slate-400 hover:bg-slate-800 hover:border-white/10'
                        }`}
                      >
                        <span className="text-[11px] font-headline font-black uppercase tracking-wider">{opt.label}</span>
                        <span className="text-[8px] font-body mt-1 leading-tight opacity-70">
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 7. Individual Timer Selection */}
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-400" /> Individual Clock / Timer for level topics
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { label: '45s', value: 45 },
                    { label: '1 min', value: 60 },
                    { label: '2 min', value: 120 },
                    { label: '3 min', value: 180 },
                    { label: 'No Time', value: 0 }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setIndividualTimer(opt.value)}
                      className={`py-2 px-1 rounded-xl text-[10px] font-headline font-extrabold border transition-all cursor-pointer text-center ${
                        individualTimer === opt.value
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                          : 'bg-slate-950 border-white/5 text-slate-400 hover:bg-slate-800 hover:border-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Integrated Launch actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-5 border-t border-white/5">
                <button 
                  type="button"
                  onClick={initiateDiagnosis}
                  className="h-14 rounded-2xl text-[10px] font-headline font-extrabold uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer md:col-span-1"
                >
                  <Rocket className="w-4 h-4 animate-bounce" /> Individual Study 🚀
                </button>
                
                <button 
                  type="button"
                  onClick={launchClassroomBattleSetup}
                  className="h-14 rounded-2xl text-[10px] font-headline font-extrabold uppercase tracking-widest bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-600/20 active:scale-95 cursor-pointer md:col-span-1"
                >
                  <Users className="w-4 h-4" /> Classroom Battle 👥
                </button>

                <button 
                  type="button"
                  onClick={launchClassroomBattleSetup}
                  className="h-14 rounded-2xl text-[10px] font-headline font-extrabold uppercase tracking-widest bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-rose-600/20 active:scale-95 cursor-pointer md:col-span-1"
                >
                  <Trophy className="w-4 h-4 animate-pulse" /> Challenge Friends ⚔️
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: Notes Library & Ingest (3/12 cols) ================= */}
        <div className={`${entryMobileTab === 'library' ? 'block' : 'hidden'} ${showSidebars ? 'lg:block lg:col-span-3' : 'lg:hidden'} space-y-4`}>
          
          {/* TAB BAR FOR SIDEBAR COMPANIONS */}
          <div className="flex gap-1 bg-slate-950 border border-white/5 p-1 rounded-xl">
            <button
              onClick={() => setSidebarSubTab('companion')}
              type="button"
              className={`flex-1 py-1.5 text-[9px] font-headline font-extrabold uppercase tracking-widest rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                sidebarSubTab === 'companion' 
                  ? 'bg-amber-650 text-white shadow-md font-black' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" /> CBSE Companion
            </button>
            <button
              onClick={() => setSidebarSubTab('library')}
              type="button"
              className={`flex-1 py-1.5 text-[9px] font-headline font-extrabold uppercase tracking-widest rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                sidebarSubTab === 'library' 
                  ? 'bg-indigo-650 text-white shadow-md font-black' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Notes Library
            </button>
          </div>

          {sidebarSubTab === 'library' ? (
            <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="border-b border-white/5 pb-2 text-left">
                <h3 className="text-xs font-extrabold text-white">Study Notes Library</h3>
                <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">Ingest textbook chapters & PDFs</p>
              </div>

              {libError && <p className="text-[10px] text-red-400 font-bold bg-red-950/20 p-2.5 rounded-xl border border-red-900/30 text-left">{libError}</p>}

              {/* Saved Guides List */}
              <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-0.5 no-scrollbar">
                {materials.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic text-center py-6 bg-slate-950/40 rounded-xl border border-dashed border-white/5">
                    Using default CBSE/school system textbook patterns. Click tab below to add notes.
                  </p>
                ) : (
                  materials.map(m => (
                    <div 
                      key={m.id} 
                      className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                        selectedMaterialId === m.id 
                          ? 'bg-indigo-950/50 border-indigo-500 shadow-sm' 
                          : 'bg-slate-950 border-white/5 hover:bg-slate-900'
                      }`}
                    >
                      <button 
                        onClick={() => setSelectedMaterialId(selectedMaterialId === m.id ? null : m.id)}
                        disabled={pdfParsing}
                        className="flex-1 text-left min-w-0 cursor-pointer"
                        type="button"
                      >
                        <p className="text-[11px] font-extrabold text-white truncate">{m.title}</p>
                        <p className="text-[9px] text-slate-400 truncate">{m.content.slice(0, 45)}...</p>
                      </button>
                      <button 
                        onClick={() => handleDeleteMaterial(m.id)}
                        className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-white/5 cursor-pointer"
                        type="button"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Tabbed Ingestion Container */}
              <div className="flex gap-1 bg-slate-950 border border-white/5 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab('text')}
                  type="button"
                  className={`flex-1 py-1 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Type Notes
                </button>
                <button
                  onClick={() => setActiveTab('pdf')}
                  type="button"
                  className={`flex-1 py-1 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'pdf' ? 'bg-indigo-600 text-white font-black shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Upload PDF
                </button>
              </div>

              {activeTab === 'text' ? (
                <form onSubmit={handleMaterialSubmit} className="space-y-2">
                  <input 
                    type="text" 
                    placeholder="Chapter Title" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white placeholder-slate-500"
                  />
                  <textarea 
                    placeholder="Paste high-yield curriculum points or syllabus texts here..." 
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    rows={2}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white placeholder-slate-500"
                  />
                  <button 
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase rounded-lg transition-all shadow-sm cursor-pointer"
                  >
                    Save to Library
                  </button>
                </form>
              ) : (
                <div 
                  onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
                  className={`p-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-all ${
                    dragActive ? 'border-indigo-500 bg-indigo-950/20' : 'border-white/5 bg-slate-950'
                  }`}
                >
                  {pdfParsing ? (
                    <div className="space-y-1">
                      <SpinnerIcon className="w-5 h-5 text-indigo-400 animate-spin mx-auto" />
                      <p className="text-[10px] font-bold text-indigo-300">Ingesting Syllabus...</p>
                      <p className="text-[8px] text-slate-400">Parsing {pdfProgress.current} / {pdfProgress.total}</p>
                    </div>
                  ) : (
                    <>
                      <FileText className="w-6 h-6 text-slate-500 mb-1" />
                      <p className="text-[10px] font-bold text-slate-300 uppercase">Drag & Drop PDF here</p>
                      <p className="text-[8px] text-slate-500 mb-2">or select textbook summary</p>
                      <input 
                        type="file" 
                        accept="application/pdf"
                        onChange={handleFileInputChange}
                        className="hidden" 
                        id="pdf-library-upload"
                      />
                      <label 
                        htmlFor="pdf-library-upload"
                        className="cursor-pointer px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9px] uppercase rounded-lg transition-all"
                      >
                        Browse PDF
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (() => {
            const cbsePrep = getCBSEPrepAnalysis(user.subject, user.topic);
            return (
              <div className="bg-slate-900/80 border border-white/5 rounded-2xl p-5 shadow-sm space-y-4 text-left">
                {/* Header */}
                <div className="border-b border-white/5 pb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-headline font-black text-white flex items-center gap-1.5 uppercase tracking-wide">
                      <GraduationCap className="w-4 h-4 text-amber-500" /> CBSE Prep Companion
                    </h3>
                    <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[8px] font-headline font-black px-1.5 py-0.5 rounded uppercase">
                      Class {user.gradeLevel}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-1">Topic-oriented board analysis</p>
                </div>

                {/* Active Info */}
                <div className="p-2.5 bg-slate-950 rounded-xl border border-white/5 text-[10px] space-y-1">
                  <p className="text-slate-400 font-bold">
                    Subject: <span className="text-white font-black">{user.subject}</span>
                  </p>
                  <p className="text-slate-400 font-bold">
                    Topic: <span className="text-amber-400 font-black">{user.topic}</span>
                  </p>
                </div>

                {/* Section 1: Syllabus Pillars */}
                <div className="space-y-1.5">
                  <h4 className="text-[9px] font-headline font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Syllabus Highlights
                  </h4>
                  <ul className="space-y-1 bg-slate-950/40 p-2.5 rounded-xl border border-white/5">
                    {cbsePrep.syllabusPillars.map((pill, idx) => (
                      <li key={idx} className="text-[10px] text-slate-300 leading-relaxed font-body font-bold flex items-start gap-1.5">
                        <span className="text-indigo-400 mt-0.5 flex-none font-mono">▸</span>
                        <span>{pill}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Section 2: Frequently Asked Questions (Accordion) */}
                <div className="space-y-2">
                  <h4 className="text-[9px] font-headline font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-400" /> Past Board Questions (FAQs)
                  </h4>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5 no-scrollbar">
                    {cbsePrep.faqs.map((faq, idx) => {
                      const isExpanded = expandedFaqIndex === idx;
                      return (
                        <div key={idx} className="bg-slate-950 border border-white/5 rounded-xl overflow-hidden transition-all">
                          <button
                            type="button"
                            onClick={() => setExpandedFaqIndex(isExpanded ? null : idx)}
                            className="w-full text-left p-2.5 hover:bg-slate-900 transition-all cursor-pointer flex items-start justify-between gap-2 border-none"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[7px] font-headline font-black px-1.5 py-0.2 rounded uppercase">
                                  {faq.frequentlyAskedYear || "Board Standard"}
                                </span>
                                <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[7px] font-headline font-black px-1.5 py-0.2 rounded uppercase">
                                  {faq.marks} Marks
                                </span>
                              </div>
                              <p className="text-[10.5px] font-bold text-white leading-snug">{faq.question}</p>
                            </div>
                            <ChevronRight className={`w-3.5 h-3.5 text-slate-400 mt-0.5 flex-none transition-transform ${isExpanded ? 'rotate-90 text-amber-400' : ''}`} />
                          </button>
                          
                          {isExpanded && (
                            <div className="p-3 bg-slate-950 border-t border-white/5 space-y-1">
                              <p className="text-[8px] font-headline font-extrabold uppercase text-amber-500 tracking-wider">Perfect Model Answer:</p>
                              <p className="text-[10px] text-slate-300 leading-relaxed font-body font-bold italic bg-white/5 p-2 rounded-lg border border-white/5">
                                "{faq.answer}"
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section 3: Future Board Predictions */}
                <div className="space-y-2">
                  <h4 className="text-[9px] font-headline font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <Lightbulb className="w-3.5 h-3.5 text-emerald-400" /> Future Board Predictions
                  </h4>
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-0.5 no-scrollbar">
                    {cbsePrep.predictions.map((pred, idx) => (
                      <div key={idx} className="bg-slate-950 p-2.5 rounded-xl border border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-headline font-black text-amber-400 uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                            {pred.questionType}
                          </span>
                          <span className="text-[7.5px] font-headline font-black text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                            {pred.probability} Prob
                          </span>
                        </div>
                        <p className="text-[10.5px] font-black text-white">{pred.topicFocus}</p>
                        <p className="text-[9px] text-slate-400 leading-normal font-bold">
                          <span className="text-white font-black">Pattern:</span> {pred.expectedPattern}
                        </p>
                        <p className="text-[9px] text-slate-400 leading-normal font-bold">
                          <span className="text-white font-black">Why Expected:</span> {pred.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Non-intrusive Quick Sync guest alert inside sidebar */}
          {!currentUser && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2">
              <h4 className="text-xs font-extrabold text-[#1e293b]">Protect Your Progress</h4>
              <p className="text-[10px] text-[#64748b] leading-normal">
                Sign in with Google to synchronize diagnostic lessons, rewards, and total streak analytics securely.
              </p>
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button 
                  onClick={handleGoogleLogin}
                  className="py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold rounded-lg transition-all"
                >
                  Google Sign-In
                </button>
                <button 
                  onClick={handleAnonymousLogin}
                  className="py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-[9px] font-bold rounded-lg transition-all"
                >
                  Guest Guest
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= PRIMARY MOBILE BOTTOM BAR TAB NAVIGATION ================= */}
      <div className="fixed bottom-5 left-4 right-4 lg:hidden z-40 bg-white border border-[#e2e8f0] p-1 rounded-2xl shadow-lg flex gap-1 w-auto">
        <button
          onClick={() => setEntryMobileTab('study')}
          type="button"
          className={`flex-1 py-2 rounded-xl text-[10px] flex flex-col items-center justify-center gap-1 transition-all min-h-[44px] ${
            entryMobileTab === 'study' ? 'bg-[#1e3a8a] text-white shadow-sm' : 'text-[#64748b]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-[9px] font-bold">Study</span>
        </button>
        <button
          onClick={() => setEntryMobileTab('library')}
          type="button"
          className={`flex-1 py-2 rounded-xl text-[10px] flex flex-col items-center justify-center gap-1 transition-all min-h-[44px] ${
            entryMobileTab === 'library' ? 'bg-[#1e3a8a] text-white shadow-sm' : 'text-[#64748b]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span className="text-[9px] font-bold">Library</span>
        </button>
        <button
          onClick={() => setEntryMobileTab('records')}
          type="button"
          className={`flex-1 py-2 rounded-xl text-[10px] flex flex-col items-center justify-center gap-1 transition-all min-h-[44px] ${
            entryMobileTab === 'records' ? 'bg-[#1e3a8a] text-white shadow-sm' : 'text-[#64748b]'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span className="text-[9px] font-bold">Profile</span>
        </button>
      </div>

      {/* ================= MODAL: Mastery Configurator Goal Setter (Flat Single-Screen Form) - Removed as form is now inline ================= */}
    </div>
  );
};
