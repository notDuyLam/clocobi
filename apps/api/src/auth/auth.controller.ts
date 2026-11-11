import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma.service.js';
import { LoginThrottle } from './login-throttle.js';
import { Public } from './public.decorator.js';
import { ACCESS_TTL, REFRESH_TTL, signToken, verifyToken } from './tokens.js';

const COOKIE = 'refresh_token';
// Path includes /api because the browser sees the proxied URL (API section 2).
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/auth',
};

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

const throttle = new LoginThrottle();
// Vercel and the Next.js proxy put the client first in x-forwarded-for. If the proxy hides it,
// every login shares one key, which still caps guessing (and can lock the owner out for 15 min).
const clientKey = (req: Request) =>
  String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim() ||
  req.ip ||
  'unknown';

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = clientKey(req);
    const wait = throttle.retryAfter(key);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      throw new ApiError(
        429,
        'TOO_MANY_ATTEMPTS',
        `Too many failed logins. Try again in ${Math.ceil(wait / 60)} minutes.`,
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
    });
    if (!user || !(await verify(user.passwordHash, body.password))) {
      throttle.fail(key);
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'Wrong email or password.',
      );
    }
    throttle.succeed(key);
    return this.issue(user.id, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.headers.cookie?.match(
      /(?:^|;\s*)refresh_token=([^;]+)/,
    )?.[1];
    return this.issue(await verifyToken(token, 'JWT_REFRESH_SECRET'), res);
  }

  // Stateless tokens: logout only clears the cookie (AD1).
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, cookieOptions);
  }

  private async issue(userId: string, res: Response) {
    const refreshToken = await signToken(
      userId,
      'JWT_REFRESH_SECRET',
      REFRESH_TTL,
    );
    res.cookie(COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_TTL * 1000,
    });
    return {
      accessToken: await signToken(userId, 'JWT_ACCESS_SECRET', ACCESS_TTL),
      expiresIn: ACCESS_TTL,
    };
  }
}
