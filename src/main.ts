import Phaser from "phaser";
import "./styles.css";
import { makeFallbackCampaign } from "./data/fallbackCampaign";
import { GAME_SIZE, PhotoRpgScene } from "./game/PhotoRpgScene";
import type { Campaign, CampaignLevel } from "./types";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <main class="shell">
    <section class="hero-panel">
      <div class="eyebrow">RealityRPG prototype</div>
      <h1>Turn real photos into a playable pixel RPG campaign.</h1>
      <p class="subhead">Upload up to three photos. The MVP instantly wraps them in a Phaser dungeon crawler with NPCs, collectibles, enemies, portals, and a boss room.</p>
      <div class="dropzone" id="dropzone">
        <input id="photo-input" type="file" accept="image/*" multiple />
        <div>
          <strong>Drop photos here</strong>
          <span>or click to choose room / desk / kitchen shots</span>
        </div>
      </div>
      <div class="actions">
        <button id="generate-btn">Generate RPG campaign</button>
        <button id="sample-btn" class="secondary">Use sample campaign</button>
      </div>
      <div id="photo-list" class="photo-list"></div>
    </section>

    <section class="game-panel">
      <div class="topbar">
        <div>
          <span class="label">Current quest</span>
          <h2 id="level-title">Awaiting photos</h2>
        </div>
        <div class="stats"><span id="hp">HP 5</span><span id="inventory">Inventory empty</span></div>
      </div>
      <div id="game-wrap"><div id="game"></div></div>
      <div id="message" class="message">Generate a campaign, then move with WASD or arrow keys.</div>
    </section>

    <aside class="side-panel">
      <span class="label">Campaign chain</span>
      <ol id="level-list"></ol>
      <div class="demo-notes">
        <strong>MVP shipped path</strong>
        <p>Static/instant generation first. AI scene analysis can replace the mocked level JSON later without changing the game runtime.</p>
      </div>
    </aside>
  </main>
`;

const input = document.querySelector<HTMLInputElement>("#photo-input")!;
const dropzone = document.querySelector<HTMLDivElement>("#dropzone")!;
const photoList = document.querySelector<HTMLDivElement>("#photo-list")!;
const generateBtn = document.querySelector<HTMLButtonElement>("#generate-btn")!;
const sampleBtn = document.querySelector<HTMLButtonElement>("#sample-btn")!;
const levelTitle = document.querySelector<HTMLHeadingElement>("#level-title")!;
const hp = document.querySelector<HTMLSpanElement>("#hp")!;
const inventory = document.querySelector<HTMLSpanElement>("#inventory")!;
const message = document.querySelector<HTMLDivElement>("#message")!;
const levelList = document.querySelector<HTMLOListElement>("#level-list")!;

let selectedPhotos: Array<{ name: string; dataUrl: string }> = [];
let game: Phaser.Game | null = null;

input.addEventListener("change", async () => {
  selectedPhotos = await readPhotos(input.files);
  renderPhotoList();
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragging");
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
dropzone.addEventListener("drop", async (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragging");
  selectedPhotos = await readPhotos(event.dataTransfer?.files ?? null);
  renderPhotoList();
});

generateBtn.addEventListener("click", () => startCampaign(buildCampaignFromPhotos()));
sampleBtn.addEventListener("click", () => startCampaign(makeFallbackCampaign()));

function buildCampaignFromPhotos(): Campaign {
  const campaign = makeFallbackCampaign(selectedPhotos.map((p) => p.name));
  campaign.levels.forEach((level, index) => {
    const photo = selectedPhotos[index];
    if (photo) {
      level.backgroundDataUrl = photo.dataUrl;
      level.photoName = photo.name;
      level.title = photo.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
      level.subtitle = index === 2 ? "Boss room generated from your photo" : "Generated from your photo";
      level.theme = `pixel-art ${level.title}`;
    }
  });
  return campaign;
}

function startCampaign(campaign: Campaign) {
  renderLevels(campaign.levels);
  levelTitle.textContent = campaign.title;
  message.textContent = "Booting pixel campaign...";
  game?.destroy(true);
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: GAME_SIZE.width,
    height: GAME_SIZE.height,
    pixelArt: true,
    backgroundColor: "#050816",
    scene: new PhotoRpgScene(campaign, {
      onLevelChange(level, index) {
        levelTitle.textContent = `${index + 1}. ${level.title}`;
        highlightLevel(level.id);
      },
      onStats(stats) {
        hp.textContent = `HP ${stats.hp}`;
        inventory.textContent = stats.inventory.length ? `Inventory ${stats.inventory.join(", ")}` : "Inventory empty";
        message.textContent = stats.message;
      },
      onVictory() {
        document.body.classList.add("victory");
        setTimeout(() => document.body.classList.remove("victory"), 1800);
      },
    }),
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  });
}

async function readPhotos(files: FileList | null): Promise<Array<{ name: string; dataUrl: string }>> {
  const images = Array.from(files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 3);
  return Promise.all(images.map(async (file) => ({ name: file.name, dataUrl: await readDataUrl(file) })));
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderPhotoList() {
  if (!selectedPhotos.length) {
    photoList.innerHTML = `<span class="muted">No photos selected yet. Sample mode still works.</span>`;
    return;
  }
  photoList.innerHTML = selectedPhotos.map((photo, index) => `
    <div class="photo-chip">
      <img src="${photo.dataUrl}" alt="${photo.name}" />
      <span>Level ${index + 1}: ${photo.name}</span>
    </div>
  `).join("");
}

function renderLevels(levels: CampaignLevel[]) {
  levelList.innerHTML = levels.map((level, index) => `
    <li data-level-id="${level.id}">
      <strong>${index + 1}. ${level.title}</strong>
      <span>${level.objective}</span>
    </li>
  `).join("");
}

function highlightLevel(id: string) {
  levelList.querySelectorAll("li").forEach((item) => item.classList.toggle("active", item.getAttribute("data-level-id") === id));
}

renderPhotoList();
startCampaign(makeFallbackCampaign());
