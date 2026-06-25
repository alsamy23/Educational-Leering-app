import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' loads all env vars regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || env.API_KEY || process.env.API_KEY || '';

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.GEMINI_API_KEY_SECONDARY': JSON.stringify(env.GEMINI_API_KEY_SECONDARY || process.env.GEMINI_API_KEY_SECONDARY || ''),
      'process.env.GEMINI_API_KEY_TERTIARY': JSON.stringify(env.GEMINI_API_KEY_TERTIARY || process.env.GEMINI_API_KEY_TERTIARY || ''),
      'process.env.GEMINI_API_KEY_4': JSON.stringify(env.GEMINI_API_KEY_4 || process.env.GEMINI_API_KEY_4 || ''),
      'process.env.GEMINI_API_KEY_5': JSON.stringify(env.GEMINI_API_KEY_5 || process.env.GEMINI_API_KEY_5 || ''),
      'process.env.GEMINI_API_KEY_6': JSON.stringify(env.GEMINI_API_KEY_6 || process.env.GEMINI_API_KEY_6 || ''),
      'process.env.GEMINI_API_KEY_7': JSON.stringify(env.GEMINI_API_KEY_7 || process.env.GEMINI_API_KEY_7 || ''),
      'process.env.GEMINI_API_KEY_8': JSON.stringify(env.GEMINI_API_KEY_8 || process.env.GEMINI_API_KEY_8 || ''),
      'process.env.GEMINI_API_KEY_9': JSON.stringify(env.GEMINI_API_KEY_9 || process.env.GEMINI_API_KEY_9 || ''),
      'process.env.GEMINI_API_KEY_10': JSON.stringify(env.GEMINI_API_KEY_10 || process.env.GEMINI_API_KEY_10 || ''),
      'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY || process.env.GROQ_API_KEY || ''),
      'process.env.GROK_API_KEY': JSON.stringify(env.GROK_API_KEY || process.env.GROK_API_KEY || env.XAI_API_KEY || process.env.XAI_API_KEY || ''),
      'process.env.XAI_API_KEY': JSON.stringify(env.XAI_API_KEY || process.env.XAI_API_KEY || env.GROK_API_KEY || process.env.GROK_API_KEY || '')
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