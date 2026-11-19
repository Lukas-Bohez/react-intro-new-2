/**
 * Deterministic pseudo random numbers.
 * Every island is reproducible from a single numeric seed,
 * which is what makes the "seed chip" in the HUD meaningful.
 */

/** mulberry32 - tiny, fast, good enough for terrain and props. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a, used to turn free text into a stable seed. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Accepts digits or arbitrary words ("lagoon", "42", "bram") and returns a positive seed. */
export function seedFromInput(value: string): number {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 1
  const base = /^\d+$/.test(trimmed) ? Number(trimmed) : hashString(trimmed)
  return (((base % 1999999) + 1999999) % 1999999) + 1
}

/** Compact base36 label so seeds stay short in the HUD. */
export function formatSeed(seed: number): string {
  return (seed >>> 0)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0')
    .slice(-6)
}
