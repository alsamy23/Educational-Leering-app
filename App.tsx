import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UserProfile, Difficulty, QuizQuestion, QuizSession, AppScreen } from './types';
import { generateQuizQuestions } from './services/geminiService';
import { Button } from './components/Button';

// --- Icons ---
const StarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
  </svg>
);

const TrophyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0V5.625a2.25 2.25 0 10-4.5 0v5.75c0 .621.504 1.125 1.125 1.125h.871M9.497 5.625c0-1.036.84-1.875 1.875-1.875h.001c1.035 0 1.875.84 1.875 1.875" />
  </svg>
);

const Header = ({ points, highScore, name }: { points: number; highScore: number; name?: string }) => (
  <header className="flex-none flex justify-between items-center p-4 bg-white shadow-sm border-b border-gray-100 z-30">
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <div className="bg-primary p-1.5 rounded-xl text-white shadow-md shadow-indigo-100">
           <TrophyIcon />
        </div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">ScholarEarn</h1>
      </div>
      {name && (
        <div className="flex items-center gap-1 mt-1.5 text-gray-400">
           <span className="text-[9px] font-black uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-full">{name}</span>
        </div>
      )}
    </div>
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1 rounded-xl border border-amber-100">
        <div className="text-accent scale-75"><StarIcon /></div>
        <span className="font-black text-gray-800 text-sm leading-none">{points.toLocaleString()}</span>
      </div>
      <div className="text-[9px] font-black text-gray-300 uppercase tracking-tighter">
        Personal Best: <span className="text-indigo-600 font-bold">{highScore.toLocaleString()}</span>
      </div>
    </div>
  </header>
);

const InputGroup = ({ label, value, onChange, placeholder, required = false }: any) => (
  <div className="space-y-1.5">
    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">{label}</label>
    <input
      type="text"
      value={value}
      onChange={onChange}
      className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all bg-white font-medium text-gray-800 placeholder:text-gray-300 shadow-sm"
      placeholder={placeholder}
      required={required}
    />
  </div>
);

