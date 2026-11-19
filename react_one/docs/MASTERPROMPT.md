# QUIZTHESPIRE — MASTER BUILD PROMPT v2

> **How to use this document.** This is the single source of truth for building, extending and
> reviewing everything on quizthespire.com. Treat every section as a hard requirement unless it is
> explicitly marked *optional*. When a new request conflicts with a rule here, the rule wins and the
> request has to justify itself in writing. The sections are ordered so an AI builder can work
> top-down: rules → loop → modes → systems → technology → UI → content → process.

---

## 0. North star (one paragraph)

Quiz the Spire is a **handcrafted pixel-art obby and voxel dungeon game** built on top of a quiz
engine. Players climb hand-built obstacle courses for **equipment**, take that equipment into
**voxel dungeons** full of clone robots where the world is **destructible and actively repaired**,
and turn the loot into a **tycoon** that unlocks the next obby. Every mode feeds the next one and
none can be farmed alone. Everything is **pixel art in 2D, voxel art in 3D**, drawn by hand,
hard-edged, and deliberately *not* built out of generic UI components. The site should feel like a
1994 shareware classic that somehow runs at 144 fps in a browser.

---

## 1. Non-negotiable rules

### 1.1 Art direction — pixels and voxels only

**2D (menus, HUD, icons, effects, cutscenes, quiz cards):**
- **Pixel art only.** Authored at integer scales (1×, 2×, 3×, 4×), never scaled to fractional sizes.
- One global palette (32–48 colours) plus per-biome 8-colour variant ramps. No colour outside the
  palette, ever — no `#1e88e5` pulled from a UI framework.
- **No antialiasing on sprites.** `image-rendering: pixelated`, nearest-neighbour, integer positions.
- **Dithering instead of gradients.** 2×2 or 4×4 ordered dither for shading. Never CSS gradients on
  sprites; never soft radial glows.
- Icons are **sprite assets**, not icon-font glyphs, not emoji.
- Text: one pixel font at 1× for body, 2× for headings, integer baseline. Numbers are tabular.

**3D (dungeons, obby backgrounds, PvP arenas, tycoon plot, viewmodel):**
- **Voxel art only.** 1 world unit = 1 voxel. Nothing smooth, nothing bevelled, nothing organically
  sculpted.
- Flat shading, hard normals, **baked per-face shading** (top bright, sides darker, bottom darkest).
- Limited palette per biome, same palette family as the 2D art.
- **Chunked geometry** (16×16×16 voxel chunks) so terrain can be destroyed and repaired.
- World-space effects (dust, sparks, debris) are *also voxel cubes* — square particles only.

**Mixed media:** the 2D pixel UI sits on top of the 3D voxel world as a **diegetic HUD** (frames,
plates, rivets, wooden borders). It must look like the game's own art, not like a web framework.

### 1.2 The "no AI design system" kill list

These are **banned**, in code review and in prompts. If a screenshot contains any of them, the
feature is not done.

