import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { ErrorFilter } from './common/error.filter.js';
import { DebugController } from './debug.controller.js';
import { HealthController } from './health.controller.js';
import { MetaModule } from './meta/meta.module.js';
import { PrismaModule } from './prisma.module.js';

@Module({
  imports: [PrismaModule, AuthModule, MetaModule],
  controllers: [DebugController, HealthController],
  providers: [{ provide: APP_FILTER, useClass: ErrorFilter }],
})
export class AppModule {}
