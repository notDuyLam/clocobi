import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ACCESS_TTL, signToken } from './../src/auth/tokens.js';
import { signParams } from './../src/uploads/cloudinary.service.js';

const userId = '6f1c2d7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const uuid =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

describe('Uploads (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';
    token = await signToken(userId, 'JWT_ACCESS_SECRET', ACCESS_TTL);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  const sign = (body?: object) =>
    request(app.getHttpServer())
      .post('/uploads/sign')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('needs a token', async () => {
    const res = await request(app.getHttpServer())
      .post('/uploads/sign')
      .send({ purpose: 'ITEM_ORIGINAL' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each([
    [undefined, 'body'],
    [{ purpose: 'OUTFIT' }, 'purpose'],
    [{ purpose: 'item_original' }, 'purpose'],
  ])('rejects body %j', async (body, field) => {
    const res = await sign(body).expect(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: [field] },
    });
  });

  it.each([
    ['ITEM_ORIGINAL', 'original'],
    ['ITEM_CLEAN', 'clean'],
  ])(
    '%s signs a fresh public ID in the user folder',
    async (purpose, folder) => {
      const a = (await sign({ purpose }).expect(200)).body;
      const b = (await sign({ purpose }).expect(200)).body;
      expect(a).toEqual({
        uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
        cloudName: 'demo',
        apiKey: 'key',
        timestamp: expect.any(Number),
        publicId: expect.stringMatching(
          new RegExp(`^clocobi/${userId}/items/${folder}/${uuid}$`),
        ),
        signature: signParams(
          { public_id: a.publicId, timestamp: a.timestamp },
          'secret',
        ),
      });
      expect(Math.abs(a.timestamp - Date.now() / 1000)).toBeLessThan(5);
      expect(b.publicId).not.toBe(a.publicId);
    },
  );
});
