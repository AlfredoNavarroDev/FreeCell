import { formatAuthorName } from './author-name.util';

describe('formatAuthorName', () => {
  it('nombre + inicial del último apellido', () => {
    expect(formatAuthorName('Carlos Manuel Pérez')).toBe('Carlos P.');
  });

  it('dos palabras: nombre + inicial', () => {
    expect(formatAuthorName('maría lópez')).toBe('maría L.');
  });

  it('respeta acentos y eñes en la inicial', () => {
    expect(formatAuthorName('Álvaro Ñúñez')).toBe('Álvaro Ñ.');
  });

  it('una sola palabra se muestra tal cual', () => {
    expect(formatAuthorName('Ana')).toBe('Ana');
  });

  it('espacios repetidos no rompen el formato', () => {
    expect(formatAuthorName('  Luis    Gómez  ')).toBe('Luis G.');
  });

  it.each([null, undefined, '', '   '])(
    'sin nombre (%p) devuelve «Cliente verificado»',
    (value) => {
      expect(formatAuthorName(value)).toBe('Cliente verificado');
    },
  );
});
