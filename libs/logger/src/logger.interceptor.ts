import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { catchError, Observable, tap } from 'rxjs';

import { AppLogger, RequestContext } from './app-logger.service';
import {
  TRACE_ID_HEADER,
  readTraceIdFromHeaders,
  setTraceContext,
  writeTraceIdHeader,
} from './trace-context';

@Injectable()
export class LoggerInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const handler = context.getHandler();
    const controllerClass = context.getClass();

    const serviceName = controllerClass.name;
    const location = handler.name;

    const contextInfo = { service: serviceName, location };

    const start = Date.now();

    const request = req as RequestContext;

    const existingHeaderTraceId = readTraceIdFromHeaders(request.headers);
    const traceId = req.id ?? existingHeaderTraceId ?? randomUUID();

    if (!req.id) {
      req.id = traceId;
    }

    if (!existingHeaderTraceId) {
      writeTraceIdHeader(request.headers, traceId);
    }

    if (!res.getHeader || !res.getHeader(TRACE_ID_HEADER)) {
      res.setHeader(TRACE_ID_HEADER, traceId);
    }

    setTraceContext({
      traceId,
      userId: request.user?.sub,
      path: req.url,
      start,
    });

    this.logger.logRequest(req, contextInfo);

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - start;
        this.logger.logResponse(req, res, data, duration, contextInfo);
      }),
      catchError((err) => {
        const duration = Date.now() - start;
        this.logger.logError(req, res, err, duration, contextInfo);
        throw err;
      }),
    );
  }
}
