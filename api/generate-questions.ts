import { handleGenerateQuestions } from './_lib/quizService.js';

export const maxDuration = 60;

export default async function handler(req: any, res: any) {
  return handleGenerateQuestions(req, res);
}
