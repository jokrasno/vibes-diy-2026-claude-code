import Phaser from "phaser";
import type { Campaign, CampaignEntity, CampaignLevel } from "../types";

const TILE = 48;
const GRID_W = 16;
const GRID_H = 12;
const WIDTH = GRID_W * TILE;
const HEIGHT = GRID_H * TILE;

type HudHooks = {
  onLevelChange?: (level: CampaignLevel, index: number) => void;
  onStats?: (stats: { hp: number; inventory: string[]; message: string }) => void;
  onVictory?: () => void;
};

export class PhotoRpgScene extends Phaser.Scene {
  private campaign: Campaign;
  private hooks: HudHooks;
  private levelIndex = 0;
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private entities: Array<{ data: CampaignEntity; sprite: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text }> = [];
  private hp = 5;
  private inventory: string[] = [];
  private message = "WASD/Arrows to move. Bump objects to interact.";
  private bossHits = 0;
  private interactCooldown = 0;

  constructor(campaign: Campaign, hooks: HudHooks = {}) {
    super("PhotoRpgScene");
    this.campaign = campaign;
    this.hooks = hooks;
  }

  preload() {
    this.campaign.levels.forEach((level) => {
      if (level.backgroundDataUrl) this.load.image(`bg-${level.id}`, level.backgroundDataUrl);
    });
  }

  create() {
    this.cameras.main.setBackgroundColor("#080b18");
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.loadLevel(0);
  }

