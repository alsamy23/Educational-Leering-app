import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Difficulty, QuizSession, AppScreen, StudyFocus } from './types';
import { generateQuizQuestions, generateSpeech, playAudio } from './services/geminiService';
import { Button } from './components/Button';

export default function App() {
  const [totalPoints, setTotalPoints] = useState<number>(() => Number(localStorage.getItem('se_pts') || 0));
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ENTRY);
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('se_user');
    return saved ? JSON.parse(saved) : {
      name: '', gradeLevel: '10', subject: '', focus: StudyFocus.SYLLABUS, topic: '',
      difficulty: Difficulty.MEDIUM, totalQuizzes: 0
    };
  });

  const [error, setError] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ selected: number; isCorrect: boolean } | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Initializing AI Proctor...");
  const badgeCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    localStorage.setItem('se_pts', totalPoints.toString());
    localStorage.setItem('se_user', JSON.stringify(user));
  }, [totalPoints, user]);

  const startQuiz = async () => {
    if (!user.name || !user.subject) {
      setError("Name and Subject are required.");
      return;
    }
    setError(null);
    setCurrentScreen(AppScreen.LOADING);
    setLoadingMsg(`Drafting Grade ${user.gradeLevel} questions...`);
    try {
      const questions = await generateQuizQuestions(user);
      setActiveQuiz({ profile: user, questions, userAnswers: [], score: 0 });
      setCurrentIndex(0);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err: any) {
      setError("AI was unable to generate questions. Please try a different subject.");
      setCurrentScreen(AppScreen.ENTRY);
    }
  };

  const handleMCQ = (idx: number) => {
    if (feedback) return;
    const isCorrect = idx === activeQuiz?.questions[currentIndex].correctIndex;
    setFeedback({ selected: idx, isCorrect });
    if (activeQuiz) {
      if (isCorrect) activeQuiz.score++;
      activeQuiz.userAnswers[currentIndex] = idx;
    }
    if (!isCorrect) {
      generateSpeech(activeQuiz?.questions[currentIndex].explanation || "").then(playAudio);
    } else {
      setTimeout(nextQuestion, 1200);
    }
  };

  const nextQuestion = () => {
    setFeedback(null);
    if (activeQuiz && currentIndex < activeQuiz.questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (activeQuiz) {
      setTotalPoints(p => p + (activeQuiz.score * 100));
      setUser(u => ({ ...u, totalQuizzes: u.totalQuizzes + 1 }));
      setCurrentScreen(AppScreen.RESULTS);
    }
  };

  const downloadBadge = () => {
    if (!badgeCanvasRef.current || !activeQuiz) return;
    const canvas = badgeCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw Badge Background
    ctx.fillStyle = '#4F46E5';
    ctx.fillRect(0, 0, 400, 400);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 15;
    ctx.strokeRect(10, 10, 380, 380);

    // Draw Text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Inter';
    ctx.fillText('CERTIFICATE OF MERIT', 200, 80);
    
    ctx.font = '20px Inter';
    ctx.fillText('Awarded to', 200, 130);
    
    ctx.font = 'bold 32px Inter';
    ctx.fillText(activeQuiz.profile.name, 200, 180);
    
    ctx.font = '18px Inter';
    ctx.fillText(`Grade ${activeQuiz.profile.gradeLevel} | ${activeQuiz.profile.subject}`, 200, 230);
    
    ctx.font = 'bold 48px Inter';
    ctx.fillStyle = '#F59E0B';
    ctx.fillText(`${activeQuiz.score}/5`, 200, 310);
    
    ctx.font = '14px Inter';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('Aced on ScholarEarn AI', 200, 360);

    const link = document.createElement('a');
    link.download = `${activeQuiz.profile.name}_badge.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const shareResult = async () => {
    if (!activeQuiz) return;
    const text = `I scored ${activeQuiz.score}/5 in ${activeQuiz.profile.subject} on ScholarEarn! Aced the AI Exam. 🎓✨`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ScholarEarn Achievement', text, url: window.location.href });
      } catch (e) { /* user cancelled */ }
    } else {
      alert("Copied to clipboard: " + text);
    }
  };

  const isBoardGrade = user.gradeLevel === '10' || user.gradeLevel === '12';
  const currentQ = activeQuiz?.questions[currentIndex];

  return (
    <div className="h-full bg-slate-50 flex flex-col max-w-lg mx-auto border-x border-slate-200 shadow-2xl overflow-hidden font-sans">
      <header className="p-5 bg-white border-b flex justify-between items-center z-10">
        <div onClick={() => setCurrentScreen(AppScreen.ENTRY)} className="cursor-pointer">
           <h1 className="text-xl font-black text-indigo-600 tracking-tighter">ScholarEarn</h1>
           <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Mastery AI</span>
        </div>
        <div className="bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 flex items-center gap-1.5">
          <span className="text-indigo-500 font-bold text-xs">★</span>
          <span className="font-black text-slate-800 text-xs">{totalPoints.toLocaleString()}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        {currentScreen === AppScreen.ENTRY && (
          <div className="p-6 space-y-6 animate-fade-in pb-10">
            <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-xl">
               <h2 className="text-2xl font-black italic">Mock Entrance</h2>
               <p className="text-indigo-100 text-[11px] opacity-80 uppercase font-black mt-1">Grade {user.gradeLevel} Subject Knowledge</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border shadow-sm space-y-5">
               <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Student Name</label>
                    <input type="text" value={user.name} onChange={e => setUser({...user, name: e.target.value})} className="input-field w-full px-4 py-4 rounded-2xl bg-slate-50 text-sm font-bold" placeholder="Enter Full Name" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Grade</label>
                      <select value={user.gradeLevel} onChange={e => setUser({...user, gradeLevel: e.target.value})} className="input-field w-full px-4 py-4 rounded-2xl bg-slate-50 text-sm font-bold appearance-none">
                         <option value="12">12th Board</option>
                         <option value="10">10th Board</option>
                         {[...Array(9)].map((_, i) => <option key={9-i} value={9-i}>Grade {9-i}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Subject</label>
                      <input type="text" value={user.subject} onChange={e => setUser({...user, subject: e.target.value})} className="input-field w-full px-4 py-4 rounded-2xl bg-slate-50 text-sm font-bold" placeholder="e.g. History" />
                    </div>
                  </div>
               </div>

               {isBoardGrade && (
                 <div className="space-y-2 pt-2 border-t animate-fade-in">
                    <label className="text-[10px] font-black text-indigo-600 uppercase ml-1">Board Prep Focus</label>
                    <div className="grid grid-cols-3 gap-2">
                       {Object.values(StudyFocus).map(f => (
                         <button key={f} onClick={() => setUser({...user, focus: f})} className={`py-3 rounded-xl text-[9px] font-black uppercase border transition-all ${user.focus === f ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{f}</button>
                       ))}
                    </div>
                    {user.focus === StudyFocus.TOPICS && (
                      <input type="text" value={user.topic} onChange={e => setUser({...user, topic: e.target.value})} className="input-field w-full px-4 py-3 rounded-xl bg-slate-50 text-xs font-bold mt-2 animate-fade-in" placeholder="Topic Name (e.g. Trigonometry)" />
                    )}
                 </div>
               )}

               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Difficulty</label>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.values(Difficulty).map(d => (
                      <button key={d} onClick={() => setUser({...user, difficulty: d})} className={`py-3 rounded-xl text-[8px] font-black uppercase border transition-all ${user.difficulty === d ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{d}</button>
                    ))}
                  </div>
               </div>
            </div>

            <Button onClick={startQuiz} className="h-16 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-2xl shadow-indigo-100">Generate 5 MCQ Quiz</Button>
            {error && <p className="text-center text-red-500 text-[10px] font-black uppercase bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
          </div>
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-6">
             <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin shadow-lg"></div>
             <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-800 italic">"{loadingMsg}"</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ensuring Board Standard Concepts</p>
             </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && currentQ && (
          <div className="p-6 space-y-6 animate-fade-in">
             <div className="flex justify-between items-end bg-white p-5 rounded-3xl border shadow-sm">
                <div>
                   <p className="text-[10px] font-black text-indigo-600 uppercase mb-1">Knowledge Check</p>
                   <p className="text-3xl font-black tabular-nums">{currentIndex + 1}<span className="text-slate-200 text-xl font-medium">/5</span></p>
                </div>
                <div className="flex flex-col items-end gap-1">
                   <span className="text-[10px] font-black px-3 py-1 bg-amber-50 text-amber-600 rounded-lg uppercase tracking-tighter">{user.difficulty}</span>
                   <span className="text-[8px] font-bold text-slate-400 uppercase italic">Subject: {user.subject}</span>
                </div>
             </div>

             <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>
                <h2 className="text-lg font-bold text-slate-900 leading-snug">{currentQ.text}</h2>
             </div>

             <div className="grid gap-3">
                {currentQ.options.map((opt, i) => {
                  let style = "bg-white border-slate-100 text-slate-600";
                  if (feedback) {
                    if (i === currentQ.correctIndex) style = "bg-emerald-50 border-emerald-500 text-emerald-700 ring-4 ring-emerald-100 scale-105";
                    else if (i === feedback.selected && !feedback.isCorrect) style = "bg-red-50 border-red-500 text-red-700 ring-4 ring-red-100";
                    else style = "opacity-40 grayscale pointer-events-none";
                  }
                  return (
                    <button key={i} disabled={!!feedback} onClick={() => handleMCQ(i)} className={`w-full p-5 text-left rounded-[1.5rem] border-2 transition-all flex items-center gap-5 ${style}`}>
                       <span className={`w-10 h-10 rounded-2xl flex items-center justify-center text-[11px] font-black flex-none shadow-sm ${feedback && i === currentQ.correctIndex ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{String.fromCharCode(65 + i)}</span>
                       <span className="text-sm font-bold leading-tight">{opt}</span>
                    </button>
                  );
                })}
             </div>

             {feedback && (
               <div className="p-7 bg-white rounded-[2.5rem] border-2 shadow-2xl animate-fade-in space-y-4 border-slate-100">
                  <div className="flex justify-between items-center border-b pb-3 border-slate-50">
                     <p className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">Educator's Insight</p>
                     <span className={`text-[10px] font-black uppercase ${feedback.isCorrect ? 'text-emerald-500' : 'text-red-500'}`}>{feedback.isCorrect ? 'Perfect ✨' : 'Needs Review 📚'}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed italic opacity-90">{currentQ.explanation}</p>
                  {!feedback.isCorrect && (
                    <Button onClick={nextQuestion} className="h-14 rounded-2xl font-black uppercase text-[10px] shadow-lg shadow-indigo-100">Next Question</Button>
                  )}
               </div>
             )}
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-8 text-center space-y-8 animate-fade-in">
             <div className="space-y-3">
                <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] mx-auto flex items-center justify-center text-4xl shadow-2xl rotate-3 border-4 border-white">🏆</div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Mock Result</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{activeQuiz.profile.name} | Grade {activeQuiz.profile.gradeLevel}</p>
             </div>

             <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border relative overflow-hidden ring-1 ring-slate-100">
                <div className="absolute top-0 left-0 w-full h-2.5 bg-indigo-600"></div>
                <div className="grid grid-cols-2 gap-8">
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Correct</p>
                      <p className="text-6xl font-black text-indigo-600 tracking-tighter">{activeQuiz.score}<span className="text-slate-200 text-3xl">/5</span></p>
                   </div>
                   <div className="flex flex-col items-center justify-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Batches</p>
                      <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 font-black">+{activeQuiz.score}</div>
                   </div>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-3">
                <Button onClick={downloadBadge} variant="secondary" className="rounded-2xl h-14 uppercase font-black text-[10px] tracking-widest">Download Badge</Button>
                <Button onClick={shareResult} variant="outline" className="rounded-2xl h-14 uppercase font-black text-[10px] tracking-widest">Share Achievement</Button>
             </div>
             
             <Button onClick={() => setCurrentScreen(AppScreen.ENTRY)} className="h-16 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-200">Start New Batch</Button>
             
             {/* Hidden canvas for badge generation */}
             <canvas ref={badgeCanvasRef} width="400" height="400" className="hidden"></canvas>
          </div>
        )}
      </main>
    </div>
  );
}