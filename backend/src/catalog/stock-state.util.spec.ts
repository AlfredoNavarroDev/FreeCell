import { aggregateStockState } from './stock-state.util';

describe('aggregateStockState', () => {
  it('IN_STOCK si al menos un plan está en stock', () => {
    expect(aggregateStockState(['OUT_OF_STOCK', 'IN_STOCK', 'LOW'])).toBe(
      'IN_STOCK',
    );
  });

  it('LOW si ningún plan está en stock pero alguno tiene pocas unidades', () => {
    expect(aggregateStockState(['OUT_OF_STOCK', 'LOW'])).toBe('LOW');
  });

  it('OUT_OF_STOCK si todos los planes están agotados', () => {
    expect(aggregateStockState(['OUT_OF_STOCK', 'OUT_OF_STOCK'])).toBe(
      'OUT_OF_STOCK',
    );
  });

  it('OUT_OF_STOCK si no hay planes', () => {
    expect(aggregateStockState([])).toBe('OUT_OF_STOCK');
  });
});
