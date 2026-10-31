import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ACCESS_TTL, signToken } from './../src/auth/tokens.js';
import { PrismaService } from './../src/prisma.service.js';

const userId = '6f1c2d7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const otherUser = '11111111-2222-4333-8444-555555555555';
const occasionId = '00000000-0000-4000-8000-0000000000aa';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const summary = (n: number, category: string) => ({
  id: id(n),
  category,
  subcategory: null,
  primaryColor: 'black',
  originalPublicId: `orig/${n}`,
  cleanPublicId: `clean/${n}`,
});

type Row = Record<string, any> & { id: string; userId: string };

describe('Outfits (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let rows: Row[];
  const seenUserIds: unknown[] = [];
  const fetchMock = vi.fn();

  const outfit = (n: number, extra = {}): Row => ({
    id: id(n),
    userId,
    occasionId,
    occasion: { name: 'Work' },
    comboKey: `k${n}`,
    stylingTips: 'Tips',
    liked: false,
    imagePublicId: null,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, n)),
    updatedAt: new Date(Date.UTC(2026, 10, 1, 0, 0, n)),
    items: [
      { id: id(n * 10 + 1), slot: 'SHOES', item: summary(4, 'SHOES') },
      { id: id(n * 10 + 2), slot: 'ACCESSORY', item: summary(6, 'ACCESSORY') },
      { id: id(n * 10 + 3), slot: 'ONE_PIECE', item: summary(3, 'ONE_PIECE') },
    ],
    ...extra,
  });
  const match = (r: Row, where: Row) =>
    r.userId === where.userId &&
    (where.id === undefined || r.id === where.id) &&
    (where.occasionId === undefined || r.occasionId === where.occasionId) &&
    (where.liked === undefined || r.liked === where.liked);

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';
    token = await signToken(userId, 'JWT_ACCESS_SECRET', ACCESS_TTL);
    const prisma = {
      occasion: {
        findFirst: async ({ where }: { where: Row }) => {
          seenUserIds.push(where.userId);
          return where.id === occasionId ? { id: occasionId } : null;
        },
      },
      outfit: {
        findFirst: async ({ where }: { where: Row }) => {
          seenUserIds.push(where.userId);
          const r = rows.find((x) => match(x, where));
          return r ? { ...r, items: [...r.items] } : null;
        },
        findMany: async ({ where }: { where: Row }) => {
          seenUserIds.push(where.userId);
          return rows.filter((x) => match(x, where)).reverse();
        },
        update: async ({ where, data }: { where: Row; data: object }) => {
          seenUserIds.push(where.userId);
          return Object.assign(
            rows.find((x) => match(x, where))!,
            data,
          );
        },
        delete: async ({ where }: { where: Row }) => {
          seenUserIds.push(where.userId);
          rows = rows.filter((x) => !match(x, where));
        },
      },
      outfitItem: {
        deleteMany: async ({
          where,
        }: {
          where: { id: string; outfitId: string; outfit: { userId: string } };
        }) => {
          seenUserIds.push(where.outfit.userId);
          const o = rows.find((x) => x.id === where.outfitId)!;
          o.items = o.items.filter((i: { id: string }) => i.id !== where.id);
        },
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    rows = [outfit(1), outfit(2, { liked: true })];
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(Response.json({ result: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const ids = (res: request.Response) =>
    res.body.outfits.map((o: { id: string }) => o.id);

  it('needs a token', async () => {
    await http().get('/outfits').expect(401);
  });

  it('GET /occasions/:id/outfits lists newest first', async () => {
    const res = await http()
      .get(`/occasions/${occasionId}/outfits`)
      .set(auth())
      .expect(200);
    expect(ids(res)).toEqual([id(2), id(1)]);
    await http()
      .get(`/occasions/${id(999)}/outfits`)
      .set(auth())
      .expect(404);
  });

  it('GET /outfits filters by liked', async () => {
    expect(ids(await http().get('/outfits').set(auth()).expect(200))).toEqual([
      id(2),
      id(1),
    ]);
    const liked = await http().get('/outfits?liked=true').set(auth());
    expect(ids(liked)).toEqual([id(2)]);
    await http().get('/outfits?liked=no').set(auth()).expect(400);
  });

  it('GET /outfits/:id returns the full outfit', async () => {
    rows[0].imagePublicId = 'clocobi/u/outfits/x';
    rows[0].items[0].item = null; // deleted shoes
    const res = await http()
      .get(`/outfits/${id(1)}`)
      .set(auth())
      .expect(200);
    expect(res.body).toMatchObject({
      id: id(1),
      occasionName: 'Work',
      imageUrl:
        'https://res.cloudinary.com/demo/image/upload/clocobi/u/outfits/x',
      isIncomplete: true,
    });
    expect(res.body.items.map((i: { slot: string }) => i.slot)).toEqual([
      'ONE_PIECE',
      'SHOES',
      'ACCESSORY',
    ]);
    expect(res.body.items[1]).toEqual({
      id: id(11),
      slot: 'SHOES',
      optional: false,
      item: null,
    });
  });

  it('a deleted optional item does not make the outfit incomplete', async () => {
    rows[0].items[1].item = null;
    const res = await http()
      .get(`/outfits/${id(1)}`)
      .set(auth());
    expect(res.body.isIncomplete).toBe(false);
  });

  it.each(['abc', id(999)])('returns 404 for outfit %s', async (bad) => {
    for (const send of [
      () => http().get(`/outfits/${bad}`).set(auth()),
      () => http().patch(`/outfits/${bad}`).set(auth()).send({ liked: true }),
      () => http().delete(`/outfits/${bad}`).set(auth()),
      () =>
        http()
          .delete(`/outfits/${bad}/items/${id(12)}`)
          .set(auth()),
    ]) {
      expect((await send().expect(404)).body.error.code).toBe('NOT_FOUND');
    }
  });

  it("returns 404 for another user's outfit", async () => {
    rows[0].userId = otherUser;
    await http()
      .get(`/outfits/${id(1)}`)
      .set(auth())
      .expect(404);
  });

  it('PATCH sets liked', async () => {
    const res = await http()
      .patch(`/outfits/${id(1)}`)
      .set(auth())
      .send({ liked: true })
      .expect(200);
    expect(res.body.liked).toBe(true);
    await http()
      .patch(`/outfits/${id(1)}`)
      .set(auth())
      .send({})
      .expect(400);
  });

  it('DELETE removes the outfit and its image', async () => {
    rows[0].imagePublicId = 'clocobi/u/outfits/x';
    await http()
      .delete(`/outfits/${id(1)}`)
      .set(auth())
      .expect(204);
    expect(rows.map((r) => r.id)).toEqual([id(2)]);
    expect(
      (fetchMock.mock.calls[0][1].body as URLSearchParams).get('public_id'),
    ).toBe('clocobi/u/outfits/x');
  });

  it('removes an optional item but not a required one', async () => {
    const res = await http()
      .delete(`/outfits/${id(1)}/items/${id(12)}`)
      .set(auth())
      .expect(200);
    expect(res.body.items.map((i: { slot: string }) => i.slot)).toEqual([
      'ONE_PIECE',
      'SHOES',
    ]);
    expect(rows[0].items).toHaveLength(2);
    const req = await http()
      .delete(`/outfits/${id(1)}/items/${id(11)}`)
      .set(auth())
      .expect(409);
    expect(req.body.error.code).toBe('REQUIRED_ITEM');
    // An item of another outfit is not found in this one.
    await http()
      .delete(`/outfits/${id(1)}/items/${id(22)}`)
      .set(auth())
      .expect(404);
  });

  it('scopes every query to the token user', () => {
    expect(new Set(seenUserIds)).toEqual(new Set([userId]));
  });
});
