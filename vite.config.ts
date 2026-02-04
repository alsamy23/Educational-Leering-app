import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Prioritize the environment's pre-configured API_KEY
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY)
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