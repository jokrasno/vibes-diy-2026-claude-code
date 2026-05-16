# RealityRPG — Video-to-Pixel-RPG Architecture

> Upload a video → get a playable pixel-art RPG dungeon campaign.
> Original photo-based plan preserved in `PLAN.txt`. This is the video-input version.

---

## Core Idea

User uploads **one video** (e.g., walking through a room with their phone camera). The system:

1. Extracts candidate keyframes from the video
2. Gemini Vision analyzes ALL keyframes together, picks the 3 most visually distinct ones, and assigns RPG roles (entrance / dungeon / boss) based on atmosphere and variety
3. Each selected keyframe gets a Level JSON from Gemini Vision: hidden collision/placement data plus visible scene dressing metadata
4. Optional time-permit geometry pass can upgrade the boundary-only grid into a vision-assisted walkability/hotspot grid, but only through the same validator/fallback gate
5. The Level JSONs are validated, repaired if needed, and each selected keyframe is transformed into a polished pixel-art background
6. Optional AI sprite generation creates video-derived hero/enemy/item sheets, processed into deterministic Phaser spritesheet manifests
7. A text-only LLM pass generates rich, interconnected NPC/enemy dialogue across the validated levels
8. Everything is assembled into a 3-level campaign served as a Phaser 3 browser game

**Pitch:** "Walk through any space with your camera — the system turns your real room into a polished playable pixel-art RPG dungeon, with animated characters, lighting, dialogue, loot, and boss fights."

**Important:** the ASCII grid is **not** the game aesthetic. It is a hidden, deterministic intermediate representation for collision and spawn points. The player sees pixel-art backgrounds made from their video, animated Kenney or generated sprites, particles, lighting, dialogue boxes, item popups, and RPG UI polish.

**Geometry rule:** programmatic image processing such as k-means/palette clustering is for visual stylization, not authoritative collision. Gameplay geometry comes from Level JSON + deterministic validation. If time permits, a separate vision-assisted geometry pass may propose interior obstacles and richer hotspots, but the validator must be able to reject it and fall back to the boundary-only safe room.

---

## LLM Provider Architecture

The pipeline uses two distinct LLM roles. Vision calls require multimodal input and are locked to Gemini. Text-only calls are provider-agnostic and routed through a thin config-driven wrapper.

| Role | Input | Required Capability | Provider |
|---|---|---|---|
| **Vision** (scene selection, object detection, level generation, optional geometry proposal) | Image + text | Multimodal | Gemini only |
| **Image generation** (optional generated sprite sheets) | Text/image references → PNG | Sprite-sheet generation/editing | GPT Image 2 or Nano Banana/Gemini Image |
| **Text** (dialogue, naming, quest narrative, campaign flavor) | Text only | Text generation | Configurable: Z.AI, Anthropic, Gemini |

### Provider Router (~50 lines)

```python
import os
import anthropic
from openai import OpenAI

# Z.AI and any OpenAI-compatible provider share the same client
def _zai_client():
    return OpenAI(
        api_key=os.environ["ZAI_API_KEY"],
        base_url=os.environ.get("ZAI_BASE_URL", "https://api.zai.chat/v1")
    )

def _anthropic_client():
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

def generate_text(prompt: str, system: str = "", provider: str = None) -> str:
    provider = provider or os.getenv("DEFAULT_TEXT_LLM", "zai")

    if provider == "zai":
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        resp = _zai_client().chat.completions.create(
            model=os.getenv("ZAI_MODEL", "glm-4.7"),
            messages=messages,
        )
        return resp.choices[0].message.content

    elif provider == "anthropic":
        resp = _anthropic_client().messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text

    elif provider == "gemini":
        from google import genai
        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        config = {"system_instruction": system} if system else None
        resp = client.models.generate_content(
            model=os.getenv("GEMINI_TEXT_MODEL", "gemini-2.5-flash-lite"),
            contents=prompt,
            config=config,
        )
        return resp.text

    else:
        raise ValueError(f"Unknown text provider: {provider}")

import re

def strip_json_fences(text: str) -> str:
    """Strip markdown code fences (```json ... ```) from LLM output."""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start:end + 1].strip()
    return text

def generate_json(prompt: str, system: str = "", provider: str = None) -> dict:
    """Generate text and parse as JSON, stripping markdown fences first."""
    raw = generate_text(prompt, system, provider)
    import json
    return json.loads(strip_json_fences(raw))
```

**Environment variables:**
```
DEFAULT_TEXT_LLM=zai          # Which provider for text calls
ZAI_API_KEY=...
ZAI_BASE_URL=https://api.z.ai/v1  # Optional override for OpenAI-compatible Z.AI endpoint
ZAI_MODEL=glm-4.7             # Optional override
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # Optional override
GEMINI_API_KEY=...            # Required for vision + optional for text
GEMINI_TEXT_MODEL=gemini-2.5-flash-lite   # Optional, for text role
```

Adding a new provider = one `elif` branch in `generate_text()`. If the provider is OpenAI-compatible (most are), just add a new `base_url` to the Z.AI branch.

---

## Pipeline Architecture

Reviewed by Gemini 3.1 Pro Preview across multiple rounds. Latest review: **PASS** before the optional geometry + generated asset extension; latest extension must be re-reviewed before implementation. Current version includes intelligent scene selection, deterministic Level JSON generation, hidden collision-grid validation, optional time-permit geometry enhancement, pixel-art background generation, optional video-derived sprite-sheet generation, visual polish layers, validation-before-dialogue, multi-provider text LLM routing, and demo-day rate-limit/upload safeguards.

