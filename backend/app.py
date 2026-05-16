from __future__ import annotations

import hashlib
import json
import os
import random
import re
import traceback
import urllib.request
import urllib.error
from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# ── Gemini setup ──────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

def _gemini_generate(prompt: str) -> str | None:
    """Call Gemini via REST API (no SDK needed) and return text or None."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 1.2,
            "responseMimeType": "application/json",
        },
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        print(f"[Gemini] Calling {GEMINI_MODEL}...")
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read())
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        print(f"[Gemini] Got response: {len(text)} chars")
        return text
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        print(f"[Gemini error] HTTP {e.code}: {err_body}")
        return None
    except Exception as e:
        print(f"[Gemini error] {type(e).__name__}: {e}")
        traceback.print_exc()
        return None

# ── App ────────────────────────────────────────────────────────
app = FastAPI(title="CameraQuest MVP API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Deterministic fallback data ────────────────────────────────
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

CAMPAIGN_JSON_SCHEMA = """{
  "title": "string - creative campaign name",
  "premise": "string - 1-2 sentence story premise",
  "victory": "string - victory message when player wins",
  "levels": [
    {
      "id": "string like level-1",
      "name": "string - creative level name",
      "theme": "string - descriptive theme",
      "summary": "string - what this level looks like",
      "quest": "string - the player's objective",
      "grid": ["16-char strings, exactly 12 rows. '#' = wall, 'P' = spawn, 'E' = exit portal, '.' = floor, '1'/'A'/'B' = entity markers"],
      "palette": ["#dark_bg", "#wall_accent", "#secondary", "#highlight"],
      "entities": [
        {"marker": "1", "type": "item|enemy|npc|boss|hazard", "name": "creative name", "sprite_id": "any", "hp": 1-3, "dialogue": ["line1"], "quest_ref": "optional"}
      ]
    }
  ]
}"""


def clean_name(filename: str) -> str:
    stem = re.sub(r"\.[^.]+$", "", filename or "photo")
    stem = re.sub(r"[_-]+", " ", stem).strip() or "photo"
    return stem[:28].title()


def pick_palette(data: bytes, idx: int) -> list[str]:
    if not data:
        return PALETTES[idx % len(PALETTES)]
    digest = hashlib.sha256(data[:16384]).digest()
    base = [f"#{digest[i]:02x}{digest[i+1]:02x}{digest[i+2]:02x}" for i in range(0, 12, 3)]
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


def make_fallback_campaign(level_inputs: list[tuple[str, bytes]]) -> dict[str, Any]:
    levels = [make_level(name, data, idx, len(level_inputs)) for idx, (name, data) in enumerate(level_inputs)]
    title_seed = clean_name(level_inputs[0][0])
    return {
        "title": f"CameraQuest: {title_seed} Campaign",
        "premise": "Uploaded photos are converted into a connected top-down pixel RPG campaign.",
        "victory": "You stabilized the photo realms and escaped the camera roll.",
        "levels": levels,
    }


# ── Endpoints ──────────────────────────────────────────────────

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

    # Build prompt with photo filenames
    filenames = [name for name, _ in level_inputs]
    prompt = f"""You are a creative RPG designer. Generate a fun pixel-art RPG campaign for a game called CameraQuest.

The player uploads real-world photos which become dungeon levels. Each photo transforms into a themed RPG room.

Uploaded photos: {json.dumps(filenames)}
Number of levels: {len(filenames)}

IMPORTANT RULES:
- The last level MUST have exactly one entity with type "boss" (hp: 3)
- Other levels should have a mix of: 1 "item", 1 "enemy" (hp: 1-2), and optionally 1 "npc"
- Each grid must be exactly 12 rows of exactly 16 characters each
- Grid chars: '#' = wall, 'P' = player spawn (once per grid), 'E' = exit portal (once per grid), '.' = floor, '1'/'A'/'B'/'C' = entity markers
- Entity markers in the grid must match the "marker" field in entities
- Palettes: 4 hex colors starting with a dark background color
- Make creative names themed around the photo filenames turning into fantasy RPG locations
- Each level should have 2-4 entities
- Be creative and fun with names, themes, quest text, and dialogue

Return ONLY valid JSON matching this schema:
{CAMPAIGN_JSON_SCHEMA}"""

    result = _gemini_generate(prompt)
    if result:
        try:
            campaign = json.loads(result)
            # Validate basic structure
            if "levels" in campaign and len(campaign["levels"]) > 0:
                # Fix grids if needed (ensure 12 rows of 16 chars)
                for level in campaign["levels"]:
                    grid = level.get("grid", [])
                    fixed = []
                    for row in grid[:12]:
                        r = str(row).ljust(16, ".")[:16]
                        fixed.append(r)
                    while len(fixed) < 12:
                        fixed.append("#" + "." * 14 + "#")
                    level["grid"] = fixed
                    # Ensure entities have required fields
                    for ent in level.get("entities", []):
                        ent.setdefault("hp", 1)
                        ent.setdefault("dialogue", ["..."])
                        ent.setdefault("sprite_id", "default")
                    level.setdefault("palette", PALETTES[len(fixed) % len(PALETTES)])
                campaign.setdefault("title", "CameraQuest: AI Campaign")
                campaign.setdefault("premise", "An AI-generated RPG campaign from your photos.")
                campaign.setdefault("victory", "You conquered the photo realms!")
                print(f"[Gemini] Generated campaign: {campaign.get('title')}")
                return campaign
        except json.JSONDecodeError as e:
            print(f"[Gemini] JSON parse error: {e}")

    # Fallback to deterministic
    print("[Gemini] Using deterministic fallback")
    return make_fallback_campaign(level_inputs)
