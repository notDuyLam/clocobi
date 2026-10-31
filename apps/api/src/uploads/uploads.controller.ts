import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CloudinaryService } from './cloudinary.service.js';

// Folder per purpose, so ownership and purpose can be checked by prefix later (API section 4.3).
const FOLDERS = { ITEM_ORIGINAL: 'original', ITEM_CLEAN: 'clean' } as const;

const signSchema = z.object({
  purpose: z.enum(['ITEM_ORIGINAL', 'ITEM_CLEAN']),
});

@Controller('uploads')
export class UploadsController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @Post('sign')
  @HttpCode(200)
  sign(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(signSchema)) body: z.infer<typeof signSchema>,
  ) {
    return this.cloudinary.signUpload(
      `clocobi/${req.userId}/items/${FOLDERS[body.purpose]}/${randomUUID()}`,
    );
  }
}
