import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { ItemsController } from './items.controller.js';

@Module({ imports: [AiModule, UploadsModule], controllers: [ItemsController] })
export class ItemsModule {}
