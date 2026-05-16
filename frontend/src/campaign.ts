import type { Campaign, Level } from './types';

const baseGrid = [
  '################',
  '#P.............#',
  '#..............#',
  '#....1.........#',
  '#..............#',
  '#.........A....#',
  '#..............#',
  '#......B.......#',
  '#..............#',
  '#...........E..#',
  '#..............#',
  '################',
];

export const demoCampaign: Campaign = {
  title: 'CameraQuest: Desk Dungeon',
  premise: 'A chain of ordinary places mutates into an RPG campaign: bedroom village, desk dungeon, and backyard boss arena.',
  victory: 'The camera crystal stabilizes reality. Your photos are now a tiny playable world.',
  levels: [
    { id: 'bedroom-village', name: 'Bedroom Village', theme: 'cozy room', summary: 'Blankets become hills, lamps become watchtowers, and a closet glows like a portal.', quest: 'Find the lost Lens Shard before using the closet portal.', grid: baseGrid, palette: ['#2b1640','#5b2a86','#ffcf70','#73fbd3'], entities: [
      { marker:'1', type:'item', name:'Lens Shard', sprite_id:'item_crystal', quest_ref:'lens', dialogue:['The shard hums with camera magic.'] },
      { marker:'A', type:'npc', name:'Lamp Sage', sprite_id:'npc_lamp', dialogue:['The room remembers every photo.', 'Collect the shard and the portal will wake.'] },
      { marker:'B', type:'enemy', name:'Laundry Slime', sprite_id:'mob_slime', hp:1, dialogue:['A sock-based lifeform attacks!'] },
    ]},
    { id: 'desk-dungeon', name: 'Desk Dungeon', theme: 'workstation dungeon', summary: 'A laptop becomes a fortress gate; cables slither like electric snakes.', quest: 'Grab the Notebook Rune and dodge the Cable Serpent.', grid: baseGrid, palette: ['#101820','#1f7a8c','#bfdbf7','#fcca46'], entities: [
      { marker:'1', type:'item', name:'Notebook Rune', sprite_id:'item_book', quest_ref:'rune', dialogue:['A TODO list transformed into a magical spell page.'] },
      { marker:'A', type:'enemy', name:'Cable Serpent', sprite_id:'mob_serpent', hp:2, dialogue:['Bzzzt! The cables do not approve of your cable management.'] },
      { marker:'B', type:'npc', name:'Mug Merchant', sprite_id:'npc_mug', dialogue:['Trade me a bug report and I will sell you courage.', 'The laptop portal leads to the final arena.'] },
    ]},
    { id: 'backyard-boss', name: 'Backyard Boss Arena', theme: 'sunset garden', summary: 'Grass tiles shimmer; patio furniture forms a final boss circle.', quest: 'Defeat the Tripod Golem and enter the exit portal.', grid: baseGrid, palette: ['#132a13','#31572c','#90a955','#ecf39e'], entities: [
      { marker:'1', type:'item', name:'Sun Key', sprite_id:'item_key', quest_ref:'sun_key', dialogue:['A warm key cut from golden hour light.'] },
      { marker:'A', type:'boss', name:'Tripod Golem', sprite_id:'boss_tripod', hp:3, dialogue:['The final guardian stomps out of the camera roll!'] },
      { marker:'B', type:'hazard', name:'Garden Thorns', sprite_id:'hazard_thorns', dialogue:['Sharp pixels block the path.'] },
    ]},
  ],
};

export function campaignFromFiles(files: FileList | null): Campaign {
  if (!files || files.length === 0) return demoCampaign;
  const names = Array.from(files).slice(0, 5).map((f) => f.name.replace(/\.[^.]+$/, ''));
  const levels: Level[] = names.slice(0, 3).map((name, idx) => ({
    ...demoCampaign.levels[idx % demoCampaign.levels.length],
    id: `photo-${idx+1}`,
    name: `${name} ${idx === 2 ? 'Boss Room' : idx === 1 ? 'Dungeon' : 'Village'}`,
    summary: `Mock AI analyzed ${name} and converted objects into RPG roles.`,
    quest: idx === 2 ? 'Defeat the generated photo boss.' : 'Collect the generated quest item and reach the portal.',
  }));
  return { ...demoCampaign, title: `CameraQuest: ${names[0] || 'Photo'} Campaign`, levels };
}
