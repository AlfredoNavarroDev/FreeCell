import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter, toErrorBody } from './all-exceptions.filter';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

const pgError = (code: string) =>
  new QueryFailedError(
    'SELECT 1',
    [],
    Object.assign(new Error('pg'), { code }),
  );

describe('toErrorBody', () => {
  it('conserva el estado y el mensaje de una HttpException', () => {
    expect(
      toErrorBody(new ConflictException('Sin stock suficiente de X')),
    ).toEqual({
      statusCode: 409,
      message: 'Sin stock suficiente de X',
      error: 'Conflict',
    });
    expect(
      toErrorBody(new NotFoundException('Pedido no encontrado')).statusCode,
    ).toBe(404);
  });

  it('traduce una violación de unicidad de Postgres a 409', () => {
    expect(toErrorBody(pgError('23505'))).toEqual({
      statusCode: 409,
      message: 'El recurso ya existe',
      error: 'Conflict',
    });
  });

  it('traduce CHECK y errores de trigger a 409 sin filtrar detalles', () => {
    for (const code of ['23514', 'P0001']) {
      expect(toErrorBody(pgError(code))).toEqual({
        statusCode: 409,
        message: 'Operación no permitida en el estado actual',
        error: 'Conflict',
      });
    }
  });

  it('traduce el error de body-parser por tamaño a 413 sin filtrar detalles', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
    });
    expect(toErrorBody(tooLarge)).toEqual({
      statusCode: 413,
      message: 'El cuerpo de la solicitud es demasiado grande',
      error: 'Payload Too Large',
    });
  });

  it('cualquier otro error es 500 genérico', () => {
    expect(toErrorBody(new Error('detalle interno con SQL'))).toEqual({
      statusCode: 500,
      message: 'Error interno',
      error: 'Internal Server Error',
    });
    expect(toErrorBody(pgError('42P01')).statusCode).toBe(500);
  });
});

describe('AllExceptionsFilter.catch', () => {
  const buildHost = (): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ id: 'req-1' }),
        getResponse: () => ({}),
      }),
    }) as unknown as ArgumentsHost;

  const buildAdapterHost = (): HttpAdapterHost =>
    ({ httpAdapter: { reply: jest.fn() } }) as unknown as HttpAdapterHost;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reporta a Sentry un error 500', () => {
    const filter = new AllExceptionsFilter(buildAdapterHost());
    filter.catch(new Error('boom'), buildHost());
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('no reporta a Sentry un error esperado (4xx)', () => {
    const filter = new AllExceptionsFilter(buildAdapterHost());
    filter.catch(new NotFoundException('Pedido no encontrado'), buildHost());
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
