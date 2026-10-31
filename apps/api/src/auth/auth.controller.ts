import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma.service.js';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
    });
    if (!user || !(await verify(user.passwordHash, body.password))) {
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'Wrong email or password.',
      );
    }
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