```
Video Input
  ↓
┌──────────────────────────────────────────────────┐
│ Stage 1: Video Ingestion                         │
│                                                  │
│ ffmpeg extracts candidate keyframes at 2s        │
│ intervals. Typically 5–10 raw frames.            │
│ Saved as frame_000.jpg, frame_001.jpg, ...       │
│                                                  │
│ On failure: skip to fallback campaign            │
└──────────────┬───────────────────────────────────┘
               ↓
┌──────────────────────────────────────────────────┐
│ Stage 2: Intelligent Scene Selection             │
│ [GEMINI VISION — multimodal, all frames at once] │
│                                                  │
│ All candidate keyframes sent in one request.     │
│ Gemini evaluates visual variety and picks the    │
│ 3 most distinct scenes.                          │
│                                                  │
│ Returns: [                                       │
│   { "frame_idx": 0, "role": "entrance",          │
│     "reason": "open space, bright, welcoming" }, │
│   { "frame_idx": 4, "role": "dungeon",           │
│     "reason": "cluttered, dark, many objects" }, │
│   { "frame_idx": 7, "role": "boss",              │
│     "reason": "large open area, dramatic light" }│
│ ]                                                │
│                                                  │
│ If fewer than 3 distinct scenes found,           │
│ remaining slots filled by evenly-spaced frames.  │
│ If Gemini call fails: fall back to evenly-spaced │
│ frame selection (frame 0, mid, end).             │
└──────────────┬───────────────────────────────────┘
               ↓
┌──────────────────────────────────────────────────┐
│ Stage 3: Level Generation (per selected frame)   │
│ [GEMINI VISION — multimodal, one call per level] │
│                                                  │
│ RUNS CONCURRENTLY for all 3 levels via           │
│ asyncio.gather (3 Gemini calls in parallel).     │
│                                                  │
│ Gemini Vision receives:                          │
│   - One selected keyframe image                  │
│   - SPRITE_CATALOG (available sprites)           │
│   - Role (entrance / dungeon / boss)             │
│   - Deterministic level IDs: level_1_entrance,   │
│     level_2_dungeon, level_3_boss                │
│   - Exit target_level set to next level in chain │
│     (final boss level uses target_level: null)   │
│   - Grid template (16x12 boundary-only)          │
│   - Object provenance fields for optional assets │
│                                                  │
│ Returns Level JSON:                              │
│   - title, subtitle, scene_summary, mood         │
│   - hidden ASCII collision grid (16x12)          │
│   - entity list (mapped to SPRITE_CATALOG IDs)   │
│   - visible scene dressing: palette, particles,  │
│     lighting, camera mood, prop labels/hotspots  │
│   - placeholder dialogue lines (short, per-entity)│
│   - source object bboxes for real-world hotspots │
│   - optional generated_asset_ref seed strings    │
│                                                  │
│ Constraints enforced in prompt:                  │
│   - # walls ONLY on grid perimeter               │
│   - Interior is all floor (.) + entity markers   │
│   - sprite_id must come from SPRITE_CATALOG      │
│   - portal IDs are visual styles only; use E for │
│     actual level transitions                     │
│   - P (player) and E (exit) required             │
│   - Entity markers are single letters/digits     │
│     and cannot be P, E, ., or #                  │
│   - If an entity is video-derived, include a     │
│     stable generated_asset_ref seed string       │
│   - Boss-room boss uses type: "boss"             │
│   - Max 4 entities per level                     │
│   - ASCII grid is NEVER rendered visibly         │
│   - Every level gets a visual theme and effects  │
│                                                  │
│ On safety filter hit: skip frame, use next best  │
│ candidate from Stage 2's rankings                │
│ Rate-limit guard: default to 0.5–1s stagger      │
│ between calls; use semaphore/concurrency=2 if    │
│ the key still returns 429s.                      │
└──────────────┬───────────────────────────────────┘
               ↓
┌──────────────────────────────────────────────────┐
│ Stage 3.5: Optional Geometry Enhancement         │
│ [TIME-PERMIT EXTRA — safe to skip]               │
│                                                  │
│ Goal: upgrade the boundary-only grid into a      │
│ richer but still validated play space.           │
│                                                  │
│ Inputs: selected keyframe, Stage 3 Level JSON,   │
│ object bboxes/provenance, target grid size.      │
│                                                  │
│ Preferred method: Gemini Vision labels a coarse  │
│ grid as walkable/blocked/interactive/portal.     │
│ Optional CV helpers may suggest candidates:      │
│   - segmentation/object masks for large blockers │
│   - edge/depth cues for walls/doors/furniture    │
│   - k-means only for palette/region hints, never │
│     as final collision truth                     │
│                                                  │
│ Output is only a PROPOSAL:                       │
│   - proposed_grid with interior # blockers       │
│   - hotspot candidates with source_object_id     │
│   - confidence + rationale                       │
│                                                  │
│ Acceptance gate: Stage 4 validator must pass.    │
│ On any parse/validation/gameplay risk: discard   │
│ proposal and keep Stage 3 boundary-only grid.    │
└──────────────┬───────────────────────────────────┘
               ↓
┌──────────────────────────────────────────────────┐
│ Stage 4: Validation + Pixel Art                  │
│ [DETERMINISTIC — no LLM/image-generation calls] │
│                                                  │
│ RUNS CONCURRENTLY for all 3 levels via           │
│ asyncio.gather (3 pyxelate calls in parallel).   │
│                                                  │
│ a) Grid Validator (Python BFS):                  │
│    - Flood-fill from P to E → must be reachable  │
│    - Every non-wall/non-floor marker has a       │
│      matching entity, and every entity marker    │
│      appears exactly once on an interior tile    │
│    - P exists and is unique                      │
│    - E exists and is unique                      │
│    - If optional geometry adds interior walls,   │
│      all entities/hotspots must remain reachable │
│    - entity.sprite_id exists in SPRITE_CATALOG   │
│    - exit.locked_until matches an entity quest_ref│
│      or is forced to null                        │
│    - exit.target_level overwritten from fixed    │
│      3-level chain, never trusted from LLM       │
│    On FAILURE: reject optional geometry first;   │
│    if the baseline grid itself fails, replace    │
│    with SAFE_EMPTY_ROOM, clear prop_labels, and  │
│    set exit.locked_until = null. For boss level, │
│    inject one fallback boss_demon marker/entity. │
│    (P/E stay in grid)                           │
│                                                  │
│ b) Background Pixelation (Python):               │
│    keyframe.jpg → Pillow/pyxelate → 256x192     │
│    pixel-art background; 16-color palette        │
│    applied via quantization/k-means-like         │
│    clustering only for aesthetics.               │
│    On failure: Pillow NEAREST resize fallback    │
└──────────────┬───────────────────────────────────┘
               ↓
┌──────────────────────────────────────────────────┐
│ Stage 4.5: Optional Campaign-Wide Sprite Sheets  │
│ [TIME-PERMIT EXTRA — safe to skip]               │
│                                                  │
│ Runs ONCE after all 3 Level JSONs have been      │
│ validated, because the asset budget is global:   │
│ one hero sheet, one campaign mob sheet, one      │
│ item/prop/VFX sheet.                             │
│                                                  │
│ If enabled, build asset_manifest.plan.json from  │
│ all validated levels' source_objects/entities,   │
│ call GPT Image 2 or Nano Banana/Gemini Image for:│
│   - hero_walk 4x4                                │
│   - mobs_level_objects 4x4                       │
│   - items_props_fx 4x4                           │
│ Then sprite_processor.py slices, chroma-keys,    │
│ centers cells, writes transparent sheets and     │
│ asset_manifest.generated.json.                   │
│                                                  │
│ On any failure: skip generated assets and keep   │
│ Kenney/public fallback assets via sprite_id.     │
└──────────────┬───────────────────────────────────┘
               ↓
┌──────────────────────────────────────────────────┐
│ Stage 5: Dialogue + Narrative Generation         │
│ [TEXT LLM — configurable provider]               │
│                                                  │
│ Runs AFTER validation so the text LLM receives   │
│ the final entity lists (even if some levels were │
│ replaced with SAFE_EMPTY_ROOM). No phantom       │
│ dialogue for deleted entities.                   │
│                                                  │
│ One batch text call. Receives all 3 validated    │
│ Level JSONs plus the campaign context.           │
│                                                  │
│ Generates:                                       │
│   - Campaign title and story premise             │
│   - Rich NPC dialogue (2–4 lines each, witty,    │
│     interconnected across levels)                │
│   - Enemy taunts / flavor text                   │
│   - Quest item descriptions                      │
│   - Boss intro + defeat dialogue                 │
│   - Victory screen text                          │
│                                                  │
│ Output: dialogue_patch.json that gets merged     │
│ into the Level JSONs (overwriting placeholders). │
│ Patch uses entity marker as key (string) and     │
│ deep-merges into the entities array by marker.   │
│ If an entity was removed by validation, its      │
│ patch entry is silently skipped.                 │
│                                                  │
│ Provider: DEFAULT_TEXT_LLM env var               │
│ JSON output: response is stripped of markdown    │
│ code fences (```json ... ```) before parsing.    │
│ Fallback: if text LLM fails or returns           │
│ unparseable output, use placeholder dialogue     │
│ from Stage 3 (already in Level JSONs)            │
└──────────────┬───────────────────────────────────┘
               ↓
┌──────────────────────────────────────────────────┐
│ Stage 6: Campaign Assembly                       │
│ [DETERMINISTIC — no LLM calls]                   │
│                                                  │
│ 3-level structure from Stage 2 selections:       │
│   Level 1 = entrance (from selected frame)       │
│   Level 2 = dungeon (from selected frame)        │
│   Level 3 = boss room (from selected frame)      │
│                                                  │
│ Merges dialogue_patch.json into Level JSONs.     │
│ Writes campaign.json, copies Kenney sprites,     │
│ generates game.html loading Phaser with data.    │
│                                                  │
│ If ANY core upstream stage failed: load the      │
│ pre-bundled FALLBACK campaign instead. Optional  │
│ geometry/assets only disable those features.     │
└──────────────────────────────────────────────────┘
```

