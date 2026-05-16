# Game Stack Recommendation: Video-to-Pixel-RPG

> Research-backed recommendation for the best 2D pixel art game engine
> and supporting stack for a 5-hour hackathon.

---

## 🏆 Recommended Stack

### Phaser 3 + phaser3-rex-plugins + Kenney Assets + Vite

| Component | What | Why |
|---|---|---|
| **Phaser 3** (v3.80+) | Core game engine | Best tilemap support, arcade physics, scene management, largest community |
| **phaser3-rex-plugins** | Plugin library | Dialogue system, text effects, pathfinding, NPC behaviors — someone else built all the RPG systems |
| **Pillow** (Python) | Demo-safe pixelation + sprite processing | Instant resize/quantize/upscale path, palette quantization, chroma-keying, sheet slicing; zero build risk |
| **pyxelate** (Python) | Optional prettier background pixelation | Use only if pre-installed and fast on the demo laptop |
| **Gemini Vision** | Scene analysis | Keyframe selection, object/theme detection, RPG role assignment, optional geometry proposal |
| **GPT Image 2 / Nano Banana** | Optional sprite generation | Generate video-derived 4x4 hero/enemy/item sheets when time permits; Kenney remains fallback |
| **Text LLM Router** | Dialogue/narrative | Z.AI / Anthropic / Gemini for provider-configurable story text |
| **FFmpeg** | Video processing | Keyframe extraction from uploaded videos |
| **FastAPI** | Backend | Lightweight, async, easy pipeline orchestration |
| **Vite** | Frontend bundler | Fast dev server, Phaser-friendly |

---

## Why Phaser 3 Wins

### vs. Kaplay (formerly Kaboom.js)
- **Kaplay** is faster for a 10-minute prototype (minimalist API)
- But **no native Tiled/tilemap support** — you'd build tile rendering from scratch
- No dialogue system, no inventory, no NPC behavior plugins
- Hits walls fast after the "character moves on screen" stage
- Phaser has 15x more StackOverflow answers and tutorials

### vs. ExcaliburJS
- TypeScript-first (nice) but smallest community
- Fewer RPG-specific examples and tutorials
- Phaser has more battle-tested RPG demos to copy from

### vs. PixiJS
- PixiJS is just a renderer — no physics, no scenes, no input
- You'd build every game system from scratch
- Phaser literally uses PixiJS under the hood

---

## The "Someone Else Did the Heavy Lifting" Tier

### ⭐⭐⭐ phaser3-rex-plugins (MUST USE)
**GitHub:** https://github.com/rexrainbow/phaser3-rex-plugins

This is the secret weapon. 2k+ stars, actively maintained. Gives you:
- **Dialog plugin** — RPG dialogue boxes with text typing effect, portrait support, choice branches
- **TagText** — Colored/styled text for RPG item names and keywords
- **MoveTo** — NPC patrol/chase behaviors
- **Board system** — Grid-based movement (optional for tactical RPG feel)
- **Pathfinding** — A* for enemy AI
- **UI widgets** — Buttons, panels, grids for inventory screens

Using this plugin alone saves 2+ hours of building RPG systems from scratch.

### ⭐⭐⭐ Kenney.nl Free Assets
**URL:** https://kenney.nl/assets

CC0-licensed pixel art tilesets and sprites:
- "Micro Roguelike" — tiny dungeon tiles
- "Rogue Dungeon Tiles" — detailed dungeon set
- "Tiny Dungeon" — compact dungeon sprites
- "1-Bit Pack" — monochrome retro aesthetic

These work as fallback/placeholder sprites and tilesets. Use them when the AI-generated sprites don't look right.

### ⭐⭐ Tiled Map Editor Integration
**URL:** https://www.mapeditor.org/

Phaser 3 loads Tiled JSON natively:
```js
// 3 lines to load a Tiled map in Phaser
this.load.tilemapTiledJSON('map', 'levels/desk_dungeon.json');
this.load.image('tiles', 'assets/tileset.png');
const map = this.make.tilemap({ key: 'map' });
```

For this hackathon, do **not** ask the LLM to emit Tiled JSON. It is too brittle for generated layouts. Use the custom hidden ASCII-grid Level JSON from `VIDEO_RPG_PIPELINE.md` only as collision/spawn infrastructure; the rendered game should be pixelated video backgrounds + animated sprites + effects/UI polish. Optionally build a Tiled exporter later after the demo works.

