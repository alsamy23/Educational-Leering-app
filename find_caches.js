import { execSync } from 'child_process';

try {
  console.log("Searching for index.js or main.js or other caches...");
  const searchResult = execSync('find /app/applet -name "*.js" -o -name "*.json" 2>/dev/null', { encoding: 'utf-8' });
  console.log(searchResult);
} catch (error) {
  console.error("Error finding files:", error);
}