---

## SPRITE_CATALOG (predefined, ships with project)

Gemini picks from this catalog ONLY — no inventing arbitrary sprite names.

```json
{
  "enemies": {
    "slime_green": { "name": "Green Slime", "frames": 4, "behavior": "wander" },
    "slime_red": { "name": "Fire Slime", "frames": 4, "behavior": "chase" },
    "skeleton": { "name": "Skeleton", "frames": 4, "behavior": "patrol" },
    "bat": { "name": "Shadow Bat", "frames": 4, "behavior": "wander" },
    "boss_demon": { "name": "Demon Lord", "frames": 6, "behavior": "boss" }
  },
  "npcs": {
    "villager": { "name": "Villager", "frames": 4 },
    "merchant": { "name": "Merchant", "frames": 4 },
    "wizard": { "name": "Old Wizard", "frames": 4 }
  },
  "items": {
    "potion_red": { "name": "Health Potion" },
    "key_gold": { "name": "Golden Key" },
    "gem_blue": { "name": "Magic Gem" },
    "scroll": { "name": "Ancient Scroll" },
    "sword": { "name": "Short Sword" }
  },
  "portals": {
    "portal_blue": { "name": "Warp Portal", "note": "visual style only; level transition is always reserved grid marker E" },
    "stairs_down": { "name": "Stairs Down", "note": "visual style only; level transition is always reserved grid marker E" },
    "door_locked": { "name": "Locked Door", "note": "visual style only; level transition is always reserved grid marker E" }
  },
  "player": {
    "hero": { "name": "Hero", "frames": 12, "directions": 4 }
  }
}
```

---

## Data Schemas

### Stage 2 Output: Scene Selection
```json
{
  "selected": [
    {
      "frame_idx": 0,
      "role": "entrance",
      "reason": "Open doorway with natural light — good starting area",
      "atmosphere": "welcoming, bright"
    },
    {
      "frame_idx": 4,
      "role": "dungeon",
      "reason": "Cluttered desk with many objects — enemies and items",
      "atmosphere": "dark, cramped, mysterious"
    },
    {
      "frame_idx": 7,
      "role": "boss",
      "reason": "Large open room with dramatic backlighting — arena feel",
      "atmosphere": "dramatic, dangerous"
    }
  ],
  "rejected": [
    { "frame_idx": 1, "reason": "Too similar to frame 0" },
    { "frame_idx": 2, "reason": "Blurry motion" },
    { "frame_idx": 3, "reason": "Too similar to frame 4" }
  ],
  "fallback_used": false
}
```

### Stage 3 Output: Level JSON (per selected frame)
```json
{
  "level_id": "level_2_dungeon",
  "title": "Desk Dungeon",
  "subtitle": "Where Office Supplies Come Alive",
  "role": "dungeon",
  "scene_summary": "A cluttered desk with laptop, mug, tangled cables, notebook, lamp, and backpack.",
  "background": "assets/backgrounds/bg_4.png",
  "visuals": {
    "palette": "arcade_neon",
    "lighting": "purple vignette with warm desk-lamp glow",
    "particles": "floating dust motes and tiny pixel sparks",
    "camera": "subtle slow push-in on level start",
    "overlay": "transparent dungeon-rune border and animated portal shimmer",
    "prop_labels": [
      { "text": "Cursed Mug", "x": 5, "y": 3, "source_object_id": "obj_mug_01", "source_level_id": "level_2_dungeon" },
      { "text": "Forbidden Keyboard", "x": 10, "y": 5, "source_object_id": "obj_keyboard_01", "source_level_id": "level_2_dungeon" }
    ]
  },
  "source_objects": [
    {
      "object_id": "obj_mug_01",
      "name": "coffee mug",
      "bbox_norm": [0.08, 0.38, 0.24, 0.58],
      "visual_description": "white ceramic coffee mug with dark handle",
      "rpg_role": "enemy",
      "rpg_interpretation": "a bubbling ceramic slime that spits hot coffee"
    },
    {
      "object_id": "obj_keyboard_01",
      "name": "keyboard",
      "bbox_norm": [0.45, 0.52, 0.88, 0.73],
      "visual_description": "dark keyboard with glowing monitor reflection",
      "rpg_role": "hotspot",
      "rpg_interpretation": "forbidden control panel"
    }
  ],
  "grid": [
    "################",
    "#..............#",
    "#..1...2.......#",
    "#..............#",
    "#......3.......#",
    "#..............#",
    "#..........E...#",
    "#..............#",
    "#..P...........#",
    "#..............#",
    "#..............#",
    "################"
  ],
  "grid_size": { "width": 16, "height": 12 },
  "tile_size": 16,
  "entities": [
    {
      "marker": "1",
      "sprite_id": "slime_green",
      "type": "enemy",
      "name": "Coffee Slime",
      "hp": 2,
      "damage": 1,
      "dialogue": "A bubbling brown blob oozes menacingly.",
      "source_object_id": "obj_mug_01",
      "source_level_id": "level_2_dungeon",
      "generated_asset_ref": "mob_mug_slime"
    },
    {
      "marker": "2",
      "sprite_id": "scroll",
      "type": "quest_item",
      "name": "Lost Notes",
      "quest_ref": "lost_notes",
      "dialogue": "Pages filled with ancient scribbles."
    },
    {
      "marker": "3",
      "sprite_id": "wizard",
      "type": "npc",
      "name": "The Headphone Hermit",
      "dialogue": [
        "You there! Don't mind the earmuffs.",
        "The wires have been restless since the curse fell."
      ]
    }
  ],
  "player_start_marker": "P",
  "exit_marker": "E",
  "exit": {
    "target_level": "level_3_boss",
    "locked_until": "lost_notes"
  },
  "music": "dungeon"
}
```

