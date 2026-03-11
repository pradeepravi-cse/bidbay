import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

import {
  TRACE_ID_HEADER,
  readTraceIdFromHeaders,
  writeTraceIdHeader,
} from './trace-context';

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    const existing = readTraceIdFromHeaders(req.headers);
    const traceId = req.id ?? existing ?? randomUUID();

    req.id = traceId;
    writeTraceIdHeader(req.headers, traceId);

    const currentHeader = res.getHeader?.(TRACE_ID_HEADER);
    if (!currentHeader) {
      res.setHeader(TRACE_ID_HEADER, traceId);
    }

    next();
  }
}
