# AI Sprite + Asset Workflow for RealityRPG

> Goal: make the RPG feel **custom to the uploaded video**, while keeping asset generation cheap, deterministic, and easy to hand to Phaser.

This document extends `VIDEO_RPG_PIPELINE.md` and `STACK_RECOMMENDATION.md`. It is a planning/spec sheet only — no runtime project code.

---

## Core Principle

Do **not** generate arbitrary one-off sprites with no connection to the video.

Instead:

1. Gemini Vision analyzes the uploaded video/keyframes.
2. It extracts **real scene objects**: mug, laptop, backpack, plant, couch, hallway light, door, etc.
3. The pipeline converts those real objects into RPG roles:
   - object → enemy
   - object → item
   - object → NPC
   - object → boss
   - object → portal
   - object → map theme
4. Image generation creates sprite sheets from those object-derived descriptions.
5. Phaser receives deterministic metadata: exact rows, columns, frame size, animation names, and level/entity references.

The magic demo claim becomes:

> “The enemies, items, map theme, and boss are all generated from objects actually seen in your video.”

---

## Recommended Minimal Asset Set

For a 5-hour hackathon, use **3 generated image sheets** plus deterministic local slicing.

### 1. Hero Sheet

One image call.

- Layout: `4x4`
- Cell size after processing: `96x96` or `64x64`
- Rows:
  - Row 0: walk down
  - Row 1: walk left
  - Row 2: walk right
  - Row 3: walk up
- Columns:
  - frame 0
  - frame 1
  - frame 2
  - frame 3

Use this for the player only.

### 2. Enemy / Mob Sheet

One image call.

- Layout: `4x4`
- Each row = one enemy derived from a detected video object.
- Each row has a 4-frame idle/attack loop.
- This is the best cost-saving trick.

Example:

```text
Row 0: coffee mug slime — 4-frame bubbling lunge animation
Row 1: cable serpent — 4-frame electric wiggle attack
Row 2: backpack goblin — 4-frame bite/lunge attack
Row 3: desk lamp sentinel — 4-frame beam-cast animation
```

Mobs do **not** need 4-direction walking for the demo. A single animated loop is enough if they patrol, chase, or bump-attack in Phaser.

### 3. Item / Prop / VFX Sheet

One image call.

- Layout: `4x4`
- Each cell = one static asset or simple effect.
- Derived from objects in the video/keyframes.

Example:

```text
Cell 0: laptop portal
Cell 1: notebook quest item
Cell 2: coin pickup made from desk screws
Cell 3: health potion themed after water bottle
Cell 4: glowing key from door handle
Cell 5: blue spark projectile from monitor light
...
```

---

## Why Not One Giant Everything Sheet?

You *can* pack more, but it gets less reliable.

Good packing:

- one sheet for hero movement
- one sheet for enemies
- one sheet for items/VFX

Risky packing:

- hero + enemies + maps + items all in one image

The more unrelated concepts in one prompt, the more likely the model will:

- blend identities between rows
- ignore rows
- change scale per cell
- add labels/text
- make inconsistent backgrounds
- put multiple sprites in one cell

So the safe hackathon rule is:

> Pack related things together. Keep every sheet `4x4`. Never ask for more than 16 cells at once.

---

## Model Choice

Both **GPT Image 2** and **Nano Banana** should work.

### GPT Image 2

Best for:

- text → sprite sheet
- clean stylized RPG characters from scratch
- enemy/item sheets from structured prompts

Use when the input is mostly a prompt or object list.

### Nano Banana / Gemini Image

Best for:

- reference image → sprite sheet
- preserving identity from a frame crop or uploaded character image
- edits/regeneration of a specific object-derived enemy

Use when you want the mob/item to visibly resemble something from the actual video.

### Practical routing

```text
Hero from text prompt                    → GPT Image 2
Hero from uploaded selfie/reference      → Nano Banana
Enemy sheet from detected objects        → GPT Image 2 or Nano Banana
Enemy from cropped video object          → Nano Banana preferred
Item/prop sheet from object list         → GPT Image 2
Fix/regenerate one failed row/frame      → Nano Banana preferred
```

