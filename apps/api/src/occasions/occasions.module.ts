import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module.js';
import { OccasionsController } from './occasions.controller.js';

@Module({ imports: [UploadsModule], controllers: [OccasionsController] })
export class OccasionsModule {}
