import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ACCESS_TTL, signToken } from './../src/auth/tokens.js';
import { PrismaService } from './../src/prisma.service.js';

const userId = '6f1c2d7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const otherUser = '11111111-2222-4333-8444-555555555555';

type Row = { id: string; userId: string; [k: string]: unknown };

describe('Occasions (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let rows: Row[];
  let outfits: { occasionId: string; imagePublicId: string | null }[];
  let n = 0;
  const seenUserIds: unknown[] = [];
  const fetchMock = vi.fn();

  // Applies `select` like Prisma for the fields this controller uses.
  const view = (r: Row) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    _count: {
      outfits: outfits.filter((o) => o.occasionId === r.id).length,
    },
  });
  const find = (where: Partial<Row>) =>
    rows.find((r) => r.id === where.id && r.userId === where.userId);

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
          return find(where) ? { id: where.id } : null;
        },
        findMany: async ({ where }: { where: Row }) => {
          seenUserIds.push(where.userId);
          return rows.filter((r) => r.userId === where.userId).map(view);
        },
        create: async ({ data }: { data: Row }) => {
          seenUserIds.push(data.userId);
          const t = new Date(Date.UTC(2026, 10, 1, 0, 0, n));
          const row = {
            ...data,
            id: `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`,
            createdAt: t,
            updatedAt: t,
          };
          rows.push(row);
          return view(row);
        },
        update: async ({ where, data }: { where: Row; data: object }) => {
          seenUserIds.push(where.userId);
          return view(Object.assign(find(where)!, data));
        },
        delete: async ({ where }: { where: Row }) => {
          seenUserIds.push(where.userId);
          rows = rows.filter((r) => r !== find(where));
          outfits = outfits.filter((o) => o.occasionId !== where.id);
        },
      },
      outfit: {
        findMany: async ({ where }: { where: Row }) => {
          seenUserIds.push(where.userId);
          return outfits.filter(
            (o) => o.occasionId === where.occasionId && o.imagePublicId,
          );
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
    rows = [];
    outfits = [];
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(Response.json({ result: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const post = (body: object) =>
    http().post('/occasions').set(auth()).send(body);

  it('needs a token', async () => {
    const res = await http().get('/occasions').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('creates and lists occasions oldest first with outfitCount', async () => {
    const a = await post({
      name: ' Work ',
      description: 'Office, indoors',
    }).expect(201);
    expect(a.body).toEqual({
      id: expect.any(String),
      name: 'Work',
      description: 'Office, indoors',
      outfitCount: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    await post({ name: 'Work', description: 'Same name is fine' }).expect(201);
    outfits.push({ occasionId: a.body.id, imagePublicId: null });
    const res = await http().get('/occasions').set(auth()).expect(200);
    expect(
      res.body.occasions.map((o: { outfitCount: number }) => o.outfitCount),
    ).toEqual([1, 0]);
  });

  it.each([
    ['missing body', undefined, ['name', 'description']],
    ['blank name', { name: '  ', description: 'x' }, ['name']],
    ['name too long', { name: 'x'.repeat(61), description: 'x' }, ['name']],
    [
      'description too long',
      { name: 'x', description: 'x'.repeat(301) },
      ['description'],
    ],
  ])('POST with %s returns 400', async (_, body, fields) => {
    const res = await post(body ?? {}).expect(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields },
    });
  });

  it('PATCH updates only the given fields', async () => {
    const id = (await post({ name: 'Work', description: 'Office' })).body.id;
    const res = await http()
      .patch(`/occasions/${id}`)
      .set(auth())
      .send({ description: 'Office, air-conditioned' })
      .expect(200);
    expect(res.body).toMatchObject({
      name: 'Work',
      description: 'Office, air-conditioned',
    });
    await http()
      .patch(`/occasions/${id}`)
      .set(auth())
      .send({ name: '' })
      .expect(400);
  });

  it.each(['abc', '99999999-9999-4999-8999-999999999999'])(
    'returns 404 for id %s',
    async (id) => {
      for (const send of [
        () => http().patch(`/occasions/${id}`).set(auth()).send({ name: 'x' }),
        () => http().delete(`/occasions/${id}`).set(auth()),
      ]) {
        expect((await send().expect(404)).body.error.code).toBe('NOT_FOUND');
      }
    },
  );

  it("returns 404 for another user's occasion", async () => {
    const id = (await post({ name: 'Work', description: 'Office' })).body.id;
    rows[0].userId = otherUser;
    await http().delete(`/occasions/${id}`).set(auth()).expect(404);
    expect(rows).toHaveLength(1);
  });

  it('DELETE cascades and deletes the outfit images afterwards', async () => {
    const id = (await post({ name: 'Work', description: 'Office' })).body.id;
    outfits.push(
      { occasionId: id, imagePublicId: 'clocobi/u/outfits/a' },
      { occasionId: id, imagePublicId: null },
    );
    await http().delete(`/occasions/${id}`).set(auth()).expect(204);
    expect(rows).toEqual([]);
    expect(outfits).toEqual([]);
    const deleted = fetchMock.mock.calls.map(([, init]) =>
      (init.body as URLSearchParams).get('public_id'),
    );
    expect(deleted).toEqual(['clocobi/u/outfits/a']);
  });

  it('scopes every query to the token user', () => {
    expect(new Set(seenUserIds)).toEqual(new Set([userId]));
  });
});
