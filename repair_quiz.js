import fs from 'fs';

const filePath = './App.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

// Find start of search using flexible matching
const keyword = 'flex-1 overflow-y-auto no-scrollbar';
const keywordIdx = content.indexOf(keyword);

// Find index of the div opening right before it
let startIdx = -1;
if (keywordIdx !== -1) {
  startIdx = content.lastIndexOf('<div', keywordIdx);
}

// Find index of RESULTS Screen
const endKeyword = 'currentScreen === AppScreen.RESULTS && activeQuiz && (';
const endKeywordIdx = content.indexOf(endKeyword);
let endIdx = -1;
if (endKeywordIdx !== -1) {
  endIdx = content.lastIndexOf('{', endKeywordIdx);
}

if (startIdx === -1) {
  console.log("ERROR: start index not found");
} else if (endIdx === -1) {
  console.log("ERROR: end search string not found");
} else {
  const beforeSection = content.substring(0, startIdx);
  const afterSection = content.substring(endIdx);

  const perfectQuizContent = `              <div className="flex-1 overflow-y-auto no-scrollbar p-3 md:p-6 lg:p-8">
                <div className={\`transition-all duration-300 w-full \${
                  currentQ.contextMaterial 
                    ? 'lg:flex lg:gap-8 items-start max-w-7xl mx-auto' 
                    : 'flex flex-col items-center justify-start max-w-4xl lg:max-w-5xl mx-auto'
                }\`}>
                 
                   {/* Case Study / Context Column (Left) */}
                   {currentQ.contextMaterial && (
                     <div className={\`transition-all duration-300 mb-6 lg:mb-0 \${
                       fontSizeMode === 'normal' 
                         ? 'lg:w-[35%]' 
                         : fontSizeMode === 'large' 
                           ? 'lg:w-[42%]' 
                           : 'lg:w-[48%]'
                     }\`}>
                       <div className={\`p-5 md:p-7 rounded-[2rem] border-4 relative overflow-hidden animate-fade-in shadow-2xl h-fit \${currentQ.type === QuestionType.VISUAL_ANALYSIS ? 'bg-secondary/5 border-secondary/30 neon-glow-secondary' : 'bg-primary/5 border-primary/30 neon-glow-primary'}\`}>
                         <div className="flex items-center gap-2 mb-2 opacity-80">
                           {currentQ.type === QuestionType.VISUAL_ANALYSIS ? <Eye className="w-4 h-4 md:w-6 md:h-6 text-secondary" /> : <BookOpen className="w-4 h-4 md:w-6 md:h-6 text-primary" />}
                           <span className="text-xs md:text-sm font-headline font-extrabold uppercase tracking-widest italic leading-none">
                             {currentQ.type === QuestionType.VISUAL_ANALYSIS ? 'Visual Context' : 'Read Case Study'}
                           </span>
                         </div>
                         <p className={\`text-on-surface font-body font-bold leading-relaxed italic opacity-90 overflow-y-auto custom-scrollbar pr-1 transition-all duration-300 \${
                           fontSizeMode === 'normal' 
                             ? 'text-sm md:text-base lg:text-lg max-h-[35vh]' 
                             : fontSizeMode === 'large' 
                               ? 'text-base md:text-[1.35rem] lg:text-[1.5rem] max-h-[45vh]' 
                               : 'text-lg md:text-[1.65rem] lg:text-[1.85rem] max-h-[55vh] leading-loose'
                         }\`}>
                           {currentQ.contextMaterial}
                         </p>
                       </div>
                     </div>
                   )}

                   {/* Right Column */}
                   <div className={\`space-y-4 md:space-y-5 flex flex-col w-full \${currentQ.contextMaterial ? 'lg:flex-1' : 'max-w-4xl lg:max-w-5xl w-full'}\`}>
                     {/* Question Card */}
                     <div className="bg-surface-container-lowest/80 glass-card p-4 md:p-6 lg:p-8 rounded-[1.2rem] md:rounded-[2rem] border border-white/10 shadow-lg relative overflow-hidden h-fit">
                        <div className={\`absolute top-0 left-0 w-2 md:w-2.5 h-full \${currentQ.type === QuestionType.WORD_PROBLEM ? 'bg-tertiary' : 'bg-primary'}\`}></div>
                        <div className="flex justify-between items-start gap-3 md:gap-4">
                          <h2 className={\`font-body font-bold text-on-surface leading-snug tv-text-shadow flex-1 transition-all duration-300 \${
                            fontSizeMode === 'normal' 
                              ? 'text-base md:text-xl lg:text-2xl' 
                              : fontSizeMode === 'large' 
                                ? 'text-lg md:text-[1.6rem] lg:text-[1.95rem]' 
                                : 'text-xl md:text-[2rem] lg:text-[2.5rem] lg:leading-normal'
                          }\`}>
                            {currentQ.text}
                          </h2>
                          <button 
                            onClick={handleReadAloud} 
                            className={\`p-2.5 md:p-3.5 rounded-xl md:rounded-2xl border transition-all flex-none mt-0.5 \${isReadingAloud ? 'bg-primary text-on-primary border-primary animate-pulse' : 'bg-surface text-primary border-primary/20 hover:bg-primary/10'}\`}
                            title={isReadingAloud ? "Stop Reading" : "Read Aloud"}
                          >
                            {isReadingAloud ? <VolumeX className="w-4 h-4 md:w-5 md:h-5" /> : <Volume2 className="w-4 h-4 md:w-5 md:h-5" />}
                          </button>
                        </div>
                     </div>

                     {/* Options Grid */}
                     <div className="grid grid-cols-1 gap-2.5 md:gap-3 flex-1">
                       {currentQ.options.map((opt, i) => {
                         let style = "bg-surface-container-lowest/50 border-white/5 text-on-surface hover:border-primary/50 hover:bg-primary/5";
                         if (feedback) {
                           if (i === currentQ.correctIndex) style = "bg-secondary/20 border-secondary text-on-surface ring-4 ring-secondary/10 neon-glow-secondary";
                           else if (i === feedback.selected && !feedback.isCorrect) style = "bg-error/20 border-error text-on-surface ring-4 ring-error/10 neon-glow-error";
                           else style = "opacity-30 grayscale pointer-events-none";
                         }
                         return (
                           <button 
                             key={i} 
                             disabled={!!feedback} 
                             onClick={() => handleMCQ(i)} 
                             className={\`w-full text-left rounded-[1.2rem] md:rounded-[1.8rem] border-2 transition-all flex items-center \${
                               fontSizeMode === 'normal' 
                                 ? 'p-2.5 md:p-4 lg:p-5 gap-3 md:gap-4 min-h-[56px]' 
                                 : fontSizeMode === 'large' 
                                   ? 'p-3 md:p-5 lg:p-6 gap-4 md:gap-6 min-h-[68px]' 
                                   : 'p-4 md:p-6 lg:p-8 gap-5 md:gap-8 min-h-[85px]'
                             } \${style} active:scale-95 group shadow-lg h-fit\`}
                           >
                              <span className={\`rounded-xl flex items-center justify-center font-headline font-extrabold flex-none transition-all duration-300 \${
                                fontSizeMode === 'normal' 
                                  ? 'w-8 h-8 md:w-10 md:h-10 lg:w-11 lg:h-11 text-sm md:text-base' 
                                  : fontSizeMode === 'large' 
                                    ? 'w-10 h-10 md:w-11 md:h-11 lg:w-14 lg:h-14 text-base md:text-lg' 
                                    : 'w-12 h-12 md:w-14 md:h-14 lg:w-18 lg:h-18 text-lg md:text-2xl'
                              } \${feedback && i === currentQ.correctIndex ? 'bg-secondary text-on-secondary shadow-md' : 'bg-surface-container text-outline group-hover:bg-primary/20 group-hover:text-primary'}\`}>{String.fromCharCode(65 + i)}</span>
                              <span className={\`font-body font-bold leading-tight md:leading-snug transition-all duration-300 \${
                                fontSizeMode === 'normal' 
                                  ? 'text-xs md:text-sm lg:text-base' 
                                  : fontSizeMode === 'large' 
                                    ? 'text-sm md:text-base lg:text-lg' 
                                    : 'text-base md:text-[1.35rem] lg:text-[1.65rem] leading-normal'
                              }\`}>{opt}</span>
                           </button>
                         );
                       })}
                     </div>

                     {/* Integrated Feedback Panel */}
                     {feedback && (
                       <div className="p-4 md:p-6 bg-surface-container-lowest/90 backdrop-blur-xl rounded-[1.2rem] md:rounded-[2.5rem] border border-white/10 animate-fade-in space-y-3 shadow-2xl mt-2 w-full">
                         <div className="flex justify-between items-center border-b border-white/5 pb-4">
                            <p className={\`font-headline font-extrabold uppercase text-primary tracking-widest italic transition-all duration-300 \${fontSizeMode === 'normal' ? 'text-xs md:text-sm' : 'text-sm md:text-[1.2rem]'}\`}>Expert Explanation</p>
                         </div>
                         <p className={\`font-body font-bold text-on-surface-variant leading-relaxed italic opacity-90 transition-all duration-300 \${fontSizeMode === 'normal' ? 'text-xs md:text-sm lg:text-base' : fontSizeMode === 'large' ? 'text-sm md:text-base lg:text-[1.35rem]' : 'text-base md:text-[1.35rem] lg:text-[1.75rem]'}\`}>{currentQ.explanation}</p>
                         
                         {currentQ.inquiryPrompt && (
                           <div className="mt-3 p-4 md:p-5 bg-primary/10 rounded-[1rem] border border-primary/20 space-y-2 neon-glow-primary">
                             <div className="flex items-center gap-3 text-primary">
                               <Sparkles className={\`transition-all duration-300 \${fontSizeMode === 'normal' ? 'w-4 h-4' : 'w-5 h-5'}\`} />
                               <span className={\`font-headline font-extrabold uppercase tracking-widest italic leading-none transition-all duration-300 \${fontSizeMode === 'normal' ? 'text-[10px] md:text-xs' : 'text-xs md:text-sm lg:text-[1.1rem]'}\`}>Further Inquiry</span>
                             </div>
                             <p className={\`font-body font-bold text-on-surface leading-relaxed italic transition-all duration-300 \${fontSizeMode === 'normal' ? 'text-xs md:text-sm' : 'text-sm md:text-base lg:text-[1.35rem]'}\`}>
                               {currentQ.inquiryPrompt}
                             </p>
                           </div>
                         )}

                         {!feedback.isCorrect && (
                           <Button onClick={nextQuestion} className="h-20 rounded-[2.5rem] font-headline font-extrabold uppercase text-sm shadow-2xl shadow-primary/40 neon-glow-primary">Next Question</Button>
                         )}
                       </div>
                     )}
                   </div>
                </div>
              </div>
            </div>
         )}\n\n`;

  content = beforeSection + perfectQuizContent + afterSection;
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log("SUCCESS: Entire QUIZ screen section repaired perfectly!");
}
