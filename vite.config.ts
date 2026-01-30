
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load environment variables from the current directory
  // Added type assertion to process to fix "Property 'cwd' does not exist on type 'Process'" error which occurs in some TypeScript environments missing Node.js type definitions.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Satisfies the requirement to use process.env.API_KEY in the application code
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY || '')
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
