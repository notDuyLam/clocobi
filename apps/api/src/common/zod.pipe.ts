import { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { ApiError } from './api-error.js';

// Validates a body or query against a zod schema; failures become 400 VALIDATION_FAILED.
export class ZodPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fields = [
      ...new Set(result.error.issues.map((i) => i.path.join('.') || 'body')),
    ];
    throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid request.', {
      fields,
    });
  }
}
