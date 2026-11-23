import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleHealth, handleGenerateQuestions, handleGenerateSpeech } from './api/_lib/quizService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolvePort = (): number => {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      const p = Number(argv[i + 1]);
      if (Number.isFinite(p) && p > 0) return p;
    } else if (arg.startsWith('--port=')) {
      const p = Number(arg.slice('--port='.length));
      if (Number.isFinite(p) && p > 0) return p;
    }
  }
  return Number(process.env.PORT) || 3000;
};

const PORT = resolvePort();
const IS_PROD = process.env.NODE_ENV === 'production';

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (req: Request, res: Response) => {
    void handleHealth(req, res);
  });

  app.post('/api/generate-questions', (req: Request, res: Response) => {
    void handleGenerateQuestions(req, res);
  });

  app.post('/api/generate-speech', (req: Request, res: Response) => {
    void handleGenerateSpeech(req, res);
  });

  const serveStaticDist = () => {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  };

  if (!IS_PROD) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    } catch {
      serveStaticDist();
    }
  } else {
    serveStaticDist();
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ScholarEarn server running on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`);
  });
}

createApp();
