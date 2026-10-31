import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    delete process.env.DEBUG_ENDPOINTS;
    await app.close();
  });

  it('unknown route returns 404 NOT_FOUND in the error format', () => {
    return request(app.getHttpServer())
      .get('/nope')
      .expect(404)
      .expect({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  describe('GET /debug/slow', () => {
    it('returns 404 when DEBUG_ENDPOINTS is not true', () => {
      process.env.DEBUG_ENDPOINTS = 'false';
      return request(app.getHttpServer())
        .get('/debug/slow?seconds=1')
        .expect(404)
        .expect({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
    });

    it.each(['0', '291', '1.5', 'abc', ''])('rejects seconds=%s', async (s) => {
      process.env.DEBUG_ENDPOINTS = 'true';
      const res = await request(app.getHttpServer())
        .get(`/debug/slow?seconds=${s}`)
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details).toEqual({ fields: ['seconds'] });
    });

    it('waits and responds when enabled', () => {
      process.env.DEBUG_ENDPOINTS = 'true';
      return request(app.getHttpServer())
        .get('/debug/slow?seconds=1')
        .expect(200)
        .expect({ ok: true, waited: 1 });
    });
  });
});
