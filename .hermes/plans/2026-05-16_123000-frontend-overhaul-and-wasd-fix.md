# CameraQuest Frontend Overhaul + WASD Fix Plan

## Goal
1. Fix WASD/arrow keyboard controls that still don't work in real browsers
2. Overhaul the frontend from "corny" to polished, with more "wow" features for hackathon demo impact

## Current Context

**Repo**: `/mnt/c/Users/joshu/PROJECTS/HACKATHONS/Photo-Pixel-RPG/`
**Active frontend**: `frontend/` (Vite dev server on port 5173)
**Entry**: `frontend/src/main.ts` (the one with `RpgScene` class)
**Also exists**: Root `src/main.ts` + `src/game/PhotoRpgScene.ts` (appears to be an older/alternate version NOT currently running)

### WASD Investigation Findings

The keyboard plugin IS correctly configured:
- `input.keyboard.target = window` (confirmed working)
- WASD keys registered with correct keyCodes (87, 65, 83, 68)
- Keys correctly report `isDown: true` when pressed

**The game loop stops after frame 1 in headless browser** (RAF doesn't fire when page isn't visible). This is expected headless behavior. But the user reports it doesn't work in a REAL browser either, so there must be an additional issue.

**Most likely remaining cause**: When clicking "Play Demo Campaign" or "Generate", the button click creates a new Phaser game via `restartGame()`. The `setTimeout(120ms)` to focus the canvas may not be reliable. Also, after button click, focus returns to the button — the user has to click the game canvas first before WASD works.

**But wait** — `input.keyboard.target: window` should mean focus doesn't matter, since Phaser listens on `window`. So if the user's real browser also has broken WASD, the issue might be:
1. The old game isn't fully destroyed before the new one is created (event listeners on window persist)
2. The Phaser game's `update()` isn't firing in some browser/tab conditions
3. There's a Vite HMR issue — old code in memory

### Frontend Assessment (Current State)

**What's "corny":**
- Left sidebar is functional but bland — all dark boxes, no visual flair
- No animations/transitions beyond basic hover states
- Pipeline steps are static text with no animation
- No particle effects, no ambient motion
- Game canvas area has no visual framing beyond a border
- No sound effects
- No mobile touch controls
- Victory screen is just text change + physics pause
- No screen shake feedback on damage (actually exists but subtle)
- Loading/generating has no visual progress
- No favicon, no OG meta tags

**Files to change:**
- `frontend/src/main.ts` — WASD fix + game enhancements
- `frontend/src/style.css` — Visual overhaul
- `frontend/index.html` — Structure changes, meta tags
- `frontend/src/campaign.ts` — Possibly more demo content
- `frontend/src/types.ts` — If new features need type changes

## Proposed Approach

### Phase 1: Fix WASD (Critical, 15 min)

**Strategy**: Ditch Phaser's keyboard plugin entirely. Use raw `window.addEventListener('keydown'/'keyup')` with a manual key state map. Phaser's `update()` reads from our map. Zero dependency on Phaser's focus/keyboard plugin.

**Changes to `frontend/src/main.ts`**:
```
// At module level (outside RpgScene):
const keyState: Record<string, boolean> = {};
window.addEventListener('keydown', e => { keyState[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keyState[e.key.toLowerCase()] = false; });

// In RpgScene.update(), replace:
//   const vx = (this.cursors.left.isDown || this.wasd.A.isDown ? -speed : 0) + ...
// With:
//   const vx = (keyState['a'] || keyState['arrowleft'] ? -speed : 0) + ...
```

Remove all Phaser keyboard plugin usage (`this.cursors`, `this.wasd`, `this.input.keyboard`).

### Phase 2: Frontend Visual Overhaul (1-2 hrs)

**A. Landing/Hero Redesign**
- Add animated CSS particle background (floating pixels/stars)
- Glitch text effect on "CameraQuest" title
- Pulsing glow on the upload zone
- Animated gradient border on game shell
- Add a subtle scanline overlay on the whole page

**B. Game Enhancements**
- Screen flash red on damage (CSS overlay that fades)
- Victory confetti (canvas-based or CSS particles)
- Mini-map in corner showing player position
- Smooth camera follow instead of static view
- Death animation (player fades + screen shake)
- Level transition animation (fade to black, text "Entering Desk Dungeon...")
- Collectible pickup sparkle effect (Phaser tweens)

**C. HUD Improvements**
- HP bar (visual hearts or bar, not just text)
- Inventory slots with icons
- Mini toast notifications for events ("Item collected!", "Enemy defeated!")
- Animated quest text (typewriter effect)

**D. Mobile / Touch**
- Virtual D-pad overlay when touch device detected
- Tap-to-interact on entities

**E. Polish**
- Loading spinner during campaign generation
- Animated pipeline steps (each step pulses when active, checkmark when done)
- Sound effects via Web Audio API (procedural 8-bit beeps — no audio files needed)
- Favicon (pixel sword emoji or generate a tiny pixel art)
- OG meta tags for sharing

### Phase 3: Delegate to Claude Code

Use `claude --bare` with the Anthropic credentials to implement the overhaul:
- Provide full file contents and this plan
- Let Claude implement the CSS + TS changes
- Validate by checking the running dev server

## Step-by-Step Plan

1. **Fix WASD** — Patch `frontend/src/main.ts` to use raw window keyboard events instead of Phaser's keyboard plugin
2. **Create visual overhaul prompt** for Claude with exact file contents
3. **Delegate to Claude Code** with Anthropic credentials (`ANTHROPIC_BASE_URL=https://api.vibetoken.lol ANTHROPIC_API_KEY=vt-demo-hackathon-d3d31624aa86dc615bada33f`)
4. **Verify** WASD works + visual improvements are live
5. **Iterate** on any issues

## Tests / Validation
- Press WASD in real browser -> player moves
- Press arrow keys -> player moves
- Upload photos -> campaign generates
- Click demo -> 3 levels playable
- Visual: no console errors, smooth animations
- Mobile: virtual d-pad appears on touch devices

## Risks / Trade-offs
- **Risk**: Claude Code may not have access to the filesystem (running in WSL, files on /mnt/c)
  - Mitigation: We can pipe file contents via stdin and have Claude output the full new files
- **Risk**: Phaser keyboard plugin removal might break cursor keys
  - Mitigation: Test both WASD and arrows after the fix
- **Risk**: CSS overhaul might break responsive layout
  - Mitigation: Keep existing breakpoints, add new styles incrementally
- **Trade-off**: Procedural sound effects add complexity; cut if time is short

## Open Questions
- Should we use the root `src/` version or the `frontend/src/` version going forward? (Currently `frontend/` is what's running)
- How much time do we have for the hackathon demo? (Determines how many wow features to include)
