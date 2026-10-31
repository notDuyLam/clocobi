import { Logger } from '@nestjs/common';
import { CloudflareProvider, toImageError } from './cloudflare.provider.js';

describe('toImageError', () => {
  it.each([
    [400, { errors: [{ code: 8007, message: 'NSFW' }] }, 'IMAGE_REJECTED', 422],
    [429, {}, 'IMAGE_QUOTA_EXHAUSTED', 503],
    [
      400,
      {
        errors: [
          {
            code: 1,
            message:
              'You have used up your daily free allocation of 10,000 neurons',
          },
        ],
      },
      'IMAGE_QUOTA_EXHAUSTED',
      503,
    ],
    [500, { errors: [{ code: 1, message: 'boom' }] }, 'IMAGE_FAILED', 502],
  ])('HTTP %i %j → %s', (status, body, code, httpStatus) => {
    const e = toImageError(status, body);
    expect(e.code).toBe(code);
    expect(e.getStatus()).toBe(httpStatus);
  });
});

describe('CloudflareProvider.generateOutfitImage', () => {
  beforeAll(() => {
    Object.assign(process.env, {
      CF_ACCOUNT_ID: 'acc',
      CF_API_TOKEN: 'tok',
      CF_IMAGE_MODEL: '@cf/black-forest-labs/flux-2-klein-9b',
      CF_IMAGE_WIDTH: '768',
      CF_IMAGE_HEIGHT: '1024',
    });
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts multipart form data and decodes the base64 image', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          success: true,
          result: { image: Buffer.from('png').toString('base64') },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const ref = { data: Buffer.from('ref'), mimeType: 'image/png' };
    const out = await new CloudflareProvider().generateOutfitImage(
      [ref, ref, ref, ref, ref],
      'A photo',
    );
    expect(out).toEqual(Buffer.from('png'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc/ai/run/@cf/black-forest-labs/flux-2-klein-9b',
    );
    expect(init.headers).toEqual({ authorization: 'Bearer tok' });
    const form = init.body as FormData;
    expect(form.get('prompt')).toBe('A photo');
    expect(form.get('width')).toBe('768');
    expect(form.get('height')).toBe('1024');
    expect(form.get('seed')).toMatch(/^\d+$/);
    expect(form.has('input_image_3')).toBe(true);
    expect(form.has('input_image_4')).toBe(false);
  });

  it('maps an error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { success: false, errors: [{ code: 8007 }] },
            { status: 400 },
          ),
        ),
      ),
    );
    await expect(
      new CloudflareProvider().generateOutfitImage([], 'p'),
    ).rejects.toMatchObject({ code: 'IMAGE_REJECTED' });
  });

  it('maps a timeout and a network error', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(timeout)),
    );
    await expect(
      new CloudflareProvider().generateOutfitImage([], 'p'),
    ).rejects.toMatchObject({ code: 'IMAGE_TIMEOUT' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('down'))),
    );
    await expect(
      new CloudflareProvider().generateOutfitImage([], 'p'),
    ).rejects.toMatchObject({ code: 'IMAGE_FAILED' });
  });
});
