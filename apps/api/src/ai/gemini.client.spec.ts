import { Logger } from '@nestjs/common';
import { generateJson } from './gemini.client.js';

const ok = (obj: unknown) =>
  Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }],
  });
const status = (s: number) => new Response('{}', { status: s });
const keyOf = (call: unknown[]) =>
  ((call[1] as RequestInit).headers as Record<string, string>)[
    'x-goog-api-key'
  ];

describe('generateJson', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const run = () => generateJson('m', [{ text: 'hi' }], {}, 1000);

  beforeEach(() => {
    process.env.GEMINI_API_KEYS = 'k1, k2,k3';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // start at k2
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the parsed JSON and starts at the random key', async () => {
    fetchMock.mockResolvedValueOnce(ok({ a: 1 }));
    await expect(run()).resolves.toEqual({ a: 1 });
    expect(keyOf(fetchMock.mock.calls[0])).toBe('k2');
  });

  it('skips thought parts', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: 'hmm', thought: true }, { text: '{"a":2}' }],
            },
          },
        ],
      }),
    );
    await expect(run()).resolves.toEqual({ a: 2 });
  });

  it('moves to the next key only on 429, wrapping around', async () => {
    fetchMock
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(ok({ a: 3 }));
    await expect(run()).resolves.toEqual({ a: 3 });
    expect(fetchMock.mock.calls.map(keyOf)).toEqual(['k2', 'k3', 'k1']);
  });

  it('returns AI_QUOTA_EXHAUSTED when every key is 429', async () => {
    fetchMock.mockResolvedValue(status(429));
    await expect(run()).rejects.toMatchObject({ code: 'AI_QUOTA_EXHAUSTED' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns AI_FAILED on another HTTP error without trying other keys', async () => {
    fetchMock.mockResolvedValue(status(500));
    await expect(run()).rejects.toMatchObject({ code: 'AI_FAILED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'text that is not JSON',
      () =>
        Promise.resolve(
          Response.json({
            candidates: [{ content: { parts: [{ text: 'not json' }] } }],
          }),
        ),
    ],
    ['no candidates', () => Promise.resolve(Response.json({ candidates: [] }))],
  ])('returns AI_FAILED on %s', async (_, impl) => {
    fetchMock.mockImplementation(impl);
    await expect(run()).rejects.toMatchObject({ code: 'AI_FAILED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns AI_TIMEOUT when the deadline passes', async () => {
    fetchMock.mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(init.signal!.reason),
          ),
        ),
    );
    await expect(generateJson('m', [], {}, 20)).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });
  });
});