---

## Video-Matching Asset Pipeline

### Stage A — Select Distinct Keyframes

Already covered in `VIDEO_RPG_PIPELINE.md`:

- extract candidate frames from video
- Gemini Vision picks 3 distinct scenes:
  - entrance
  - dungeon
  - boss

### Stage B — Extract Object Candidates

For each selected keyframe, Gemini Vision should return object candidates with enough data to drive assets.

```json
{
  "level_id": "level_2_dungeon",
  "frame_id": "frame_004",
  "scene_summary": "A cluttered desk with laptop, mug, tangled cables, notebook, lamp, and backpack.",
  "visual_theme": {
    "palette": "cool blue monitor glow with warm desk lamp highlights",
    "mood": "tech dungeon",
    "materials": ["plastic", "metal", "paper", "ceramic", "cable rubber"]
  },
  "objects": [
    {
      "object_id": "obj_mug_01",
      "name": "coffee mug",
      "bbox_norm": [0.08, 0.38, 0.24, 0.58],
      "visual_description": "white ceramic coffee mug with dark handle, sitting near the left edge of the desk",
      "rpg_role": "enemy",
      "rpg_interpretation": "a bubbling ceramic slime that spits hot coffee"
    },
    {
      "object_id": "obj_cables_01",
      "name": "tangled cables",
      "bbox_norm": [0.35, 0.60, 0.70, 0.82],
      "visual_description": "black tangled cables stretched across the lower desk",
      "rpg_role": "enemy",
      "rpg_interpretation": "an electric cable serpent"
    },
    {
      "object_id": "obj_notebook_01",
      "name": "notebook",
      "bbox_norm": [0.62, 0.62, 0.91, 0.88],
      "visual_description": "open notebook with pale pages and dark cover",
      "rpg_role": "quest_item",
      "rpg_interpretation": "ancient quest ledger"
    }
  ]
}
```

### Stage C — Choose Asset Budget

Do not generate every object. Pick a small, visually distinctive subset.

Recommended per 3-level campaign:

- `1` hero sheet
- `4` mob rows total in the main 4x4 enemy sheet
  - recommended: `3` regular enemies + `1` boss row
  - if you want 4 regular enemies **and** a boss, generate a separate boss sheet; do not squeeze 5 rows into a 4x4 sheet
- `8–16` item/prop/VFX cells

Selection priority:

1. visually distinctive objects
2. objects with clear silhouettes
3. objects that appear in important/boss frames
4. objects whose RPG transformation is obvious
5. avoid tiny, blurry, partially occluded objects

### Stage D — Create Asset Manifest Before Image Generation

The manifest is the source of truth. Phaser and the slicer should trust this, not the pixels.

