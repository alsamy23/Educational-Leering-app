import { execSync } from 'child_process';
import fs from 'fs';

try {
  const path = '/.gemini/antigravity/brain/7bc66b5d-bb96-4f78-a899-3d33a71593bd/.system_generated/logs/transcript.jsonl';
  if (fs.existsSync(path)) {
    console.log("Found transcript.jsonl under .gemini!");
  } else {
    console.log("Path does not exist under /.gemini. Searching for any .jsonl or logs...");
    const search = execSync('find / -name "*.jsonl" 2>/dev/null', { encoding: 'utf-8' });
    console.log(search);
  }
} catch (error) {
  console.error("Error checking path:", error);
}
