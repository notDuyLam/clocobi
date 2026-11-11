import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { ApiError } from '../common/api-error.js';
import { optionalEnum, optionalText, uniqueList } from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma.service.js';
import * as v from '../meta/values.js';

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
  ).default([]),
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