```json
{
  "asset_manifest_version": 1,
  "source_video_id": "upload_001",
  "sheets": [
    {
      "sheet_id": "hero_walk",
      "type": "character_walk_4dir",
      "path": "assets/generated/sprites/hero_walk.png",
      "rows": 4,
      "cols": 4,
      "frame_width": 96,
      "frame_height": 96,
      "background_key": "#FF00FF",
      "animations": {
        "walk_down": { "row": 0, "frames": [0, 1, 2, 3], "fps": 8, "repeat": -1 },
        "walk_left": { "row": 1, "frames": [0, 1, 2, 3], "fps": 8, "repeat": -1 },
        "walk_right": { "row": 2, "frames": [0, 1, 2, 3], "fps": 8, "repeat": -1 },
        "walk_up": { "row": 3, "frames": [0, 1, 2, 3], "fps": 8, "repeat": -1 }
      }
    },
    {
      "sheet_id": "mobs_level_objects",
      "type": "mob_rows",
      "path": "assets/generated/sprites/mobs_level_objects.png",
      "rows": 4,
      "cols": 4,
      "frame_width": 96,
      "frame_height": 96,
      "background_key": "#FF00FF",
      "rows_semantics": [
        {
          "row": 0,
          "generated_asset_ref": "mob_mug_slime",
          "source_object_id": "obj_mug_01",
          "source_level_id": "level_2_dungeon",
          "display_name": "Mug Slime",
          "animation_key": "mob_mug_slime_attack",
          "frames": [0, 1, 2, 3],
          "fps": 6,
          "repeat": -1
        },
        {
          "row": 1,
          "generated_asset_ref": "mob_cable_serpent",
          "source_object_id": "obj_cables_01",
          "source_level_id": "level_2_dungeon",
          "display_name": "Cable Serpent",
          "animation_key": "mob_cable_serpent_zap",
          "frames": [0, 1, 2, 3],
          "fps": 8,
          "repeat": -1
        }
      ]
    },
    {
      "sheet_id": "items_props_fx",
      "type": "static_grid",
      "path": "assets/generated/sprites/items_props_fx.png",
      "rows": 4,
      "cols": 4,
      "frame_width": 64,
      "frame_height": 64,
      "cells": [
        {
          "frame": 0,
          "generated_asset_ref": "item_quest_ledger",
          "source_object_id": "obj_notebook_01",
          "source_level_id": "level_2_dungeon",
          "display_name": "Quest Ledger"
        },
        {
          "frame": 1,
          "generated_asset_ref": "portal_laptop_gate",
          "source_object_id": "obj_laptop_01",
          "source_level_id": "level_2_dungeon",
          "display_name": "Laptop Gate"
        }
      ]
    }
  ]
}
```

---

## Enemy Sheet Prompt Template

Use this when generating several video-derived mobs in one sheet.

```text
Create a 4x4 pixel art sprite sheet for a top-down 16-bit RPG.

STRICT LAYOUT:
- Exactly 4 rows and 4 columns.
- Each cell is the same size.
- Solid flat magenta #FF00FF background in every cell.
- No borders, no grid lines, no labels, no text, no UI.
- One centered sprite per cell.
- Same pixel-art style, same scale, same lighting across all cells.
- Crisp dark outlines, readable silhouettes, limited palette.

SOURCE VIDEO CONTEXT:
The uploaded video/keyframe shows: {scene_summary}
Overall level mood: {mood}
Palette/materials to echo: {palette_and_materials}

ROWS:
Row 0: {mob_0_name}. Based on the real object: {mob_0_source_object}. Visual details to preserve: {mob_0_visual_description}. RPG transformation: {mob_0_rpg_interpretation}. Four-frame attack/idle animation.
Row 1: {mob_1_name}. Based on the real object: {mob_1_source_object}. Visual details to preserve: {mob_1_visual_description}. RPG transformation: {mob_1_rpg_interpretation}. Four-frame attack/idle animation.
Row 2: {mob_2_name}. Based on the real object: {mob_2_source_object}. Visual details to preserve: {mob_2_visual_description}. RPG transformation: {mob_2_rpg_interpretation}. Four-frame attack/idle animation.
Row 3: {mob_3_name}. Based on the real object: {mob_3_source_object}. Visual details to preserve: {mob_3_visual_description}. RPG transformation: {mob_3_rpg_interpretation}. Four-frame attack/idle animation.

COLUMNS:
Column 0: idle/anticipation pose.
Column 1: wind-up pose.
Column 2: attack/peak pose.
Column 3: return/idle pose.
```

If using Nano Banana with image references, include cropped object references where possible and explicitly say:

```text
Use the provided object crops as visual inspiration only. Transform them into readable RPG enemies while preserving their color/material identity.
```

---

## Item / Prop / VFX Sheet Prompt Template

