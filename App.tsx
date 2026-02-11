import React, { useState, useEffect } from 'react';
import { UserProfile, Difficulty, QuizSession, AppScreen, ExamMode, QuestionType, BoardSection } from './types';
import { generateQuizQuestions, generateSpeech, playAudioBuffer, generateQuestionImage } from './services/geminiService';
import { Button } from './components/Button';

const SpeakerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.287a6 6 0 0 1 0 7.427M9.213 17.788l-4.714-4.714H3V10.926h1.5l4.713-4.713v11.575Z" />
  </svg>
);

const ChartBarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V19.875c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
  </svg>
);

const ImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6.75a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6.75v10.5a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>
);

export default function App() {
  const [totalPoints, setTotalPoints] = useState<number>(() => {
    const saved = localStorage.getItem('scholarEarn_points');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ENTRY);
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('scholarEarn_user');
    const defaults: UserProfile = { 
      name: '', 
      school: '',
      section: '',
      board: 'CBSE (National)', 
      gradeLevel: '10', 
      subject: '', 
      topic: '', 
      isFullSyllabus: false,
      totalQuizzes: 0, 
      earnedBadges: [],
      examMode: ExamMode.CBSE_FULL_PATTERN,
      selectedSection: BoardSection.FULL_MOCK
    };
    if (!saved) return defaults;
    try {
      const parsed = JSON.parse(saved);
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });

  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [error, setError] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ selected?: number; isCorrect?: boolean; showModel?: boolean } | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Initializing Examiner AI...");
  const [qImage, setQImage] = useState<string>("");
  const [isImageLoading, setIsImageLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('scholarEarn_points', totalPoints.toString());
    localStorage.setItem('scholarEarn_user', JSON.stringify(user));
  }, [totalPoints, user]);

  useEffect(() => {
    if (currentScreen === AppScreen.LOADING) {
      const messages = [
        "Analyzing board pattern...",
        "Drafting concise questions...",
        "Finalizing JSON structure...",
        "Applying marking logic...",
        "Almost ready..."
      ];
      let msgIdx = 0;
      const interval = setInterval(() => {
        setLoadingMessage(messages[msgIdx % messages.length]);
        setLoadingStep(s => Math.min(s + 20, 100));
        msgIdx++;
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [currentScreen]);

  useEffect(() => {
    if (currentScreen === AppScreen.QUIZ && activeQuiz?.questions[currentIndex]) {
      const q = activeQuiz.questions[currentIndex];
      setQImage("");
      if (q.visualDescription) {
        setIsImageLoading(true);
        generateQuestionImage(q.visualDescription).then(url => {
          setQImage(url);
          setIsImageLoading(false);
        }).catch(() => setIsImageLoading(false));
      }
    }
  }, [currentIndex, currentScreen, activeQuiz]);

  const startQuiz = async () => {
    if (!user.name || !user.subject || (!user.topic && !user.isFullSyllabus)) {
      setError("Please fill in Name, Subject, and Topic.");
      return;
    }
    setError(null);
    setCurrentScreen(AppScreen.LOADING);
    try {
      const questions = await generateQuizQuestions(user, difficulty);
      if (!questions || questions.length === 0) throw new Error("AI returned no results.");
      
      setActiveQuiz({
        profile: user,
        difficulty,
        questions,
        userAnswers: new Array(questions.length).fill(null),
        score: 0,
        totalQuestions: questions.length,
        earnedPoints: 0,
        batchNumber: (user.totalQuizzes || 0) + 1
      });
      setCurrentIndex(0);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err: any) {
      setError(err.message || "Failed to generate board paper.");
      setCurrentScreen(AppScreen.ENTRY);
    }
  };

  const handleMCQ = (idx: number) => {
    if (feedback) return;
    const isCorrect = idx === activeQuiz?.questions[currentIndex].correctIndex;
    setFeedback({ selected: idx, isCorrect });
    if (activeQuiz) {
      const answers = [...activeQuiz.userAnswers];
      answers[currentIndex] = idx;
      setActiveQuiz({ ...activeQuiz, userAnswers: answers, score: isCorrect ? activeQuiz.score + 1 : activeQuiz.score });
    }
    if (isCorrect) setTimeout(nextQuestion, 1500);
  };

  const nextQuestion = () => {
    setFeedback(null);
    if (activeQuiz && currentIndex < activeQuiz.questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (activeQuiz) {
      const earned = (activeQuiz.score || 0) * 100;
      setTotalPoints(p => p + earned);
      setUser(u => ({ ...u, totalQuizzes: (u.totalQuizzes || 0) + 1 }));
      setCurrentScreen(AppScreen.RESULTS);
    }
  };

  const speak = async (txt: string) => {
    try {
      const buf = await generateSpeech(txt);
      await playAudioBuffer(buf);
    } catch (e) { console.error(e); }
  };

  const currentQ = activeQuiz?.questions[currentIndex];
  const isMcqStyle = currentQ && (
    currentQ.type === QuestionType.MCQ || 
    currentQ.type === QuestionType.ASSERTION_REASON || 
    (currentQ.type === QuestionType.CASE_STUDY && currentQ.options && currentQ.options.length > 0)
  );

  return (
    <div className="h-full bg-slate-50 flex flex-col max-w-lg mx-auto border-x border-slate-200 shadow-2xl relative overflow-hidden font-sans">
      
      <header className="flex-none p-5 bg-white border-b border-slate-200 flex justify-between items-center z-20">
        <div onClick={() => setCurrentScreen(AppScreen.ENTRY)} className="cursor-pointer">
           <h1 className="text-xl font-black text-indigo-600 tracking-tighter leading-none">ScholarEarn</h1>
           <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Board Exam Simulator</span>
        </div>
        <div className="bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100 flex items-center gap-1.5 shadow-sm">
          <span className="text-amber-500 font-bold text-xs">★</span>
          <span className="font-black text-slate-800 text-xs">{totalPoints.toLocaleString()}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar">
        {currentScreen === AppScreen.ENTRY && (
          <div className="p-8 space-y-6 animate-fade-in pb-32">
            <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
               <h2 className="text-2xl font-black italic">Mock Board Center</h2>
               <p className="text-indigo-100 text-xs font-medium opacity-90">Enter details to generate your exam paper.</p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-5">
               <div className="space-y-4 pb-2 border-b border-slate-100">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Student Name</label>
                    <input type="text" value={user.name} onChange={e => setUser({...user, name: e.target.value})} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 font-bold text-sm" placeholder="Full Name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">School</label>
                      <input type="text" value={user.school} onChange={e => setUser({...user, school: e.target.value})} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 font-bold text-sm" placeholder="School Name" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Section</label>
                      <input type="text" value={user.section} onChange={e => setUser({...user, section: e.target.value})} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 font-bold text-sm" placeholder="e.g. B" />
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Grade</label>
                    <select value={user.gradeLevel} onChange={e => setUser({...user, gradeLevel: e.target.value})} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 font-bold text-sm appearance-none cursor-pointer">
                       <option value="10">Class 10</option>
                       <option value="12">Class 12</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Subject</label>
                    <input type="text" value={user.subject} onChange={e => setUser({...user, subject: e.target.value})} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 font-bold text-sm" placeholder="e.g. Science" />
                  </div>
               </div>

               <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase">Focus Area</label>
                    <button onClick={() => setUser({...user, isFullSyllabus: !user.isFullSyllabus})} className={`text-[9px] font-black px-2 py-0.5 rounded-md transition-colors ${user.isFullSyllabus ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-400'}`}>Full Syllabus</button>
                  </div>
                  {!user.isFullSyllabus && (
                    <input type="text" value={user.topic} onChange={e => setUser({...user, topic: e.target.value})} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 font-bold text-sm animate-fade-in" placeholder="Chapter Name" />
                  )}
               </div>

               <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Exam Section</label>
                  <select value={user.selectedSection} onChange={e => setUser({...user, selectedSection: e.target.value as BoardSection})} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 font-bold text-sm appearance-none cursor-pointer">
                     {Object.values(BoardSection).map(sec => <option key={sec} value={sec}>{sec}</option>)}
                  </select>
               </div>
            </div>

            <Button onClick={startQuiz} className="h-14 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-200">Start Mock Exam</Button>
            {error && (
              <div className="bg-red-50 p-4 rounded-2xl border border-red-100 space-y-2">
                <p className="text-red-500 text-[10px] font-black uppercase text-center">{error}</p>
                <button onClick={() => {setError(null); setCurrentScreen(AppScreen.ENTRY)}} className="w-full text-[9px] font-bold text-red-400 underline uppercase tracking-widest">Reset & Try Again</button>
              </div>
            )}
          </div>
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-8 animate-fade-in">
             <div className="relative">
               <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center font-black text-indigo-600 text-[10px] tracking-tighter italic">AI</div>
             </div>
             <div className="space-y-4 w-full">
                <div className="space-y-1">
                   <h3 className="text-xl font-black text-slate-900 tracking-tight italic">{loadingMessage}</h3>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">CBSE Standard 2025</p>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                   <div className="h-full bg-indigo-600 rounded-full transition-all duration-700 ease-out shadow-sm shadow-indigo-100" style={{ width: `${loadingStep}%` }}></div>
                </div>
             </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && activeQuiz && currentQ && (
          <div className="p-6 h-full flex flex-col animate-fade-in">
             <div className="flex justify-between items-end mb-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                   <p className="text-[9px] font-black text-indigo-600 uppercase mb-0.5 tracking-widest">Progress</p>
                   <p className="text-3xl font-black tracking-tighter">{currentIndex + 1}<span className="text-slate-300 text-xl font-medium">/{activeQuiz.questions.length}</span></p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                   <span className="text-[9px] font-black px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 uppercase tracking-wider">{currentQ.section || 'Board Pattern'}</span>
                   <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter italic">{currentQ.type}</span>
                </div>
             </div>

             <div className="flex-1 space-y-5 overflow-y-auto no-scrollbar pb-32">
                {currentQ.caseText && (
                  <div className="bg-amber-50 p-6 rounded-[2.5rem] border border-amber-100 shadow-sm animate-fade-in">
                     <div className="flex items-center gap-2 mb-3">
                       <span className="p-1.5 bg-amber-500 rounded-xl text-white scale-75"><ChartBarIcon /></span>
                       <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Case Scenario</p>
                     </div>
                     <p className="text-xs font-bold leading-relaxed text-slate-800 italic">"{currentQ.caseText}"</p>
                  </div>
                )}

                {(isImageLoading || qImage) && (
                  <div className="bg-white p-3 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-3">
                    <div className="flex items-center gap-2 px-1 text-[9px] font-black text-indigo-600 uppercase tracking-widest">
                      <ImageIcon /> Visual Aid
                    </div>
                    {isImageLoading ? (
                      <div className="aspect-video bg-slate-50 animate-pulse rounded-2xl flex items-center justify-center text-[9px] text-slate-300 font-black uppercase tracking-widest italic">Generating Diagram...</div>
                    ) : (
                      <img src={qImage} alt="Visual Aid" className="w-full h-auto rounded-2xl object-contain bg-white max-h-[250px] shadow-sm" />
                    )}
                  </div>
                )}

                <div className="bg-white p-7 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600"></div>
                   {currentQ.boardFavoriteReason && <div className="absolute -top-1 -right-1 px-3 py-1 bg-emerald-500 text-white text-[8px] font-black rounded-bl-2xl shadow-md uppercase tracking-widest">Board Favorite</div>}
                   <h2 className="text-base font-bold text-slate-900 leading-snug tracking-tight">{currentQ.text}</h2>
                </div>

                {isMcqStyle ? (
                  <div className="grid gap-2.5">
                    {currentQ.options?.map((opt, i) => {
                      let style = "bg-white border-slate-200 text-slate-600";
                      if (feedback) {
                        if (i === currentQ.correctIndex) style = "bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-100";
                        else if (i === feedback.selected && !feedback.isCorrect) style = "bg-red-50 border-red-500 text-red-700 ring-2 ring-red-100";
                        else style = "opacity-30 pointer-events-none scale-95";
                      }
                      return (
                        <button key={i} disabled={!!feedback} onClick={() => handleMCQ(i)} className={`w-full p-4 text-left rounded-2xl border transition-all flex items-center gap-4 ${style}`}>
                           <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black flex-none shadow-sm ${feedback && i === currentQ.correctIndex ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-500'}`}>{String.fromCharCode(65 + i)}</span>
                           <span className="text-sm font-bold leading-tight">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-4">
                     {!feedback?.showModel ? (
                       <div className="space-y-4">
                         <div className="p-6 bg-slate-100 rounded-[2.5rem] border border-slate-200 text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">Recall Section</p>
                            <p className="text-xs text-slate-500 font-bold leading-relaxed px-4 italic">Think of your answer points first, then compare with the official marking scheme.</p>
                         </div>
                         <Button onClick={() => setFeedback({ showModel: true })} variant="secondary" className="rounded-2xl h-15 uppercase font-black tracking-widest text-[10px] shadow-lg shadow-emerald-100">Show Model Answer</Button>
                         <button onClick={nextQuestion} className="w-full text-[9px] font-black text-slate-300 uppercase tracking-widest hover:text-indigo-600 transition-colors py-2">Skip Section</button>
                       </div>
                     ) : (
                       <div className="bg-indigo-50 p-6 rounded-[2.5rem] border border-indigo-100 space-y-5 animate-fade-in shadow-xl shadow-indigo-100/50">
                          <div>
                             <p className="text-[9px] font-black text-indigo-600 uppercase mb-2.5 tracking-widest">Examiner's Model Answer</p>
                             <div className="text-xs font-bold leading-relaxed text-slate-700 p-5 bg-white rounded-3xl border border-indigo-100 shadow-sm italic">{currentQ.modelAnswer}</div>
                          </div>
                          {currentQ.markingScheme && (
                            <div className="bg-white/60 p-5 rounded-3xl border border-indigo-100 shadow-sm">
                               <p className="text-[9px] font-black text-indigo-600 uppercase mb-3">Marking Scheme</p>
                               <ul className="text-[10px] font-bold text-slate-600 space-y-2.5">
                                  {currentQ.markingScheme.map((s, idx) => <li key={idx} className="flex gap-2.5 text-indigo-900/80">
                                    <span className="text-indigo-500">✔</span> {s}
                                  </li>)}
                               </ul>
                            </div>
                          )}
                          <Button onClick={nextQuestion} className="rounded-2xl h-12 shadow-md uppercase font-black text-[10px] tracking-widest">Proceed</Button>
                       </div>
                     )}
                  </div>
                )}

                {feedback && (feedback.isCorrect !== undefined || feedback.showModel) && (
                  <div className="animate-fade-in p-6 bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-2xl space-y-5">
                     <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                        <p className="text-[9px] font-black uppercase text-indigo-600 flex items-center gap-2 tracking-widest">Explanation</p>
                        <button onClick={() => speak(currentQ.explanation)} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm active:scale-90"><SpeakerIcon /></button>
                     </div>
                     <p className="text-xs font-bold text-slate-700 leading-relaxed italic pr-4">{currentQ.explanation}</p>
                     {currentQ.boardFavoriteReason && (
                       <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex gap-3 items-center">
                         <span className="text-xl">🎯</span>
                         <div>
                            <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Examiner Tip</p>
                            <p className="text-[10px] font-bold text-emerald-900 leading-snug">{currentQ.boardFavoriteReason}</p>
                         </div>
                       </div>
                     )}
                     {(feedback.isCorrect === false) && (
                       <Button onClick={nextQuestion} className="h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100">Next Question</Button>
                     )}
                  </div>
                )}
             </div>
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-8 text-center space-y-10 animate-fade-in pb-32">
             <div className="space-y-4">
                <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] mx-auto flex items-center justify-center text-4xl shadow-2xl shadow-indigo-200 border-4 border-white rotate-3">🏁</div>
                <div className="space-y-1">
                   <h2 className="text-4xl font-black text-slate-900 tracking-tighter italic">Mock Done</h2>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{user.school} | {user.selectedSection}</p>
                </div>
             </div>

             <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-100 grid grid-cols-2 gap-10 relative overflow-hidden ring-1 ring-slate-100">
                <div className="absolute top-0 left-0 w-full h-2.5 bg-gradient-to-r from-indigo-500 via-emerald-500 to-amber-500"></div>
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Score</p>
                   <p className="text-5xl font-black text-indigo-600 tabular-nums">{activeQuiz.score}<span className="text-slate-200 text-2xl font-black">/</span><span className="text-slate-300 text-xl font-black">{activeQuiz.questions.length}</span></p>
                </div>
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Points</p>
                   <p className="text-5xl font-black text-amber-500 tabular-nums">+{activeQuiz.score * 100}</p>
                </div>
             </div>

             <div className="flex flex-col gap-4">
                <Button onClick={startQuiz} className="h-18 rounded-[2rem] uppercase font-black text-xs tracking-widest shadow-2xl shadow-indigo-200 active:translate-y-1">New Batch</Button>
                <Button onClick={() => setCurrentScreen(AppScreen.ENTRY)} variant="outline" className="h-15 rounded-[2rem] uppercase font-black text-[10px] tracking-widest border-slate-200 text-slate-400">Exit Center</Button>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}