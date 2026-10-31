import { GeminiProvider, toClothingTags } from './gemini.provider.js';

describe('toClothingTags', () => {
  it('keeps valid values and normalizes text', () => {
    expect(
      toClothingTags({
        category: 'SHOES',
        subcategory: ' Sneakers ',
        primaryColor: 'gray',
        secondaryColor: null,
        pattern: 'solid',
        fabric: 'Suede',
        fit: 'regular',
        seasons: ['mild', 'hot'],
        formality: 'smart casual',
        aiNote: ' Clean gray sneakers. ',
      }),
    ).toEqual({
      category: 'SHOES',
      subcategory: 'sneakers',
      primaryColor: 'gray',
      secondaryColor: null,
      pattern: 'solid',
      fabric: 'suede',
      fit: 'regular',
      seasons: ['hot', 'mild'],
      formality: 'smart casual',
      aiNote: 'Clean gray sneakers.',
    });
  });

  it('turns values outside the lists into null and drops bad seasons', () => {
    expect(
      toClothingTags({
        category: 'HAT',
        subcategory: '',
        primaryColor: 'teal',
        secondaryColor: 'Navy',
        pattern: 7,
        fabric: 'x'.repeat(50),
        seasons: ['cold', 'winter', 'cold'],
        aiNote: 'y'.repeat(400),
      }),
    ).toMatchObject({
      category: null,
      subcategory: null,
      primaryColor: null,
      secondaryColor: null,
      pattern: null,
      fabric: 'x'.repeat(40),
      fit: null,
      seasons: ['cold'],
      formality: null,
      aiNote: 'y'.repeat(300),
    });
  });

  it.each([null, 'text', [1]])('rejects a non-object response %j', (raw) => {
    expect(() => toClothingTags(raw)).toThrow(
      expect.objectContaining({ code: 'AI_FAILED' }),
    );
  });
});

describe('GeminiProvider.tagClothing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the photo inline to the tag model', async () => {
    process.env.GEMINI_API_KEYS = 'k1';
    process.env.GEMINI_MODEL_TAG = 'tag-model';
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          candidates: [
            { content: { parts: [{ text: '{"category":"TOP"}' }] } },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const tags = await new GeminiProvider().tagClothing({
      data: Buffer.from('img'),
      mimeType: 'image/jpeg',
    });
    expect(tags.category).toBe('TOP');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/models/tag-model:generateContent');
    const part = JSON.parse(init.body as string).contents[0].parts[0];
    expect(part).toEqual({
      inline_data: {
        mime_type: 'image/jpeg',
        data: Buffer.from('img').toString('base64'),
      },
    });
  });
});
