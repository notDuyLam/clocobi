import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TEXT_AI, type RankInput } from './../src/ai/text-ai.provider.js';
import { AppModule } from './../src/app.module.js';
import { ACCESS_TTL, signToken } from './../src/auth/tokens.js';
import { comboKey } from './../src/outfits/candidates.js';
import { PrismaService } from './../src/prisma.service.js';

const userId = '6f1c2d7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const occasionId = '00000000-0000-4000-8000-0000000000aa';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const all = ['hot', 'mild', 'cold'];
const item = (n: number, category: string, seasons = all) => ({
  id: id(n),
  category,
  subcategory: null,
  primaryColor: 'black',
  secondaryColor: null,
  pattern: 'solid',
  fabric: 'cotton',
  fit: 'regular',
  seasons,
  formality: 'casual',
  aiNote: null,
  originalPublicId: `clocobi/${userId}/items/original/${n}`,
  cleanPublicId: null,
});
const T1 = item(1, 'TOP');
const T2 = item(2, 'TOP');
const B = item(3, 'BOTTOM');
const S = item(4, 'SHOES');
const J = item(5, 'OUTERWEAR');
const W = item(6, 'ACCESSORY', ['cold']);

describe('POST /occasions/:id/outfits/generate (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let profile: object | null;
  let items: ReturnType<typeof item>[];
  let existingKeys: string[];
  let duplicateKeys: string[];
  let saved: Record<string, unknown>[];
  const seenUserIds: unknown[] = [];
  const rankOutfits = vi.fn();

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    token = await signToken(userId, 'JWT_ACCESS_SECRET', ACCESS_TTL);
    const byId = (i: string) => items.find((x) => x.id === i) ?? null;
    const prisma = {
      occasion: {
        findFirst: async ({
          where,
        }: {
          where: { id: string; userId: string };
        }) => {
          seenUserIds.push(where.userId);
          return where.id === occasionId
            ? { id: occasionId, name: 'Work', description: 'Office' }
            : null;
        },
      },
      styleProfile: {
        findUnique: async ({ where }: { where: { userId: string } }) => {
          seenUserIds.push(where.userId);
          return profile;
        },
      },
      item: {
        findMany: async ({
          where,
        }: {
          where: { userId: string; status: string };
        }) => {
          seenUserIds.push(where.userId);
          expect(where.status).toBe('COMPLETE');
          return items;
        },
      },
      outfit: {
        findMany: async ({ where }: { where: { userId: string } }) => {
          seenUserIds.push(where.userId);
          return existingKeys.map((k) => ({ comboKey: k }));
        },
        create: async ({ data }: { data: Record<string, any> }) => {
          seenUserIds.push(data.userId);
          if (duplicateKeys.includes(data.comboKey)) {
            throw Object.assign(new Error('unique'), { code: 'P2002' });
          }
          saved.push(data);
          const t = new Date('2026-11-01T00:00:00Z');
          return {
            id: id(100 + saved.length),
            occasionId: data.occasionId,
            occasion: { name: 'Work' },
            comboKey: data.comboKey,
            stylingTips: data.stylingTips,
            liked: false,
            imagePublicId: null,
            createdAt: t,
            updatedAt: t,
            // Reversed to check the response sorts slots.
            items: data.items.create
              .map((r: { itemId: string; slot: string }, i: number) => ({
                id: id(200 + i),
                slot: r.slot,
                item: byId(r.itemId),
              }))
              .reverse(),
          };
        },
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(TEXT_AI)
      .useValue({ rankOutfits })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    profile = { clothingCategory: 'Menswear' };
    items = [T1, T2, B, S, J, W];
    existingKeys = [];
    duplicateKeys = [];
    saved = [];
    rankOutfits.mockReset();
  });
  afterAll(() => app.close());

  const generate = (occ = occasionId) =>
    request(app.getHttpServer())
      .post(`/occasions/${occ}/outfits/generate`)
      .set('Authorization', `Bearer ${token}`);
  const pick = (candidateId: string, extra = {}) => ({
    candidateId,
    outerwearId: null,
    accessoryIds: [],
    stylingTips: 'Looks sharp.',
    ...extra,
  });

  it.each(['abc', id(999)])('returns 404 for occasion %s', async (occ) => {
    expect((await generate(occ).expect(404)).body.error.code).toBe('NOT_FOUND');
  });

  it('returns 422 PROFILE_REQUIRED without a profile', async () => {
    profile = null;
    expect((await generate().expect(422)).body.error.code).toBe(
      'PROFILE_REQUIRED',
    );
  });

  it('returns 422 MISSING_SLOTS with the missing slots', async () => {
    items = [T1, J];
    const res = await generate().expect(422);
    expect(res.body.error).toMatchObject({
      code: 'MISSING_SLOTS',
      details: { missing: ['BOTTOM', 'SHOES'] },
    });
    expect(rankOutfits).not.toHaveBeenCalled();
  });

  it('saves the AI picks with repaired options and the FEWER_THAN_REQUESTED notice', async () => {
    rankOutfits.mockResolvedValue([
      pick('c1', { outerwearId: J.id, accessoryIds: [W.id] }),
      pick('c2'),
    ]);
    const res = await generate().expect(201);

    const input: RankInput = rankOutfits.mock.calls[0][0];
    expect(input).toMatchObject({
      occasion: { name: 'Work', description: 'Office' },
      profile: { clothingCategory: 'Menswear' },
      count: 2,
      maxAccessories: 2,
    });
    expect(input.candidates).toMatchObject([
      {
        id: 'c1',
        requiredItemIds: [T1.id, B.id, S.id],
        outerwearOptionIds: [J.id],
        accessoryOptionIds: [W.id],
      },
      {
        id: 'c2',
        requiredItemIds: [T2.id, B.id, S.id],
        outerwearOptionIds: [J.id],
        accessoryOptionIds: [W.id],
      },
    ]);
    expect(input.items.map((i) => i.id)).toEqual(items.map((i) => i.id));

    expect(saved[0]).toMatchObject({
      userId,
      occasionId,
      comboKey: comboKey([T1.id, B.id, S.id]),
      stylingTips: 'Looks sharp.',
    });
    expect(res.body.notice).toEqual({
      code: 'FEWER_THAN_REQUESTED',
      message: 'Only 2 valid outfits exist.',
    });
    const [first] = res.body.outfits;
    expect(first).toMatchObject({
      occasionId,
      occasionName: 'Work',
      liked: false,
      imageUrl: null,
      isIncomplete: false,
    });
    expect(
      first.items.map((i: { slot: string; optional: boolean }) => [
        i.slot,
        i.optional,
      ]),
    ).toEqual([
      ['TOP', false],
      ['BOTTOM', false],
      ['OUTERWEAR', true],
      ['SHOES', false],
      ['ACCESSORY', true],
    ]);
    expect(first.items[0].item).toEqual({
      id: T1.id,
      category: 'TOP',
      subcategory: null,
      primaryColor: 'black',
      originalUrl: `https://res.cloudinary.com/demo/image/upload/${T1.originalPublicId}`,
      cleanUrl: null,
    });
  });

  it('skips combinations already generated for the occasion', async () => {
    existingKeys = [comboKey([T1.id, B.id, S.id])];
    rankOutfits.mockResolvedValue([pick('c1')]);
    const res = await generate().expect(201);
    expect(
      rankOutfits.mock.calls[0][0].candidates.map(
        (c: { requiredItemIds: string[] }) => c.requiredItemIds,
      ),
    ).toEqual([[T2.id, B.id, S.id]]);
    expect(res.body.notice.message).toBe('Only 1 valid outfit exists.');
  });

  it('returns NO_NEW_COMBINATIONS without calling the AI', async () => {
    existingKeys = [
      comboKey([T1.id, B.id, S.id]),
      comboKey([T2.id, B.id, S.id]),
    ];
    const res = await generate().expect(201);
    expect(res.body).toMatchObject({
      outfits: [],
      notice: { code: 'NO_NEW_COMBINATIONS' },
    });
    expect(rankOutfits).not.toHaveBeenCalled();
  });

  it('returns AI_RETURNED_FEWER when the AI gives fewer valid picks', async () => {
    rankOutfits.mockResolvedValue([pick('c2'), pick('c9')]);
    const res = await generate().expect(201);
    expect(res.body.outfits).toHaveLength(1);
    expect(res.body.notice).toEqual({
      code: 'AI_RETURNED_FEWER',
      message: 'Only 1 new outfit was created. Generate again for more.',
    });
  });

  it('skips an outfit saved in parallel (P2002)', async () => {
    duplicateKeys = [comboKey([T1.id, B.id, S.id])];
    rankOutfits.mockResolvedValue([pick('c1'), pick('c2')]);
    const res = await generate().expect(201);
    expect(res.body.outfits).toHaveLength(1);
    expect(res.body.notice.code).toBe('AI_RETURNED_FEWER');
  });

  it('returns 502 AI_FAILED when no pick is valid', async () => {
    rankOutfits.mockResolvedValue([
      pick('c9'),
      pick('c1', { stylingTips: ' ' }),
    ]);
    expect((await generate().expect(502)).body.error.code).toBe('AI_FAILED');
    expect(saved).toEqual([]);
  });

  it('scopes every query to the token user', () => {
    expect(new Set(seenUserIds)).toEqual(new Set([userId]));
  });
});
