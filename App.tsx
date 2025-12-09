import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UserProfile, Difficulty, QuizQuestion, QuizSession, AppScreen } from './types';
import { generateQuizQuestions } from './services/geminiService';
import { Button } from './components/Button';

// --- Icons ---
const StarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
  </svg>
);

const TrophyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
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

// --- Sub-Components ---

const Header = ({ points, name }: { points: number; name?: string }) => (
  <div className="flex-none flex justify-between items-center p-4 bg-white shadow-sm border-b border-gray-100 z-10 relative">
    <div className="flex flex-col">
      <h1 className="text-xl font-bold text-primary tracking-tight">ScholarEarn</h1>
      {name && <span className="text-xs text-gray-500 font-medium truncate max-w-[150px]">Student: {name}</span>}
    </div>
    <div className="flex items-center gap-2 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1.5 rounded-xl border border-amber-100 shadow-sm">
      <div className="text-accent p-1 bg-white rounded-full shadow-sm">
        <StarIcon />
      </div>
      <div className="flex flex-col items-end leading-none">
        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Points</span>
        <span className="font-bold text-gray-800 text-lg">{points.toLocaleString()}</span>
      </div>
    </div>
  </div>
);

const InputGroup = ({ label, value, onChange, placeholder, required = false }: any) => (
  <div className="mb-5">
    <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
    <input
      type="text"
      value={value}
      onChange={onChange}
      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm bg-gray-50 focus:bg-white"
      placeholder={placeholder}
      required={required}
    />
  </div>
);