```text
Create a 4x4 pixel art asset sheet for a top-down 16-bit RPG.

STRICT LAYOUT:
- Exactly 4 rows and 4 columns.
- Each cell is the same size.
- Solid flat magenta #FF00FF background.
- No borders, no grid lines, no labels, no text.
- One centered object per cell.
- Same pixel-art style, same scale, same lighting.

SOURCE VIDEO CONTEXT:
The uploaded video/keyframes show: {campaign_scene_summary}
Use objects from the video as inspiration so every asset feels unique to this place.

CELLS:
0: {asset_0_name}, based on {source_object_0}, visual details: {visual_description_0}
1: {asset_1_name}, based on {source_object_1}, visual details: {visual_description_1}
2: {asset_2_name}, based on {source_object_2}, visual details: {visual_description_2}
...
15: {asset_15_name}, based on {source_object_15}, visual details: {visual_description_15}
```

---

## Deterministic Local Processing

After image generation, use a deterministic processor.

Input:

```text
raw generated PNG with #FF00FF background
```

Output:

```text
transparent sheet PNG
individual frame PNGs
direction/enemy GIF previews
metadata JSON
validation report
```

Minimum processing steps:

1. Verify image exists and is readable.
2. Resize/crop to square if needed.
3. Divide into exact `rows x cols` cells.
4. Chroma-key magenta to alpha with tolerance, not exact hex matching. Treat pixels within about RGB Euclidean distance <= 15 of `#FF00FF` as background to handle image-model artifacts.
5. For each cell:
   - find non-transparent bounding box
   - center sprite in a fixed cell size
   - optionally feet-align characters/enemies
   - save individual frame
6. Recompose a clean transparent sheet.
7. Write `asset_manifest.generated.json` with real output paths and validation flags.
8. If validation fails, retry once or use fallback assets.

Validation checks:

```json
{
  "sheet_is_square": true,
  "divisible_by_rows_cols": true,
  "magenta_background_ratio_ok": true,
  "all_cells_non_empty": true,
  "bbox_size_variance_ok": true,
  "no_cell_touches_edge": true,
  "output_sheet_written": true
}
```

Recommended failure policy:

- Hero sheet fails → retry once, then fallback hero.
- Enemy sheet has 1 bad row → replace that row's mob with fallback Kenney/LPC enemy or use a static generated frame.
- Item sheet has bad cells → fall back to each entity's Kenney/public `sprite_id`. Never drop entities after validation.
- Never block the whole game if one asset fails.

---

## Deterministic Handoff to Phaser

Phaser should not infer anything from image content. It should receive:

1. `campaign.json`
2. `level_*.json`
3. `asset_manifest.generated.json`
4. cleaned sprite sheets with known cell sizes

### Phaser Loading Contract

Every generated sheet should have:

```json
{
  "sheet_id": "mobs_level_objects",
  "path": "assets/generated/sprites/mobs_level_objects.png",
  "frame_width": 96,
  "frame_height": 96,
  "rows": 4,
  "cols": 4
}
```

Phaser loads it like a normal spritesheet:

```js
this.load.spritesheet('mobs_level_objects', 'assets/generated/sprites/mobs_level_objects.png', {
  frameWidth: sheet.frame_width,
  frameHeight: sheet.frame_height
});
```

Frame index formula:

```text
frameIndex = row * cols + col
```

Examples for a 4x4 enemy sheet:

```text
row 0, col 0 → frame 0
row 0, col 1 → frame 1
row 1, col 0 → frame 4
row 3, col 2 → frame 14
```

### Phaser Animation Contract

The manifest should define animations in exactly the same `rows_semantics` structure used by the generated asset manifest. Do not create a separate flat animation schema. Static item/prop cells use the `cells` array and are parsed by `AssetManifest.ts` as texture frame lookups, not animations. Each static cell uses `frame` as the Phaser frame index.

```json
{
  "sheet_id": "mobs_level_objects",
  "type": "mob_rows",
  "frame_width": 96,
  "frame_height": 96,
  "rows": 4,
  "cols": 4,
  "rows_semantics": [
    {
      "row": 0,
      "generated_asset_ref": "mob_mug_slime",
      "display_name": "Mug Slime",
      "animation_key": "mob_mug_slime_attack",
      "frames": [0, 1, 2, 3],
      "fps": 6,
      "repeat": -1
    }
  ]
}
```

