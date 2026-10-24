import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma.service.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [],
  controllers: [AppController, HealthController],
  providers: [AppService, PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
