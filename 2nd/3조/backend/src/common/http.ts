import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { map } from 'rxjs';
import { Prisma } from '../../generated/prisma/client';
export function serialize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)]),
    );
  return value;
}
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next
      .handle()
      .pipe(map((data) => ({ success: true, data: serialize(data) })));
  }
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    let status = 500;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = '서버 오류가 발생했습니다.';
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      const detail =
        typeof body === 'string'
          ? { message: body }
          : (body as { code?: string; message?: string | string[] });
      code =
        detail.code ??
        {
          400: 'VALIDATION_ERROR',
          404: 'NOT_FOUND',
          409: 'CONFLICT',
          503: 'SERVICE_UNAVAILABLE',
        }[status] ??
        'HTTP_ERROR';
      message = Array.isArray(detail.message)
        ? detail.message.join('; ')
        : (detail.message ?? error.message);
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        status = 409;
        code = 'METADATA_CONFLICT';
        message = '이미 등록된 metadata 또는 transaction입니다.';
      }
      if (error.code === 'P2025' || error.code === 'P2003') {
        status = 404;
        code = 'METADATA_NOT_FOUND';
        message = '연관 metadata를 찾을 수 없습니다.';
      }
    }
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ success: false, error: { code, message } });
  }
}
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
}
