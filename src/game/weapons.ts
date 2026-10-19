// Weapon behaviour: every weapon is data + one of six firing patterns.
import { RNG, TAU, clamp } from '../core/engine';
import type { SpatialHash } from '../core/engine';
import type { Enemy, Enemies, Particles, Projectiles } from './entities';
import { WEAPONS } from '../data/gameData';
import type { MutableStats, WeaponDef, WeaponLevel } from '../data/gameData';

export interface WeaponInstance {
  id: string;
  level: number;
  timer: number;
  evolved: boolean;
  phase: number;
}

export interface WeaponCtx {
  px: number; py: number;
  facing: { x: number; y: number };
  stats: MutableStats;
  enemies: Enemies;
  hash: SpatialHash<Enemy>;
  proj: Projectiles;
  parts: Particles;
  time: number;
  bounds: { x0: number; y0: number; x1: number; y1: number };
  hit: (e: Enemy, dmg: number, kx: number, ky: number) => void;
  shake: (n: number) => void;
  sfx: (name: string, opts?: { vol?: number; rate?: number; minGap?: number }) => void;
}

export interface EffectiveStats {
  damage: number; cooldown: number; amount: number; area: number;
  speed: number; pierce: number; duration: number;
}

const DEFS: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

export function weaponDef(id: string) { return DEFS[id]; }

export function levelStats(inst: WeaponInstance, s: MutableStats): EffectiveStats {
  const def = DEFS[inst.id];
  const base: WeaponLevel = def.levels[clamp(inst.level, 1, def.levels.length) - 1];
  const evo = inst.evolved ? def.evolve : undefined;
  const out: EffectiveStats = {
    damage: base.damage * (evo?.damageMul ?? 1) * s.might,
    cooldown: base.cooldown * (evo?.cooldownMul ?? 1) * s.cooldown,
    amount: (base.amount ?? 1) + (evo?.amountAdd ?? 0),
    area: (base.area ?? 1) * (evo?.areaMul ?? 1) * s.area,
    speed: (base.speed ?? 220) * s.projSpeed,
    pierce: base.pierce ?? 1,
    duration: (base.duration ?? 1) * s.duration,
  };
  return out;
}

export function weaponLevelText(inst: WeaponInstance): string {
  const def = DEFS[inst.id];
  if (inst.evolved) return '已进化 · ' + (def.evolve?.extra ?? '');
  return def.levels[clamp(inst.level, 1, def.levels.length) - 1].desc;
}

const tmp: Enemy[] = [];

function nearest(ctx: WeaponCtx, k: number, maxR = 460): Enemy[] {
  ctx.hash.query(ctx.px, ctx.py, maxR, tmp);
  const seen = new Set<Enemy>();
  const list: Enemy[] = [];
  for (const e of tmp) {
    if (seen.has(e)) continue;
    seen.add(e);
    const d = (e.x - ctx.px) ** 2 + (e.y - ctx.py) ** 2;
    if (d < maxR * maxR) list.push(e);
  }
  list.sort((a, b) => (a.x - ctx.px) ** 2 + (a.y - ctx.py) ** 2 - ((b.x - ctx.px) ** 2 + (b.y - ctx.py) ** 2));
  return list.slice(0, k);
}

function onScreen(ctx: WeaponCtx): Enemy[] {
  ctx.hash.query(ctx.px, ctx.py, Math.max(ctx.bounds.x1 - ctx.bounds.x0, ctx.bounds.y1 - ctx.bounds.y0) * 0.6, tmp);
  const seen = new Set<Enemy>();
  const out: Enemy[] = [];
  for (const e of tmp) {
    if (seen.has(e)) continue;
    seen.add(e);
    if (e.x > ctx.bounds.x0 && e.x < ctx.bounds.x1 && e.y > ctx.bounds.y0 && e.y < ctx.bounds.y1) out.push(e);
  }
  return out;
}

function aimAngle(ctx: WeaponCtx, e: Enemy) { return Math.atan2(e.y - ctx.py, e.x - ctx.px); }

