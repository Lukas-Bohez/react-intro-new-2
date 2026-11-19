# Handoff — read this first

Written for the next AI (or human) picking up **Quiz the Spire**. Everything here is verified
working code, not theory; the details live in `docs/FINDINGS.md` and `docs/MASTERPROMPT.md`.

## 1. What was built and where

| Path | What it is |
| --- | --- |
| `src/voxel/rng.ts` | seeded PRNG + seed hashing/labels (any word is a seed) |
| `src/voxel/noise.ts` | value noise, fBm, ridged multifractal |
| `src/voxel/world.ts` | procedural island height map, biomes, trees/crystals, brush sculpting, undo snapshots |
| `src/voxel/mesher.ts` | **face-culled voxel mesher**, pure data, no Babylon imports, Babylon-correct winding |
| `src/voxel/VoxelScene.ts` | Babylon 9 scene: orbit camera, drag-to-sculpt, day/night, water, clouds, crystals, glow, shadows, picking, screenshots, pixel render mode |
| `src/components/VoxelStudio.tsx` | React 19 HUD: tool palette, brush, seed, stats, day clock, poster export, keyboard map |
| `src/components/VoxelStudio.css` | **pixel-art HUD rules**: 2 px hard frames, 0 radius, no blur, no glass, no side borders |
| `docs/FINDINGS.md` | every Babylon/React trap found while building this, with numbers |
| `docs/MASTERPROMPT.md` | the expanded Quiz the Spire build prompt (loop, art law, systems, tech, QA) |

Run it: `cd react_one && npm install && npm run dev`.

## 2. Facts you can build on (do not re-derive)

- **Voxel meshing works and is fast**: 48×48×(≤20) → 6,589 quads / 26k verts in **one draw call**;
  full terrain + props rebuild is **≈ 4.4 ms**, so sculpting/destruction can rebuild live, once per
  frame, behind a dirty flag.
- **Winding**: Babylon front faces are clockwise in its left-handed space, i.e.
  `cross(b − a, c − a) = −normal`. Assert it in tests; wrong winding is invisible until you enable
  culling/shadows and then it is hell to debug.
- **`VertexData.colors` is RGBA (4 floats/vertex)** and `applyToMesh` only enables material alpha if
  `vertexData.hasVertexAlpha` is set — so reuse one mesh for rebuilds and stay opaque.
- **Always `mesh.refreshBoundingInfo()` after replacing vertex data**, or picking silently rots.
- **`imageProcessingConfiguration.applyByPostProcess = true` does not create a post process** — it
  only disables in-material grading. Keep it `false` unless you add a pipeline.
- **Instanced meshes**: `source.isVisible = false` hides only the source, instances still render.
  `setEnabled(false)` on the source hides the instances too.
- **React 19 StrictMode + Babylon**: create the canvas inside the effect and remove it in cleanup.
  Reusing a React canvas for a second `Engine` can lose the context.
- **`engine.setHardwareScalingLevel(base * 2)` + CSS `image-rendering: pixelated`** is a free,
  authentic low-res voxel look. (`base` is `1 / devicePixelRatio` with `adaptToDeviceRatio`.)

## 3. The art law (this is the user's explicit direction)

2D is **pixel art**, 3D is **voxel art**, and the UI must not look generated. Concretely: **no side
borders on anything**, no `border-radius`, no `backdrop-filter`, no soft/blurred shadows, no gradient
heroes, no card grids, no emoji/icons fonts, no 200 ms easing — instead 2 px hard frames, hard
offset shadows, stepped animation, one fixed palette, monospace tabular numbers, icons drawn as
chunky SVGs/sprites.

## 4. The game loop (do not "improve" this without asking)

Handcrafted **obby** → yields **combat XP + the loop's combat gear** → **dungeon** (clone robots,
**destructible voxels**, **repair bots**, destroyable **mender cores**) → **crate** → **packages
only from here** + **first-open rebirth** → **tycoon** (new part, forges the next **movement gear**,
sells the next obby painting) → repeat six times, four unlocks per loop (1 combat gear, 1 combat
ability, 1 movement gear, 1 movement ability). **PvP only in opt-in Danger Zone rooms.** No
procedural obbies. No quizzes during combat.

## 5. Recommended next steps (in order)

1. **Framework of the site, not the game**: apply the pixel art law to `quizthespire.com` first
   (layout, palette, HUD frames, `#tools` as an inventory grid). It is the fastest visible win.
2. **Voxel core upgrade**: 16³ chunks + greedy meshing + per-chunk dirty rebuild + damage map +
   structural anchoring. Port the mesher rules from `src/voxel/mesher.ts` and keep its tests.
3. **Destruction + repair bots**: damage map first, bots second, mender cores third. Server-side.
4. **One vertical slice**: one obby → one dungeon room with two cores → crate → rebirth → tycoon
   part. Do not build content before this is fun.
5. Then the six-loop ladder, then Danger Zone, then polish/telemetry.

## 6. Open questions for the user

- Quiz domain: is it a specific subject (e.g. coding, biology) or general knowledge? It changes the
  obby themes and the Field Notes art.
- Is the game single-player-with-lobbies, or fully multiplayer hubs? It changes the netcode scope
  massively (authoritative voxel damage is the expensive part).
- Accountancy: are packages server-side only, or is offline/local play required?

## 7. Do not do

Do not add a second currency, a premium shop, procedural levels, quizzes inside fights, PvP outside
Danger Zones, rounded cards, glass panels, blurred backdrops, gradient heroes, spinners, skeleton
loaders, or "jump through hoops to collect a package" busywork. The user has explicitly called that
loop boring.
