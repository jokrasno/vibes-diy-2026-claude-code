export type EntityType = 'npc' | 'enemy' | 'item' | 'portal' | 'boss' | 'hazard';
export interface Entity { marker: string; type: EntityType; name: string; sprite_id: string; dialogue?: string[]; quest_ref?: string; hp?: number; }
export interface Level { id: string; name: string; theme: string; summary: string; quest: string; grid: string[]; entities: Entity[]; palette: string[]; backgroundDataUrl?: string; photoName?: string; }
export interface Campaign { title: string; premise: string; levels: Level[]; victory: string; }
