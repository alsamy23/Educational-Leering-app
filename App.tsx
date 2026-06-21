import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, Sparkles, Rocket, Trophy, Play, CheckCircle, 
  ChevronRight, Volume2, VolumeX, Shield, ArrowLeft, Plus, 
  Trash2, Eye, Award, Clock, GraduationCap, Monitor, FileText,
  User, ShieldCheck, HelpCircle, Laptop, Lightbulb, Users,
  ListRestart, Check, X, SignalLow, SignalMedium, SignalHigh,
  Settings, LogOut, Info, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  QuestionType, StudyFocus, TestRecord, StudyMaterial,
  UserProfile, QuizQuestion, QuizSession, DifficultyLevel,
  Group, ClassroomSession, AppScreen
} from './types';
import { Button } from './components/Button';
import { db, auth, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { generateQuizQuestions, speakTextLocal } from './services/geminiService';

// --- Sub-Component: MotivationalPopup ---
interface MotivationalPopupProps {
  show: boolean;
  label?: string;
  onClose: () => void;
}
const MotivationalPopup: React.FC<MotivationalPopupProps> = ({ show, label = "Spectacular!", onClose }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 2500);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -50 }}
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-secondary text-on-secondary px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-3 font-headline font-extrabold text-sm uppercase italic tracking-widest neon-glow-secondary"
        >
          <Sparkles className="w-5 h-5 text-white animate-spin" />
          <span>{label}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// --- Sub-Component: MaterialManager ---
