import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from './api-error.js';

// Every non-2xx response gets the body { error: { code, message, details? } }.
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, code, message, details } = toError(exception);
    if (status === 500) this.logger.error(exception);
    res
      .status(status)
      .json({
        error: details ? { code, message, details } : { code, message },
      });
  }
}

function toError(e: unknown) {
  if (e instanceof ApiError) {
    return {
      status: e.getStatus(),
      code: e.code,
      message: e.message,
      details: e.details,
    };
  }
  // Nest's own exceptions: unknown route (404) and body parsing (400).
  if (e instanceof HttpException && e.getStatus() === 404) {
    return { status: 404, code: 'NOT_FOUND', message: 'Not found.' };
  }
  if (e instanceof HttpException && e.getStatus() === 400) {
    return {
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Invalid request.',
    };
  }
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong.',
  };
}
