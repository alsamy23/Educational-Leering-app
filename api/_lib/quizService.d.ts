import type { IncomingMessage, ServerResponse } from 'node:http';

export type ApiRequest = IncomingMessage & { body?: any; method?: string };
export type ApiResponse = ServerResponse & { flushHeaders?: () => void };

export function handleHealth(req: ApiRequest, res: ApiResponse): Promise<void>;
export function handleGenerateQuestions(req: ApiRequest, res: ApiResponse): Promise<void>;
export function handleGenerateSpeech(req: ApiRequest, res: ApiResponse): Promise<void>;
