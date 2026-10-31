import { Logger } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { env } from '../common/env.js';

const logger = new Logger('Gemini');

const failed = () =>
  new ApiError(502, 'AI_FAILED', 'The AI service failed. Please try again.');
const timedOut = () =>
  new ApiError(
    504,
    'AI_TIMEOUT',
    'The AI service took too long. Please try again.',
  );
const isTimeout = (e: unknown) =>
  e instanceof Error && e.name === 'TimeoutError';

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
}

// One generateContent call with JSON output (TDD 4.1). Starts at a random key; only 429 moves
// to the next key. All keys 429 → AI_QUOTA_EXHAUSTED, timeout → AI_TIMEOUT, anything else → AI_FAILED.
export async function generateJson(
  model: string,
  parts: object[],
  responseSchema: object,
  timeoutMs: number,
): Promise<unknown> {
  const keys = env('GEMINI_API_KEYS')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const start = Math.floor(Math.random() * keys.length);
  // One deadline for the whole call, so 429 retries never stretch it.
  const signal = AbortSignal.timeout(timeoutMs);
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema },
  });

  for (let i = 0; i < keys.length; i++) {
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': keys[(start + i) % keys.length],
            'content-type': 'application/json',
          },
          body,
          signal,
        },
      );
    } catch (e) {
      if (isTimeout(e)) throw timedOut();
      logger.error(`${model} request failed: ${String(e)}`);
      throw failed();
    }
    if (res.status === 429) continue;
    try {
      if (!res.ok) {
        logger.error(
          `${model} HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`,
        );
        throw failed();
      }
      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.find(
        (p) => typeof p.text === 'string' && !p.thought,
      )?.text;
      if (text === undefined) throw new Error('no text in response');
      return JSON.parse(text);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (isTimeout(e)) throw timedOut();
      logger.error(`${model} unusable response: ${String(e)}`);
      throw failed();
    }
  }
  throw new ApiError(
    503,
    'AI_QUOTA_EXHAUSTED',
    'The AI quota is used up. Try again later.',
  );
}
