import type { Campaign, CampaignLevel } from "../types";

const grid = [
  "################",
  "#P.............#",
  "#..............#",
  "#....1.........#",
  "#..............#",
  "#..............#",
  "#........2.....#",
  "#..............#",
  "#...3..........#",
  "#..............#",
  "#............E.#",
  "################",
];

const palette = [0xf8c537, 0x6ee7f9, 0xff6b9a, 0xa3e635, 0xc084fc];

export function makeFallbackCampaign(photoNames: string[] = []): Campaign {
  const names = photoNames.length ? photoNames : ["Bedroom Village", "Desk Dungeon", "Kitchen Cavern"];
  const levelTitles = names.slice(0, 3);
  while (levelTitles.length < 3) levelTitles.push(["Bedroom Village", "Desk Dungeon", "Kitchen Cavern"][levelTitles.length]);

  const levels: CampaignLevel[] = levelTitles.map((raw, i) => {
    const title = titleFromFilename(raw, i);
    const isBoss = i === 2;
    return {
      id: `level-${i + 1}`,
      title,
      subtitle: ["The Ordinary Room Awakens", "Objects With Bad Intentions", "Boss Room: The Real World Bites Back"][i],
      theme: ["warm bedroom village", "neon desk dungeon", "kitchen cavern arena"][i],
      objective: isBoss ? "Defeat the household boss, then reach the portal." : "Collect the glowing keepsake, talk to the guide, and reach the portal.",
      photoName: raw,
      grid,
      playerStart: { x: 1, y: 1 },
      exit: { x: 13, y: 10, targetLevelId: i < 2 ? `level-${i + 2}` : null, lockedUntil: isBoss ? "boss" : "item" },
      entities: [
        {
          id: "guide",
          marker: "1",
          kind: "npc",
          name: ["Pixel Roommate", "Laptop Oracle", "Kitchen Sage"][i],
          x: 5,
          y: 3,
          color: palette[(i + 1) % palette.length],
          dialogue: [
            `Welcome to ${title}. Your photo has become a dungeon room.`,
            isBoss ? "The boss is guarding the last portal." : "Grab the keepsake, avoid the weird object-monsters, then take the portal.",
          ],
        },
        {
          id: isBoss ? "boss" : "item",
          marker: "2",
          kind: isBoss ? "boss" : "item",
          name: isBoss ? "Appliance Dragon" : ["Notebook Relic", "Coffee Crystal", "Silver Spoon Key"][i],
          x: 9,
          y: 6,
          color: isBoss ? 0xef4444 : 0x22c55e,
          dialogue: [isBoss ? "Bump me three times to break the curse." : "Collected. The portal hums louder."],
        },
        {
          id: "enemy",
          marker: "3",
          kind: "enemy",
          name: ["Laundry Slime", "Cable Serpent", "Toaster Imp"][i],
          x: 4,
          y: 8,
          color: 0xff6b6b,
          dialogue: ["Ouch. Real-world clutter fights back."],
        },
      ],
    };
  });

  return {
    title: "RealityRPG: Pocket Quest",
    premise: "Upload real photos. Each one becomes a connected pixel-art dungeon room with NPCs, enemies, quest items, and portals.",
    victoryText: "Campaign complete. Your ordinary world is now an RPG map.",
    levels,
  };
}

function titleFromFilename(name: string, index: number): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!stem) return ["Bedroom Village", "Desk Dungeon", "Kitchen Cavern"][index] ?? `Photo Level ${index + 1}`;
  return stem.replace(/\b\w/g, (m) => m.toUpperCase());
}
