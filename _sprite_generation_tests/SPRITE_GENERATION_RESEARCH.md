# 2D Sprite Generation Research + Local Feasibility Test

Date: 2026-05-13
Project scope: test/research only. No project runtime code was added outside this `_sprite_generation_tests/` sandbox.

## Local hardware reality

- Environment: WSL2 Linux on Windows
- GPU: `nvidia-smi` unavailable in WSL, so no usable CUDA GPU detected from this environment
- RAM: ~15 GiB total, ~10 GiB available during test
- Practical consequence: local SDXL/FLUX/AnimateAnyone-style diffusion is not the best path for a 5-hour hackathon on this machine. Use cloud/API generation, then local deterministic slicing/cleanup.

## Best recommendation for the hackathon

Use a **hybrid pipeline**:

1. Generate a full 4x4 RPG walking sheet from a prompt/reference using a cloud image model.
2. Force a solid chroma-key background, preferably `#FF00FF` magenta.
3. Locally slice into 16 transparent frames and 4 directional GIF previews.
4. Use the resulting transparent PNG sheet in Phaser as a simple 4-direction walking character.
5. Keep Kenney/LPC sprites as fallback if generation fails during demo.

This is the lowest-risk way to get custom sprites that look impressive without betting the hackathon on local GPU setup.

## Local test result: GPT Image 2 -> local slicing

Generated a prompt-based 4x4 RPG mage sheet using the configured image generation backend (`gpt-image-2-medium`).

Prompt used:

```text
Pixel art sprite sheet for a top-down 16-bit RPG player character: a brave blue-cloaked apprentice mage with brown boots and tiny wooden staff. EXACTLY 16 equal-size cells arranged in a 4x4 grid. Rows: walking down, walking left, walking right, walking up. Four animation frames per row. Solid flat magenta #FF00FF background in every cell, no borders, no grid lines, no labels, no text, no shadows. Character same scale and centered in every cell, crisp pixel art, transparent-ready chroma key, game-ready sprite sheet.
```

Outputs:

- Raw generated sheet: `outputs/gpt_image2_raw_player_sheet.png`
- Test slicer: `scripts/slice_magenta_spritesheet.py`
- Transparent sheet: `outputs/lightweight_gpt_image2_player_sheet/sheet-transparent.png`
- Direction previews:
  - `outputs/lightweight_gpt_image2_player_sheet/down.gif`
  - `outputs/lightweight_gpt_image2_player_sheet/left.gif`
  - `outputs/lightweight_gpt_image2_player_sheet/right.gif`
  - `outputs/lightweight_gpt_image2_player_sheet/up.gif`
- Metadata: `outputs/lightweight_gpt_image2_player_sheet/slice-meta.json`

Verification:

- Raw image was a real 4x4 sprite sheet, solid magenta background, no text.
- Local vectorized slicer produced 16 frame PNGs, 4 GIFs, and a 384x384 transparent sheet with 96px cells.
- Visual inspection: usable for hackathon RPG, consistent character, animation motion is subtle but sufficient.

Important implementation note:

- `agent-sprite-forge` has a richer postprocessor, but its connected-component cleanup timed out under WSL on this generated 1024x1024 sheet. A lightweight vectorized chroma-key + slicing script worked reliably and is a better hackathon path.

## Repo/tool findings

### 1. Cloud/API direct generation + local slicing — recommended

Best options:

- GPT Image 2 / OpenAI image generation
- Gemini image generation / "nano banana" style pipelines
- Scenario, PixelLab, Retro Diffusion / Replicate, fal.ai

Why:

- Works on this hardware because generation runs remotely.
- Can produce a whole sheet in one prompt.
- Local work is just slicing, alpha cleanup, metadata, and previews.

Risks:

- Prompt adherence is not guaranteed every time.
- Animation can be subtle or a bit jittery.
- Need fallback assets and quick regenerate button/workflow.

Best prompt pattern:

```text
Top-down 16-bit RPG pixel art sprite sheet. EXACTLY 16 equal-size cells in a 4x4 grid. Rows are walking down, walking left, walking right, walking up. Four animation frames per row. Solid flat magenta #FF00FF background. No borders, no grid lines, no labels, no text. Same character scale and centered in every cell. Crisp pixel art, dark outline, limited palette.
```

### 2. blendi-remade/sprite-sheet-creator — promising but API dependent

Source: https://github.com/blendi-remade/sprite-sheet-creator

What it does:

- Next.js app for text/image -> pixel sprites and maps.
- Supports side-scroller and isometric/RPG modes.
- Uses fal.ai models, including Nano Banana Pro / GPT Image 2 style models and Bria background removal.

Local test:

- `npm install` completed.
- `npm run build` compiled, then failed TypeScript validation on a `Set<number>` downlevel iteration issue.
- This is a repo issue/config issue, not a hardware issue. Dev mode may still work, but generation requires `FAL_KEY`.

Verdict:

- Good inspiration; not the fastest dependency for a 5-hour hackathon unless already using fal.ai and willing to patch tsconfig.

### 3. marcelontime/spriteforge — builds locally, OpenAI API dependent

Source: https://github.com/marcelontime/spriteforge

What it does:

