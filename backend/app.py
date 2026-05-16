from __future__ import annotations

import hashlib
import re
from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CameraQuest MVP API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_GRID = [
    "################",
    "#P.............#",
    "#..............#",
    "#....1.........#",
    "#..............#",
    "#.........A....#",
    "#..............#",
    "#......B.......#",
    "#..............#",
    "#...........E..#",
    "#..............#",
    "################",
]
PALETTES = [
    ["#2b1640", "#5b2a86", "#ffcf70", "#73fbd3"],
    ["#101820", "#1f7a8c", "#bfdbf7", "#fcca46"],
    ["#132a13", "#31572c", "#90a955", "#ecf39e"],
    ["#1b263b", "#415a77", "#e0e1dd", "#ffb703"],
    ["#2f0f1f", "#7d1d3f", "#f9a03f", "#00f5d4"],
]
THEMES = ["bedroom village", "desk dungeon", "kitchen ruins", "backyard wilds", "garage forge"]


def clean_name(filename: str) -> str:
    stem = re.sub(r"\.[^.]+$", "", filename or "photo")
    stem = re.sub(r"[_-]+", " ", stem).strip() or "photo"
    return stem[:28].title()


def pick_palette(data: bytes, idx: int) -> list[str]:
    if not data:
        return PALETTES[idx % len(PALETTES)]
    digest = hashlib.sha256(data[:16384]).digest()
    base = [f"#{digest[i]:02x}{digest[i+1]:02x}{digest[i+2]:02x}" for i in range(0, 12, 3)]
    # Keep first color dark enough for overlays.
    return [PALETTES[idx % len(PALETTES)][0], base[1], base[2], base[3]]


def make_level(filename: str, data: bytes, idx: int, total: int) -> dict[str, Any]:
    name = clean_name(filename)
    is_boss = idx == total - 1
    suffix = "Boss Room" if is_boss else "Dungeon" if idx else "Village"
    return {
        "id": f"photo-{idx + 1}",
        "name": f"{name} {suffix}",
        "theme": THEMES[idx % len(THEMES)],
        "summary": f"Backend analyzed {name} and built a playable RPG room with loot, NPC/enemy, and an exit portal.",
        "quest": "Defeat the generated photo boss and escape." if is_boss else "Collect the generated quest item and reach the portal.",
        "grid": BASE_GRID,
        "palette": pick_palette(data, idx),
        "photoName": filename,
        "entities": [
            {"marker": "1", "type": "item", "name": f"{name} Relic", "sprite_id": "item_crystal", "quest_ref": f"relic-{idx}", "dialogue": ["A real-world object crystallized into loot."]},
            {"marker": "A", "type": "boss" if is_boss else "enemy", "name": f"{name} Guardian", "sprite_id": "boss_tripod" if is_boss else "mob_slime", "hp": 3 if is_boss else 2, "dialogue": ["Generated from your photo. It blocks the path!"]},
            {"marker": "B", "type": "npc", "name": f"{name} Guide", "sprite_id": "npc_lamp", "dialogue": ["This room came from your camera roll.", "Grab the relic, then use the portal."]},
        ],
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true"}


@app.post("/api/generate-campaign")
async def generate_campaign(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    selected = files[:5] or []
    level_inputs: list[tuple[str, bytes]] = []
    for file in selected:
        level_inputs.append((file.filename or "photo.png", await file.read()))
    if not level_inputs:
        level_inputs = [("Demo Room.png", b"demo")]
    level_inputs = level_inputs[:3]
    levels = [make_level(name, data, idx, len(level_inputs)) for idx, (name, data) in enumerate(level_inputs)]
    title_seed = clean_name(level_inputs[0][0])
    return {
        "title": f"CameraQuest: {title_seed} Campaign",
        "premise": "Uploaded photos are converted into a connected top-down pixel RPG campaign.",
        "victory": "You stabilized the photo realms and escaped the camera roll.",
        "levels": levels,
    }
