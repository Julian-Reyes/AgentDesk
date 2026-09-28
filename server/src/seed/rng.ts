/**
 * mulberry32: a tiny, well-known seeded PRNG. The same seed always yields the
 * same sequence on every machine and Node version, so the seed data is
 * byte-for-byte reproducible. (Faker's output can change between versions.)
 */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  const weighted = <T>(entries: readonly (readonly [T, number])[]): T => {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = next() * total;
    for (const [value, w] of entries) {
      if ((r -= w) < 0) return value;
    }
    return entries[entries.length - 1]![0];
  };
  return { next, int, pick, weighted };
}

export type Rng = ReturnType<typeof createRng>;
