import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TEXT_AI } from './../src/ai/text-ai.provider.js';
import { AppModule } from './../src/app.module.js';
import { ACCESS_TTL, signToken } from './../src/auth/tokens.js';
import { PrismaService } from './../src/prisma.service.js';

const userId = '6f1c2d7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const otherUser = '11111111-2222-4333-8444-555555555555';
const orig = (n: string, u = userId) => `clocobi/${u}/items/original/${n}`;
const clean = (n: string, u = userId) => `clocobi/${u}/items/clean/${n}`;
const url = (id: string) =>
  `https://res.cloudinary.com/demo/image/upload/${id}`;
const complete = {
  category: 'TOP',
  subcategory: ' T-Shirt ',
  primaryColor: 'navy',
  pattern: 'solid',
  fabric: 'Cotton',
  fit: 'regular',
  formality: 'casual',
  seasons: ['hot', 'mild'],
};
const tags = { ...complete, subcategory: 't-shirt', fabric: 'cotton' };

type Row = Record<string, unknown> & { id: string; userId: string };
const matches = (row: Row, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, w]) => w === undefined || row[k] === w);

describe('Items (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let rows: Row[];
  let n = 0;
  let outfitUses = 0;
  const seenUserIds: unknown[] = [];
  const fetchMock = vi.fn();
  const tagClothing = vi.fn();

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';
    token = await signToken(userId, 'JWT_ACCESS_SECRET', ACCESS_TTL);
    const unique = (data: Record<string, unknown>, self?: Row) => {
      for (const k of ['originalPublicId', 'cleanPublicId']) {
        if (data[k] && rows.some((r) => r !== self && r[k] === data[k])) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
      }
    };
    const prisma = {
      item: {
        findFirst: ({ where }: { where: Row }) => {
          seenUserIds.push(where.userId);
          const row = rows.find((r) => matches(r, where));
          return row ? { ...row } : null;
        },
        findMany: ({ where }: { where: Row }) => {
          seenUserIds.push(where.userId);
          return rows.filter((r) => matches(r, where)).reverse();
        },
        // async like Prisma: errors reject instead of throwing.
        create: async ({ data }: { data: Row }) => {
          seenUserIds.push(data.userId);
          unique(data);
          const t = new Date(Date.UTC(2026, 10, 1, 0, 0, n));
          const row = {
            ...data,
            id: `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`,
            createdAt: t,
            updatedAt: t,
          };
          rows.push(row);
          return { ...row };
        },
        update: async ({ where, data }: { where: Row; data: Row }) => {
          seenUserIds.push(where.userId);
          const row = rows.find((r) => matches(r, where))!;
          unique(data, row);
          return { ...Object.assign(row, data) };
        },
        delete: ({ where }: { where: Row }) => {
          seenUserIds.push(where.userId);
          rows = rows.filter((r) => !matches(r, where));
        },
      },
      outfitItem: {
        count: ({ where }: { where: { outfit: { userId: string } } }) => {
          seenUserIds.push(where.outfit.userId);
          return outfitUses;
        },
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(TEXT_AI)
      .useValue({ tagClothing })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    rows = [];
    outfitUses = 0;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(Response.json({ result: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());
  const auth = { Authorization: '' };
  beforeEach(() => (auth.Authorization = `Bearer ${token}`));
  const post = (body: object) => http().post('/items').set(auth).send(body);
  const patch = (id: string, body: object) =>
    http().patch(`/items/${id}`).set(auth).send(body);
  const destroyed = () =>
    fetchMock.mock.calls
      .filter(([u]) => String(u).endsWith('/image/destroy'))
      .map(([, init]) => (init.body as URLSearchParams).get('public_id'));

  it('needs a token', async () => {
    const res = await http().get('/items').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  describe('POST /items/analyze', () => {
    it('downloads the photo and returns the proposed tags without saving', async () => {
      fetchMock.mockResolvedValue(
        new Response(Buffer.from('jpeg'), {
          headers: { 'content-type': 'image/jpeg' },
        }),
      );
      tagClothing.mockResolvedValue(tags);
      const res = await http()
        .post('/items/analyze')
        .set(auth)
        .send({ originalPublicId: orig('a') })
        .expect(200);
      expect(res.body).toEqual({ proposed: tags });
      expect(fetchMock.mock.calls[0][0]).toBe(url(orig('a')));
      expect(tagClothing).toHaveBeenCalledWith({
        data: Buffer.from('jpeg'),
        mimeType: 'image/jpeg',
      });
      expect(rows).toEqual([]);
    });

    it.each([
      ['another user folder', orig('a', otherUser)],
      ['the clean folder', clean('a')],
      ['a path escape', `${orig('a')}/../../x`],
    ])('rejects %s with 400 INVALID_PUBLIC_ID', async (_, id) => {
      const res = await http()
        .post('/items/analyze')
        .set(auth)
        .send({ originalPublicId: id })
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_PUBLIC_ID');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns 400 INVALID_PUBLIC_ID when the photo is not in Cloudinary', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 404 }));
      const res = await http()
        .post('/items/analyze')
        .set(auth)
        .send({ originalPublicId: orig('a') })
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_PUBLIC_ID');
    });
  });

  describe('POST /items', () => {
    it('creates a complete item and normalizes text', async () => {
      const res = await post({
        ...complete,
        originalPublicId: orig('a'),
        cleanPublicId: clean('a'),
        brand: '  ',
      }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        status: 'COMPLETE',
        ...tags,
        secondaryColor: null,
        aiNote: null,
        size: null,
        brand: null,
        notes: null,
        liked: false,
        originalUrl: url(orig('a')),
        cleanUrl: url(clean('a')),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('saves a draft with only the photo', async () => {
      const res = await post({
        originalPublicId: orig('a'),
        status: 'DRAFT',
      }).expect(201);
      expect(res.body).toMatchObject({
        status: 'DRAFT',
        category: null,
        seasons: [],
        cleanUrl: null,
      });
    });

    it('applies R1 to a complete item', async () => {
      const res = await post({
        originalPublicId: orig('a'),
        category: 'TOP',
      }).expect(400);
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: {
          fields: [
            'primaryColor',
            'pattern',
            'fabric',
            'fit',
            'formality',
            'seasons',
          ],
        },
      });
    });

    it.each([
      ['unknown color', { primaryColor: 'teal' }, ['primaryColor']],
      ['repeated season', { seasons: ['hot', 'hot'] }, ['seasons']],
      ['wrong-case category', { category: 'top' }, ['category']],
      [
        'subcategory too long',
        { subcategory: 'x'.repeat(41) },
        ['subcategory'],
      ],
      ['aiNote too long', { aiNote: 'x'.repeat(301) }, ['aiNote']],
      ['missing photo', { originalPublicId: undefined }, ['originalPublicId']],
    ])('rejects %s', async (_, p, fields) => {
      const res = await post({
        ...complete,
        originalPublicId: orig('a'),
        ...p,
      }).expect(400);
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields },
      });
    });

    it.each([
      ['original in the clean folder', { originalPublicId: clean('a') }],
      ['clean of another user', { cleanPublicId: clean('a', otherUser) }],
    ])('rejects %s with INVALID_PUBLIC_ID', async (_, p) => {
      const res = await post({
        ...complete,
        originalPublicId: orig('a'),
        ...p,
      }).expect(400);
      expect(res.body.error.code).toBe('INVALID_PUBLIC_ID');
    });

    it('rejects a public ID used by another item', async () => {
      await post({ ...complete, originalPublicId: orig('a') }).expect(201);
      const res = await post({
        ...complete,
        originalPublicId: orig('a'),
      }).expect(400);
      expect(res.body.error.code).toBe('INVALID_PUBLIC_ID');
    });
  });

  describe('GET /items and /items/summary', () => {
    beforeEach(async () => {
      await post({ ...complete, originalPublicId: orig('1') });
      await post({
        ...complete,
        category: 'SHOES',
        liked: true,
        originalPublicId: orig('2'),
      });
      await post({ originalPublicId: orig('3'), status: 'DRAFT', liked: true });
    });

    it('lists complete items newest first by default', async () => {
      const res = await http().get('/items').set(auth).expect(200);
      expect(
        res.body.items.map((i: { originalUrl: string }) => i.originalUrl),
      ).toEqual([url(orig('2')), url(orig('1'))]);
    });

    it.each([
      ['status=DRAFT', [orig('3')]],
      ['category=SHOES', [orig('2')]],
      ['liked=true', [orig('3'), orig('2')]],
      ['liked=true&status=COMPLETE', [orig('2')]],
    ])('filters by %s', async (q, ids) => {
      const res = await http().get(`/items?${q}`).set(auth).expect(200);
      expect(
        res.body.items.map((i: { originalUrl: string }) => i.originalUrl),
      ).toEqual(ids.map(url));
    });

    it.each(['status=draft', 'category=HAT', 'liked=yes'])(
      'rejects %s',
      async (q) => {
        const res = await http().get(`/items?${q}`).set(auth).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      },
    );

    it('summarizes counts, drafts and likes', async () => {
      const res = await http().get('/items/summary').set(auth).expect(200);
      expect(res.body).toEqual({
        counts: {
          TOP: 1,
          BOTTOM: 0,
          OUTERWEAR: 0,
          ONE_PIECE: 0,
          SHOES: 1,
          ACCESSORY: 0,
        },
        drafts: 1,
        liked: 2,
      });
    });
  });

  describe('GET, PATCH, DELETE /items/:id', () => {
    let id: string;
    beforeEach(async () => {
      id = (
        await post({
          ...complete,
          originalPublicId: orig('a'),
          cleanPublicId: clean('a'),
        })
      ).body.id;
    });

    it.each([
      ['a non-UUID id', 'abc'],
      ['a missing id', '99999999-9999-4999-8999-999999999999'],
    ])('returns 404 NOT_FOUND for %s', async (_, bad) => {
      for (const send of [
        () => http().get(`/items/${bad}`).set(auth),
        () => patch(bad, { liked: true }),
        () => http().delete(`/items/${bad}`).set(auth),
      ]) {
        const res = await send().expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      }
    });

    it("returns 404 for another user's item", async () => {
      rows[0].userId = otherUser;
      const res = await http().get(`/items/${id}`).set(auth).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('PATCH changes only the given fields', async () => {
      const res = await patch(id, { liked: true, notes: ' Gift ' }).expect(200);
      expect(res.body).toMatchObject({ ...tags, liked: true, notes: 'Gift' });
    });

    it('PATCH cannot break R1 on a complete item', async () => {
      const res = await patch(id, { fabric: null, seasons: [] }).expect(400);
      expect(res.body.error.details).toEqual({ fields: ['fabric', 'seasons'] });
    });

    it('PATCH completes a draft once R1 holds', async () => {
      const draft = (
        await post({ originalPublicId: orig('d'), status: 'DRAFT' })
      ).body.id;
      await patch(draft, { status: 'COMPLETE' }).expect(400);
      const res = await patch(draft, {
        ...complete,
        status: 'COMPLETE',
      }).expect(200);
      expect(res.body).toMatchObject({
        id: draft,
        status: 'COMPLETE',
        originalUrl: url(orig('d')),
      });
    });

    it('PATCH rejects COMPLETE to DRAFT', async () => {
      const res = await patch(id, { status: 'DRAFT' }).expect(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
    });

    it('PATCH rejects a category change while the item is in an outfit', async () => {
      outfitUses = 1;
      const res = await patch(id, { category: 'OUTERWEAR' }).expect(409);
      expect(res.body.error.code).toBe('ITEM_IN_USE');
      await patch(id, { category: 'TOP', liked: true }).expect(200);
      outfitUses = 0;
      await patch(id, { category: 'OUTERWEAR' }).expect(200);
    });

    it('PATCH ignores originalPublicId', async () => {
      const res = await patch(id, { originalPublicId: orig('z') }).expect(200);
      expect(res.body.originalUrl).toBe(url(orig('a')));
    });

    it('PATCH replaces the clean image and deletes the old file', async () => {
      const res = await patch(id, { cleanPublicId: clean('b') }).expect(200);
      expect(res.body.cleanUrl).toBe(url(clean('b')));
      expect(destroyed()).toEqual([clean('a')]);
    });

    it('PATCH rejects a clean image from another folder', async () => {
      const res = await patch(id, { cleanPublicId: orig('b') }).expect(400);
      expect(res.body.error.code).toBe('INVALID_PUBLIC_ID');
      expect(destroyed()).toEqual([]);
    });

    it('DELETE removes the item, then its files', async () => {
      await http().delete(`/items/${id}`).set(auth).expect(204);
      expect(rows).toEqual([]);
      expect(destroyed()).toEqual([orig('a'), clean('a')]);
    });

    it('DELETE succeeds when the Cloudinary delete fails', async () => {
      fetchMock.mockRejectedValue(new Error('down'));
      await http().delete(`/items/${id}`).set(auth).expect(204);
      expect(rows).toEqual([]);
    });
  });

  it('scopes every query to the token user', () => {
    expect(seenUserIds.length).toBeGreaterThan(0);
    expect(new Set(seenUserIds)).toEqual(new Set([userId]));
  });
});
