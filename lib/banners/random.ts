// Random product cards for the home banner carousel (pure parts).

export const RANDOM_BANNER_MAX = 8;
/** Candidates read before picking; a shop larger than this still gets a fair pick of recent stock. */
export const RANDOM_BANNER_POOL = 500;

/** `n` distinct items in random order (Fisher–Yates on a copy). `rand` is injectable for tests. */
export function pickRandom<T>(items: readonly T[], n: number, rand: () => number = Math.random): T[] {
  const copy = [...items];
  const count = Math.max(0, Math.min(n, copy.length));
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}
