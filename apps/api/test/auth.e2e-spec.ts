import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import type { AuthedRequest } from './../src/auth/auth.guard.js';
import { PrismaService } from './../src/prisma.service.js';

// A protected route, only to check the global guard.
@Controller('probe')
class ProbeController {
  @Get()
  me(@Req() req: AuthedRequest) {
    return { userId: req.userId };
  }
}

const user = {
  id: '6f1c2d7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  email: 'admin@email.com',
};

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let passwordHash: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    passwordHash = await hash('correct horse');
    const prisma = {
      user: {
        findUnique: ({ where }: { where: { email: string } }) =>
          where.email === user.email ? { ...user, passwordHash } : null,
      },
      $queryRawUnsafe: () => [{ '?column?': 1 }],
    };
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });
  const cookieOf = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0] ?? '';

  it('seed hashes are argon2id', () => {
    expect(passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('login returns an access token and sets the refresh cookie', async () => {
    const res = await login(' Admin@Email.com ', 'correct horse').expect(200);
    expect(res.body).toEqual({
      accessToken: expect.any(String),
      expiresIn: 900,
    });
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/^refresh_token=[\w-]+\.[\w-]+\.[\w-]+;/);
    for (const part of [
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Path=/api/auth',
      'Max-Age=604800',
    ]) {
      expect(cookie).toContain(part);
    }
  });

  it.each([
    ['wrong password', 'admin@email.com', 'nope'],
    ['unknown email', 'x@email.com', 'correct horse'],
  ])(
    'login with %s returns 401 INVALID_CREDENTIALS and no cookie',
    async (_, email, password) => {
      const res = await login(email, password).expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.headers['set-cookie']).toBeUndefined();
    },
  );

  it('login without a body returns 400 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .expect(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: ['body'] },
    });
  });

  it('access token opens protected routes; missing or bad tokens get 401', async () => {
    const { body } = await login(user.email, 'correct horse');
    const server = app.getHttpServer();
    await request(server)
      .get('/probe')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200, { userId: user.id });
    for (const auth of [
      undefined,
      'Bearer garbage',
      `Basic ${body.accessToken}`,
    ]) {
      const req = request(server).get('/probe');
      const res = await (auth ? req.set('Authorization', auth) : req).expect(
        401,
      );
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('refresh with the cookie returns a new token and a new cookie', async () => {
    const cookie = cookieOf(await login(user.email, 'correct horse')).split(
      ';',
    )[0];
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `other=1; ${cookie}`)
      .expect(200);
    expect(res.body.expiresIn).toBe(900);
    expect(cookieOf(res)).toMatch(/^refresh_token=/);
  });

  it('refresh without a cookie, or with an access token as cookie, returns 401', async () => {
    const { body } = await login(user.email, 'correct horse');
    const server = app.getHttpServer();
    for (const cookie of [undefined, `refresh_token=${body.accessToken}`]) {
      const req = request(server).post('/auth/refresh');
      const res = await (cookie ? req.set('Cookie', cookie) : req).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('logout needs a token, then clears the cookie with 204', async () => {
    const server = app.getHttpServer();
    await request(server).post('/auth/logout').expect(401);
    const { body } = await login(user.email, 'correct horse');
    const res = await request(server)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(204);
    expect(cookieOf(res)).toMatch(
      /^refresh_token=;.*Path=\/api\/auth.*Expires=Thu, 01 Jan 1970/,
    );
  });

  it('health is public', () =>
    request(app.getHttpServer()).get('/health/db').expect(200, { ok: true }));
});
