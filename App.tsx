import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, GraduationCap, School, Rocket, Shield, Trophy, X, Plus, 
  Upload, ArrowLeft, LogIn, LogOut, Star, Key, Mail, Copy, 
  BookOpen, Eye, Calculator, CheckCircle2, AlertCircle, 
  ChevronRight, Download, Search, User as UserIcon, Settings, History,
  LayoutDashboard, Home, SignalLow, SignalMedium, SignalHigh, Signal, Share2
} from 'lucide-react';
import { UserProfile, QuizSession, AppScreen, StudyFocus, QuestionType, Group, ClassroomSession, DifficultyLevel, TestRecord } from './types';
import { generateQuizQuestions, generateSpeech, playAudio } from './services/geminiService';
import { Button } from './components/Button';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const MotivationalPopup = ({ show, label = "Spectacular!" }: { show: boolean, label?: string }) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 3 }}
          exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
          <div className="bg-surface-container-lowest/80 glass-card p-8 rounded-[2.5rem] shadow-2xl border border-white/40 flex flex-col items-center transform">
            <motion.div 
              animate={{ y: [0, -20, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="mb-4"
            >
              <Sparkles className="w-16 h-16 text-tertiary filter drop-shadow-md" />
            </motion.div>
            <h3 className="text-2xl font-headline font-extrabold text-primary uppercase tracking-tighter italic">{label}</h3>
            <p className="text-xs font-body font-body font-bold text-on-surface-variant uppercase tracking-widest mt-1">Level Up Your Mind!</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const ClassroomSetupView = ({ onStart, onCancel }: { onStart: (groups: Group[], timer: number) => void, onCancel: () => void }) => {
  const [groups, setGroups] = useState<Group[]>([
    { id: '1', name: 'Alpha Squad', score: 0, members: [] },
    { id: '2', name: 'Beta Brains', score: 0, members: [] },
    { id: '3', name: 'Gamma Giants', score: 0, members: [] },
    { id: '4', name: 'Delta Dynamos', score: 0, members: [] },
  ]);
  const [timer, setTimer] = useState<number>(45);

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
      // Split by lines or commas
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
    <div className="p-6 space-y-6 animate-fade-in pb-10 max-w-4xl mx-auto">
      <div className="bg-surface-container-lowest/80 glass-card p-8 md:p-12 rounded-[3rem] shadow-2xl border border-white/10 space-y-8">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl md:text-5xl font-headline font-extrabold text-on-surface tracking-tighter italic tv-text-shadow">Battle Setup</h2>
          <Button onClick={onCancel} variant="outline" className="rounded-full w-12 h-12 flex items-center justify-center border-white/10">
            <X className="w-6 h-6" />
          </Button>
        </div>

        <div className="flex justify-between items-center">
          <h3 className="text-sm md:text-lg font-headline font-extrabold text-on-surface-variant uppercase tracking-widest italic">Group Configuration</h3>
          <div className="flex gap-3">
             <input 
               type="file" 
               ref={fileInputRef} 
               onChange={handleFileUpload} 
               accept=".txt,.csv" 
               className="hidden" 
             />
             <button 
               onClick={() => fileInputRef.current?.click()}
               className="text-[10px] md:text-xs font-headline font-extrabold text-primary bg-primary/10 px-4 py-2 rounded-xl hover:bg-primary/20 transition-colors uppercase neon-glow-primary"
             >
               Upload Accessions
             </button>
             <span className="text-xs md:text-sm font-headline font-extrabold text-on-surface bg-surface-container px-4 py-2 rounded-xl">{groups.length}/5</span>
          </div>
        </div>

        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.id} className="flex gap-3 items-center">
              <div className="flex-1 space-y-3">
                <input 
                  type="text" 
                  value={group.name} 
                  onChange={e => updateGroupName(group.id, e.target.value)} 
                  className="input-field w-full px-6 py-4 rounded-2xl bg-surface text-base font-body font-bold" 
                  placeholder={`Group ${group.id} Name`}
                />
                <div className="flex gap-1">
                  {Object.values(DifficultyLevel).filter(l => l !== DifficultyLevel.DEFAULT).map(level => (
                    <button
                      key={level}
                      onClick={() => updateGroupDifficulty(group.id, level)}
                      className={`flex-1 py-1.5 rounded-lg text-[8px] font-headline font-extrabold uppercase border transition-all flex items-center justify-center gap-1 ${
                        (group.difficulty || DifficultyLevel.LOW) === level 
                          ? 'bg-primary text-on-primary border-primary' 
                          : 'bg-surface-container-lowest text-outline border-outline-variant/10 hover:border-primary-container'
                      }`}
                    >
                      {level === DifficultyLevel.LOW && <SignalLow className="w-3 h-3" />}
                      {level === DifficultyLevel.MEDIUM && <SignalMedium className="w-3 h-3" />}
                      {level === DifficultyLevel.HIGH && <SignalHigh className="w-3 h-3" />}
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => removeGroup(group.id)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-error-container/30 text-error hover:bg-error-container transition-colors self-start mt-1"
                disabled={groups.length <= 2}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="pt-6 border-t border-white/5 space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-xs md:text-sm font-headline font-extrabold text-on-surface-variant uppercase tracking-widest italic">Question Timer</label>
            <select 
              value={timer} 
              onChange={(e) => setTimer(Number(e.target.value))}
              className="bg-surface-container border border-white/5 rounded-xl px-4 py-2 text-sm font-body font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value={30}>30 Seconds</option>
              <option value={45}>45 Seconds (Default)</option>
              <option value={50}>50 Seconds</option>
              <option value={60}>1 Minute</option>
              <option value={120}>2 Minutes</option>
            </select>
          </div>
        </div>

        {groups.length < 5 && (
          <button 
            onClick={addGroup}
            className="w-full py-4 rounded-2xl border-2 border-dashed border-white/10 text-on-surface-variant text-xs font-headline font-extrabold uppercase hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-3 bg-white/5"
          >
            <Plus className="w-5 h-5" /> Add Group
          </button>
        )}
      </div>

      <div className="grid gap-4">
        <Button onClick={() => onStart(groups, timer)} className="h-20 rounded-[2.5rem] font-headline font-extrabold uppercase tracking-[0.2em] text-sm shadow-2xl shadow-primary/40 flex-1 neon-glow-primary">
          Start Classroom Battle
        </Button>
        <Button onClick={onCancel} variant="outline" className="h-16 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-[11px] border-white/10 bg-surface-container-lowest/10">
          Cancel
        </Button>
      </div>
    </div>
  );
};

const ProgressScreen: React.FC<{ user: UserProfile, onBack: () => void }> = ({ user, onBack }) => {
  const history = user.testHistory || [];
  
  return (
    <div className="p-6 space-y-6 animate-fade-in pb-10 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tighter">My Progress</h2>
        <Button onClick={onBack} variant="outline" className="h-8 px-4 w-auto text-[10px] font-headline font-extrabold uppercase tracking-widest">Back</Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-primary p-5 rounded-[2rem] text-on-primary shadow-lg shadow-primary/20">
          <p className="text-[10px] font-headline font-extrabold uppercase tracking-widest opacity-70">Total Points</p>
          <p className="text-2xl font-headline font-extrabold tracking-tighter">{user.totalPoints?.toLocaleString() || 0}</p>
        </div>
        <div className="bg-secondary p-5 rounded-[2rem] text-on-secondary shadow-lg shadow-secondary/20">
          <p className="text-[10px] font-headline font-extrabold uppercase tracking-widest opacity-70">Current Level</p>
          <p className="text-2xl font-headline font-extrabold tracking-tighter">{user.level}</p>
        </div>
      </div>

      <div className="bg-surface-container-lowest/80 glass-card p-6 rounded-[2.5rem] border border-white/40 shadow-lg shadow-black/5 flex-1 overflow-y-auto no-scrollbar">
        <h3 className="text-sm font-headline font-extrabold text-outline uppercase tracking-widest mb-4 flex items-center gap-2">
          <History className="w-4 h-4" /> Test History
        </h3>
        
        {history.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mx-auto">
              <History className="w-8 h-8 text-outline-variant/50" />
            </div>
            <p className="text-xs font-body font-bold text-outline">No tests taken yet. Start learning!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((record, i) => (
              <div key={i} className="p-4 bg-surface rounded-[2rem] border border-outline-variant/10 flex justify-between items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-headline font-extrabold tracking-widest ${
                      record.type === 'classroom' ? 'bg-primary-container/40 text-primary' : 'bg-secondary-container text-secondary'
                    }`}>
                      {record.type}
                    </span>
                    <span className="text-[9px] font-body font-bold text-outline">
                      {new Date(record.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[13px] font-headline font-extrabold text-on-surface leading-tight">{record.topic}</p>
                  <p className="text-[9px] font-body font-bold text-outline uppercase tracking-wider">
                    {record.subject} {record.grade ? `• Grade ${record.grade}` : ''} {record.section ? `• Sec ${record.section}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-headline font-extrabold text-on-surface tracking-tighter">{record.score}/{record.total}</div>
                  <div className="text-[9px] font-headline font-extrabold text-primary bg-primary-container/20 px-1.5 py-0.5 rounded">
                    {Math.round((record.score / record.total) * 100)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const AdminDashboard = ({ onBack }: { onBack: () => void }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsers(usersData);
      } catch (err) {
        console.error("Error fetching users:", err);
        setError("Failed to load users. Ensure you have admin privileges.");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  return (
    <div className="p-6 space-y-6 animate-fade-in pb-10 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tighter">Admin Dashboard</h2>
        <Button onClick={onBack} variant="outline" className="h-8 px-4 rounded-xl font-headline font-extrabold uppercase tracking-widest text-[10px] border-outline-variant/20 bg-surface-container-lowest">
          Back
        </Button>
      </div>

      <div className="bg-surface-container-lowest/80 glass-card p-6 rounded-[2.5rem] border border-white/40 shadow-lg shadow-black/5 flex-1 overflow-y-auto">
        <h3 className="text-sm font-headline font-extrabold text-outline uppercase tracking-widest mb-4 flex items-center gap-2">
          <UserIcon className="w-4 h-4" /> Registered Users ({users.length})
        </h3>
        
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="text-error text-xs font-body font-bold text-center py-10 bg-error-container/30 rounded-xl">{error}</div>
        ) : users.length === 0 ? (
          <div className="text-outline text-xs font-body font-bold text-center py-10">No users found.</div>
        ) : (
          <div className="space-y-3">
            {users.map(u => (
              <div key={u.id} className="p-4 bg-surface rounded-[2rem] border border-outline-variant/10 flex justify-between items-center">
                <div>
                  <div className="font-headline font-extrabold text-on-surface text-sm flex items-center gap-2">
                    {u.name || 'Anonymous'}
                    {u.role === 'admin' && <span className="text-[8px] bg-tertiary-container text-on-tertiary-container px-1.5 py-0.5 rounded uppercase tracking-widest">Admin</span>}
                  </div>
                  <div className="text-[10px] font-body font-bold text-outline mt-1">
                    Grade {u.gradeLevel} • Level {u.level} • {u.totalPoints || 0} pts
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-headline font-extrabold text-primary uppercase tracking-widest">Quizzes: {u.totalQuizzes || 0}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(() => localStorage.getItem('se_session_email'));
  const [emailInput, setEmailInput] = useState('');
  const [totalPoints, setTotalPoints] = useState<number>(() => Number(localStorage.getItem('se_pts') || 0));
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.LANDING);
  
  // Progress Map: key = "Subject-Grade", value = Level
  const [progressMap, setProgressMap] = useState<Record<string, number>>(() => {
    return JSON.parse(localStorage.getItem('se_progress') || '{}');
  });

  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('se_user');
    return saved ? JSON.parse(saved) : {
      name: '', gradeLevel: '10', section: '', subject: '', board: 'CBSE', focus: StudyFocus.SYLLABUS, topic: '',
      level: 1, totalQuizzes: 0, totalPoints: 0, testHistory: []
    };
  });

  const [error, setError] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ selected: number; isCorrect: boolean } | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Initializing...");
  const [showMotivation, setShowMotivation] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const [isClassroomMode, setIsClassroomMode] = useState(false);
  const [isChallengeMode, setIsChallengeMode] = useState(false);
  const [questionTimer, setQuestionTimer] = useState<number>(45);
  const [timeLeft, setTimeLeft] = useState<number>(45);
  const [copied, setCopied] = useState(false);
  const [classroomSession, setClassroomSession] = useState<ClassroomSession | null>(null);
  const [groupQuizzes, setGroupQuizzes] = useState<Record<string, QuizSession>>({});
  const [hasApiKey, setHasApiKey] = useState<boolean>(() => {
    return !!process.env.GEMINI_API_KEY || !!process.env.API_KEY;
  });
  const [hasGroqKey, setHasGroqKey] = useState<boolean>(() => {
    return !!process.env.GROQ_API_KEY;
  });
  const [pendingAction, setPendingAction] = useState<{ type: 'batch' | 'classroom', data?: any } | null>(null);
  const badgeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [challengeData, setChallengeData] = useState<{ topic: string, grade: string, seed: string, challenger: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topic = params.get('topic');
    const grade = params.get('grade');
    const seed = params.get('seed');
    const challenger = params.get('challenger');
    
    if (topic && grade && seed) {
      setChallengeData({ 
        topic: decodeURIComponent(topic), 
        grade: decodeURIComponent(grade), 
        seed: decodeURIComponent(seed), 
        challenger: decodeURIComponent(challenger || 'A Friend') 
      });
    }
  }, []);

  const loadProfile = async (identifier: string, isEmail: boolean = false) => {
    console.log(`Loading profile for ${identifier} (isEmail: ${isEmail})`);
    setIsSyncing(true);
    try {
      const docRef = doc(db, 'users', identifier);
      const docSnap = await getDoc(docRef);
      console.log(`Profile doc exists: ${docSnap.exists()}`);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUser({
          name: data.name || (isEmail ? identifier.split('@')[0] : 'Scholar'),
          gradeLevel: data.gradeLevel || '10',
          section: data.section || '',
          subject: data.subject || '',
          focus: data.focus || StudyFocus.SYLLABUS,
          topic: data.topic || '',
          level: data.level || 1,
          totalQuizzes: data.totalQuizzes || 0,
          totalPoints: data.totalPoints || 0,
          testHistory: data.testHistory || [],
          role: data.role || (identifier === 'alsamy36@gmail.com' ? 'admin' : 'user')
        });
        setTotalPoints(data.totalPoints || 0);
        if (data.progressMap) {
          setProgressMap(data.progressMap);
        }
      } else {
        // Create new user profile
        console.log(`Creating new profile for ${identifier}`);
        const newUser: UserProfile = {
          name: isEmail ? identifier.split('@')[0] : 'Scholar',
          gradeLevel: '10',
          subject: '',
          focus: StudyFocus.SYLLABUS,
          topic: '',
          level: 1,
          totalQuizzes: 0,
          totalPoints: 0,
          progressMap: {},
          testHistory: [],
          role: (identifier === 'alsamy36@gmail.com' ? 'admin' : 'user') as 'admin' | 'user'
        };
        await setDoc(docRef, { ...newUser, uid: identifier });
        setUser(newUser);
      }
      console.log(`Profile loaded successfully, switching to ENTRY screen`);
      setCurrentScreen(AppScreen.ENTRY);
      setLastSyncTime(new Date());
    } catch (err: any) {
      console.error("Profile load error:", err);
      setError(`Profile error: ${err.message || "Could not load or create profile."}`);
      setCurrentScreen(AppScreen.SIGN_IN);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const testConnection = async () => {
      try {
        const { getDocFromServer } = await import('firebase/firestore');
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firestore connection error: The client is offline. Please check your network and Firebase configuration.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log(`Auth state changed: ${currentUser?.uid || 'null'}`);
      setAuthUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        setError(null); // Clear errors on successful auth
        await loadProfile(currentUser.uid);
      } else if (sessionEmail) {
        setError(null); // Clear errors on successful session
        await loadProfile(sessionEmail, true);
      } else {
        setCurrentScreen(AppScreen.SIGN_IN);
      }
    });
    return () => unsubscribe();
  }, [sessionEmail]);

  const handleEmailLogin = async () => {
    if (!emailInput || !emailInput.includes('@')) {
      setError("Please enter a valid email.");
      return;
    }
    setError(null); // Clear previous errors
    const cleanEmail = emailInput.toLowerCase().trim();
    setLoadingMsg("Logging in...");
    setCurrentScreen(AppScreen.LOADING);
    
    try {
      setSessionEmail(cleanEmail);
      localStorage.setItem('se_session_email', cleanEmail);
      await loadProfile(cleanEmail, true);
    } catch (err: any) {
      setError(`Login failed: ${err.message}`);
      setCurrentScreen(AppScreen.SIGN_IN);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setSessionEmail(null);
      localStorage.removeItem('se_session_email');
      setCurrentScreen(AppScreen.SIGN_IN);
    } catch (err: any) {
      console.error("Logout error:", err);
    }
  };

  const saveProgressToCloud = async (newPoints: number, newMap: Record<string, number>, newLevel: number, newHistory?: TestRecord[]) => {
    const identifier = authUser?.uid || sessionEmail;
    if (!identifier) return;
    setIsSyncing(true);
    try {
      const docRef = doc(db, 'users', identifier);
      await updateDoc(docRef, {
        totalPoints: newPoints,
        progressMap: newMap,
        level: newLevel,
        testHistory: newHistory || user.testHistory || [],
        subject: user.subject,
        gradeLevel: user.gradeLevel,
        section: user.section || '',
        topic: user.topic,
        board: user.board || 'CBSE'
      });
      setLastSyncTime(new Date());
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${identifier}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const checkKey = async () => {
      // If environment key is present, we are good to go
      if (!!process.env.GEMINI_API_KEY || !!process.env.API_KEY) {
        setHasApiKey(true);
      } else if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }

      if (!!process.env.GROQ_API_KEY) {
        setHasGroqKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
      if (pendingAction) {
        if (pendingAction.type === 'batch') {
          startBatch(pendingAction.data);
        } else if (pendingAction.type === 'classroom') {
          startClassroomSession(pendingAction.data.groups, pendingAction.data.timer);
        }
        setPendingAction(null);
      }
    }
  };

  useEffect(() => {
    localStorage.setItem('se_pts', totalPoints.toString());
    localStorage.setItem('se_user', JSON.stringify(user));
    
    // Auto-save profile changes to cloud if logged in
    const identifier = authUser?.uid || sessionEmail;
    if (identifier && isAuthReady) {
      const saveProfile = async () => {
        setIsSyncing(true);
        try {
          const docRef = doc(db, 'users', identifier);
          await updateDoc(docRef, {
            name: user.name,
            gradeLevel: user.gradeLevel,
            subject: user.subject,
            topic: user.topic,
            focus: user.focus,
            level: user.level,
            totalPoints: totalPoints,
            progressMap: progressMap,
            testHistory: user.testHistory || [],
            board: user.board || 'CBSE'
          });
          setLastSyncTime(new Date());
        } catch (err) {
          // Silent fail for auto-save to avoid annoying errors during typing
          console.warn("Auto-save profile error:", err);
        } finally {
          setIsSyncing(false);
        }
      };
      
      const timeoutId = setTimeout(saveProfile, 2000); // Debounce 2s
      return () => clearTimeout(timeoutId);
    }
  }, [totalPoints, user, progressMap, authUser, sessionEmail, isAuthReady]);

  // Determine key for progress tracking
  const getProgressKey = () => `${user.subject.trim().toLowerCase()}-${user.gradeLevel}`;

  // Update level when subject changes
  useEffect(() => {
    if (user.subject && user.gradeLevel) {
      const key = getProgressKey();
      const savedLevel = progressMap[key] || 1;
      setUser(prev => ({ ...prev, level: savedLevel }));
    }
  }, [user.subject, user.gradeLevel]);

  const startBatch = async (mockMode: boolean = false, seedOverride?: string) => {
    if (!user.name || !user.subject) {
      setError("Name and Subject are required.");
      return;
    }

    if (!hasApiKey && !hasGroqKey) {
      setPendingAction({ type: 'batch', data: mockMode });
      setCurrentScreen(AppScreen.API_KEY_REQUIRED);
      return;
    }

    setError(null);
    setIsMockMode(mockMode);
    setCurrentScreen(AppScreen.LOADING);
    
    const levelText = mockMode ? "Mock Exam" : `Level ${user.level}`;
    setLoadingMsg(`Creating ${levelText} Batch for ${user.subject}...`);
    
    try {
      const questions = await generateQuizQuestions(user, mockMode, undefined, undefined, undefined, 0, seedOverride);
      setActiveQuiz({ profile: user, questions, userAnswers: [], score: 0, questionTimer });
      setCurrentIndex(0);
      setTimeLeft(questionTimer);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err: any) {
      console.error("Batch Generation Error:", err);
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("Your API key session has expired or is invalid. Please re-select your key.");
      } else if (err.message?.includes("429") || err.message?.includes("quota")) {
        setError("API Rate Limit reached. Please wait a minute and try again. We are providing this free for all students!");
      } else {
        setError(`Unable to generate batch: ${err.message || "Please try again."}`);
      }
      setCurrentScreen(AppScreen.ENTRY);
    }
  };

  const shareChallenge = () => {
    const seed = Math.random().toString(36).substring(7);
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('topic', user.topic);
    url.searchParams.set('grade', user.gradeLevel);
    url.searchParams.set('seed', seed);
    url.searchParams.set('challenger', user.name || 'A Friend');
    
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startClassroomSetup = () => {
    if (!user.subject || !user.topic) {
      setError("Subject and Specific Topic are required for Classroom Mode.");
      return;
    }
    setError(null);
    setCurrentScreen(AppScreen.CLASSROOM_SETUP);
  };

  const startClassroomSession = async (groups: Group[], timer: number) => {
    if (!hasApiKey && !hasGroqKey) {
      setPendingAction({ type: 'classroom', data: { groups, timer } });
      setCurrentScreen(AppScreen.API_KEY_REQUIRED);
      return;
    }

    setCurrentScreen(AppScreen.LOADING);
    setLoadingMsg(`Initializing Classroom Session for ${user.subject}...`);

    try {
      const session: ClassroomSession = {
        id: Date.now().toString(),
        groups: groups,
        currentGroupIndex: 0,
        subject: user.subject,
        gradeLevel: user.gradeLevel,
        section: user.section || '',
        topic: user.topic,
        isStarted: true,
        questionTimer: timer
      };

      // Generate questions for the first group immediately
      const questions = await generateQuizQuestions(user, false, groups[0].name, user.topic, groups[0].difficulty);
      const quiz: QuizSession = { profile: user, questions, userAnswers: [], score: 0, questionTimer: timer };
      
      setGroupQuizzes({ [groups[0].id]: quiz });
      setActiveQuiz(quiz);
      setClassroomSession(session);
      setCurrentIndex(0);
      setTimeLeft(timer);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err: any) {
      console.error("Classroom Start Error:", err);
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("Your API key session has expired or is invalid. Please re-select your key.");
      } else if (err.message?.includes("429") || err.message?.includes("quota")) {
        setError("API Rate Limit reached. Please wait a minute and try again.");
      } else {
        setError(`Failed to start classroom session: ${err.message || "Unknown Error"}`);
      }
      setCurrentScreen(AppScreen.ENTRY);
    }
  };

  const nextGroup = async () => {
    if (!classroomSession) return;
    
    const nextIdx = classroomSession.currentGroupIndex + 1;
    if (nextIdx >= classroomSession.groups.length) {
      setCurrentScreen(AppScreen.LEADERBOARD);
      return;
    }

    setCurrentScreen(AppScreen.LOADING);
    setLoadingMsg(`Preparing Batch for ${classroomSession.groups[nextIdx].name}...`);

    try {
      const questions = await generateQuizQuestions(user, false, classroomSession.groups[nextIdx].name, user.topic, classroomSession.groups[nextIdx].difficulty);
      const quiz: QuizSession = { profile: user, questions, userAnswers: [], score: 0, questionTimer: classroomSession.questionTimer };
      
      setGroupQuizzes(prev => ({ ...prev, [classroomSession.groups[nextIdx].id]: quiz }));
      setActiveQuiz(quiz);
      setClassroomSession({ ...classroomSession, currentGroupIndex: nextIdx });
      setCurrentIndex(0);
      setTimeLeft(classroomSession.questionTimer || 45);
      setFeedback(null);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err: any) {
      console.error("Next Group Error:", err);
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("Your API key session has expired or is invalid. Please re-select your key.");
      } else if (err.message?.includes("429") || err.message?.includes("quota")) {
        setError("API Rate Limit reached. Please wait a minute and try again.");
      } else {
        setError("Failed to load next group batch.");
      }
      setCurrentScreen(AppScreen.LEADERBOARD);
    }
  };

  const handleMCQ = (idx: number) => {
    if (feedback) return;
    const isCorrect = idx === activeQuiz?.questions[currentIndex].correctIndex;
    setFeedback({ selected: idx, isCorrect });
    
    if (activeQuiz) {
      activeQuiz.userAnswers[currentIndex] = idx;
      if (isCorrect) {
        activeQuiz.score++;
        setShowMotivation(true);
        setTimeout(() => setShowMotivation(false), 2000);
        setTimeout(nextQuestion, 1500);
      } else {
         // Play audio on wrong answer (volume feature)
         generateSpeech(activeQuiz?.questions[currentIndex].explanation || "").then(playAudio);
      }
    }
  };

  const nextQuestion = () => {
    setFeedback(null);
    setShowMotivation(false);
    if (activeQuiz && currentIndex < activeQuiz.questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setTimeLeft(activeQuiz.questionTimer || 45);
    } else if (activeQuiz) {
      finishBatch();
    }
  };

  // Timer Effect
  useEffect(() => {
    let timer: any;
    if (currentScreen === AppScreen.QUIZ && !feedback && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && currentScreen === AppScreen.QUIZ && !feedback) {
      // Time's up!
      handleMCQ(-1); // Mark as incorrect
    }
    return () => clearInterval(timer);
  }, [currentScreen, feedback, timeLeft]);

  const finishBatch = () => {
    if (!activeQuiz) return;
    
    const newRecord: TestRecord = {
      topic: user.topic || 'General Quiz',
      score: activeQuiz.score,
      total: activeQuiz.questions.length,
      date: new Date().toISOString(),
      type: isClassroomMode ? 'classroom' : 'individual',
      subject: user.subject,
      grade: user.gradeLevel,
      section: user.section
    };

    const newHistory = [newRecord, ...(user.testHistory || [])].slice(0, 50); // Keep last 50

    if (isClassroomMode && classroomSession) {
      const currentGroup = classroomSession.groups[classroomSession.currentGroupIndex];
      currentGroup.score += activeQuiz.score;
      
      if (authUser || sessionEmail) {
        saveProgressToCloud(totalPoints, progressMap, user.level, newHistory);
      }
      setUser(prev => ({ ...prev, testHistory: newHistory }));
      
      setCurrentScreen(AppScreen.RESULTS);
      return;
    }

    const newPoints = totalPoints + (activeQuiz.score * 100);
    setTotalPoints(newPoints);
    
    // Level Up Logic if not in Mock Mode and score is decent
    let newLevel = user.level;
    let newProgressMap = { ...progressMap };
    
    if (!isMockMode && activeQuiz.score >= 3) {
      newLevel = user.level + 1;
      const key = getProgressKey();
      newProgressMap = { ...progressMap, [key]: newLevel };
      setProgressMap(newProgressMap);
    }
    
    setUser(prev => ({ ...prev, level: newLevel, testHistory: newHistory }));

    if (authUser || sessionEmail) {
      saveProgressToCloud(newPoints, newProgressMap, newLevel, newHistory);
    }
    
    setCurrentScreen(AppScreen.RESULTS);
  };

  const downloadBadge = () => {
    if (!badgeCanvasRef.current || !activeQuiz) return;
    const canvas = badgeCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Badge Drawing
    ctx.fillStyle = '#4F46E5';
    ctx.fillRect(0, 0, 400, 400);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 15;
    ctx.strokeRect(10, 10, 380, 380);

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Inter';
    ctx.fillText(isMockMode ? 'MOCK EXAM RESULT' : `LEVEL ${user.level} PASSED`, 200, 80);
    
    ctx.font = '20px Inter';
    ctx.fillText('ScholarEarn Academic Excellence', 200, 130);
    
    ctx.font = 'bold 32px Inter';
    ctx.fillText(activeQuiz.profile.name, 200, 180);
    
    ctx.font = '18px Inter';
    ctx.fillText(`${activeQuiz.profile.subject}`, 200, 230);
    
    ctx.font = 'bold 48px Inter';
    ctx.fillStyle = '#F59E0B';
    ctx.fillText(`${activeQuiz.score}/5`, 200, 310);

    const link = document.createElement('a');
    link.download = `ScholarEarn_${user.subject}_Level${user.level}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const currentQ = activeQuiz?.questions[currentIndex];
  const isBoardGrade = user.gradeLevel === '10' || user.gradeLevel === '12';

  // Render Logic for different question types
  const renderQuestionLabel = (type: QuestionType) => {
      switch(type) {
          case QuestionType.CASE_STUDY: return <span className="text-[9px] font-headline font-extrabold px-2 py-1 bg-primary-container text-primary rounded uppercase tracking-tighter flex items-center gap-1"><BookOpen className="w-3 h-3" /> Case Study</span>;
          case QuestionType.VISUAL_ANALYSIS: return <span className="text-[9px] font-headline font-extrabold px-2 py-1 bg-secondary-container text-secondary rounded uppercase tracking-tighter flex items-center gap-1"><Eye className="w-3 h-3" /> Visual Analysis</span>;
          case QuestionType.WORD_PROBLEM: return <span className="text-[9px] font-headline font-extrabold px-2 py-1 bg-tertiary-container text-on-tertiary-container rounded uppercase tracking-tighter flex items-center gap-1"><Calculator className="w-3 h-3" /> Word Problem</span>;
          default: return null;
      }
  };

  return (
    <div className="h-screen bg-surface flex font-sans overflow-hidden selection:bg-primary-container/40 selection:text-on-primary-container">
      <MotivationalPopup show={showMotivation} label={activeQuiz?.score === 5 ? "Perfect Batch!" : "Brilliant!"} />
      
      {/* Sidebar for Desktop */}
      {(authUser || sessionEmail) && currentScreen !== AppScreen.SIGN_IN && currentScreen !== AppScreen.QUIZ && currentScreen !== AppScreen.LOADING && (
        <aside className="hidden lg:flex flex-col w-64 bg-surface-container-lowest border-r border-outline-variant/20 p-6 z-20">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-primary-container/20 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-headline font-extrabold tracking-tighter text-on-surface leading-none">ScholarEarn</h1>
              <p className="text-[8px] font-headline font-extrabold text-primary uppercase tracking-[0.2em]">AI Academic Hub</p>
            </div>
          </div>

          <nav className="flex-1 space-y-2">
            <button 
              onClick={() => setCurrentScreen(AppScreen.ENTRY)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-[2rem] text-sm font-headline font-extrabold transition-all ${currentScreen === AppScreen.ENTRY ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface'}`}
            >
              <Home className="w-5 h-5" />
              Home
            </button>
            <button 
              onClick={() => setCurrentScreen(AppScreen.PROGRESS)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-[2rem] text-sm font-headline font-extrabold transition-all ${currentScreen === AppScreen.PROGRESS ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface'}`}
            >
              <History className="w-5 h-5" />
              My Progress
            </button>
            {user.role === 'admin' && (
              <button 
                onClick={() => setCurrentScreen(AppScreen.ADMIN_DASHBOARD)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[2rem] text-sm font-headline font-extrabold transition-all ${currentScreen === AppScreen.ADMIN_DASHBOARD ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface'}`}
              >
                <LayoutDashboard className="w-5 h-5" />
                Admin
              </button>
            )}
          </nav>

          <div className="pt-6 border-t border-outline-variant/10 space-y-4">
            <div className={`p-4 rounded-[2rem] border transition-all duration-500 flex items-center justify-between ${(authUser || sessionEmail) ? 'bg-secondary-container/20 border-secondary-container' : 'bg-tertiary-container/30 border-amber-100'}`}>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <Star className={`w-4 h-4 transition-colors ${(authUser || sessionEmail) ? 'text-secondary fill-secondary' : 'text-tertiary fill-amber-500'}`} />
                  <span className={`font-headline font-extrabold text-sm transition-colors ${(authUser || sessionEmail) ? 'text-secondary' : 'text-on-surface'}`}>{totalPoints.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${(authUser || sessionEmail) ? 'bg-secondary animate-pulse' : 'bg-surface-container-highest'}`} />
                  <span className="text-[8px] font-body font-bold text-outline uppercase tracking-wider">
                    {isSyncing ? 'Syncing...' : (authUser || sessionEmail) ? 'Cloud Synchronizing 24/7' : 'Offline'}
                  </span>
                </div>
              </div>
              <span className={`text-[10px] font-headline font-extrabold uppercase transition-colors ${(authUser || sessionEmail) ? 'text-secondary' : 'text-tertiary'}`}>Points</span>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-[2rem] text-sm font-headline font-extrabold text-outline hover:text-error hover:bg-error-container/30 transition-all"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden bg-background">
        <header className="p-6 bg-surface-container-lowest/30 backdrop-blur-md border-b border-white/5 flex justify-between items-center z-20 shadow-2xl lg:hidden">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary shadow-lg neon-glow-primary flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-on-primary" />
            </div>
            <div>
              <h1 className="text-xl font-headline font-extrabold tracking-tighter text-on-surface tv-text-shadow">ScholarEarn</h1>
              <p className="text-[9px] font-headline font-extrabold text-primary uppercase tracking-[0.2em] -mt-1">AI Academic Hub</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 ${(authUser || sessionEmail) ? 'bg-secondary-container/20 border-secondary-container' : 'bg-tertiary-container/30 border-tertiary-container'}`}>
              <Star className={`w-3 h-3 transition-colors ${(authUser || sessionEmail) ? 'text-secondary fill-secondary' : 'text-tertiary fill-amber-500'}`} />
              <span className={`font-headline font-extrabold text-xs transition-colors ${(authUser || sessionEmail) ? 'text-secondary' : 'text-on-surface'}`}>{totalPoints.toLocaleString()}</span>
              {(authUser || sessionEmail) && <div className="w-1 h-1 rounded-full bg-secondary animate-pulse" />}
            </div>
            {isAuthReady && (authUser || sessionEmail) && (
              <button 
                onClick={() => setCurrentScreen(AppScreen.PROGRESS)} 
                className="w-8 h-8 rounded-lg bg-secondary-container/30 text-secondary flex items-center justify-center hover:bg-secondary-container transition-colors"
              >
                <History className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative scroll-smooth">
          <div className="max-w-7xl mx-auto w-full min-h-full lg:px-12 xl:px-20 flex flex-col">
            <div className="flex-1 w-full py-8 lg:py-16 px-4 md:px-8">
              {currentScreen === AppScreen.LANDING && (
                <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 space-y-16 animate-fade-in text-center">
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                    className="space-y-8 max-w-4xl"
                  >
                    <div className="flex justify-center mb-10">
                      <div className="relative">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                          className="absolute -inset-8 bg-gradient-to-r from-primary via-secondary to-tertiary rounded-full blur-2xl opacity-30"
                        />
                        <div className="relative w-32 h-32 bg-surface-container-lowest rounded-[2.5rem] shadow-2xl flex items-center justify-center border border-white/10 neon-glow-primary">
                          <GraduationCap className="w-16 h-16 text-primary" />
                        </div>
                      </div>
                    </div>
                    
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-headline font-extrabold tracking-tighter text-on-surface leading-[0.9] tv-text-shadow">
                      Master Your <span className="text-primary italic drop-shadow-[0_0_15px_rgba(255,77,148,0.5)]">Future</span> with AI
                    </h1>
                    <p className="text-xl md:text-2xl lg:text-3xl font-body font-bold text-on-surface-variant max-w-2xl mx-auto leading-relaxed opacity-90">
                      ScholarEarn turns your academic journey into a rewarding adventure. Level up, earn points, and dominate classroom battles.
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl"
                  >
                    {[
                      { icon: <Rocket className="w-8 h-8 text-primary" />, title: "AI Powered", desc: "Custom exams tailored to your grade and topic.", color: "primary" },
                      { icon: <Trophy className="w-8 h-8 text-secondary" />, title: "Earn Rewards", desc: "Get virtual currency for every correct answer.", color: "secondary" },
                      { icon: <School className="w-8 h-8 text-tertiary" />, title: "Classroom Battles", desc: "Compete with your peers in group challenges.", color: "tertiary" }
                    ].map((feature, i) => (
                      <div key={i} className={`bg-surface-container-lowest/50 glass-card p-8 rounded-[3rem] border border-white/10 text-left space-y-4 hover:scale-105 transition-transform group cursor-default neon-glow-${feature.color}`}>
                        <div className={`w-16 h-16 rounded-[1.5rem] bg-${feature.color}/10 flex items-center justify-center group-hover:bg-${feature.color}/20 transition-colors`}>
                          {feature.icon}
                        </div>
                        <h3 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-widest italic">{feature.title}</h3>
                        <p className="text-sm font-body font-bold text-on-surface-variant leading-relaxed">{feature.desc}</p>
                      </div>
                    ))}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="w-full max-w-md"
                  >
                    <Button 
                      onClick={() => setCurrentScreen(AppScreen.SIGN_IN)}
                      className="w-full h-24 rounded-[3rem] font-headline font-extrabold uppercase tracking-[0.3em] text-lg shadow-2xl shadow-primary/40 group relative overflow-hidden neon-glow-primary"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-4">
                        Enter the Academy <ChevronRight className="w-7 h-7 group-hover:translate-x-2 transition-transform" />
                      </span>
                      <motion.div 
                        className="absolute inset-0 bg-gradient-to-r from-primary-dim to-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </Button>
                    <p className="mt-8 text-xs font-headline font-extrabold text-outline uppercase tracking-[0.2em] opacity-60">
                      Free for all students worldwide
                    </p>
                  </motion.div>
                </div>
              )}

              {currentScreen === AppScreen.ADMIN_DASHBOARD && (
                <AdminDashboard onBack={() => setCurrentScreen(AppScreen.ENTRY)} />
              )}

              {currentScreen === AppScreen.PROGRESS && (
                <ProgressScreen user={user} onBack={() => setCurrentScreen(AppScreen.ENTRY)} />
              )}

        {currentScreen === AppScreen.SIGN_IN && (
          <div className="p-6 h-full flex flex-col items-center justify-center text-center space-y-6 animate-fade-in">
            <div className="bg-surface-container-lowest/80 glass-card p-8 rounded-[2.5rem] border border-white/40 shadow-xl space-y-6 w-full max-w-sm">
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="flex justify-center"
              >
                <GraduationCap className="w-20 h-20 text-primary" />
              </motion.div>
              <div className="space-y-2">
                <h2 className="text-2xl font-headline font-extrabold text-on-surface tracking-tighter">Welcome to ScholarEarn</h2>
                <p className="text-xs text-on-surface-variant font-body font-bold leading-relaxed">
                  Enter your email to save your progress and earn badges!
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-headline font-extrabold text-outline uppercase tracking-widest text-left block">Your Email</label>
                  <input 
                    type="email" 
                    value={emailInput} 
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="scholar@example.com"
                    className="input-field w-full px-4 py-3 rounded-xl bg-surface text-sm font-body font-bold"
                  />
                </div>
                <Button 
                  onClick={handleEmailLogin}
                  className="w-full h-14 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-xs shadow-lg shadow-primary/20"
                >
                  Sign In with Email
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-outline-variant/10"></span>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-headline font-extrabold text-outline-variant">
                  <span className="bg-surface-container-lowest px-2">Or</span>
                </div>
              </div>

              <Button 
                onClick={async () => {
                  setError(null); // Clear previous errors
                  try {
                    await loginWithGoogle();
                  } catch (e: any) {
                    console.error("Sign in error:", e);
                    if (e.code === 'auth/unauthorized-domain') {
                      setError(`Domain Unauthorized: Please add ${window.location.hostname} to your Firebase Authorized Domains.`);
                    } else {
                      setError(`Failed to sign in: ${e.code || e.message || "Please try again."}`);
                    }
                  }
                }} 
                variant="outline"
                className="w-full h-14 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-xs flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google
              </Button>
              {error && <p className="text-error text-[10px] font-body font-bold">{error}</p>}
            </div>

            {/* Feedback Section */}
            <div className="w-full max-w-sm mt-8">
              <div className="bg-surface-container-lowest/80 glass-card p-6 rounded-[2.5rem] border border-white/40 shadow-lg text-left space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-tertiary-container/20 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-tertiary" />
                  </div>
                  <h3 className="text-sm font-headline font-extrabold text-on-surface uppercase tracking-widest">Feedback & Support</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] text-on-surface-variant font-body font-bold leading-relaxed">
                    Have suggestions or need help? Our team is here to support your learning journey.
                  </p>
                  <div className="flex flex-col gap-2">
                    <a href="mailto:alsamy36@gmail.com" className="text-xs font-headline font-extrabold text-primary flex items-center gap-2 hover:underline">
                      <Mail className="w-4 h-4" /> alsamy36@gmail.com
                    </a>
                    <div className="text-[9px] font-body font-bold text-outline uppercase tracking-widest">
                      Response time: &lt; 24 hours
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.API_KEY_REQUIRED && (
          <div className="p-6 h-full flex flex-col items-center justify-center text-center space-y-6 animate-fade-in">
            <div className="bg-tertiary-container/30 p-8 rounded-[2rem] border-2 border-tertiary-container space-y-4">
              <div className="flex justify-center">
                <Key className="w-16 h-16 text-tertiary" />
              </div>
              <h2 className="text-xl font-headline font-extrabold text-on-surface">API Key Required</h2>
              <p className="text-xs text-on-surface-variant font-body font-bold leading-relaxed">
                To use the AI models, you need to select your own API key. We support both <span className="text-primary font-body font-bold">Gemini</span> and <span className="text-orange-600 font-body font-bold">Groq</span>.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <a 
                  href="https://ai.google.dev/gemini-api/docs/billing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary underline font-body font-bold block"
                >
                  Get Gemini API Key
                </a>
                <a 
                  href="https://console.groq.com/keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] text-orange-500 underline font-body font-bold block"
                >
                  Get Groq API Key
                </a>
              </div>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <Button onClick={handleSelectKey} className="w-full h-16 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-xs shadow-xl shadow-primary/20">
                Select Gemini Key
              </Button>
              <div className="text-[10px] font-body font-bold text-outline uppercase tracking-widest">Or use Groq (Developer Only)</div>
              <p className="text-[9px] text-outline px-4">
                Note: Groq key must currently be set in the project environment variables (GROQ_API_KEY).
              </p>
              <Button onClick={() => setCurrentScreen(AppScreen.ENTRY)} variant="outline" className="h-14 rounded-[1.5rem] font-headline font-extrabold uppercase tracking-widest text-[10px] border-outline-variant/20 bg-surface-container-lowest">
                Back to Enrollment
              </Button>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.ENTRY && (
          <div className="p-6 space-y-6 animate-fade-in pb-10">
            {/* Challenge Banner */}
            {challengeData && (
              <div className="bg-secondary/10 border-2 border-secondary/30 p-6 md:p-8 rounded-[3rem] animate-fade-in space-y-5 neon-glow-secondary">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center shadow-lg">
                    <Trophy className="w-8 h-8 text-on-secondary" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg md:text-2xl font-headline font-extrabold text-on-surface uppercase tracking-widest leading-none italic tv-text-shadow">Challenge Received!</h3>
                    <p className="text-xs md:text-sm text-on-surface-variant font-body font-bold italic mt-1">From: {challengeData.challenger}</p>
                  </div>
                </div>
                <div className="p-6 bg-surface-container-lowest rounded-[2rem] border border-secondary/20 text-left">
                  <p className="text-sm md:text-lg font-body font-bold text-on-surface">Topic: <span className="text-secondary italic">{challengeData.topic}</span></p>
                  <p className="text-xs md:text-sm text-outline mt-1 uppercase font-headline font-extrabold tracking-widest">Grade {challengeData.grade}</p>
                </div>
                <div className="flex gap-3">
                  <Button 
                    onClick={() => {
                      setUser(prev => ({ ...prev, topic: challengeData.topic, gradeLevel: challengeData.grade }));
                      startBatch(false, challengeData.seed);
                    }}
                    className="flex-1 h-16 rounded-[2rem] font-headline font-extrabold uppercase text-xs md:text-sm shadow-xl shadow-secondary/40 bg-secondary text-on-secondary neon-glow-secondary"
                  >
                    Accept Challenge
                  </Button>
                  <Button 
                    onClick={() => setChallengeData(null)}
                    variant="outline"
                    className="h-16 w-16 rounded-[2rem] flex items-center justify-center border-white/10 bg-white/5"
                  >
                    <X className="w-6 h-6" />
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-primary p-10 md:p-16 rounded-[3rem] text-on-primary shadow-2xl relative overflow-hidden neon-glow-primary">
               <div className="absolute top-0 right-0 p-6 opacity-10 rotate-12">
                 <School className="w-48 h-48" />
               </div>
               <div className="relative z-10">
                 <h2 className="text-4xl md:text-6xl font-headline font-extrabold italic tracking-tighter tv-text-shadow">
                   {isClassroomMode ? "Classroom Battle" : isChallengeMode ? "Challenge Arena" : "Your Path"}
                 </h2>
                 <p className="text-on-primary-container text-sm md:text-lg opacity-90 font-body font-bold mt-2 max-w-[85%]">
                   {isClassroomMode ? "Engage your students with AI-powered group challenges." : isChallengeMode ? "Share topics with friends and compete for the top score." : "Personalized for you. Resume your journey or take a mock exam."}
                 </p>
               </div>
            </div>

            <div className="bg-surface-container-lowest/80 glass-card p-8 md:p-12 rounded-[3rem] border border-white/10 shadow-2xl space-y-8">
               <div className="flex bg-surface-container p-2 rounded-[2.5rem]">
                  <button onClick={() => { setIsClassroomMode(false); setIsChallengeMode(false); }} className={`flex-1 py-4 rounded-2xl text-xs md:text-sm font-headline font-extrabold uppercase transition-all ${!isClassroomMode && !isChallengeMode ? 'bg-surface-container-lowest shadow-2xl text-primary neon-glow-primary' : 'text-outline'}`}>Individual</button>
                  <button onClick={() => { setIsClassroomMode(false); setIsChallengeMode(true); }} className={`flex-1 py-4 rounded-2xl text-xs md:text-sm font-headline font-extrabold uppercase transition-all ${isChallengeMode ? 'bg-surface-container-lowest shadow-2xl text-primary neon-glow-primary' : 'text-outline'}`}>Challenge</button>
                  <button onClick={() => { setIsClassroomMode(true); setIsChallengeMode(false); }} className={`flex-1 py-4 rounded-2xl text-xs md:text-sm font-headline font-extrabold uppercase transition-all ${isClassroomMode ? 'bg-surface-container-lowest shadow-2xl text-primary neon-glow-primary' : 'text-outline'}`}>Classroom</button>
               </div>

               <div className="space-y-8">
                  {(!isClassroomMode || isChallengeMode) && (
                    <div className="space-y-3">
                      <label className="text-xs md:text-sm font-headline font-extrabold text-primary uppercase tracking-widest italic ml-4">Identity</label>
                      <input type="text" value={user.name} onChange={e => setUser({...user, name: e.target.value})} className="input-field w-full px-10 py-6 rounded-[3rem] bg-surface text-lg md:text-2xl font-body font-bold border-2 border-white/5 focus:border-primary neon-glow-primary transition-all" placeholder="Your Name" />
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-xs md:text-sm font-headline font-extrabold text-primary uppercase tracking-widest italic ml-4">Grade</label>
                      <input 
                        type="text" 
                        value={user.gradeLevel} 
                        onChange={e => setUser({...user, gradeLevel: e.target.value})} 
                        className="input-field w-full px-8 py-6 rounded-[3rem] bg-surface text-lg md:text-2xl font-body font-bold border-2 border-white/5 focus:border-primary neon-glow-primary transition-all" 
                        placeholder="e.g. 12" 
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs md:text-sm font-headline font-extrabold text-primary uppercase tracking-widest italic ml-4">Board</label>
                      <div className="relative">
                        <select 
                          value={user.board || 'CBSE'} 
                          onChange={(e) => setUser({...user, board: e.target.value})}
                          className="input-field w-full px-10 py-6 rounded-[3rem] bg-surface text-lg md:text-2xl font-body font-bold border-2 border-white/5 focus:border-primary neon-glow-primary transition-all appearance-none"
                        >
                          <optgroup label="National / International">
                            <option value="CBSE">CBSE (National)</option>
                            <option value="ICSE">ICSE / ISC</option>
                            <option value="IB">IB (International Baccalaureate)</option>
                            <option value="IGCSE">IGCSE (Cambridge)</option>
                          </optgroup>
                          <optgroup label="State Boards">
                            <option value="Tamil Nadu State Board">Tamil Nadu Board</option>
                            <option value="Maharashtra State Board">Maharashtra Board</option>
                            <option value="Karnataka State Board">Karnataka Board</option>
                            <option value="Uttar Pradesh State Board">UP Board</option>
                            <option value="Kerala State Board">Kerala Board</option>
                            <option value="West Bengal State Board">WB Board</option>
                            <option value="Bihar State Board">Bihar Board</option>
                            <option value="Gujarat State Board">Gujarat Board</option>
                            <option value="Andhra Pradesh State Board">AP Board</option>
                            <option value="Telangana State Board">Telangana Board</option>
                            <option value="Other State Board">Generic State Board</option>
                          </optgroup>
                          <option value="Other">Other / Special Curriculum</option>
                        </select>
                        <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none text-primary">
                          <ChevronRight className="w-6 h-6 rotate-90" />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs md:text-sm font-headline font-extrabold text-primary uppercase tracking-widest italic ml-4">Section</label>
                      <input 
                        type="text" 
                        value={user.section || ''} 
                        onChange={e => setUser({...user, section: e.target.value})} 
                        className="input-field w-full px-8 py-6 rounded-[3rem] bg-surface text-lg md:text-2xl font-body font-bold border-2 border-white/5 focus:border-primary neon-glow-primary transition-all" 
                        placeholder="e.g. A" 
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs md:text-sm font-headline font-extrabold text-primary uppercase tracking-widest italic ml-4">Subject</label>
                      <input type="text" value={user.subject} onChange={e => setUser({...user, subject: e.target.value})} className="input-field w-full px-8 py-6 rounded-[3rem] bg-surface text-lg md:text-2xl font-body font-bold border-2 border-white/5 focus:border-primary neon-glow-primary transition-all" placeholder="e.g. Science" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-xs md:text-sm font-headline font-extrabold text-primary uppercase tracking-widest italic ml-4">Specific Topic</label>
                      <input type="text" value={user.topic} onChange={e => setUser({...user, topic: e.target.value})} className="input-field w-full px-10 py-6 rounded-[3rem] bg-surface text-lg md:text-2xl font-body font-bold border-2 border-white/5 focus:border-primary neon-glow-primary transition-all" placeholder="e.g. Photosynthesis" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs md:text-sm font-headline font-extrabold text-primary uppercase tracking-widest italic ml-4">Timer</label>
                      <div className="relative">
                        <select 
                          value={questionTimer} 
                          onChange={(e) => setQuestionTimer(Number(e.target.value))}
                          className="input-field w-full px-10 py-6 rounded-[3rem] bg-surface text-lg md:text-2xl font-body font-bold border-2 border-white/5 focus:border-primary neon-glow-primary transition-all appearance-none"
                        >
                          <option value={30}>30s</option>
                          <option value={45}>45s (Default)</option>
                          <option value={50}>50s</option>
                          <option value={60}>1m</option>
                          <option value={120}>2m</option>
                        </select>
                        <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none text-primary">
                          <ChevronRight className="w-6 h-6 rotate-90" />
                        </div>
                      </div>
                    </div>
                  </div>
               </div>

               {/* Level Indicator */}
               {!isClassroomMode && user.subject && (
                 <div className="p-6 md:p-8 bg-primary/10 rounded-[3rem] border-2 border-primary/20 flex items-center justify-between animate-fade-in neon-glow-primary">
                    <div>
                      <p className="text-xs md:text-sm font-headline font-extrabold text-primary uppercase tracking-widest italic">Current Progress</p>
                      <p className="text-2xl md:text-4xl font-headline font-extrabold text-on-surface italic tv-text-shadow">Level {user.level}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] md:text-xs font-body font-bold text-primary italic">Next Batch</p>
                       <span className="text-sm md:text-lg font-headline font-extrabold text-primary">5 Questions</span>
                    </div>
                 </div>
               )}

               {isBoardGrade && (
                 <div className="space-y-3 pt-4 border-t border-white/5 animate-fade-in">
                    <label className="text-xs md:text-sm font-headline font-extrabold text-on-surface-variant uppercase tracking-widest italic ml-2">Focus Area</label>
                    <div className="grid grid-cols-3 gap-3">
                       {Object.values(StudyFocus).map(f => (
                         <button key={f} onClick={() => setUser({...user, focus: f})} className={`py-4 rounded-2xl text-[10px] md:text-xs font-headline font-extrabold uppercase border-2 transition-all ${user.focus === f ? 'bg-primary text-on-primary border-primary shadow-xl neon-glow-primary' : 'bg-surface text-outline border-white/5'}`}>{f}</button>
                       ))}
                    </div>
                 </div>
               )}
            </div>

            <div className="grid gap-4">
              {isChallengeMode ? (
                <>
                  <Button onClick={shareChallenge} className="h-20 rounded-[2.5rem] font-headline font-extrabold uppercase tracking-[0.2em] text-sm shadow-2xl shadow-secondary/40 flex-1 bg-secondary text-on-secondary flex items-center justify-center gap-4 neon-glow-secondary">
                    {copied ? <CheckCircle2 className="w-6 h-6" /> : <Share2 className="w-6 h-6" />}
                    {copied ? "Link Copied!" : "Generate Challenge Link"}
                  </Button>
                  <p className="text-[10px] md:text-xs text-outline font-body font-bold text-center px-8 opacity-60">
                    Share this link with friends. They will get the exact same questions as you for this topic!
                  </p>
                </>
              ) : isClassroomMode ? (
                <Button onClick={startClassroomSetup} className="h-20 rounded-[2.5rem] font-headline font-extrabold uppercase tracking-[0.2em] text-sm shadow-2xl shadow-primary/40 flex-1 neon-glow-primary">
                  Setup Classroom Battle
                </Button>
              ) : (
                <>
                  <Button onClick={() => startBatch(false)} className="h-20 rounded-[2.5rem] font-headline font-extrabold uppercase tracking-[0.2em] text-sm shadow-2xl shadow-primary/40 flex-1 neon-glow-primary">
                    {user.level > 1 ? `Resume Level ${user.level}` : 'Start Level 1 Batch'}
                  </Button>
                  <Button onClick={() => startBatch(true)} variant="outline" className="h-16 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-[11px] border-white/10 bg-surface-container-lowest/10">
                    Practice Mock Exam
                  </Button>
                </>
              )}
            </div>
            
            {error && <p className="text-center text-error text-[10px] font-headline font-extrabold uppercase bg-error-container/30 p-3 rounded-xl border border-red-100">{error}</p>}

          <div className="bg-surface-container/50 p-4 rounded-[2rem] flex flex-col items-center text-center space-y-2">
                <div className="space-y-0.5">
                  <p className="text-[9px] font-headline font-extrabold text-outline uppercase tracking-widest">Feedback & Support</p>
                  <p className="text-[10px] font-body font-bold text-on-surface-variant">Have suggestions? We'd love to hear from you!</p>
                </div>
                <div className="flex items-center gap-2">
                  <a 
                    href="mailto:alsamy36@gmail.com" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[11px] font-headline font-extrabold text-primary hover:text-on-primary-container transition-colors flex items-center gap-1"
                  >
                    <Mail className="w-3 h-3" /> alsamy36@gmail.com
                  </a>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText('alsamy36@gmail.com');
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="text-[9px] font-headline font-extrabold text-outline bg-surface-container-lowest px-2 py-1 rounded-lg border border-outline-variant/20 hover:bg-surface transition-colors uppercase flex items-center gap-1"
                  >
                    {copied ? <CheckCircle2 className="w-3 h-3 text-secondary" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
          </div>
        )}

        {currentScreen === AppScreen.CLASSROOM_SETUP && (
          <ClassroomSetupView 
            onStart={startClassroomSession} 
            onCancel={() => setCurrentScreen(AppScreen.ENTRY)} 
          />
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="min-h-[70vh] flex flex-col items-center justify-center p-12 text-center space-y-12 animate-fade-in">
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="w-32 h-32 md:w-48 md:h-48 rounded-full border-8 border-primary/20 border-t-primary neon-glow-primary shadow-2xl"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <GraduationCap className="w-12 h-12 md:w-20 md:h-20 text-primary animate-pulse" />
              </div>
            </div>
            <div className="space-y-4 max-w-md">
              <h2 className="text-3xl md:text-5xl font-headline font-extrabold text-on-surface tracking-tighter italic tv-text-shadow">AI Generating...</h2>
              <p className="text-base md:text-xl font-body font-bold text-on-surface-variant opacity-80 leading-relaxed">
                {isMockMode ? "Randomizing Questions..." : `Preparing Level ${user.level} Challenge`}
              </p>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && currentQ && (
          <div className="animate-fade-in pb-20 max-w-7xl mx-auto w-full flex flex-col min-h-screen">
             {/* Sticky Header Section */}
             <div className="sticky top-0 z-50 bg-background/60 backdrop-blur-xl pt-4 pb-6 px-4 md:px-8 space-y-4 border-b border-white/5 shadow-2xl">
                {/* Progress Bar */}
                <div className="w-full bg-surface-container h-2 md:h-4 rounded-full overflow-hidden shadow-inner">
                   <div className="h-full bg-gradient-to-r from-primary via-secondary to-tertiary transition-all duration-700 ease-out" style={{ width: `${((currentIndex + 1) / 5) * 100}%` }}></div>
                </div>

                <div className="flex justify-between items-center bg-surface-container-lowest/80 glass-card p-4 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-white/10 shadow-xl overflow-hidden relative">
                   {/* Background Decorative Element */}
                   <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/10 blur-[80px] rounded-full pointer-events-none"></div>
                   
                   <div className="space-y-1 relative z-10 font-headline">
                      {isClassroomMode && classroomSession && (
                        <p className="text-[var(--text-fluid-xs)] font-extrabold text-primary uppercase tracking-widest italic leading-none">
                          Group: {classroomSession.groups[classroomSession.currentGroupIndex].name}
                        </p>
                      )}
                      <p className="text-[var(--text-fluid-xs)] font-extrabold text-primary uppercase tracking-widest italic leading-none">{isMockMode ? "Mock Mode" : `Level ${user.level}`}</p>
                      <p className="text-[var(--text-fluid-4xl)] font-extrabold tabular-nums italic tv-text-shadow leading-none">
                        {currentIndex + 1}<span className="text-outline-variant/30 text-[0.4em] font-medium not-italic ml-1">/5</span>
                      </p>
                   </div>

                   <div className="flex flex-col items-center gap-1 md:gap-3 relative z-10">
                      <motion.div 
                        initial={false}
                        animate={{ scale: timeLeft <= 10 ? [1, 1.1, 1] : 1 }}
                        transition={{ repeat: timeLeft <= 10 ? Infinity : 0, duration: 0.5 }}
                        className={`w-14 h-14 md:w-28 md:h-28 rounded-full border-4 md:border-8 flex items-center justify-center font-headline font-extrabold text-[var(--text-fluid-xl)] shadow-2xl transition-colors ${timeLeft <= 10 ? 'border-error text-error neon-glow-error' : 'border-primary text-primary neon-glow-primary'}`}
                      >
                        {timeLeft}
                      </motion.div>
                      <span className="text-[var(--text-fluid-xs)] font-headline font-extrabold uppercase tracking-widest text-outline italic">Seconds</span>
                   </div>

                   <div className="flex flex-col items-end gap-1 md:gap-4 relative z-10">
                      {renderQuestionLabel(currentQ.type)}
                      <span className="text-[var(--text-fluid-xs)] font-body font-bold text-outline uppercase italic opacity-70">Subject: {user.subject}</span>
                   </div>
                </div>
             </div>

             <div className="lg:flex lg:gap-8 p-4 md:p-8 lg:p-10 space-y-6 lg:space-y-0 flex-1 overflow-y-auto no-scrollbar">
                
                <div className="lg:w-1/3 flex flex-col gap-6">
                   {/* Visualization Image */}
                   <motion.div 
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="bg-surface-container-lowest/80 glass-card rounded-[2rem] md:rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden neon-glow-primary flex items-center justify-center p-2 min-h-[20vh] lg:h-fit"
                   >
                     <img 
                       src={`https://picsum.photos/seed/${currentQ.imageKeyword || user.topic}/800/400`} 
                       alt="Visualization" 
                       className="w-full h-full lg:max-h-[50vh] object-contain md:object-cover opacity-90 hover:opacity-100 transition-opacity"
                       referrerPolicy="no-referrer"
                     />
                   </motion.div>

                   {/* Case Study / Context Box */}
                   {currentQ.contextMaterial && (
                     <div className={`p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border-4 relative overflow-hidden animate-fade-in shadow-2xl h-fit ${currentQ.type === QuestionType.VISUAL_ANALYSIS ? 'bg-secondary/5 border-secondary/30 neon-glow-secondary' : 'bg-primary/5 border-primary/30 neon-glow-primary'}`}>
                        <div className="flex items-center gap-3 mb-3 opacity-80">
                          {currentQ.type === QuestionType.VISUAL_ANALYSIS ? <Eye className="w-5 h-5 md:w-8 md:h-8 text-secondary" /> : <BookOpen className="w-5 h-5 md:w-8 md:h-8 text-primary" />}
                          <span className="text-[var(--text-fluid-xs)] md:text-[var(--text-fluid-sm)] font-headline font-extrabold uppercase tracking-widest italic leading-none">
                            {currentQ.type === QuestionType.VISUAL_ANALYSIS ? 'Visual Context' : 'Read Case Study'}
                          </span>
                        </div>
                        <p className="text-[var(--text-fluid-xs)] md:text-[var(--text-fluid-base)] text-on-surface font-body font-bold leading-relaxed italic opacity-90 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                          {currentQ.contextMaterial}
                        </p>
                     </div>
                   )}
                </div>

                <div className="lg:flex-1 space-y-6 flex flex-col">
                   <div className="bg-surface-container-lowest/80 glass-card p-6 md:p-10 lg:p-14 rounded-[2rem] md:rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden h-fit">
                      <div className={`absolute top-0 left-0 w-2 md:w-3 h-full ${currentQ.type === QuestionType.WORD_PROBLEM ? 'bg-tertiary' : 'bg-primary'}`}></div>
                      <h2 className="text-[var(--text-fluid-lg)] lg:text-[var(--text-fluid-xl)] font-body font-bold text-on-surface leading-tight tv-text-shadow">
                        {currentQ.text}
                      </h2>
                   </div>

                   <div className="grid grid-cols-1 gap-4 lg:gap-6 flex-1">
                      {currentQ.options.map((opt, i) => {
                        let style = "bg-surface-container-lowest/50 border-white/5 text-on-surface hover:border-primary/50 hover:bg-primary/5";
                        if (feedback) {
                          if (i === currentQ.correctIndex) style = "bg-secondary/20 border-secondary text-on-surface ring-8 ring-secondary/10 neon-glow-secondary";
                          else if (i === feedback.selected && !feedback.isCorrect) style = "bg-error/20 border-error text-on-surface ring-8 ring-error/10 neon-glow-error";
                          else style = "opacity-30 grayscale pointer-events-none";
                        }
                        return (
                          <button key={i} disabled={!!feedback} onClick={() => handleMCQ(i)} className={`w-full p-4 md:p-6 lg:p-8 text-left rounded-[1.5rem] md:rounded-[2.5rem] lg:rounded-[3rem] border-4 transition-all flex items-center gap-6 md:gap-10 ${style} active:scale-95 group shadow-lg h-fit min-h-[80px]`}>
                             <span className={`w-10 h-10 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-2xl flex items-center justify-center text-lg md:text-xl lg:text-2xl font-headline font-extrabold flex-none transition-colors ${feedback && i === currentQ.correctIndex ? 'bg-secondary text-on-secondary shadow-lg' : 'bg-surface-container text-outline group-hover:bg-primary/20 group-hover:text-primary'}`}>{String.fromCharCode(65 + i)}</span>
                             <span className="text-[var(--text-fluid-base)] lg:text-[var(--text-fluid-lg)] font-body font-bold leading-tight">{opt}</span>
                          </button>
                        );
                      })}
                   </div>
                </div>
             </div>

             {feedback && (
               <div className="p-8 md:p-12 bg-surface-container-lowest/90 backdrop-blur-xl rounded-[3rem] border-4 border-white/10 animate-fade-in space-y-6 shadow-2xl">
                 <div className="flex justify-between items-center border-b border-white/5 pb-4">
                    <p className="text-[var(--text-fluid-xs)] font-headline font-extrabold uppercase text-primary tracking-widest italic">Expert Explanation</p>
                 </div>
                 <p className="text-[var(--text-fluid-base)] md:text-[var(--text-fluid-lg)] font-body font-bold text-on-surface-variant leading-relaxed italic opacity-90">{currentQ.explanation}</p>
                 
                 {currentQ.inquiryPrompt && (
                   <div className="mt-6 md:mt-8 p-6 md:p-10 bg-primary/10 rounded-[2rem] md:rounded-[2.5rem] border-2 border-primary/20 space-y-3 md:space-y-4 neon-glow-primary">
                     <div className="flex items-center gap-3 text-primary">
                       <Sparkles className="w-5 h-5 md:w-6 md:h-6" />
                       <span className="text-[var(--text-fluid-xs)] font-headline font-extrabold uppercase tracking-widest italic leading-none">Further Inquiry</span>
                     </div>
                     <p className="text-[var(--text-fluid-sm)] md:text-[var(--text-fluid-lg)] font-body font-bold text-on-surface leading-relaxed italic">
                       {currentQ.inquiryPrompt}
                     </p>
                   </div>
                 )}

                  {!feedback.isCorrect && (
                    <Button onClick={nextQuestion} className="h-20 rounded-[2.5rem] font-headline font-extrabold uppercase text-sm shadow-2xl shadow-primary/40 neon-glow-primary">Next Question</Button>
                  )}
               </div>
             )}
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-8 text-center space-y-10 animate-fade-in pb-20 max-w-4xl mx-auto">
             <div className="space-y-4">
                <div className="flex justify-center mb-6">
                  {activeQuiz.score >= 3 ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    >
                      <Rocket className="w-32 h-32 md:w-48 md:h-48 text-primary neon-glow-primary" />
                    </motion.div>
                  ) : (
                    <Shield className="w-32 h-32 md:w-48 md:h-48 text-outline opacity-50" />
                  )}
                </div>
                <h2 className="text-4xl md:text-7xl font-headline font-extrabold text-on-surface tracking-tighter italic tv-text-shadow">Batch Complete!</h2>
                <p className="text-xs md:text-sm font-headline font-extrabold text-primary uppercase tracking-[0.3em] italic">{isMockMode ? "Mock Exam Result" : `Level ${user.level} Progress`}</p>
             </div>

             <div className="bg-surface-container-lowest/80 glass-card p-10 md:p-16 rounded-[4rem] shadow-2xl border border-white/10 relative overflow-hidden neon-glow-primary">
                <div className="grid grid-cols-2 gap-6 md:gap-10">
                   <div className="p-8 md:p-12 bg-primary/10 rounded-[3rem] border-2 border-primary/20">
                      <p className="text-xs md:text-sm font-headline font-extrabold text-primary uppercase mb-2 tracking-widest italic">Final Score</p>
                      <p className="text-5xl md:text-8xl font-headline font-extrabold text-on-surface italic tv-text-shadow">{activeQuiz.score}<span className="text-2xl md:text-4xl text-primary/50 not-italic">/5</span></p>
                   </div>
                   <div className="p-8 md:p-12 bg-tertiary/10 rounded-[3rem] border-2 border-tertiary/20">
                      <p className="text-xs md:text-sm font-headline font-extrabold text-tertiary uppercase mb-2 tracking-widest italic">Points Earned</p>
                      <p className="text-5xl md:text-8xl font-headline font-extrabold text-on-surface italic tv-text-shadow">+{activeQuiz.score * 10}</p>
                   </div>
                </div>
                
                <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between px-4">
                  <div className="text-left">
                    <p className="text-[10px] md:text-xs font-headline font-extrabold text-outline uppercase tracking-widest">Global Average</p>
                    <p className="text-xl md:text-3xl font-headline font-extrabold text-on-surface italic">3.2/5</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] md:text-xs font-headline font-extrabold text-secondary uppercase tracking-widest">Global Rank</p>
                    <p className="text-xl md:text-3xl font-headline font-extrabold text-secondary italic">Top 15%</p>
                  </div>
                </div>
                {!isMockMode && activeQuiz.score >= 3 && (
                   <motion.div 
                     initial={{ y: 20, opacity: 0 }}
                     animate={{ y: 0, opacity: 1 }}
                     className="mt-10 p-6 bg-secondary text-on-secondary rounded-[2rem] text-sm md:text-lg font-headline font-extrabold uppercase tracking-[0.2em] animate-pulse neon-glow-secondary italic"
                   >
                     Level Up Unlocked! 🚀
                   </motion.div>
                )}
             </div>

             <div className="grid grid-cols-1 gap-4 md:gap-6">
                {isClassroomMode ? (
                  <Button onClick={nextGroup} className="h-20 rounded-[2.5rem] font-headline font-extrabold uppercase text-sm md:text-base tracking-[0.2em] shadow-2xl shadow-primary/40 neon-glow-primary">
                    {classroomSession && classroomSession.currentGroupIndex < classroomSession.groups.length - 1 ? "Next Group Turn" : "View Final Leaderboard"}
                  </Button>
                ) : (
                  <Button onClick={() => startBatch(isMockMode)} className="h-20 rounded-[2.5rem] font-headline font-extrabold uppercase text-sm md:text-base tracking-[0.2em] shadow-2xl shadow-primary/40 neon-glow-primary">
                    {isMockMode ? "New Mock Exam" : activeQuiz.score >= 3 ? `Start Level ${user.level}` : "Retry Batch"}
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-4 md:gap-6">
                  <Button onClick={downloadBadge} variant="secondary" className="h-16 rounded-[2rem] font-headline font-extrabold uppercase text-[11px] md:text-xs tracking-widest neon-glow-secondary">Save Badge</Button>
                  <Button onClick={shareChallenge} variant="outline" className="h-16 rounded-[2rem] font-headline font-extrabold uppercase text-[11px] md:text-xs tracking-widest flex items-center justify-center gap-3 border-white/10 bg-white/5">
                    {copied ? <CheckCircle2 className="w-5 h-5 text-secondary" /> : <Share2 className="w-5 h-5" />}
                    {copied ? "Link Copied" : "Challenge Friend"}
                  </Button>
                </div>
                <Button onClick={() => {
                  setCurrentScreen(AppScreen.ENTRY);
                  setIsClassroomMode(false);
                  setClassroomSession(null);
                }} variant="outline" className="h-14 rounded-[2rem] font-headline font-extrabold uppercase text-[10px] md:text-xs text-outline hover:text-primary border-white/5 opacity-60 hover:opacity-100 transition-all">
                  Back to Main Menu
                </Button>
             </div>
             
             <canvas ref={badgeCanvasRef} width="400" height="400" className="hidden"></canvas>
          </div>
        )}

        {currentScreen === AppScreen.LEADERBOARD && classroomSession && (
          <div className="p-8 space-y-12 animate-fade-in pb-20 max-w-4xl mx-auto">
             <div className="text-center space-y-4">
                <div className="flex justify-center mb-6">
                  <motion.div
                    animate={{ y: [0, -20, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Trophy className="w-32 h-32 md:w-48 md:h-48 text-tertiary neon-glow-tertiary" />
                  </motion.div>
                </div>
                <h2 className="text-4xl md:text-7xl font-headline font-extrabold text-on-surface tracking-tighter italic tv-text-shadow">Classroom Excellence</h2>
                <p className="text-xs md:text-sm font-headline font-extrabold text-tertiary uppercase tracking-[0.3em] italic">Final Group Rankings</p>
             </div>

             <div className="space-y-4 md:space-y-6">
                {[...classroomSession.groups].sort((a, b) => b.score - a.score).map((group, idx) => (
                  <motion.div 
                    key={group.id} 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`p-8 md:p-12 rounded-[3rem] border-4 flex items-center justify-between shadow-2xl ${idx === 0 ? 'bg-tertiary/20 border-tertiary neon-glow-tertiary' : 'bg-surface-container-lowest/50 border-white/5'}`}
                  >
                     <div className="flex items-center gap-6 md:gap-10">
                        <span className={`w-14 h-14 md:w-20 md:h-20 rounded-2xl flex items-center justify-center font-headline font-extrabold text-2xl md:text-4xl shadow-xl ${idx === 0 ? 'bg-tertiary text-on-tertiary' : 'bg-surface-container text-outline'}`}>
                          {idx + 1}
                        </span>
                        <div>
                           <p className="text-xl md:text-3xl font-headline font-extrabold text-on-surface italic">{group.name}</p>
                           <p className="text-[10px] md:text-xs font-body font-bold text-outline uppercase tracking-widest opacity-60">Group ID: {group.id}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-4xl md:text-6xl font-headline font-extrabold text-primary italic tv-text-shadow">{group.score}<span className="text-sm md:text-xl text-primary/50 ml-2 not-italic">PTS</span></p>
                     </div>
                  </motion.div>
                ))}
             </div>

             <Button onClick={() => {
               setCurrentScreen(AppScreen.ENTRY);
               setIsClassroomMode(false);
               setClassroomSession(null);
             }} className="h-20 rounded-[2.5rem] font-headline font-extrabold uppercase text-sm md:text-base tracking-[0.2em] shadow-2xl shadow-primary/40 neon-glow-primary w-full">
               Back to Main Menu
             </Button>
          </div>
        )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}