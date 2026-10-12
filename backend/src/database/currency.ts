/** Monedas permitidas (D61). Agregar una nueva exige migración: cambia los CHECK. */
export const CURRENCIES = ['PEN', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Expresión SQL para @Check sobre una columna de moneda. */
export const currencyCheck = (column: string): string =>
  `"${column}" IN ('PEN', 'USD')`;

/** Columna de moneda: char(3). */
export const CURRENCY_COLUMN = { type: 'char', length: 3 } as const;
