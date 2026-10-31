import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator.js';
import { PrismaService } from './prisma.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('db')
  async checkDb() {
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return { ok: true };
  }
}
