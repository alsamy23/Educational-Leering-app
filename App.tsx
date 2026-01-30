import React, { useState, useCallback, useEffect } from 'react';
import { UserProfile, Difficulty, QuizSession, AppScreen } from './types';
import { generateQuizQuestions, generateSpeech, playAudioBuffer } from './services/geminiService';
import { Button } from './components/Button';

// --- Icons ---
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
      {name && <span className="text-[10px] font-bold text-gray-400 uppercase mt-1">Student: {name}</span>}
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
    return saved ? JSON.parse(saved) : { name: '', gradeLevel: '' };
  });

  const [topic, setTopic] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [quizDifficulty, setQuizDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isSpeakingExplanation, setIsSpeakingExplanation] = useState<number | null>(null);
  
  // Feedback state for incorrect answers
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
      setLoadingError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setTopic(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setLoadingError("Could not hear you. Please try again.");
    };
    recognition.start();
  };

  const startQuiz = async () => {
    if (!user.name) {
      setLoadingError("Please enter your name first.");
      return;
    }
    if (!user.gradeLevel) {
      setLoadingError("Please enter your grade level.");
      return;
    }
    if (!topic) {
      setLoadingError("Please provide a subject/topic.");
      return;
    }

    setLoadingError(null);
    setCurrentScreen(AppScreen.LOADING);

    try {
      const questions = await generateQuizQuestions(topic, user.gradeLevel, quizDifficulty);
      setActiveQuiz({
        topic,
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
    } catch (err) {
      setLoadingError("Failed to generate exam. Check your API key and network.");
      setCurrentScreen(AppScreen.ENTRY);
    }
  };

  const handleAnswerSelection = (index: number) => {
    if (showFeedback || !activeQuiz) return;

    const isCorrect = index === activeQuiz.questions[currentQuestionIndex].correctIndex;
    setShowFeedback({ selected: index, isCorrect });

    // If correct, move forward after delay. If wrong, wait for user to read explanation.
    if (isCorrect) {
      const updatedAnswers = [...activeQuiz.userAnswers];
      updatedAnswers[currentQuestionIndex] = index;
      setActiveQuiz({ ...activeQuiz, userAnswers: updatedAnswers, score: activeQuiz.score + 1 });
      
      setTimeout(() => {
        proceedToNext();
      }, 1000);
    } else {
      const updatedAnswers = [...activeQuiz.userAnswers];
      updatedAnswers[currentQuestionIndex] = index;
      setActiveQuiz({ ...activeQuiz, userAnswers: updatedAnswers });
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

  const handleSpeakExplanation = async (text: string, id: number) => {
    setIsSpeakingExplanation(id);
    try {
      const audioData = await generateSpeech(text);
      await playAudioBuffer(audioData);
    } catch (e) {
      setLoadingError("Voice explanation failed.");
    } finally {
      setIsSpeakingExplanation(null);
    }
  };

  return (
    <div className="h-full bg-white flex flex-col max-w-lg mx-auto border-x border-gray-100 shadow-2xl relative overflow-hidden font-sans">
      <Header points={totalPoints} name={user.name} />

      <main className="flex-1 overflow-y-auto no-scrollbar bg-gray-50/30">
        {currentScreen === AppScreen.ENTRY && (
          <div className="p-8 animate-fade-in space-y-10 pb-24">
            <div className="text-center mt-6">
              <h2 className="text-4xl font-black text-gray-900 tracking-tighter">Academic Enrollment</h2>
              <p className="text-gray-400 text-sm mt-3 font-medium">Type or speak your details to excel.</p>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Full Name</label>
                  <input
                    type="text"
                    value={user.name}
                    onChange={(e) => setUser({ ...user, name: e.target.value })}
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-none focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-gray-800"
                    placeholder="e.g. Maria Clara"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Grade Level</label>
                  <input
                    type="text"
                    value={user.gradeLevel}
                    onChange={(e) => setUser({ ...user, gradeLevel: e.target.value })}
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-none focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-gray-800"
                    placeholder="e.g. Grade 10"
                  />
                </div>

                <div className="space-y-2 relative">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Subject / Topic</label>
                  <div className="relative group">
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="w-full pl-6 pr-14 py-4 rounded-2xl bg-gray-50 border-none focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-gray-800"
                      placeholder="e.g. Organic Chemistry"
                    />
                    <button
                      type="button"
                      onClick={startListening}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-indigo-600 shadow-sm hover:shadow-md'
                      }`}
                    >
                      <MicIcon className={isListening ? "w-4 h-4" : "w-5 h-5"} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-gray-100">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4 text-center">Difficulty Level</label>
                <div className="flex bg-gray-100 p-1 rounded-2xl gap-1">
                  {Object.values(Difficulty).map(d => (
                    <button
                      key={d}
                      onClick={() => setQuizDifficulty(d)}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                        quizDifficulty === d ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {loadingError && (
                <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 animate-fade-in">
                   {loadingError}
                </div>
              )}

              <Button onClick={startQuiz} className="rounded-[2rem] h-18 text-lg font-black tracking-widest uppercase shadow-2xl shadow-indigo-100">
                Begin Assessment
              </Button>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in">
             <div className="relative">
               <div className="w-20 h-20 border-[6px] border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center text-2xl">⚡</div>
             </div>
             <div className="text-center">
               <h3 className="text-2xl font-black text-gray-900">Tailoring Questions</h3>
               <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] mt-2 italic">Preparing {topic}</p>
             </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && activeQuiz && (
          <div className="p-8 h-full flex flex-col animate-fade-in">
             <div className="flex justify-between items-end mb-8">
                <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Question</p>
                   <p className="text-4xl font-black">{currentQuestionIndex + 1}<span className="text-gray-200 text-xl">/{activeQuiz.questions.length}</span></p>
                </div>
                <div className="px-3 py-1 bg-indigo-50 rounded-full text-[10px] font-black text-indigo-600 uppercase border border-indigo-100">
                  {activeQuiz.difficulty}
                </div>
             </div>

             <div className="w-full h-1.5 bg-gray-100 rounded-full mb-10 overflow-hidden">
               <div 
                 className="h-full bg-indigo-600 transition-all duration-500" 
                 style={{ width: `${((currentQuestionIndex + 1) / activeQuiz.questions.length) * 100}%` }}
               />
             </div>

             <div className="flex-1 flex flex-col space-y-8 overflow-y-auto no-scrollbar">
                <div className="bg-white p-10 rounded-[3rem] shadow-xl shadow-indigo-50/50 border border-indigo-50">
                  <h2 className="text-2xl font-black text-gray-800 leading-tight">
                    {activeQuiz.questions[currentQuestionIndex].text}
                  </h2>
                </div>

                <div className="space-y-4">
                  {activeQuiz.questions[currentQuestionIndex].options.map((opt, i) => {
                    let btnClass = "bg-white border-gray-100 text-gray-700 hover:border-indigo-400";
                    if (showFeedback) {
                      if (i === activeQuiz.questions[currentQuestionIndex].correctIndex) {
                        btnClass = "bg-emerald-50 border-emerald-500 text-emerald-700 scale-[1.02] shadow-emerald-100";
                      } else if (i === showFeedback.selected && !showFeedback.isCorrect) {
                        btnClass = "bg-red-50 border-red-500 text-red-700 opacity-80";
                      } else {
                        btnClass = "opacity-40 bg-gray-50 border-transparent grayscale";
                      }
                    }

                    return (
                      <button
                        key={i}
                        disabled={!!showFeedback}
                        onClick={() => handleAnswerSelection(i)}
                        className={`w-full p-6 text-left rounded-3xl border-2 transition-all font-bold flex items-center gap-4 ${btnClass}`}
                      >
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${
                          showFeedback && i === activeQuiz.questions[currentQuestionIndex].correctIndex ? 'bg-emerald-500 text-white' : 'bg-gray-50 text-gray-400'
                        }`}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {showFeedback && (
                  <div className="animate-fade-in space-y-6 pt-4">
                    <div className={`p-8 rounded-[2.5rem] border-2 shadow-2xl ${showFeedback.isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-indigo-50 border-indigo-100'}`}>
                      <div className="flex justify-between items-center mb-4">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${showFeedback.isCorrect ? 'text-emerald-600' : 'text-indigo-600'}`}>
                          {showFeedback.isCorrect ? 'Excellent! Correct' : 'Learn This Concept'}
                        </p>
                        <button 
                           onClick={() => handleSpeakExplanation(activeQuiz.questions[currentQuestionIndex].explanation, currentQuestionIndex)}
                           className="text-indigo-600 hover:scale-110 transition-transform"
                        >
                          <SpeakerIcon />
                        </button>
                      </div>
                      <p className="text-sm font-bold text-gray-800 italic leading-relaxed">
                        {activeQuiz.questions[currentQuestionIndex].explanation}
                      </p>
                    </div>

                    {!showFeedback.isCorrect && (
                      <Button onClick={proceedToNext} className="rounded-3xl py-6 font-black uppercase tracking-widest">
                        Continue to Next
                      </Button>
                    )}
                  </div>
                )}
             </div>
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-8 pb-32 animate-fade-in">
             <div className="text-center mb-12">
                <div className="w-24 h-24 bg-white rounded-[2.5rem] shadow-2xl mx-auto flex items-center justify-center text-5xl mb-6 border-4 border-indigo-50">
                  {activeQuiz.score > (activeQuiz.totalQuestions / 2) ? '🎉' : '🔥'}
                </div>
                <h2 className="text-4xl font-black text-gray-900 tracking-tighter">Certified Result</h2>
                <p className="text-gray-400 text-xs font-black uppercase tracking-widest mt-2">{activeQuiz.topic}</p>
             </div>

             <div className="bg-white rounded-[3rem] shadow-xl p-8 mb-10 border border-gray-100">
                <div className="text-center pb-8 mb-8 border-b border-gray-50">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Final Grade</p>
                   <p className="text-8xl font-black text-indigo-600 tracking-tighter">
                     {Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100)}<span className="text-3xl text-indigo-200">%</span>
                   </p>
                </div>
                <div className="flex justify-between items-center px-4">
                   <div className="text-center">
                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Scholar Points</p>
                      <p className="text-2xl font-black text-amber-500">+{activeQuiz.earnedPoints}</p>
                   </div>
                   <div className="w-px h-10 bg-gray-50" />
                   <div className="text-center">
                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Mastery</p>
                      <p className="text-2xl font-black text-gray-800">{activeQuiz.score}/{activeQuiz.totalQuestions}</p>
                   </div>
                </div>
             </div>

             <div className="space-y-4">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Question Breakdown</h3>
                {activeQuiz.questions.map((q, idx) => (
                   <div key={idx} className="bg-white p-6 rounded-3xl border border-gray-50 shadow-sm transition-all hover:shadow-md">
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <p className="font-bold text-sm text-gray-800 leading-snug">{q.text}</p>
                        <button 
                          onClick={() => handleSpeakExplanation(q.explanation, idx)}
                          disabled={isSpeakingExplanation !== null}
                          className={`flex-none p-3 rounded-2xl ${isSpeakingExplanation === idx ? 'bg-indigo-600 text-white animate-pulse' : 'bg-gray-50 text-indigo-600'}`}
                        >
                          <SpeakerIcon />
                        </button>
                      </div>
                      <div className="p-4 bg-gray-50/50 rounded-2xl text-[11px] font-bold text-gray-500 italic">
                        {q.explanation}
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                         <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${activeQuiz.userAnswers[idx] === q.correctIndex ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                            {activeQuiz.userAnswers[idx] === q.correctIndex ? 'Correct' : 'Incorrect'}
                         </span>
                      </div>
                   </div>
                ))}
             </div>

             <Button onClick={() => { setCurrentScreen(AppScreen.ENTRY); setTopic(''); }} className="mt-12 rounded-[2.5rem] py-6 font-black uppercase tracking-widest shadow-xl shadow-indigo-100">
                Enroll in New Subject
             </Button>
          </div>
        )}
      </main>
    </div>
  );
}
