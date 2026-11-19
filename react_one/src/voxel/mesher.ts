import { BASE_Y, MAX_HEIGHT, SEA_LEVEL, slopeAt } from './world'
import type { World } from './world'

/**
 * Turns the height map into triangle soup.
 * Nothing in this file knows about Babylon: it only produces typed arrays
 * that the renderer uploads, which keeps the mesh generation easy to test.
 */

export type RGB = readonly [number, number, number]
type Vec3 = readonly [number, number, number]

export interface Geometry {
  positions: number[]
  normals: number[]
  colors: number[]
  indices: number[]
  faces: number
}

export function createGeometry(): Geometry {
  return { positions: [], normals: [], colors: [], indices: [], faces: 0 }
}

/** Pushes one flat-shaded quad, winding is irrelevant: the voxel materials are double sided. */
export function pushQuad(
  geometry: Geometry,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  normal: Vec3,
  color: RGB,
  shade: number,
): void {
  const base = geometry.positions.length / 3
  const corners = [a, b, c, d]
  for (const corner of corners) {
    geometry.positions.push(corner[0], corner[1], corner[2])
    geometry.normals.push(normal[0], normal[1], normal[2])
    geometry.colors.push(color[0] * shade, color[1] * shade, color[2] * shade, 1)
  }
  geometry.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  geometry.faces += 1
}

const BOX_SHADE = { x: 0.84, y: 1, z: 0.92, bottom: 0.55 } as const

/** Axis aligned box from its centre, six faces, baked directional shading. */
export function pushBox(
  geometry: Geometry,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  color: RGB,
): void {
  const x0 = cx - sx / 2
  const x1 = cx + sx / 2
  const y0 = cy - sy / 2
  const y1 = cy + sy / 2
  const z0 = cz - sz / 2
  const z1 = cz + sz / 2

  pushQuad(geometry, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], color, BOX_SHADE.y)
  pushQuad(geometry, [x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [0, -1, 0], color, BOX_SHADE.bottom)
  pushQuad(geometry, [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [1, 0, 0], color, BOX_SHADE.x)
  pushQuad(geometry, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0], color, BOX_SHADE.x)
  pushQuad(geometry, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], color, BOX_SHADE.z)
  pushQuad(geometry, [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [0, 0, 1], color, BOX_SHADE.z)
}

const SAND: RGB = [0.8, 0.72, 0.52]
const WET_SAND: RGB = [0.55, 0.51, 0.38]
const SEABED: RGB = [0.26, 0.33, 0.33]
const GRASS: RGB = [0.43, 0.72, 0.34]
const GRASS_DARK: RGB = [0.29, 0.55, 0.27]
const DIRT: RGB = [0.44, 0.32, 0.22]
const ROCK: RGB = [0.46, 0.47, 0.53]
const ROCK_DARK: RGB = [0.3, 0.31, 0.37]
const SNOW: RGB = [0.94, 0.96, 0.99]
const SNOW_ROCK: RGB = [0.56, 0.6, 0.68]
const TRUNK: RGB = [0.41, 0.29, 0.2]
const LEAF_A: RGB = [0.36, 0.66, 0.31]
const LEAF_B: RGB = [0.27, 0.55, 0.28]
const LEAF_TOP: RGB = [0.52, 0.79, 0.39]

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

const tintOf = (color: RGB, tint: number): RGB => {
  const k = 0.9 + tint * 0.2
  return [color[0] * k, color[1] * k, color[2] * k]
}

/** Deterministic 0..1 hash, gives each column its own subtle colour wobble. */
const columnTint = (i: number, j: number): number => {
  const value = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453
  return value - Math.floor(value)
}

/** Surface material plus the material that shows on freshly carved cliffs. */
export function columnMaterials(
  height: number,
  slope: number,
  tint: number,
): { top: RGB; deep: RGB } {
  if (height <= SEA_LEVEL) {
    const depth = (SEA_LEVEL - height) / SEA_LEVEL
    return { top: mix(SAND, SEABED, Math.min(1, depth * 1.25)), deep: mix(WET_SAND, SEABED, 0.7) }
  }
  if (height >= MAX_HEIGHT - 6 && slope < 3) {
    return { top: tintOf(SNOW, tint * 0.5), deep: SNOW_ROCK }
  }
  if (slope >= 3 || height >= 13) {
    return { top: tintOf(ROCK, tint), deep: ROCK_DARK }
  }
  if (height <= SEA_LEVEL + 2) {
    return { top: tintOf(GRASS, tint), deep: DIRT }
  }
  return { top: tintOf(GRASS_DARK, tint), deep: DIRT }
}

/** The island itself: one merged mesh, only the faces that can actually be seen. */
export function buildTerrainGeometry(world: World): Geometry {
  const geometry = createGeometry()
  const { size, heights } = world
  const half = size / 2

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const height = heights[j * size + i]
      if (height <= 0) continue

      const x0 = i - half
      const x1 = x0 + 1
      const z0 = j - half
      const z1 = z0 + 1
      const tint = columnTint(i, j)
      const slope = slopeAt(heights, size, i, j)
      const materials = columnMaterials(height, slope, tint)

      pushQuad(
        geometry,
        [x0, height, z0],
        [x1, height, z0],
        [x1, height, z1],
        [x0, height, z1],
        [0, 1, 0],
        materials.top,
        1,
      )

      pushColumnSides(geometry, heights, size, i, j, height, x0, x1, z0, z1, materials)
    }
  }

  // Close the bottom of the slab so the diorama reads as one solid chunk of world.
  pushQuad(
    geometry,
    [-half, BASE_Y, -half],
    [-half, BASE_Y, half],
    [half, BASE_Y, half],
    [half, BASE_Y, -half],
    [0, -1, 0],
    [0.15, 0.17, 0.21],
    1,
  )

  return geometry
}

