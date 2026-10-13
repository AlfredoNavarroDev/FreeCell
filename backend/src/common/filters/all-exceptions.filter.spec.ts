import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { toErrorBody } from './all-exceptions.filter';

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
