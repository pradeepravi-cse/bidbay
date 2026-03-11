import { AsyncLocalStorage } from 'async_hooks';

export const TRACE_ID_HEADER = 'x-trace-id';

type HeaderValue = string | string[] | undefined;
type HeaderBag = Record<string, HeaderValue> | NodeJS.Dict<HeaderValue> | undefined;

export interface TraceContext {
  traceId?: string;
  userId?: string;
  path?: string;
  start?: number;
}

const storage = new AsyncLocalStorage<TraceContext>();

export function setTraceContext(ctx: TraceContext) {
  storage.enterWith(ctx);
}

export function getTraceContext(): TraceContext {
  return storage.getStore() ?? {};
}

export function coerceTraceId(value?: HeaderValue): string | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.find(Boolean);
  }
  return value;
}

export function readTraceIdFromHeaders(headers?: HeaderBag): string | undefined {
  if (!headers) {
    return undefined;
  }
  const candidates: HeaderValue[] = [
    headers[TRACE_ID_HEADER],
    headers[TRACE_ID_HEADER.toUpperCase()],
  ];

  for (const candidate of candidates) {
    const normalized = coerceTraceId(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

export function writeTraceIdHeader(headers: HeaderBag, traceId: string) {
  if (!headers) {
    return;
  }

  headers[TRACE_ID_HEADER] = traceId;
}
