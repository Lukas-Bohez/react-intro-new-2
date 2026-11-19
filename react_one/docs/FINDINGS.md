# Findings — a voxel diorama in Babylon.js 9 + React 19

Everything below came out of building `Voxel Terraformer` in this repository. Concrete numbers,
API traps and design rules, so the next person (or AI) does not have to rediscover them.

---

## 0. Environment facts

- **Babylon `9.37.1`** ships a split build: `*.pure.js` is side-effect free and tree-shakeable,
  the plain `*.js` file next to it is a thin wrapper that calls `Register*()` to install shaders
  and scene components. `import ... from '@babylonjs/core'` pulls *all* of it: **6.56 MB /
  1.47 MB gzip**. Subpath imports work but you must know which `Register*` side effect each
  feature needs (shadow code, glow layer shaders, procedural texture shaders, post processes).
  Shipping rule: prototype with the root import, then thin it out with the bundle analyser open.
- **TypeScript 6.0** with `erasableSyntaxOnly` (no `enum`, no constructor parameter properties),
  `verbatimModuleSyntax` (type imports must be `import type`) and `noUnusedLocals` /
  `noUnusedParameters`. `strictPropertyInitialization` was effectively on, so fields assigned
  inside helper methods called from the constructor need a `!` definite-assignment marker.
- **React 19 StrictMode double-mounts effects.** Create the `<canvas>` *inside* the effect and
  remove it in cleanup. Reusing a React-rendered canvas for a second `Engine` loses the WebGL
  context and the second engine can fail to start.
- Vite 8 dev server + `tsc -b` is a good loop: typecheck catches every Babylon API name, the
  dev server catches module resolution. Neither catches WebGL behaviour — see §3.

## 1. Voxel meshing

- **Column height map + face culling** is the sweet spot for a diorama: for a 48×48 grid with
  heights ≤ 20 the naive "6 faces per voxel" mesh would be ≈ 100k quads; emitting only exposed
  faces gives **6,589 quads / 26,356 vertices / 9,652 voxels in one draw call**.
- A full rebuild (terrain + all tree geometry) costs **≈ 4.4 ms** on a laptop-class CPU measured
  in Node. That is what makes live sculpting possible: rebuild once per frame behind a `dirty`
  flag, never per pointer event.
- **`VertexData.colors` is RGBA, 4 floats per vertex.** Babylon auto-detects the stride
  (`4` when `colors.length !== positions.length`).
- **`VertexData.applyToMesh(mesh)` only sets `hasVertexAlpha = true` if you set
  `vertexData.hasVertexAlpha`.** So reusing one mesh for every rebuild keeps the terrain opaque —
  exactly what you want. All vertex alphas are 1.
- **Call `mesh.refreshBoundingInfo()` after replacing vertex data.** Otherwise picking and frustum
  culling keep using stale bounds and clicks near the island edge silently stop working.
- **Winding matters even when it looks like it doesn't.** Babylon front faces are
  **clockwise in its left-handed system**, i.e. `cross(b − a, c − a) = −normal`. I verified it by
  dumping `CreateBoxVertexData` and comparing every face. With `backFaceCulling = false` a wrong
  winding is invisible — until you enable culling, cast shadows, or add a glow layer, and then it
  is a nightmare to find. Make it correct from the first quad (and assert it in a test).
- **Bake shading into vertex colours** instead of adding SSAO: top `1.0`, ±X `0.84`, ±Z `0.92`,
  bottom `0.55`, plus a vertical falloff toward the bottom of cliffs (`0.97 − depth·0.035`,
  floor `0.62`). Voxel art wants flat, readable faces, not smooth contact shadows.
- **Derive biome colour from height and slope at mesh time, never store it.** Then sculpting
  recolours automatically: dig a mountain and the walls become dirt then stone, raise a beach and
  it becomes snow. This one decision makes terraforming feel physically real.
- Trees and other props should be **re-anchored to the current column height on each rebuild**, so
  they ride the terrain instead of floating when you sculpt underneath them.

## 2. Babylon API traps the typings cannot catch

- **`scene.imageProcessingConfiguration.applyByPostProcess = true` does not create a post
  process.** It only tells materials to *skip* in-shader image processing (`standardMaterial`
  checks `!applyByPostProcess`). Enable it without adding an `ImageProcessingPostProcess` and tone
  mapping silently disappears. For material-level grading keep it `false`: exposure, contrast and
  ACES tone mapping work in-shader; vignette does not.
- **Instanced meshes:** `visibility` proxies the source mesh, but `isVisible` is per instance.
  `source.isVisible = false` hides only the source and leaves all instances rendering (the standard
  particle/foliage pattern). `source.setEnabled(false)` hides everything. Setting `material` or
  `receiveShadows` on an instance only logs a warning.
- **`NoiseProceduralTexture` needs UVs** on the mesh and only animates through
  `animationSpeedFactor` + `ProceduralTexture.refreshRate` (default `1` = every frame). A ground
  plane without a `uvs` buffer renders flat.
- **`CreateScreenshotUsingRenderTarget` is a standalone function** in `Misc/screenshotTools` in
  v9 (`CreateScreenshotUsingRenderTarget(engine, camera, { width, height }, cb)`), not a `Tools.*`
  helper. Remember `preserveDrawingBuffer: true` for readback-style captures.
