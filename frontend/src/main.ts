import Phaser from 'phaser';
import './style.css';
import { campaignFromFiles, demoCampaign } from './campaign';
import type { Campaign, Entity, Level } from './types';

const tile = 48;
const cols = 16;
const rows = 12;
let activeCampaign: Campaign = demoCampaign;
let currentLevelIndex = 0;
let game: Phaser.Game | null = null;

// ── Raw keyboard state (bypasses Phaser keyboard plugin entirely) ──
const keyDown: Record<string, boolean> = {};
window.addEventListener('keydown', e => { keyDown[e.key] = true; });
window.addEventListener('keyup', e => { keyDown[e.key] = false; });

// ═══════════════════════════════════════════════════════════════
//  8-BIT SOUND ENGINE (Web Audio API — procedural chiptune SFX)
// ═══════════════════════════════════════════════════════════════
class SfxEngine {
  private ctx: AudioContext | null = null;
  private get ac(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }
  private beep(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.12) {
    try {
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ac.currentTime + dur);
      o.connect(g).connect(this.ac.destination);
      o.start(); o.stop(this.ac.currentTime + dur);
    } catch { /* silent fail */ }
  }
  collect() { this.beep(880, 0.1); setTimeout(() => this.beep(1320, 0.15), 80); }
  damage()  { this.beep(150, 0.25, 'sawtooth', 0.15); }
  victory() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.2, 'square', 0.1), i * 120));
  }
  portal()  { this.beep(440, 0.15); setTimeout(() => this.beep(660, 0.15), 100); setTimeout(() => this.beep(880, 0.2), 200); }
  click()   { this.beep(600, 0.05, 'square', 0.06); }
}
const sfx = new SfxEngine();

