import * as fs from 'fs';

const filePath = './App.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Normalize line endings to LF
content = content.replace(/\r\n/g, '\n');

// Find the index of the options loop ending
const searchStr = '                       })}';
const loopEndIdx = content.indexOf(searchStr);

if (loopEndIdx === -1) {
  console.log('ERROR: Could not find loop ending.');
} else {
  // Find the index of the feedback block start
  const feedbackStartIdx = content.indexOf('             {feedback && (', loopEndIdx);
  if (feedbackStartIdx === -1) {
    console.log('ERROR: Could not find feedback block start.');
  } else {
    // Find the ending condition close
    const condCloseIdx = content.indexOf('         )}', feedbackStartIdx);
    if (condCloseIdx === -1) {
      console.log('ERROR: Could not find condition close.');
    } else {
      console.log('Indexes found! Slicing and repairing the file...');
      
      const beforeLoop = content.substring(0, loopEndIdx);
      const afterQuiz = content.substring(condCloseIdx + 11); // skips past '         )}'
      
      const replacementBlock = `                       })}
                    </div>

                    {/* Integrated Inline Feedback Panel for elegant TV/presentation layout */}
                    {feedback && (
                      <div className="p-4 md:p-6 bg-surface-container-lowest/90 backdrop-blur-xl rounded-[1.2rem] md:rounded-[2.5rem] border border-white/10 animate-fade-in space-y-3 shadow-2xl mt-2 w-full">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                           <p className="font-headline font-extrabold uppercase text-primary tracking-widest italic text-sm">Expert Explanation</p>
                        </div>
                        <p className="font-body font-bold text-on-surface-variant leading-relaxed italic opacity-90 text-[1.1rem] md:text-[1.35rem] lg:text-[1.75rem]">{currentQ.explanation}</p>
                        
                        {currentQ.inquiryPrompt && (
                          <div className="mt-3 p-4 md:p-5 bg-primary/10 rounded-[1rem] border border-primary/20 space-y-2 neon-glow-primary">
                            <div className="flex items-center gap-2 text-primary">
                              <span className="font-headline font-extrabold uppercase tracking-widest italic leading-none text-xs">Further Inquiry</span>
                            </div>
                            <p className="font-body font-bold text-on-surface leading-relaxed italic text-sm">
                              {currentQ.inquiryPrompt}
                            </p>
                          </div>
                        )}

                        {!feedback.isCorrect && (
                          <Button onClick={nextQuestion} className="h-14 rounded-[1.5rem] font-headline font-extrabold uppercase text-xs shadow-xl shadow-primary/40 neon-glow-primary w-full mt-2">Next Question</Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
         )}`;

      content = beforeLoop + replacementBlock + afterQuiz;
      console.log('SUCCESS: Sliced and balanced elements.');
    }
  }
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Completed.');