- **`camera.attachControl(canvas, true)` still works** through the backwards-compatibility overload;
  `detachControl()` takes no arguments. Detach/attach around a drag is cheap and reliable.
- **Directional shadows:** a 2048 PCF map with `autoUpdateExtends` + `autoCalcShadowZBounds` is
  fine for a 48-unit island; leaving the default depth range (0…10000) destroys precision.
- **`engine.setHardwareScalingLevel(base * 2)` + CSS `image-rendering: pixelated`** gives a free,
  authentic low-resolution voxel look. Cache the base level — with `adaptToDeviceRatio: true` it is
  already `1 / devicePixelRatio`.
## 3. Interaction findings (making "drag to sculpt" work)

- **Do not fight the orbit camera.** Pick on `POINTERDOWN`; if the ray hits the world, call
  `camera.detachControl()` for the duration of the stroke and re-attach on `POINTERUP`. Dragging
  the sky still orbits. No modifier keys, no mode switch, no tutorial.
- **Right-drag inverts the tool** (raise ↔ carve). Suppress `contextmenu` on the canvas.
- **Interpolate between picks (Bresenham).** `pointermove` fires far apart during a fast drag, and
  dotted strokes feel broken even though the code is "correct".
- **Lazy undo snapshots.** Capture the height map on pointer-down but push it onto the undo stack
  only on the first stamp that actually changes something. Otherwise undo is full of no-ops and the
  button lies.
- **Recover from a missed `pointerup`** with `window` listeners for `pointerup`, `pointercancel`
  and `blur`. Without the blur handler a drag that ends outside the window leaves the camera
  detached forever.
- **Pick the wall you can see.** Nudge the picked point `0.01` units against the hit normal so
  clicking a cliff face edits the wall's own column instead of the empty column behind it.
- **Brush preview as instanced translucent tiles** sitting on top of each affected column is enough
  feedback; no outlines or decals needed. Cap the pool at `(2·maxBrush+1)²` and toggle
  `setEnabled`.
- Spark/debris feedback on every stamp (pooled instanced cubes with gravity and fade) turns a
  technical operation into something that feels good — worth the ~40 lines.

## 4. Design findings — how "AI-looking" UI happens

The brief for the next iteration is explicit: **no design-system chrome**. Audit of what made the
first pass read as generated, and what replaced it:

| Smell | Replacement |
| --- | --- |
| 1px borders around every card | 2px hard black frames with a 2px inner bevel |
| `backdrop-filter: blur()` glass panels | flat `#171b2b` panels + 4px dithered scanline pattern |
| 12–16px border-radius | `border-radius: 0` everywhere |
| Soft multi-layer shadows | solid offset shadows (`4px 4px 0 #000`) that move on press |
| Purple/blue gradient hero, 3+ stop gradients | 2–3 stop flat accents, no gradient text |
| `border-inline` on the page container | **removed — no side borders anywhere** |
| Smooth 200ms cubic-bezier fades | `steps(4, end)` stepped animation, pressed states that snap |
| Centred everything, big empty whitespace | anchored HUD panels at the four corners |
| Emoji as icons | 3–5 path SVGs, chunky `fill: currentColor` |

Rule of thumb: **if a detail could not be drawn inside a 64×64 pixel-art HUD frame, it does not
belong in the UI.** Hard edges, 2px alignment, limited palette, tabular monospace numbers.

## 5. Budgets worth reusing

- Terrain 6.5k quads / 1 draw call; trees 2.2k quads; 150 star instances; 15 cloud meshes;
  81 brush tiles; 72 spark cubes; 24 crystal spikes — all instanced or merged.
- Terrain rebuild 4.4 ms; one brush stamp = one rebuild per frame maximum.
- Day cycle: 9 palette stops, 154 s per full day, exposure changes throttled to 0.01 steps so
  materials are not re-graded every frame.
- Root-imported Babylon: 6.56 MB raw / 1.47 MB gzip. Budget a thin-import pass before shipping.

## 6. What I would add next (not implemented here)

Useful signal for the next builder, in rough value order:

1. **SSAO2RenderingPipeline** — voxel dioramas gain enormously from contact shadows in crevices.
2. **Chunked meshes + thin instances** for worlds beyond ~64×64 (one mesh per 16×16 chunk,
   rebuild only the dirty chunk).
3. **Havok physics V2** — destructible voxel chunks, debris with mass, repair bots that rebuild
   from a damage map.
4. **`HighlightLayer`** for hover/selection instead of emissive tints.
5. **`GPUParticleSystem`** for destruction bursts (thousands of particles in one draw call).
6. **NodeMaterial** for the sky: gradient + stars + sun disc in a single shader, no cube sun.
7. **PBRMaterial + IBL** for crystals/water now that tone mapping is correct.
8. **CascadedShadowGenerator** once the play area grows past one island.
9. **WebGPUEngine** with an automatic WebGL fallback (`engineFactory`).
10. **`glb` props** authored in MagicaVoxel, loaded via `AssetsManager`, still snapped to the
    voxel grid.

