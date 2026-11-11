// Loads apps/api/.env locally; on Vercel the variables come from the project settings.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
// No top-level await: Vercel loads this file with require(), which rejects ESM with top-level await.
void bootstrap();
