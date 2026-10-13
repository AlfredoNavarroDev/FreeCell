import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

const conflict = (message: string): ErrorBody => ({
  statusCode: 409,
  message,
  error: 'Conflict',
});

/** Convierte cualquier excepción al formato público de docs/06, sin filtrar SQL ni stacks. */
export function toErrorBody(exception: unknown): ErrorBody {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : ((response as { message?: string | string[] }).message ??
          exception.message);
    return { statusCode, message, error: STATUS_TEXT[statusCode] ?? 'Error' };
  }

  if (exception instanceof QueryFailedError) {
    const code = (exception.driverError as { code?: string } | undefined)?.code;
    if (code === '23505') return conflict('El recurso ya existe');
    if (code === '23514' || code === 'P0001')
      return conflict('Operación no permitida en el estado actual');
  }

  // body-parser (vía Express) lanza un error plano (no HttpException) al superar el límite de `useBodyParser`.
  if (
    exception instanceof Error &&
    (exception as { type?: string }).type === 'entity.too.large'
  ) {
    return {
      statusCode: 413,
      message: 'El cuerpo de la solicitud es demasiado grande',
      error: 'Payload Too Large',
    };
  }

  return {
    statusCode: 500,
    message: 'Error interno',
    error: 'Internal Server Error',
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ id?: string }>();
    const body = toErrorBody(exception);

    if (body.statusCode >= 500 || exception instanceof QueryFailedError) {
      // El detalle (SQL, stack) solo va al log, con el request id para correlacionar.
      this.logger.error(
        { err: exception, requestId: request.id },
        'Error al procesar la solicitud',
      );
    }
    this.adapterHost.httpAdapter.reply(
      ctx.getResponse(),
      body,
      body.statusCode,
    );
  }
}