If time permits, an optional geometry proposal pass can add a few interior blockers and richer hotspots, but Phaser should still consume the same validated grid format. The game runtime should not know whether the grid came from the safe boundary-only baseline or an accepted geometry proposal.

---

## Pixel Art + Asset Generation Pipeline

Pixel art has two separate jobs:

1. **Background stylization** — deterministic transformation of selected video keyframes into retro backgrounds.
2. **Optional sprite-sheet generation** — generated hero/enemy/item sheets derived from detected video objects, then deterministically sliced/validated.

Keep these independent. Background generation must always work without image-generation APIs; sprite generation is an optional upgrade with Kenney fallback.

### Background Tier 1 (USE THIS — Most Reliable): Pillow Pixelation
```python
from PIL import Image

img = Image.open("keyframe_001.jpg").convert("RGB")
small = img.resize((128, 96), Image.Resampling.BILINEAR).quantize(colors=16)
pixel_art = small.resize((256, 192), Image.Resampling.NEAREST)
pixel_art.save("desk_dungeon_bg.png")
```

**Why:** Zero API dependency, deterministic, no native/ML package surprises, and fast enough that it will never be the bottleneck. This should be the default hackathon path.

### Background Tier 1.5 (Optional Enhancement): pyxelate
```python
from pyxelate import Pyx
from PIL import Image

# Downscale + color quantize = instant pixel art
img = Image.open("keyframe_001.jpg")
# Check installed pyxelate version before the timer.
# Pyxelate 2.x style:
pyx = Pyx(factor=8, palette=16)
pyx.fit(img)
pixel_art = pyx.transform(img)
pixel_art.save("desk_dungeon_bg.png")
```

**Why:** Often prettier than plain Pillow, but can be slower and has more install/build risk. Pre-install and test it before the timer starts; if it takes >10s for 3 backgrounds, disable it. Run it behind a strict timeout so it cannot hang the demo server.

### Background Tier 2 (Optional Enhancement): Stable Diffusion + Pixel Art LoRA
- Use `img2img` with denoising strength 0.3–0.5 on downscaled frames
- CivitAI has dozens of "pixel art" LoRAs for SD 1.5 and SDXL
- Can run locally (free, unlimited) or via Replicate API (~$0.002/image)
- Higher quality than pure programmatic, but more setup and more failure points

### Background Tier 3 (Fallback): GPT-4o Image Edit
- Generate at small resolution (64x64), then nearest-neighbor upscale
- Not reliably pixel-perfect but works in a pinch
- ~$0.04–0.12/image

### Optional Sprite Sheets: GPT Image 2 / Nano Banana

Use the workflow in `AI_SPRITE_ASSET_WORKFLOW.md` if, and only if, the core demo is already running. Generate a tiny fixed budget:

```text
After all 3 levels validate, build one campaign-wide asset manifest plan, then generate:

1 image call: hero 4-direction walk sheet, 4x4
1 image call: 3 video-derived mobs + 1 boss row, one row each, 4x4
1 image call: 16 video-derived items/props/VFX, 4x4
```

Deterministic processing is mandatory:

- Require solid magenta `#FF00FF` background in prompts.
- Slice by exact rows/cols; do not infer layout from pixels.
- Chroma-key magenta to transparency.
- Center each non-empty cell in a fixed cell size.
- Write `asset_manifest.generated.json` with `source_level_id` on object-derived rows/cells.
- Phaser scales generated 64/96px cells down to the runtime display size (`tile_size` by default), so generated art does not cover multiple grid tiles.
- If validation fails, use Kenney fallback assets.

### Geometry / Collision Image Processing Rule

Do **not** use k-means or raw pixel clusters to decide walls. Color clustering is useful for palette reduction and background aesthetics; it does not understand gameplay semantics.

If timing permits, use `VIDEO_RPG_PIPELINE.md`'s optional geometry proposal architecture:

```text
keyframe + source_objects + baseline grid
→ Gemini Vision coarse walkability/hotspot proposal
→ deterministic BFS/entity/hotspot validator
→ accept proposal or fall back to boundary-only grid
```

This keeps the runtime architecture ready for smarter collision without making the demo fragile.

### SKIP: Gemini for background pixel art
- Inconsistent adherence to pixel art style
- Often produces smooth "retro-styled" art rather than true pixel art
- Not reliable enough for a hackathon timeline

