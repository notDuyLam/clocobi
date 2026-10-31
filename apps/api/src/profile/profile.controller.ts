import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { ApiError } from '../common/api-error.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma.service.js';
import * as v from '../meta/values.js';

// Omitted, null or "" (after trim) becomes null (API section 2).
const blankToNull = (s: unknown) =>
  s == null || (typeof s === 'string' && s.trim() === '') ? null : s;
const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable());
const optionalEnum = (values: readonly [string, ...string[]]) =>
  z.preprocess(blankToNull, z.enum(values).nullable());
const uniqueList = <T extends z.ZodType>(item: T, max = Infinity) =>
  z
    .array(item)
    .max(max)
    .refine((a) => new Set(a).size === a.length, 'Values must not repeat.')
    .default([]);

// Full body of PUT /profile (API section 3.5). Omitted optional fields are cleared.
const profileSchema = z.object({
  clothingCategory: z.enum(v.CLOTHING_CATEGORY),
  heightCm: z.number().int().min(50).max(250),
  weightKg: z.number().min(20).max(300),
  climate: z.string().trim().min(1).max(100),
  build: optionalEnum(v.BUILD),
  skinUndertone: optionalEnum(v.SKIN_UNDERTONE),
  preferredStyles: uniqueList(
    z.string().trim().toLowerCase().min(1).max(30),
    10,
  ),
  likedColors: uniqueList(z.enum(v.COLORS)),
  dislikedColors: uniqueList(z.enum(v.COLORS)),
  fitPreference: optionalEnum(v.FIT_PREFERENCE),
  freeNotes: optionalText(500),
});
type ProfileBody = z.infer<typeof profileSchema>;

const select = {
  clothingCategory: true,
  heightCm: true,
  weightKg: true,
  climate: true,
  build: true,
  skinUndertone: true,
  preferredStyles: true,
  likedColors: true,
  dislikedColors: true,
  fitPreference: true,
  freeNotes: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Controller('profile')
export class ProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@Req() req: AuthedRequest) {
    const profile = await this.prisma.styleProfile.findUnique({
      where: { userId: req.userId },
      select,
    });
    if (!profile) {
      throw new ApiError(
        404,
        'PROFILE_NOT_FOUND',
        'Create your style profile first.',
      );
    }
    return profile;
  }

  @Put()
  put(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(profileSchema)) body: ProfileBody,
  ) {
    return this.prisma.styleProfile.upsert({
      where: { userId: req.userId },
      create: { ...body, userId: req.userId },
      update: body,
      select,
    });
  }
}
