// Persistent player profile: currency, meta upgrades, unlocks, records.
import { META } from '../data/gameData';

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
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultSave();
    const data = parsed as Record<string, unknown>;
    const save = defaultSave();
    for (const key of ['gold', 'totalKills', 'bestTime', 'runs', 'wins'] as const) {
      const value = data[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) save[key] = value;
    }
    if (data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta)) {
      const levels = data.meta as Record<string, unknown>;
      for (const upgrade of META) {
        const level = levels[upgrade.id];
        if (typeof level === 'number' && Number.isInteger(level) && level >= 0 && level <= upgrade.max) {
          save.meta[upgrade.id] = level;
        }
      }
    }
    if (Array.isArray(data.unlocked)) {
      save.unlocked = [...new Set(['knight', ...data.unlocked.filter(id => typeof id === 'string')])];
    }
    if (typeof data.muted === 'boolean') save.muted = data.muted;
    return save;
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
