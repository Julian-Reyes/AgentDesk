/**
 * Money is always an integer number of cents. Floats can't represent most
 * decimal amounts exactly (0.1 + 0.2 !== 0.3), so every price, discount and
 * refund is stored and computed as whole cents, and rounding happens in one
 * place: here.
 */
export type Cents = number;

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) throw new Error(`Not an integer cent amount: ${value}`);
  return value;
}

/** `percent`% of `amount`, rounded half-up to the nearest cent. */
export function percentOf(amount: Cents, percent: number): Cents {
  // Integer math first (amount * percent), then a single division + rounding.
  return Math.floor((amount * percent + 50) / 100);
}

export function dollars(amount: number): Cents {
  return Math.round(amount * 100);
}

export function formatCents(amount: Cents): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
