import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IMAGE_GEN } from './../src/ai/image-gen.provider.js';
import { AppModule } from './../src/app.module.js';
import { ApiError } from './../src/common/api-error.js';
import { ACCESS_TTL, signToken } from './../src/auth/tokens.js';
import { PrismaService } from './../src/prisma.service.js';

const userId = '6f1c2d7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const outfitId = '00000000-0000-4000-8000-0000000000aa';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CDN = 'https://res.cloudinary.com/demo/image/upload';
const item = (n: number, category: string, clean = true) => ({
  id: id(n),
  category,
  subcategory: category.toLowerCase(),
  primaryColor: 'black',
  secondaryColor: null,
  pattern: 'solid',
  fabric: 'cotton',
  originalPublicId: `orig/${n}`,
  cleanPublicId: clean ? `clean/${n}` : null,
});
// Stored in an order different from the reference order on purpose.
const ITEMS = [
  item(6, 'ACCESSORY'),
  item(4, 'SHOES', false),
  item(5, 'OUTERWEAR'),
  item(2, 'BOTTOM'),
  item(1, 'TOP'),
];

describe('POST /outfits/:id/image (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let outfit: Record<string, any>;
  const generate = vi.fn();
  const fetchMock = vi.fn();
  const seenUserIds: unknown[] = [];

  beforeAll(async () => {
    Object.assign(process.env, {
      JWT_ACCESS_SECRET: 'test-access-secret',
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
    });
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    token = await signToken(userId, 'JWT_ACCESS_SECRET', ACCESS_TTL);
    const prisma = {
      outfit: {
        findFirst: async ({
          where,
        }: {
          where: { id: string; userId: string };
        }) => {
          seenUserIds.push(where.userId);
          return where.id === outfitId ? structuredClone(outfit) : null;
        },
        update: async ({
          where,
          data,
        }: {
          where: { userId: string };
          data: object;
        }) => {
          seenUserIds.push(where.userId);
          return Object.assign(outfit, data);
        },
      },
      item: {
        findMany: async ({
          where,
        }: {
          where: { id: { in: string[] }; userId: string };
        }) => {
          seenUserIds.push(where.userId);
          return ITEMS.filter((i) => where.id.in.includes(i.id));
        },
      },
      styleProfile: {
        findUnique: async ({ where }: { where: { userId: string } }) => {
          seenUserIds.push(where.userId);
          return { clothingCategory: 'Menswear' };
        },
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(IMAGE_GEN)
      .useValue({ generateOutfitImage: generate })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    outfit = {
      id: outfitId,
      userId,
      occasionId: id(99),
      occasion: { name: 'Work' },
      stylingTips: 'Tips',
      liked: false,
      imagePublicId: 'clocobi/u/outfits/old',
      createdAt: new Date(),
      updatedAt: new Date(),
      items: ITEMS.map((i, n) => ({
        id: id(100 + n),
        itemId: i.id,
        slot: i.category,
        item: i,
      })),
    };
    generate.mockReset();
    generate.mockResolvedValue(Buffer.from('png'));
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/destroy')
        ? Response.json({ result: 'ok' })
        : url.endsWith('/image/upload')
          ? Response.json({ public_id: 'x' })
          : new Response(Buffer.from(url), {
              headers: { 'content-type': 'image/png' },
            }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => app.close());

  const post = (oid = outfitId) =>
    request(app.getHttpServer())
      .post(`/outfits/${oid}/image`)
      .set('Authorization', `Bearer ${token}`);
  const calls = (suffix: string) =>
    fetchMock.mock.calls.filter(([u]) => String(u).endsWith(suffix));

  it('returns 404 for a missing outfit', async () => {
    await post(id(999)).expect(404);
  });

  it('generates, uploads, stores and replaces the image', async () => {
    const res = await post().expect(200);

    const refUrls = fetchMock.mock.calls
      .map(([u]) => String(u))
      .filter((u) => u.includes('c_limit'));
    expect(refUrls).toEqual([
      `${CDN}/c_limit,w_500,h_500/clean/1`,
      `${CDN}/c_limit,w_500,h_500/clean/2`,
      `${CDN}/c_limit,w_500,h_500/orig/4`,
      `${CDN}/c_limit,w_500,h_500/clean/5`,
    ]);
    const [refs, prompt] = generate.mock.calls[0];
    expect(refs).toHaveLength(4);
    expect(refs[0]).toEqual({
      data: Buffer.from(refUrls[0]),
      mimeType: 'image/png',
    });
    expect(prompt).toContain('of a man wearing');
    expect(prompt).toContain('black cotton accessory (accessory)');

    const form = calls('/image/upload')[0][1].body as FormData;
    const publicId = form.get('public_id') as string;
    expect(publicId).toMatch(
      new RegExp(`^clocobi/${userId}/outfits/[0-9a-f-]{36}$`),
    );
    expect(outfit.imagePublicId).toBe(publicId);
    expect(res.body.imageUrl).toBe(`${CDN}/${publicId}`);
    expect(
      (calls('/destroy')[0][1].body as URLSearchParams).get('public_id'),
    ).toBe('clocobi/u/outfits/old');
  });

  it('returns 409 OUTFIT_INCOMPLETE when a required item is gone', async () => {
    outfit.items[1].item = null;
    outfit.items[1].itemId = null;
    const res = await post().expect(409);
    expect(res.body.error.code).toBe('OUTFIT_INCOMPLETE');
    expect(generate).not.toHaveBeenCalled();
  });

  it('keeps the previous image when generation fails', async () => {
    generate.mockRejectedValue(
      new ApiError(503, 'IMAGE_QUOTA_EXHAUSTED', 'Quota used up.'),
    );
    const res = await post().expect(503);
    expect(res.body.error.code).toBe('IMAGE_QUOTA_EXHAUSTED');
    expect(outfit.imagePublicId).toBe('clocobi/u/outfits/old');
    expect(calls('/destroy')).toEqual([]);
  });

  it('scopes every query to the token user', () => {
    expect(new Set(seenUserIds)).toEqual(new Set([userId]));
  });
});
