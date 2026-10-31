import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { ApiError } from './api-error.js';
import { ErrorFilter } from './error.filter.js';

function run(exception: unknown) {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new ErrorFilter().catch(exception, host);
  return {
    status: res.status.mock.calls[0][0],
    body: res.json.mock.calls[0][0],
  };
}

describe('ErrorFilter', () => {
  it('keeps code, message and details of an ApiError', () => {
    expect(
      run(
        new ApiError(422, 'MISSING_SLOTS', 'No shoes.', { missing: ['SHOES'] }),
      ),
    ).toEqual({
      status: 422,
      body: {
        error: {
          code: 'MISSING_SLOTS',
          message: 'No shoes.',
          details: { missing: ['SHOES'] },
        },
      },
    });
  });

  it('maps a Nest 400 to VALIDATION_FAILED', () => {
    expect(run(new BadRequestException('bad json')).body.error.code).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('hides unexpected errors behind INTERNAL_ERROR and logs them', () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    expect(run(new Error('db password leaked in message'))).toEqual({
      status: 500,
      body: {
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
      },
    });
    expect(log).toHaveBeenCalled();
  });
});