- Browser app for photo/reference -> game sprite frames using OpenAI GPT-Image-1.
- Supports actions like idle, walk, jump, hurt, knockout, etc.

Local test:

- `npm install` completed.
- `npm run build` completed successfully.
- Needs OpenAI API key for actual generation.

Verdict:

- Best repo to study if you want a simple browser workflow around OpenAI image generation.
- For the hackathon, borrowing the strategy is more useful than depending on the full UI.

### 4. 0x0funky/agent-sprite-forge — excellent workflow ideas, local processor too heavy as-is here

Source: https://github.com/0x0funky/agent-sprite-forge

What it does:

- Agent-oriented prompts and scripts for 2D sprites/maps.
- Has strong prompt templates, magenta background cleanup, slicing, GIFs, metadata.

Local test:

- Repo cloned and inspected.
- Prompt builder and postprocessing design are useful.
- Direct postprocess on the generated 1024x1024 sheet timed out in WSL; likely due to heavier component cleanup.

Verdict:

- Use its prompt philosophy and metadata ideas.
- For the hackathon, use the lighter vectorized slicer unless you tune/optimize ASF.

### 5. soulfir/sprite-generator — works locally, no AI, useful fallback/NPC filler

Source: https://github.com/soulfir/sprite-generator

What it does:

- Procedural humanoid sprite generation via Python.
- Creates 4-direction-ish sprite sheets and GIFs.

Local test:

- Required extra deps not listed in requirements: `matplotlib`, `networkx`, `scipy`.
- After installing those, it generated 40 files under `repos/sprite-generator/Generated_Sprites/`.

Verdict:

- Works fully local on this hardware.
- Output is charming but rough/inconsistent.
- Useful for quick NPC/monster filler or fallback, not hero-character polish.

### 6. Sprite Sheet Diffusion / AnimateAnyone-style repos — not recommended locally

Source: https://github.com/chenganhsieh/Sprite-Sheet-Diffusion

What it does:

- Research diffusion pipeline for character animation frames.
- Built on AnimateAnyone-like code.
- Requires model weights and CUDA-class hardware.

Verdict:

- Interesting research, not a 5-hour local hackathon dependency.

### 7. Hugging Face local diffusion models — mostly not feasible locally here

Relevant models:

- `Onodofthenorth/SD_PixelArt_SpriteSheet_Generator`
- `Mystic07/flux-lora-spritesheet`
- `pixelparty/pixel-party-xl`

Findings:

- Stable Diffusion sprite models need CUDA for practical use.
- FLUX LoRA needs a FLUX base model and far more VRAM than this WSL environment exposes.
- PixelParty XL/SDXL also expects GPU.

Verdict:

- Use via cloud/ComfyUI/RunPod if needed, not local WSL for this hackathon.

### 8. Commercial/cloud tools worth considering

- Retro Diffusion: pixel-art-specialized; has Replicate models (`rd-plus`, `rd-fast`, `rd-animation`, `rd-tile`). Strong candidate if API access is available.
- PixelLab: browser/cloud tool with animation, rotations, style consistency, API/MCP. Good for manually preparing assets.
- AutoSprite: upload/create sprite, choose moveset, export Phaser/Godot/etc. Good if the web product works as advertised.
- Scenario: direct sprite-sheet generation or video-to-frames pipeline, supports custom character models for consistency.
- Sprite Sage: Windows tool with Gemini/OpenAI providers and Godot export, but GPLv3 app and Windows-focused.

## Practical ranking for this project

1. **GPT Image 2 / Gemini / Retro Diffusion cloud generation + lightweight local slicer** — best for 5-hour demo.
2. **SpriteForge-style OpenAI browser workflow** — easiest repo-based UI path if an API key is available.
3. **fal.ai sprite-sheet-creator** — strong feature set but needs API key and build/config fix.
4. **PixelLab/Scenario/AutoSprite manual tool workflow** — great if using web UI is acceptable.
5. **soulfir procedural generator** — local fallback/filler.
6. **Local SDXL/FLUX/SSD diffusion** — not recommended on this hardware.

## Hackathon integration strategy, without writing project code here

For the actual RPG build, the safest product flow would be:

- User enters a character prompt or uploads a photo/reference.
- Backend/service calls cloud image generation for a 4x4 sheet on magenta.
- Local deterministic processor slices to transparent frames.
- Phaser loads the transparent sheet with frame size 96x96 or 64x64.
- If generation fails or sheet validation fails, use a built-in fallback player sprite.

Validation checks before accepting a generated sheet:

- Image is square.
- Can divide evenly into 4 rows x 4 columns.
- Magenta background ratio is high enough.
- No OCR/text detected if you add OCR later.
- Each cell has a non-empty alpha bbox after chroma-key.
- Character bbox sizes do not vary too wildly.

## Files created in this sandbox

- `scripts/slice_magenta_spritesheet.py`
- `outputs/gpt_image2_raw_player_sheet.png`
- `outputs/gpt_image2_raw_player_sheet_512.png`
- `outputs/lightweight_gpt_image2_player_sheet/`
- `repos/sprite-generator/`
- `repos/agent-sprite-forge/`
- `repos/spriteforge/`
- `repos/sprite-sheet-creator/`
- Build/test logs in `outputs/*.log`
