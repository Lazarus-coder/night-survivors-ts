// Persistent player profile: currency, meta upgrades, unlocks, records.
export interface SaveData {
  gold: number;
  totalKills: number;
  bestTime: number;
  runs: number;
  wins: number;
  meta: Record<string, number>;
  unlocked: string[];
  muted: boolean;
}

const KEY = 'night-survivors.save.v1';

export const defaultSave = (): SaveData => ({
  gold: 0, totalKills: 0, bestTime: 0, runs: 0, wins: 0, meta: {}, unlocked: ['knight'], muted: false,
});

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    return { ...defaultSave(), ...JSON.parse(raw) } as SaveData;
  } catch {
    return defaultSave();
  }
}

export function writeSave(s: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage disabled */ }
}

export const metaLevel = (s: SaveData, id: string) => s.meta[id] ?? 0;

export function applyMetaCost(s: SaveData, id: string, cost: number): boolean {
  if (s.gold < cost) return false;
  s.gold -= cost;
  s.meta[id] = metaLevel(s, id) + 1;
  writeSave(s);
  return true;
}