### Optional Stage 3.5 Output: Geometry Proposal
```json
{
  "level_id": "level_2_dungeon",
  "proposal_version": 1,
  "method": "gemini_vision_grid_labeling",
  "confidence": 0.72,
  "proposed_grid": [
    "################",
    "#..............#",
    "#..1...2..##...#",
    "#..............#",
    "#......3.......#",
    "#..........#...#",
    "#..........E...#",
    "#..............#",
    "#..P...........#",
    "#..............#",
    "#..............#",
    "################"
  ],
  "hotspots": [
    {
      "hotspot_id": "hotspot_keyboard_panel",
      "source_object_id": "obj_keyboard_01",
      "grid_pos": [10, 5],
      "kind": "interactive",
      "label": "Forbidden Keyboard",
      "rationale": "Large visible keyboard can be an interactable control panel."
    }
  ],
  "acceptance": {
    "requires_bfs_pass": true,
    "fallback_if_rejected": "use_stage_3_boundary_only_grid"
  }
}
```

Important: this file is never consumed directly by Phaser. `validation.py` must either merge accepted fields into the Level JSON or discard the proposal. Accepted `hotspots[].grid_pos` should be converted into the same runtime interaction format used by `visuals.prop_labels` (`x`/`y` grid coordinates plus `source_object_id` and `source_level_id`) so Phaser has one hotspot parser; map `hotspot.label` to `prop_label.text`. When converting, merge/dedupe by `source_object_id`: a Stage 3.5 hotspot overwrites or enriches the existing Stage 3 prop label for the same object instead of creating a duplicate overlap zone.

### Optional Stage 4.5 Output: Generated Asset Manifest
```json
{
  "asset_manifest_version": 1,
  "enabled": true,
  "fallback_policy": "kenney_if_missing_or_invalid",
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
      "background_key": "#FF00FF",
      "cells": [
        {
          "frame": 0,
          "generated_asset_ref": "item_quest_ledger",
          "source_object_id": "obj_notebook_01",
          "source_level_id": "level_2_dungeon",
          "display_name": "Quest Ledger"
        }
      ]
    }
  ]
}
```

The detailed asset workflow lives in `AI_SPRITE_ASSET_WORKFLOW.md`; this architecture only defines the handoff contract. `AssetManifest.ts` must switch on `sheet.type` because hero movement, mob rows, and static item cells intentionally use different shapes optimized for their runtime usage. Phaser must treat generated sheets as optional and fall back to `SPRITE_CATALOG`/Kenney assets if `enabled=false` or a referenced asset is missing.

### Stage 5 Output: Dialogue Patch (merged into Level JSONs)
```json
{
  "campaign_title": "The Pixel Curse of the Ordinary World",
  "story_premise": "A reality-warping curse has transformed your everyday surroundings into a pixel dungeon. Only by traversing three corrupted rooms can you break the spell.",
  "victory_text": "The pixels dissolve. Reality returns. You made it through the ordinary apocalypse.",
  "patches": {
    "level_1_entrance": {
      "entities": {
        "1": {
          "dialogue": "I was once a latte, you know. Now I'm PURE EVAPORATED DARKNESS."
        },
        "3": {
          "dialogue": [
            "Ah, another soul trapped in the pixel curse.",
            "The Coffee Slime holds the Lost Notes — defeat it and the path to the Kitchen Caverns opens.",
            "Fair warning: it's jittery."
          ]
        }
      }
    },
    "level_2_dungeon": {
      "entities": {
        "2": {
          "dialogue": "The Toaster King guards the Silver Spoon. Don't let him butter you up."
        }
      }
    },
    "level_3_boss": {
      "entities": {
        "1": {
          "dialogue": [
            "You think you can un-pixelate this world?",
            "I AM the algorithm now!"
          ]
        }
      }
    }
  }
}
```

### Campaign JSON (assembled in Stage 6)
```json
{
  "campaign_title": "The Pixel Curse of the Ordinary World",
  "story_premise": "A reality-warping curse has transformed your everyday surroundings into a pixel dungeon...",
  "levels": [
    { "level_id": "level_1_entrance", "role": "entrance", "source_frame_idx": 0 },
    { "level_id": "level_2_dungeon", "role": "dungeon", "source_frame_idx": 4 },
    { "level_id": "level_3_boss", "role": "boss", "source_frame_idx": 7 }
  ],
  "asset_manifest": "asset_manifest.generated.json",
  "asset_manifest_optional": true,
  "quest": {
    "boss_sprite": "boss_demon",
    "boss_generated_asset_ref": null,
    "victory_text": "The pixels dissolve. Reality returns."
  }
}
```

Stage 6 should try to extract `quest.boss_sprite` from the Level 3 boss entity's `sprite_id`; if Level 3 has no entities or no boss entity because validation fell back to SAFE_EMPTY_ROOM, default `quest.boss_sprite` to `"boss_demon"` and `boss_generated_asset_ref` to `null`. If the boss has a valid `generated_asset_ref`, include it separately as `boss_generated_asset_ref` but keep `boss_sprite` as the fallback.

### SAFE_EMPTY_ROOM (fallback when validation fails)
```json
{
  "grid": [
    "################",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..............#",
    "#..P.......E...#",
    "#..............#",
    "################"
  ]
}
```

---

## Visual Impressiveness Layer — Not an ASCII Game

The ASCII grid is deliberately boring because it is **machine-readable infrastructure**, not the player-facing experience. The wow factor comes from layered rendering and game feel:

### What the player sees
- **Pixelated video-derived backgrounds:** each level visibly comes from the user's real video, transformed into a retro game scene.
- **Animated characters/enemies:** default Kenney/public sprites with idle/walk/combat animation; optional generated sprite sheets can replace them when `asset_manifest.generated.json` validates. Never use static raw video crops as sprites.
- **Scene-specific visual effects:** Gemini assigns each level a palette, lighting mood, particle effect, border treatment, and portal style.
- **Semantic prop labels/hotspots:** Gemini identifies real objects in the frame and turns them into RPG-flavored labels/items like “Cursed Mug,” “Forbidden Keyboard,” or “Laundry Golem Shrine.” Optional geometry enhancement can make these richer interactive points if validation accepts them.
- **Juicy RPG UI:** title card, dialogue box, item pickup popups, health bar, quest tracker, victory screen.
- **Game-feel polish:** camera shake on hit, hit flashes, floating damage numbers, screen vignette, portal shimmer, ambient particles.

### Why keep the hidden ASCII grid anyway?
- It gives the game deterministic collision/spawn data that can be validated in milliseconds.
- It prevents the LLM from generating fragile engine-specific map formats.
- It lets the visual layer be cool without risking softlocks or broken physics.

