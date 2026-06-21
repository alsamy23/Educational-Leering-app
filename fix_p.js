import fs from 'fs';

const filePath = './App.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

const searchStr = "Further Inquiry</span>";
const titleIdx = content.indexOf(searchStr);

if (titleIdx === -1) {
  console.log("ERROR: title string not found");
} else {
  const pStartIdx = content.indexOf("<p class", titleIdx);
  const pEndIdx = content.indexOf("</p>", pStartIdx);
  
  if (pStartIdx !== -1 && pEndIdx !== -1) {
    const beforeStr = content.substring(0, pStartIdx);
    const afterStr = content.substring(pEndIdx + 4);
    
    const replacementStr = `<p className={\`font-body font-bold text-on-surface leading-relaxed italic transition-all duration-300 \${fontSizeMode === 'normal' ? 'text-xs md:text-sm' : fontSizeMode === 'large' ? 'text-sm md:text-base lg:text-[1.3rem]' : 'text-base md:text-[1.3rem] lg:text-[1.65rem] leading-normal'}\`}>
                        {currentQ.inquiryPrompt}
                      </p>`;
    
    content = beforeStr + replacementStr + afterStr;
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log("SUCCESS: Inquiry prompt block successfully parsed and repaired.");
  } else {
    console.log("ERROR: Could not locate <p> or </p> tags on lines.");
  }
}
