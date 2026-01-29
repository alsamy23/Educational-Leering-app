
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // Use a type assertion to 'any' for process to bypass missing 'cwd' property error on the Process type definition.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Polyfill process.env.API_KEY so the existing code works in the browser/production
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});