### Minimum visual polish checklist for the demo
1. Pixel-art background from the uploaded video fills the whole play area.
2. Player/enemies/NPCs are animated sprites on top of the background.
3. Every level has a visible theme from `visuals.palette`, `visuals.lighting`, and `visuals.particles`.
4. Real-world object labels appear as interactive RPG-flavored hotspots.
5. Optional generated sprites, if enabled, visibly echo objects from the uploaded video and pass the manifest validator.
6. Portal/exit has a visible animated shimmer, not just an invisible tile.
7. Dialogue and item pickup popups use styled RPG UI, not plain browser alerts.

---

## Backend Architecture

```
backend/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── api/
│   │   └── routes.py        # Upload video, trigger pipeline, serve game
│   ├── pipeline/
│   │   ├── ingestion.py     # Extract candidate keyframes via ffmpeg
│   │   ├── scene_select.py  # Gemini Vision: all frames → pick 3 distinct scenes
│   │   ├── level_gen.py     # Gemini Vision: selected frame → Level JSON (concurrent)
│   │   ├── geometry.py      # Optional: vision/CV walkability + hotspot proposal
│   │   ├── validation.py    # BFS flood-fill validator + SAFE_EMPTY_ROOM fallback
│   │   ├── pixelator.py     # Pillow/pyxelate keyframe → pixel art background
│   │   ├── asset_gen.py     # Optional: GPT Image 2/Nano Banana sprite-sheet calls
│   │   ├── sprite_processor.py # Slice/chroma-key/validate generated sheets
│   │   ├── dialogue.py      # Text LLM (multi-provider): validated levels → dialogue patch
│   │   └── assemble.py      # Merge dialogue/assets, write campaign.json, package game
│   ├── llm/
│   │   ├── router.py        # generate_text() — config-driven multi-provider router
│   │   ├── vision.py        # Gemini Vision client (image + text → JSON)
│   │   └── providers/
│   │       ├── zai.py       # Z.AI (OpenAI-compatible SDK)
│   │       ├── anthropic.py # Anthropic Messages API
│   │       ├── gemini.py    # google-genai text-only
│   │       └── image.py     # Optional image generation adapter
│   └── constants/
│       └── sprite_catalog.json
├── prompts/
│   ├── scene_selection.md   # Gemini prompt: pick 3 distinct frames from N candidates
│   ├── level_generation.md  # Gemini prompt: image + catalog → Level JSON
│   ├── geometry_proposal.md # Optional: image + objects → proposed grid/hotspots
│   ├── sprite_sheet.md      # Optional: object-derived sprite-sheet prompt templates
│   └── dialogue.md          # Text LLM prompt: all levels → rich dialogue patch
├── assets/
│   ├── sprites/             # Kenney sprite PNGs (pre-bundled)
│   ├── fallback/            # Hardcoded fallback campaign (3 levels)
│   └── music/               # BGM tracks
└── output/
    └── {project_id}/
        ├── campaign.json
        ├── levels/
        ├── backgrounds/
        ├── generated_sprites/ # Optional processed transparent sheets
        ├── asset_manifest.generated.json
        ├── geometry_proposals/ # Optional rejected/accepted proposal audit logs
        ├── keyframes/        # All candidate frames (for scene_select)
        └── game.html
```

### Key Implementation Notes

**ingestion.py** — Rejects giant uploads before processing (`max 20MB` or `max 15s` video duration for demo safety). Then `subprocess.run(["ffmpeg", "-i", video_path, "-vf", "fps=1/2", output_pattern])` extracts frames every 2 seconds. Typically 5–10 raw candidates. If fewer than 3 usable frames are extracted, duplicate the best frames only as a last resort; if no frame is usable, trigger the fallback campaign. On ffmpeg failure, returns empty list → triggers fallback campaign.

**scene_select.py** — Sends all candidate frames to Gemini Vision in one request with the scene_selection.md prompt. Asks Gemini to evaluate visual variety and return ranked selections with roles. If the call fails or returns <3 selections, falls back to evenly-spaced frame selection (`frame_0, frame_mid, frame_end`). This prevents the "two identical-looking levels" problem.

**level_gen.py** — One Gemini Vision call per selected frame. Sends the image + SPRITE_CATALOG + role + grid template + deterministic level IDs (`level_1_entrance`, `level_2_dungeon`, `level_3_boss`) + exit target_level pointing to next in chain; the final boss level must use `target_level: null` so the game triggers VictoryScene. Use `asyncio.gather`, but start tasks with a 0.5–1s stagger by default to avoid hackathon/free-tier burst limits; if Gemini still returns 429s, retry with a semaphore of 2. Returns Level JSON with ASCII grid and entities. On parse failure, returns a fully populated default Level JSON using SAFE_EMPTY_ROOM: default title/subtitle/role/background/visuals, empty `entities`, `player_start_marker`, `exit_marker`, `exit.target_level` set from the deterministic level chain, and `exit.locked_until = null`. On safety filter hit, tries the next-best rejected frame from scene_select's rankings.

**geometry.py** — Optional time-permit module, disabled by default. Consumes the selected keyframe plus Stage 3 `source_objects`/bboxes and asks Gemini Vision for a coarse 16x12 walkability/hotspot proposal. CV helpers may provide masks/edges/depth hints, but k-means/palette clusters are never authoritative collision. The module writes `geometry_proposal.json`; it does not mutate Level JSON directly. If the call fails, returns `None` and the baseline boundary-only grid continues.

**validation.py** — BFS flood fill from P position. Treat `.` plus entity markers as walkable tiles; `#` is blocked. If a geometry proposal exists, validate it first: P/E/entities reachable, hotspots either reachable on-floor or adjacent to a reachable floor tile for wall-mounted interactions, no markers on walls, no isolated rooms, no more than a small obstacle budget (default <=12 interior wall tiles for 16x12). Accept the proposal only if all checks pass; otherwise discard it and keep the Stage 3 boundary-only grid. Then run relational cleanup on the final level: overwrite `exit.target_level` from the deterministic chain (`level_1_entrance` → `level_2_dungeon` → `level_3_boss` → `null`); if `exit.locked_until` does not match any entity `quest_ref`, set it to `null`; if any `entity.sprite_id` is missing from `SPRITE_CATALOG`, replace it with a safe default by type (`slime_green` for enemies, `villager` for NPCs, `potion_red`/`scroll` for items, `boss_demon` for bosses). If the baseline grid itself is invalid, overwrite with SAFE_EMPTY_ROOM, clear `level.visuals.prop_labels = []`, and set `level.exit.locked_until = null`; P and E remain as grid markers, not entities. For non-boss levels, clear the entities array to `[]` and clear/truncate `source_objects` so optional Stage 4.5 does not generate art for deleted content. For `level_3_boss`, preserve the campaign climax by writing marker `B` into a reachable interior tile near the exit and appending a fallback boss entity `{ marker: "B", type: "boss", sprite_id: "boss_demon", name: "Fallback Demon", hp: 5, damage: 1, dialogue: "The curse refuses to end quietly." }`. Re-run BFS after injection; if it somehow fails, move `B` next to `P` and validate again. Also apply this boss injection if the boss level's grid is otherwise valid but contains no entity with `type: "boss"`. No LLM involved. Runs BEFORE dialogue so the text LLM gets the final entity lists.

