import { execSync } from 'child_process';

try {
  console.log("Searching for App.tsx files...");
  const searchResult = execSync('find / -name "App.tsx*" 2>/dev/null', { encoding: 'utf-8' });
  console.log(searchResult);
} catch (error) {
  console.error("Error finding files:", error);
}
