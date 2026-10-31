import { Controller, Get, Query } from '@nestjs/common';
import { Public } from './auth/public.decorator.js';
import { ApiError } from './common/api-error.js';

// Temporary: tests the Vercel and proxy time limit (TDD open item 8, API AD11). Remove after the spike.
@Public()
@Controller('debug')
export class DebugController {
  @Get('slow')
  async slow(@Query('seconds') seconds = '40') {
    if (process.env.DEBUG_ENDPOINTS !== 'true') {
      throw new ApiError(404, 'NOT_FOUND', 'Not found.');
    }
    const waited = Number(seconds);
    if (!/^\d+$/.test(seconds) || waited < 1 || waited > 290) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'seconds must be an integer from 1 to 290.',
        {
          fields: ['seconds'],
        },
      );
    }
    await new Promise((resolve) => setTimeout(resolve, waited * 1000));
    return { ok: true, waited };
  }
}
