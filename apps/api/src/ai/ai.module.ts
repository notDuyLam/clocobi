import { Module } from '@nestjs/common';
import { CloudflareProvider } from './cloudflare.provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { IMAGE_GEN } from './image-gen.provider.js';
import { TEXT_AI } from './text-ai.provider.js';

@Module({
  providers: [
    { provide: TEXT_AI, useClass: GeminiProvider },
    { provide: IMAGE_GEN, useClass: CloudflareProvider },
  ],
  exports: [TEXT_AI, IMAGE_GEN],
})
export class AiModule {}
