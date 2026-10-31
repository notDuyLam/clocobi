import { Module } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider.js';
import { TEXT_AI } from './text-ai.provider.js';

@Module({
  providers: [{ provide: TEXT_AI, useClass: GeminiProvider }],
  exports: [TEXT_AI],
})
export class AiModule {}