// ═══════════════════════════════════════════════════════════════
//  TOAST NOTIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════
function showToast(message: string, type: 'success' | 'info' | 'warning' | 'danger' = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ═══════════════════════════════════════════════════════════════
//  HP HEARTS RENDERER (watches healthText via MutationObserver)
// ═══════════════════════════════════════════════════════════════
function initHpWatcher() {
  const el = document.getElementById('health-text');
  if (!el) return;
  const maxHp = 5;
  let lastHp = 5;
  const renderHearts = (hp: number) => {
    let html = '';
    for (let i = 0; i < maxHp; i++) {
      const filled = i < hp;
      html += `<span class="heart ${filled ? '' : 'empty'}">${filled ? '♥' : '♡'}</span>`;
    }
    el.innerHTML = html;
  };
  // Override textContent setter to intercept RpgScene HP updates
  const origDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  if (origDescriptor?.set) {
    Object.defineProperty(el, 'textContent', {
      set(value: string) {
        // Parse and render hearts (always, to overwrite the raw text)
        const match = String(value).match(/(\d+)/);
        if (match) {
          const hp = parseInt(match[1]);
          if (hp < lastHp) sfx.damage();
          lastHp = hp;
          renderHearts(hp);
        }
      },
      get: origDescriptor.get,
      configurable: true,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  VIRTUAL D-PAD (touch devices)
// ═══════════════════════════════════════════════════════════════
function initDpad() {
  const dpad = document.getElementById('dpad');
  if (!dpad) return;
  const dirMap: Record<string, string> = {
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'
  };
  dpad.querySelectorAll('.dpad-btn').forEach(btn => {
    const dir = (btn as HTMLElement).dataset.dir!;
    const key = dirMap[dir];
    const start = () => { keyDown[key] = true; sfx.click(); };
    const end = () => { keyDown[key] = false; };
    btn.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); end(); }, { passive: false });
    btn.addEventListener('touchcancel', end);
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
    btn.addEventListener('mouseleave', end);
  });
}

// ═══════════════════════════════════════════════════════════════
//  INVENTORY TRACKER
// ═══════════════════════════════════════════════════════════════
let collectedItems: string[] = [];
function updateInventory() {
  // Find or create inventory bar
  let bar = document.getElementById('inventory-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'inventory-bar';
    const gameShell = document.getElementById('game-shell');
    const gameEl = document.getElementById('game');
    if (gameShell && gameEl) {
      gameShell.insertBefore(bar, gameEl);
    }
  }
  bar.innerHTML = '<span class="inv-label">INV</span>';
  for (let i = 0; i < 4; i++) {
    const slot = document.createElement('div');
    slot.className = `inv-slot ${i < collectedItems.length ? 'filled' : ''}`;
    slot.textContent = i < collectedItems.length ? collectedItems[i] : '';
    bar.appendChild(slot);
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $('photo-input') as HTMLInputElement;
const generateBtn = $('generate-btn') as HTMLButtonElement;
const demoBtn = $('demo-btn') as HTMLButtonElement;
const dialogue = $('dialogue');
const levelName = $('level-name');
const questText = $('quest-text');
const healthText = $('health-text');
const levelList = $('level-list');
const uploadHint = $('upload-hint');
const pipelineSteps = Array.from(document.querySelectorAll('#pipeline-steps li')) as HTMLElement[];
let uploadedPhotos: Array<{ name: string; dataUrl: string }> = [];

function setDialogue(speaker: string, text: string): void;
function setDialogue(text: string): void;
function setDialogue(speakerOrText: string, text?: string) {
  const speaker = text ? speakerOrText : 'SYSTEM';
  const msg = text ?? speakerOrText;
  dialogue.innerHTML = `<span class="dialogue-speaker">${speaker}</span><span class="dialogue-text">${msg}</span>`;
  // Toast for special events
  if (speaker === 'VICTORY') { showToast(msg, 'success'); sfx.victory(); }
  else if (speaker === 'LOOT') { showToast(msg, 'info'); sfx.collect(); }
  else if (speaker === 'PORTAL') { sfx.portal(); }
}
function updatePanel(campaign: Campaign, levelIdx = 0) {
  levelList.innerHTML = '';
  campaign.levels.forEach((level, idx) => {
    const div = document.createElement('div');
    div.className = `level-card ${idx === levelIdx ? 'active' : ''}`;
    div.innerHTML = `<strong>${idx + 1}. ${level.name}</strong><br><small>${level.summary}</small>`;
    div.onclick = () => { currentLevelIndex = idx; restartGame(); sfx.click(); };
    levelList.appendChild(div);
  });
}
function pipelineDone() {
  pipelineSteps.forEach((li, i) => {
    setTimeout(() => {
      li.classList.remove('active');
      li.classList.add('done');
    }, i * 240);
  });
}
function pipelineSetActive(index: number) {
  pipelineSteps.forEach((li, i) => {
    if (i < index) { li.classList.remove('active'); li.classList.add('done'); }
    else if (i === index) { li.classList.add('active'); li.classList.remove('done'); }
    else { li.classList.remove('active'); li.classList.remove('done'); }
  });
}
function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function attachPhotos(campaign: Campaign): Campaign {
  const levels = campaign.levels.map((level, idx) => ({
    ...level,
    backgroundDataUrl: uploadedPhotos[idx]?.dataUrl,
    photoName: level.photoName ?? uploadedPhotos[idx]?.name,
  }));
  return { ...campaign, levels };
}
async function requestBackendCampaign(files: FileList | null): Promise<Campaign> {
  if (!files || files.length === 0) return campaignFromFiles(files);
  const form = new FormData();
  Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, 5).forEach((file) => form.append('files', file));
  const response = await fetch('http://127.0.0.1:8000/api/generate-campaign', { method: 'POST', body: form });
  if (!response.ok) throw new Error(`backend ${response.status}`);
  return response.json() as Promise<Campaign>;
}

// ═══════════════════════════════════════════════════════════════
//  RPGSCENE — DO NOT MODIFY THIS CLASS
// ═══════════════════════════════════════════════════════════════
class RpgScene extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Sprite;
  hp = 5;
  collected = new Set<string>();
  mobs!: Phaser.Physics.Arcade.Group;
  items!: Phaser.Physics.Arcade.Group;
  portals!: Phaser.Physics.Arcade.Group;
  blockers!: Phaser.Physics.Arcade.StaticGroup;
  markerEntities = new Map<string, Entity>();

  constructor() { super('rpg'); }

  preload() {
    activeCampaign.levels.forEach((level) => {
      if (level.backgroundDataUrl) this.load.image(`photo-bg-${level.id}`, level.backgroundDataUrl);
    });
  }

  create() {
    this.hp = 5;
    this.collected.clear();
    collectedItems = [];
    updateInventory();
    const level = activeCampaign.levels[currentLevelIndex];
    levelName.textContent = level.name;
    questText.textContent = level.quest;
    healthText.textContent = `❤ HP ${this.hp}`;
    updatePanel(activeCampaign, currentLevelIndex);
    setDialogue(activeCampaign.title, level.quest);
    this.createTextures(level);
    this.addBackground(level);

    this.blockers = this.physics.add.staticGroup();
    this.mobs = this.physics.add.group();
    this.items = this.physics.add.group();
    this.portals = this.physics.add.group();
    level.entities.forEach(e => this.markerEntities.set(e.marker, e));

    let spawn = { x: tile * 1.5, y: tile * 1.5 };
    const pendingSpawns: Array<{ marker: string; px: number; py: number }> = [];
    level.grid.forEach((line, y) => [...line].forEach((ch, x) => {
      const px = x * tile + tile / 2;
      const py = y * tile + tile / 2;
      if (ch === '#') {
        const wall = this.blockers.create(px, py, 'wall');
        wall.setDisplaySize(tile, tile).refreshBody();
      } else if (ch === 'P') {
        spawn = { x: px, y: py };
      } else if (ch === 'E') {
        const portal = this.portals.create(px, py, 'portal') as Phaser.Physics.Arcade.Sprite;
        portal.setCircle(16).setImmovable(true);
        this.tweens.add({ targets: portal, angle: 360, repeat: -1, duration: 2200 });
      } else if (this.markerEntities.has(ch)) {
        pendingSpawns.push({ marker: ch, px, py });
      }
    }));

    // Create player FIRST so NPC overlap colliders have a valid reference
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'hero');
    this.player.setCollideWorldBounds(true).setDepth(20).setSize(26, 28);
    this.physics.add.collider(this.player, this.blockers);
    this.physics.add.collider(this.mobs, this.blockers);
    this.physics.add.overlap(this.player, this.items, (_, item) => this.collect(item as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.mobs, (_, mob) => this.hitMob(mob as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.portals, () => this.tryPortal());

    // Now spawn entities (NPCs need this.player for overlap colliders)
    pendingSpawns.forEach(({ marker, px, py }) => this.spawnEntity(marker, px, py));

    this.cameras.main.setBackgroundColor('#05040a');
  }

  update() {
    if (!this.player?.active) return;
    const speed = 185;
    const left  = keyDown['a'] || keyDown['A'] || keyDown['ArrowLeft'];
    const right = keyDown['d'] || keyDown['D'] || keyDown['ArrowRight'];
    const up    = keyDown['w'] || keyDown['W'] || keyDown['ArrowUp'];
    const down  = keyDown['s'] || keyDown['S'] || keyDown['ArrowDown'];
    const vx = (left ? -speed : 0) + (right ? speed : 0);
    const vy = (up ? -speed : 0) + (down ? speed : 0);
    this.player.setVelocity(vx, vy);
    if (vx || vy) this.player.setTint(0xffffff); else this.player.setTint(0xd6f7ff);
    this.mobs.children.iterate((child) => {
      const mob = child as Phaser.Physics.Arcade.Sprite;
      if (!mob.active) return true;
      const dx = this.player.x - mob.x;
      const dy = this.player.y - mob.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 220) mob.setVelocity((dx / dist) * 55, (dy / dist) * 55);
      else mob.setVelocity(Math.sin(this.time.now / 500 + mob.x) * 28, Math.cos(this.time.now / 600 + mob.y) * 28);
      return true;
    });
  }

  createTextures(level: Level) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const [c0, c1, c2, c3] = level.palette;
    g.fillStyle(Phaser.Display.Color.HexStringToColor(c0).color, 1).fillRect(0, 0, tile, tile);
    g.lineStyle(2, Phaser.Display.Color.HexStringToColor(c1).color, 1).strokeRect(2, 2, tile - 4, tile - 4);
    g.generateTexture('floor', tile, tile); g.clear();
    g.fillStyle(Phaser.Display.Color.HexStringToColor(c1).color, 1).fillRect(0, 0, tile, tile);
    g.fillStyle(0x000000, .22).fillRect(6, 6, tile - 12, tile - 12);
    g.generateTexture('wall', tile, tile); g.clear();
    g.fillStyle(0x73fbd3, 1).fillCircle(18, 18, 16); g.fillStyle(0xffcf70, 1).fillRect(16, 4, 6, 30);
    g.generateTexture('hero', 36, 36); g.clear();
    g.fillStyle(Phaser.Display.Color.HexStringToColor(c2).color, 1).fillCircle(18, 18, 16); g.fillStyle(0x05040a, 1).fillCircle(12, 14, 3).fillCircle(24, 14, 3);
    g.generateTexture('npc', 36, 36); g.clear();
    // regular enemy: red circle with horns
    g.fillStyle(0xff4d6d, 1).fillCircle(18, 18, 17); g.fillStyle(0x3b0b1c, 1).fillTriangle(6, 10, 18, 1, 30, 10);
    g.generateTexture('enemy', 38, 38); g.clear();
    // boss: large purple with crown spikes
    g.fillStyle(0xc77dff, 1).fillCircle(24, 24, 22); g.fillStyle(0xffffff, .9).fillTriangle(4,14,12,1,20,14).fillTriangle(14,14,24,1,34,14).fillTriangle(28,14,38,1,46,14); g.fillStyle(0x1d0033, 1).fillCircle(16,20,4).fillCircle(32,20,4);
    g.generateTexture('boss', 48, 48); g.clear();
    g.fillStyle(0xffcf70, 1).fillCircle(18, 18, 12); g.lineStyle(3, 0xffffff, 1).strokeCircle(18, 18, 16);
    g.generateTexture('item', 36, 36); g.clear();
    g.lineStyle(4, Phaser.Display.Color.HexStringToColor(c3).color, 1).strokeCircle(24, 24, 18); g.lineStyle(2, 0xffffff, 1).strokeCircle(24, 24, 10);
    g.generateTexture('portal', 48, 48); g.destroy();
  }

  addBackground(level: Level) {
    const [c0, c1, c2] = level.palette;
    const bgKey = `photo-bg-${level.id}`;
    if (level.backgroundDataUrl && this.textures.exists(bgKey)) {
      // photo at reduced opacity so sprites stay readable
      this.add.image(cols * tile / 2, rows * tile / 2, bgKey)
        .setDisplaySize(cols * tile, rows * tile)
        .setAlpha(.55);
      // colour tint wash from palette
      this.add.rectangle(cols * tile / 2, rows * tile / 2, cols * tile, rows * tile,
        Phaser.Display.Color.HexStringToColor(c0).color, .52);
      // horizontal scanline overlay for pixel-art feel
      for (let sy = 0; sy < rows * tile; sy += 4) {
        this.add.rectangle(cols * tile / 2, sy + 1, cols * tile, 2, 0x000000, .12);
      }
      // floor tiles at low alpha so walls are still distinct
      for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
        this.add.image(tx * tile + tile / 2, ty * tile + tile / 2, 'floor').setAlpha(0.18);
      }
    } else {
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        this.add.image(x * tile + tile / 2, y * tile + tile / 2, 'floor').setAlpha(0.86);
        if ((x + y) % 5 === 0) this.add.rectangle(x * tile + 24, y * tile + 24, 8, 8, Phaser.Display.Color.HexStringToColor(c2).color, .22);
      }
    }
    this.add.text(16, 548, `${level.theme.toUpperCase()}${level.photoName ? ' · PHOTO: ' + level.photoName : ''}`, { fontFamily: 'monospace', color: c1, fontSize: '14px' }).setAlpha(.72);
    this.add.rectangle(384, 288, 760, 560, Phaser.Display.Color.HexStringToColor(c0).color, .18).setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(c1).color, .4);
  }

  spawnEntity(marker: string, x: number, y: number) {
    const e = this.markerEntities.get(marker)!;
    const isBoss = e.type === 'boss';
    const texture = e.type === 'item' ? 'item' : e.type === 'npc' ? 'npc' : isBoss ? 'boss' : 'enemy';
    const group = e.type === 'item' ? this.items : e.type === 'npc' ? undefined : this.mobs;
    const sprite = group ? group.create(x, y, texture) as Phaser.Physics.Arcade.Sprite : this.physics.add.sprite(x, y, texture);
    if (isBoss) sprite.setScale(1.45);
    sprite.setData('entity', e).setData('hp', e.hp ?? 1).setDepth(isBoss ? 15 : 10);
    if (e.type === 'npc') {
      sprite.setImmovable(true); this.physics.add.collider(sprite, this.blockers); this.physics.add.overlap(this.player, sprite, () => this.speak(e));
    }
    // name label — centred under sprite, semi-opaque pill
    this.add.text(x, y + (isBoss ? 38 : 28), isBoss ? `★ ${e.name}` : e.name.split(' ')[0], {
      fontSize: isBoss ? '11px' : '10px', color: isBoss ? '#c77dff' : '#f8f4dc',
      backgroundColor: '#000c', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 0).setDepth(30);
    this.tweens.add({ targets: sprite, y: y - 5, yoyo: true, repeat: -1, duration: 900 + x });
  }

  speak(e: Entity) { setDialogue(e.name, (e.dialogue ?? ['…'])[0]); }
  collect(item: Phaser.Physics.Arcade.Sprite) {
    const e = item.getData('entity') as Entity;
    this.collected.add(e.quest_ref ?? e.marker);
    item.destroy();
    setDialogue('LOOT', `${e.name} collected! ${e.dialogue?.[0] ?? ''}`);
    collectedItems.push(e.name.includes('Shard') ? '💎' : e.name.includes('Rune') ? '📖' : e.name.includes('Key') ? '🔑' : '⭐');
    updateInventory();
  }
  hitMob(mob: Phaser.Physics.Arcade.Sprite) {
    const e = mob.getData('entity') as Entity;
    if (this.time.now - (mob.getData('lastHit') ?? 0) < 650) return;
    mob.setData('lastHit', this.time.now);
    mob.setData('hp', (mob.getData('hp') ?? 1) - 1);
    this.cameras.main.shake(110, .008);
    if ((mob.getData('hp') ?? 0) <= 0) {
      mob.destroy();
      setDialogue('VICTORY', `${e.name} defeated!`);
    } else {
      this.hp--;
      healthText.textContent = `❤ HP ${this.hp}`;
      setDialogue(e.name, e.dialogue?.[0] ?? 'You shall not pass!');
      if (this.hp <= 0) this.scene.restart();
    }
  }
  tryPortal() {
    const remainingBoss = this.mobs.children.entries.some((m) => (m as Phaser.Physics.Arcade.Sprite).active && ((m as Phaser.Physics.Arcade.Sprite).getData('entity') as Entity)?.type === 'boss');
    if (remainingBoss) { setDialogue('PORTAL', 'The boss still anchors this realm — defeat it first!'); return; }
    if (currentLevelIndex < activeCampaign.levels.length - 1) {
      currentLevelIndex++;
      setDialogue('PORTAL', 'Gateway unlocked — entering next photo-realm…');
      this.scene.restart();
    } else {
      setDialogue('VICTORY', activeCampaign.victory);
      questText.textContent = '🏆 Campaign complete!';
      this.physics.pause();
      this.player.setTint(0xffcf70);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  GAME LIFECYCLE
// ═══════════════════════════════════════════════════════════════
function restartGame() {
  // Fully destroy previous game including physics world
  if (game) {
    try {
      // Stop the scene first to prevent physics stepping on dead bodies
      game.scene.scenes.forEach(s => { try { s.scene.stop(); } catch {} });
      game.destroy(true);
    } catch {}
    game = null;
  }
  const gameEl = document.getElementById('game');
  if (gameEl) gameEl.innerHTML = '';
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: cols * tile,
    height: rows * tile,
    pixelArt: true,
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: RpgScene,
  });
  (window as any)._phaserGame = game;
  setTimeout(() => {
    const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('#game canvas'));
    canvases.slice(0, -1).forEach((canvas) => canvas.remove());
    const last = canvases[canvases.length - 1];
    if (last) { last.setAttribute('tabindex', '0'); last.focus(); }
  }, 120);
}

