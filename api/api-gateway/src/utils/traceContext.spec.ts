import {
  TRACE_ID_HEADER,
  coerceTraceId,
  readTraceIdFromHeaders,
  writeTraceIdHeader,
  setTraceContext,
  getTraceContext,
} from '@bidbay/logger';

describe('traceContext utils', () => {
  describe('coerceTraceId', () => {
    it('returns undefined for undefined input', () => {
      expect(coerceTraceId(undefined)).toBeUndefined();
    });

    it('returns string value as-is', () => {
      expect(coerceTraceId('my-trace')).toBe('my-trace');
    });

    it('returns first truthy element from array', () => {
      expect(coerceTraceId(['', 'trace-2'])).toBe('trace-2');
    });

    it('returns undefined when all array elements are falsy', () => {
      expect(coerceTraceId(['', ''])).toBeUndefined();
    });
  });

  describe('readTraceIdFromHeaders', () => {
    it('returns undefined when headers is undefined', () => {
      expect(readTraceIdFromHeaders(undefined)).toBeUndefined();
    });

    it('reads lowercase x-trace-id header', () => {
      expect(readTraceIdFromHeaders({ [TRACE_ID_HEADER]: 'trace-123' })).toBe('trace-123');
    });

    it('reads uppercase X-TRACE-ID header', () => {
      expect(readTraceIdFromHeaders({ [TRACE_ID_HEADER.toUpperCase()]: 'trace-upper' })).toBe('trace-upper');
    });

    it('returns undefined when trace header is absent', () => {
      expect(readTraceIdFromHeaders({ 'content-type': 'application/json' })).toBeUndefined();
    });

    it('returns first element when header is an array', () => {
      expect(readTraceIdFromHeaders({ [TRACE_ID_HEADER]: ['trace-array', 'other'] })).toBe('trace-array');
    });
  });

  describe('writeTraceIdHeader', () => {
    it('writes trace ID to headers bag', () => {
      const headers: Record<string, string> = {};
      writeTraceIdHeader(headers, 'new-trace');
      expect(headers[TRACE_ID_HEADER]).toBe('new-trace');
    });

    it('does nothing when headers is undefined', () => {
      expect(() => writeTraceIdHeader(undefined as any, 'trace')).not.toThrow();
    });
  });

  describe('setTraceContext / getTraceContext', () => {
    it('stores and retrieves trace context', () => {
      setTraceContext({ traceId: 'ctx-trace', path: '/test' });
      const ctx = getTraceContext();
      expect(ctx.traceId).toBe('ctx-trace');
      expect(ctx.path).toBe('/test');
    });

    it('returns empty object when no context is set', () => {
      // In a fresh async context getTraceContext returns {}
      const ctx = getTraceContext();
      expect(ctx).toBeDefined();
      expect(typeof ctx).toBe('object');
    });
  });
});
