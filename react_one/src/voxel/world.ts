import { createNoise2D, fbm, ridged } from './noise'
import { mulberry32 } from './rng'

/** Every dimension of the diorama lives here so the mesher and the scene agree. */
export const GRID_SIZE = 48
export const MAX_HEIGHT = 20
export const SEA_LEVEL = 4
/** Bottom of the "diorama slab" - gives the island a thick rocky base. */
export const BASE_Y = -7
/** Water surface, slightly above the sea-level voxel row. */
export const WATER_Y = SEA_LEVEL + 0.12

export type ToolId = 'raise' | 'lower' | 'smooth'

export interface TreeAnchor {
  i: number
  j: number
  /** Trunk length in voxels. */
  trunk: number
  variant: number
}

export interface CrystalSpike {
  dx: number
  dz: number
  height: number
  width: number
  tiltX: number
  tiltZ: number
}

export interface CrystalAnchor {
  i: number
  j: number
  hue: number
  spikes: CrystalSpike[]
}

export interface World {
  seed: number
  size: number
  heights: Int16Array
  trees: TreeAnchor[]
  crystals: CrystalAnchor[]
}

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Biggest height difference with the four direct neighbours. */
export function slopeAt(heights: Int16Array, size: number, i: number, j: number): number {
  const h = heights[j * size + i]
  const sample = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= size || y >= size ? h : heights[y * size + x]
  return Math.max(
    Math.abs(h - sample(i - 1, j)),
    Math.abs(h - sample(i + 1, j)),
    Math.abs(h - sample(i, j - 1)),
    Math.abs(h - sample(i, j + 1)),
  )
}

/** Procedural island: a soft basin + ridged mountain spines + a little noise on top. */
export function createWorld(seed: number): World {
  const size = GRID_SIZE
  const half = size / 2
  const heights = new Int16Array(size * size)

  const baseNoise = createNoise2D(seed)
  const peakNoise = createNoise2D(seed ^ 0x9e3779b9)
  const detailNoise = createNoise2D((seed * 7919 + 13) | 0)

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const nx = (i - half + 0.5) / half
      const nz = (j - half + 0.5) / half
      const distance = Math.sqrt(nx * nx + nz * nz)
      const falloff = smoothstep(0.45, 1.05, distance)

      const basin = fbm(baseNoise, nx * 2.4 + 13.7, nz * 2.4 - 8.1, 4) * 0.5 + 0.5
      const peak = Math.pow(ridged(peakNoise, nx * 2.1 - 4.3, nz * 2.1 + 7.7, 3), 2.4)
      const detail = fbm(detailNoise, nx * 8.5, nz * 8.5, 2)

      let height = basin * 9.5 + peak * 23 + detail * 1.3
      height *= 1 - falloff * 0.93

      // Nothing is ever empty: the slab always has at least one voxel,
      // so the island can never spring a hole into the void.
      heights[j * size + i] = clamp(Math.round(height), 1, MAX_HEIGHT)
    }
  }

  const trees = plantTrees(heights, size, seed)
  const crystals = placeCrystals(heights, size, seed)

  return { seed, size, heights, trees, crystals }
}

function plantTrees(heights: Int16Array, size: number, seed: number): TreeAnchor[] {
  const random = mulberry32(seed ^ 0x5a17c3)
  const blocked = new Uint8Array(size * size)
  const trees: TreeAnchor[] = []

  for (let j = 3; j < size - 3 && trees.length < 72; j++) {
    for (let i = 3; i < size - 3; i++) {
      const height = heights[j * size + i]
      if (height < SEA_LEVEL + 1 || height > SEA_LEVEL + 8) continue
      if (slopeAt(heights, size, i, j) > 1) continue
      if (blocked[j * size + i] === 1) continue
      if (random() > 0.13) continue

      trees.push({ i, j, trunk: 2 + Math.floor(random() * 3), variant: random() })
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const x = i + di
          const y = j + dj
          if (x >= 0 && y >= 0 && x < size && y < size) blocked[y * size + x] = 1
        }
      }
    }
  }

  return trees
}

function placeCrystals(heights: Int16Array, size: number, seed: number): CrystalAnchor[] {
  const random = mulberry32(seed ^ 0x7f4a7c15)
  const crystals: CrystalAnchor[] = []

  for (let j = 2; j < size - 2 && crystals.length < 8; j++) {
    for (let i = 2; i < size - 2; i++) {
      const height = heights[j * size + i]
      if (height < SEA_LEVEL + 7) continue
      if (slopeAt(heights, size, i, j) > 2) continue
      if (random() > 0.09) continue

      const spikes: CrystalSpike[] = []
      const count = 2 + Math.floor(random() * 3)
      for (let s = 0; s < count; s++) {
        spikes.push({
          dx: (random() - 0.5) * 0.7,
          dz: (random() - 0.5) * 0.7,
          height: 1.1 + random() * 2.1,
          width: 0.16 + random() * 0.18,
          tiltX: (random() - 0.5) * 0.42,
          tiltZ: (random() - 0.5) * 0.42,
        })
      }

      crystals.push({ i, j, hue: Math.floor(random() * 3), spikes })
    }
  }

  return crystals
}

/**
 * Applies one brush stamp.
 * Returns true when at least one column actually changed, which lets the
 * caller skip pointless geometry rebuilds (and pointless undo entries).
 */
export function sculpt(
  world: World,
  centerI: number,
  centerJ: number,
  radius: number,
  tool: ToolId,
): boolean {
  const { size, heights } = world
  let changed = false

  for (let dj = -radius; dj <= radius; dj++) {
    for (let di = -radius; di <= radius; di++) {
      // Round-ish brush footprint, slightly squared off like a pixel brush.
      if (di * di + dj * dj > radius * radius + radius * 0.4) continue

      const i = centerI + di
      const j = centerJ + dj
      if (i < 0 || j < 0 || i >= size || j >= size) continue

      const index = j * size + i
      const current = heights[index]
      let next: number

      if (tool === 'raise') {
        next = Math.min(MAX_HEIGHT, current + 1)
      } else if (tool === 'lower') {
        next = Math.max(1, current - 1)
      } else {
        let sum = 0
        let count = 0
        for (let nj = -1; nj <= 1; nj++) {
          for (let ni = -1; ni <= 1; ni++) {
            const x = i + ni
            const y = j + nj
            if (x < 0 || y < 0 || x >= size || y >= size) continue
            sum += heights[y * size + x]
            count += 1
          }
        }
        const average = Math.round(sum / count)
        next = current > average ? current - 1 : current < average ? current + 1 : current
      }

      if (next !== current) {
        heights[index] = next
        changed = true
      }
    }
  }

  return changed
}

export function snapshotWorld(world: World): Int16Array {
  return world.heights.slice()
}

export function restoreWorld(world: World, snapshot: Int16Array): void {
  world.heights.set(snapshot)
}

export function countVoxels(world: World): number {
  let total = 0
  for (let k = 0; k < world.heights.length; k++) total += world.heights[k]
  return total
}
