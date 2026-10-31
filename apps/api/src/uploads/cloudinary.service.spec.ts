import { Logger } from '@nestjs/common';
import { CloudinaryService, signParams } from './cloudinary.service.js';

describe('signParams', () => {
  it('matches the example in the Cloudinary signing docs', () => {
    expect(
      signParams(
        {
          timestamp: 1315060510,
          public_id: 'sample_image',
          eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
        },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });
});

describe('CloudinaryService.destroy', () => {
  beforeAll(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['a network error', () => Promise.reject(new Error('down'))],
    [
      'an error response',
      () => Promise.resolve(Response.json({ error: 'x' }, { status: 500 })),
    ],
  ])('logs and does not throw on %s', async (_, fetchImpl) => {
    vi.stubGlobal('fetch', vi.fn(fetchImpl));
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    await expect(
      new CloudinaryService().destroy('clocobi/u/items/clean/x'),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('sends a signed destroy request', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json({ result: 'ok' })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await new CloudinaryService().destroy('clocobi/u/items/clean/x');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.cloudinary.com/v1_1/demo/image/destroy');
    const body = init.body as URLSearchParams;
    expect(body.get('public_id')).toBe('clocobi/u/items/clean/x');
    expect(body.get('signature')).toBe(
      signParams(
        {
          public_id: 'clocobi/u/items/clean/x',
          timestamp: body.get('timestamp')!,
        },
        'secret',
      ),
    );
  });
});