function loadCampaign(campaign: Campaign) {
  activeCampaign = campaign;
  currentLevelIndex = 0;
  collectedItems = [];
  updateInventory();
  pipelineDone();
  updatePanel(campaign);
  restartGame();
  showToast('Campaign loaded!', 'success');
}

// ═══════════════════════════════════════════════════════════════
//  EVENT WIRING
// ═══════════════════════════════════════════════════════════════
generateBtn.onclick = async () => {
  generateBtn.disabled = true;
  generateBtn.textContent = 'GENERATING CAMPAIGN...';
  setDialogue('PIPELINE', 'Sending photos to backend campaign generator...');
  sfx.click();
  // Animate pipeline steps
  for (let i = 0; i < pipelineSteps.length; i++) {
    pipelineSetActive(i);
    await new Promise(r => setTimeout(r, 400));
  }
  try {
    const campaign = await requestBackendCampaign(input.files);
    loadCampaign(attachPhotos(campaign));
    setDialogue('BACKEND', 'Campaign generated from uploaded photos.');
  } catch (err) {
    console.warn('Backend unavailable, using local fallback', err);
    loadCampaign(attachPhotos(campaignFromFiles(input.files)));
    setDialogue('FALLBACK', 'Backend unavailable — using local instant generator.');
    showToast('Using offline fallback', 'warning');
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '✨ GENERATE MY CAMPAIGN';
  }
};
demoBtn.onclick = () => { uploadedPhotos = []; loadCampaign(demoCampaign); sfx.click(); };
input.onchange = async () => {
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith('image/')).slice(0, 3);
  uploadedPhotos = await Promise.all(files.map(async (file) => ({ name: file.name, dataUrl: await fileToDataUrl(file) })));
  const n = uploadedPhotos.length;
  uploadHint.textContent = `${n} photo${n !== 1 ? 's' : ''} ready — click Generate Campaign`;
  setDialogue('UPLOAD', `${n} photo${n !== 1 ? 's' : ''} queued. Click ✨ Generate My Campaign to build your world.`);
  showToast(`${n} photo${n !== 1 ? 's' : ''} uploaded`, 'info');
};

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
updatePanel(demoCampaign);
updateInventory();
restartGame();
initHpWatcher();
initDpad();
// Click game canvas to ensure keyboard focus
document.getElementById('game')?.addEventListener('click', () => {
  const c = document.querySelector<HTMLCanvasElement>('#game canvas');
  if (c) c.focus();
});
// initial welcome after short delay
setTimeout(() => setDialogue('SYSTEM', 'WASD / arrows to move · bump enemies to fight · collect glowing items · reach the portal to advance'), 400);
setTimeout(() => showToast('Welcome to CameraQuest!', 'info'), 800);