The `frames` array is always **local column indices** within the row, usually `[0, 1, 2, 3]`. The runtime computes absolute frame indexes and scales generated sprites to the runtime grid/tile size. Generated source cells may be 64x64 or 96x96 for image-model quality, but Phaser should render them at the intended gameplay size (usually one `tile_size`, or an explicitly configured display size for bosses).

```text
absoluteFrames = frames.map(localCol => row * cols + localCol)
```

For row 0:

```text
[0, 1, 2, 3]
```

For row 2 with local frames `[0, 1, 2, 3]`, the runtime computes absolute Phaser frames:

```text
[8, 9, 10, 11]
```

Do not store `[8, 9, 10, 11]` in JSON; that would double-offset the frames.

### Level Entity Contract

Generated assets must **extend** the core Level JSON schema from `VIDEO_RPG_PIPELINE.md`; they must not replace it.

Rules:

- Keep `marker`. Phaser spawns entities by scanning the validated ASCII grid for markers.
- Keep `sprite_id`. This is the Kenney/public fallback asset ID and is required even when generated art is enabled.
- Add `generated_asset_ref` only as an optional override. If the generated manifest is disabled, missing, or invalid, runtime ignores it and uses `sprite_id`.
- Do not store generated animation keys directly in Level JSON. Phaser derives animation keys from `asset_manifest.generated.json` using `generated_asset_ref`.
- Do not use `grid_pos` as the source of truth. If bbox-derived placement is used, write the marker into the grid first, then let the validator accept/reject it.

```json
{
  "grid": [
    "################",
    "#..............#",
    "#..1...........#",
    "#..............#",
    "#..P.......E...#",
    "################"
  ],
  "entities": [
    {
      "marker": "1",
      "sprite_id": "slime_green",
      "type": "enemy",
      "name": "Mug Slime",
      "hp": 2,
      "damage": 1,
      "behavior": "patrol_short",
      "source_object_id": "obj_mug_01",
      "source_level_id": "level_2_dungeon",
      "generated_asset_ref": "mob_mug_slime",
      "dialogue": "It burbles with hot coffee rage."
    }
  ]
}
```

At runtime:

```text
entity.generated_asset_ref
→ asset_manifest.rows_semantics[].generated_asset_ref
→ sheet_id + row + frames
→ Phaser animation

visuals.prop_labels[].source_object_id + source_level_id
→ asset_manifest.cells[].source_object_id + source_level_id or generated_asset_ref
→ sheet_id + cell/frame
→ optional static prop overlay + hotspot

If lookup fails:
entity.sprite_id → SPRITE_CATALOG/Kenney fallback
prop label remains text-only/hotspot-only
```

This keeps generated assets swappable without weakening collision validation or the fallback path.

---

## Ensuring Mobs and Maps Match the Video

### Map Matching

The visible map/background should come from the selected keyframe, not from pure hallucination.

Recommended map path:

```text
selected keyframe → deterministic pixelation → background image
```

Then overlay generated sprites/entities on top. The main mob sheet is exactly 4 rows total; use 3 regular mobs plus 1 boss row unless you add a separate boss sheet.

Do not ask the image model to invent the whole map unless you have time for retries. The keyframe-derived pixel background is what makes the demo obviously video-based.

Map metadata should preserve video grounding:

```json
{
  "level_id": "level_2_dungeon",
  "source_frame": "frame_004.jpg",
  "background": "assets/generated/backgrounds/level_2_dungeon.png",
  "scene_summary": "A cluttered desk with a laptop, mug, notebook, cables, and lamp.",
  "theme_tags": ["desk", "technology", "cables", "lamp-glow", "paper"],
  "palette": ["deep monitor blue", "warm lamp amber", "ceramic white", "paper beige"]
}
```

### Mob Matching

Every generated mob should carry provenance:

```json
{
  "generated_asset_ref": "mob_cable_serpent",
  "source_object_id": "obj_cables_01",
  "source_frame": "frame_004.jpg",
  "source_bbox_norm": [0.35, 0.60, 0.70, 0.82],
  "object_name": "tangled cables",
  "rpg_interpretation": "electric cable serpent",
  "sheet_id": "mobs_level_objects",
  "row": 1
}
```

