/**
 * The store runs on a fixed "today" (STORE_DATE) instead of the wall clock.
 * Seed data, return windows and coupon expiries are all relative to it, so an
 * eval written today still has the same expected answer next year.
 */
export type Clock = () => Date;

export const DEFAULT_STORE_DATE = "2026-09-15";
const DAY_MS = 24 * 60 * 60 * 1000;

export function fixedClock(isoDate: string): Clock {
  const at = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) throw new Error(`Invalid STORE_DATE: ${isoDate}`);
  return () => new Date(at);
}

export function storeClock(): Clock {
  return fixedClock(process.env.STORE_DATE ?? DEFAULT_STORE_DATE);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Whole days from `from` to `to` (floored). */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}
