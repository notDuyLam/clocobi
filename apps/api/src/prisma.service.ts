import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from './generated/prisma/client.js';
import { PrismaNeon } from '@prisma/adapter-neon';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const adapter = new PrismaNeon({
      connectionString: connectionString || '',
    });
    super({ adapter });
  }

  async onModuleInit() {
    if (process.env.DATABASE_URL) {
      await this.$connect();
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

