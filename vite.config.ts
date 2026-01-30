import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Use '.' to refer to the project root directory where the .env files are located
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    define: {
      // Direct injection of the API key into the process.env object used by the app
      'process.env.API_KEY': JSON.stringify(env.API_KEY || '')
    },
    server: {
      port: 3000,
      host: true
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});