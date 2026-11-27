import { roundMoney } from './accounting';
import type { InventoryMethod } from './types';

export interface StockLot {
  qty: number;
  unitCost: number;
}

export interface StockInResult {
  newQty: number;
  newAvgCost: number;
  newTotalValue: number;
}

/**
 * Updates weighted average unit cost and total inventory valuation on stock receipt (Purchase / Opening Stock).
 */
export function computeWeightedAvgStockIn(
  currentQty: number,
  currentAvgCost: number,
  addedQty: number,
  purchaseUnitCost: number
): StockInResult {
  if (addedQty <= 0) {
    throw new Error('Added stock quantity must be positive.');
  }
  const safeCurrentQty = Math.max(0, currentQty);
  const currentValue = safeCurrentQty * Math.max(0, currentAvgCost);
  const addedValue = addedQty * Math.max(0, purchaseUnitCost);
  const newQty = roundMoney(safeCurrentQty + addedQty);
  const newTotalValue = roundMoney(currentValue + addedValue);
  const newAvgCost = newQty > 0 ? roundMoney(newTotalValue / newQty) : roundMoney(purchaseUnitCost);

  return { newQty, newAvgCost, newTotalValue };
}

export interface StockOutResult {
  remainingQty: number;
  cogsTotal: number;
  effectiveUnitCost: number;
  remainingLots?: StockLot[];
}

/**
 * Calculates Cost of Goods Sold (COGS) and remaining stock using either Weighted Average or FIFO lots.
 */
export function computeStockOutCOGS(params: {
  method: InventoryMethod;
  currentQty: number;
  currentAvgCost: number;
  soldQty: number;
  fifoLots?: StockLot[];
}): StockOutResult {
  const { method, currentQty, currentAvgCost, soldQty } = params;
  if (soldQty <= 0) {
    throw new Error('Sold quantity must be positive.');
  }

  if (method === 'fifo' && params.fifoLots && params.fifoLots.length > 0) {
    let remainingToDeduct = soldQty;
    let cogsTotal = 0;
    const nextLots: StockLot[] = [];

    for (const lot of params.fifoLots) {
      if (lot.qty <= 0) continue;
      if (remainingToDeduct <= 0) {
        nextLots.push({ ...lot });
        continue;
      }
      const consume = Math.min(lot.qty, remainingToDeduct);
      cogsTotal += consume * lot.unitCost;
      remainingToDeduct -= consume;
      const leftover = roundMoney(lot.qty - consume);
      if (leftover > 0) {
        nextLots.push({ qty: leftover, unitCost: lot.unitCost });
      }
    }

    if (remainingToDeduct > 0) {
      // Fallback to current average cost if stock goes slightly negative on backorder
      cogsTotal += remainingToDeduct * currentAvgCost;
    }

    const finalCogs = roundMoney(cogsTotal);
    return {
      remainingQty: roundMoney(currentQty - soldQty),
      cogsTotal: finalCogs,
      effectiveUnitCost: roundMoney(finalCogs / soldQty),
      remainingLots: nextLots,
    };
  }

  const cogsTotal = roundMoney(soldQty * Math.max(0, currentAvgCost));
  return {
    remainingQty: roundMoney(currentQty - soldQty),
    cogsTotal,
    effectiveUnitCost: roundMoney(currentAvgCost),
  };
}