const SelectGroup = ({ label, value, onChange, options }: any) => (
  <div className="space-y-1.5">
    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full px-5 py-3.5 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none bg-white transition-all appearance-none font-medium text-gray-800 shadow-sm"
      >
        {options.map((opt: string) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  </div>
);

export default function App() {
  const [totalPoints, setTotalPoints] = useState<number>(() => {
    const saved = localStorage.getItem('scholarEarn_points');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [highScore, setHighScore] = useState<number>(() => {
    const saved = localStorage.getItem('scholarEarn_highScore');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ENTRY);
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('scholarEarn_user');
    return saved ? JSON.parse(saved) : { name: '', school: '', section: '', gradeLevel: '10' };
  });

  const [quizTopic, setQuizTopic] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Check if API key is present
  const isApiKeyMissing = !process.env.API_KEY || process.env.API_KEY === '';

  useEffect(() => {
    localStorage.setItem('scholarEarn_points', totalPoints.toString());
    if (totalPoints > highScore) {
      setHighScore(totalPoints);
      localStorage.setItem('scholarEarn_highScore', totalPoints.toString());
    }
  }, [totalPoints, highScore]);

  useEffect(() => {
    localStorage.setItem('scholarEarn_user', JSON.stringify(user));
  }, [user]);

  const startQuizGeneration = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isApiKeyMissing) {
      setLoadingError("API Key is missing. Please set the API_KEY environment variable.");
      return;
    }
    if (!quizTopic || !user.name || !user.school || !user.section) return;
    
    setLoadingError(null);
    setCurrentScreen(AppScreen.LOADING);

    try {
      const questions = await generateQuizQuestions(quizTopic, user.gradeLevel, quizDifficulty);
      setActiveQuiz({
        topic: quizTopic,
        difficulty: quizDifficulty,
        questions,
        userAnswers: new Array(questions.length).fill(-1),
        score: 0,
        totalQuestions: questions.length,
        earnedPoints: 0
      });
      setCurrentQuestionIndex(0);
      setCurrentScreen(AppScreen.QUIZ);
    } catch (err) {
      setLoadingError("Failed to generate exam. Please check your network connection.");
      setCurrentScreen(AppScreen.ENTRY);
    }
  }, [quizTopic, user, quizDifficulty, isApiKeyMissing]);

  if (isApiKeyMissing && currentScreen !== AppScreen.ENTRY) {
     // Safety fallback
     setCurrentScreen(AppScreen.ENTRY);
  }

  return (
    <div className="h-full bg-white flex flex-col max-w-lg mx-auto border-x border-gray-100 shadow-2xl relative overflow-hidden">
      <Header points={totalPoints} highScore={highScore} name={user.name} />

      <main className="flex-1 overflow-y-auto bg-gray-50/30 no-scrollbar">
        
        {currentScreen === AppScreen.ENTRY && (
          <div className="p-8 pb-32 animate-fade-in max-w-md mx-auto">
             <div className="text-center mb-12 mt-4">
               <div className="inline-flex items-center justify-center p-6 bg-indigo-600 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-200 mb-8 transform hover:scale-105 transition-transform cursor-default">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.174L10.778 19.03a1.5 1.5 0 002.444 0l6.517-8.856A5 5 0 0015.826 2H8.174a5 5 0 00-3.914 8.174z" />
                 </svg>
               </div>
               <h2 className="text-4xl font-black text-gray-900 tracking-tight leading-none">Enroll Now</h2>
               <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.3em] mt-4">Identify yourself to start earning</p>
             </div>

             <form onSubmit={startQuizGeneration} className="space-y-10">
                <div className="space-y-6">
                  <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
                    <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                      Academic Profile
                    </h3>
                    
                    <InputGroup 
                      label="Your Name" 
                      value={user.name} 
                      onChange={(e: any) => setUser({...user, name: e.target.value})} 
                      placeholder="e.g. Maria Clara"
                      required
                    />
                    
                    <InputGroup 
                      label="School Name" 
                      value={user.school} 
                      onChange={(e: any) => setUser({...user, school: e.target.value})} 
                      placeholder="e.g. Central State High"
                      required
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <InputGroup 
                        label="Section" 
                        value={user.section} 
                        onChange={(e: any) => setUser({...user, section: e.target.value})} 
                        placeholder="e.g. 10-A"
                        required
                      />
                      <SelectGroup 
                        label="Grade" 
                        value={user.gradeLevel} 
                        onChange={(e: any) => setUser({...user, gradeLevel: e.target.value})}
                        options={['7','8','9','10','11','12','College']}
                      />
                    </div>
                  </div>

                  <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
                    <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                      Exam Setup
                    </h3>

                    {loadingError && (
                      <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-[11px] font-bold border border-red-100 animate-fade-in">
                        {loadingError}
                      </div>
                    )}

                    <InputGroup 
                      label="Subject or Topic" 
                      value={quizTopic} 
                      onChange={(e: any) => setQuizTopic(e.target.value)} 
                      placeholder="e.g. World History or Calculus"
                      required
                    />

                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 mb-3">Complexity</label>
                      <div className="flex p-1.5 bg-gray-100 rounded-[1.25rem] gap-1">
                        {Object.values(Difficulty).map((diff) => (
                          <button
                            key={diff}
                            type="button"
                            onClick={() => setQuizDifficulty(diff)}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all duration-300 ${
                              quizDifficulty === diff 
                              ? 'bg-white text-indigo-600 shadow-md transform scale-[1.02]' 
                              : 'text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            {diff}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <Button type="submit" className="rounded-[2rem] py-6 h-20 text-lg font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-100">
                  Generate Exam
                </Button>
             </form>
          </div>
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="flex flex-col items-center justify-center h-full space-y-10 p-12 animate-fade-in">
            <div className="relative">
              <div className="w-32 h-32 border-[8px] border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-5xl">✍️</div>
            </div>
            <div className="text-center space-y-4">
              <h3 className="text-3xl font-black text-gray-900 tracking-tight">Writing Exam...</h3>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em]">
                Tailoring questions to <span className="text-indigo-600">{quizTopic}</span>
              </p>
            </div>
          </div>
        )}

        {/* --- Quiz Screen and Results remain functional as per previous architecture --- */}
        {currentScreen === AppScreen.QUIZ && activeQuiz && (
           <div className="p-8 animate-fade-in h-full flex flex-col">
              <div className="flex justify-between items-center mb-8">
                 <div className="space-y-1">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Question</p>
                   <p className="text-3xl font-black text-gray-900">{currentQuestionIndex + 1}<span className="text-gray-200 text-xl font-medium">/{activeQuiz.questions.length}</span></p>
                 </div>
                 <div className="px-4 py-2 rounded-2xl bg-indigo-50 border border-indigo-100 text-[10px] font-black text-indigo-600 uppercase">
                    {activeQuiz.difficulty}
                 </div>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-2 mb-12 overflow-hidden shadow-inner">
                <div 
                  className="bg-primary h-full transition-all duration-1000 ease-in-out" 
                  style={{ width: `${((currentQuestionIndex + 1) / activeQuiz.questions.length) * 100}%` }}
                ></div>
              </div>

              <div className="flex-1 space-y-10">
                <div className="bg-white p-10 rounded-[3rem] shadow-xl shadow-gray-200/50 border border-gray-100">
                  <h2 className="text-2xl font-black text-gray-800 leading-tight tracking-tight italic">
                    "{activeQuiz.questions[currentQuestionIndex].text}"
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {activeQuiz.questions[currentQuestionIndex].options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const updatedAnswers = [...activeQuiz.userAnswers];
                        updatedAnswers[currentQuestionIndex] = idx;
                        setActiveQuiz({...activeQuiz, userAnswers: updatedAnswers});
                        setTimeout(() => {
                           if (currentQuestionIndex < activeQuiz.questions.length - 1) {
                             setCurrentQuestionIndex(currentQuestionIndex + 1);
                           } else {
                             // Scoring logic...
                             let score = 0;
                             activeQuiz.questions.forEach((q, i) => {
                               if (updatedAnswers[i] === q.correctIndex) score++;
                             });
                             const earned = score * 10;
                             setActiveQuiz({...activeQuiz, score, earnedPoints: earned, userAnswers: updatedAnswers});
                             setTotalPoints(totalPoints + earned);
                             setCurrentScreen(AppScreen.RESULTS);
                           }
                        }, 200);
                      }}
                      className="group w-full p-6 text-left rounded-[2rem] border-2 border-gray-100 bg-white hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center gap-6"
                    >
                      <div className="flex-none w-12 h-12 rounded-2xl border-2 border-gray-100 bg-gray-50 flex items-center justify-center text-sm font-black text-gray-400 group-hover:border-indigo-200 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all">
                        {String.fromCharCode(65 + idx)}
                      </div>
                      <span className="text-gray-700 font-bold group-hover:text-gray-900">{option}</span>
                    </button>
                  ))}
                </div>
              </div>
           </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
           <div className="p-8 pb-32 animate-fade-in text-center">
              <div className="mt-8 mb-12">
                <div className="inline-flex items-center justify-center w-32 h-32 bg-white rounded-[3rem] mb-8 shadow-2xl border-4 border-indigo-50 text-6xl">
                   🎯
                </div>
                <h2 className="text-5xl font-black text-gray-900 tracking-tighter">Certified!</h2>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] mt-4">Exam Results Transferred</p>
              </div>

              <div className="bg-white rounded-[4rem] shadow-2xl shadow-indigo-100 border border-indigo-50 p-12 mb-12">
                 <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Academic Rating</p>
                 <div className="text-8xl font-black text-gray-900 mb-10 tracking-tighter">
                   {Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100)}<span className="text-4xl text-gray-200">%</span>
                 </div>
                 <div className="flex justify-around items-center pt-10 border-t border-gray-50">
                    <div className="text-center">
                       <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Points</p>
                       <p className="text-3xl font-black text-amber-500">+{activeQuiz.earnedPoints}</p>
                    </div>
                    <div className="h-10 w-px bg-gray-100"></div>
                    <div className="text-center">
                       <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Accuracy</p>
                       <p className="text-3xl font-black text-indigo-600">{activeQuiz.score}/{activeQuiz.totalQuestions}</p>
                    </div>
                 </div>
              </div>

              <Button onClick={() => { setCurrentScreen(AppScreen.ENTRY); setQuizTopic(''); }} className="rounded-[2.5rem] py-6 text-base font-black uppercase tracking-widest shadow-xl shadow-indigo-100">
                New Enrollment
              </Button>
           </div>
        )}
      </main>
    </div>
  );
}