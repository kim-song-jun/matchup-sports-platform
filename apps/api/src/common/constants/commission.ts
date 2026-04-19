/** Platform commission rate for all transaction types (10%). */
export const MARKETPLACE_COMMISSION_RATE = 0.10;

/**
 * Computes the platform commission for a given gross amount.
 * Rounds to the nearest integer (Korean won has no decimal places).
 */
export function computeCommission(grossAmount: number): number {
  return Math.round(grossAmount * MARKETPLACE_COMMISSION_RATE);
}
