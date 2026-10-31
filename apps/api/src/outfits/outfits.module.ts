import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { OutfitsController } from './outfits.controller.js';

@Module({
  imports: [AiModule, UploadsModule],
  controllers: [OutfitsController],
})
export class OutfitsModule {}
