/** Mirrors StreamManager._streamedAmount: multiplies before dividing so the client-side
 * display doesn't drift from what the contract will actually pay out. `asOfSeconds` lets
 * callers evaluate accrual at an arbitrary point in time (e.g. "now" or "start of month"),
 * clamped to the cancellation point once a stream has been cancelled. */
export function streamedAsOf(
  totalAmount: bigint,
  startTime: bigint,
  stopTime: bigint,
  cancelled: boolean,
  cancelledAt: bigint,
  asOfSeconds: bigint
): bigint {
  const effective = cancelled && cancelledAt < asOfSeconds ? cancelledAt : asOfSeconds;
  if (effective <= startTime) return 0n;
  if (effective >= stopTime) return totalAmount;
  const duration = stopTime - startTime;
  const elapsed = effective - startTime;
  return (totalAmount * elapsed) / duration;
}
