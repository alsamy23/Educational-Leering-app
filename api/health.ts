import { handleHealth } from './_lib/quizService.ts';

export default async function handler(req: any, res: any) {
  return handleHealth(req, res);
}
