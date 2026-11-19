import { mulberry32 } from './rng'

/** Signed value noise in [-1, 1]. */
export type Noise2D = (x: number, y: number) => number

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

/**
 * Value noise with a shuffled permutation table.
 * Cheaper than gradient noise and it gives the chunky, blobby shapes
 * that look great once quantised to whole voxels.
 */
export function createNoise2D(seed: number): Noise2D {
  const random = mulberry32(seed)
  const source = new Uint8Array(256)
  for (let i = 0; i < 256; i++) source[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = source[i]
    source[i] = source[j]
    source[j] = swap
  }

  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = source[i & 255]

  const lattice = (ix: number, iy: number): number =>
    perm[(perm[ix & 255] + (iy & 255)) & 511] / 127.5 - 1

  return (x: number, y: number): number => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = fade(x - ix)
    const fy = fade(y - iy)

    const v00 = lattice(ix, iy)
    const v10 = lattice(ix + 1, iy)
    const v01 = lattice(ix, iy + 1)
    const v11 = lattice(ix + 1, iy + 1)

    const top = v00 + (v10 - v00) * fx
    const bottom = v01 + (v11 - v01) * fx
    return top + (bottom - top) * fy
  }
}

/** Fractal brownian motion, normalised to [-1, 1]. */
export function fbm(
  noise: Noise2D,
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2.02,
  gain = 0.5,
): number {
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * frequency, y * frequency) * amplitude
    norm += amplitude
    amplitude *= gain
    frequency *= lacunarity
  }
  return sum / norm
}

/** Ridged multifractal in [0, 1] - produces sharp mountain spines. */
export function ridged(noise: Noise2D, x: number, y: number, octaves = 3): number {
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * frequency, y * frequency))
    sum += n * n * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2.13
  }
  return sum / norm
}