**pixelator.py** — Loads keyframe with Pillow. Preferred demo-safe path: downscale/quantize/upscale with Pillow (`NEAREST`, 16-color palette) because it is instant and deterministic. Optional enhancement: pyxelate with `width=256, height=192, palette=16`; if pyxelate takes >10s in the first local test, disable it and keep Pillow as the primary method. Run optional pyxelate behind a strict timeout so it cannot hang the FastAPI request. Palette quantization/k-means-like clustering is used only for appearance. It must not create collision, walls, or interactive semantics. Process all 3 backgrounds sequentially or behind `asyncio.Semaphore(1)` by default because Pillow/pyxelate work is CPU-bound and fast enough; only use `asyncio.gather` if local testing confirms CPU usage is fine.

**asset_gen.py + sprite_processor.py** — Optional generated-art path described in `AI_SPRITE_ASSET_WORKFLOW.md`. After all levels validate, build one campaign-wide `asset_manifest.plan.json` from every validated level's Stage 3 `source_objects` and entities, generate a small fixed budget of sheets (`hero_walk`, `mobs_level_objects`, `items_props_fx`), then deterministically process them: resize/crop to exact grid, chroma-key `#FF00FF`, center each sprite, validate non-empty cells, and write `asset_manifest.generated.json`. Generation failure, invalid sheets, or missing rows must not block the campaign; `assemble.py` falls back to Kenney assets per entity.

**dialogue.py** — Runs AFTER validation. One text LLM call via `generate_json()` (which handles markdown fence stripping). Sends all 3 validated Level JSONs plus the dialogue.md prompt. Provider is determined by `DEFAULT_TEXT_LLM` env var. Returns `dialogue_patch.json` that gets merged into Level JSONs by entity marker. If an entity was removed by validation, its patch entry is silently skipped. If the text LLM call fails or returns unparseable output, the placeholder dialogue from Stage 3 remains and `assemble.py` injects hardcoded campaign-level fallback strings for `campaign_title`, `story_premise`, and `victory_text` — the game still works, just less polished.

**assemble.py** — Merges dialogue_patch.json into Level JSONs (deep-merge entity dialogue by marker key — array items matched by `marker` field, dict patch applied by marker string key). Before writing, runs a deterministic prop cleanup: if a `visuals.prop_labels[]` entry shares a `source_object_id` with an entity, remove that prop label entirely so the entity system owns rendering/interaction and no duplicate static hotspot is spawned. Overwrites each `level.background` with the actual saved Stage 4b pixelator output path; never trust the LLM-suggested background path. Writes campaign.json with the frame selections from Stage 2. If `dialogue_patch.json` is missing/invalid, inject default strings: `campaign_title = "The Pixel Curse"`, `story_premise = "Your video has become a tiny RPG dungeon."`, and `victory_text = "Reality snaps back into place. You win!"`. For `quest.boss_sprite`, find a Level 3 entity with `type: "boss"` and extract its `sprite_id`; `validation.py` guarantees a boss entity by injecting fallback marker `B`/`boss_demon` both when the boss level falls back to SAFE_EMPTY_ROOM and when a valid LLM grid forgot to include a boss. If a legacy level somehow lacks `type: "boss"`, fall back to the entity whose `SPRITE_CATALOG[entity.sprite_id].behavior === "boss"`; if even that is absent, use `boss_demon` and `boss_generated_asset_ref: null` as a final defensive default. Copies Kenney sprite assets plus any validated generated sheets. Includes `asset_manifest.generated.json` in campaign metadata when available. Generates game.html that loads Phaser with the campaign data. If core upstream stages fail, serves the pre-bundled fallback campaign; optional geometry/asset failures only disable those optional features.

**llm/router.py** — The `generate_text()` function shown in the Provider Architecture section above. All text-only LLM calls in the pipeline go through this. Vision calls go through `llm/vision.py` which wraps the `google-genai` SDK.

---

## Frontend: Game Runtime

Single-page **Phaser 3** app. The game engine is fixed code — only the JSON data changes per video.

### Visual Stack (6 layers, bottom to top)
- **Layer 0:** Pixelated video-derived background — fills the play area and carries the “this is my real room” magic.
- **Layer 1:** Color grading / vignette overlay from `visuals.palette` and `visuals.lighting`.
- **Layer 2:** Hidden ASCII grid → invisible `Phaser.Physics.Arcade.StaticGroup` rectangles at `#` positions — boundary walls only, never shown to player.
- **Layer 3:** Entity sprites — generated sheets when `asset_manifest.generated.json` has a valid mapping, otherwise Kenney/public fallback sprites. Player, enemies, NPCs, items, and portal are all animated where possible.
- **Layer 4:** Effects — particles, portal shimmer, hit flashes, damage numbers, item sparkle, camera shake.
- **Layer 5:** RPG UI — dialogue boxes, item pickups, quest tracker, health bar, title/victory screens.

### Grid Parser (Phaser)
```typescript
// Parses the grid string array into invisible wall physics bodies
function createWalls(grid: string[], tile: number, scene: Phaser.Scene) {
  const walls = scene.physics.add.staticGroup();
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col] === '#') {
        const rect = scene.add.rectangle(
          col * tile + tile / 2, row * tile + tile / 2,
          tile, tile, 0x000000, 0
        );
        walls.add(rect);
      }
    }
  }
  return walls;
}
```

### Entity Spawner (Phaser)
```typescript
// Scans grid for digit markers, looks up entity in the level's entity list,
// places the corresponding generated or Kenney fallback sprite at that grid position
function spawnEntities(
  grid: string[], tile: number, entities: EntityDef[],
  scene: Phaser.Scene, spriteFactory: SpriteFactory
) {
  const spawned: Map<string, Phaser.GameObjects.Sprite> = new Map();
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const ch = grid[row][col];
      if (ch === 'P' || ch === 'E' || ch === '.' || ch === '#') continue;
      const def = entities.find(e => e.marker === ch);
      if (def) {
        // SpriteFactory receives the full entity so it can resolve optional
        // generated art first and fall back to def.sprite_id/Kenney if the
        // generated sheet or animation is missing.
        const sprite = spriteFactory.createEntity(
          def, col * tile + tile / 2, row * tile + tile / 2
        );
        const scale = def.type === 'boss' ? 2 : 1;
        sprite.setDisplaySize(tile * scale, tile * scale); // generated sheets may be 64/96px cells
        // Arcade Physics tracks the display scale; don't call body.setSize() here
        // or the unscaled source-body math can shrink collisions incorrectly.
        spawned.set(def.marker, sprite);
      }
    }
  }
  return spawned;
}
```

Generated static item/prop art is handled separately from entity spawning because `visuals.prop_labels` are not grid markers. Phaser should render them as optional overlays/hotspots and fall back to text-only labels if the item sheet is missing:

