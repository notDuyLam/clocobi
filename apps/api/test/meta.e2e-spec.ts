import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ACCESS_TTL, signToken } from './../src/auth/tokens.js';

describe('Meta (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('needs a token', async () => {
    const res = await request(app.getHttpServer()).get('/meta').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the value lists', async () => {
    const token = await signToken('u1', 'JWT_ACCESS_SECRET', ACCESS_TTL);
    const res = await request(app.getHttpServer())
      .get('/meta')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Object.keys(res.body)).toEqual([
      'categories',
      'seasons',
      'formality',
      'fit',
      'pattern',
      'colors',
      'colorGroups',
      'clothingCategory',
      'build',
      'skinUndertone',
      'fitPreference',
    ]);
    expect(res.body.categories).toEqual([
      'TOP',
      'BOTTOM',
      'OUTERWEAR',
      'ONE_PIECE',
      'SHOES',
      'ACCESSORY',
    ]);
    expect(res.body.colors).toHaveLength(16);
    expect(res.body.colorGroups).toContain('earth tones');
    expect(res.body.formality).toContain('smart casual');
  });
});
