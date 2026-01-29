
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

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const XMarkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const BookOpenIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
  </svg>
);

// --- Sub-Components ---

const Header = ({ points, highScore, name }: { points: number; highScore: number; name?: string }) => (
  <header className="flex-none flex justify-between items-center p-4 bg-white shadow-sm border-b border-gray-100 z-30 sticky top-0">
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <div className="bg-primary p-1 rounded-lg">
           <TrophyIcon />
        </div>
        <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">ScholarEarn</h1>
      </div>
      {name && (
        <div className="flex items-center gap-1 mt-1 text-gray-500">
           <UserIcon />
           <span className="text-[10px] font-bold uppercase truncate max-w-[100px]">{name}</span>
        </div>
      )}
    </div>
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
        <div className="text-accent"><StarIcon /></div>
        <span className="font-black text-gray-800 text-sm">{points.toLocaleString()}</span>
      </div>
      <div className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">
        All-Time High: <span className="text-indigo-600">{highScore.toLocaleString()}</span>
      </div>
    </div>
  </header>
);

const InputGroup = ({ label, value, onChange, placeholder, required = false }: any) => (
  <div className="mb-4">
    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{label}</label>
    <input
      type="text"
      value={value}
      onChange={onChange}
      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm bg-gray-50 focus:bg-white font-medium text-gray-800"
      placeholder={placeholder}
      required={required}
    />
  </div>
);

