import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Difficulty, QuizSession, AppScreen, INDIAN_BOARDS, BADGES, Badge } from './types';
import { generateQuizQuestions, generateSpeech, playAudioBuffer } from './services/geminiService';
import { Button } from './components/Button';

const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
  </svg>
);

const SpeakerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.287a6 6 0 0 1 0 7.427M9.213 17.788l-4.714-4.714H3V10.926h1.5l4.713-4.713v11.575Z" />
  </svg>
);

const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0-10.628a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5m0 10.628a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5" />
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
    return saved ? JSON.parse(saved) : { name: '', school: '', board: 'CBSE (National)', gradeLevel: '', subject: '', topic: '', totalQuizzes: 0, earnedBadges: [] };
  });

  const [isListening, setIsListening] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [error, setError] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ selected: number; isCorrect: boolean } | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [newlyEarnedBadge, setNewlyEarnedBadge] = useState<Badge | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    localStorage.setItem('scholarEarn_points', totalPoints.toString());
  }, [totalPoints]);

  useEffect(() => {
    localStorage.setItem('scholarEarn_user', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    if (currentScreen === AppScreen.LOADING) {
      const interval = setInterval(() => {
        setLoadingStep(s => (s < 95 ? s + Math.random() * 15 : s));
      }, 400);
      return () => clearInterval(interval);
    } else {
      setLoadingStep(0);
    }
  }, [currentScreen]);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e: any) => setUser(prev => ({ ...prev, topic: e.results[0][0].transcript }));
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const startQuiz = async () => {
    if (!user.name || !user.gradeLevel || !user.subject || !user.topic || !user.board) {
      setError("Please fill in all mandatory fields.");
      return;
    }
    setError(null);
    setCurrentScreen(AppScreen.LOADING);
    try {
      const questions = await generateQuizQuestions(user, difficulty);
      setActiveQuiz({
        profile: user,
        difficulty,
        questions,
        userAnswers: new Array(questions.length).fill(-1),
        score: 0,
        totalQuestions: questions.length,
        earnedPoints: 0
      });
      setCurrentIndex(0);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Let's try again.");
      setCurrentScreen(AppScreen.ENTRY);
    }
  };

  const handleAnswer = (index: number) => {
    if (feedback || !activeQuiz) return;
    const isCorrect = index === activeQuiz.questions[currentIndex].correctIndex;
    setFeedback({ selected: index, isCorrect });
    
    const answers = [...activeQuiz.userAnswers];
    answers[currentIndex] = index;
    setActiveQuiz({ 
      ...activeQuiz, 
      userAnswers: answers, 
      score: isCorrect ? activeQuiz.score + 1 : activeQuiz.score 
    });

    if (isCorrect) {
      setTimeout(nextQuestion, 1500);
    }
  };

  const checkBadges = (score: number, total: number) => {
    const currentEarned = [...user.earnedBadges];
    const newlyWon: string[] = [];
    const percentage = (score / total) * 100;
    
    // Logic for unlocking badges based on MERIT
    if (percentage === 100 && !currentEarned.includes('perfect_10')) newlyWon.push('perfect_10');
    if (user.totalQuizzes + 1 >= 5 && !currentEarned.includes('board_master')) newlyWon.push('board_master');
    if (totalPoints + (score * 10) >= 1000 && !currentEarned.includes('high_roller')) newlyWon.push('high_roller');
    if (user.totalQuizzes === 0 && !currentEarned.includes('first_step')) newlyWon.push('first_step');

    if (newlyWon.length > 0) {
      const badgeData = BADGES.find(b => b.id === newlyWon[0]);
      if (badgeData) setNewlyEarnedBadge(badgeData);
    }

    setUser(prev => ({ 
      ...prev, 
      totalQuizzes: prev.totalQuizzes + 1, 
      earnedBadges: [...prev.earnedBadges, ...newlyWon] 
    }));
  };

  const nextQuestion = () => {
    if (!activeQuiz) return;
    setFeedback(null);
    if (currentIndex < activeQuiz.totalQuestions - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      const earned = activeQuiz.score * 10;
      setTotalPoints(p => p + earned);
      setActiveQuiz({ ...activeQuiz, earnedPoints: earned });
      checkBadges(activeQuiz.score, activeQuiz.totalQuestions);
      setCurrentScreen(AppScreen.RESULTS);
    }
  };

  const generateCertificate = () => {
    const canvas = canvasRef.current;
    if (!canvas || !activeQuiz) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#4F46E5';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(20, 20, 760, 560);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 10;
    ctx.strokeRect(40, 40, 720, 520);

    ctx.fillStyle = '#1E293B';
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px Inter';
    ctx.fillText('CERTIFICATE OF ACHIEVEMENT', 400, 150);
    ctx.font = 'italic 20px Inter';
    ctx.fillText('This is awarded to', 400, 220);
    ctx.font = 'bold 50px Inter';
    ctx.fillStyle = '#4F46E5';
    ctx.fillText(user.name, 400, 300);
    ctx.font = '20px Inter';
    ctx.fillStyle = '#1E293B';
    ctx.fillText(`Scored ${Math.round((activeQuiz.score/activeQuiz.totalQuestions)*100)}% in ${user.topic}`, 400, 360);
    ctx.fillText(`Board: ${user.board}`, 400, 400);
    ctx.font = 'bold 24px Inter';
    ctx.fillStyle = '#F59E0B';
    ctx.fillText('ScholarEarn AI Academy', 400, 500);

    const link = document.createElement('a');
    link.download = `ScholarEarn_Result_${user.name}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const shareBadge = (badge: Badge) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = badge.color;
    ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(200, 200, 180, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.font = '100px Arial';
    ctx.fillText(badge.icon, 200, 180);
    ctx.font = 'bold 30px Inter';
    ctx.fillStyle = '#1E293B';
    ctx.fillText(badge.name, 200, 240);
    ctx.font = '16px Inter';
    ctx.fillStyle = '#64748B';
    ctx.fillText('Earned by ' + user.name, 200, 280);
    ctx.fillText('on ScholarEarn Academy', 200, 310);

    const link = document.createElement('a');
    link.download = `Badge_${badge.name}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const equipBadge = (badgeId: string) => {
    setUser(prev => ({ ...prev, equippedBadgeId: badgeId }));
  };

  const getBadgeIcon = (id?: string) => {
    if (!id) return null;
    return BADGES.find(b => b.id === id)?.icon;
  };

  const speak = async (text: string) => {
    try {
      const buffer = await generateSpeech(text);
      await playAudioBuffer(buffer);
    } catch (e) {
      console.error(e);
    }
  };

  const getProgression = (badgeId: string) => {
    switch (badgeId) {
      case 'board_master': return user.totalQuizzes;
      case 'high_roller': return totalPoints;
      case 'first_step': return user.totalQuizzes > 0 ? 1 : 0;
      default: return 0;
    }
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col max-w-lg mx-auto border-x border-slate-200 shadow-2xl relative overflow-hidden font-sans">
      
      {/* Badge Unlocked Celebration Modal */}
      {newlyEarnedBadge && (
        <div className="absolute inset-0 z-[100] bg-indigo-900/90 flex items-center justify-center p-8 animate-fade-in backdrop-blur-sm">
           <div className="bg-white rounded-[2.5rem] w-full p-8 text-center space-y-6 shadow-2xl scale-up border-4 border-amber-400">
              <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center text-5xl mx-auto shadow-inner">
                {newlyEarnedBadge.icon}
              </div>
              <div className="space-y-2">
                <p className="text-amber-600 font-black uppercase text-xs tracking-widest">New Achievement!</p>
                <h3 className="text-2xl font-black text-slate-900">{newlyEarnedBadge.name}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">{newlyEarnedBadge.description}</p>
              </div>
              <Button onClick={() => setNewlyEarnedBadge(null)} className="h-14 rounded-2xl text-xs font-black uppercase">Awesome!</Button>
           </div>
        </div>
      )}

      <header className="flex-none flex justify-between items-center p-6 bg-white border-b border-slate-200 shadow-sm z-20">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1 onClick={() => setCurrentScreen(AppScreen.ENTRY)} className="text-2xl font-black text-indigo-600 tracking-tight leading-none cursor-pointer">ScholarEarn</h1>
            {user.equippedBadgeId && (
              <span className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-sm shadow-sm border border-white" title="Active Badge">
                {getBadgeIcon(user.equippedBadgeId)}
              </span>
            )}
          </div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 truncate max-w-[150px]">
            {user.name || 'Scholar'} • {user.board.split(' ')[0]}
          </p>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={() => setCurrentScreen(AppScreen.BADGES)} className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center text-lg border border-amber-100 transition-transform active:scale-90">🏅</button>
           <div className="bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 flex items-center gap-1.5">
            <span className="text-indigo-600 font-bold text-xs">★</span>
            <span className="font-black text-slate-800 text-sm">{totalPoints.toLocaleString()}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar bg-slate-50/50">
        {currentScreen === AppScreen.ENTRY && (
          <div className="p-8 animate-fade-in space-y-5 pb-24">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Student Portal</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Merit-Based Learning</p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Name</label>
                <input type="text" value={user.name} onChange={e => setUser({...user, name: e.target.value})} className="input-field w-full px-4 py-2.5 rounded-xl bg-slate-50 font-bold text-slate-800" placeholder="Student Name" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Board</label>
                <select value={user.board} onChange={e => setUser({...user, board: e.target.value})} className="input-field w-full px-4 py-2.5 rounded-xl bg-slate-50 font-bold text-slate-800 appearance-none">
                  {INDIAN_BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={user.gradeLevel} onChange={e => setUser({...user, gradeLevel: e.target.value})} className="input-field w-full px-4 py-2.5 rounded-xl bg-slate-50 font-bold text-slate-800" placeholder="Grade" />
                <input type="text" value={user.subject} onChange={e => setUser({...user, subject: e.target.value})} className="input-field w-full px-4 py-2.5 rounded-xl bg-slate-50 font-bold text-slate-800" placeholder="Subject" />
              </div>
              <div className="relative">
                <input type="text" value={user.topic} onChange={e => setUser({...user, topic: e.target.value})} className="input-field w-full pl-4 pr-10 py-2.5 rounded-xl bg-slate-50 font-bold text-slate-800" placeholder="Specific Topic" />
                <button onClick={startListening} className={`absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-indigo-600'}`}><MicIcon /></button>
              </div>
            </div>

            <div className="flex bg-slate-200/50 p-1.5 rounded-2xl gap-1">
              {Object.values(Difficulty).map(d => (
                <button key={d} onClick={() => setDifficulty(d)} className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${difficulty === d ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>{d}</button>
              ))}
            </div>

            {error && <p className="text-red-500 text-[10px] font-bold text-center">{error}</p>}
            <Button onClick={startQuiz} className="rounded-2xl h-12 text-xs font-black uppercase tracking-widest">Start Assessment</Button>
          </div>
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="flex flex-col items-center justify-center h-full space-y-6 p-12 text-center animate-fade-in">
             <div className="w-full max-w-[200px] h-3 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${loadingStep}%` }}></div>
             </div>
             <div className="space-y-2">
               <h3 className="text-xl font-black text-slate-900 tracking-tight italic">Analyzing Framework...</h3>
               <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Synchronizing board requirements</p>
             </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && activeQuiz && (
          <div className="p-6 h-full flex flex-col animate-fade-in">
             <div className="flex justify-between items-end mb-6">
                <div>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{activeQuiz.profile.topic}</p>
                   <p className="text-3xl font-black">{currentIndex + 1}<span className="text-slate-300 text-lg">/{activeQuiz.questions.length}</span></p>
                </div>
                <div className="text-[10px] font-black px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg">{activeQuiz.difficulty}</div>
             </div>

             <div className="flex-1 space-y-4 overflow-y-auto no-scrollbar pb-10">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h2 className="text-base font-bold text-slate-800 leading-relaxed">{activeQuiz.questions[currentIndex].text}</h2>
                </div>

                <div className="grid gap-2">
                  {activeQuiz.questions[currentIndex].options.map((opt, i) => {
                    let style = "bg-white border-slate-100 text-slate-600";
                    if (feedback) {
                      if (i === activeQuiz.questions[currentIndex].correctIndex) style = "bg-emerald-50 border-emerald-500 text-emerald-700";
                      else if (i === feedback.selected && !feedback.isCorrect) style = "bg-red-50 border-red-500 text-red-700";
                      else style = "opacity-30 pointer-events-none";
                    }
                    return (
                      <button key={i} disabled={!!feedback} onClick={() => handleAnswer(i)} className={`w-full p-3.5 text-left rounded-2xl border-2 transition-all font-bold flex items-center gap-3 ${style}`}>
                        <span className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 flex-none">{String.fromCharCode(65 + i)}</span>
                        <span className="text-sm leading-tight">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {feedback && (
                  <div className="animate-fade-in space-y-3 pt-2">
                    <div className={`p-5 rounded-3xl border-2 ${feedback.isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-indigo-50 border-indigo-200'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <p className={`text-[9px] font-black uppercase ${feedback.isCorrect ? 'text-emerald-600' : 'text-indigo-600'}`}>Syllabus Feedback</p>
                        <button onClick={() => speak(activeQuiz.questions[currentIndex].explanation)} className="p-1.5 hover:bg-white rounded-full"><SpeakerIcon /></button>
                      </div>
                      <p className="text-xs font-bold text-slate-700 italic leading-relaxed">{activeQuiz.questions[currentIndex].explanation}</p>
                    </div>
                    {!feedback.isCorrect && <Button onClick={nextQuestion} className="h-12 rounded-2xl">Continue</Button>}
                  </div>
                )}
             </div>
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-8 pb-32 animate-fade-in space-y-6 text-center">
             <div className="w-20 h-20 bg-white rounded-3xl shadow-xl mx-auto flex items-center justify-center text-4xl border border-slate-100">🎓</div>
             <div>
                <h2 className="text-2xl font-black text-slate-900 italic">Merit Analysis</h2>
                <p className="text-slate-400 text-[9px] font-black uppercase mt-1 tracking-widest">{user.name} • Proficiency: {Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100)}%</p>
             </div>

             <div className="bg-white rounded-[2rem] shadow-lg p-6 border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Accuracy</p>
                <p className="text-5xl font-black text-indigo-600 mb-4">{Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100)}%</p>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-4">
                   <div><p className="text-[9px] font-black text-slate-400 uppercase">Points</p><p className="text-xl font-black text-amber-500">+{activeQuiz.earnedPoints}★</p></div>
                   <div><p className="text-[9px] font-black text-slate-400 uppercase">Correct</p><p className="text-xl font-black text-slate-800">{activeQuiz.score}/{activeQuiz.totalQuestions}</p></div>
                </div>
             </div>

             <div className="flex gap-3">
                <Button onClick={generateCertificate} variant="secondary" className="rounded-xl h-12 text-[10px] font-black uppercase">Download Results</Button>
                <Button onClick={() => setCurrentScreen(AppScreen.ENTRY)} variant="outline" className="rounded-xl h-12 text-[10px] font-black uppercase">Home</Button>
             </div>
             <canvas ref={canvasRef} width="800" height="600" className="hidden" />
          </div>
        )}

        {currentScreen === AppScreen.BADGES && (
          <div className="p-8 animate-fade-in space-y-6">
             <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-900">Trophy Room</h2>
                <button onClick={() => setCurrentScreen(AppScreen.ENTRY)} className="text-[10px] font-black text-indigo-600 uppercase border border-indigo-100 px-3 py-1 rounded-lg">Back</button>
             </div>
             
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                Unlock badges by mastering topics. Once earned, click a badge to "Equip" it to your profile.
             </p>

             <div className="grid grid-cols-2 gap-3 pb-24">
                {BADGES.map(badge => {
                  const isEarned = user.earnedBadges.includes(badge.id);
                  const isEquipped = user.equippedBadgeId === badge.id;
                  const currentVal = getProgression(badge.id);
                  const progressPerc = Math.min((currentVal / badge.maxValue) * 100, 100);

                  return (
                    <div 
                      key={badge.id} 
                      onClick={() => isEarned && equipBadge(badge.id)}
                      className={`p-5 rounded-3xl border-2 text-center relative group transition-all cursor-pointer ${isEarned ? (isEquipped ? 'bg-indigo-50 border-indigo-500 shadow-indigo-100 scale-[1.02]' : 'bg-white border-slate-100 shadow-sm opacity-100') : 'bg-slate-50 border-slate-50 opacity-60'}`}
                    >
                       <div className="text-3xl mb-2">{isEarned ? badge.icon : '🔒'}</div>
                       <p className="text-[10px] font-black uppercase mb-1">{badge.name}</p>
                       <p className="text-[8px] font-medium text-slate-400 mb-3">{isEarned ? badge.description : badge.condition}</p>
                       
                       {!isEarned && (
                         <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-indigo-300" style={{ width: `${progressPerc}%` }}></div>
                         </div>
                       )}

                       {isEarned && (
                         <div className="flex flex-col gap-2 mt-2">
                           <button onClick={(e) => { e.stopPropagation(); shareBadge(badge); }} className="w-full py-1 bg-slate-50 rounded-lg flex items-center justify-center gap-1 text-[8px] font-black text-indigo-600 uppercase border border-indigo-50">
                              <ShareIcon /> Save
                           </button>
                           {isEquipped && <span className="text-[8px] font-black text-indigo-500 uppercase">Equipped</span>}
                         </div>
                       )}
                    </div>
                  );
                })}
             </div>
          </div>
        )}
      </main>
    </div>
  );
}