// Crit 10 extension, Stage 9 (plans/crit-10.md "Extension"; ADR 0007): a
// tiny seeded PRNG so the harness needs no new dependency for randomness
// beyond fast-check's own generators (which this module doesn't touch —
// it backs scripts/simulate.ts's "50 seeds" requirement, where a plain,
// reproducible, non-fast-check generator is simpler to seed by hand).
// mulberry32: public-domain, 32-bit state, good enough statistically for a
// simulation that isn't claiming cryptographic quality.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next(): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int(min: number, maxInclusive: number): number {
      return min + Math.floor(next() * (maxInclusive - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)];
    },
    chance(p: number): boolean {
      return next() < p;
    },
  };
}
