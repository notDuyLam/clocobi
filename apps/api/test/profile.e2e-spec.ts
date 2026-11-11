import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ACCESS_TTL, signToken } from './../src/auth/tokens.js';
import { PrismaService } from './../src/prisma.service.js';

const userId = '6f1c2d7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const minimum = {
  clothingCategory: 'Menswear',
  heightCm: 170,
  weightKg: 65.5,
  climate: ' Hot and humid ',
};

describe('Profile (e2e)', () => {
  let app: INestApplication;
  let token: string;
  // In-memory StyleProfile rows keyed by userId.
  const rows = new Map<string, Record<string, unknown>>();
  const seenUserIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    token = await signToken(userId, 'JWT_ACCESS_SECRET', ACCESS_TTL);
    const prisma = {
      styleProfile: {
        findUnique: ({ where }: { where: { userId: string } }) => {
          seenUserIds.push(where.userId);
          return rows.get(where.userId) ?? null;
        },
        upsert: ({
          where,
          create,
          update,
        }: {
          where: { userId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          seenUserIds.push(where.userId);
          const old = rows.get(where.userId);
          const now = new Date('2026-11-01T00:00:00Z');
          const { userId: _, ...data } = old ? update : create;
          const row = {
            ...data,
            createdAt: old?.createdAt ?? now,
            updatedAt: now,
          };
          rows.set(where.userId, row);
          return row;
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

  afterAll(() => app.close());

  const get = () =>
    request(app.getHttpServer())
      .get('/profile')
      .set('Authorization', `Bearer ${token}`);
  const put = (body: object) =>
    request(app.getHttpServer())
      .put('/profile')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('needs a token', async () => {
    const server = app.getHttpServer();
    for (const send of [
      () => request(server).get('/profile'),
      () => request(server).put('/profile').send(minimum),
    ]) {
      const res = await send().expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('GET without a profile returns 404 PROFILE_NOT_FOUND', async () => {
    const res = await get().expect(404);
    expect(res.body.error.code).toBe('PROFILE_NOT_FOUND');
  });

  it('PUT with the minimum fields fills defaults', async () => {
    const res = await put({ ...minimum, build: '', freeNotes: '  ' }).expect(
      200,
    );
    expect(res.body).toEqual({
      clothingCategory: 'Menswear',
      heightCm: 170,
      weightKg: 65.5,
      climate: 'Hot and humid',
      build: null,
      skinUndertone: null,
      preferredStyles: [],
      fitPreference: null,
      freeNotes: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    await get().expect(200, res.body);
  });

  it('PUT replaces the full profile and normalizes text', async () => {
    const full = {
      ...minimum,
      clothingCategory: 'Unisex',
      build: 'Slim',
      skinUndertone: 'Warm',
      preferredStyles: [' Minimal ', 'streetwear'],
      fitPreference: 'Regular',
      freeNotes: ' No shorts to work ',
      id: 'ignored',
    };
    const res = await put(full).expect(200);
    expect(res.body).toMatchObject({
      clothingCategory: 'Unisex',
      build: 'Slim',
      skinUndertone: 'Warm',
      preferredStyles: ['minimal', 'streetwear'],
      fitPreference: 'Regular',
      freeNotes: 'No shorts to work',
    });
    expect(res.body).not.toHaveProperty('id');
    // Leaving out optional fields clears them (full replace).
    const cleared = await put(minimum).expect(200);
    expect(cleared.body).toMatchObject({ build: null, preferredStyles: [] });
  });

  it.each([
    [
      'missing body',
      undefined,
      ['clothingCategory', 'heightCm', 'weightKg', 'climate'],
    ],
    ['wrong-case enum', { clothingCategory: 'menswear' }, ['clothingCategory']],
    ['height too low', { heightCm: 49 }, ['heightCm']],
    ['height not integer', { heightCm: 170.5 }, ['heightCm']],
    ['weight too high', { weightKg: 301 }, ['weightKg']],
    ['empty climate', { climate: '   ' }, ['climate']],
    ['climate too long', { climate: 'x'.repeat(101) }, ['climate']],
    ['unknown build', { build: 'Tall' }, ['build']],
    [
      'too many styles',
      { preferredStyles: Array.from({ length: 11 }, (_, i) => `s${i}`) },
      ['preferredStyles'],
    ],
    [
      'style too long',
      { preferredStyles: ['x'.repeat(31)] },
      ['preferredStyles.0'],
    ],
    [
      'repeat after lowercasing',
      { preferredStyles: ['Minimal', 'minimal'] },
      ['preferredStyles'],
    ],
    ['notes too long', { freeNotes: 'x'.repeat(501) }, ['freeNotes']],
  ])('PUT with %s returns 400 VALIDATION_FAILED', async (_, patch, fields) => {
    const res = await put(patch ? { ...minimum, ...patch } : {}).expect(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields },
    });
  });

  it('scopes every query to the token user', () => {
    expect(seenUserIds.length).toBeGreaterThan(0);
    expect(new Set(seenUserIds)).toEqual(new Set([userId]));
  });
});
