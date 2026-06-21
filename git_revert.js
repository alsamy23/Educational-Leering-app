import { execSync } from 'child_process';

try {
  console.log("Running git status...");
  const status = execSync('git status', { encoding: 'utf-8' });
  console.log(status);

  console.log("Reverting App.tsx to git head...");
  const revert = execSync('git checkout App.tsx', { encoding: 'utf-8' });
  console.log(revert);
  console.log("SUCCESS: Reverted App.tsx.");
} catch (error) {
  console.error("ERROR running git command:", error);
}
