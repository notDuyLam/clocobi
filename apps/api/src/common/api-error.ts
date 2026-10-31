import { HttpException } from '@nestjs/common';

// Error with a code from API Design Document section 6. The filter turns it into the error body.
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message, status);
  }
}