const SelectGroup = ({ label, value, onChange, options }: any) => (
  <div className="mb-5">
    <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none bg-gray-50 focus:bg-white transition-all shadow-sm appearance-none"
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
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ENTRY);
  
  // User Data
  const [user, setUser] = useState<UserProfile>({
    name: '',
    school: '',
    section: '',
    gradeLevel: '10'
  });

  // Quiz Setup
  const [quizTopic, setQuizTopic] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Active Quiz State
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

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
      setLoadingError("Failed to generate exam. Please check your connection and try again.");
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
    }, 300);
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
      [Difficulty.MEDIUM]: 1.5,
      [Difficulty.HARD]: 2.5,
      [Difficulty.EXPERT]: 5
    };
    
    // Points logic: base 10 points * multiplier
    const pointsPerQuestion = 10 * multipliers[finalQuizState.difficulty];
    const totalEarnedPoints = Math.round(correctCount * pointsPerQuestion);

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

    // Standard grade calculation (out of 100)
    const percentageScore = Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100);
    const dateStr = new Date().toLocaleDateString();

    // CSV Data Structure
    const csvRows = [
      ['Student Report Card'],
      ['Generated by ScholarEarn'],
      [],
      ['Student Name', user.name],
      ['School', user.school],
      ['Section', user.section],
      ['Grade Level', user.gradeLevel],
      [],
      ['Exam Details'],
      ['Topic', activeQuiz.topic],
      ['Difficulty', activeQuiz.difficulty],
      ['Date', dateStr],
      [],
      ['Results'],
      ['Questions Answered', `${activeQuiz.score} / ${activeQuiz.totalQuestions}`],
      ['Final Score', `${percentageScore} / 100`],
      ['Points Earned', activeQuiz.earnedPoints],
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + csvRows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${user.name}_${activeQuiz.topic.replace(/\s+/g, '_')}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Screens ---

  return (
    <div className="h-full bg-gray-50 flex flex-col max-w-lg mx-auto border-x border-gray-200 shadow-2xl relative">
      <Header points={totalPoints} name={user.name} />

      {/* Main Content Area - Scrollable */}
      <main ref={mainRef} className="flex-1 overflow-y-auto scroll-smooth">
        
        {currentScreen === AppScreen.ENTRY && (
          <div className="p-6 pb-20 animate-fade-in">
             <div className="text-center mb-8 mt-2">
               <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl mb-3 text-primary">
                 <BookOpenIcon />
               </div>
               <h2 className="text-2xl font-bold text-gray-900">Student Entry</h2>
               <p className="text-gray-500 text-sm">Enter your academic details.</p>
             </div>

             <form onSubmit={startQuizGeneration} className="space-y-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">Student Identity</h3>
                  <InputGroup 
                    label="Full Name" 
                    value={user.name} 
                    onChange={(e: any) => setUser({...user, name: e.target.value})} 
                    placeholder="Student Name"
                    required
                  />
                  <InputGroup 
                    label="School / University" 
                    value={user.school} 
                    onChange={(e: any) => setUser({...user, school: e.target.value})} 
                    placeholder="Institution Name"
                    required
                  />
                  <div className="flex gap-4">
                    <div className="w-1/2">
                      <InputGroup 
                        label="Section" 
                        value={user.section} 
                        onChange={(e: any) => setUser({...user, section: e.target.value})} 
                        placeholder="e.g. A"
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

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">Exam Configuration</h3>
                  
                  {loadingError && (
                    <div className="p-3 mb-4 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 flex items-center gap-2">
                      <span className="text-lg">⚠️</span> {loadingError}
                    </div>
                  )}

                  <InputGroup 
                    label="Topic to Learn" 
                    value={quizTopic} 
                    onChange={(e: any) => setQuizTopic(e.target.value)} 
                    placeholder="e.g. Thermodynamics"
                    required
                  />

                  <div className="mb-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Difficulty Level</label>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.values(Difficulty).map((diff) => (
                        <button
                          key={diff}
                          type="button"
                          onClick={() => setQuizDifficulty(diff)}
                          className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all ${
                            quizDifficulty === diff 
                            ? 'border-primary bg-primary text-white shadow-lg shadow-indigo-200 scale-105' 
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button type="submit">
                    Start Exam
                  </Button>
                </div>
             </form>
          </div>
        )}

        {currentScreen === AppScreen.LOADING && (
          <div className="flex flex-col items-center justify-center h-full space-y-6 p-8">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">🧠</span>
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-gray-800">Preparing Exam</h3>
              <p className="text-sm text-gray-500 max-w-[200px] mx-auto">
                Generating questions on <span className="text-primary font-semibold">{quizTopic}</span>...
              </p>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.QUIZ && activeQuiz && (
          <div className="p-6 pb-20 flex flex-col min-h-full">
            <div className="flex justify-between items-center mb-6">
               <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                 Question {currentQuestionIndex + 1} / {activeQuiz.questions.length}
               </span>
               <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                 {activeQuiz.difficulty}
               </span>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2 mb-8 overflow-hidden">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${((currentQuestionIndex + 1) / activeQuiz.questions.length) * 100}%` }}
              ></div>
            </div>

            <div className="flex-1">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
                <h2 className="text-lg font-bold text-gray-900 leading-relaxed">
                  {activeQuiz.questions[currentQuestionIndex].text}
                </h2>
              </div>

              <div className="space-y-3">
                {activeQuiz.questions[currentQuestionIndex].options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(idx)}
                    className="group w-full p-4 text-left rounded-xl border border-gray-200 bg-white hover:border-primary hover:bg-indigo-50/50 hover:shadow-md transition-all duration-200 active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-none w-8 h-8 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-sm font-bold text-gray-500 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-colors">
                        {String.fromCharCode(65 + idx)}
                      </div>
                      <span className="text-gray-700 font-medium group-hover:text-indigo-900">{option}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentScreen === AppScreen.RESULTS && activeQuiz && (
          <div className="p-6 pb-32 animate-fade-in">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-yellow-100 to-amber-100 rounded-full mb-4 shadow-inner ring-4 ring-white">
                 <div className="text-accent drop-shadow-sm">
                   <TrophyIcon />
                 </div>
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Exam Complete</h2>
              <p className="text-gray-500 mt-2 font-medium">Here is your performance report</p>
            </div>

            {/* Score Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl shadow-lg p-6 text-white text-center mb-4 relative overflow-hidden">
               <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
               <div className="absolute bottom-0 left-0 -ml-4 -mb-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
               
               <div className="grid grid-cols-2 divide-x divide-indigo-400/30">
                 <div>
                    <p className="text-indigo-100 font-medium text-xs uppercase tracking-widest mb-1">Final Score</p>
                    <h3 className="text-4xl font-bold my-1 tracking-tight">
                      {Math.round((activeQuiz.score / activeQuiz.totalQuestions) * 100)}<span className="text-2xl opacity-70">/100</span>
                    </h3>
                 </div>
                 <div>
                    <p className="text-indigo-100 font-medium text-xs uppercase tracking-widest mb-1">Points Earned</p>
                    <div className="flex items-center justify-center gap-1">
                      <div className="text-yellow-300 w-5 h-5"><StarIcon /></div>
                      <h3 className="text-4xl font-bold my-1 tracking-tight">{activeQuiz.earnedPoints}</h3>
                    </div>
                 </div>
               </div>
               
               <div className="inline-block bg-white/20 backdrop-blur-sm px-4 py-1 rounded-full text-sm font-medium mt-4">
                 Correct Answers: {activeQuiz.score} / {activeQuiz.totalQuestions}
               </div>
            </div>

            <button 
              onClick={handleExportCSV}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-600 font-semibold hover:border-primary hover:text-primary hover:bg-indigo-50 transition-all mb-8"
            >
              <DownloadIcon />
              Download Report for Google Sheets
            </button>

            {/* Correction Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
               <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                 <div className="w-2 h-6 bg-primary rounded-full"></div>
                 <span className="font-bold text-gray-800">Answer Key</span>
               </div>
               <div className="divide-y divide-gray-100">
                 {activeQuiz.questions.map((q, idx) => {
                   const userAnswer = activeQuiz.userAnswers[idx];
                   const isCorrect = userAnswer === q.correctIndex;
                   return (
                     <div key={q.id} className="p-5">
                       <div className="flex gap-3 mb-3">
                         <div className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                           {isCorrect ? <CheckIcon /> : <XMarkIcon />}
                         </div>
                         <p className="font-medium text-gray-800 text-sm leading-relaxed">{q.text}</p>
                       </div>
                       
                       <div className="ml-9 space-y-2">
                         {!isCorrect && (
                           <div className="text-xs text-red-500 flex gap-2 items-center">
                             <span className="font-bold uppercase tracking-wider text-[10px]">Your Answer:</span>
                             <span className="line-through decoration-red-400">{q.options[userAnswer]}</span>
                           </div>
                         )}
                         <div className="text-sm bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                           <div className="flex gap-2 items-start">
                             <span className="font-bold text-emerald-700 text-xs uppercase tracking-wider mt-0.5 flex-shrink-0">Correct:</span>
                             <span className="text-gray-800 font-medium">{q.options[q.correctIndex]}</span>
                           </div>
                           <div className="mt-2 text-xs text-gray-500 leading-relaxed border-t border-emerald-100 pt-2">
                             <span className="font-semibold text-emerald-600">Note:</span> {q.explanation}
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

      {/* Floating Bottom Action Bar for Results */}
      {currentScreen === AppScreen.RESULTS && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
          <Button onClick={handleNextExam} className="shadow-xl shadow-indigo-200">
            Take Another Exam
          </Button>
        </div>
      )}
    </div>
  );
}