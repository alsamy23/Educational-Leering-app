import React, { useState, useEffect } from 'react';
import { UserProfile, Difficulty, QuizSession, AppScreen } from './types';
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

export default function App() {
  const [totalPoints, setTotalPoints] = useState<number>(() => {
    const saved = localStorage.getItem('scholarEarn_points');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ENTRY);
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('scholarEarn_user');
    return saved ? JSON.parse(saved) : { name: '', school: '', section: '', gradeLevel: '', subject: '', topic: '' };
  });

  const [isListening, setIsListening] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [error, setError] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ selected: number; isCorrect: boolean } | null>(null);

  useEffect(() => {
    localStorage.setItem('scholarEarn_points', totalPoints.toString());
  }, [totalPoints]);

  useEffect(() => {
    localStorage.setItem('scholarEarn_user', JSON.stringify(user));
  }, [user]);

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
    if (!user.name || !user.school || !user.section || !user.gradeLevel || !user.subject || !user.topic) {
      setError("Please complete all fields to identify your academic profile.");
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
      setError(err.message || "Failed to connect to the academic server.");
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
      setTimeout(nextQuestion, 1200);
    }
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
      setCurrentScreen(AppScreen.RESULTS);
    }
  };

  const speak = async (text: string) => {
    try {
      const buffer = await generateSpeech(text);
      await playAudioBuffer(buffer);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col max-w-lg mx-auto border-x border-slate-200 shadow-2xl relative overflow-hidden font-sans">
      <header className="flex-none flex justify-between items-center p-6 bg-white border-b border-slate-200 shadow-sm z-20">
        <div className="flex flex-col">
          <h1 className="text-2xl font-black text-indigo-600 tracking-tight leading-none">ScholarEarn</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 truncate max-w-[150px]">
            {user.school ? `${user.school} • ${user.section}` : 'Student Portal'}
          </p>
        </div>
        <div className="bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100 flex items-center gap-2">
          <span className="text-indigo-600 font-bold">★</span>
          <span className="font-black text-slate-800">{totalPoints.toLocaleString()}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar">
        {currentScreen === AppScreen.ENTRY && (
          <div className="p-8 animate-fade-in space-y-6 pb-24">
            <div className="text-center space-y-1 py-4">
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic">Identify Yourself</h2>
              <p className="text-slate-400 text-sm font-medium">Verify school details to access assessment.</p>
            </div>

            <div className="space-y-4">
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 space-y-5">
                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Enrollment Data</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">School</label>
                      <input type="text" value={user.school} onChange={e => setUser({...user, school: e.target.value})} className="input-field w-full px-5 py-3 rounded-xl bg-slate-50 border-none font-bold text-slate-800" placeholder="e.g. Science HS" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Section</label>
                      <input type="text" value={user.section} onChange={e => setUser({...user, section: e.target.value})} className="input-field w-full px-5 py-3 rounded-xl bg-slate-50 border-none font-bold text-slate-800" placeholder="e.g. 12-B" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Full Student Name</label>
                    <input type="text" value={user.name} onChange={e => setUser({...user, name: e.target.value})} className="input-field w-full px-5 py-3 rounded-xl bg-slate-50 border-none font-bold text-slate-800" placeholder="Your Name" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 space-y-5">
                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest pl-1">Assessment Scope</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Grade</label>
                    <input type="text" value={user.gradeLevel} onChange={e => setUser({...user, gradeLevel: e.target.value})} className="input-field w-full px-5 py-3 rounded-xl bg-slate-50 border-none font-bold text-slate-800" placeholder="Grade 11" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Subject</label>
                    <input type="text" value={user.subject} onChange={e => setUser({...user, subject: e.target.value})} className="input-field w-full px-5 py-3 rounded-xl bg-slate-50 border-none font-bold text-slate-800" placeholder="Physics" />
                  </div>
                </div>
                <div className="space-y-1.5 relative">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Specific Topic</label>
                  <div className="relative">
                    <input type="text" value={user.topic} onChange={e => setUser({...user, topic: e.target.value})} className="input-field w-full pl-5 pr-12 py-3 rounded-xl bg-slate-50 border-none font-bold text-slate-800" placeholder="e.g. Newton's Laws" />
                    <button onClick={startListening} className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-indigo-600 shadow-sm border border-slate-100'}`}><MicIcon /></button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex bg-slate-200/50 p-1.5 rounded-2xl gap-1">
              {Object.values(Difficulty).map(d => (
                <button key={d} onClick={() => setDifficulty(d)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${difficulty === d ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>{d}</button>
              ))}
            </div>

            {error && (
              <div className="p-5 bg-red-50 text-red-600 rounded-[1.5rem] border border-red-100 animate-fade-in text-center">
                 <p className="text-xs font-black uppercase tracking-widest mb-1">Status Error</p>
                 <p className="text-[11px] font-medium leading-relaxed opacity-80">{error}</p>
              </div>
            )}

            <Button onClick={startQuiz} className="rounded-[1.5rem] h-14 text-sm font-black tracking-widest uppercase shadow-xl shadow-indigo-100">Proceed to Exam</Button>
          </div>
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="flex flex-col items-center justify-center h-full space-y-6 animate-fade-in p-12 text-center">
             <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
             <div className="space-y-2">
               <h3 className="text-2xl font-black text-slate-900">Academic Sync</h3>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed">Designing questions for {user.topic}...</p>
             </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && activeQuiz && (
          <div className="p-8 h-full flex flex-col animate-fade-in">
             <div className="flex justify-between items-end mb-8">
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Progress</p>
                   <p className="text-4xl font-black">{currentIndex + 1}<span className="text-slate-300 text-xl font-medium">/{activeQuiz.questions.length}</span></p>
                </div>
                <div className="px-3 py-1 bg-white shadow-sm rounded-lg text-[9px] font-black text-slate-600 uppercase border border-slate-100">{activeQuiz.difficulty}</div>
             </div>

             <div className="flex-1 space-y-6 overflow-y-auto no-scrollbar pb-10">
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold text-slate-800 leading-snug">{activeQuiz.questions[currentIndex].text}</h2>
                </div>

                <div className="grid gap-3">
                  {activeQuiz.questions[currentIndex].options.map((opt, i) => {
                    let style = "bg-white border-slate-200 text-slate-600 hover:border-indigo-400";
                    if (feedback) {
                      if (i === activeQuiz.questions[currentIndex].correctIndex) style = "bg-emerald-50 border-emerald-500 text-emerald-700";
                      else if (i === feedback.selected && !feedback.isCorrect) style = "bg-red-50 border-red-500 text-red-700";
                      else style = "opacity-40 grayscale pointer-events-none";
                    }
                    return (
                      <button key={i} disabled={!!feedback} onClick={() => handleAnswer(i)} className={`w-full p-4 text-left rounded-xl border-2 transition-all font-bold flex items-center gap-4 ${style}`}>
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${feedback && i === activeQuiz.questions[currentIndex].correctIndex ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{String.fromCharCode(65 + i)}</span>
                        <span className="text-sm">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {feedback && (
                  <div className="animate-fade-in space-y-4 pt-4">
                    <div className={`p-6 rounded-[2rem] border-2 ${feedback.isCorrect ? 'bg-emerald-50 border-emerald-200 shadow-emerald-100' : 'bg-indigo-50 border-indigo-200 shadow-indigo-100'} shadow-lg`}>
                      <div className="flex justify-between items-center mb-3">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${feedback.isCorrect ? 'text-emerald-600' : 'text-indigo-600'}`}>Teacher's Insight</p>
                        <button onClick={() => speak(activeQuiz.questions[currentIndex].explanation)} className="text-indigo-600 p-2 hover:bg-indigo-100 rounded-full"><SpeakerIcon /></button>
                      </div>
                      <p className="text-sm font-bold text-slate-800 italic leading-relaxed">{activeQuiz.questions[currentIndex].explanation}</p>
                    </div>
                    {!feedback.isCorrect && (
                      <Button onClick={nextQuestion} className="rounded-xl h-14 shadow-lg">Proceed Next</Button>
                    )}
                  </div>
                )}
             </div>
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-8 pb-32 animate-fade-in space-y-8 text-center">
             <div>
                <div className="w-16 h-16 bg-white rounded-2xl shadow-md mx-auto flex items-center justify-center text-3xl mb-4 border border-slate-100">🎓</div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic">Grade Certified</h2>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1.5">{activeQuiz.profile.school} • {activeQuiz.profile.section}</p>
             </div>

             <div className="bg-white rounded-[2rem] shadow-lg p-8 border border-slate-200">
                <div className="pb-6 mb-6 border-b border-slate-100 text-center">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Final Mark</p>
                   <p className="text-6xl font-black text-indigo-600 tracking-tighter">{Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100)}%</p>
                </div>
                <div className="flex justify-between items-center text-center">
                   <div className="flex-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Points Earned</p>
                      <p className="text-2xl font-black text-amber-500">+{activeQuiz.earnedPoints}★</p>
                   </div>
                   <div className="w-px h-8 bg-slate-100" />
                   <div className="flex-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Correct Answers</p>
                      <p className="text-2xl font-black text-slate-800">{activeQuiz.score}/{activeQuiz.totalQuestions}</p>
                   </div>
                </div>
             </div>

             <Button onClick={() => setCurrentScreen(AppScreen.ENTRY)} className="rounded-[1.5rem] py-5 font-black uppercase tracking-widest shadow-xl shadow-indigo-100">New Assessment</Button>
          </div>
        )}
      </main>
    </div>
  );
}