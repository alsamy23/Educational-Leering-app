import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, QuizSession, AppScreen, StudyFocus, QuestionType, Group, ClassroomSession } from './types';
import { generateQuizQuestions, generateSpeech, playAudio } from './services/geminiService';
import { Button } from './components/Button';

const MotivationalPopup = ({ show, label = "Spectacular!" }: { show: boolean, label?: string }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="animate-scale-up bg-white p-8 rounded-[2rem] shadow-2xl border-4 border-amber-300 flex flex-col items-center transform transition-all rotate-3">
        <div className="text-7xl animate-bounce mb-4 filter drop-shadow-md">🌟</div>
        <h3 className="text-2xl font-black text-indigo-600 uppercase tracking-tighter italic">{label}</h3>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Level Up Your Mind!</p>
      </div>
    </div>
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
              <div className="flex-1 space-y-1">
                <input 
                  type="text" 
                  value={group.name} 
                  onChange={e => updateGroupName(group.id, e.target.value)} 
                  className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 text-sm font-bold" 
                  placeholder={`Group ${group.id} Name`}
                />
              </div>
              <button 
                onClick={() => removeGroup(group.id)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                disabled={groups.length <= 2}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {groups.length < 5 && (
          <button 
            onClick={addGroup}
            className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 text-[10px] font-black uppercase hover:border-indigo-200 hover:text-indigo-400 transition-all"
          >
            + Add Group
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

export default function App() {
  const [totalPoints, setTotalPoints] = useState<number>(() => Number(localStorage.getItem('se_pts') || 0));
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ENTRY);
  
  // Progress Map: key = "Subject-Grade", value = Level
  const [progressMap, setProgressMap] = useState<Record<string, number>>(() => {
    return JSON.parse(localStorage.getItem('se_progress') || '{}');
  });

  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('se_user');
    return saved ? JSON.parse(saved) : {
      name: '', gradeLevel: '10', subject: '', focus: StudyFocus.SYLLABUS, topic: '',
      level: 1, totalQuizzes: 0
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
  const [classroomSession, setClassroomSession] = useState<ClassroomSession | null>(null);
  const [groupQuizzes, setGroupQuizzes] = useState<Record<string, QuizSession>>({});
  const [hasApiKey, setHasApiKey] = useState<boolean>(() => {
    return !!process.env.GEMINI_API_KEY || !!process.env.API_KEY;
  });
  const [pendingAction, setPendingAction] = useState<{ type: 'batch' | 'classroom', data?: any } | null>(null);
  const badgeCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      // If environment key is present, we are good to go
      if (!!process.env.GEMINI_API_KEY || !!process.env.API_KEY) {
        setHasApiKey(true);
        return;
      }

      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
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

    if (!hasApiKey) {
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
    if (!hasApiKey) {
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
      const questions = await generateQuizQuestions(user, false, groups[0].name, user.topic);
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
      const questions = await generateQuizQuestions(user, false, classroomSession.groups[nextIdx].name, user.topic);
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
    
    if (isClassroomMode && classroomSession) {
      const currentGroup = classroomSession.groups[classroomSession.currentGroupIndex];
      currentGroup.score += activeQuiz.score;
      setCurrentScreen(AppScreen.RESULTS);
      return;
    }

    setTotalPoints(p => p + (activeQuiz.score * 100));
    
    // Level Up Logic if not in Mock Mode and score is decent
    if (!isMockMode && activeQuiz.score >= 3) {
      const newLevel = user.level + 1;
      const key = getProgressKey();
      setProgressMap(prev => ({ ...prev, [key]: newLevel }));
      setUser(prev => ({ ...prev, level: newLevel }));
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
          case QuestionType.CASE_STUDY: return <span className="text-[9px] font-black px-2 py-1 bg-purple-100 text-purple-700 rounded uppercase tracking-tighter">Case Study</span>;
          case QuestionType.VISUAL_ANALYSIS: return <span className="text-[9px] font-black px-2 py-1 bg-blue-100 text-blue-700 rounded uppercase tracking-tighter">Visual Analysis</span>;
          case QuestionType.WORD_PROBLEM: return <span className="text-[9px] font-black px-2 py-1 bg-amber-100 text-amber-700 rounded uppercase tracking-tighter">Word Problem</span>;
          default: return null;
      }
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col max-w-lg mx-auto border-x border-slate-200 shadow-2xl overflow-hidden font-sans relative">
      <MotivationalPopup show={showMotivation} label={activeQuiz?.score === 5 ? "Perfect Batch!" : "Brilliant!"} />
      
      <header className="p-5 bg-white border-b flex justify-between items-center z-10 shadow-sm">
        <div onClick={() => setCurrentScreen(AppScreen.ENTRY)} className="cursor-pointer">
           <h1 className="text-lg font-black text-indigo-600 tracking-tighter flex items-center gap-2">
             ScholarEarn
             {isClassroomMode && <span className="text-[8px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-widest">Classroom</span>}
           </h1>
           <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Academic Excellence</span>
        </div>
        <div className="bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 flex items-center gap-1.5">
          <span className="text-amber-500 font-bold text-xs">★</span>
          <span className="font-black text-slate-800 text-xs">{totalPoints.toLocaleString()}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        {currentScreen === AppScreen.API_KEY_REQUIRED && (
          <div className="p-6 h-full flex flex-col items-center justify-center text-center space-y-6 animate-fade-in">
            <div className="bg-amber-50 p-8 rounded-[2rem] border-2 border-amber-200 space-y-4">
              <div className="text-5xl">🔑</div>
              <h2 className="text-xl font-black text-slate-800">API Key Required</h2>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                To use the <span className="text-indigo-600">Gemini 2.5 Flash</span> model, you need to select your own API key from a paid Google Cloud project.
              </p>
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[10px] text-indigo-500 underline font-bold block"
              >
                Learn about billing & API keys
              </a>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <Button onClick={handleSelectKey} className="w-full h-16 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100">
                Select API Key
              </Button>
              <Button onClick={() => setCurrentScreen(AppScreen.ENTRY)} variant="outline" className="h-14 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] border-slate-200 bg-white">
                Back to Enrollment
              </Button>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.ENTRY && (
          <div className="p-6 space-y-6 animate-fade-in pb-10">
            <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl rotate-12">🏫</div>
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
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  {isMockMode ? "Randomizing Questions..." : `Preparing Level ${user.level} Challenge`}
                </p>
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
                    <span className="text-xl">{currentQ.type === QuestionType.VISUAL_ANALYSIS ? '👁️' : '📖'}</span>
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
                <div className="text-6xl mb-4">
                  {activeQuiz.score >= 3 ? "🚀" : "🛡️"}
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
                <div className="text-6xl mb-4">🏆</div>
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
      </main>
    </div>
  );
}