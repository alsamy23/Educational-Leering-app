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

const BookOpenIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
  </svg>
);

// --- Sub-Components ---

const Header = ({ points, highScore, name }: { points: number; highScore: number; name?: string }) => (
  <header className="flex-none flex justify-between items-center p-4 bg-white shadow-sm border-b border-gray-100 z-30">
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <div className="bg-primary p-1 rounded-lg text-white">
           <TrophyIcon />
        </div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">ScholarEarn</h1>
      </div>
      {name && (
        <div className="flex items-center gap-1 mt-1 text-gray-500">
           <UserIcon />
           <span className="text-[10px] font-bold uppercase truncate max-w-[120px]">{name}</span>
        </div>
      )}
    </div>
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
        <div className="text-accent scale-75"><StarIcon /></div>
        <span className="font-black text-gray-800 text-sm leading-none">{points.toLocaleString()}</span>
      </div>
      <div className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">
        Best: <span className="text-indigo-600">{highScore.toLocaleString()}</span>
      </div>
    </div>
  </header>
);

const InputGroup = ({ label, value, onChange, placeholder, required = false }: any) => (
  <div className="space-y-1.5">
    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider pl-1">{label}</label>
    <input
      type="text"
      value={value}
      onChange={onChange}
      className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all bg-white font-medium text-gray-800 placeholder:text-gray-300"
      placeholder={placeholder}
      required={required}
    />
  </div>
);

