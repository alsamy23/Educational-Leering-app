import { handleGenerateSpeech } from './_lib/quizService.ts';

export const maxDuration = 30;

export default async function handler(req: any, res: any) {
  return handleGenerateSpeech(req, res);
}
