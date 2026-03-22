import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' loads all env vars regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || env.API_KEY || process.env.API_KEY || '';

  return {
    plugins: [react()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY || process.env.GROQ_API_KEY || '')
    },
    server: {
      host: true,
      port: 3000
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});