  update(_time: number, delta: number) {
    this.interactCooldown = Math.max(0, this.interactCooldown - delta);
    const speed = 185;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;
    const len = Math.hypot(vx, vy) || 1;
    this.player.x = Phaser.Math.Clamp(this.player.x + (vx / len) * speed * (delta / 1000), TILE * 1.5, WIDTH - TILE * 1.5);
    this.player.y = Phaser.Math.Clamp(this.player.y + (vy / len) * speed * (delta / 1000), TILE * 1.5, HEIGHT - TILE * 1.5);

    for (const ent of this.entities) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, ent.sprite.x, ent.sprite.y) < 34) {
        this.interact(ent.data, ent.sprite, ent.label);
      }
    }

    const level = this.currentLevel();
    const exitX = level.exit.x * TILE + TILE / 2;
    const exitY = level.exit.y * TILE + TILE / 2;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, exitX, exitY) < 38) this.tryExit(level);
  }

  private loadLevel(index: number) {
    this.levelIndex = index;
    this.bossHits = 0;
    this.children.removeAll();
    const level = this.currentLevel();
    this.drawBackground(level);
    this.drawGridFrame();
    this.drawExit(level);
    this.entities = [];
    for (const entity of level.entities) this.addEntity(entity);
    this.player = this.add.rectangle(level.playerStart.x * TILE + TILE / 2, level.playerStart.y * TILE + TILE / 2, 28, 34, 0x38bdf8).setStrokeStyle(3, 0xe0f2fe);
    this.add.text(this.player.x - 12, this.player.y - 34, "YOU", { fontFamily: "monospace", fontSize: "10px", color: "#e0f2fe" });
    this.message = level.objective;
    this.emitHud();
    this.hooks.onLevelChange?.(level, index);
  }

  private drawBackground(level: CampaignLevel) {
    const key = `bg-${level.id}`;
    if (level.backgroundDataUrl && this.textures.exists(key)) {
      this.add.image(WIDTH / 2, HEIGHT / 2, key).setDisplaySize(WIDTH, HEIGHT).setAlpha(0.72);
      this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x050816, 0.25);
    } else {
      const colors = [0x24133f, 0x123047, 0x3d1f16];
      this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, colors[this.levelIndex] ?? 0x111827);
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if ((x + y + this.levelIndex) % 2 === 0) this.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE, 0xffffff, 0.035);
        }
      }
    }
    this.add.rectangle(WIDTH / 2, 23, WIDTH, 46, 0x020617, 0.75);
    this.add.text(18, 10, `${level.title} — ${level.subtitle}`, { fontFamily: "monospace", fontSize: "18px", color: "#fef3c7" });
  }

  private drawGridFrame() {
    const g = this.add.graphics();
    g.lineStyle(2, 0xffffff, 0.08);
    for (let x = 1; x < GRID_W; x++) g.lineBetween(x * TILE, TILE, x * TILE, HEIGHT - TILE);
    for (let y = 1; y < GRID_H; y++) g.lineBetween(TILE, y * TILE, WIDTH - TILE, y * TILE);
    g.lineStyle(8, 0x0f172a, 1).strokeRect(TILE / 2, TILE / 2, WIDTH - TILE, HEIGHT - TILE);
  }

  private drawExit(level: CampaignLevel) {
    const x = level.exit.x * TILE + TILE / 2;
    const y = level.exit.y * TILE + TILE / 2;
    this.add.circle(x, y, 26, 0x8b5cf6, 0.75).setStrokeStyle(4, 0xf5d0fe);
    this.tweens.add({ targets: this.add.circle(x, y, 34, 0xc084fc, 0.15), scale: 1.25, alpha: 0.02, duration: 900, yoyo: true, repeat: -1 });
    this.add.text(x - 22, y - 6, "PORT", { fontFamily: "monospace", fontSize: "10px", color: "#fff" });
  }

  private addEntity(data: CampaignEntity) {
    const x = data.x * TILE + TILE / 2;
    const y = data.y * TILE + TILE / 2;
    const radius = data.kind === "boss" ? 28 : data.kind === "item" ? 18 : 22;
    const sprite = this.add.circle(x, y, radius, data.color, 0.92).setStrokeStyle(3, 0xffffff, 0.55);
    const label = this.add.text(x - 28, y + radius + 4, data.name, { fontFamily: "monospace", fontSize: "10px", color: "#f8fafc", backgroundColor: "#02061799" }).setPadding(3, 1);
    this.entities.push({ data, sprite, label });
    if (data.kind === "enemy" || data.kind === "boss") {
      this.tweens.add({ targets: sprite, y: y + 6, duration: 650, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }
  }

  private interact(entity: CampaignEntity, sprite: Phaser.GameObjects.Arc, label: Phaser.GameObjects.Text) {
    if (this.interactCooldown > 0 || entity.collected) return;
    this.interactCooldown = 650;
    if (entity.kind === "item") {
      entity.collected = true;
      this.inventory.push(entity.name);
      this.message = `${entity.name} collected. Portal lock released.`;
      sprite.destroy();
      label.destroy();
    } else if (entity.kind === "enemy") {
      this.hp = Math.max(1, this.hp - 1);
      this.message = `${entity.name} nipped you. Keep moving.`;
      this.cameras.main.shake(130, 0.006);
    } else if (entity.kind === "boss") {
      this.bossHits += 1;
      this.message = this.bossHits >= 3 ? `${entity.name} defeated. The final portal opens.` : `${entity.name} hit ${this.bossHits}/3.`;
      sprite.setFillStyle(this.bossHits >= 3 ? 0x64748b : 0xef4444, 0.9);
    } else {
      this.message = entity.dialogue.join(" ");
    }
    this.emitHud();
  }

  private tryExit(level: CampaignLevel) {
    if (this.interactCooldown > 0) return;
    const hasItem = this.inventory.length > this.levelIndex || level.entities.some((e) => e.kind === "item" && e.collected);
    const bossOk = !level.entities.some((e) => e.kind === "boss") || this.bossHits >= 3;
    if (level.exit.lockedUntil === "item" && !hasItem) {
      this.message = "Portal locked. Collect the glowing item first.";
      this.emitHud();
      this.interactCooldown = 700;
      return;
    }
    if (level.exit.lockedUntil === "boss" && !bossOk) {
      this.message = "Portal locked. Defeat the boss first.";
      this.emitHud();
      this.interactCooldown = 700;
      return;
    }
    if (level.exit.targetLevelId) {
      const next = this.campaign.levels.findIndex((l) => l.id === level.exit.targetLevelId);
      if (next >= 0) this.loadLevel(next);
    } else {
      this.message = this.campaign.victoryText;
      this.emitHud();
      this.hooks.onVictory?.();
    }
    this.interactCooldown = 900;
  }

  private currentLevel() {
    return this.campaign.levels[this.levelIndex];
  }

  private emitHud() {
    this.hooks.onStats?.({ hp: this.hp, inventory: [...this.inventory], message: this.message });
  }
}

export const GAME_SIZE = { width: WIDTH, height: HEIGHT };