If possible, crop the source object and pass it to Nano Banana as reference. If not, include the exact visual description from Gemini Vision in the prompt.

### Entity Placement Matching

Place video-derived entities near their source object location when possible.

Convert normalized bbox center to grid position:

```text
center_x = (bbox.x1 + bbox.x2) / 2
center_y = (bbox.y1 + bbox.y2) / 2

grid_x = round(center_x * grid_width)
grid_y = round(center_y * grid_height)
```

Then clamp to walkable interior tiles and avoid overlap.

This makes the game feel grounded: the mug-monster appears near where the mug was in the video background. The implementation should still place the entity by writing its `marker` into the validated grid; `grid_x/grid_y` is only an intermediate placement calculation.

### Dialogue Matching

Dialogue should mention object-derived identity.

Bad:

```text
A slime attacks you.
```

Good:

```text
The coffee mug quivers, overflows, and becomes the Mug Slime: “You left me cold for too long!”
```

---

## Recommended Demo-Day Flow

1. Upload video.
2. Extract 5–10 candidate frames.
3. Gemini picks 3 distinct frames.
4. For each selected frame:
   - generate level JSON
   - detect objects and roles
   - pixelate background from actual frame
5. After all 3 Level JSONs validate, build one campaign-wide asset manifest plan from `source_objects` and existing `entities`. Stage 3 should seed stable descriptive `generated_asset_ref` strings for video-derived entities; Stage 4.5 either adopts those strings or leaves them unused if generation is disabled:
   - choose exactly 4 mob rows total across campaign: usually 3 regular mobs + 1 boss
   - preserve each entity's `marker` and fallback `sprite_id`
   - map generated rows with `generated_asset_ref`
   - choose 8–16 item/prop/VFX objects
6. Generate:
   - hero sheet
   - enemy sheet
   - item/VFX sheet
7. Process sheets locally.
8. Validate outputs.
9. Assemble Phaser campaign.
10. If generation is slow/fails:
   - keep video-derived backgrounds and level JSON
   - use fallback sprites
   - still preserve object names/dialogue to sell the video grounding

---

## Example: Desk Video Segment

Detected objects:

```text
laptop, coffee mug, notebook, tangled cables, desk lamp, backpack
```

Generated RPG mapping:

```text
Map: Desk Dungeon, pixelated from actual keyframe
Portal: Laptop Gate
Enemy 1: Mug Slime, based on coffee mug
Enemy 2: Cable Serpent, based on tangled cables
NPC: Lamp Sage, based on desk lamp
Quest item: Ancient Ledger, based on notebook
Boss: Backpack Mimic, based on backpack
```

Enemy sheet:

```text
Row 0: generated_asset_ref mob_mug_slime attack loop
Row 1: generated_asset_ref mob_cable_serpent zap loop
Row 2: generated_asset_ref mob_lamp_wisp cast loop
Row 3: generated_asset_ref mob_backpack_mimic bite loop
```

Phaser gets:

```text
mobs_level_objects.png
frame size: 96x96
mob_mug_slime_attack = row 0 frames [0,1,2,3]
mob_cable_serpent_zap = row 1 local frames [0,1,2,3] → runtime absolute [4,5,6,7]
mob_lamp_wisp_cast = row 2 local frames [0,1,2,3] → runtime absolute [8,9,10,11]
mob_backpack_mimic_bite = row 3 local frames [0,1,2,3] → runtime absolute [12,13,14,15]
```

---

## Final Recommendation

Use this generation budget:

```text
1 image call: hero 4-direction walk sheet
1 image call: 3 video-derived mobs + 1 boss row, one row each
1 image call: 16 video-derived items/props/VFX
```

That is enough custom AI art to look impressive, while staying deterministic enough for Phaser and cheap enough to avoid burning image calls.

Most important rule:

> The background comes from the video frame, and every mob/item/boss references a real detected object from that frame. That is what makes the output feel unique instead of generic AI fantasy art.
