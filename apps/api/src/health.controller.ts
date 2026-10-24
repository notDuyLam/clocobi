import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('db')
  async checkDb() {
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return { ok: true };
  }
}