interface MaterialManagerProps {
  isOpen: boolean;
  onClose: () => void;
  materials: StudyMaterial[];
  onAdd: (title: string, content: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}
const MaterialManager: React.FC<MaterialManagerProps> = ({
  isOpen, onClose, materials, onAdd, onDelete, onSelect, selectedId
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Please fill in both title and contents.');
      return;
    }
    onAdd(title.trim(), content.trim());
    setTitle('');
    setContent('');
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface border border-white/10 rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tighter">Study Material Hub</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full bg-white/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto no-scrollbar space-y-6 flex-1">
          {error && <p className="text-xs text-error font-body font-bold">{error}</p>}

          <form onSubmit={handleSubmit} className="space-y-4 bg-white/5 p-5 rounded-2xl border border-white/5">
            <p className="text-xs font-headline font-extrabold uppercase text-primary tracking-wider italic">Add Curriculum Text</p>
            <input 
              type="text" 
              placeholder="Material Title (e.g. NCERT Science Chapter 12)" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-white/5 text-sm font-body font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <textarea 
              placeholder="Paste official textbook reading segments, curriculum syllabus points, or study notes here..." 
              value={content}
              rows={4}
              onChange={e => setContent(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-container border border-white/5 text-sm font-body font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <Button type="submit" className="py-2.5">Ingest Material</Button>
          </form>

          <div className="space-y-3">
            <p className="text-xs font-headline font-extrabold uppercase text-on-surface-variant tracking-wider">Your Source Library ({materials.length})</p>
            {materials.length === 0 ? (
              <p className="text-xs text-on-surface-variant/70 italic text-center py-6">No custom reading materials added yet. The AI Tutor is operating in default Curriculum mode.</p>
            ) : (
              <div className="space-y-2">
                {materials.map(m => (
                  <div key={m.id} className={`flex items-center justify-between p-4 rounded-xl border ${selectedId === m.id ? 'bg-primary/10 border-primary/40' : 'bg-surface-container-lowest border-white/5'} transition-all`}>
                    <button 
                      onClick={() => onSelect(selectedId === m.id ? null : m.id)}
                      className="flex-1 text-left"
                    >
                      <p className="text-sm font-headline font-extrabold text-on-surface flex items-center gap-2">
                        {selectedId === m.id && <Check className="w-4 h-4 text-primary" />}
                        {m.title}
                      </p>
                      <p className="text-xs text-on-surface-variant line-clamp-1 mt-0.5">{m.content}</p>
                    </button>
                    <button 
                      onClick={() => onDelete(m.id)}
                      className="text-error/70 hover:text-error p-2 hover:bg-white/5 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// --- Sub-Component: ClassroomSetupView ---
interface ClassroomSetupViewProps {
  onStart: (groups: Group[], timer: number) => void;
  onCancel: () => void;
  initialTimer?: number;
}
const ClassroomSetupView: React.FC<ClassroomSetupViewProps> = ({ onStart, onCancel, initialTimer = 45 }) => {
  const [groups, setGroups] = useState<Group[]>([
    { id: '1', name: 'Alpha Squad', score: 0, members: [] },
    { id: '2', name: 'Beta Brains', score: 0, members: [] },
    { id: '3', name: 'Gamma Giants', score: 0, members: [] },
    { id: '4', name: 'Delta Dynamos', score: 0, members: [] },
  ]);
  const [timer, setTimer] = useState<number>(initialTimer);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addGroup = () => {
    if (groups.length >= 5) return;
    const newId = Math.max(...groups.map(g => parseInt(g.id) || 0), 0) + 1;
    const idStr = newId.toString();
    setGroups([...groups, { id: idStr, name: `Group ${idStr}`, score: 0, members: [] }]);
  };

  const removeGroup = (id: string) => {
    if (groups.length <= 2) return;
    setGroups(groups.filter(g => g.id !== id));
  };

  const updateGroupName = (id: string, name: string) => {
    setGroups(groups.map(g => g.id === id ? { ...g, name } : g));
  };

  const updateGroupDifficulty = (id: string, difficulty: DifficultyLevel) => {
    setGroups(groups.map(g => g.id === id ? { ...g, difficulty } : g));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const names = text.split(/[\n,]/).map(n => n.trim()).filter(n => n !== "");
      const newGroups: Group[] = names.slice(0, 5).map((name, idx) => ({
        id: (idx + 1).toString(),
        name: name,
        score: 0,
        members: []
      }));
      if (newGroups.length >= 2) {
        setGroups(newGroups);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in pb-10 max-w-4xl mx-auto">
      <div className="bg-surface-container-lowest/80 glass-card p-6 md:p-10 rounded-[2rem] shadow-2xl border border-white/10 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl md:text-4xl font-headline font-extrabold text-on-surface tracking-tighter italic tv-text-shadow">Battle Setup</h2>
          <Button onClick={onCancel} variant="outline" className="rounded-full w-10 h-10 min-h-0 flex items-center justify-center border-white/10 p-0">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex justify-between items-center">
          <h3 className="text-xs md:text-sm font-headline font-extrabold text-on-surface-variant uppercase tracking-widest italic">Group Configuration</h3>
          <div className="flex gap-2.5">
             <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.csv" className="hidden" />
             <button 
               onClick={() => fileInputRef.current?.click()}
               className="text-[10px] font-headline font-extrabold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors uppercase"
             >
               Load TXT/CSV Lists
             </button>
             <span className="text-xs font-headline font-extrabold text-on-surface bg-surface-container px-3 py-1.5 rounded-lg">{groups.length}/5</span>
          </div>
        </div>

        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.id} className="flex gap-3 items-center bg-white/5 p-4 rounded-xl border border-white/5">
              <div className="flex-1 space-y-2">
                <input 
                  type="text" 
                  value={group.name} 
                  onChange={e => updateGroupName(group.id, e.target.value)} 
                  className="w-full px-4 py-2 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold" 
                  placeholder={`Group ${group.id} Name`}
                />
                <div className="flex gap-1">
                  {Object.values(DifficultyLevel).filter(l => l !== DifficultyLevel.DEFAULT).map(level => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => updateGroupDifficulty(group.id, level)}
                      className={`flex-1 py-1 rounded-lg text-[8px] font-headline font-extrabold uppercase border transition-all flex items-center justify-center gap-1 ${
                        (group.difficulty || DifficultyLevel.LOW) === level 
                          ? 'bg-primary text-on-primary border-primary' 
                          : 'bg-surface-container-lowest text-outline border-outline-variant/10 hover:border-primary-container'
                      }`}
                    >
                      {level === DifficultyLevel.LOW && <SignalLow className="w-2.5 h-2.5" />}
                      {level === DifficultyLevel.MEDIUM && <SignalMedium className="w-2.5 h-2.5" />}
                      {level === DifficultyLevel.HIGH && <SignalHigh className="w-2.5 h-2.5" />}
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => removeGroup(group.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-error-container/30 text-error hover:bg-error-container transition-all"
                disabled={groups.length <= 2}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {groups.length < 5 && (
          <button 
            onClick={addGroup}
            className="w-full py-3 rounded-xl border border-dashed border-white/10 text-on-surface-variant text-xs font-headline font-extrabold uppercase hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 bg-white/5"
          >
            <Plus className="w-4 h-4" /> Add Team
          </button>
        )}

        <div className="pt-4 border-t border-white/5 flex justify-between items-center text-xs">
          <label className="font-headline font-extrabold text-on-surface-variant uppercase tracking-widest italic">Question Timer</label>
          <select 
            value={timer} 
            onChange={(e) => setTimer(Number(e.target.value))}
            className="bg-surface-container border border-white/5 rounded-lg px-3 py-1.5 font-body font-bold text-on-surface focus:outline-none text-xs"
          >
            <option value={0}>Practice (Untimed)</option>
            <option value={30}>30 Secs</option>
            <option value={45}>45 Secs (Rec)</option>
            <option value={60}>60 Secs</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3">
        <Button onClick={() => onStart(groups, timer)} className="h-16 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-xs shadow-2xl shadow-primary/40 neon-glow-primary">
          Launch Classroom Battle
        </Button>
        <Button onClick={onCancel} variant="outline" className="h-12 rounded-[1.5rem] font-headline font-extrabold uppercase tracking-widest text-[9px] border-white/10 bg-surface-container-lowest/10">
          Cancel Setup
        </Button>
      </div>
    </div>
  );
};

// --- Sub-Component: ProgressScreen ---
const ProgressScreen: React.FC<{ user: UserProfile, onBack: () => void }> = ({ user, onBack }) => {
  const history = user.testHistory || [];

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in pb-10 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Award className="w-6 h-6 text-primary" />
          <h2 className="text-xl md:text-2xl font-headline font-extrabold text-on-surface tracking-tighter">My Diagnostics Record</h2>
        </div>
        <Button onClick={onBack} variant="outline" className="h-9 px-4 w-auto text-[9px] font-headline font-extrabold uppercase tracking-widest">Back</Button>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div className="bg-primary/10 border border-primary/20 p-5 rounded-2xl text-on-surface shadow-md">
          <p className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-primary italic">Total Accumulated Points</p>
          <p className="text-2xl font-headline font-extrabold tracking-tighter mt-1">{user.totalPoints.toLocaleString() || 0} pts</p>
        </div>
        <div className="bg-secondary/10 border border-secondary/20 p-5 rounded-2xl text-on-surface shadow-md">
          <p className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-secondary italic">Current Mastery Level</p>
          <p className="text-2xl font-headline font-extrabold tracking-tighter mt-1">Level {user.level}</p>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-white/10 p-5 rounded-2xl space-y-4">
        <p className="text-xs font-headline font-extrabold uppercase tracking-wider text-on-surface-variant">Diagnostics History ({history.length})</p>
        
        {history.length === 0 ? (
          <p className="text-xs text-on-surface-variant/70 italic text-center py-8">No tests taken yet. Perform adaptive quizzes to begin logging diagnostic milestones.</p>
        ) : (
          <div className="space-y-3 overflow-y-auto max-h-[50vh] no-scrollbar">
            {history.map((record, i) => (
              <div key={i} className="p-4 rounded-xl bg-surface border border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-headline font-extrabold text-on-surface flex items-center gap-1.5 uppercase tracking-wide">
                    {record.topic}
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${record.type === 'classroom' ? 'bg-secondary/20 text-secondary' : 'bg-primary/20 text-primary'}`}>
                      {record.type}
                    </span>
                  </p>
                  <p className="text-[10px] text-on-surface-variant/80 mt-1 font-body font-bold">{record.date} • {record.subject} • Grade {record.grade || 'N/A'} • {record.score * 10} pts</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-headline font-extrabold text-on-surface">{record.score}/5</p>
                  <p className="text-[8px] font-bold uppercase tracking-wider text-primary">Points Earned</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- MAIN SCREEN ENTRY EXPORT ---
export default function App() {
  // --- Firebase Synchronization & Auth States ---
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // --- Core Domain State ---
  const [user, setUser] = useState<UserProfile>({
    name: '',
    gradeLevel: '10',
    board: 'CBSE',
    subject: 'Science',
    focus: StudyFocus.SYLLABUS,
    topic: 'Light - Reflection and Refraction',
    level: 1,
    totalQuizzes: 0,
    totalPoints: 0,
    testHistory: []
  });

  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ENTRY);
  const [currentQuestions, setCurrentQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [feedback, setFeedback] = useState<{ selected: number; isCorrect: boolean } | null>(null);

  // --- Adaptive Visuals HUD Modes ---
  const [fontSizeMode, setFontSizeMode] = useState<'normal' | 'large' | 'tv'>('normal');
  const [screenViewMode, setScreenViewMode] = useState<'standard' | 'presentation' | 'mobile'>('standard');

  // --- Timing HUD and Clock positioning ---
  const [timeLeft, setTimeLeft] = useState<number>(45);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const originalPos = useRef({ x: 0, y: 0 });

  // --- Reading Aloud Audio state ---
  const [isReadingAloud, setIsReadingAloud] = useState<boolean>(false);

  // --- Classroom Multiplayer Battle stats ---
  const [classroomSession, setClassroomSession] = useState<ClassroomSession | null>(null);

  // --- Source Ingest Materials Storage ---
  const [materials, setMaterials] = useState<StudyMaterial[]>([
    { id: '1', title: 'CBSE Physics Ch-1 Syllabus Guideline', content: 'Reflection of light by curved surfaces; Images formed by spherical mirrors, centre of curvature, principal axis, principal focus, focal length, mirror formula, magnification, Refraction; Laws of refraction, refractive index.', timestamp: Date.now() }
  ]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [isMaterialManagerOpen, setIsMaterialManagerOpen] = useState<boolean>(false);

  // --- Diagnosis Synthesizer Loaders ---
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [loadingMessage, setLoadingMessage] = useState<string>('Mobilizing Diagnostic Assets...');

  // --- Micro Visual Feedbacks ---
  const [showMotivationalPopup, setShowMotivationalPopup] = useState<boolean>(false);
  const [motivationText, setMotivationText] = useState<string>('Extraordinary!');

  // --- Auth state change listener ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setCurrentUser(fbUser);
      if (fbUser) {
        // Fetch cloud settings
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const cloudUser = userSnap.data() as UserProfile;
            setUser(cloudUser);
          } else {
            // Write initial layout
            const initialUser: UserProfile = {
              name: fbUser.displayName || '',
              gradeLevel: '10',
              board: 'CBSE',
              subject: 'Science',
              focus: StudyFocus.SYLLABUS,
              topic: 'Light - Reflection and Refraction',
              level: 1,
              totalQuizzes: 0,
              totalPoints: 0,
              testHistory: []
            };
            await setDoc(userDocRef, initialUser);
            setUser(initialUser);
          }
        } catch (e) {
          console.error("Failed to load user document", e);
        }
      } else {
        // Fall back to localStorage profile if anonymous
        const cached = localStorage.getItem('scholar_earn_user');
        if (cached) {
          try {
            setUser(JSON.parse(cached));
          } catch (_) {}
        }
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // --- Trigger Profile Offline Cache Sync ---
  const syncLocalUserProfile = (updated: UserProfile) => {
    setUser(updated);
    localStorage.setItem('scholar_earn_user', JSON.stringify(updated));
    if (currentUser) {
      setDoc(doc(db, 'users', currentUser.uid), updated).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
      });
    }
  };

  // --- Countdown Clock Hook ---
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isTimerRunning && timeLeft === 0) {
      handleTimeOut();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timeLeft]);

  // --- TimeOut Auto Handler ---
  const handleTimeOut = () => {
    setIsTimerRunning(false);
    if (classroomSession) {
      // Advance classroom group next
      const nextIdx = (classroomSession.currentGroupIndex + 1) % classroomSession.groups.length;
      setClassroomSession({
        ...classroomSession,
        currentGroupIndex: nextIdx
      });
      setMotivationText("Clock ran out! Pass to Next Group.");
      setShowMotivationalPopup(true);
      // Re-trigger timer
      setTimeout(() => {
        setTimeLeft(classroomSession.questionTimer || 45);
        setIsTimerRunning(classroomSession.questionTimer ? classroomSession.questionTimer > 0 : false);
      }, 2500);
    } else {
      // Standard practice mode: auto submit incorrect
      setFeedback({ selected: -1, isCorrect: false });
    }
  };

  // --- Spoken Text local reader with stops ---
  const handleReadAloud = async () => {
    if (isReadingAloud) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsReadingAloud(false);
      return;
    }

    const currentQ = currentQuestions[currentQuestionIndex];
    if (!currentQ) return;

    let textToSpeak = currentQ.text;
    if (currentQ.contextMaterial) {
      textToSpeak = `${currentQ.contextMaterial}. Question: ${currentQ.text}`;
    }

    setIsReadingAloud(true);
    await speakTextLocal(textToSpeak, 
      () => {}, 
      () => { setIsReadingAloud(false); }
    );
  };

  // --- Load and synthesize questions ---
  const initiateDiagnosis = async () => {
    if (!user.name.trim()) {
      alert("Please configure your Student Name before starting the diagnose course.");
      return;
    }
    
    // Stop any speech
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsReadingAloud(false);

    setLoadingProgress(10);
    setLoadingMessage("Synthesizing Board Curriculum Guidelines...");
    setCurrentScreen(AppScreen.LOADING);

    // Simulate synth steps
    const timer1 = setTimeout(() => {
      setLoadingProgress(45);
      setLoadingMessage("Tuning Expert Gemini AI Explanatory Engine...");
    }, 1000);

    const timer2 = setTimeout(() => {
      setLoadingProgress(75);
      setLoadingMessage("Shuffling Options & Validating Uniqueness Map...");
    }, 2200);

    try {
      const activeMaterial = materials.find(m => m.id === selectedMaterialId);
      const questionsFetched = await generateQuizQuestions(
        user, 
        false, 
        undefined, 
        user.topic, 
        DifficultyLevel.DEFAULT, 
        0, 
        undefined, 
        activeMaterial?.content
      );

      clearTimeout(timer1);
      clearTimeout(timer2);
      setLoadingProgress(100);
      setLoadingMessage("Diagnostics Complete! Preparing Interface...");

      setTimeout(() => {
        setCurrentQuestions(questionsFetched);
        setCurrentQuestionIndex(0);
        setUserAnswers(new Array(questionsFetched.length).fill(null));
        setFeedback(null);
        
        const testTimer = 45; // default individual countdown
        setTimeLeft(testTimer);
        setIsTimerRunning(true);

        setActiveQuiz({
          profile: user,
          questions: questionsFetched,
          userAnswers: new Array(questionsFetched.length).fill(null),
          score: 0,
          questionTimer: testTimer
        });

        setCurrentScreen(AppScreen.QUIZ);
      }, 500);

    } catch (error: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      alert(error.message || "Synthesizer failed. Check API Keys in settings.");
      setCurrentScreen(AppScreen.ENTRY);
    }
  };

  // --- Launch Classroom Battles ---
  const launchClassroomBattleSetup = () => {
    setCurrentScreen(AppScreen.CLASSROOM_SETUP);
  };

  // --- Trigger Classroom Battle ---
  const startClassroomSession = async (groupsList: Group[], timerDuration: number) => {
    if (!user.topic.trim()) {
      alert("Please select or type a Topic focus first.");
      return;
    }

    // Stop speech
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsReadingAloud(false);

    setLoadingProgress(10);
    setLoadingMessage("Fortifying Classroom Arena...");
    setCurrentScreen(AppScreen.LOADING);

    const timer1 = setTimeout(() => {
      setLoadingProgress(50);
      setLoadingMessage("Generating Team-Specific Unique Challenge Matrices...");
    }, 1200);

    try {
      const activeMaterial = materials.find(m => m.id === selectedMaterialId);
      // Fetch questions 
      const questionsFetched = await generateQuizQuestions(
        user, 
        false, 
        'Multi-Team Arena', 
        user.topic, 
        DifficultyLevel.DEFAULT, 
        0, 
        undefined, 
        activeMaterial?.content
      );

      clearTimeout(timer1);
      setLoadingProgress(100);
      setLoadingMessage("Battle Grid Connected!");

      setTimeout(() => {
        setCurrentQuestions(questionsFetched);
        setCurrentQuestionIndex(0);
        setUserAnswers(new Array(questionsFetched.length).fill(null));
        setFeedback(null);

        setClassroomSession({
          id: 'arena_' + Date.now(),
          groups: groupsList.map(g => ({ ...g, score: 0 })),
          currentGroupIndex: 0,
          subject: user.subject,
          gradeLevel: user.gradeLevel,
          section: user.section || 'A',
          topic: user.topic,
          isStarted: true,
          questionTimer: timerDuration
        });

        setTimeLeft(timerDuration);
        setIsTimerRunning(timerDuration > 0);
        setCurrentScreen(AppScreen.QUIZ);
      }, 500);

    } catch (e: any) {
      clearTimeout(timer1);
      alert(e.message || "Failed to organize battle questions.");
      setCurrentScreen(AppScreen.CLASSROOM_SETUP);
    }
  };

  // --- Option click evaluator with dyn key shifting fixes ---
  const handleOptionClick = (optionIdx: number) => {
    if (feedback !== null) return; // Prevent multiple clicks
    setIsTimerRunning(false); // Pause clock feedback
    if (window.speechSynthesis) window.speechSynthesis.cancel(); // Stop read alouds
    setIsReadingAloud(false);

    const currentQ = currentQuestions[currentQuestionIndex];
    if (!currentQ) return;

    const correct = optionIdx === currentQ.correctIndex;
    setFeedback({
      selected: optionIdx,
      isCorrect: correct
    });

    // Update ongoing answers
    const nextAnswers = [...userAnswers];
    nextAnswers[currentQuestionIndex] = optionIdx;
    setUserAnswers(nextAnswers);

    // Dynamic positive words mapping
    if (correct) {
      const niceWords = ['Outstanding!', 'Phenomenal!', 'Impeccable!', 'Strategic Mind!', 'Elite Master!'];
      setMotivationText(niceWords[Math.floor(Math.random() * niceWords.length)]);
      setShowMotivationalPopup(true);
    }

    // Adapt states
    if (classroomSession) {
      // If correct, point scored for active team
      if (correct) {
        const activeGroup = classroomSession.groups[classroomSession.currentGroupIndex];
        const updatedGroups = classroomSession.groups.map((g, idx) => 
          idx === classroomSession.currentGroupIndex 
            ? { ...g, score: g.score + 1 } 
            : g
        );
        setClassroomSession({
          ...classroomSession,
          groups: updatedGroups
        });
      }
    } else if (activeQuiz) {
      // Standard score sync
      if (correct) {
        setActiveQuiz({
          ...activeQuiz,
          score: activeQuiz.score + 1,
          userAnswers: nextAnswers
        });
      } else {
        setActiveQuiz({
          ...activeQuiz,
          userAnswers: nextAnswers
        });
      }
    }
  };

  // --- Advance inside Quiz ---
  const handleNextQuizQuestion = () => {
    if (currentQuestionIndex + 1 < currentQuestions.length) {
      setCurrentQuestionIndex(prev => prev + 1);
      setFeedback(null);
      
      const nextTimer = classroomSession ? (classroomSession.questionTimer || 45) : 45;
      setTimeLeft(nextTimer);
      setIsTimerRunning(nextTimer > 0);

      if (classroomSession) {
        // Rotate classroom team
        const nextGroupIdx = (classroomSession.currentGroupIndex + 1) % classroomSession.groups.length;
        setClassroomSession({
          ...classroomSession,
          currentGroupIndex: nextGroupIdx
        });
      }
    } else {
      // Finish Session
      setIsTimerRunning(false);
      if (classroomSession) {
        // Log multiplayer battle
        const parsedTime = new Date().toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const record: TestRecord = {
          topic: classroomSession.topic,
          score: Math.max(...classroomSession.groups.map(g => g.score)),
          total: 5,
          date: parsedTime,
          type: 'classroom',
          subject: classroomSession.subject,
          grade: classroomSession.gradeLevel
        };

        const updatedUser: UserProfile = {
          ...user,
          totalPoints: user.totalPoints + 30, // reward code
          totalQuizzes: user.totalQuizzes + 1,
          testHistory: [record, ...(user.testHistory || [])]
        };

        syncLocalUserProfile(updatedUser);
        setCurrentScreen(AppScreen.LEADERBOARD);
      } else if (activeQuiz) {
        // Log individual adaptive
        const finalScore = activeQuiz.score;
        const rewardPoints = finalScore * 10;
        const parsedTime = new Date().toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit' });

        const record: TestRecord = {
          topic: user.topic,
          score: finalScore,
          total: 5,
          date: parsedTime,
          type: 'individual',
          subject: user.subject,
          grade: user.gradeLevel
        };

        const progressiveLevel = finalScore >= 4 ? user.level + 1 : user.level;

        const updatedUser: UserProfile = {
          ...user,
          level: progressiveLevel,
          totalPoints: user.totalPoints + rewardPoints,
          totalQuizzes: user.totalQuizzes + 1,
          testHistory: [record, ...(user.testHistory || [])]
        };

        syncLocalUserProfile(updatedUser);
        setActiveQuiz({
          ...activeQuiz,
          score: finalScore
        });
        setCurrentScreen(AppScreen.RESULTS);
      }
    }
  };

  // --- Custom Material Handlers ---
  const handleAddNewMaterial = (title: string, content: string) => {
    const newItem: StudyMaterial = {
      id: Math.random().toString(36).substring(7),
      title,
      content,
      timestamp: Date.now()
    };
    setMaterials([...materials, newItem]);
    setSelectedMaterialId(newItem.id);
    setIsMaterialManagerOpen(false);
  };

  const handleDeleteMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
    if (selectedMaterialId === id) setSelectedMaterialId(null);
  };

  // --- Clock HUD Draggable Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    originalPos.current = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setDragOffset({
      x: e.clientX - originalPos.current.x,
      y: e.clientY - originalPos.current.y
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // --- Reset to profile launch ---
  const handleResetToMenu = () => {
    setCurrentScreen(AppScreen.ENTRY);
    setCurrentQuestions([]);
    setCurrentQuestionIndex(0);
    setFeedback(null);
    setClassroomSession(null);
  };

  return (
    <div className="min-h-screen text-on-background flex flex-col antialiased select-none pb-8 select-text">
      {/* Dynamic Background Overlays */}
      <div className="absolute inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[10%] left-[25%] w-[350px] h-[350px] bg-primary/15 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] right-[25%] w-[450px] h-[450px] bg-secondary/15 rounded-full blur-[120px]" />
      </div>

      {/* Floatable Draggable Timer HUD inside Quiz */}
      {currentScreen === AppScreen.QUIZ && timeLeft > 0 && isTimerRunning && (
        <div 
          style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
          className="fixed z-50 p-2 cursor-grab active:cursor-grabbing hover:scale-105 transition-transform"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="bg-surface border-2 border-primary rounded-2xl p-3 shadow-2xl flex items-center gap-2.5 outline-none font-headline font-extrabold text-xs uppercase italic tracking-widest text-primary neon-glow-primary">
            <Clock className="w-5 h-5 text-primary animate-pulse" />
            <span>Clock: {timeLeft}s</span>
          </div>
        </div>
      )}

      {/* Unified Global Header Controls */}
      <header className="border-b border-white/10 px-6 py-4 flex flex-wrap justify-between items-center bg-surface/50 backdrop-blur-md sticky top-0 z-40 gap-3">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-headline font-extrabold text-on-surface tracking-tighter italic">ScholarEarn</h1>
            <p className="text-[9px] uppercase tracking-widest text-primary/80 font-headline font-bold">2026 Academic Diagnostician</p>
          </div>
        </div>

        {/* Global HUD customisations on font scale and centered visual templates */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Display Font Size Controller */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
            <button 
              onClick={() => setFontSizeMode('normal')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-headline font-extrabold uppercase transition-all ${fontSizeMode === 'normal' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="Normal font scale"
            >
              Std Font
            </button>
            <button 
              onClick={() => setFontSizeMode('large')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-headline font-extrabold uppercase transition-all ${fontSizeMode === 'large' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="Large font size scaling for tablets"
            >
              Large
            </button>
            <button 
              onClick={() => setFontSizeMode('tv')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-headline font-extrabold uppercase transition-all ${fontSizeMode === 'tv' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="Mega font scaling for larger classroom TVs"
            >
              TV / Mega
            </button>
          </div>

          {/* Centering Layout Controller */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
            <button 
              onClick={() => setScreenViewMode('standard')}
              className={`p-1.5 rounded-lg transition-all ${screenViewMode === 'standard' ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'}`}
              title="Centered Focused Box layout"
            >
              <Laptop className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setScreenViewMode('presentation')}
              className={`p-1.5 rounded-lg transition-all ${screenViewMode === 'presentation' ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'}`}
              title="Full width classroom TV Presentation mode"
            >
              <Monitor className="w-4 h-4" />
            </button>
          </div>

          {/* Firebase Authentication HUD Button */}
          {authLoading ? (
            <RefreshCw className="w-5 h-5 text-on-surface-variant animate-spin" />
          ) : currentUser ? (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 p-1.5 rounded-xl text-xs">
              <span className="text-on-surface font-body font-bold hidden md:inline">{currentUser.displayName || currentUser.email}</span>
              <button 
                onClick={async () => {
                  await logout();
                  setCurrentScreen(AppScreen.ENTRY);
                }} 
                className="text-error/80 hover:text-error p-1 rounded-lg"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={loginWithGoogle}
              className="px-4 py-2 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-on-surface rounded-xl font-headline font-extrabold text-[10px] uppercase tracking-wider transition-colors"
            >
              Google Join
            </button>
          )}
        </div>
      </header>

      {/* Adaptive Screen Margins & Centered layouts based on configurations */}
      <main className={`flex-1 flex flex-col justify-start transition-all duration-300 ${
        screenViewMode === 'standard' 
          ? 'max-w-4xl mx-auto w-full px-4 md:px-6 pt-6' 
          : screenViewMode === 'presentation'
            ? 'max-w-7xl mx-auto w-full px-6 pt-4'
            : 'max-w-md mx-auto w-full px-4 pt-10'
      }`}>
        <AnimatePresence mode="wait">
          
          {/* PROFILE CONFIG / LAUNCHPAD SCREEN */}
          {currentScreen === AppScreen.ENTRY && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full space-y-6"
            >
              {/* Core centring wrapper with NO top margins */}
              <div className="bg-surface-container-lowest/80 glass-card p-6 md:p-10 rounded-[2.5rem] shadow-2xl border border-white/10 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-bl-[4rem] flex items-center justify-center border-l border-b border-white/5">
                  <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-2xl md:text-3xl font-headline font-extrabold text-on-surface tracking-tighter tv-text-shadow italic">Mastery Entrance</h2>
                  <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-headline font-bold">Configure client profiling models</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name field */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <User className="w-3 h-3" /> Student Name
                    </label>
                    <input 
                      type="text" 
                      value={user.name}
                      onChange={e => syncLocalUserProfile({ ...user, name: e.target.value })}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      placeholder="Enter student initials or full username"
                    />
                  </div>

                  {/* Syllabus board */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3" /> Curriculum Syllabus Board
                    </label>
                    <select
                      value={user.board}
                      onChange={e => syncLocalUserProfile({ ...user, board: e.target.value })}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                    >
                      <option value="CBSE">CBSE Board (Academic Year 2025-2026)</option>
                      <option value="ICSE">ICSE Board Standards</option>
                      <option value="IGCSE">International IGCSE Syllabus</option>
                      <option value="State Board">Indian State Board Curriculum</option>
                    </select>
                  </div>

                  {/* Grade dropdown */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <Trophy className="w-3 h-3" /> Class Grade Target
                    </label>
                    <select
                      value={user.gradeLevel}
                      onChange={e => syncLocalUserProfile({ ...user, gradeLevel: e.target.value })}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i+1} value={(i+1).toString()}>Grade {i+1} (National Standard)</option>
                      ))}
                    </select>
                  </div>

                  {/* Academic focus dropdown */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <Lightbulb className="w-3 h-3" /> Academic Learning Focus
                    </label>
                    <select
                      value={user.focus}
                      onChange={e => syncLocalUserProfile({ ...user, focus: e.target.value as StudyFocus })}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                    >
                      <option value={StudyFocus.SYLLABUS}>Core Chapter Syllabus Coverage</option>
                      <option value={StudyFocus.PATTERN}>Official Board Sample Blueprint Papers</option>
                      <option value={StudyFocus.TOPICS}>Ground Custom Sub-Topics</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Target subject */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <HelpCircle className="w-3 h-3" /> Target Subject
                    </label>
                    <input 
                      type="text" 
                      value={user.subject}
                      onChange={e => syncLocalUserProfile({ ...user, subject: e.target.value })}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      placeholder="Science, Mathematics, Tamil, etc."
                    />
                  </div>

                  {/* Dynamic subtopic */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" /> Diagnostics Topic Focus
                    </label>
                    <input 
                      type="text" 
                      value={user.topic}
                      onChange={e => syncLocalUserProfile({ ...user, topic: e.target.value })}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      placeholder="Type the focus topic"
                    />
                  </div>
                </div>

                {/* Grounding Materials Module triggers */}
                <div className="flex gap-3 justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5 text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-secondary" />
                    <div>
                      <p className="font-headline font-bold text-on-surface">Selective Grounding Context</p>
                      <p className="text-[10px] text-on-surface-variant mt-0.5">
                        {selectedMaterialId 
                          ? `Context set: ${materials.find(m => m.id === selectedMaterialId)?.title}` 
                          : "Curriculum mode active without override texts."}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsMaterialManagerOpen(true)}
                    className="px-4 py-2 rounded-xl text-[10px] uppercase font-headline font-extrabold tracking-wider bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all border border-secondary/20"
                  >
                    Manage Library
                  </button>
                </div>
              </div>

              {/* Launcher Hub Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Button 
                  onClick={initiateDiagnosis}
                  className="h-16 rounded-2xl text-[11px] font-headline font-extrabold uppercase tracking-widest hover:scale-[1.01] transition-transform shadow-2xl shadow-primary/30 flex items-center justify-center gap-2 neon-glow-primary col-span-2"
                >
                  <Rocket className="w-4 h-4" /> Start Adaptive Diagnostic
                </Button>
                <Button 
                  onClick={launchClassroomBattleSetup}
                  variant="secondary"
                  className="h-16 rounded-2xl text-[11px] font-headline font-extrabold uppercase tracking-widest flex items-center justify-center gap-2 overlay-dark col-span-1"
                >
                  <Users className="w-4 h-4" /> Classroom Battle
                </Button>
              </div>

              {/* Records and achievements quick panels */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <button 
                  onClick={() => setCurrentScreen(AppScreen.PROGRESS)}
                  className="bg-surface-container-lowest/40 border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-all"
                >
                  <Trophy className="w-5 h-5 text-tertiary mb-1" />
                  <span className="text-[9px] uppercase font-headline font-extrabold text-on-surface-variant">Level {user.level}</span>
                  <span className="text-[8px] font-black uppercase text-tertiary tracking-wider mt-0.5">Diagnosed Rank</span>
                </button>
                <div className="bg-surface-container-lowest/40 border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center">
                  <Award className="w-5 h-5 text-primary mb-1" />
                  <span className="text-[9px] uppercase font-headline font-extrabold text-on-surface-variant">{user.totalQuizzes}</span>
                  <span className="text-[8px] font-black uppercase text-primary tracking-wider mt-0.5">Diagnose Runs</span>
                </div>
                <div className="bg-surface-container-lowest/40 border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center">
                  <Sparkles className="w-5 h-5 text-secondary mb-1" />
                  <span className="text-[9px] uppercase font-headline font-extrabold text-on-surface-variant">{user.totalPoints} pts</span>
                  <span className="text-[8px] font-black uppercase text-secondary tracking-wider mt-0.5">Points Tallied</span>
                </div>
                <button 
                  onClick={() => setCurrentScreen(AppScreen.PROGRESS)}
                  className="bg-surface-container-lowest/40 border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-all"
                >
                  <FileText className="w-5 h-5 text-white mb-1" />
                  <span className="text-[9px] uppercase font-headline font-extrabold text-on-surface-variant">View logs</span>
                  <span className="text-[8px] font-black uppercase text-white tracking-wider mt-0.5">Diagnostic Records</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* CLASSROOM CONFIGURE WINDOWS */}
          {currentScreen === AppScreen.CLASSROOM_SETUP && (
            <motion.div key="classroom_config" className="w-full">
              <ClassroomSetupView 
                onStart={startClassroomSession}
                onCancel={handleResetToMenu}
              />
            </motion.div>
          )}

          {/* PROGRESS LOGGING HISTORIES */}
          {currentScreen === AppScreen.PROGRESS && (
            <motion.div key="user_progress" className="w-full">
              <ProgressScreen 
                user={user}
                onBack={handleResetToMenu}
              />
            </motion.div>
          )}

          {/* MULTI_CHANNEL LOADING SYNTHESISER */}
          {currentScreen === AppScreen.LOADING && (
            <motion.div 
              key="loading_diag"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full py-16 flex flex-col items-center justify-center text-center space-y-8"
            >
              <div className="relative">
                <div className="w-24 h-24 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <GraduationCap className="w-10 h-10 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-bounce" />
              </div>
              
              <div className="space-y-3 max-w-md mx-auto">
                <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tighter italic">{loadingMessage}</h3>
                <div className="w-full h-2.5 bg-surface-container-lowest rounded-full overflow-hidden">
                  <div 
                    style={{ width: `${loadingProgress}%` }}
                    className="h-full bg-primary transition-all duration-300 rounded-full neon-glow-primary"
                  />
                </div>
                <p className="text-[9px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant">Step: {loadingProgress}% Completed</p>
              </div>
            </motion.div>
          )}

          {/* ACTIVE ADAPTIVE QUIZ WORKSPACE */}
          {currentScreen === AppScreen.QUIZ && currentQuestions.length > 0 && (
            <motion.div 
              key="active_diagnose"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col gap-6"
            >
              {/* Core responsive font HUD based headers */}
              <div className="flex justify-between items-center gap-3 border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-sm font-headline font-extrabold text-primary uppercase tracking-widest italic flex items-center gap-1.5">
                    <Rocket className="w-4 h-4 text-primary" /> Active Diagnose
                  </h3>
                  <p className="text-[10px] text-on-surface-variant font-body font-bold uppercase mt-1">Topic focus: {user.topic}</p>
                </div>

                <div className="flex items-center gap-2">
                  {classroomSession && (
                    <div className="bg-secondary/10 border border-secondary/20 p-2.5 rounded-xl text-center flex items-center gap-2">
                      <span className="text-[10px] font-headline font-bold text-secondary uppercase italic">Team Turn:</span>
                      <span className="text-xs font-headline font-extrabold text-on-surface">{classroomSession.groups[classroomSession.currentGroupIndex].name}</span>
                    </div>
                  )}
                  <span className="text-xs font-headline font-extrabold text-on-surface bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                    Question {currentQuestionIndex + 1}/5
                  </span>
                </div>
              </div>

              {/* Dynamic Columns for Case study materials or diagram instructions */}
              <div className={`transition-all duration-300 w-full ${
                currentQuestions[currentQuestionIndex].contextMaterial 
                  ? 'lg:flex lg:gap-6 items-start' 
                  : 'flex flex-col items-center justify-start'
              }`}>
                {/* Visual context readouts (Left panel if present) */}
                {currentQuestions[currentQuestionIndex].contextMaterial && (
                  <div className={`transition-all duration-300 mb-5 lg:mb-0 w-full ${
                    fontSizeMode === 'normal' 
                      ? 'lg:w-[35%]' 
                      : fontSizeMode === 'large' 
                        ? 'lg:w-[42%]' 
                        : 'lg:w-[48%]'
                  }`}>
                    <div className="p-5 rounded-2xl bg-surface border border-white/10 h-fit space-y-3">
                      <div className="flex items-center gap-2 opacity-80 text-secondary">
                        <Eye className="w-4 h-4 text-secondary" />
                        <span className="text-[10px] font-headline font-extrabold uppercase tracking-widest italic">Reference Study Material</span>
                      </div>
                      <p className={`text-on-surface font-body font-bold leading-relaxed italic opacity-90 transition-all duration-300 ${
                        fontSizeMode === 'normal' 
                          ? 'text-xs md:text-sm max-h-[30vh] overflow-y-auto no-scrollbar' 
                          : fontSizeMode === 'large' 
                            ? 'text-sm md:text-base max-h-[40vh] overflow-y-auto no-scrollbar' 
                            : 'text-base md:text-lg max-h-[50vh] overflow-y-auto no-scrollbar'
                      }`}>
                        {currentQuestions[currentQuestionIndex].contextMaterial}
                      </p>
                    </div>
                  </div>
                )}

                {/* Question option mappings (Right Panel) */}
                <div className="space-y-4 flex flex-col w-full flex-1">
                  
                  {/* Real Question Textbox */}
                  <div className="bg-surface-container-lowest/80 glass-card p-5 md:p-7 rounded-2xl border border-white/10 relative overflow-hidden flex justify-between items-start gap-3">
                    <div className={`absolute left-0 top-0 h-full w-2 ${currentQuestions[currentQuestionIndex].type === QuestionType.WORD_PROBLEM ? 'bg-tertiary' : 'bg-primary'}`} />
                    <h2 className={`font-body font-black text-on-surface flex-1 leading-snug tv-text-shadow transition-all duration-300 ${
                      fontSizeMode === 'normal' 
                        ? 'text-sm md:text-base lg:text-lg' 
                        : fontSizeMode === 'large' 
                          ? 'text-base md:text-lg lg:text-xl' 
                          : 'text-lg md:text-xl lg:text-[1.6rem] leading-snug font-black'
                    }`}>
                      {currentQuestions[currentQuestionIndex].text}
                    </h2>

                    {/* Speech Speak Aloud Toggles */}
                    <button 
                      onClick={handleReadAloud}
                      type="button"
                      className={`p-2.5 rounded-xl border flex-none ${isReadingAloud ? 'bg-primary text-on-primary border-primary animate-pulse' : 'bg-surface text-primary border-primary/20 hover:bg-primary/10'} transition-all`}
                      title={isReadingAloud ? "Stop speech synthesizer" : "Low Pitch Indian Accent Speak Aloud"}
                    >
                      {isReadingAloud ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Options Matrix Selection List */}
                  <div className="grid grid-cols-1 gap-2.5">
                    {currentQuestions[currentQuestionIndex].options.map((opt, i) => {
                      let btnStyle = "bg-surface-container-lowest/60 border-white/5 text-on-surface hover:border-primary/50 hover:bg-primary/5";
                      if (feedback) {
                        if (i === currentQuestions[currentQuestionIndex].correctIndex) {
                          btnStyle = "bg-secondary/20 border-secondary text-on-surface ring-2 ring-secondary/20 neon-glow-secondary";
                        } else if (i === feedback.selected && !feedback.isCorrect) {
                          btnStyle = "bg-error/20 border-error text-on-surface ring-2 ring-error/20 neon-glow-error";
                        } else {
                          btnStyle = "opacity-30 grayscale pointer-events-none";
                        }
                      }

                      return (
                        <button
                          key={i}
                          disabled={!!feedback}
                          onClick={() => handleOptionClick(i)}
                          type="button"
                          className={`w-full text-left rounded-2xl border-2 transition-all flex items-center group shadow-md ${
                            fontSizeMode === 'normal' 
                              ? 'p-3 gap-3 min-h-[50px] text-xs md:text-sm' 
                              : fontSizeMode === 'large' 
                                ? 'p-4 gap-4 min-h-[60px] text-sm md:text-base' 
                                : 'p-5 gap-5 min-h-[75px] text-base md:text-[1.35rem]'
                          } ${btnStyle} active:scale-[0.98]`}
                        >
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-headline font-black transition-all ${
                            feedback && i === currentQuestions[currentQuestionIndex].correctIndex 
                              ? 'bg-secondary text-on-secondary shadow-md' 
                              : 'bg-surface-container text-outline group-hover:bg-primary/20 group-hover:text-primary'
                          }`}>
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="font-body font-bold text-on-surface">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Feedback description dialog */}
                  {feedback && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 bg-surface rounded-2xl border border-white/10 space-y-3 shadow-2xl mt-1.5"
                    >
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <p className="text-[10px] font-headline font-extrabold uppercase text-secondary tracking-widest italic">DIAGNOSTIC EXPLANATORY CORRELATION</p>
                      </div>
                      <p className={`font-body font-bold text-on-surface-variant leading-relaxed italic transition-all duration-300 ${
                        fontSizeMode === 'normal' ? 'text-xs md:text-sm' : fontSizeMode === 'large' ? 'text-sm md:text-base' : 'text-base md:text-[1.3rem]'
                      }`}>
                        {currentQuestions[currentQuestionIndex].explanation}
                      </p>

                      {currentQuestions[currentQuestionIndex].inquiryPrompt && (
                        <div className="mt-2.5 p-3.5 bg-primary/10 rounded-xl border border-primary/20 space-y-1">
                          <p className="text-[9px] font-headline font-extrabold uppercase text-primary tracking-wider flex items-center gap-1.5 italic">
                            <Sparkles className="w-3.5 h-3.5 text-primary" /> Future Diagnostic Exploration
                          </p>
                          <p className="text-xs font-body font-bold text-on-surface italic">
                            {currentQuestions[currentQuestionIndex].inquiryPrompt}
                          </p>
                        </div>
                      )}

                      <Button onClick={handleNextQuizQuestion} className="h-14 rounded-2xl text-[10px] font-headline font-extrabold uppercase tracking-widest shadow-2xl shadow-primary/30 neon-glow-primary">
                        Next Challenge
                      </Button>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* RESULTS CARD FOR SINGLE PARTICIPANTS */}
          {currentScreen === AppScreen.RESULTS && activeQuiz && (
            <motion.div 
              key="quiz_outcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full text-center space-y-6 py-6"
            >
              <div className="space-y-2">
                <div className="flex justify-center">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  >
                    <Rocket className="w-24 h-24 text-primary neon-glow-primary" />
                  </motion.div>
                </div>
                <h2 className="text-3xl md:text-5xl font-headline font-extrabold text-on-surface tracking-tighter tv-text-shadow italic">Diagnostic Concluded!</h2>
                <p className="text-[10px] uppercase font-headline font-bold text-primary tracking-[0.2em] italic">Grade {user.gradeLevel} Master Course Progress</p>
              </div>

              <div className="bg-surface-container-lowest/80 glass-card p-6 md:p-10 rounded-[3rem] shadow-2xl border border-white/10 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-primary/10 border border-primary/25 rounded-2xl p-4 md:p-6 text-center">
                    <p className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-primary italic">Correct Evaluations</p>
                    <p className="text-3xl md:text-5xl font-headline font-extrabold text-on-surface mt-1">{activeQuiz.score}<span className="text-xs md:text-lg text-primary/50">/5</span></p>
                  </div>
                  <div className="bg-tertiary/10 border border-tertiary/25 rounded-2xl p-4 md:p-6 text-center">
                    <p className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-tertiary italic">Diagnose Accrual</p>
                    <p className="text-3xl md:text-5xl font-headline font-extrabold text-on-surface mt-1">+{activeQuiz.score * 10} pts</p>
                  </div>
                </div>

                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1.5 text-xs">
                  <p className="font-headline font-extrabold text-on-surface uppercase tracking-wider">Expert Evaluator Recommendation</p>
                  <p className="font-body font-bold text-on-surface-variant leading-relaxed">
                    {activeQuiz.score === 5 
                      ? "Flawless score! Your conceptual foundation is rock-solid. You are authorized to step up layout progressive level challenges." 
                      : activeQuiz.score >= 3 
                        ? "Competent coverage! Focus on explanations mapped in wrong choices to reinforce board diagnostics." 
                        : "Requires review. Ingest related source textbook readings inside the Library to ground future diagnostics."}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={initiateDiagnosis} className="h-14 rounded-2xl font-headline font-extrabold uppercase tracking-widest text-xs shadow-2xl shadow-primary/40 col-span-2">
                  Retake Diagnosis
                </Button>
                <Button onClick={handleResetToMenu} variant="outline" className="h-14 rounded-2xl font-headline font-extrabold uppercase tracking-widest text-[10px]">
                  Close Panel
                </Button>
              </div>
            </motion.div>
          )}

          {/* LEADERBOARDS PODIUM FOR CLASSROOM BATTLES */}
          {currentScreen === AppScreen.LEADERBOARD && classroomSession && (
            <motion.div 
              key="multi_ladder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full text-center space-y-6 py-6"
            >
              <div className="space-y-1.5">
                <Trophy className="w-16 h-16 text-tertiary mx-auto neon-glow-tertiary animate-bounce" />
                <h2 className="text-2xl md:text-4xl font-headline font-extrabold text-on-surface tracking-tighter italic tv-text-shadow">Battle Grid Overlord</h2>
                <p className="text-[10px] font-headline font-extrabold tracking-widest uppercase text-secondary">Classroom multiplayer arena standings</p>
              </div>

              <div className="bg-surface-container-lowest/80 glass-card p-6 md:p-10 rounded-[2.5rem] shadow-2xl border border-white/10 space-y-6">
                <div className="space-y-3">
                  {classroomSession.groups
                    .slice()
                    .sort((a,b) => b.score - a.score)
                    .map((group, i) => (
                      <div 
                        key={group.id} 
                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                          i === 0 
                            ? 'bg-tertiary/15 border-tertiary/50 text-on-surface ring-2 ring-tertiary/20' 
                            : i === 1 
                              ? 'bg-secondary/15 border-secondary/30 text-on-surface' 
                              : 'bg-white/5 border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-headline font-black ${
                            i === 0 ? 'bg-tertiary text-on-tertiary' : i === 1 ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-outline'
                          }`}>
                            {i + 1}
                          </span>
                          <span className="text-sm font-headline font-extrabold uppercase italic tracking-wide">{group.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-headline font-extrabold">{group.score}/5</p>
                          <p className="text-[8px] uppercase tracking-wide text-on-surface-variant font-bold">Tallied Solutions</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={() => startClassroomSession(classroomSession.groups, classroomSession.questionTimer || 45)}
                  className="h-14 rounded-2xl font-headline font-extrabold text-xs uppercase tracking-widest hover:scale-[1.01] transition-transform shadow-2xl shadow-primary/30 col-span-2"
                >
                  Relaunch Arena
                </Button>
                <Button onClick={handleResetToMenu} variant="outline" className="h-14 rounded-2xl font-headline font-extrabold text-[10px] uppercase tracking-widest">
                  Main Entrance
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Floatable study resource hub dialog popups */}
      <AnimatePresence>
        {isMaterialManagerOpen && (
          <MaterialManager 
            isOpen={isMaterialManagerOpen}
            onClose={() => setIsMaterialManagerOpen(false)}
            materials={materials}
            onAdd={handleAddNewMaterial}
            onDelete={handleDeleteMaterial}
            onSelect={setSelectedMaterialId}
            selectedId={selectedMaterialId}
          />
        )}
      </AnimatePresence>

      {/* Nice success sound effect notification popup overlay */}
      <MotivationalPopup 
        show={showMotivationalPopup}
        label={motivationText}
        onClose={() => setShowMotivationalPopup(false)}
      />
    </div>
  );
}
