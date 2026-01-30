import React, { useState, useCallback, useEffect } from 'react';
import { UserProfile, Difficulty, QuizSession, AppScreen } from './types';
import { generateQuizQuestions, generateSpeech, playAudioBuffer } from './services/geminiService';
import { Button } from './components/Button';

const MicIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
  </svg>
);

const SpeakerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.287a6 6 0 0 1 0 7.427M9.213 17.788l-4.714-4.714H3V10.926h1.5l4.713-4.713v11.575Z" />
  </svg>
);

const Header = ({ points, name }: { points: number; name?: string }) => (
  <header className="flex-none flex justify-between items-center p-6 bg-white border-b border-gray-100 z-30">
    <div className="flex flex-col">
      <h1 className="text-2xl font-black text-indigo-600 tracking-tight leading-none">ScholarEarn</h1>
      {name && <span className="text-[10px] font-bold text-gray-400 uppercase mt-1 tracking-widest">Student: {name}</span>}
    </div>
    <div className="bg-amber-50 px-4 py-2 rounded-2xl border border-amber-100 flex items-center gap-2">
      <span className="text-amber-500 font-bold">★</span>
      <span className="font-black text-gray-800">{points.toLocaleString()}</span>
    </div>
  </header>
);

export default function App() {
  const [totalPoints, setTotalPoints] = useState<number>(() => {
    const saved = localStorage.getItem('scholarEarn_points');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ENTRY);
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('scholarEarn_user');
    return saved ? JSON.parse(saved) : { name: '', gradeLevel: '', subject: '', topic: '' };
  });

  const [isListening, setIsListening] = useState(false);
  const [quizDifficulty, setQuizDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isSpeakingExplanation, setIsSpeakingExplanation] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState<{ selected: number; isCorrect: boolean } | null>(null);

  useEffect(() => {
    localStorage.setItem('scholarEarn_points', totalPoints.toString());
  }, [totalPoints]);

  useEffect(() => {
    localStorage.setItem('scholarEarn_user', JSON.stringify(user));
  }, [user]);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setLoadingError("Browser doesn't support speech recognition.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setUser(prev => ({ ...prev, topic: transcript }));
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const startQuiz = async () => {
    if (!user.name || !user.gradeLevel || !user.subject || !user.topic) {
      setLoadingError("Please fill in all details to help the AI tailor your exam.");
      return;
    }

    setLoadingError(null);
    setCurrentScreen(AppScreen.LOADING);

    try {
      const questions = await generateQuizQuestions(user.subject, user.topic, user.gradeLevel, quizDifficulty);
      setActiveQuiz({
        topic: user.topic,
        subject: user.subject,
        difficulty: quizDifficulty,
        questions,
        userAnswers: new Array(questions.length).fill(-1),
        score: 0,
        totalQuestions: questions.length,
        earnedPoints: 0
      });
      setCurrentQuestionIndex(0);
      setShowFeedback(null);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err: any) {
      setLoadingError(err.message);
      setCurrentScreen(AppScreen.ENTRY);
    }
  };

  const handleAnswerSelection = (index: number) => {
    if (showFeedback || !activeQuiz) return;
    const isCorrect = index === activeQuiz.questions[currentQuestionIndex].correctIndex;
    setShowFeedback({ selected: index, isCorrect });

    if (isCorrect) {
      const answers = [...activeQuiz.userAnswers];
      answers[currentQuestionIndex] = index;
      setActiveQuiz({ ...activeQuiz, userAnswers: answers, score: activeQuiz.score + 1 });
      // Correct answers automatically proceed after a small delay
      setTimeout(proceedToNext, 1200);
    } else {
      // Incorrect answers pause for explanation
      const answers = [...activeQuiz.userAnswers];
      answers[currentQuestionIndex] = index;
      setActiveQuiz({ ...activeQuiz, userAnswers: answers });
    }
  };

  const proceedToNext = () => {
    if (!activeQuiz) return;
    setShowFeedback(null);
    if (currentQuestionIndex < activeQuiz.totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      const earned = activeQuiz.score * 10;
      setTotalPoints(prev => prev + earned);
      setActiveQuiz({ ...activeQuiz, earnedPoints: earned });
      setCurrentScreen(AppScreen.RESULTS);
    }
  };

  const handleSpeak = async (text: string, id: number) => {
    setIsSpeakingExplanation(id);
    try {
      const buffer = await generateSpeech(text);
      await playAudioBuffer(buffer);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSpeakingExplanation(null);
    }
  };

  return (
    <div className="h-full bg-white flex flex-col max-w-lg mx-auto border-x border-gray-100 shadow-2xl relative overflow-hidden font-sans">
      <Header points={totalPoints} name={user.name} />

      <main className="flex-1 overflow-y-auto no-scrollbar bg-gray-50/30">
        {currentScreen === AppScreen.ENTRY && (
          <div className="p-8 animate-fade-in space-y-8 pb-24">
            <div className="text-center mt-4">
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter italic">Excel Higher</h2>
              <p className="text-gray-400 text-sm mt-2 font-medium">Personalized academic assessment.</p>
            </div>

            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-5">
              {[
                { label: 'Student Name', field: 'name', placeholder: 'e.g. Maria Clara' },
                { label: 'Grade Level', field: 'gradeLevel', placeholder: 'e.g. Grade 11 / Year 12' },
                { label: 'Subject', field: 'subject', placeholder: 'e.g. Physics / World Literature' },
              ].map((item) => (
                <div key={item.field} className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">{item.label}</label>
                  <input
                    type="text"
                    value={(user as any)[item.field]}
                    onChange={(e) => setUser({ ...user, [item.field]: e.target.value })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-gray-50 border-none focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-gray-800 placeholder:text-gray-300"
                    placeholder={item.placeholder}
                  />
                </div>
              ))}

              <div className="space-y-1.5 relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Specific Topic</label>
                <div className="relative">
                  <input
                    type="text"
                    value={user.topic}
                    onChange={(e) => setUser({ ...user, topic: e.target.value })}
                    className="w-full pl-5 pr-12 py-3.5 rounded-2xl bg-gray-50 border-none focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-gray-800 placeholder:text-gray-300"
                    placeholder="e.g. Quantum Mechanics"
                  />
                  <button
                    onClick={startListening}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                      isListening ? 'bg-red-500 text-white animate-pulse shadow-lg' : 'bg-white text-indigo-600 shadow-sm'
                    }`}
                  >
                    <MicIcon />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex bg-gray-100 p-1.5 rounded-2xl gap-1">
              {Object.values(Difficulty).map(d => (
                <button
                  key={d}
                  onClick={() => setQuizDifficulty(d)}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                    quizDifficulty === d ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {loadingError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-[11px] font-bold border border-red-100 animate-fade-in flex flex-col gap-1">
                 <span>⚠️ Generation Failed</span>
                 <span className="opacity-70 font-medium">{loadingError}</span>
              </div>
            )}

            <Button onClick={startQuiz} className="rounded-[2rem] h-16 text-lg font-black tracking-widest uppercase shadow-2xl shadow-indigo-100">
              Excel in Exam
            </Button>
          </div>
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in">
             <div className="relative">
               <div className="w-16 h-16 border-[6px] border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center">🎓</div>
             </div>
             <div className="text-center">
               <h3 className="text-2xl font-black text-gray-900">Creating Your Challenge</h3>
               <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-2">{user.topic}</p>
             </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && activeQuiz && (
          <div className="p-8 h-full flex flex-col animate-fade-in">
             <div className="flex justify-between items-end mb-8">
                <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mastery Progress</p>
                   <p className="text-4xl font-black">{currentQuestionIndex + 1}<span className="text-gray-200 text-xl">/{activeQuiz.questions.length}</span></p>
                </div>
                <div className="px-3 py-1 bg-indigo-50 rounded-full text-[10px] font-black text-indigo-600 uppercase border border-indigo-100">
                  {activeQuiz.difficulty}
                </div>
             </div>

             <div className="flex-1 space-y-6 overflow-y-auto no-scrollbar">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-indigo-50/50 border border-indigo-50">
                  <h2 className="text-xl font-bold text-gray-800 leading-snug">
                    {activeQuiz.questions[currentQuestionIndex].text}
                  </h2>
                </div>

                <div className="grid gap-3">
                  {activeQuiz.questions[currentQuestionIndex].options.map((opt, i) => {
                    let style = "bg-white border-gray-100 text-gray-600 hover:border-indigo-300";
                    if (showFeedback) {
                      if (i === activeQuiz.questions[currentQuestionIndex].correctIndex) style = "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-emerald-50";
                      else if (i === showFeedback.selected && !showFeedback.isCorrect) style = "bg-red-50 border-red-500 text-red-700";
                      else style = "opacity-40 bg-gray-50 border-transparent grayscale scale-95";
                    }
                    return (
                      <button
                        key={i}
                        disabled={!!showFeedback}
                        onClick={() => handleAnswerSelection(i)}
                        className={`w-full p-5 text-left rounded-2xl border-2 transition-all font-bold flex items-center gap-4 ${style}`}
                      >
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${
                          showFeedback && i === activeQuiz.questions[currentQuestionIndex].correctIndex ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'
                        }`}>{String.fromCharCode(65 + i)}</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {showFeedback && (
                  <div className="animate-fade-in space-y-4 pt-4">
                    <div className={`p-6 rounded-[2rem] border-2 ${showFeedback.isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-indigo-50 border-indigo-100 shadow-xl'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${showFeedback.isCorrect ? 'text-emerald-600' : 'text-indigo-600'}`}>
                          {showFeedback.isCorrect ? 'Excellent Performance' : 'Understand the Concept'}
                        </p>
                        <button onClick={() => handleSpeak(activeQuiz.questions[currentQuestionIndex].explanation, currentQuestionIndex)} className="text-indigo-600 p-2 hover:bg-indigo-100 rounded-full transition-colors">
                           <SpeakerIcon />
                        </button>
                      </div>
                      <p className="text-sm font-bold text-gray-800 italic leading-relaxed">{activeQuiz.questions[currentQuestionIndex].explanation}</p>
                    </div>
                    {!showFeedback.isCorrect && (
                      <Button onClick={proceedToNext} className="rounded-2xl py-5 shadow-indigo-100 shadow-xl">
                        I Understand, Next Question
                      </Button>
                    )}
                  </div>
                )}
             </div>
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-8 pb-32 animate-fade-in">
             <div className="text-center mb-10">
                <div className="w-20 h-20 bg-white rounded-3xl shadow-xl mx-auto flex items-center justify-center text-4xl mb-4 border border-indigo-50">
                  {activeQuiz.score > (activeQuiz.totalQuestions / 2) ? '🎓' : '📖'}
                </div>
                <h2 className="text-4xl font-black text-gray-900 tracking-tighter">Certified Result</h2>
                <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-2">{activeQuiz.subject}: {activeQuiz.topic}</p>
             </div>

             <div className="bg-white rounded-[2.5rem] shadow-xl p-8 mb-8 border border-gray-100">
                <div className="text-center pb-6 mb-6 border-b border-gray-50">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Success Rating</p>
                   <p className="text-7xl font-black text-indigo-600 tracking-tighter">
                     {Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100)}<span className="text-2xl text-indigo-200">%</span>
                   </p>
                </div>
                <div className="flex justify-between items-center text-center">
                   <div className="flex-1">
                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Scholar Points</p>
                      <p className="text-2xl font-black text-amber-500">+{activeQuiz.earnedPoints}</p>
                   </div>
                   <div className="w-px h-10 bg-gray-50" />
                   <div className="flex-1">
                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Questions</p>
                      <p className="text-2xl font-black text-gray-800">{activeQuiz.score}/{activeQuiz.totalQuestions}</p>
                   </div>
                </div>
             </div>

             <div className="space-y-4">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Transcript Review</h3>
                {activeQuiz.questions.map((q, idx) => (
                   <div key={idx} className="bg-white p-5 rounded-3xl border border-gray-50 shadow-sm space-y-3">
                      <div className="flex justify-between items-start gap-4">
                        <p className="font-bold text-sm text-gray-800 leading-snug">{q.text}</p>
                        <button onClick={() => handleSpeak(q.explanation, idx)} className="text-indigo-600 bg-indigo-50 p-2 rounded-xl transition-transform active:scale-90"><SpeakerIcon /></button>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-2xl">
                        <p className="text-xs font-bold text-gray-500 italic leading-relaxed">{q.explanation}</p>
                      </div>
                      <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${activeQuiz.userAnswers[idx] === q.correctIndex ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                        {activeQuiz.userAnswers[idx] === q.correctIndex ? 'Mastered' : 'Reviewed Concept'}
                      </span>
                   </div>
                ))}
             </div>

             <Button onClick={() => { setCurrentScreen(AppScreen.ENTRY); }} className="mt-12 rounded-[2rem] py-6 font-black uppercase tracking-widest shadow-xl shadow-indigo-100">
                Enroll New Subject
             </Button>
          </div>
        )}
      </main>
    </div>
  );
}