export function makeWeapon(id: string): WeaponInstance {
  return { id, level: 1, timer: 0.35, evolved: false, phase: RNG.next() * TAU };
}

/** Advances one weapon's cooldown and fires when ready. */
export function tickWeapon(inst: WeaponInstance, dt: number, ctx: WeaponCtx) {
  const s = levelStats(inst, ctx.stats);
  inst.timer -= dt;
  if (inst.timer > 0) return;
  inst.timer += Math.max(0.12, s.cooldown);
  fire(inst, s, ctx);
}

function fire(inst: WeaponInstance, s: EffectiveStats, ctx: WeaponCtx) {
  const def = DEFS[inst.id];
  switch (def.kind) {
    case 'projectile': {
      const targets = nearest(ctx, s.amount);
      if (targets.length === 0) { inst.timer = Math.min(inst.timer, 0.12); return; }
      for (let i = 0; i < s.amount; i++) {
        const t = targets[i % targets.length];
        const a = aimAngle(ctx, t) + (i >= targets.length ? (RNG.next() - 0.5) * 0.5 : (RNG.next() - 0.5) * 0.08);
        ctx.proj.spawn({
          kind: 'bullet', sprite: 'pt_magic_01', tint: '#8fd6ff',
          x: ctx.px, y: ctx.py - 3,
          vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
          ttl: 1.6, dmg: s.damage, radius: 7 * s.area, pierce: s.pierce,
          homing: inst.evolved, weapon: inst.id, scale: 0.16 * s.area, spin: 4,
        });
      }
      ctx.sfx('shot', { vol: 0.35, rate: 1.2 });
      break;
    }
    case 'stream': {
      const fa = Math.atan2(ctx.facing.y, ctx.facing.x);
      for (let i = 0; i < s.amount; i++) {
        const a = fa + (i - (s.amount - 1) / 2) * 0.13;
        ctx.proj.spawn({
          kind: 'bullet', sprite: def.sprite, tint: inst.evolved ? '#ffd9a0' : undefined,
          x: ctx.px + Math.cos(a) * 8, y: ctx.py + Math.sin(a) * 8 - 2,
          vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
          ttl: 1.1, dmg: s.damage, radius: 8 * s.area, pierce: s.pierce,
          rot: a + Math.PI / 2, weapon: inst.id, scale: 0.85,
        });
      }
      ctx.sfx('shot', { vol: 0.22, rate: 1.75, minGap: 0.05 });
      break;
    }
    case 'thrown': {
      for (let i = 0; i < s.amount; i++) {
        const spread = inst.evolved ? (i / s.amount) * TAU : 0;
        const base = inst.evolved ? spread : (RNG.next() - 0.5) * 0.6;
        const dir = Math.sign(ctx.facing.x) || 1;
        ctx.proj.spawn({
          kind: 'thrown', sprite: def.sprite,
          x: ctx.px, y: ctx.py - 6,
          vx: (Math.cos(base) * 90 + dir * 120) * s.area * 0.9, vy: -230 - RNG.next() * 60,
          ttl: 2.2, dmg: s.damage, radius: 12 * s.area, pierce: s.pierce,
          grav: 300, spin: 14, weapon: inst.id, scale: 1.05,
        });
      }
      ctx.sfx('shoot_heavy', { vol: 0.3, rate: 0.85 });
      break;
    }
    case 'arc': {
      const side = (inst.phase = (inst.phase + Math.PI) % TAU) > Math.PI ? -1 : 1;
      const fa = Math.atan2(ctx.facing.y, ctx.facing.x);
      for (let i = 0; i < Math.max(1, Math.floor(s.amount / 2)); i++) {
        const off = 26 * s.area + i * 16;
        ctx.proj.spawn({
          kind: 'arc', sprite: 'pt_slash_01', tint: '#fff3c4',
          x: ctx.px + Math.cos(fa) * off * side * 0.6 + Math.cos(fa + Math.PI / 2) * off * side * 0.4,
          y: ctx.py + Math.sin(fa) * 6,
          ttl: 0.2, dmg: s.damage, radius: 30 * s.area, pierce: 999,
          rot: side > 0 ? -0.4 : Math.PI + 0.4, spin: side * 6,
          tick: 0.2, weapon: inst.id, scale: (30 * s.area) / 32, alpha: 0.95,
        });
      }
      ctx.sfx('hit', { vol: 0.25, rate: 0.7, minGap: 0.04 });
      break;
    }
    case 'aura': {
      // refresh the persistent腐化领域 ring
      for (const p of ctx.proj.list) if (p.weapon === inst.id && p.follow) p.life = 0;
      let exists = false;
      for (const p of ctx.proj.list) if (p.weapon === inst.id) exists = true;
      if (!exists) {
        ctx.proj.spawn({
          kind: 'burn', sprite: 'pt_circle_01', tint: '#6fe08a',
          x: ctx.px, y: ctx.py, ttl: 999, dmg: s.damage, radius: 42 * s.area,
          pierce: 999, tick: s.cooldown, follow: true, orbitR: 0,
          weapon: inst.id, scale: (42 * s.area) / 30, alpha: 0.5,
        });
      }
      break;
    }
    case 'orbit': {
      // cooldown is shorter than the book lifetime; without this the waves stack into a wall
      for (const p of ctx.proj.list) if (p.weapon === inst.id) p.life = p.ttl;
      for (let i = 0; i < s.amount; i++) {
        ctx.proj.spawn({
          kind: 'orbit', sprite: def.sprite, tint: inst.evolved ? '#ffd9a0' : undefined,
          x: ctx.px, y: ctx.py, ttl: s.duration, dmg: s.damage,
          radius: 12 + 7 * s.area, pierce: 999, tick: 0.15,
          follow: true, orbitR: 58 * (1 + (s.area - 1) * 0.4), orbitA: (i / s.amount) * TAU,
          spin: 2.4 + s.speed / 260, weapon: inst.id, scale: 1.25 * (1 + (s.area - 1) * 0.2),
        });
      }
      ctx.sfx('powerup', { vol: 0.22, rate: 1.3 });
      break;
    }
    case 'strike': {
      const pool = onScreen(ctx);
      const n = Math.min(s.amount, Math.max(1, pool.length));
      if (pool.length === 0) { inst.timer = Math.min(inst.timer, 0.3); return; }
      for (let i = 0; i < n; i++) {
        const t = pool[Math.floor(RNG.next() * pool.length)];
        const bx = t.x + (RNG.next() - 0.5) * 10, by = t.y;
        ctx.parts.burst(bx, by, 10, { sprite: 'pt_spark_01', tint: '#cbeaff', spread: 150, ttl: 0.35, from: 0.3, to: 0.05 });
        ctx.hash.query(bx, by, 34 * s.area, tmp);
        const done = new Set<Enemy>();
        for (const e of tmp) {
          if (done.has(e) || e.hp <= 0) continue;
          done.add(e);
          if ((e.x - bx) ** 2 + (e.y - by) ** 2 < (34 * s.area) ** 2) {
            ctx.hit(e, s.damage, (e.x - bx) * 2, (e.y - by) * 2);
          }
        }
      }
      ctx.shake(0.5);
      ctx.sfx('boss', { vol: 0.24, rate: 1.6, minGap: 0.05 });
      break;
    }
    case 'ground': {
      for (let i = 0; i < s.amount; i++) {
        const a = RNG.next() * TAU;
        const d = 60 + RNG.next() * 130;
        ctx.proj.spawn({
          kind: 'burn', sprite: 'pt_flame_01', tint: '#ff6a1a',
          x: ctx.px + Math.cos(a) * d, y: ctx.py + Math.sin(a) * d,
          ttl: s.duration, dmg: s.damage,
          pierce: 999, tick: 0.5, weapon: inst.id, radius: 30 * s.area, scale: (30 * s.area) / 26, alpha: 0.55,
        });
      }
      ctx.sfx('bottle', { vol: 0.3, rate: 1.2 });
      break;
    }
  }
}
