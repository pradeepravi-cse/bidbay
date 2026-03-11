import { TraceIdMiddleware, TRACE_ID_HEADER } from '@bidbay/logger';

describe('TraceIdMiddleware', () => {
  let middleware: TraceIdMiddleware;

  beforeEach(() => {
    middleware = new TraceIdMiddleware();
  });

  function makeReqRes(headers: Record<string, string> = {}) {
    const req: any = { headers, id: undefined };
    const setHeader = jest.fn();
    const getHeader = jest.fn().mockReturnValue(undefined);
    const res: any = { setHeader, getHeader };
    const next = jest.fn();
    return { req, res, next };
  }

  it('should generate a new traceId when none exists', () => {
    const { req, res, next } = makeReqRes();

    middleware.use(req, res, next);

    expect(req.id).toBeDefined();
    expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, req.id);
    expect(next).toHaveBeenCalled();
  });

  it('should reuse existing x-trace-id from request headers', () => {
    const { req, res, next } = makeReqRes({ [TRACE_ID_HEADER]: 'existing-trace-id' });

    middleware.use(req, res, next);

    expect(req.id).toBe('existing-trace-id');
    expect(res.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, 'existing-trace-id');
    expect(next).toHaveBeenCalled();
  });

  it('should reuse req.id if already set', () => {
    const { req, res, next } = makeReqRes();
    req.id = 'preset-id';

    middleware.use(req, res, next);

    expect(req.id).toBe('preset-id');
    expect(res.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, 'preset-id');
    expect(next).toHaveBeenCalled();
  });

  it('should not overwrite response header if already set', () => {
    const { req, res, next } = makeReqRes();
    res.getHeader.mockReturnValue('already-set');

    middleware.use(req, res, next);

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should write traceId into request headers', () => {
    const { req, res, next } = makeReqRes();

    middleware.use(req, res, next);

    expect(req.headers[TRACE_ID_HEADER]).toBe(req.id);
  });
});
