import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, GraduationCap, School, Rocket, Shield, Trophy, X, Plus, 
  Upload, ArrowLeft, LogIn, LogOut, Star, Key, Mail, Copy, 
  BookOpen, Eye, Calculator, CheckCircle2, AlertCircle, 
  ChevronRight, Download, Search, User as UserIcon, Settings, History,
  LayoutDashboard, Home
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
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl border-4 border-amber-300 flex flex-col items-center transform">
            <motion.div 
              animate={{ y: [0, -20, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="mb-4"
            >
              <Sparkles className="w-16 h-16 text-amber-400 filter drop-shadow-md" />
            </motion.div>
            <h3 className="text-2xl font-black text-indigo-600 uppercase tracking-tighter italic">{label}</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Level Up Your Mind!</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const ClassroomSetupView = ({ onStart, onCancel }: { onStart: (groups: Group[]) => void, onCancel: () => void }) => {
  const [groups, setGroups] = useState<Group[]>([
    { id: '1', name: 'Alpha Squad', score: 0, members: [] },
    { id: '2', name: 'Beta Brains', score: 0, members: [] },
    { id: '3', name: 'Gamma Giants', score: 0, members: [] },
    { id: '4', name: 'Delta Dynamos', score: 0, members: [] },
  ]);

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
      <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-5">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Group Configuration</h3>
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
               className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg hover:bg-indigo-100 transition-colors uppercase"
             >
               Upload Accessions
             </button>
             <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">{groups.length}/5</span>
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
                  className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 text-sm font-bold" 
                  placeholder={`Group ${group.id} Name`}
                />
                <div className="flex gap-1">
                  {Object.values(DifficultyLevel).map(level => (
                    <button
                      key={level}
                      onClick={() => updateGroupDifficulty(group.id, level)}
                      className={`flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase border transition-all ${
                        (group.difficulty || DifficultyLevel.DEFAULT) === level 
                          ? 'bg-indigo-600 text-white border-indigo-600' 
                          : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-100'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => removeGroup(group.id)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors self-start mt-1"
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
            className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 text-[10px] font-black uppercase hover:border-indigo-200 hover:text-indigo-400 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Group
          </button>
        )}
      </div>

      <div className="grid gap-3">
        <Button onClick={() => onStart(groups)} className="h-16 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 flex-1">
          Start Classroom Battle
        </Button>
        <Button onClick={onCancel} variant="outline" className="h-14 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] border-slate-200 bg-white">
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
        <h2 className="text-2xl font-black text-slate-800 tracking-tighter">My Progress</h2>
        <Button onClick={onBack} variant="outline" className="h-8 px-4 w-auto text-[10px] font-black uppercase tracking-widest">Back</Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-indigo-600 p-5 rounded-[2rem] text-white shadow-lg shadow-indigo-100">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Total Points</p>
          <p className="text-2xl font-black tracking-tighter">{user.totalPoints?.toLocaleString() || 0}</p>
        </div>
        <div className="bg-emerald-500 p-5 rounded-[2rem] text-white shadow-lg shadow-emerald-100">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Current Level</p>
          <p className="text-2xl font-black tracking-tighter">{user.level}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm flex-1 overflow-y-auto no-scrollbar">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <History className="w-4 h-4" /> Test History
        </h3>
        
        {history.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
              <History className="w-8 h-8 text-slate-200" />
            </div>
            <p className="text-xs font-bold text-slate-400">No tests taken yet. Start learning!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((record, i) => (
              <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-widest ${
                      record.type === 'classroom' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {record.type}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400">
                      {new Date(record.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[13px] font-black text-slate-800 leading-tight">{record.topic}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{record.subject}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-slate-800 tracking-tighter">{record.score}/{record.total}</div>
                  <div className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
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
        <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Admin Dashboard</h2>
        <Button onClick={onBack} variant="outline" className="h-8 px-4 rounded-xl font-black uppercase tracking-widest text-[10px] border-slate-200 bg-white">
          Back
        </Button>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex-1 overflow-y-auto">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <UserIcon className="w-4 h-4" /> Registered Users ({users.length})
        </h3>
        
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="text-red-500 text-xs font-bold text-center py-10 bg-red-50 rounded-xl">{error}</div>
        ) : users.length === 0 ? (
          <div className="text-slate-400 text-xs font-bold text-center py-10">No users found.</div>
        ) : (
          <div className="space-y-3">
            {users.map(u => (
              <div key={u.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                <div>
                  <div className="font-black text-slate-800 text-sm flex items-center gap-2">
                    {u.name || 'Anonymous'}
                    {u.role === 'admin' && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase tracking-widest">Admin</span>}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">
                    Grade {u.gradeLevel} • Level {u.level} • {u.totalPoints || 0} pts
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Quizzes: {u.totalQuizzes || 0}</div>
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
  const [totalPoints, setTotalPoints] = useState<number>(() => Number(localStorage.getItem('se_pts') || 0));
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.LOADING);
  
  // Progress Map: key = "Subject-Grade", value = Level
  const [progressMap, setProgressMap] = useState<Record<string, number>>(() => {
    return JSON.parse(localStorage.getItem('se_progress') || '{}');
  });

  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('se_user');
    return saved ? JSON.parse(saved) : {
      name: '', gradeLevel: '10', subject: '', focus: StudyFocus.SYLLABUS, topic: '',
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setAuthUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUser({
              name: data.name || currentUser.displayName || 'Scholar',
              gradeLevel: data.gradeLevel || '10',
              subject: data.subject || '',
              focus: data.focus || StudyFocus.SYLLABUS,
              topic: data.topic || '',
              level: data.level || 1,
              totalQuizzes: data.totalQuizzes || 0,
              totalPoints: data.totalPoints || 0,
              testHistory: data.testHistory || [],
              role: data.role || (currentUser.email === 'alsamy36@gmail.com' ? 'admin' : 'user')
            });
            setTotalPoints(data.totalPoints || 0);
            if (data.progressMap) {
              setProgressMap(data.progressMap);
            }
          } else {
            // Create new user profile
            const newUser: UserProfile = {
              name: currentUser.displayName || 'Scholar',
              gradeLevel: '10',
              subject: '',
              focus: StudyFocus.SYLLABUS,
              topic: '',
              level: 1,
              totalQuizzes: 0,
              totalPoints: 0,
              progressMap: {},
              testHistory: [],
              role: (currentUser.email === 'alsamy36@gmail.com' ? 'admin' : 'user') as 'admin' | 'user'
            };
            await setDoc(docRef, { ...newUser, uid: currentUser.uid });
            setUser(newUser);
          }
          setCurrentScreen(AppScreen.ENTRY);
        } catch (err: any) {
          console.error("Auth state change error:", err);
          setError(`Profile error: ${err.message || "Could not load or create profile."}`);
          setCurrentScreen(AppScreen.SIGN_IN);
          // Don't throw here to avoid breaking the listener, but log it
          try {
            handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
          } catch (e) {
            // handleFirestoreError throws, we just want it to log
          }
        }
      } else {
        setCurrentScreen(AppScreen.SIGN_IN);
      }
    });
    return () => unsubscribe();
  }, []);

  const saveProgressToCloud = async (newPoints: number, newMap: Record<string, number>, newLevel: number, newHistory?: TestRecord[]) => {
    if (!authUser) return;
    try {
      const docRef = doc(db, 'users', authUser.uid);
      await updateDoc(docRef, {
        totalPoints: newPoints,
        progressMap: newMap,
        level: newLevel,
        testHistory: newHistory || user.testHistory || [],
        subject: user.subject,
        gradeLevel: user.gradeLevel,
        topic: user.topic
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${authUser.uid}`);
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
          startClassroomSession(pendingAction.data);
        }
        setPendingAction(null);
      }
    }
  };

  useEffect(() => {
    localStorage.setItem('se_pts', totalPoints.toString());
    localStorage.setItem('se_user', JSON.stringify(user));
  }, [totalPoints, user]);

  useEffect(() => {
    localStorage.setItem('se_progress', JSON.stringify(progressMap));
  }, [progressMap]);

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

  const startBatch = async (mockMode: boolean = false) => {
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
      const questions = await generateQuizQuestions(user, mockMode);
      setActiveQuiz({ profile: user, questions, userAnswers: [], score: 0 });
      setCurrentIndex(0);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("Your API key session has expired or is invalid. Please re-select your key.");
      } else {
        setError("Unable to generate batch. Please try again.");
      }
      setCurrentScreen(AppScreen.ENTRY);
    }
  };

  const startClassroomSetup = () => {
    if (!user.subject || !user.topic) {
      setError("Subject and Specific Topic are required for Classroom Mode.");
      return;
    }
    setError(null);
    setCurrentScreen(AppScreen.CLASSROOM_SETUP);
  };

  const startClassroomSession = async (groups: Group[]) => {
    if (!hasApiKey && !hasGroqKey) {
      setPendingAction({ type: 'classroom', data: groups });
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
        topic: user.topic,
        isStarted: true
      };

      // Generate questions for the first group immediately
      const questions = await generateQuizQuestions(user, false, groups[0].name, user.topic, groups[0].difficulty);
      const quiz: QuizSession = { profile: user, questions, userAnswers: [], score: 0 };
      
      setGroupQuizzes({ [groups[0].id]: quiz });
      setActiveQuiz(quiz);
      setClassroomSession(session);
      setCurrentIndex(0);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err: any) {
      console.error("Classroom Start Error:", err);
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("Your API key session has expired or is invalid. Please re-select your key.");
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
      const quiz: QuizSession = { profile: user, questions, userAnswers: [], score: 0 };
      
      setGroupQuizzes(prev => ({ ...prev, [classroomSession.groups[nextIdx].id]: quiz }));
      setActiveQuiz(quiz);
      setClassroomSession({ ...classroomSession, currentGroupIndex: nextIdx });
      setCurrentIndex(0);
      setFeedback(null);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err: any) {
      console.error("Next Group Error:", err);
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("Your API key session has expired or is invalid. Please re-select your key.");
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
    } else if (activeQuiz) {
      finishBatch();
    }
  };

  const finishBatch = () => {
    if (!activeQuiz) return;
    
    const newRecord: TestRecord = {
      topic: user.topic || 'General Quiz',
      score: activeQuiz.score,
      total: activeQuiz.questions.length,
      date: new Date().toISOString(),
      type: isClassroomMode ? 'classroom' : 'individual',
      subject: user.subject
    };

    const newHistory = [newRecord, ...(user.testHistory || [])].slice(0, 50); // Keep last 50

    if (isClassroomMode && classroomSession) {
      const currentGroup = classroomSession.groups[classroomSession.currentGroupIndex];
      currentGroup.score += activeQuiz.score;
      
      if (authUser) {
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

    if (authUser) {
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
          case QuestionType.CASE_STUDY: return <span className="text-[9px] font-black px-2 py-1 bg-purple-100 text-purple-700 rounded uppercase tracking-tighter flex items-center gap-1"><BookOpen className="w-3 h-3" /> Case Study</span>;
          case QuestionType.VISUAL_ANALYSIS: return <span className="text-[9px] font-black px-2 py-1 bg-blue-100 text-blue-700 rounded uppercase tracking-tighter flex items-center gap-1"><Eye className="w-3 h-3" /> Visual Analysis</span>;
          case QuestionType.WORD_PROBLEM: return <span className="text-[9px] font-black px-2 py-1 bg-amber-100 text-amber-700 rounded uppercase tracking-tighter flex items-center gap-1"><Calculator className="w-3 h-3" /> Word Problem</span>;
          default: return null;
      }
  };

  return (
    <div className="h-screen bg-slate-50 flex font-sans overflow-hidden selection:bg-indigo-100 selection:text-indigo-700">
      <MotivationalPopup show={showMotivation} label={activeQuiz?.score === 5 ? "Perfect Batch!" : "Brilliant!"} />
      
      {/* Sidebar for Desktop */}
      {authUser && currentScreen !== AppScreen.SIGN_IN && currentScreen !== AppScreen.QUIZ && currentScreen !== AppScreen.LOADING && (
        <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 p-6 z-20">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter text-slate-800 leading-none">ScholarEarn</h1>
              <p className="text-[8px] font-black text-indigo-600 uppercase tracking-[0.2em]">AI Academic Hub</p>
            </div>
          </div>

          <nav className="flex-1 space-y-2">
            <button 
              onClick={() => setCurrentScreen(AppScreen.ENTRY)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black transition-all ${currentScreen === AppScreen.ENTRY ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Home className="w-5 h-5" />
              Home
            </button>
            <button 
              onClick={() => setCurrentScreen(AppScreen.PROGRESS)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black transition-all ${currentScreen === AppScreen.PROGRESS ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <History className="w-5 h-5" />
              My Progress
            </button>
            {user.role === 'admin' && (
              <button 
                onClick={() => setCurrentScreen(AppScreen.ADMIN_DASHBOARD)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black transition-all ${currentScreen === AppScreen.ADMIN_DASHBOARD ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutDashboard className="w-5 h-5" />
                Admin
              </button>
            )}
          </nav>

          <div className="pt-6 border-t border-slate-100 space-y-4">
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="font-black text-slate-800 text-sm">{totalPoints.toLocaleString()}</span>
              </div>
              <span className="text-[10px] font-black text-amber-600 uppercase">Points</span>
            </div>
            <button 
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden">
        <header className="p-5 bg-white border-b flex justify-between items-center z-10 shadow-sm lg:hidden">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter text-slate-800">ScholarEarn</h1>
              <p className="text-[8px] font-black text-indigo-600 uppercase tracking-[0.2em] -mt-1">AI Academic Hub</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 flex items-center gap-1.5">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="font-black text-slate-800 text-xs">{totalPoints.toLocaleString()}</span>
            </div>
            {isAuthReady && authUser && (
              <button 
                onClick={() => setCurrentScreen(AppScreen.PROGRESS)} 
                className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors"
              >
                <History className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative bg-slate-50/50 scroll-smooth">
          <div className="max-w-6xl mx-auto w-full h-full lg:px-12 xl:px-20">
            <div className="max-w-2xl mx-auto lg:max-w-none h-full py-6 lg:py-10">
              {currentScreen === AppScreen.ADMIN_DASHBOARD && (
                <AdminDashboard onBack={() => setCurrentScreen(AppScreen.ENTRY)} />
              )}

              {currentScreen === AppScreen.PROGRESS && (
                <ProgressScreen user={user} onBack={() => setCurrentScreen(AppScreen.ENTRY)} />
              )}

        {currentScreen === AppScreen.SIGN_IN && (
          <div className="p-6 h-full flex flex-col items-center justify-center text-center space-y-6 animate-fade-in">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl space-y-6 w-full max-w-sm">
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="flex justify-center"
              >
                <GraduationCap className="w-20 h-20 text-indigo-600" />
              </motion.div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Welcome to ScholarEarn</h2>
                <p className="text-xs text-slate-500 font-bold leading-relaxed">
                  Sign in to save your progress, earn badges, and compete in classroom battles!
                </p>
              </div>
              <Button 
                onClick={async () => {
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
                className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-100 flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google
              </Button>
              {error && <p className="text-red-500 text-[10px] font-bold">{error}</p>}
            </div>
          </div>
        )}

        {currentScreen === AppScreen.API_KEY_REQUIRED && (
          <div className="p-6 h-full flex flex-col items-center justify-center text-center space-y-6 animate-fade-in">
            <div className="bg-amber-50 p-8 rounded-[2rem] border-2 border-amber-200 space-y-4">
              <div className="flex justify-center">
                <Key className="w-16 h-16 text-amber-500" />
              </div>
              <h2 className="text-xl font-black text-slate-800">API Key Required</h2>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                To use the AI models, you need to select your own API key. We support both <span className="text-indigo-600 font-bold">Gemini</span> and <span className="text-orange-600 font-bold">Groq</span>.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <a 
                  href="https://ai.google.dev/gemini-api/docs/billing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] text-indigo-500 underline font-bold block"
                >
                  Get Gemini API Key
                </a>
                <a 
                  href="https://console.groq.com/keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] text-orange-500 underline font-bold block"
                >
                  Get Groq API Key
                </a>
              </div>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <Button onClick={handleSelectKey} className="w-full h-16 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100">
                Select Gemini Key
              </Button>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Or use Groq (Developer Only)</div>
              <p className="text-[9px] text-slate-400 px-4">
                Note: Groq key must currently be set in the project environment variables (GROQ_API_KEY).
              </p>
              <Button onClick={() => setCurrentScreen(AppScreen.ENTRY)} variant="outline" className="h-14 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] border-slate-200 bg-white">
                Back to Enrollment
              </Button>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.ENTRY && (
          <div className="p-6 space-y-6 animate-fade-in pb-10">
            <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                 <School className="w-32 h-32" />
               </div>
               <div className="relative z-10">
                 <h2 className="text-3xl font-black italic tracking-tighter">{isClassroomMode ? "Classroom Battle" : "Your Path"}</h2>
                 <p className="text-indigo-100 text-xs opacity-90 font-bold mt-1 max-w-[80%]">
                   {isClassroomMode ? "Engage your students with AI-powered group challenges." : "Personalized for you. Resume your journey or take a mock exam."}
                 </p>
               </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-5">
               <div className="flex bg-slate-100 p-1 rounded-2xl">
                  <button onClick={() => setIsClassroomMode(false)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${!isClassroomMode ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Individual</button>
                  <button onClick={() => setIsClassroomMode(true)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${isClassroomMode ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Classroom</button>
               </div>

               <div className="space-y-4">
                  {!isClassroomMode && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Identity</label>
                      <input type="text" value={user.name} onChange={e => setUser({...user, name: e.target.value})} className="input-field w-full px-4 py-4 rounded-2xl bg-slate-50 text-sm font-bold" placeholder="Your Name" />
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Grade</label>
                      <select value={user.gradeLevel} onChange={e => setUser({...user, gradeLevel: e.target.value})} className="input-field w-full px-4 py-4 rounded-2xl bg-slate-50 text-sm font-bold appearance-none">
                         <option value="12">12th Grade</option>
                         <option value="11">11th Grade</option>
                         <option value="10">10th Grade</option>
                         {[...Array(9)].map((_, i) => <option key={9-i} value={9-i}>Grade {9-i}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Subject</label>
                      <input type="text" value={user.subject} onChange={e => setUser({...user, subject: e.target.value})} className="input-field w-full px-4 py-4 rounded-2xl bg-slate-50 text-sm font-bold" placeholder="e.g. Science" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Specific Topic</label>
                    <input type="text" value={user.topic} onChange={e => setUser({...user, topic: e.target.value})} className="input-field w-full px-4 py-4 rounded-2xl bg-slate-50 text-sm font-bold" placeholder="e.g. Photosynthesis" />
                  </div>
               </div>

               {/* Level Indicator */}
               {!isClassroomMode && user.subject && (
                 <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between animate-fade-in">
                    <div>
                      <p className="text-[10px] font-black text-indigo-400 uppercase">Current Progress</p>
                      <p className="text-xl font-black text-indigo-700">Level {user.level}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[9px] font-bold text-indigo-400">Next Batch</p>
                       <span className="text-xs font-bold text-indigo-600">5 Questions</span>
                    </div>
                 </div>
               )}

               {isBoardGrade && (
                 <div className="space-y-2 pt-2 border-t animate-fade-in">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Focus Area</label>
                    <div className="grid grid-cols-3 gap-2">
                       {Object.values(StudyFocus).map(f => (
                         <button key={f} onClick={() => setUser({...user, focus: f})} className={`py-3 rounded-xl text-[9px] font-black uppercase border transition-all ${user.focus === f ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{f}</button>
                       ))}
                    </div>
                 </div>
               )}
            </div>

            <div className="grid gap-3">
              {!isClassroomMode ? (
                <>
                  <Button onClick={() => startBatch(false)} className="h-16 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 flex-1">
                    {user.level > 1 ? `Resume Level ${user.level}` : 'Start Level 1 Batch'}
                  </Button>
                  <Button onClick={() => startBatch(true)} variant="outline" className="h-14 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] border-slate-200 bg-white">
                    Practice Mock Exam
                  </Button>
                </>
              ) : (
                <Button onClick={startClassroomSetup} className="h-16 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 flex-1">
                  Setup Classroom Battle
                </Button>
              )}
            </div>
            
            {error && <p className="text-center text-red-500 text-[10px] font-black uppercase bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}

          <div className="bg-slate-100/50 p-4 rounded-2xl flex flex-col items-center text-center space-y-2">
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Feedback & Support</p>
                  <p className="text-[10px] font-bold text-slate-500">Have suggestions? We'd love to hear from you!</p>
                </div>
                <div className="flex items-center gap-2">
                  <a 
                    href="mailto:alsamy36@gmail.com" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[11px] font-black text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1"
                  >
                    <Mail className="w-3 h-3" /> alsamy36@gmail.com
                  </a>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText('alsamy36@gmail.com');
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="text-[9px] font-black text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors uppercase flex items-center gap-1"
                  >
                    {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
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
               <div className="w-20 h-20 border-8 border-slate-100 rounded-full"></div>
               <div className="w-20 h-20 border-8 border-indigo-600 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
             </div>
             <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-800 italic">"{loadingMsg}"</h3>
                {!isAuthReady ? (
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    Connecting to Cloud...
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {isMockMode ? "Randomizing Questions..." : `Preparing Level ${user.level} Challenge`}
                  </p>
                )}
             </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && currentQ && (
          <div className="p-6 space-y-6 animate-fade-in pb-20">
             {/* Progress Bar */}
             <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${((currentIndex + 1) / 5) * 100}%` }}></div>
             </div>

             <div className="flex justify-between items-end bg-white p-5 rounded-3xl border shadow-sm">
                <div>
                   {isClassroomMode && classroomSession && (
                     <p className="text-[10px] font-black text-indigo-600 uppercase mb-1">
                       Group: {classroomSession.groups[classroomSession.currentGroupIndex].name}
                     </p>
                   )}
                   <p className="text-[10px] font-black text-indigo-600 uppercase mb-1">{isMockMode ? "Mock Mode" : `Level ${user.level}`}</p>
                   <p className="text-3xl font-black tabular-nums">{currentIndex + 1}<span className="text-slate-200 text-xl font-medium">/5</span></p>
                </div>
                <div className="flex flex-col items-end gap-1">
                   {renderQuestionLabel(currentQ.type)}
                   <span className="text-[8px] font-bold text-slate-400 uppercase italic">Subject: {user.subject}</span>
                </div>
             </div>

             {/* Case Study / Context Box */}
             {currentQ.contextMaterial && (
               <div className={`p-6 rounded-[2rem] border-2 relative overflow-hidden animate-fade-in ${currentQ.type === QuestionType.VISUAL_ANALYSIS ? 'bg-blue-50 border-blue-100' : 'bg-purple-50 border-purple-100'}`}>
                  <div className="flex items-center gap-2 mb-2 opacity-70">
                    {currentQ.type === QuestionType.VISUAL_ANALYSIS ? <Eye className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      {currentQ.type === QuestionType.VISUAL_ANALYSIS ? 'Visual Context' : 'Read Case Study'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 font-medium leading-relaxed italic">
                    {currentQ.contextMaterial}
                  </p>
               </div>
             )}

             <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-2 h-full ${currentQ.type === QuestionType.WORD_PROBLEM ? 'bg-amber-500' : 'bg-indigo-600'}`}></div>
                <h2 className="text-lg font-bold text-slate-900 leading-snug">{currentQ.text}</h2>
             </div>

             <div className="grid gap-3">
                {currentQ.options.map((opt, i) => {
                  let style = "bg-white border-slate-100 text-slate-600 hover:border-indigo-200";
                  if (feedback) {
                    if (i === currentQ.correctIndex) style = "bg-emerald-50 border-emerald-500 text-emerald-700 ring-4 ring-emerald-100";
                    else if (i === feedback.selected && !feedback.isCorrect) style = "bg-red-50 border-red-500 text-red-700 ring-4 ring-red-100";
                    else style = "opacity-40 grayscale pointer-events-none";
                  }
                  return (
                    <button key={i} disabled={!!feedback} onClick={() => handleMCQ(i)} className={`w-full p-5 text-left rounded-[1.5rem] border-2 transition-all flex items-center gap-5 ${style} active:scale-95`}>
                       <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black flex-none ${feedback && i === currentQ.correctIndex ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{String.fromCharCode(65 + i)}</span>
                       <span className="text-sm font-bold leading-tight">{opt}</span>
                    </button>
                  );
                })}
             </div>

             {feedback && (
               <div className="p-6 bg-slate-50 rounded-[2rem] border-2 border-slate-200 animate-fade-in space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                     <p className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">Feedback</p>
                  </div>
                  <p className="text-xs font-bold text-slate-600 leading-relaxed italic">{currentQ.explanation}</p>
                  {!feedback.isCorrect && (
                    <Button onClick={nextQuestion} className="h-12 rounded-xl font-black uppercase text-[10px]">Next</Button>
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
                    <Rocket className="w-20 h-20 text-indigo-600" />
                  ) : (
                    <Shield className="w-20 h-20 text-slate-400" />
                  )}
                </div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Batch Complete</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isMockMode ? "Mock Exam" : `Level ${user.level} Progress`}</p>
             </div>

             <div className="bg-white p-8 rounded-[3rem] shadow-xl border relative overflow-hidden">
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 bg-indigo-50 rounded-3xl">
                      <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">Score</p>
                      <p className="text-4xl font-black text-indigo-600">{activeQuiz.score}<span className="text-xl text-indigo-300">/5</span></p>
                   </div>
                   <div className="p-4 bg-amber-50 rounded-3xl">
                      <p className="text-[10px] font-black text-amber-400 uppercase mb-1">Earned</p>
                      <p className="text-4xl font-black text-amber-500">+{activeQuiz.score * 10}</p>
                   </div>
                </div>
                {!isMockMode && activeQuiz.score >= 3 && (
                   <div className="mt-6 p-3 bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest animate-pulse">
                     Level Up Unlocked!
                   </div>
                )}
             </div>

             <div className="grid grid-cols-1 gap-3">
                {isClassroomMode ? (
                  <Button onClick={nextGroup} className="h-16 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-200">
                    {classroomSession && classroomSession.currentGroupIndex < classroomSession.groups.length - 1 ? "Next Group Turn" : "View Final Leaderboard"}
                  </Button>
                ) : (
                  <Button onClick={() => startBatch(isMockMode)} className="h-16 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-200">
                    {isMockMode ? "New Mock Exam" : activeQuiz.score >= 3 ? `Start Level ${user.level}` : "Retry Batch"}
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={downloadBadge} variant="secondary" className="h-14 rounded-2xl font-black uppercase text-[10px]">Save Badge</Button>
                  <Button onClick={() => {
                    setCurrentScreen(AppScreen.ENTRY);
                    setIsClassroomMode(false);
                    setClassroomSession(null);
                  }} variant="outline" className="h-14 rounded-2xl font-black uppercase text-[10px]">Exit</Button>
                </div>
             </div>
             
             <canvas ref={badgeCanvasRef} width="400" height="400" className="hidden"></canvas>
          </div>
        )}

        {currentScreen === AppScreen.LEADERBOARD && classroomSession && (
          <div className="p-8 space-y-8 animate-fade-in pb-20">
             <div className="text-center space-y-2">
                <div className="flex justify-center mb-4">
                  <Trophy className="w-24 h-24 text-amber-500" />
                </div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Classroom Excellence</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Final Group Rankings</p>
             </div>

             <div className="space-y-3">
                {[...classroomSession.groups].sort((a, b) => b.score - a.score).map((group, idx) => (
                  <div key={group.id} className={`p-6 rounded-[2rem] border-2 flex items-center justify-between ${idx === 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
                     <div className="flex items-center gap-4">
                        <span className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${idx === 0 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          {idx + 1}
                        </span>
                        <div>
                           <p className="text-sm font-black text-slate-800">{group.name}</p>
                           <p className="text-[9px] font-bold text-slate-400 uppercase">Group ID: {group.id}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-2xl font-black text-indigo-600">{group.score}<span className="text-xs text-indigo-300 ml-1">PTS</span></p>
                     </div>
                  </div>
                ))}
             </div>

             <Button onClick={() => {
               setCurrentScreen(AppScreen.ENTRY);
               setIsClassroomMode(false);
               setClassroomSession(null);
             }} className="h-16 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-200 w-full">
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
  );
}