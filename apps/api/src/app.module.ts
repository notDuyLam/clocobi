import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorFilter } from './common/error.filter.js';
import { DebugController } from './debug.controller.js';
import { HealthController } from './health.controller.js';
import { PrismaService } from './prisma.service.js';

@Module({
  imports: [],
  controllers: [DebugController, HealthController],
  providers: [PrismaService, { provide: APP_FILTER, useClass: ErrorFilter }],
  exports: [PrismaService],
})
export class AppModule {}
