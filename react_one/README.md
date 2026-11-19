# Voxel Terraformer

A procedural voxel island you can dig your hands into. React 19 + TypeScript on top of
Babylon.js, with zero assets: every terrain, tree, crystal and cloud is generated from a seed
and rebuilt on the fly while you sculpt.

**Docs:** [findings from building it](docs/FINDINGS.md) ·
[the Quiz the Spire master prompt](docs/MASTERPROMPT.md) ·
[handoff for the next builder](docs/HANDOFF.md)

```bash
npm install
npm run dev
```

## Art direction

Pixel art in 2D, voxel art in 3D, and no "design system" chrome: hard 2 px frames, zero border
radius, hard offset shadows, stepped animation, a fixed palette, no glass, no blur, **no side
borders anywhere**. `P` toggles a half-resolution nearest-neighbour render for an authentic
low-res voxel look.

## What is in here

**The island is a height map, the mesh is real voxel geometry.**
`src/voxel/mesher.ts` walks every column and emits only the quads that can actually be seen
(top caps, exposed side strips, the rim cliff, a bottom cap). A 48 × 48 grid becomes ~6.5k
quads instead of ~100k, one draw call, with per-vertex colours and baked vertical shading so
freshly carved cliffs read as stone.

**Everything is deterministic.** `src/voxel/rng.ts` (mulberry32) + `src/voxel/noise.ts`
(value noise, fBm, ridged multifractal) turn one number into a whole island. Same seed, same
island, every time. Trees and crystals are anchored to columns, so they ride the terrain up
and down when you sculpt underneath them.

**One sun drives the entire scene.** `updateSky()` samples a nine-stop palette and derives the
directional light direction/colour/intensity, the hemisphere light, the sky clear colour, fog,
water tint, cloud tint, sun and moon positions, star opacity, crystal emissive strength, glow
intensity and exposure. Scrub the clock or let it run (~3 minutes per day).

**Drag-to-sculpt without fighting the camera.** Pointer down first picks the terrain; if it
hits land the camera detaches for the stroke, so dragging sculpts and releasing re-attaches it.
Dragging the sky still orbits. All changes are diffed through a rebuild flag, so a brush stamp
costs about 4 ms of geometry regeneration.

## Controls

| Input                    | Action                                  |
| ------------------------ | --------------------------------------- |
| Drag the island          | Sculpt with the active tool             |
| Drag the sky             | Orbit the camera                        |
| Right-drag               | Invert the tool (raise ↔ carve)         |
| Wheel / pinch            | Zoom                                    |
| `1` `2` `3`              | Raise · Carve · Smooth                  |
| `[` `]`                  | Brush size                              |
| `Ctrl+Z` / `Ctrl+Shift+Z`| Undo / redo (40 steps)                  |
| `Space`                  | Toggle the slow auto-orbit              |
| `P`                      | Pixel (half-resolution) render mode     |
| `C`                      | Recentre the camera                     |
| `R`                      | New island                              |
| Seed box + `go`          | Generate a specific island (words work) |

## Layout

```
src/
  App.tsx                  mounts the studio
  components/
    VoxelStudio.tsx        HUD, input wiring, demo state
    VoxelStudio.css        glass panels + neon accents
  voxel/
    rng.ts                 seeded PRNG, seed hashing/labels
    noise.ts               value noise, fBm, ridged multifractal
    world.ts               island generation, biomes, sculpting, snapshots
    mesher.ts              face-culled voxel geometry (no Babylon imports)
    VoxelScene.ts          engine, camera, lights, water, clouds, glow, picking
```

`world.ts` and `mesher.ts` are deliberately free of Babylon, so the whole generator can be
unit tested (or run in Node) without a GPU.

## Notes

- `@babylonjs/core` is imported from the package root on purpose: the root entry registers every
  shader and scene component, which keeps the glow layer, shadows, procedural water and tone
  mapping reliable. The trade-off is a large bundle; a production build could switch to thin
  imports once the exact side-effect list is pinned down.
- Tone mapping is applied per material (`applyByPostProcess` stays off), so the sky clear colour
  is intentionally left untone-mapped.