const SelectGroup = ({ label, value, onChange, options }: any) => (
  <div className="mb-4">
    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none bg-gray-50 focus:bg-white transition-all shadow-sm appearance-none font-medium text-gray-800"
      >
        {options.map((opt: string) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  </div>
);

// --- Main App ---

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
  
  // User Data
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('scholarEarn_user');
    return saved ? JSON.parse(saved) : {
      name: '',
      school: '',
      section: '',
      gradeLevel: '10'
    };
  });

  // Quiz Setup
  const [quizTopic, setQuizTopic] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Active Quiz State
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Persistence
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

  // Scroll Ref
  const mainRef = useRef<HTMLDivElement>(null);

  // Scroll to top on screen change
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [currentScreen]);

  // --- Handlers ---

  const startQuizGeneration = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quizTopic || !user.name || !user.school) return;
    
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
      setLoadingError("Connection error. Please check your API key and try again.");
      setCurrentScreen(AppScreen.ENTRY);
    }
  }, [quizTopic, user.gradeLevel, quizDifficulty, user.name, user.school]);

  const handleAnswer = (optionIndex: number) => {
    if (!activeQuiz) return;

    const updatedAnswers = [...activeQuiz.userAnswers];
    updatedAnswers[currentQuestionIndex] = optionIndex;
    
    const updatedQuiz = { ...activeQuiz, userAnswers: updatedAnswers };
    setActiveQuiz(updatedQuiz);

    // Auto advance
    setTimeout(() => {
      if (currentQuestionIndex < activeQuiz.questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        finishQuiz(updatedQuiz);
      }
    }, 400);
  };

  const finishQuiz = (finalQuizState: QuizSession) => {
    let correctCount = 0;
    finalQuizState.questions.forEach((q, idx) => {
      if (finalQuizState.userAnswers[idx] === q.correctIndex) {
        correctCount++;
      }
    });

    const multipliers: Record<Difficulty, number> = {
      [Difficulty.EASY]: 1,
      [Difficulty.MEDIUM]: 2,
      [Difficulty.HARD]: 3,
      [Difficulty.EXPERT]: 5
    };
    
    // Points logic: base 10 points * multiplier * accuracy %
    const accuracy = correctCount / finalQuizState.totalQuestions;
    const basePoints = 100 * multipliers[finalQuizState.difficulty];
    const totalEarnedPoints = Math.round(basePoints * accuracy);

    const completedQuiz = {
      ...finalQuizState,
      score: correctCount,
      earnedPoints: totalEarnedPoints
    };

    setActiveQuiz(completedQuiz);
    setTotalPoints(prev => prev + totalEarnedPoints);
    setCurrentScreen(AppScreen.RESULTS);
  };

  const handleNextExam = () => {
    setActiveQuiz(null);
    setQuizTopic('');
    setCurrentScreen(AppScreen.ENTRY);
  };

  const handleExportCSV = () => {
    if (!activeQuiz) return;

    const percentageScore = Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100);
    const dateStr = new Date().toLocaleString();

    // Flatten data for easy Google Sheet usage
    const headers = ["Student Name", "School", "Section", "Grade", "Topic", "Difficulty", "Correct Answers", "Total Questions", "Percentage Score", "Points Gained", "Timestamp"];
    const row = [
      user.name,
      user.school,
      user.section,
      user.gradeLevel,
      activeQuiz.topic,
      activeQuiz.difficulty,
      activeQuiz.score,
      activeQuiz.totalQuestions,
      `${percentageScore}%`,
      activeQuiz.earnedPoints,
      dateStr
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers, row].map(e => e.map(cell => `"${cell}"`).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ScholarEarn_${user.name.replace(/\s+/g, '_')}_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Screens ---

  return (
    <div className="h-full bg-gray-50 flex flex-col max-w-lg mx-auto border-x border-gray-200 shadow-2xl relative overflow-hidden">
      <Header points={totalPoints} highScore={highScore} name={user.name} />

      {/* Main Content Area - Scrollable */}
      <main ref={mainRef} className="flex-1 overflow-y-auto scroll-smooth">
        
        {currentScreen === AppScreen.ENTRY && (
          <div className="p-6 pb-20 animate-fade-in">
             <div className="text-center mb-8 mt-2">
               <div className="inline-flex items-center justify-center p-4 bg-indigo-50 rounded-full mb-4 text-primary shadow-sm">
                 <BookOpenIcon />
               </div>
               <h2 className="text-2xl font-black text-gray-900">Entrance Form</h2>
               <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Ready to prove your skills?</p>
             </div>

             <form onSubmit={startQuizGeneration} className="space-y-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                    Identity Details
                  </h3>
                  <InputGroup 
                    label="Full Name" 
                    value={user.name} 
                    onChange={(e: any) => setUser({...user, name: e.target.value})} 
                    placeholder="Enter Student Name"
                    required
                  />
                  <InputGroup 
                    label="School Name" 
                    value={user.school} 
                    onChange={(e: any) => setUser({...user, school: e.target.value})} 
                    placeholder="Enter Institution"
                    required
                  />
                  <div className="flex gap-4">
                    <div className="w-1/2">
                      <InputGroup 
                        label="Section" 
                        value={user.section} 
                        onChange={(e: any) => setUser({...user, section: e.target.value})} 
                        placeholder="e.g. Diamond"
                      />
                    </div>
                    <div className="w-1/2">
                      <SelectGroup 
                        label="Grade" 
                        value={user.gradeLevel} 
                        onChange={(e: any) => setUser({...user, gradeLevel: e.target.value})}
                        options={['1','2','3','4','5','6','7','8','9','10','11','12','College']}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                  <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
                    Exam Subject
                  </h3>
                  
                  {loadingError && (
                    <div className="p-3 mb-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100 flex items-center gap-2">
                      <span>⚠️</span> {loadingError}
                    </div>
                  )}

                  <InputGroup 
                    label="What topic should we test?" 
                    value={quizTopic} 
                    onChange={(e: any) => setQuizTopic(e.target.value)} 
                    placeholder="e.g. World War II History"
                    required
                  />

                  <div className="mb-2">
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Complexity</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(Difficulty).map((diff) => (
                        <button
                          key={diff}
                          type="button"
                          onClick={() => setQuizDifficulty(diff)}
                          className={`py-3 px-1 rounded-xl border text-[10px] font-black uppercase transition-all flex flex-col items-center justify-center ${
                            quizDifficulty === diff 
                            ? 'border-primary bg-primary text-white shadow-lg shadow-indigo-100 scale-[1.02]' 
                            : 'border-gray-100 bg-gray-50 text-gray-400 hover:bg-gray-100'
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button type="submit" className="rounded-2xl py-4 h-16 text-lg font-black uppercase tracking-widest">
                    Start Examination
                  </Button>
                </div>
             </form>
          </div>
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="flex flex-col items-center justify-center h-full space-y-6 p-8 animate-pulse">
            <div className="relative">
              <div className="w-24 h-24 border-[6px] border-indigo-100 border-t-indigo-600 rounded-full animate-spin shadow-inner"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl animate-bounce">🧪</span>
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black text-gray-900">Setting up the Paper</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                Gathering questions for <span className="text-primary">{quizTopic}</span>
              </p>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && activeQuiz && (
          <div className="p-6 pb-20 flex flex-col min-h-full">
            <div className="flex justify-between items-end mb-6">
               <div className="flex flex-col">
                 <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Question</span>
                 <span className="text-2xl font-black text-gray-900 leading-none">
                   {currentQuestionIndex + 1} <span className="text-gray-300">/ {activeQuiz.questions.length}</span>
                 </span>
               </div>
               <div className="flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                 <span className="text-[10px] font-black text-primary uppercase tracking-tight">{activeQuiz.difficulty}</span>
               </div>
            </div>

            <div className="w-full bg-gray-100 rounded-full h-3 mb-10 p-0.5 overflow-hidden border border-gray-200">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-700 ease-in-out shadow-sm" 
                style={{ width: `${((currentQuestionIndex + 1) / activeQuiz.questions.length) * 100}%` }}
              ></div>
            </div>

            <div className="flex-1 space-y-8">
              <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-indigo-50 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 leading-snug">
                  {activeQuiz.questions[currentQuestionIndex].text}
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {activeQuiz.questions[currentQuestionIndex].options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(idx)}
                    className="group w-full p-5 text-left rounded-2xl border-2 border-gray-100 bg-white hover:border-primary hover:bg-indigo-50 transition-all duration-300 active:scale-[0.97] flex items-center gap-4"
                  >
                    <div className="flex-none w-10 h-10 rounded-xl border-2 border-gray-100 bg-gray-50 flex items-center justify-center text-sm font-black text-gray-400 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <span className="text-gray-700 font-bold group-hover:text-indigo-900">{option}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-6 pb-40 animate-fade-in">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-28 h-28 bg-white rounded-[2.5rem] mb-6 shadow-2xl border-4 border-indigo-50 ring-1 ring-indigo-100">
                 <div className="text-primary animate-pulse">
                   <TrophyIcon />
                 </div>
              </div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">Exam Terminated</h2>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-2">Performance Analytics</p>
            </div>

            {/* Score Showcase */}
            <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-indigo-100 border border-indigo-50 p-8 text-center mb-6 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-16 -mt-16 opacity-50"></div>
               <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-50 rounded-full blur-3xl -ml-16 -mb-16 opacity-50"></div>
               
               <div className="relative z-10 flex flex-col items-center">
                 <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Overall Academic Standing</p>
                 
                 <div className="relative w-40 h-40 flex items-center justify-center mb-6">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-100" />
                      <circle 
                        cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" 
                        strokeDasharray={440}
                        strokeDashoffset={440 - (440 * (activeQuiz.score / activeQuiz.totalQuestions))}
                        className="text-primary transition-all duration-1000 ease-out" 
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-5xl font-black text-gray-900 leading-none">
                        {Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100)}
                      </span>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Percent</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 w-full gap-4 pt-4 border-t border-gray-100">
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black text-gray-400 uppercase">Points Gained</span>
                      <span className="text-2xl font-black text-amber-500 flex items-center justify-center gap-1">
                        <StarIcon /> {activeQuiz.earnedPoints}
                      </span>
                   </div>
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black text-gray-400 uppercase">Correctness</span>
                      <span className="text-2xl font-black text-indigo-600">
                        {activeQuiz.score} <span className="text-gray-300 text-sm">/ {activeQuiz.totalQuestions}</span>
                      </span>
                   </div>
                 </div>
               </div>
            </div>

            <button 
              onClick={handleExportCSV}
              className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl bg-gray-900 text-white font-black text-xs uppercase tracking-widest hover:bg-black transition-all mb-10 shadow-xl shadow-gray-200"
            >
              <DownloadIcon />
              Generate CSV for Google Sheets
            </button>

            {/* Answer Key */}
            <div className="space-y-6">
               <div className="flex items-center gap-3 px-2">
                 <div className="w-1 h-4 bg-primary rounded-full"></div>
                 <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Detailed Correction</h4>
               </div>
               
               <div className="space-y-4">
                 {activeQuiz.questions.map((q, idx) => {
                   const userAnswer = activeQuiz.userAnswers[idx];
                   const isCorrect = userAnswer === q.correctIndex;
                   return (
                     <div key={q.id} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                       <div className="flex gap-4 mb-4">
                         <div className={`flex-none w-10 h-10 rounded-2xl flex items-center justify-center ${isCorrect ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                           {isCorrect ? <CheckIcon /> : <XMarkIcon />}
                         </div>
                         <p className="font-bold text-gray-800 text-sm leading-snug pt-1">{q.text}</p>
                       </div>
                       
                       <div className="ml-14 space-y-3">
                         {!isCorrect && (
                           <div className="flex flex-col">
                             <span className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">Your response:</span>
                             <div className="p-3 bg-red-50/50 rounded-xl border border-red-100 text-sm text-red-800 font-medium line-through decoration-red-300">
                               {q.options[userAnswer]}
                             </div>
                           </div>
                         )}
                         <div className="flex flex-col">
                            <span className={`text-[9px] font-black ${isCorrect ? 'text-emerald-400' : 'text-indigo-400'} uppercase tracking-widest mb-1`}>
                              {isCorrect ? 'Validated Response:' : 'Correct Academic Fact:'}
                            </span>
                            <div className={`p-4 rounded-2xl border-2 ${isCorrect ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-indigo-50 border-indigo-100 text-indigo-900'} text-sm font-bold shadow-sm`}>
                               {q.options[q.correctIndex]}
                            </div>
                            <div className="mt-3 text-[11px] text-gray-500 leading-relaxed p-3 bg-gray-50 rounded-xl border border-dashed border-gray-200 italic">
                               <span className="font-black text-gray-400 uppercase not-italic mr-1">Rationale:</span> {q.explanation}
                            </div>
                         </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
            </div>
          </div>
        )}

      </main>

      {/* Persistent Action Bar */}
      {currentScreen === AppScreen.RESULTS && (
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-md border-t border-gray-100 z-40">
          <Button onClick={handleNextExam} className="rounded-2xl py-5 font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-100">
            Next Examination
          </Button>
        </div>
      )}
    </div>
  );
}
