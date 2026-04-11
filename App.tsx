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
    <div className="p-6 space-y-6 animate-fade-in pb-10">
      <div className="bg-surface-container-lowest/80 glass-card p-6 rounded-[2.5rem] shadow-lg shadow-black/5 border border-white/40 space-y-5">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-headline font-extrabold text-on-surface-variant uppercase tracking-widest">Group Configuration</h3>
          <div className="flex gap-2">
             <input 
               type="file" 
               ref={fileInputRef} 
               onChange={handleFileUpload} 
               accept=".txt,.csv" 
               className="hidden" 
             />
             <button 
               onClick={() => fileInputRef.current?.click()}
               className="text-[9px] font-headline font-extrabold text-primary bg-primary-container/20 px-2 py-1 rounded-lg hover:bg-primary-container/40 transition-colors uppercase"
             >
               Upload Accessions
             </button>
             <span className="text-[10px] font-body font-bold text-outline bg-surface px-2 py-1 rounded-lg">{groups.length}/5</span>
          </div>
        </div>

        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.id} className="flex gap-2 items-center">
              <div className="flex-1 space-y-2">
                <input 
                  type="text" 
                  value={group.name} 
                  onChange={e => updateGroupName(group.id, e.target.value)} 
                  className="input-field w-full px-4 py-3 rounded-xl bg-surface text-sm font-body font-bold" 
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

        <div className="pt-4 border-t border-outline-variant/10 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-headline font-extrabold text-outline uppercase tracking-widest">Question Timer</label>
            <select 
              value={timer} 
              onChange={(e) => setTimer(Number(e.target.value))}
              className="bg-surface border border-outline-variant/20 rounded-lg px-3 py-1.5 text-xs font-body font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="w-full py-3 rounded-xl border-2 border-dashed border-outline-variant/20 text-outline text-[10px] font-headline font-extrabold uppercase hover:border-primary-container hover:text-primary/80 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Group
          </button>
        )}
      </div>

      <div className="grid gap-3">
        <Button onClick={() => onStart(groups, timer)} className="h-16 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-xs shadow-xl shadow-primary/20 flex-1">
          Start Classroom Battle
        </Button>
        <Button onClick={onCancel} variant="outline" className="h-14 rounded-[1.5rem] font-headline font-extrabold uppercase tracking-widest text-[10px] border-outline-variant/20 bg-surface-container-lowest">
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
      name: '', gradeLevel: '10', section: '', subject: '', focus: StudyFocus.SYLLABUS, topic: '',
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
        topic: user.topic
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
            testHistory: user.testHistory || []
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

      <div className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden">
        <header className="p-5 bg-surface-container-lowest border-b flex justify-between items-center z-10 shadow-lg shadow-black/5 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary-container/20 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-headline font-extrabold tracking-tighter text-on-surface">ScholarEarn</h1>
              <p className="text-[8px] font-headline font-extrabold text-primary uppercase tracking-[0.2em] -mt-1">AI Academic Hub</p>
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

        <main className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative bg-surface/50 scroll-smooth">
          <div className="max-w-6xl mx-auto w-full h-full lg:px-12 xl:px-20">
            <div className="max-w-2xl mx-auto lg:max-w-none h-full py-6 lg:py-10">
              {currentScreen === AppScreen.LANDING && (
                <div className="h-full flex flex-col items-center justify-center p-6 space-y-12 animate-fade-in text-center">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="space-y-6 max-w-2xl"
                  >
                    <div className="flex justify-center mb-8">
                      <div className="relative">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                          className="absolute -inset-4 bg-gradient-to-r from-primary via-secondary to-tertiary rounded-full blur-xl opacity-20"
                        />
                        <div className="relative w-24 h-24 bg-surface-container-lowest rounded-[2rem] shadow-2xl flex items-center justify-center border border-white/40">
                          <GraduationCap className="w-12 h-12 text-primary" />
                        </div>
                      </div>
                    </div>
                    
                    <h1 className="text-5xl md:text-7xl font-headline font-extrabold tracking-tighter text-on-surface leading-none">
                      Master Your <span className="text-primary italic">Future</span> with AI
                    </h1>
                    <p className="text-lg md:text-xl font-body font-medium text-on-surface-variant max-w-lg mx-auto leading-relaxed">
                      ScholarEarn turns your academic journey into a rewarding adventure. Level up, earn points, and dominate classroom battles.
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full"
                  >
                    {[
                      { icon: <Rocket className="w-6 h-6 text-primary" />, title: "AI Powered", desc: "Custom exams tailored to your grade and topic." },
                      { icon: <Trophy className="w-6 h-6 text-secondary" />, title: "Earn Rewards", desc: "Get virtual currency for every correct answer." },
                      { icon: <School className="w-6 h-6 text-tertiary" />, title: "Classroom Battles", desc: "Compete with your peers in group challenges." }
                    ].map((feature, i) => (
                      <div key={i} className="bg-surface-container-lowest/50 glass-card p-6 rounded-[2rem] border border-white/20 text-left space-y-3 hover:scale-105 transition-transform">
                        <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center">
                          {feature.icon}
                        </div>
                        <h3 className="font-headline font-extrabold text-on-surface uppercase tracking-widest text-xs">{feature.title}</h3>
                        <p className="text-xs font-body font-bold text-outline leading-relaxed">{feature.desc}</p>
                      </div>
                    ))}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="w-full max-w-sm"
                  >
                    <Button 
                      onClick={() => setCurrentScreen(AppScreen.SIGN_IN)}
                      className="w-full h-20 rounded-[2.5rem] font-headline font-extrabold uppercase tracking-[0.2em] text-sm shadow-2xl shadow-primary/40 group relative overflow-hidden"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-3">
                        Enter the Academy <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </span>
                      <motion.div 
                        className="absolute inset-0 bg-gradient-to-r from-primary-dim to-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </Button>
                    <p className="mt-6 text-[10px] font-headline font-extrabold text-outline uppercase tracking-widest">
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
              <div className="bg-secondary-container/30 p-6 rounded-[2rem] border-2 border-secondary-container animate-fade-in space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-on-secondary" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-headline font-extrabold text-on-surface uppercase tracking-widest leading-none">Challenge Received!</h3>
                    <p className="text-[10px] text-on-surface-variant font-body font-bold italic mt-1">From: {challengeData.challenger}</p>
                  </div>
                </div>
                <div className="p-4 bg-surface-container-lowest rounded-xl border border-secondary/20 text-left">
                  <p className="text-xs font-body font-bold text-on-surface">Topic: <span className="text-secondary">{challengeData.topic}</span></p>
                  <p className="text-[10px] text-outline mt-1 uppercase font-headline font-extrabold tracking-widest">Grade {challengeData.grade}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => {
                      setUser(prev => ({ ...prev, topic: challengeData.topic, gradeLevel: challengeData.grade }));
                      startBatch(false, challengeData.seed);
                    }}
                    className="flex-1 h-12 rounded-xl font-headline font-extrabold uppercase text-[10px] shadow-lg shadow-secondary/20"
                  >
                    Accept Challenge
                  </Button>
                  <Button 
                    onClick={() => setChallengeData(null)}
                    variant="outline"
                    className="h-12 w-12 rounded-xl flex items-center justify-center border-outline-variant/20"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-primary p-8 rounded-[2rem] text-on-primary shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                 <School className="w-32 h-32" />
               </div>
               <div className="relative z-10">
                 <h2 className="text-3xl font-headline font-extrabold italic tracking-tighter">
                   {isClassroomMode ? "Classroom Battle" : isChallengeMode ? "Challenge Arena" : "Your Path"}
                 </h2>
                 <p className="text-on-primary-container text-xs opacity-90 font-body font-bold mt-1 max-w-[80%]">
                   {isClassroomMode ? "Engage your students with AI-powered group challenges." : isChallengeMode ? "Share topics with friends and compete for the top score." : "Personalized for you. Resume your journey or take a mock exam."}
                 </p>
               </div>
            </div>

            <div className="bg-surface-container-lowest/80 glass-card p-6 rounded-[2.5rem] border border-white/40 shadow-lg shadow-black/5 space-y-5">
               <div className="flex bg-surface-container p-1 rounded-[2rem]">
                  <button onClick={() => { setIsClassroomMode(false); setIsChallengeMode(false); }} className={`flex-1 py-3 rounded-xl text-[10px] font-headline font-extrabold uppercase transition-all ${!isClassroomMode && !isChallengeMode ? 'bg-surface-container-lowest shadow-lg shadow-black/5 text-primary' : 'text-outline'}`}>Individual</button>
                  <button onClick={() => { setIsClassroomMode(false); setIsChallengeMode(true); }} className={`flex-1 py-3 rounded-xl text-[10px] font-headline font-extrabold uppercase transition-all ${isChallengeMode ? 'bg-surface-container-lowest shadow-lg shadow-black/5 text-primary' : 'text-outline'}`}>Challenge</button>
                  <button onClick={() => { setIsClassroomMode(true); setIsChallengeMode(false); }} className={`flex-1 py-3 rounded-xl text-[10px] font-headline font-extrabold uppercase transition-all ${isClassroomMode ? 'bg-surface-container-lowest shadow-lg shadow-black/5 text-primary' : 'text-outline'}`}>Classroom</button>
               </div>

               <div className="space-y-4">
                  {(!isClassroomMode || isChallengeMode) && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-headline font-extrabold text-outline uppercase ml-1">Identity</label>
                      <input type="text" value={user.name} onChange={e => setUser({...user, name: e.target.value})} className="input-field w-full px-4 py-4 rounded-[2rem] bg-surface text-sm font-body font-bold" placeholder="Your Name" />
                    </div>
                  )}
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-headline font-extrabold text-outline uppercase ml-1">Grade</label>
                      <input 
                        type="text" 
                        value={user.gradeLevel} 
                        onChange={e => setUser({...user, gradeLevel: e.target.value})} 
                        className="input-field w-full px-4 py-4 rounded-[2rem] bg-surface text-sm font-body font-bold" 
                        placeholder="e.g. 12" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-headline font-extrabold text-outline uppercase ml-1">Section</label>
                      <input 
                        type="text" 
                        value={user.section || ''} 
                        onChange={e => setUser({...user, section: e.target.value})} 
                        className="input-field w-full px-4 py-4 rounded-[2rem] bg-surface text-sm font-body font-bold" 
                        placeholder="e.g. A" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-headline font-extrabold text-outline uppercase ml-1">Subject</label>
                      <input type="text" value={user.subject} onChange={e => setUser({...user, subject: e.target.value})} className="input-field w-full px-4 py-4 rounded-[2rem] bg-surface text-sm font-body font-bold" placeholder="e.g. Science" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-headline font-extrabold text-outline uppercase ml-1">Specific Topic</label>
                      <input type="text" value={user.topic} onChange={e => setUser({...user, topic: e.target.value})} className="input-field w-full px-4 py-4 rounded-[2rem] bg-surface text-sm font-body font-bold" placeholder="e.g. Photosynthesis" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-headline font-extrabold text-outline uppercase ml-1">Timer</label>
                      <select 
                        value={questionTimer} 
                        onChange={(e) => setQuestionTimer(Number(e.target.value))}
                        className="input-field w-full px-4 py-4 rounded-[2rem] bg-surface text-sm font-body font-bold appearance-none"
                      >
                        <option value={30}>30s</option>
                        <option value={45}>45s (Default)</option>
                        <option value={50}>50s</option>
                        <option value={60}>1m</option>
                        <option value={120}>2m</option>
                      </select>
                    </div>
                  </div>
               </div>

               {/* Level Indicator */}
               {!isClassroomMode && user.subject && (
                 <div className="p-4 bg-primary-container/20 rounded-[2rem] border border-primary-container flex items-center justify-between animate-fade-in">
                    <div>
                      <p className="text-[10px] font-headline font-extrabold text-primary/80 uppercase">Current Progress</p>
                      <p className="text-xl font-headline font-extrabold text-on-primary-container">Level {user.level}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[9px] font-body font-bold text-primary/80">Next Batch</p>
                       <span className="text-xs font-body font-bold text-primary">5 Questions</span>
                    </div>
                 </div>
               )}

               {isBoardGrade && (
                 <div className="space-y-2 pt-2 border-t animate-fade-in">
                    <label className="text-[10px] font-headline font-extrabold text-outline uppercase ml-1">Focus Area</label>
                    <div className="grid grid-cols-3 gap-2">
                       {Object.values(StudyFocus).map(f => (
                         <button key={f} onClick={() => setUser({...user, focus: f})} className={`py-3 rounded-xl text-[9px] font-headline font-extrabold uppercase border transition-all ${user.focus === f ? 'bg-primary text-on-primary border-primary shadow-md' : 'bg-surface text-outline border-outline-variant/10'}`}>{f}</button>
                       ))}
                    </div>
                 </div>
               )}
            </div>

            <div className="grid gap-3">
              {isChallengeMode ? (
                <>
                  <Button onClick={shareChallenge} className="h-16 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-xs shadow-xl shadow-secondary/20 flex-1 bg-secondary text-on-secondary flex items-center justify-center gap-3">
                    {copied ? <CheckCircle2 className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
                    {copied ? "Link Copied!" : "Generate Challenge Link"}
                  </Button>
                  <p className="text-[9px] text-outline font-body font-bold text-center px-6">
                    Share this link with friends. They will get the exact same questions as you for this topic!
                  </p>
                </>
              ) : isClassroomMode ? (
                <Button onClick={startClassroomSetup} className="h-16 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-xs shadow-xl shadow-primary/20 flex-1">
                  Setup Classroom Battle
                </Button>
              ) : (
                <>
                  <Button onClick={() => startBatch(false)} className="h-16 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-xs shadow-xl shadow-primary/20 flex-1">
                    {user.level > 1 ? `Resume Level ${user.level}` : 'Start Level 1 Batch'}
                  </Button>
                  <Button onClick={() => startBatch(true)} variant="outline" className="h-14 rounded-[1.5rem] font-headline font-extrabold uppercase tracking-widest text-[10px] border-outline-variant/20 bg-surface-container-lowest">
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
          <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-6">
             <div className="relative">
               <div className="w-20 h-20 border-8 border-outline-variant/10 rounded-full"></div>
               <div className="w-20 h-20 border-8 border-primary rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
             </div>
             <div className="space-y-1">
                <h3 className="text-lg font-headline font-extrabold text-on-surface italic">"{loadingMsg}"</h3>
                {!isAuthReady ? (
                  <p className="text-[10px] text-outline font-body font-bold uppercase tracking-widest">
                    Connecting to Cloud...
                  </p>
                ) : (
                  <p className="text-[10px] text-outline font-body font-bold uppercase tracking-widest">
                    {isMockMode ? "Randomizing Questions..." : `Preparing Level ${user.level} Challenge`}
                  </p>
                )}
             </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && currentQ && (
          <div className="p-6 space-y-6 animate-fade-in pb-20">
             {/* Progress Bar */}
             <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((currentIndex + 1) / 5) * 100}%` }}></div>
             </div>

             <div className="flex justify-between items-end bg-surface-container-lowest/80 glass-card p-5 rounded-[2.5rem] border border-white/40 shadow-lg shadow-black/5">
                <div>
                   {isClassroomMode && classroomSession && (
                     <p className="text-[10px] font-headline font-extrabold text-primary uppercase mb-1">
                       Group: {classroomSession.groups[classroomSession.currentGroupIndex].name}
                     </p>
                   )}
                   <p className="text-[10px] font-headline font-extrabold text-primary uppercase mb-1">{isMockMode ? "Mock Mode" : `Level ${user.level}`}</p>
                   <p className="text-3xl font-headline font-extrabold tabular-nums">{currentIndex + 1}<span className="text-outline-variant/50 text-xl font-medium">/5</span></p>
                </div>
                <div className="flex flex-col items-center gap-1">
                   <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center font-headline font-extrabold text-lg ${timeLeft <= 10 ? 'border-error text-error animate-pulse' : 'border-primary text-primary'}`}>
                     {timeLeft}
                   </div>
                   <span className="text-[8px] font-headline font-extrabold uppercase tracking-widest text-outline">Seconds</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                   {renderQuestionLabel(currentQ.type)}
                   <span className="text-[8px] font-body font-bold text-outline uppercase italic">Subject: {user.subject}</span>
                </div>
             </div>

             {/* Case Study / Context Box */}
             {currentQ.contextMaterial && (
               <div className={`p-6 rounded-[2rem] border-2 relative overflow-hidden animate-fade-in ${currentQ.type === QuestionType.VISUAL_ANALYSIS ? 'bg-secondary-container/20 border-secondary-container' : 'bg-primary-container/20 border-primary-container'}`}>
                  <div className="flex items-center gap-2 mb-2 opacity-70">
                    {currentQ.type === QuestionType.VISUAL_ANALYSIS ? <Eye className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                    <span className="text-[10px] font-headline font-extrabold uppercase tracking-widest">
                      {currentQ.type === QuestionType.VISUAL_ANALYSIS ? 'Visual Context' : 'Read Case Study'}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface font-medium leading-relaxed italic">
                    {currentQ.contextMaterial}
                  </p>
               </div>
             )}

             <div className="bg-surface-container-lowest/80 glass-card p-8 rounded-[2.5rem] border border-white/40 shadow-lg shadow-black/5 relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-2 h-full ${currentQ.type === QuestionType.WORD_PROBLEM ? 'bg-tertiary' : 'bg-primary'}`}></div>
                <h2 className="text-lg font-body font-bold text-on-surface leading-snug">{currentQ.text}</h2>
             </div>

             <div className="grid gap-3">
                {currentQ.options.map((opt, i) => {
                  let style = "bg-surface-container-lowest border-outline-variant/10 text-on-surface-variant hover:border-primary-container";
                  if (feedback) {
                    if (i === currentQ.correctIndex) style = "bg-secondary-container/30 border-secondary text-on-secondary-container ring-4 ring-secondary-container";
                    else if (i === feedback.selected && !feedback.isCorrect) style = "bg-error-container/30 border-error text-on-error-container ring-4 ring-error-container";
                    else style = "opacity-40 grayscale pointer-events-none";
                  }
                  return (
                    <button key={i} disabled={!!feedback} onClick={() => handleMCQ(i)} className={`w-full p-5 text-left rounded-[1.5rem] border-2 transition-all flex items-center gap-5 ${style} active:scale-95`}>
                       <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-headline font-extrabold flex-none ${feedback && i === currentQ.correctIndex ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-outline'}`}>{String.fromCharCode(65 + i)}</span>
                       <span className="text-sm font-body font-bold leading-tight">{opt}</span>
                    </button>
                  );
                })}
             </div>

             {feedback && (
               <div className="p-6 bg-surface rounded-[2rem] border-2 border-outline-variant/20 animate-fade-in space-y-3">
                  <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2">
                     <p className="text-[10px] font-headline font-extrabold uppercase text-primary tracking-widest">Feedback</p>
                  </div>
                  <p className="text-xs font-body font-bold text-on-surface-variant leading-relaxed italic">{currentQ.explanation}</p>
                  
                  {currentQ.inquiryPrompt && (
                    <div className="mt-4 p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-2">
                      <div className="flex items-center gap-2 text-primary">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-[10px] font-headline font-extrabold uppercase tracking-widest">Further Inquiry</span>
                      </div>
                      <p className="text-[11px] font-body font-bold text-on-surface leading-relaxed">
                        {currentQ.inquiryPrompt}
                      </p>
                    </div>
                  )}

                  {!feedback.isCorrect && (
                    <Button onClick={nextQuestion} className="h-12 rounded-xl font-headline font-extrabold uppercase text-[10px]">Next</Button>
                  )}
               </div>
             )}
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-8 text-center space-y-8 animate-fade-in pb-20">
             <div className="space-y-2">
                <div className="flex justify-center mb-4">
                  {activeQuiz.score >= 3 ? (
                    <Rocket className="w-20 h-20 text-primary" />
                  ) : (
                    <Shield className="w-20 h-20 text-outline" />
                  )}
                </div>
                <h2 className="text-3xl font-headline font-extrabold text-on-surface tracking-tighter">Batch Complete</h2>
                <p className="text-[10px] font-headline font-extrabold text-outline uppercase tracking-widest">{isMockMode ? "Mock Exam" : `Level ${user.level} Progress`}</p>
             </div>

             <div className="bg-surface-container-lowest/80 glass-card p-8 rounded-[3rem] shadow-xl border border-white/40 relative overflow-hidden">
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 bg-primary-container/20 rounded-[2.5rem]">
                      <p className="text-[10px] font-headline font-extrabold text-primary/80 uppercase mb-1">Score</p>
                      <p className="text-4xl font-headline font-extrabold text-primary">{activeQuiz.score}<span className="text-xl text-primary-container">/5</span></p>
                   </div>
                   <div className="p-4 bg-tertiary-container/30 rounded-[2.5rem]">
                      <p className="text-[10px] font-headline font-extrabold text-tertiary uppercase mb-1">Earned</p>
                      <p className="text-4xl font-headline font-extrabold text-tertiary">+{activeQuiz.score * 10}</p>
                   </div>
                </div>
                {!isMockMode && activeQuiz.score >= 3 && (
                   <div className="mt-6 p-3 bg-secondary text-on-secondary rounded-xl text-xs font-body font-bold uppercase tracking-widest animate-pulse">
                     Level Up Unlocked!
                   </div>
                )}
             </div>

             <div className="grid grid-cols-1 gap-3">
                {isClassroomMode ? (
                  <Button onClick={nextGroup} className="h-16 rounded-[2rem] font-headline font-extrabold uppercase text-xs tracking-widest shadow-xl shadow-primary/30">
                    {classroomSession && classroomSession.currentGroupIndex < classroomSession.groups.length - 1 ? "Next Group Turn" : "View Final Leaderboard"}
                  </Button>
                ) : (
                  <Button onClick={() => startBatch(isMockMode)} className="h-16 rounded-[2rem] font-headline font-extrabold uppercase text-xs tracking-widest shadow-xl shadow-primary/30">
                    {isMockMode ? "New Mock Exam" : activeQuiz.score >= 3 ? `Start Level ${user.level}` : "Retry Batch"}
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={downloadBadge} variant="secondary" className="h-14 rounded-[2rem] font-headline font-extrabold uppercase text-[10px]">Save Badge</Button>
                  <Button onClick={shareChallenge} variant="outline" className="h-14 rounded-[2rem] font-headline font-extrabold uppercase text-[10px] flex items-center justify-center gap-2">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-secondary" /> : <Share2 className="w-4 h-4" />}
                    {copied ? "Link Copied" : "Challenge Friend"}
                  </Button>
                </div>
                <Button onClick={() => {
                  setCurrentScreen(AppScreen.ENTRY);
                  setIsClassroomMode(false);
                  setClassroomSession(null);
                }} variant="outline" className="h-12 rounded-[2rem] font-headline font-extrabold uppercase text-[10px] text-outline hover:text-primary border-outline-variant/20">
                  Back to Menu
                </Button>
             </div>
             
             <canvas ref={badgeCanvasRef} width="400" height="400" className="hidden"></canvas>
          </div>
        )}

        {currentScreen === AppScreen.LEADERBOARD && classroomSession && (
          <div className="p-8 space-y-8 animate-fade-in pb-20">
             <div className="text-center space-y-2">
                <div className="flex justify-center mb-4">
                  <Trophy className="w-24 h-24 text-tertiary" />
                </div>
                <h2 className="text-3xl font-headline font-extrabold text-on-surface tracking-tighter">Classroom Excellence</h2>
                <p className="text-[10px] font-headline font-extrabold text-outline uppercase tracking-widest">Final Group Rankings</p>
             </div>

             <div className="space-y-3">
                {[...classroomSession.groups].sort((a, b) => b.score - a.score).map((group, idx) => (
                  <div key={group.id} className={`p-6 rounded-[2rem] border-2 flex items-center justify-between ${idx === 0 ? 'bg-tertiary-container/30 border-tertiary-container' : 'bg-surface-container-lowest border-outline-variant/10'}`}>
                     <div className="flex items-center gap-4">
                        <span className={`w-10 h-10 rounded-full flex items-center justify-center font-headline font-extrabold text-lg ${idx === 0 ? 'bg-tertiary text-on-tertiary' : 'bg-surface-container text-outline'}`}>
                          {idx + 1}
                        </span>
                        <div>
                           <p className="text-sm font-headline font-extrabold text-on-surface">{group.name}</p>
                           <p className="text-[9px] font-body font-bold text-outline uppercase">Group ID: {group.id}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-2xl font-headline font-extrabold text-primary">{group.score}<span className="text-xs text-primary-container ml-1">PTS</span></p>
                     </div>
                  </div>
                ))}
             </div>

             <Button onClick={() => {
               setCurrentScreen(AppScreen.ENTRY);
               setIsClassroomMode(false);
               setClassroomSession(null);
             }} className="h-16 rounded-[2rem] font-headline font-extrabold uppercase text-xs tracking-widest shadow-xl shadow-primary/30 w-full">
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