const SelectGroup = ({ label, value, onChange, options }: any) => (
  <div className="space-y-1.5">
    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider pl-1">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none bg-white transition-all appearance-none font-medium text-gray-800"
      >
        {options.map((opt: string) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
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
    return saved ? JSON.parse(saved) : {
      name: '',
      school: '',
      section: '',
      gradeLevel: '10'
    };
  });

  const [quizTopic, setQuizTopic] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

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
      console.error(err);
      setLoadingError("Could not connect to AI services. Please try again.");
      setCurrentScreen(AppScreen.ENTRY);
    }
  }, [quizTopic, user, quizDifficulty]);

  const handleAnswer = (optionIndex: number) => {
    if (!activeQuiz) return;
    const updatedAnswers = [...activeQuiz.userAnswers];
    updatedAnswers[currentQuestionIndex] = optionIndex;
    const updatedQuiz = { ...activeQuiz, userAnswers: updatedAnswers };
    setActiveQuiz(updatedQuiz);

    setTimeout(() => {
      if (currentQuestionIndex < activeQuiz.questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        finishQuiz(updatedQuiz);
      }
    }, 300);
  };

  const finishQuiz = (finalQuizState: QuizSession) => {
    let correctCount = 0;
    finalQuizState.questions.forEach((q, idx) => {
      if (finalQuizState.userAnswers[idx] === q.correctIndex) correctCount++;
    });

    const multipliers: Record<Difficulty, number> = {
      [Difficulty.EASY]: 1, [Difficulty.MEDIUM]: 2, [Difficulty.HARD]: 3, [Difficulty.EXPERT]: 5
    };
    
    const accuracy = correctCount / finalQuizState.totalQuestions;
    const basePoints = 100 * multipliers[finalQuizState.difficulty];
    const totalEarnedPoints = Math.round(basePoints * accuracy);

    setActiveQuiz({ ...finalQuizState, score: correctCount, earnedPoints: totalEarnedPoints });
    setTotalPoints(prev => prev + totalEarnedPoints);
    setCurrentScreen(AppScreen.RESULTS);
  };

  return (
    <div className="h-full bg-white flex flex-col max-w-lg mx-auto border-x border-gray-100 shadow-xl relative overflow-hidden">
      <Header points={totalPoints} highScore={highScore} name={user.name} />

      <main className="flex-1 overflow-y-auto bg-gray-50/50">
        
        {currentScreen === AppScreen.ENTRY && (
          <div className="p-6 pb-20 animate-fade-in max-w-md mx-auto">
             <div className="text-center mb-10 mt-6">
               <div className="inline-flex items-center justify-center p-5 bg-indigo-600 rounded-[2rem] text-white shadow-xl shadow-indigo-200 mb-6">
                 <BookOpenIcon />
               </div>
               <h2 className="text-3xl font-black text-gray-900 tracking-tight">Student Login</h2>
               <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Enter your academic details</p>
             </div>

             <form onSubmit={startQuizGeneration} className="space-y-8">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-5">
                  <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                    Identity
                  </h3>
                  <InputGroup 
                    label="Full Name" 
                    value={user.name} 
                    onChange={(e: any) => setUser({...user, name: e.target.value})} 
                    placeholder="Enter your full name"
                    required
                  />
                  <InputGroup 
                    label="School" 
                    value={user.school} 
                    onChange={(e: any) => setUser({...user, school: e.target.value})} 
                    placeholder="Name of your institution"
                    required
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <InputGroup 
                      label="Section" 
                      value={user.section} 
                      onChange={(e: any) => setUser({...user, section: e.target.value})} 
                      placeholder="e.g. 10-Alpha"
                      required
                    />
                    <SelectGroup 
                      label="Grade" 
                      value={user.gradeLevel} 
                      onChange={(e: any) => setUser({...user, gradeLevel: e.target.value})}
                      options={['1','2','3','4','5','6','7','8','9','10','11','12','College']}
                    />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-5">
                  <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                    Examination
                  </h3>
                  
                  {loadingError && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-2xl text-[11px] font-bold border border-red-100">
                      ⚠️ {loadingError}
                    </div>
                  )}

                  <InputGroup 
                    label="Subject Topic" 
                    value={quizTopic} 
                    onChange={(e: any) => setQuizTopic(e.target.value)} 
                    placeholder="What do you want to be tested on?"
                    required
                  />

                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider pl-1 mb-2">Challenge Level</label>
                    <div className="flex p-1 bg-gray-100 rounded-2xl gap-1">
                      {Object.values(Difficulty).map((diff) => (
                        <button
                          key={diff}
                          type="button"
                          onClick={() => setQuizDifficulty(diff)}
                          className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${
                            quizDifficulty === diff 
                            ? 'bg-white text-indigo-600 shadow-sm' 
                            : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <Button type="submit" className="rounded-3xl py-5 h-18 text-base font-black uppercase tracking-[0.15em] shadow-indigo-100">
                  Begin Examination
                </Button>
             </form>
          </div>
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="flex flex-col items-center justify-center h-full space-y-8 p-10 animate-fade-in">
            <div className="relative">
              <div className="w-24 h-24 border-[6px] border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-3xl">📝</div>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-black text-gray-900">Creating Exam...</h3>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-3">
                Tailoring to <span className="text-primary">{quizTopic}</span>
              </p>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && activeQuiz && (
          <div className="p-6 flex flex-col min-h-full animate-fade-in">
            <div className="flex justify-between items-end mb-4">
               <div className="flex flex-col">
                 <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Question</span>
                 <span className="text-3xl font-black text-gray-900">
                   {currentQuestionIndex + 1}<span className="text-gray-200 ml-1">/{activeQuiz.questions.length}</span>
                 </span>
               </div>
               <div className="px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-black text-indigo-600 uppercase">
                 {activeQuiz.difficulty}
               </div>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-10 overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-700 ease-out" 
                style={{ width: `${((currentQuestionIndex + 1) / activeQuiz.questions.length) * 100}%` }}
              ></div>
            </div>

            <div className="space-y-8">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                <h2 className="text-xl font-extrabold text-gray-800 leading-tight">
                  {activeQuiz.questions[currentQuestionIndex].text}
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {activeQuiz.questions[currentQuestionIndex].options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(idx)}
                    className="group w-full p-5 text-left rounded-3xl border-2 border-gray-100 bg-white hover:border-indigo-400 hover:bg-indigo-50/30 transition-all flex items-center gap-5"
                  >
                    <div className="flex-none w-10 h-10 rounded-2xl border-2 border-gray-100 bg-gray-50 flex items-center justify-center text-xs font-black text-gray-400 group-hover:border-indigo-200 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <span className="text-gray-700 font-bold group-hover:text-gray-900 transition-colors">{option}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-6 pb-32 animate-fade-in">
            <div className="text-center mb-10 mt-6">
              <div className="inline-flex items-center justify-center w-28 h-28 bg-white rounded-[2.5rem] mb-8 shadow-2xl border-4 border-indigo-50 text-4xl">
                 🏆
              </div>
              <h2 className="text-4xl font-black text-gray-900 tracking-tight">Well Done!</h2>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">Exam Transcript Completed</p>
            </div>

            <div className="bg-white rounded-[3rem] shadow-xl border border-indigo-50 p-10 text-center mb-10 overflow-hidden relative">
               <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600 opacity-10"></div>
               <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Final Grade</p>
               <div className="text-7xl font-black text-gray-900 mb-8 tracking-tighter">
                 {Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100)}<span className="text-3xl text-gray-300">%</span>
               </div>
               <div className="grid grid-cols-2 w-full gap-8 pt-8 border-t border-gray-50">
                 <div className="text-center">
                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Currency Earned</span>
                    <span className="text-2xl font-black text-amber-500">
                      ★ {activeQuiz.earnedPoints}
                    </span>
                 </div>
                 <div className="text-center">
                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Correct</span>
                    <span className="text-2xl font-black text-indigo-600">
                      {activeQuiz.score}/{activeQuiz.totalQuestions}
                    </span>
                 </div>
               </div>
            </div>

            <Button onClick={() => { setCurrentScreen(AppScreen.ENTRY); setQuizTopic(''); }} className="rounded-3xl py-5 font-black uppercase tracking-widest shadow-indigo-100">
              Take Another Exam
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}