```typescript
function spawnProps(
  level: LevelJson, propLabels: PropLabel[], scene: Phaser.Scene,
  assetManifest: AssetManifest | null, tile: number
) {
  for (const label of propLabels) {
    const x = label.x * tile + tile / 2;
    const y = label.y * tile + tile / 2;
    const generatedRef = assetManifest?.lookupPropBySourceObject(
      label.source_object_id, label.source_level_id ?? level.level_id
    );

    if (generatedRef && scene.textures.exists(generatedRef.textureKey)) {
      scene.add.sprite(x, y, generatedRef.textureKey, generatedRef.frame)
        .setDisplaySize(tile, tile)
        .setDepth(3);
    }

    // Always keep the text/hotspot interaction, even without generated art.
    // createHotspotZone uses the same center-origin x/y as the rendered prop sprite.
    createHotspotZone(scene, x, y, label.text, label.source_object_id);
  }
}
```

Player and exit are spawned separately from the entity list because `P` and `E` are reserved grid markers, not entity records:

```typescript
function findMarker(grid: string[], marker: string): { x: number; y: number } {
  for (let row = 0; row < grid.length; row++) {
    const col = grid[row].indexOf(marker);
    if (col !== -1) return { x: col, y: row };
  }
  throw new Error(`Missing marker ${marker} in level ${level.level_id}`);
}

const playerPos = findMarker(level.grid, 'P');
const exitPos = findMarker(level.grid, 'E');

// Player sprite at P; invisible overlap zone at E.
// If level.exit.target_level === null, overlap starts VictoryScene.
```

### Scene Flow (dynamic level order from campaign.json)
```
BootScene (load assets + campaign.json)
  → TitleScene (campaign title + story premise, press Enter)
  → GameScene (levels in campaign order: entrance → dungeon → boss)
  → VictoryScene (victory text from dialogue patch)
```

Level transitions happen when the player overlaps the E marker and the `locked_until` quest condition is met (or null). The player is not an entity, so `Player.ts`/`AssetManifest.ts` should use a singleton `hero_walk` lookup when the generated manifest is enabled. Optional generated spritesheets must be loaded with `this.load.on('loaderror', ...)` or equivalent fallback handling; a missing generated PNG must immediately revert that entity to its `sprite_id`/Kenney fallback rather than crashing BootScene. The load-error handler should also mark/delete the failed generated key in `AssetManifest.ts` so `scene.textures.exists()` cannot treat a broken placeholder texture as valid. AssetManifest animation parsing should default mob/idle loops to `repeat: -1` when the manifest omits `repeat`, and default `cols` to `4` only as a defensive fallback if a partially written optional manifest somehow reaches the frontend.

### File Structure
```
game/
├── index.html
├── src/
│   ├── main.ts              # Phaser.Game config
│   ├── scenes/
│   │   ├── BootScene.ts     # Preload sprites, load campaign.json
│   │   ├── TitleScene.ts    # Show campaign title, wait for input
│   │   ├── GameScene.ts     # Parse grid, spawn entities, run gameplay
│   │   ├── DialogueScene.ts # NPC dialogue overlay (rex-plugin dialog)
│   │   └── VictoryScene.ts  # Campaign complete screen
│   ├── systems/
│   │   ├── Player.ts        # WASD movement, wall collision, entity interaction
│   │   ├── Enemy.ts         # Wander/chase/patrol AI, bump combat
│   │   ├── NPC.ts           # Proximity detection → trigger DialogueScene
│   │   ├── Portal.ts        # Overlap detection → scene.start(next_level)
│   │   ├── Inventory.ts     # Set<string> of collected quest_ref IDs
│   │   └── Quest.ts         # Check locked_until conditions against inventory
│   └── utils/
│       ├── AssetManifest.ts # Optional generated sheet manifest → Phaser animations
│       └── LevelLoader.ts   # Level JSON → grid walls + entity sprites
└── assets/                  # Copied from backend output at build time
```

---

## API Endpoints

```
POST /api/upload                  # Upload video, create project
GET  /api/projects/{id}           # Project status (which stages completed)
POST /api/projects/{id}/generate  # Run full pipeline (blocking or polling)
GET  /api/projects/{id}/game      # Serve game.html with campaign data
GET  /api/projects/{id}/campaign  # Raw campaign.json
GET  /api/projects/{id}/levels/{level_id}  # Raw level JSON
```

---

## Timeline (5-Hour Hackathon, 2-Person Team)

| Time | Person A (Pipeline + Backend) | Person B (Game Engine) |
|---|---|---|
| 0:00–0:30 | FastAPI + Vite + Phaser + LLM router scaffolding | Shared scaffolding |
| 0:30–1:00 | ffmpeg ingestion + scene_select.py | BootScene + TitleScene |
| 1:00–1:30 | level_gen.py + prompts | Grid parser + wall physics |
| 1:30–2:00 | validation.py + SAFE_EMPTY_ROOM | Player movement + wall collision |
| 2:00–2:30 | dialogue.py + multi-provider router | NPC interaction + dialogue overlay |
| 2:30–3:00 | pixelator.py + assemble.py | Enemy spawning + behavior AI |
| 3:00–3:30 | **🎯 MILESTONE: 1 full level working end-to-end** | **🎯 same** |
| 3:30–4:00 | All 3 levels + dialogue merge | Portal transitions, inventory UI |
| 4:00–4:30 | Polish: provider fallbacks, error handling | Polish: music, sfx, victory screen |
| 4:30–5:00 | Fallback campaign test, demo prep | Practice run, edge case testing |
| 5:00–5:30 | Buffer | Buffer |

---

## Time-Permit Extra Features Implementation Plan

These are explicitly **after the core demo works**. The architecture is designed so each feature is additive and can be toggled off without breaking the game.

### Extra A — Vision-Assisted Geometry + Interactive Points

**Goal:** make interiors feel more spatially aware by adding a few validated blockers and richer interactable hotspots derived from the keyframe.

**Do not use raw k-means as collision.** K-means/palette clustering may help the pixel-art look or provide weak region hints, but collision semantics must come from Gemini Vision/object/depth/segmentation proposals plus deterministic validation.

**Implementation steps:**
1. Create `backend/app/pipeline/geometry.py` behind `ENABLE_GEOMETRY_PROPOSAL=false` by default.
2. Create `backend/prompts/geometry_proposal.md` requesting exactly the `Geometry Proposal` schema above.
3. Pass selected keyframe + Stage 3 `source_objects` + baseline grid to Gemini Vision.
4. Save raw proposal to `output/{project_id}/geometry_proposals/{level_id}.json` for debugging.
5. In `validation.py`, add `try_accept_geometry(level, proposal)` before final validation.
6. Enforce acceptance rules:
   - same `grid_size` as baseline
   - exactly one P and one E
   - every marker still has a matching entity
   - P → E reachable
   - P → every entity reachable; every accepted hotspot either reachable on its tile or adjacent to a reachable floor tile
   - interior wall budget capped (`<=12` for 16x12 by default)
   - if any check fails, discard proposal and keep baseline grid
7. Expose accepted hotspots to Phaser as normal interaction zones.
8. Verify with three fixtures: cluttered desk, hallway, open room.

**Acceptance:** the game is never worse than the boundary-only baseline; accepted geometry only adds flavor.