---

## Full Architecture (Stack Diagram)

```
┌──────────────────────────────────────────────┐
│              USER UPLOADS VIDEO               │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│           FASTAPI BACKEND                     │
│                                              │
│  ffmpeg ──→ keyframe extraction               │
│      ↓                                       │
│  Gemini Vision ──→ scene selection            │
│      ↓              (3 distinct keyframes)    │
│  Gemini Vision ──→ level JSON per frame       │
│      ↓              (hidden grid + visuals)   │
│  Optional Geometry → proposed grid/hotspots    │
│      ↓              (validator accepts/rejects)│
│  Pillow/pyxelate ─→ pixel art backgrounds      │
│      ↓                                       │
│  Optional Image Gen → sprite sheets            │
│  Pillow processor → validated asset manifest   │
│      ↓                                       │
│  Text LLM Router ─→ campaign dialogue         │
│      ↓                                       │
│  JSON output: campaign.json + level_N.json    │
│  Asset output: backgrounds/ + sprites/        │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│          PHASER 3 GAME RUNTIME                │
│                                              │
│  BootScene → loads campaign.json              │
│      ↓                                       │
│  TitleScene → campaign title + premise        │
│      ↓                                       │
│  GameScene → loads level JSON, spawns         │
│    player, enemies, NPCs, items, portals      │
│    uses rex-plugins for dialogue              │
│      ↓                                       │
│  DialogueScene → NPC dialogue overlay         │
│      ↓                                       │
│  VictoryScene → campaign complete             │
│                                              │
│  Systems: Player, Enemy, NPC, Portal,         │
│  Inventory, Quest — all driven by JSON data   │
└──────────────────────────────────────────────┘
```

---

## Speed Estimates

| Component | Time to Implement | Time Saved by Libraries |
|---|---|---|
| Video → keyframes | 20 min | ffmpeg does the work |
| Gemini scene selection | 40 min | One multimodal prompt over all candidate frames |
| Dialogue/campaign flavor | 30 min | One text-only LLM call through provider router |
| Pixel art background pipeline | 30 min | Pillow primary + optional pyxelate polish |
| Optional generated sprite pipeline | 45–60 min after core demo | GPT Image 2/Nano Banana + deterministic Pillow sheet processor |
| Optional geometry proposal | 30–45 min after core demo | Gemini Vision proposes; validator/fallback keeps runtime safe |
| Level JSON generation | 30 min | Gemini call |
| Phaser BootScene + TitleScene | 30 min | Boilerplate |
| Phaser GameScene (player + movement) | 40 min | Phaser arcade physics |
| Phaser entities (enemies, NPCs, items) | 40 min | rex-plugins for dialogue |
| Portal / level transitions | 20 min | Phaser scene.start() |
| Polish (music, sfx, UI) | 30 min | Kenney assets |
| **TOTAL** | **~4.5 hours** | |

---

## Alternative: If You Find a Better Starter Kit

If any of these exist by hackathon time, use them as the game runtime base instead of building from scratch:

1. **Phaser 3 RPG Template** — Search GitHub for "phaser3 rpg template" or "phaser3 rpg boilerplate"
2. **Ourcade (Tommy Leung) templates** — https://github.com/ourcade — prolific Phaser tutorial author
3. **Matter.js + Phaser** — If you want more realistic physics (probably overkill)

The key criterion: **it must load level data from JSON**. If a starter kit hardcodes levels, skip it — your entire value prop is dynamic level generation.

---

## Final Verdict

**Stack: Phaser 3 + rex-plugins + Pillow pixelation/sprite processing (+ optional pyxelate) + Gemini Vision + optional GPT Image 2/Nano Banana sprite generation + configurable text LLM router + FastAPI**

This gives you:
- ✅ Lowest friction (Phaser is the most documented HTML5 game engine)
- ✅ Someone else built the RPG systems (rex-plugins)
- ✅ Most reliable pixel art background pipeline (Pillow programmatic path, optional pyxelate polish, no AI art API required for core demo)
- ✅ Architecture-ready optional upgrades: validated geometry proposals and generated video-derived sprite sheets can be toggled on without risking the baseline
- ✅ Best demo story ("walk through a room → get an RPG")
- ✅ Battle-tested by thousands of game jam devs before you
