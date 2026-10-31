import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { notFound, uuidOr404 } from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';

const occasionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(300),
});
const patchSchema = occasionSchema.partial();

// API 3.4: no userId, outfitCount from a relation count.
const select = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { outfits: true } },
} as const;
const toOccasion = ({
  _count,
  ...rest
}: {
  _count: { outfits: number };
  [k: string]: unknown;
}) => ({ ...rest, outfitCount: _count.outfits });

@Controller('occasions')
export class OccasionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  private async exists(userId: string, id: string) {
    const row = await this.prisma.occasion.findFirst({
      where: { id: uuidOr404(id), userId },
      select: { id: true },
    });
    if (!row) throw notFound();
  }

  @Get()
  async list(@Req() req: AuthedRequest) {
    const rows = await this.prisma.occasion.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
      select,
    });
    return { occasions: rows.map(toOccasion) };
  }

  @Post()
  async create(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(occasionSchema)) body: z.infer<typeof occasionSchema>,
  ) {
    return toOccasion(
      await this.prisma.occasion.create({
        data: { ...body, userId: req.userId },
        select,
      }),
    );
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodPipe(patchSchema)) body: z.infer<typeof patchSchema>,
  ) {
    await this.exists(req.userId, id);
    return toOccasion(
      await this.prisma.occasion.update({
        where: { id, userId: req.userId },
        data: body,
        select,
      }),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.exists(req.userId, id);
    // Image IDs first: the cascade removes the outfits with the occasion.
    const outfits = await this.prisma.outfit.findMany({
      where: {
        occasionId: id,
        userId: req.userId,
        imagePublicId: { not: null },
      },
      select: { imagePublicId: true },
    });
    await this.prisma.occasion.delete({ where: { id, userId: req.userId } });
    for (const o of outfits) await this.cloudinary.destroy(o.imagePublicId!);
  }
}
