import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from './public.decorator.js';
import { verifyToken } from './tokens.js';

export type AuthedRequest = Request & { userId: string };

// Global guard: every route needs `Authorization: Bearer <accessToken>` unless marked @Public().
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    req.userId = await verifyToken(
      scheme === 'Bearer' ? token : undefined,
      'JWT_ACCESS_SECRET',
    );
    return true;
  }
}