### Extra B — Video-Derived Generated Sprite Sheets

**Goal:** make enemies/items look custom to the uploaded video by generating a tiny fixed set of sprite sheets from detected real objects.

**Implementation steps:**
1. Keep Kenney sprites as the default path.
2. Create `backend/app/pipeline/asset_gen.py` behind `ENABLE_GENERATED_SPRITES=false` by default.
3. Generate `asset_manifest.plan.json` from `source_objects`, selecting up to 4 mobs and 8–16 item/prop/VFX cells.
4. Call GPT Image 2 or Nano Banana/Gemini Image for only 3 sheets:
   - `hero_walk` 4x4
   - `mobs_level_objects` 4x4
   - `items_props_fx` 4x4
5. Create `sprite_processor.py` to enforce exact rows/cols/cell sizes, chroma-key magenta, center sprites, validate non-empty cells, and write transparent sheets.
6. Write `asset_manifest.generated.json` using the schema above.
7. Add `game/src/utils/AssetManifest.ts` to load generated sheets first and fall back to `SPRITE_CATALOG` IDs when a mapping is missing/invalid.
8. Verify with one known desk video: the Mug Slime row animates, the item sheet loads, and disabling the manifest returns to Kenney assets.

**Acceptance:** image generation can fail completely and the campaign still runs with video-derived backgrounds and Kenney sprites.

---

## Failure Modes + Mitigations

| Failure | What Happens | Mitigation |
|---|---|---|
| Gemini returns malformed JSON | Level gen crashes | strip markdown fences, json.loads in try/except → minimal Level JSON with empty entities |
| Gemini safety filter rejects a frame | That level is missing | Try next-best rejected frame from scene_select rankings |
| Scene select returns <3 frames | Missing levels | Fall back to evenly-spaced frame selection |
| Two keyframes look identical | Duplicate-looking levels | Scene selection picks based on visual variety — this is the whole point of Stage 2 |
| Text LLM (dialogue) fails | Boring placeholder text | Placeholder dialogue from Stage 3 remains; game still works |
| Grid has unreachable exit | Player softlocked | Flood-fill validator → SAFE_EMPTY_ROOM |
| `exit.locked_until` references missing quest item | Player softlocked | Validator sets `locked_until = null` unless matching `quest_ref` exists |
| LLM hallucinates `sprite_id` | Missing texture crash | Validator rewrites unknown sprite IDs to safe SPRITE_CATALOG defaults |
| LLM hallucinates `exit.target_level` | Broken level transition | Validator/assembler overwrites target_level from deterministic 3-level chain |
| Dialogue patch missing campaign strings | Undefined title/victory UI | assemble.py injects hardcoded campaign-level defaults |
| Player starts inside a wall | Game stuck | Validator checks P on floor tile |
| pyxelate slow/crashes | Pipeline latency spike or no pixel background | Use Pillow pixelation as primary demo-safe path; pyxelate is optional enhancement |
| Optional geometry proposal creates bad walls | Softlock or confusing collision | Validator rejects proposal and keeps boundary-only grid |
| Pixel clustering/k-means misclassifies objects | Wrong walls/hotspots | Never use clustering as authoritative gameplay data; only for aesthetics/hints |
| Generated sprite sheet has bad layout/cells | Missing/ugly sprites | sprite_processor validates sheet; fallback to Kenney assets per row/entity |
| Image generation API slow/fails | Demo stalls | Feature flag off by default; timebox calls; fallback to Kenney assets |
| Entire pipeline fails | No game at all | Pre-bundled fallback campaign loads |
| Phaser gets bad level data | Game crash | All JSON validated before serving to engine |
| Invisible walls misaligned with visual background | Confusing gameplay | Only perimeter walls exist; interior is fully open |
| Wrong LLM provider configured | Text calls fail | Provider-specific try/except → fall back to next configured provider |
| Gemini Vision 429/rate limits | One or more level calls fail | Default to 0.5–1s stagger; retry with concurrency=2 if needed |
| Huge phone video uploaded | Server locks up extracting frames | Reject >20MB or >15s during demo |

---

## Critique History

### Round 1 — FAIL
Gemini 3.1 Pro Preview identified 3 critical issues:
1. Asking LLM to generate Tiled JSON is unreliable (complex 1D array format)
2. Cropping sprites from video frames gives static images with no transparency or animation
3. Bounding box → grid coordinate translation is an unsolved spatial math problem

### Round 2 — PASS ✅
All 3 issues resolved. Improvements:
- Merged scene analysis + level generation into single Gemini call
- Boundary-only wall rule
- Fail-fast validation with hardcoded fallback room
- Pre-bundled fallback campaign

### v4 Optional Geometry + Generated Asset Extension — Gemini Review PASS ✅
- Added a safe Stage 3.5 optional geometry proposal path for richer walls/hotspots. It is disabled by default, never directly consumed by Phaser, and must pass Stage 4 validation or be discarded.
- Clarified that k-means/palette clustering is for pixel-art aesthetics only, not authoritative gameplay collision.
- Added source object provenance fields to Level JSON so generated sprites, hotspots, and dialogue can reference real objects from the uploaded video.
- Added optional campaign-wide Stage 4.5 GPT Image 2 / Nano Banana sprite-sheet generation with deterministic `sprite_processor.py` validation and Kenney fallback.
- Added Phaser asset-manifest loading contract so generated art is swappable and non-blocking.
- Iterated Gemini 3.1 Pro Preview architecture review through 13 rounds. Final verdict: **PASS**. Key fixes from review: campaign-wide asset generation ordering, SAFE_EMPTY_ROOM boss injection, locked_until/target_level/sprite_id validation, local-frame animation schema, source_level_id scoping, prop/entity dedupe, generated sprite scaling, and campaign-level text fallbacks.

### v3 Additions + Round 3 Fixes
- **Intelligent scene selection** — Gemini Vision evaluates all candidate keyframes and picks the 3 most visually distinct ones, preventing duplicate-looking levels.
- **Dedicated dialogue generation pass** — Text-only LLM generates rich, interconnected NPC/enemy dialogue across all 3 levels. Gracefully degrades to placeholder dialogue on failure.
- **Multi-provider text LLM** — Thin config-driven router supporting Z.AI (OpenAI-compatible), Anthropic, and Gemini for text-only calls. Vision stays on Gemini.
- **Pipeline reordering (Round 3 fix)** — Validation + pixelation (Stage 4) now runs BEFORE dialogue generation (Stage 5). This prevents phantom dialogue for entities that validation removed.
- **JSON fence stripping (Round 3 fix)** — `strip_json_fences()` + `generate_json()` utilities strip markdown code blocks from LLM output before parsing. Prevents crashes from `` ```json ``` `` wrapping.
- **Deterministic level IDs** — Stage 3 prompt includes fixed level IDs and exit targets so Gemini doesn't invent inconsistent level references.
- **Concurrency** — Level generation (Stage 3) and pixelation (Stage 4b) run 3 parallel calls each via `asyncio.gather` to keep total pipeline latency under ~45s.
