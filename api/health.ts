import { handleHealth } from './_lib/quizService.js';

export default async function handler(req: any, res: any) {
  try {
    return await handleHealth(req, res);
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: err?.message || 'Health check error' }));
  }
}
