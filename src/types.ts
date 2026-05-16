export type EntityKind = "npc" | "enemy" | "item" | "boss" | "portal";

export interface CampaignEntity {
  id: string;
  marker: string;
  kind: EntityKind;
  name: string;
  x: number;
  y: number;
  color: number;
  dialogue: string[];
  collected?: boolean;
}

export interface CampaignLevel {
  id: string;
  title: string;
  subtitle: string;
  theme: string;
  objective: string;
  backgroundDataUrl?: string;
  photoName?: string;
  grid: string[];
  entities: CampaignEntity[];
  exit: { x: number; y: number; targetLevelId?: string | null; lockedUntil?: string | null };
  playerStart: { x: number; y: number };
}

export interface Campaign {
  title: string;
  premise: string;
  victoryText: string;
  levels: CampaignLevel[];
}