1. **Side borders on anything.** No `border-inline`, no left/right rules on page containers, no
   vertical dividers framing the viewport. **Full-bleed, edge-to-edge layouts.** (This is the single
   most important rule: the boxed-in column is the #1 tell of a generated web page.)
2. Glassmorphism (`backdrop-filter: blur`) panels floating over content.
3. Border-radius on cards, buttons, inputs, avatars. **Zero radius**, except intentional pixel
   chamfers drawn in the sprite itself (2 px steps).
4. Soft/stacked shadows (`0 10px 30px rgba(0,0,0,.25)`). Use **hard offset shadows**
   (`4px 4px 0 #000`) or none.
5. Purple→blue gradient hero sections, gradient text, "shiny" gradient buttons.
6. Three-column feature grids with identical icon + heading + lorem cards.
7. Emoji as icons. Icon fonts (Font Awesome et al.). Generic Lucide/Heroicons outlines.
8. Floating pill navbars with a glass background and `999px` radius.
9. Centred-everything layouts with a huge empty band of whitespace under the fold.
10. `200ms cubic-bezier(.4,0,.2,1)` fades on everything. Use **stepped** animation
    (`steps(3, end)`), snappy 80–120 ms transitions, and *impact* over smoothing.
11. Skeleton-shimmer loading screens, toasts sliding in from the top right, modals with blurred
    backdrops.
12. "Modern SaaS" copywriting: *seamless, effortless, elevate your, unleash, supercharge,
    game-changing, powered by AI*. See Appendix A.
13. Design-system tokens borrowed from Tailwind/Material defaults (`slate-900`, `indigo-500`,
    `rounded-xl`, `shadow-lg`). Invent the palette and name colours after the world (§1.4).
14. Decoration *around* the screen: side rails, dotted page borders, corner brackets on the
    viewport, a decorative grid overlay across the whole page.

### 1.3 Layout law: full bleed, anchored corners

- The canvas is **100vw × 100vh**, `position: fixed; inset: 0`. No page container, no max-width,
  no margins, **no side borders**.
- Game UI is anchored to the **four corners** with 8–16 px offsets, never centred in a column.
- Scrolling pages (store, quiz library, patch notes) are **full-bleed pixel panels** separated by
  chunky horizontal seams — not centred cards. Horizontal seams are allowed; vertical side frames
  are not.
- Every interactive element snaps to a **2 px grid**. No half-pixel positions.
- Respect `env(safe-area-inset-*)` on mobile; HUD elements never overlap thumb zones in landscape.

### 1.4 Palette (starting point, extend per biome)

| Token | Hex | Use |
| --- | --- | --- |
| `void` | `#05060b` | outlines, background, all borders |
| `stone-1` | `#171b2b` | panel fill |
| `stone-2` | `#232a40` | raised buttons, tiles |
| `stone-3` | `#3b4569` | bevel highlight |
| `bone` | `#e8f1ff` | primary text |
| `ash` | `#93a2c4` | secondary text |
| `mint` | `#57f2c6` | primary accent, "good", repair |
| `lime` | `#b8f26a` | rewards, tycoon income |
| `amber` | `#ffb95c` | warnings, shop highlights |
| `violet` | `#b58cff` | rebirth, magic, paintings |
| `blood` | `#ff6b6b` | damage, danger zones |

Biome ramps reuse these hues; never introduce a new hue without adding it here first.

### 1.5 Motion rules

- Impact frames, hit-stop, screenshake on heavy hits (3–6 px, 90 ms, stepped).
- UI transitions: 80–120 ms, `steps()`, no easing that feels like a web app.
- Numbers "tick" upward in discrete steps, never smooth-count.
- Anything that can be a sprite-sheet animation should be one (flipbook at 8–12 fps).

### 1.6 Audio direction

- 8-bit/16-bit chip **plus** one acoustic layer (a single recorded instrument) for the spire theme —
  this keeps it from sounding like a generic chiptune pack.
- Material-aware footsteps and impacts (stone, wood, metal, cloth, glass).
- Every destructive event has a sound; every repair is the *reverse* of that sound.
- Music: 3 loops max (hub, dungeon, danger zone), 45–90 s each, seamless, ducked under UI.

### 1.7 The three hard currencies (and nothing else)

| Currency | Icon | Earned from | Spent on |
| --- | --- | --- | --- |
| **Packages** | cardboard box | **Dungeon crates only** (plus a slow tycoon trickle) | tycoon parts, obby access, repair-bot upgrades, cosmetics |
| **Combat XP** | crossed blades | **Obbies only** (checkpoints, quiz gates, first clears) | gear ranks, ability modifiers, weapon skins |
| **Spire Rank** | tower | quiz accuracy + streak across all modes | cosmetic titles, quiz perks, extra hint slots |

Rules that must never be broken:
- **Money is packages.** There is no second money type, no gems, no coins. One currency, one icon.
- **Packages only come out of dungeons** (crates) and tycoon parts that *consume* packages to
  produce more. You cannot buy a package with XP, and you cannot buy XP with packages.
- **Combat XP never comes from dungeons.** It comes from obbies and quizzes only. This is what keeps
  obbies mandatory after the first clear.

---

## 2. The core loop (authoritative)

### 2.1 The four verbs

| Mode | Verb | Gives | Costs |
| --- | --- | --- | --- |
| **Obby** (handcrafted) | *climb* | **Combat XP** + the loop's **combat gear** | time, skill, packages to unlock the painting |
| **Dungeon** (voxel, clone combat) | *clear* | **Packages** (crates) + **rebirth** on first clear | the combat gear you earned |
| **Tycoon** (voxel plot) | *build* | the loop's **traversal gear**, slow package trickle | packages |
| **Danger Zone** (PvP, opt-in) | *fight* | Spire Rank, cosmetics, bonus packages on kill streaks | your gear, your nerve |

Nothing else exists. There is no "walk here, collect package" loop. If a designer proposes one,
the answer is "put it in a dungeon".

### 2.2 The loop, step by step (this exact order, every time)

1. **Enter an obby by jumping into its painting.** Paintings hang in the hub. A locked painting is
   sepia and framed in `ash`; an available one is coloured and framed in `mint`; a cleared one is
   gilded in `amber`. Jumping *into* the canvas starts a dolly-in transition — there is no level
   select menu.
2. **Climb it.** Handcrafted only. Checkpoints award **combat XP**. **Quiz gates** block certain
   doors: answer the spire's question and the door opens; fail and you lose four seconds while it
   laughs at you (no death, no gear loss).
3. **Pick up the combat gear that sits on the course.** Every obby physically *contains* its reward:
   a sword in a stone, a bow on a pedestal, a stunrod hidden behind a breakable wall you can only
   reach with the traversal gear from the tycoon. The reward is not a pop-up — you carry it out.
4. **Jump into the loop's dungeon painting** with that gear equipped. This is the **danger zone
   combat**: clone robots, dismemberment, destructible voxels, repair bots. You are meant to die
   here; checkpoints are per room, not per dungeon.
5. **Open the crate at the end.** Packages pour out. **The first time ever you open this particular
   crate, you also ascend — a rebirth.**
6. **Rebirth unlocks** the next **painting** (the next dungeon) and a **new tycoon part slot**, plus
   the loop's two abilities (one combat, one movement). Everything you own is kept forever —
   rebirth is a checkpoint in progression, not a wipe.
7. **Go to the tycoon.** Place the newly unlocked part. Parts turn packages into more packages
   (slowly, capped) and **produce the traversal gear** that the next obby needs to be *reached* and
   *finished*. Spend packages to buy the next obby's painting.
8. **Repeat.** Six loops. Each one hands you exactly four unlocks: **1 combat gear + 1 combat
   ability + 1 movement gear + 1 movement ability**, split across the three modes on purpose.

### 2.3 The rebirth ladder (six loops, 24 unlocks)

| # | Name | Obby (handcrafted) | Tycoon → traversal gear | Obby → combat gear | Rebirth → abilities | Dungeon painting |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | First Ascent | Ivy Ledges (free) | Wooden Ramp → *Spring Soles* | *Rusty Saber* | Heavy Swing · Double Jump | Cellar of Clones |
| 2 | The Bloom | Bramble Scramble (250 ₱) | Planter Row → *Climbing Claws* | *Thorn Bow* | Arrow Volley · Wall Run | The Greenhouse |
| 3 | Static Ruin | Copper Coils (900 ₱) | Dynamo Bench → *Kinetic Boots* | *Hidden Stunrod* | Overcharge · Dash | The Dynamo |
| 4 | Hollow Depths | The Sunken Stair (2.4k ₱) | Pump House → *Grapple Rig* | *Tide Gauntlet* | Ground Pound · Grapple Hook | Drowned Foundry |
| 5 | Spire Engine | Clockwork Vertigo (6k ₱) | Gear Press → *Glider Frame* | *Piston Hammer* | Shield Bash · Air Glide | The Gearworks |
| 6 | The Crown | Crown of Nails (15k ₱) | Throne Forge → *Phase Cloak* | *Mirror Blade* | Time Fracture · Blink | Throne of Echoes |

- **Loop 6's rebirth** unlocks ranked Danger Zone, the *Spirewalker* title, and the endless
  "Ascendant" difficulty tier (same six dungeons, remixed rooms, +1 modifier each).
- Every tier keeps the four-unlock rule. If a new system needs more rewards, add a **gear rank**
  (paid with combat XP), not a seventh unlock per loop.
- Prices above are first-pass placeholders. They must be tuned so the average player reaches the
  next loop in **20–35 minutes of play**, never more than one hour.

### 2.4 Why the modes cannot be farmed alone

- **Obbies give XP, never packages.** After the first clear, the obby's painting pays XP and quiz
  questions only — you still need dungeons to afford anything.
- **Dungeons give packages, never XP.** You can buy the whole tycoon and still be mechanically weak
  if you skipped obbies, because gear ranks require XP.
- **The tycoon produces traversal gear, never combat power.** You cannot buy your way through a
  dungeon; you can only buy the ability to *reach* the next obby.
- **Movement abilities are reborn, not bought.** No mode can shortcut the rebirth chain.

### 2.5 Anti-boredom rules (mandatory)

1. **Rotation bonus.** The first clear of *each* mode in a session pays +25% of its own currency
   (XP for obby, +1 package for a dungeon, +1 part production tick for the tycoon).
2. **Diminishing returns inside minutes, not days.** Repeating the same dungeon in under 30 minutes
   reduces its crate yield by 25% per repeat, resetting hourly. Players are pushed to rotate, not
   locked out.
3. **Soft caps, never hard walls.** Tycoon income caps per part; XP has a per-obby soft cap that
   resets daily. Never "come back tomorrow".
4. **Catch-up curve.** If your gear is one loop behind the content you are in, obbies pay double XP
   and dungeons drop one extra package. Nobody gets stuck behind a skill cliff.
5. **Cross-mode quests.** A rotating board of three quests, always one from each mode, always paying
   the currency you are short on.

---

## 3. The modes

### 3.1 Obbies — handcrafted, always

- **Handcrafted only. No procedural obbies, no "generate 100 levels" tools.** Automated obbies are
  why players quit: they read as noise, they have no author, and they cannot teach a mechanic.
  A human must place every jump.
- **Level grammar** (each obby is a paragraph of these, in order): `teach → test → twist → rest →
  test harder → reward`. A mechanic that appears in the test must have been *taught* two rooms
  earlier with zero risk of death.
- **Readability:** the safe path is always the brightest value in the frame; hazards are `blood`
  red; the goal is `violet` and always visible from the last checkpoint.
- **Checkpoints** every 25–40 seconds of intended traversal, always visible, always a physical
  object (a banner, a bell, a boot scraper). Checkpoints pay **combat XP**.
- **Quiz gates:** 2–4 per obby, at choke points, never mid-jump. One question with 4 pixel-art
  answer plates. Correct = door opens + XP. Wrong = 4 s lockout and the correct answer is *shown*
  (teaching, not punishment). Questions come from the site's quiz database, tagged by difficulty
  and the obby's theme.
- **Traversal gear gates:** some routes are only reachable with the loop's traversal gear
  (double jump, wall run, grapple, glide). Never require gear the player cannot own yet — the
  tycoon's production order guarantees the gate appears after the gear.
- **Death rules:** fall = respawn at the checkpoint, no gear loss, 300 ms respawn, no lives. The only
  cost of failure is time.
- **Difficulty tiers per obby:** Normal (intended) → Spire (harder variant, +50% XP) → Ascendant
  (unlocked after loop 6, +100% XP, cosmetic crown). The map never changes between tiers; only
  timings, hazards and one modifier change, so learned maps stay learned.
- **Camera:** third-person chase with a fixed pixel-art vignette; never auto-rotates against input;
  FOV fixed. First person is not allowed in obbies — you cannot read a jump in first person.

### 3.2 Dungeons — clone-drone danger zone combat

- **Setting:** voxel rooms under the spire. Every dungeon is 5–7 rooms: `entry → 2 fights → puzzle
  room → 2 fights → crate room`. Roughly 8–12 minutes for a competent player.
- **Enemies are clone robots.** Same silhouette, different loadouts (§5.4). They are built from the
  same voxel parts as the player's viewmodel, so dismemberment reads instantly.
- **Dismemberment is real:** arms, legs, head and weapon are separate voxel clusters. Losing an arm
  drops your weapon; losing a leg slows you; losing a head kills. Enemies dismember the same way.
- **Destructible + repaired world** (§4): floors break, walls open, and **repair bots** rebuild them
  under pressure. The dungeon is a fight against both the clones and the architecture.
- **Checkpoints are per room.** Death restarts the current room with enemies reset, but destroyed
  terrain *stays destroyed* for the run — your collateral damage is your progress.
- **The crate** sits in the final room behind a 20-second "hold the zone" fight. Opening it is a
  physical animation: the lid pops, packages arc out as voxel cubes, and the first-open rebirth
  happens with a stepped screen-wide flash and a single bell note.
- **No countdowns as failure states.** Pressure comes from enemy behaviour, not a timer.
- **Ascendant modifiers** (post-loop 6, one per run): *Brittle* (everything destroys twice as fast),
  *Overclocked Bots* (repair rate +60%), *No Floor* (the entry platform is gone), *Twin Cores* (two
  crates, one fake).

### 3.3 Tycoon — the machine that makes the doors

- **Voxel plot, top-down third person, one plot per player.** Droppers, conveyors, presses,
  furnaces, and one big **forging bench** that produces traversal gear.
- **Parts consume packages to produce packages**, with a visible rate. Every part has cost, rate,
  cap and upgrade slots. The plot should look like a little factory diorama, not a spreadsheet.
- **The forging bench is the point.** Each loop unlocks exactly one new bench recipe: the loop's
  traversal gear. Once forged, that gear is a physical pickup, and it is also placed on the
  corresponding obby as a required pickup.
- **Plot upgrades** are cosmetic and quality-of-life only: faster belts, bigger hoppers, a lift, a
  sign. **Never** combat power, never XP.
- **Anti-idle:** production halts after 10 minutes without the player present (§2.5).
- **Visual language:** chunky belts, pistons that snap on a 4-step animation, sparks as voxel cubes,
  numbers printed on brass plates. A tycoon should look machined, not designed.

### 3.4 Danger Zone — PvP only in dedicated zones

- **PvP exists in flagged arenas and nowhere else.** Obbies, dungeons, the hub and tycoon plots are
  **PvE-only**; player damage is disabled there at the engine level, not by honour code.
- **Opt-in, always.** Entering a Danger Zone shows a 3-second countdown with the zone's rules.
  Leaving is instant. Inside, you are flagged `huntable` and the HUD shows a blood-red chip (a chip,
  never a border on the screen).
- **Arena design:** small (40×40 voxels), destructible, with repair bots that restore cover every
  12 s. Cover is temporary by design — the arena breathes.
- **Anti-grief:** 10-voxel no-spawn-camp radius around the entrance, 2 s respawn immunity, no loot
  drop on death (only streak packages), leaving clears all debuffs, emotes only (no chat inside).
- **Rewards:** Spire Rank and packages on 3+ kill streaks, capped daily. Losing costs nothing but
  time. PvP must never be the optimal money path (§2.4).

### 3.5 Paintings — the only doors

- Every obby and every dungeon is a **framed painting** standing in the hub: a physical prop (a 2D
  pixel canvas in a 3D frame) with three states — `locked` (sepia, `ash` frame), `open` (coloured,
  `mint` frame), `cleared` (gilded, `amber` frame).
- Entering = **jumping into the canvas**. The camera dollies in, the canvas surface ripples as a
  voxelised wave, and the level loads behind a 4-step curtain. No loading spinners, no progress
  bars; the painting animates while streaming.
- Unlock rules: obby paintings are **bought with packages** at the tycoon's easel; dungeon paintings
  are **unlocked by rebirth**. That ratchet is what keeps the loop moving forward.
- The hub wall is the progression map. A player can read their whole journey at a glance without
  opening a menu.

---

## 4. Destructible world + repair bots (the signature system)

This is the feature that makes Quiz the Spire look like nothing else. It is required in dungeons
and Danger Zones; obbies use it for breakable scenery only (never for the path itself).

### 4.1 Voxel damage model

- The world is stored as **16×16×16 chunks** of voxels, each with `material` and `integrity`:
  `soft` (cloth/wood/foliage, 1 hit), `stone` (3 hits), `metal` (6 hits, resists blades),
  `glass` (1 hit, shatters into shards), `unbreakable` (structure frame, spawn rooms, puzzle floors
  the designer marks as load-bearing).
- **Every voxel knows how it is attached.** A voxel with no path to a `unbreakable` anchor becomes
  loose and falls (or crumbles, if `soft`). This prevents floating islands and gives the destruction
  a physical logic players can learn and exploit.
- **Damage is per-voxel, not per-chunk.** Chunks exist for meshing speed, not gameplay health.
- Chunks are **rebuilt individually** on change (§6.2). A destroyed wall must not rebuild the level.
- Debris: at most **120 live debris instances**, pooled, integrated as `thinInstances` with a tiny
  gravity/step simulation. Debris despawns into a puff of 4-voxel dust.
- Destruction is **loud and generous**: every break spawns 3–6 debris cubes, a material-specific
  sound, a 2-frame hit-stop if the player caused it, and a 1-frame screen shake on structural
  collapses. It must *feel* like removing matter, not toggling a tile.

### 4.2 Repair bots

- **Purpose:** the world fights back. In dungeons, repair bots mean you cannot simply tunnel to the
  crate; you must win the room while it rebuilds around you. In arenas, they keep cover cycling.
- **Behaviour tree (deterministic, server-side):**
  1. *Scan* — every 1.5 s, find the nearest damaged voxel cluster with a path to an anchor.
  2. *Travel* — hover to the cluster along the shortest valid path, at 2 voxels/second.
  3. *Repair* — emit a beam and restore **1 voxel per 0.35 s**, overdrawing `mint` wireframe before
     the voxel solidifies.
  4. *Recharge* — after 12 repaired voxels, return to the nearest **mender core** for 4 s.
- **Mender cores are the counterplay.** Destroy a core (metal, 6 hits) and every bot assigned to it
  stalls for 20 s, with the bots visibly sparking and drifting. A room with two cores is a puzzle:
  silence both, then open the floor.
- **Bots are not enemies but they can be destroyed:** 2 hits, they explode into 8 debris cubes and
  are rebuilt by a core after 15 s. Killing bots is *tempo*, not progress — the core is progress.
- **Telegraphing is mandatory:** a repair beam is visible for 0.4 s before the first voxel is
  restored, so a player can shoot the bot or avoid the restored floor.
- **Player repair:** the player gets a **Mender Tool** (unlocked at loop 4) that repairs 1 voxel per
  0.8 s and costs packages. Used to bridge gaps in obbies' breakable scenery and to seal a dungeon
  room. Never usable to wall off a PvP opponent permanently — repairs inside arenas are capped at
  25 % of destroyed voxels per life.

### 4.3 Determinism and networking

- The **server owns the damage map**. Clients send intents ("hit voxel X with tool Y"), never
  results. Rebuilds are deterministic given the map so a late-joining client can reconstruct
  exactly what the room looks like.
- Repair timers run server-side. Clients predict the visual beam, not the restoration.

---

## 5. Combat, equipment and enemies

### 5.1 The kit rule (exactly four unlocks per loop)

| Slot | Source | Role |
| --- | --- | --- |
| **Combat gear** | picked up **on the obby** | changes how you fight (reach, damage, crowd control) |
| **Combat ability** | granted by the **rebirth** | one active skill with a cooldown and a real cost |
| **Movement gear** | forged at the **tycoon** | changes how you traverse (climb, grapple, glide) |
| **Movement ability** | granted by the **rebirth** | one active traversal skill, shares the movement cooldown |

- One combat gear and one combat ability per loop, one movement gear and one movement ability per
  loop. No exceptions, no extra "bonus" unlocks — bonus power comes from **gear ranks** bought with
  combat XP.
- **Swap rule:** you may carry one combat gear + one combat ability + one movement gear + one
  movement ability at a time. Choosing is content; hoarding is not.
- **No stat sticks.** Every piece must change *how* you play, not just a number. If a gear's only
  effect is +10% damage, delete it and design something else.

### 5.2 The gear table (first six loops)

| Gear | Slot | Source | Verb it adds | Counterplay |
| --- | --- | --- | --- | --- |
| Rusty Saber | combat | Ivy Ledges | 3-hit slash combo, wide arc | slow recovery on the third hit |
| Thorn Bow | combat | Bramble Scramble | ranged charge shot, pins enemies to walls | no melee guard, ammo is your draw time |
| Hidden Stunrod | combat | Copper Coils | short-range zap that stuns robots and **resets repair bots** | tiny reach, 4 s cooldown |
| Tide Gauntlet | combat | The Sunken Stair | water jet that pushes enemies and **floods floors** | needs water or a bottle charge |
| Piston Hammer | combat | Clockwork Vertigo | overhead slam, breaks 3×3×3 voxels | long wind-up, telegraphs loudly |
| Mirror Blade | combat | Crown of Nails | parry that reflects projectiles | timing window of 6 frames |
| Spring Soles | movement | Tycoon lvl 1 | double jump | no wall interaction |
| Climbing Claws | movement | Tycoon lvl 2 | wall run + ledge grab | cannot be used while carrying the crate |
| Kinetic Boots | movement | Tycoon lvl 3 | dash with i-frames, breaks `soft` walls | cooldown shared with the movement ability |
| Grapple Rig | movement | Tycoon lvl 4 | point-and-pull grapple, 12-voxel range | anchor points only |
| Glider Frame | movement | Tycoon lvl 5 | slow fall and air steering | no upward motion |
| Phase Cloak | movement | Tycoon lvl 6 | 0.6 s intangibility through `glass` only | leaves you visible in the danger zone |

- **Abilities (rebirth):** Heavy Swing (arc knockback), Arrow Volley (5 arrows in a fan), Overcharge
  (AoE EMP that stuns bots and disables cores), Ground Pound (crater + launch), Shield Bash (guard
  break), Time Fracture (freeze 1.2 s in a 6-voxel bubble), Double Jump, Wall Run, Dash, Grapple
  Hook, Air Glide, Blink. Each has a cooldown, a cost (nothing is free), and a clear audio tell.
- **Gear ranks** (combat XP): rank 1–5 per gear, each rank adds one *modifier* (faster recovery,
  longer pin, wider arc), never raw damage above +15 %. Ranks are the only XP sink.

### 5.3 Combat feel rules

- **Readability over flash.** Enemy attacks must telegraph for at least 12 frames (200 ms) with a
  colour and a sound unique to the attack type. If a player dies without seeing the telegraph, the
  attack is broken, not the player.
- **Hit-stop:** 60 ms on light hits, 110 ms on heavy hits, 180 ms on kills. Time-scale the world,
  never the UI.
- **Dismemberment is the health bar.** No health bars over enemies. Lose an arm → lose the weapon;
  lose legs → crawl; lose the head → death. Damage numbers are banned.
- **Player health is 4 voxel pips** in the corner, not a bar. Each pip breaks into cubes when lost
  and is *repaired* by the mender beam at checkpoints.
- **No dodge-roll spam:** dodge costs a movement cooldown shared with abilities.
- **Enemy counts:** max 12 live clones per room, 3 archetypes at once. More enemies is not harder,
  it is soup.
- **Camera:** lock-on is optional, never automatic. Aim assist snaps within 6°, no further.

### 5.4 The clone roster

| Archetype | Loadout | Behaviour | Weakness |
| --- | --- | --- | --- |
| **Grunt** | short blade | walks straight at you, telegraphed overhead | slow, breaks in 2 hits |
| **Archer** | bow | holds a lane, retreats when you close | cannot shoot while backing into a wall |
| **Sapper** | charges | plants a voxel bomb, runs away | bombs can be picked up and thrown back |
| **Guard** | tower shield | blocks frontal damage, advances in steps | shield bash / flank / stunning |
| **Flyer** | hover jets | circles above, drops mines | grapple, bow, glide |
| **Mender** | repair beam | repairs terrain and other clones | priority target, fragile |
| **Splitter** | none | splits in two when killed (once) | AoE |
| **Ace** | mirror blade | parries *your* attacks, punishes greed | feints, thrown debris, stun |

Every archetype must be introduced **alone, in a safe room**, before it ever appears in a group.

### 5.5 Where quizzes live (and where they must not)

- **Quizzes live in obbies (gates), the hub (the Spire quiz board), and the tycoon easel (unlock
  riddles).** They do **not** interrupt dungeon combat — pausing a fight to answer a question kills
  flow and reads as an ad.
- One exception: the **insight quiz** at a dungeon entrance. Get it right and the crate room is
  marked on your map and one trap is revealed. Optional, always skippable, always rewarding.

---

## 6. Technology directive — squeeze Babylon.js dry

The site is React + TypeScript + **Babylon.js**. Every feature below is expected unless explicitly
deferred, and each one has a purpose in the game (no tech demos for their own sake).

### 6.1 Engines and the render stack

- **`WebGPUEngine` first, `Engine` (WebGL2) as fallback**, chosen through `engineFactory`. WebGPU is
  the default on Chrome/Edge desktop; WebGL2 must render identically, only cheaper.
- **`DefaultRenderingPipeline`** on the main camera: FXAA (not MSAA — voxel edges want crispness),
  sharpen 0.15, bloom with threshold 0.85 for crystals/lava/EMP only, plus image processing for
  exposure/contrast. Disable DOF and chromatic aberration: they read as "cinematic web demo".
- **`SSAO2RenderingPipeline`** for dungeons and the hub. Voxel dioramas live and die by contact
  shadows in crevices. Radius ≈ 1.2 voxels, strength ≤ 0.8, **off on mobile**.
- **`CascadedShadowGenerator`** for arenas and the hub (2 cascades desktop, 1 mobile, 2048/1024).
  A single `ShadowGenerator` is fine for one dungeon room. Always set `autoCalcShadowZBounds` and a
  `shadowFrustumSize` tight around the play space.
- **`GlowLayer`** on a fixed 512² texture, driven by emissive only, intensity modulated by time of
  day. Never use glow to fake lighting.
- **`HighlightLayer`** for hover/selection and the current objective. No custom outline shaders.
- **Materials by job:**
  - voxel terrain/props → `StandardMaterial` + vertex colours + baked face shading (cheapest,
    crispest, validated in this repo);
  - metal/crystal/water → `PBRMaterial` with a small generated IBL (never a stock HDRI — it would
    break the palette);
  - sky, portals, dissolve-on-death → **`NodeMaterial`** (one graph each, authored in the Node
    Material Editor, committed as JSON);
  - inventory previews → `PBRMaterial` with an orthographic camera and a fixed studio light, so item
    thumbnails match the world.
- **Particles:** `GPUParticleSystem` for debris, dust, sparks and rain (thousands in one draw call);
  pooled `ParticleSystem` only for UI-space confetti. Every particle is a **cube**.
- **Decals** (`Mesh.createDecal`) only for scorch marks on flat stone faces, max 64 live.
- **Sky:** one inverted box with a `NodeMaterial` doing a 4-stop palette gradient + dithered stars +
  a square sun. No HDR skybox, no lens flare, no god rays.
- **Screenshot** via `CreateScreenshotUsingRenderTarget` for share cards and the "poster" feature.
- **Inspector** (`scene.debugLayer`) behind `?debug=1`, dynamically imported so it never ships in the
  default bundle path.

### 6.2 Voxel architecture

- **Chunks of 16×16×16.** Each chunk stores a palette-index `Uint8Array` plus an integrity
  `Uint8Array`; a per-biome palette LUT turns indices into colours, so a whole room is a few KB.
- **Greedy meshing** per face direction, keyed by `(material, shade, AO)` so flat walls collapse into
  a handful of quads. Rebuild only chunks whose data changed, **max 2 per frame**, each under 1.5 ms.
  (This repo's face-culled mesher is the reference for correct winding and colour handling.)
- **`thinInstances`** for anything repeated hundreds of times: crystals, lamps, bolts, debris,
  brackets, coins. One source mesh, per-instance matrices, zero extra draw calls.
- **Vertex colours for everything static.** Bake top/side/bottom shading and depth darkening once.
- **Damage map** lives outside the mesh: `Map<voxelKey, integrity>` plus a per-chunk dirty flag.
  Repair bots read the damage map; the mesher only reads the current voxel array.
- **Structural anchoring:** a flood fill from `unbreakable` anchors decides which voxels are
  attached. Run it per destroyed chunk, not per voxel.
- **LOD:** beyond 40 voxels render 2×2×2 merged voxels; beyond 90, swap to a baked impostor quad for
  rooms that are not playable yet.
- **Streaming:** rooms are chunk groups. Enter a painting → stream the next room's chunks behind the
  canvas ripple. Never block a frame on a load.

### 6.3 Physics and destruction

- **Havok V2** (`@babylonjs/havok`) as the only physics engine. No Ammo, no Cannon.
- Player is a **capsule character controller**: step height 0.6 voxels, slope limit 50°, tuned so
  1-voxel steps feel like stairs, not ledges.
- Dismembered parts become constrained rigid bodies (max 8 per character), despawned after 6 s.
- Destroyed voxels spawn **debris rigid bodies capped at 120**, all sharing one thin-instance mesh;
  beyond the cap the oldest debris is recycled.
- Explosions apply radial impulses to debris, characters and **repair bots** — a repaired wall must
  be knockable again.
- Physics runs on a **fixed 60 Hz step**, decoupled from render. Never scale physics by frame delta.
- All gameplay triggers (crate open, zone hold, checkpoints) are server-authoritative volumes.

### 6.4 Characters and animation

- Player and clones are **voxel part rigs** on a 6-bone skeleton (root, chest, head, two arms, legs)
  with hard-cut keyframes, played as `AnimationGroup`s at 8–12 fps with interpolation disabled so
  limbs snap like pixels.
- Crossfades are 90 ms and stepped. No easing curves.
- **Hit windows come from animation events**, never timers — the animation is the truth.
- Weapons attach to a socket transform on the hand bone; swapping gear swaps only the voxel mesh.
- One shared animation library for all clones; loadouts change props, not clips.

### 6.5 Audio

- `Sound`/`SoundTrack` with **music, SFX and UI buses**; music ducks 6 dB under voice, 3 dB in menus.
- Positional audio for combat, **non-spatial for music and UI** (chip music should not pan around
  your head).
- Material-aware impact library: one sound per (material × weapon class), 3 variations each, never
  the same file twice in a row.
- Every destruction event has a matching **registration** (the reverse sound) for repair — it is the
  audio signature of the whole game.

### 6.6 Performance budgets (hard numbers)

| Budget | Desktop | Mobile |
| --- | --- | --- |
| Frame | 16.6 ms | 33.3 ms (30 fps floor) |
| Render | ≤ 8 ms | ≤ 14 ms |
| Physics | ≤ 3 ms | ≤ 5 ms |
| Scripts | ≤ 3 ms | ≤ 6 ms |
| Draw calls | ≤ 120 | ≤ 70 |
| Triangles | ≤ 500k | ≤ 150k |
| Chunk rebuilds / frame | ≤ 2 | ≤ 1 |
| Live GPU particles | ≤ 1500 | ≤ 400 |
| Shadow maps | 2 × 2048 CSM | 1 × 1024 |
| SSAO | on | **off** |
| Hardware scaling | 1 (2 in pixel mode) | 2 |
| Texture memory | ≤ 96 MB | ≤ 48 MB |
| First playable | ≤ 3 s @ 10 Mbps | ≤ 5 s |
| Initial JS | ≤ 1.5 MB gzip | same |

If a feature breaks a budget, the feature loses, not the budget. Log violations in CI.

### 6.7 Asset pipeline

- **2D:** Aseprite for sprites, exported as packed atlas + JSON. Integer scale only, 1 px padding,
  nearest-neighbour filter, `Texture.NEAREST_SAMPLINGMODE` explicitly.
- **3D:** MagicaVoxel for props, exported to `.vox` → `.glb` with the palette intact. Every prop is a
  grid-aligned mesh; anything that ends up in a chunked room is baked into voxel data instead of
  being a separate mesh.
- **Fonts:** a bitmap pixel font rendered as a sprite atlas (`BitmapFont`-style), not a webfont.
  Body 1×, headings 2× or 3×, never fractional sizes. Numbers tabular.
- **Audio:** 22050 Hz mono 16-bit for SFX (85 % smaller, indistinguishable), 44.1 kHz stereo for
  music. OGG primary, M4A fallback.
- **Loading:** preload only the hub. Every mode is a dynamic import + asset manifest, loaded behind
  the painting ripple. No spinner, ever.
- **Folder law:** `assets/2d/{ui,sprites,portraits}`, `assets/3d/{props,voxel,rigs}`,
  `assets/audio/{music,sfx,ui}`, `assets/data/{content,quiz}`. Nothing loose at the root.

### 6.8 Multiplayer and authority

- **Server-authoritative for everything that matters:** movement reconciliation, voxel damage,
  cooldowns, crate opens, rebirths, currency.
- **Transport:** WebSocket (Colyseus rooms) at a 30 Hz tick, client rendered at 60+ with prediction
  for the local player only. Remote players interpolate 100 ms behind.
- **Rooms per mode:** `hub`, `obby:{id}`, `dungeon:{id}`, `tycoon:{userId}`, `danger:{zoneId}`.
  A Danger Zone room is a *different room type* — PvP damage is impossible outside it by
  construction, not by a flag check somewhere in a hit function.
- **Anti-cheat:** the server validates reach, cooldowns, line of sight and ownership of every piece
  of gear used. Clients never send "I dealt 40 damage"; they send "I swung at entity E with gear G
  at tick T". Rate-limit everything per second, not per frame.
- **Idempotency:** crate opens, purchases and rebirths carry a client-generated `intentId`; the
  server deduplicates so a reconnect cannot double-claim.
- **Persistence:** Postgres for progression, Redis for sessions/queues. Every currency mutation
  writes an audit row (`reason`, `delta`, `balanceBefore`, `balanceAfter`).

### 6.9 React + Babylon integration

- **One `Engine` per page, created inside a `useEffect`, canvas created imperatively** and removed in
  cleanup. React 19 StrictMode double-mounts effects; a second engine on a reused canvas can lose the
  WebGL context.
- **The scene never re-renders React.** Scene → HUD updates go through a throttled stats callback
  (10 Hz max). HUD → scene goes through a small imperative API on a ref (`setTool`, `setBrush`,
  `snapshot`, …).
- **State:** Zustand (or signals) for HUD/inventory, no context re-render storms. Never put the scene
  object in React state.
- **Code splitting:** `import('./scenes/DungeonScene')` per mode. The hub is the only eager scene.
- **Error boundary** that renders a pixel-art "ENGINE FAILED" plate with the actual error text — no
  blank canvases, no silent failures.
- **CSS:** `touch-action: none` and `overscroll-behavior: none` on the canvas, `image-rendering:
  pixelated` always, and **no side borders anywhere** (§1.3).

---

## 7. UI / UX specification (pixel HUD, zero web-app chrome)

### 7.1 Screen layout

- **Full-bleed canvas, four anchored corners, no side borders, no centred column.**
  - top-left: Spire Rank chip, health pips, ability cooldowns (square pips that drain).
  - top-right: packages counter (animated box icon), current rebirth, world tag.
  - bottom-left: gear wheel (4 slots: combat gear, combat ability, movement gear, movement ability).
  - bottom-right: contextual prompts ("HOLD E — open crate"), quiz hint slot.
  - bottom-centre: thin pixel strip for objectives only, never a second navbar.
- Every panel is a **pixel frame**: 2 px `void` outline, 2 px bevel (light top, dark bottom), 0 radius,
  4 px offset shadow. Backgrounds are flat `stone-1` with a 2 px scanline dither.
- Nothing floats. Panels are bolted to the edges; the world shows through the gaps.

### 7.2 Component inventory (build once, use everywhere)

| Component | Rules |
| --- | --- |
| `PixelFrame` | 2 px outline + 2 px bevel + 4 px offset shadow. No radius. |
| `PixelButton` | 2 px frame, 3 px bottom shadow; hover raises 1 px, press sinks 3 px. No fades. |
| `PixelPlate` | inset panel for numbers, always tabular monospace. |
| `PipBar` | 4–8 discrete pips, never a continuous bar (health, cooldowns, progress). |
| `Slot` | 48×48 grid cell, 2 px frame, drag & drop, right-click inspect. |
| `Tooltip` | snaps open in 1 step, closes instantly, max 3 lines, never covers the cursor. |
| `KeyCap` | 2 px frame, 1 px inner highlight, shows the bound key and updates on remap. |
| `Toast` | pixel plate that stamps in bottom-left, above the gear wheel — never top-right. |
| `Curtain` | 4-step full-screen wipe for transitions, palette-shifted per mode. |

### 7.3 Menus and pages on the site

- Marketing/tools pages obey the same law: **full-bleed sections, horizontal seams, pixel frames, no
  rounded cards, no glass, no gradient hero.** A "hero" is a big pixel-art scene with the title plate
  bolted to the top-left.
- The `#tools` page shows equipment as an **inventory grid** of pixel slots, not a pricing table.
  Hover = inspect tooltip; click = a pixel *drawer* slides in (not a modal).
- Pricing / credits / legal: plain full-bleed pixel text with horizontal rules only.
- No rounded cookie banner; a pixel plate at the bottom edge.

### 7.4 Input and accessibility

- **Keyboard + mouse, gamepad and touch at parity.** Remap everything, store bindings locally, show
  the current binding on every prompt (`KeyCap`).
- **Touch:** left thumb = pixel d-pad, right side = 4 action plates, camera dragged anywhere else. No
  joystick that re-centres under the finger.
- **Colour-blind:** three palettes (deuteranopia, protanopia, tritanopia) that remap `mint`/`lime`/
  `blood` to new hues *and* add 2 px hazard stripes, so hue is never the only channel.
- **Photosensitivity:** stepped flashes capped at 3 Hz, plus an option to disable full-screen flashes
  entirely (rebirth becomes a palette swap).
- **Reduced motion:** disables screenshake, camera dolly and the painting ripple.
- **Subtitles** for every line, with speaker name and a pixel speaker icon.
- **Text scale:** 1×, 2×, 3× only. Integer scaling; never reflow into a column.
- **Focus:** 2 px `mint` outline always visible for keyboard users; never `outline: none` without a
  replacement.

### 7.5 Onboarding

- No modal tutorial, no coach marks, no arrow overlays. The hub teaches **diegetically**: a dummy
  clone to hit, a signpost to the first painting, a lever that explains the tycoon by moving.
- The first loop must be completable in **under 15 minutes** with no reading beyond one-line signs.

---

## 8. Content schemas (TypeScript, authoritative)

```ts
export type GearSlot = 'combat' | 'movement'

export interface Gear {
  id: string
  name: string
  slot: GearSlot
  /** Obbies give combat gear; tycoons forge movement gear. Nothing else grants gear. */
  source: { kind: 'obby'; obbyId: string } | { kind: 'tycoon'; recipeId: string }
  /** Every piece must add a verb, never only a stat. */
  verb: string
  counterplay: string
  /** Five XP-bought modifiers, ranks 1..5. */
  ranks: [string, string, string, string, string]
  voxelModel: string
}

export interface Ability {
  id: string
  name: string
  slot: GearSlot
  cooldownMs: number
  cost: { stamina?: number; packages?: number }
  unlockRebirth: number
  animation: string
  telegraphFx: string
}

export interface RebirthTier {
  level: number
  name: string
  obbyId: string
  obbyPricePackages: number
  dungeonId: string
  combatGearId: string
  combatAbilityId: string
  movementGearRecipeId: string
  movementAbilityId: string
  tycoonPartId: string
}

export interface ObbyDoc {
  id: string
  name: string
  painting: { sprite: string; state: 'locked' | 'open' | 'cleared' }
  theme: string
  checkpoints: { id: string; xp: number }[]
  quizGates: { id: string; questionTag: string; difficulty: 1 | 2 | 3 }[]
  gearPickup: { gearId: string; hidden: boolean; requiresMovementGear?: string }
  /** Hand-authored in the level editor. Generated layouts are rejected by CI. */
  layout: string
}

export interface DungeonRoom {
  id: string
  kind: 'entry' | 'fight' | 'puzzle' | 'crate'
  voxelSource: string
  anchors: string[] // unbreakable structure voxels
  menderCores: { x: number; y: number; z: number; bots: number }[]
  spawns: { archetype: string; count: number; trigger: 'enter' | 'wave2' | 'crate' }[]
  modifiersAllowed?: string[]
}

export interface CrateTable {
  dungeonId: string
  packages: [min: number, max: number]
  /** Repeats inside 30 minutes lose 25% each, floored at 25%. */
  repeatDecay: number
  firstOpenRebirth?: number
}
```

- Content lives in `assets/data/content/*.json` and is validated against these types at build time
  (`zod`, or `satisfies` plus `tsc`). Malformed content fails CI — it never ships.
- Quiz content lives in `assets/data/quiz/*.json` as
  `{ id, tag, difficulty, question, answers[4], correct, explanation }`. Obby gates reference a
  *tag*, so questions can be rotated without touching level data.

---

## 9. Production plan

### 9.1 The vertical slice (build this before anything else)

One obby, one dungeon, one tycoon part, one painting set, one rebirth — playable end to end in
10 minutes, with the pixel HUD, the destructible room with two mender cores, and the crate opening.
If the slice is not fun with placeholder art, no amount of content will save the game.

### 9.2 Milestones

| # | Milestone | Definition |
| --- | --- | --- |
| M0 | Engine shell | WebGPU+WebGL2 boot, pixel HUD frame set, input remap, error boundary |
| M1 | Voxel core | chunked storage, greedy mesher, baked shading, chunk rebuild budget |
| M2 | Movement | capsule controller, obby traversal, checkpoints, respawn, camera |
| M3 | Slice loop | painting → obby → gear pickup → dungeon → crate → rebirth → tycoon part |
| M4 | Destruction | damage map, anchoring, debris, repair bots, mender cores |
| M5 | Combat | 6 archetypes, dismemberment, 3 gear + 2 abilities, hit-stop, telegraphs |
| M6 | Meta | full six-loop ladder, economy tuning, quest board, Field Notes |
| M7 | Danger Zone | dedicated room type, opt-in flagging, anti-grief, ranked rewards |
| M8 | Polish | audio pass, colour-blind palettes, perf pass, telemetry, share cards |

### 9.3 Definition of done (per feature)

- Plays with keyboard + mouse, gamepad and touch.
- Holds 60 fps desktop / 30 fps mobile inside the budget table (§6.6).
- Has an audio tell, a visual telegraph and a **counterplay** (for anything that can hurt the player).
- Passes the **art review**: no radius, no glass, no soft shadows, no side borders, on-palette only.
- Survives a 10-minute playtest by someone who has never seen it, without verbal instructions.
- Is instrumented (frame time + usage) and documented in the content schema.

### 9.4 Playtest metrics that decide tuning

- Time-to-first-rebirth (target 12–18 min), time per loop (20–35 min), deaths per room (2–5).
- Mode split per session (target: no mode above 55 % of playtime) — if one dominates, §2.5 is broken.
- Crate-to-next-obby conversion; quiz accuracy per gate; gear usage spread (no gear above 45 %).
- Rage quits per room; if a room has more than 15 %, it is badly authored, not too hard.

---

## 10. Guardrails for the AI builder

### 10.1 Never

- Generate obby layouts, dungeon layouts or quiz questions procedurally at runtime.
- Add a second currency, a premium shop, a battle pass, or a "skip timer".
- Add PvP outside a Danger Zone.
- Add a UI card with a radius, a blur, a soft shadow or a side border.
- Ship a spinner, a skeleton screen or a modal over a blurred backdrop.
- Interrupt dungeon combat with a quiz.
- Add a feature that only makes the game prettier but costs frame budget with no gameplay purpose.
- Use emoji, icon fonts or stock UI kits.
- Add "power" to the tycoon. It produces packages and traversal gear only.
- Silently swallow an error (no empty catch). Everything reports to telemetry or an error plate.

### 10.2 Always

- Design the **counterplay** for anything dangerous before implementing it.
- Add the **audio tell** and the **visual telegraph** in the same commit as the attack.
- Keep the four unlocks per loop identical: 1 combat gear, 1 combat ability, 1 movement gear,
  1 movement ability.
- Measure frame time before and after every rendering change.
- Write the content schema entry before the content.
- Prefer a hard-edged, 2 px-aligned, hand-made asset over a generated one.

### 10.3 Review checklist (paste into every PR)

```
[ ] No side borders / no page columns / full-bleed layout
[ ] Zero border-radius, zero backdrop-filter, only hard offset shadows
[ ] On-palette only, integer-scaled pixel assets, no antialiased sprites
[ ] Pixels are cubes in 3D and sprites in 2D — no smooth meshes, no blur
[ ] Every reward traces to the loop: obby→XP+combat gear, dungeon→packages+rebirth,
    tycoon→movement gear, danger zone→rank only
[ ] No mode can be farmed alone (§2.4) and anti-grind rules still hold (§2.5)
[ ] PvP damage impossible outside Danger Zone rooms (room type, not a flag)
[ ] Destruction + repair are server-authoritative and deterministic
[ ] Audio tell + visual telegraph + counterplay exist
[ ] Budgets: 60/30 fps, draw calls, chunk rebuilds, particles (§6.6)
[ ] Keyboard, gamepad, touch, remap, colour-blind, reduced motion
[ ] Content validated against the schema in CI
```

---

## Appendix A — banned vocabulary (site copy)

seamless · effortless · elevate your · unleash · supercharge · game-changing · next-gen ·
revolutionary · cutting-edge · AI-powered · powered by AI · unlock your potential · take it to the
next level · curated experience · best-in-class · solutions · ecosystem · journey (as marketing) ·
immersive (unless describing VR) · robust · leverage · synergy · holistic · frictionless · delight ·
magical · simply · just (as filler) · "the future of X"

Write like a 1994 instruction manual: short, concrete, a little proud.
*"Six paintings. Six vaults. One spire that fights back."*

## Appendix B — glossary

| Term | Meaning |
| --- | --- |
| **Spire** | the hub tower; also the player's rank |
| **Painting** | a portal; every obby and dungeon is one |
| **Loop** | one pass of obby → dungeon → rebirth → tycoon |
| **Rebirth** | permanent meta-unlock after the first crate of a dungeon; never a wipe |
| **Package (₱)** | the only currency; from dungeon crates |
| **Combat XP** | from obbies and quizzes; only buys gear ranks |
| **Traversal gear** | movement gear forged at the tycoon |
| **Combat gear** | the weapon found on an obby |
| **Mender core** | the node that powers repair bots; destroying it stalls repairs |
| **Danger Zone** | the only place PvP is possible; opt-in, flagged |
| **Crate** | dungeon reward chest; the first open triggers a rebirth |

---

## Appendix C — condensed prompt (paste this into your builder)

> Build **Quiz the Spire**: a browser game that is **pixel art in 2D and voxel art in 3D**, using
> React + TypeScript + Babylon.js (WebGPU with a WebGL2 fallback). **No design-system chrome**:
> full-bleed layout, **no side borders anywhere**, `border-radius: 0`, no glassmorphism, no blur, no
> soft shadows — only 2 px hard frames, hard offset shadows, stepped animation, a fixed 32–48 colour
> pixel palette, integer-scaled sprites, cube particles.
>
> The loop is exact: jump into a **hand-painted obby** (never procedural) that pays **combat XP** and
> contains the loop's **combat gear**; carry that gear into the **dungeon** (clone-robot combat,
> dismemberment, **destructible voxels**, **repair bots** with destroyable mender cores); clear it to
> open a **crate** that pays **packages** and, on first clear, a **rebirth** that unlocks the next
> dungeon painting plus two abilities; then build the **tycoon** part that forges the next
> **movement gear** and buy the next obby painting. Six loops, each granting exactly one combat gear,
> one combat ability, one movement gear and one movement ability. **Packages only come from dungeons;
> combat XP only from obbies and quizzes.** That is what keeps all three modes mandatory and stops
> anyone farming one of them. **PvP exists only in opt-in Danger Zone arenas** — a separate room type,
> so damage is impossible everywhere else.
>
> Squeeze Babylon.js: WebGPU first, `DefaultRenderingPipeline` (FXAA, selective bloom, grading),
> SSAO2, `CascadedShadowGenerator`, `GlowLayer`, `HighlightLayer`, `NodeMaterial` sky and portals,
> PBR for metal and crystal, `StandardMaterial` + vertex colours for voxel terrain,
> `GPUParticleSystem` for debris, Havok V2 with a capsule character controller, `thinInstances` for
> repeats, 16³ chunks with greedy meshing and dirty-chunk rebuilds, server-authoritative damage and
> currency, 30 Hz netcode with client prediction, bitmap pixel font, no spinners. Budgets: 60 fps
> desktop / 30 fps mobile, ≤ 120 draw calls, ≤ 2 chunk rebuilds per frame, initial JS ≤ 1.5 MB gzip.
>
> Never add: a second currency, a premium shop, procedural obbies, quizzes inside combat, PvP outside
> Danger Zones, rounded cards, blurred backdrops, gradient heroes, emoji icons, or AI-sounding copy.











