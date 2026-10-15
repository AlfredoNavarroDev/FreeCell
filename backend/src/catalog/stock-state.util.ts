import type { StockState } from '../database/views/plan-stock.view';

const PRIORITY: StockState[] = ['IN_STOCK', 'LOW', 'OUT_OF_STOCK'];

/** El estado agregado del producto es el mejor estado entre sus planes activos (D69). */
export function aggregateStockState(states: StockState[]): StockState {
  for (const state of PRIORITY) {
    if (states.includes(state)) return state;
  }
  return 'OUT_OF_STOCK';
}