function pushColumnSides(
  geometry: Geometry,
  heights: Int16Array,
  size: number,
  i: number,
  j: number,
  height: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  materials: { top: RGB; deep: RGB },
): void {
  for (let dir = 0; dir < 4; dir++) {
    const di = dir === 0 ? -1 : dir === 1 ? 1 : 0
    const dj = dir === 2 ? -1 : dir === 3 ? 1 : 0
    const ni = i + di
    const nj = j + dj
    const inside = ni >= 0 && nj >= 0 && ni < size && nj < size
    // Border columns get a tall cliff down to the base of the slab.
    const start = inside ? heights[nj * size + ni] : BASE_Y

    for (let y = start; y < height; y++) {
      const depth = height - y
      const color = depth <= 2 ? materials.top : materials.deep
      // Gentle vertical falloff: reads as ambient occlusion, keeps cliffs voxel-y.
      const shade = Math.max(0.62, 0.97 - (depth - 1) * 0.035)
      const y1 = y + 1

      if (di === -1) {
        pushQuad(geometry, [x0, y, z0], [x0, y1, z0], [x0, y1, z1], [x0, y, z1], [-1, 0, 0], color, shade)
      } else if (di === 1) {
        pushQuad(geometry, [x1, y, z1], [x1, y1, z1], [x1, y1, z0], [x1, y, z0], [1, 0, 0], color, shade)
      } else if (dj === -1) {
        pushQuad(geometry, [x1, y, z0], [x1, y1, z0], [x0, y1, z0], [x0, y, z0], [0, 0, -1], color, shade)
      } else {
        pushQuad(geometry, [x0, y, z1], [x0, y1, z1], [x1, y1, z1], [x1, y, z1], [0, 0, 1], color, shade)
      }
    }
  }
}

/** Canopy offsets: [dx, dy, dz] around the top of the trunk. */
const CANOPY: readonly (readonly [number, number, number])[] = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, 0, 1],
  [0, 0, 0],
  [-1, 1, -1],
  [1, 1, 1],
  [-1, 1, 1],
  [1, 1, -1],
  [0, 1, 0],
  [0, 2, 0],
]

/** Trees ride the terrain: they are re-anchored to the current height on every rebuild. */
export function buildPropsGeometry(world: World): Geometry {
  const geometry = createGeometry()
  const { size, heights, trees } = world
  const half = size / 2

  for (const tree of trees) {
    const height = heights[tree.j * size + tree.i]
    if (height <= 0) continue

    const x = tree.i - half + 0.5
    const z = tree.j - half + 0.5
    const trunkWidth = 0.34 + tree.variant * 0.1

    for (let k = 0; k < tree.trunk; k++) {
      pushBox(geometry, x, height + k + 0.5, z, trunkWidth, 1, trunkWidth, TRUNK)
    }

    const canopyY = height + tree.trunk
    for (const [dx, dy, dz] of CANOPY) {
      const checker = (dx + dy + dz) % 2 === 0
      const color = dy === 2 ? LEAF_TOP : checker ? LEAF_A : LEAF_B
      pushBox(geometry, x + dx, canopyY + dy + 0.5, z + dz, 1.02, 1.02, 1.02, color)
    }
  }

  return geometry
}

/** A lumpy cluster of boxes, used for the drifting sky clouds. */
export function buildCloudGeometry(random: () => number): Geometry {
  const geometry = createGeometry()
  const blocks = 4 + Math.floor(random() * 5)

  for (let b = 0; b < blocks; b++) {
    pushBox(
      geometry,
      (random() - 0.5) * 7,
      (random() - 0.5) * 0.9,
      (random() - 0.5) * 4.5,
      2 + random() * 4.5,
      0.9 + random() * 1.3,
      2 + random() * 3.5,
      [1, 1, 1],
    )
  }

  return geometry
}

export function buildCubeGeometry(size = 1, color: RGB = [1, 1, 1]): Geometry {
  const geometry = createGeometry()
  pushBox(geometry, 0, 0, 0, size, size, size, color)
  return geometry
}

/** Tapered four sided prism: base sits on y = 0, tip on y = 1. */
export function buildSpikeGeometry(): Geometry {
  const geometry = createGeometry()
  const base = 0.5
  const tip = 0.16
  const color: RGB = [1, 1, 1]
  const bottom = [
    [-base, 0, -base],
    [base, 0, -base],
    [base, 0, base],
    [-base, 0, base],
  ] as const
  const top = [
    [-tip, 1, -tip],
    [tip, 1, -tip],
    [tip, 1, tip],
    [-tip, 1, tip],
  ] as const

  for (let f = 0; f < 4; f++) {
    const next = (f + 1) % 4
    pushQuad(geometry, bottom[f], bottom[next], top[next], top[f], [0, 0, 0], color, 1)
  }
  pushQuad(geometry, top[0], top[1], top[2], top[3], [0, 1, 0], color, 1)
  pushQuad(geometry, bottom[3], bottom[2], bottom[1], bottom[0], [0, -1, 0], color, 1)

  return geometry
}

export interface TexturedPlaneGeometry {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
}

/** Textured quad used for the animated water surface (needs UVs, unlike the voxels). */
export function buildTexturedPlane(halfExtent: number, y: number, tiles: number): TexturedPlaneGeometry {
  return {
    positions: [-halfExtent, y, -halfExtent, halfExtent, y, -halfExtent, halfExtent, y, halfExtent, -halfExtent, y, halfExtent],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, tiles, 0, tiles, tiles, 0, tiles],
    indices: [0, 1, 2, 0, 2, 3],
  }
}
