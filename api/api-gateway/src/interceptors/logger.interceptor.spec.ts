import { LoggerInterceptor, AppLogger, TRACE_ID_HEADER } from '@bidbay/logger';
import { of, throwError } from 'rxjs';

const mockLogger = {
  logRequest: jest.fn(),
  logResponse: jest.fn(),
  logError: jest.fn(),
};

function makeContext(reqOverrides: Record<string, any> = {}) {
  const req = {
    headers: {},
    url: '/test',
    method: 'GET',
    id: undefined,
    ...reqOverrides,
  };
  const res = {
    statusCode: 200,
    setHeader: jest.fn(),
    getHeader: jest.fn().mockReturnValue(undefined),
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    getHandler: () => ({ name: 'testHandler' }),
    getClass: () => ({ name: 'TestController' }),
  } as any;

  return { req, res, context };
}

describe('LoggerInterceptor', () => {
  let interceptor: LoggerInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new LoggerInterceptor(mockLogger as unknown as AppLogger);
  });

  it('should call logRequest on intercept', (done) => {
    const { context } = makeContext();
    const next = { handle: () => of({ result: 'ok' }) };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(mockLogger.logRequest).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should call logResponse on success', (done) => {
    const { context } = makeContext();
    const next = { handle: () => of({ result: 'ok' }) };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(mockLogger.logResponse).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should call logError on exception', (done) => {
    const { context } = makeContext();
    const error = new Error('Boom');
    const next = { handle: () => throwError(() => error) };

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(mockLogger.logError).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should set x-trace-id response header', (done) => {
    const { context, res } = makeContext();
    const next = { handle: () => of({}) };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(res.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, expect.any(String));
        done();
      },
    });
  });

  it('should reuse req.id when already set', (done) => {
    const { context, req } = makeContext({ id: 'pre-set-id' });
    const next = { handle: () => of({}) };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(req.id).toBe('pre-set-id');
        done();
      },
    });
  });

  it('should reuse x-trace-id from request headers', (done) => {
    const { context, req } = makeContext({ headers: { [TRACE_ID_HEADER]: 'header-trace' } });
    const next = { handle: () => of({}) };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(req.id).toBe('header-trace');
        done();
      },
    });
  });

  it('should not overwrite existing response trace header', (done) => {
    const { context, res } = makeContext();
    res.getHeader.mockReturnValue('existing-header');
    const next = { handle: () => of({}) };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(res.setHeader).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should rethrow error after logging', (done) => {
    const { context } = makeContext();
    const error = new Error('Test error');
    const next = { handle: () => throwError(() => error) };

    interceptor.intercept(context, next).subscribe({
      error: (err) => {
        expect(err).toBe(error);
        done();
      },
    });
  });
});
