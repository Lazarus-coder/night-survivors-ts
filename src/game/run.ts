// A single run: stats, collisions, spawn director, level-up economy and rendering.
import { Camera, RNG, SpatialHash, TAU, clamp, dist2, mulberry32 } from '../core/engine';
import { bar, draw, text } from '../core/render';
import { audio } from '../core/audio';
import { EVENTS, PASSIVES, RUN_LENGTH, WAVES, WEAPONS, xpToNext } from '../data/gameData';
import type { CharacterDef, MutableStats } from '../data/gameData';
import { frame } from '../data/sprites';
import { Enemies, FloatTexts, LootManager, Particles, Projectiles } from './entities';
import type { Enemy, Loot } from './entities';
import { makeWeapon, tickWeapon, weaponDef } from './weapons';
import type { WeaponCtx, WeaponInstance } from './weapons';
import { World } from './world';
import type { SaveData } from './meta';
import { metaLevel } from './meta';

export interface Choice {
  key: string;
  kind: 'weapon' | 'weaponUp' | 'passive' | 'passiveUp' | 'evolve' | 'heal' | 'gold';
  id: string;
  name: string;
  label: string;
  desc: string;
  sprite: string;
  level: number;
  max: number;
  tint?: string;
}

export interface HudState {
  hp: number; maxHp: number;
  xp: number; xpNext: number; level: number;
  time: number; kills: number; gold: number;
  weapons: { id: string; name: string; level: number; evolved: boolean; sprite: string }[];
  enemies: number; fps: number; bossName?: string; bossPct?: number;
}

export interface RunSummary {
  victory: boolean; time: number; level: number; kills: number; gold: number;
  weapons: string[]; character: string;
}

export interface RunHooks {
  onLevelUp: (choices: Choice[]) => void;
  onChest: (choices: Choice[]) => void;
  onEnd: (s: RunSummary) => void;
}

const BASE: MutableStats = {
  maxHp: 100, armor: 0, might: 1, area: 1, cooldown: 1, speed: 78,
  duration: 1, magnet: 56, growth: 1, luck: 1, projSpeed: 1, regen: 0, revive: 0, wealth: 1,
};

const GEM_TIERS: { min: number; tint: string }[] = [
  { min: 12, tint: '#f06bd0' },
  { min: 5, tint: '#f5a342' },
  { min: 2, tint: '#58c6ea' },
  { min: 0, tint: '#7ee08a' },
];

export class Run {
  readonly camera = new Camera();
  readonly world = new World();
  readonly enemies = new Enemies();
  readonly proj = new Projectiles();
  readonly loot = new LootManager();
  readonly parts = new Particles();
  readonly texts = new FloatTexts();
  private hash = new SpatialHash<Enemy>(44);
  private buf: Enemy[] = [];
  private sortBuf: Enemy[] = [];
  private rng = mulberry32(1);
  private waveTimers = WAVES.map(() => 0);
  private eventIdx = 0;

  x = 0; y = 0;
  hp = 100;
  facing = { x: 1, y: 0 };
  level = 1; xp = 0; xpNext = xpToNext(1);
  time = 0; kills = 0; gold = 0;
  stats: MutableStats;
  weapons: WeaponInstance[] = [];
  passives: Record<string, number> = {};
  invuln = 0; hitFlash = 0; anim = 0; moving = false; private stepCd = 0;
  pendingLevels = 0; pendingChests = 0;
  paused = false; over = false; victory = false;
  dying = false;
  private dyingT = 0;
  fps = 60;
  private reaperAt = RUN_LENGTH - 25;
  revivesLeft = 0;
  private bossBar: Enemy | null = null;

  readonly seed: number;
  char: CharacterDef;
  save: SaveData;
  private hooks: RunHooks;

  constructor(char: CharacterDef, save: SaveData, hooks: RunHooks, seed = (Date.now() & 0xffffff) || 1) {
    this.char = char; this.save = save; this.hooks = hooks;
    this.seed = seed;
    this.rng = mulberry32(seed);
    RNG.next = this.rng;
    this.stats = this.computeStats();
    this.hp = this.stats.maxHp;
    this.revivesLeft = this.stats.revive;
    this.weapons.push(makeWeapon(char.weapon));
    this.camera.x = 0; this.camera.y = 0;
  }

  computeStats(): MutableStats {
    const s: MutableStats = { ...BASE };
    Object.assign(s, this.char.base);
    const m = this.save;
    const add = (id: string, f: (lvl: number) => void) => { const l = metaLevel(m, id); if (l) f(l); };
    add('m_might', l => { s.might += 0.05 * l; });
    add('m_hp', l => { s.maxHp *= 1 + 0.1 * l; });
    add('m_armor', l => { s.armor += l; });
    add('m_speed', l => { s.speed *= 1 + 0.04 * l; });
    add('m_regen', l => { s.regen += 0.2 * l; });
    add('m_growth', l => { s.growth += 0.06 * l; });
    add('m_magnet', l => { s.magnet *= 1 + 0.15 * l; });
    add('m_luck', l => { s.luck += 0.08 * l; });
    add('m_cooldown', l => { s.cooldown *= 1 - 0.03 * l; });
    add('m_duration', l => { s.duration += 0.06 * l; });
    add('m_revive', l => { s.revive += l; });
    add('m_wealth', l => { s.wealth += 0.1 * l; });
    for (const [id, lvl] of Object.entries(this.passives)) {
      const p = PASSIVES.find(q => q.id === id);
      if (p) p.apply(s, lvl);
    }
    s.maxHp = Math.round(s.maxHp);
    return s;
  }

  // ---------------------------------------------------------------- update
  update(dt: number, axisX: number, axisY: number) {
    if (this.paused) return;
    if (this.dying) {
      // slow-motion collapse: the run is lost, but the moment should land before the menu
      this.dyingT += dt;
      const slow = dt * 0.28;
      this.enemies.update(slow, this.x, this.y, 4000, () => {});
      this.parts.update(dt);
      this.texts.update(dt);
      this.camera.follow(this.x, this.y, this.camera.viewW, this.camera.viewH, dt);
      if (this.dyingT >= 1.35) { this.dying = false; this.settle(); }
      return;
    }
    if (this.over) return;
    this.time += dt;

    const sp = this.stats.speed;
    const len = Math.hypot(axisX, axisY);
    this.moving = len > 0.05;
    if (this.moving) {
      const nx = axisX / Math.max(len, 1), ny = axisY / Math.max(len, 1);
      this.x += nx * sp * dt;
      this.y += ny * sp * dt;
      if (len > 0.35) { this.facing.x = nx; this.facing.y = ny; }
      this.anim += dt * 10;
      this.stepCd -= dt;
      if (this.stepCd <= 0) { this.stepCd = 0.34; audio.sfx('step', { vol: 0.07, minGap: 0.1 }); }
    } else this.anim += dt * 3;

    if (this.stats.regen > 0 && this.hp < this.stats.maxHp) {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.regen * dt);
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);

    this.hash.clear();
    for (const e of this.enemies.list) this.hash.insert(e);

    this.spawnDirector(dt);

    const maxDist = Math.hypot(this.camera.viewW, this.camera.viewH) / this.camera.zoom * 1.6 + 200;
    this.enemies.update(dt, this.x, this.y, maxDist, e => this.separate(e));

    const wctx: WeaponCtx = {
      px: this.x, py: this.y, facing: this.facing, stats: this.stats,
      enemies: this.enemies, hash: this.hash, proj: this.proj, parts: this.parts,
      time: this.time, bounds: this.camera.bounds(24),
      hit: (e, d, kx, ky) => this.hitEnemy(e, d, kx, ky),
      shake: n => { this.camera.shake = Math.max(this.camera.shake, n); },
      sfx: (n, o) => audio.sfx(n, o),
    };
    for (const w of this.weapons) tickWeapon(w, dt, wctx);
    this.proj.update(dt, this.x, this.y, () => {
      const t = this.nearestShot();
      return t ? { x: t.x, y: t.y } : null;
    });

    this.collide(dt);
    this.contact(dt);
    this.loot.update(dt, this.x, this.y, this.stats.magnet, l => this.pickup(l));
    const overflow = this.loot.trim(420);
    if (overflow.length) {
      let xp = 0, gold = 0, heal = 0;
      for (const o of overflow) {
        if (o.kind === 'xp') xp += o.value;
        else if (o.kind === 'gold') gold += o.value;
        else if (o.kind === 'food') heal += o.value;
      }
      if (xp) this.addXp(xp);
      if (gold) this.gold += Math.round(gold * this.stats.wealth);
      if (heal) this.hp = Math.min(this.stats.maxHp, this.hp + heal);
    }
    this.parts.update(dt);
    this.texts.update(dt);

    this.camera.follow(this.x, this.y, this.camera.viewW, this.camera.viewH, dt);

    if (this.time >= RUN_LENGTH && !this.over) this.finish(true);
    if (this.pendingLevels > 0 && !this.paused) this.openLevelUp();
    else if (this.pendingChests > 0 && !this.paused) this.openChest();
  }

  private nearestShot(): Enemy | null {
    const near = this.hash.query(this.x, this.y, 320, this.buf);
    let best: Enemy | null = null, bd = 0;
    for (const e of near) {
      if (e.dead) continue;
      const d = dist2(e.x, e.y, this.x, this.y);
      if (!best || d < bd) { best = e; bd = d; }
    }
    return best;
  }

  private separate(e: Enemy) {
    const near = this.hash.query(e.x, e.y, e.radius * 2.2, this.buf);
    let n = 0;
    for (const o of near) {
      if (o === e || o.dead) continue;
      const dx = e.x - o.x, dy = e.y - o.y;
      const rr = e.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < rr * rr) {
        const d = Math.sqrt(d2);
        const push = ((rr - d) / d) * 6;
        e.x += dx * push * 0.02; e.y += dy * push * 0.02;
        if (++n > 6) break;
      }
    }
  }

  // ---------------------------------------------------------------- combat
  private collide(dt: number) {
    for (const p of this.proj.list) {
      const periodic = p.tick > 0;
      if (periodic) {
        p.acc -= dt;
        if (p.acc > 0) continue;
      }
      let hitAny = false;
      const near = this.hash.query(p.x, p.y, p.radius + 14, this.buf);
      for (const e of near) {
        if (e.dead) continue;
        const rr = p.radius + e.radius;
        if (dist2(e.x, e.y, p.x, p.y) > rr * rr) continue;
        if (periodic) {
          hitAny = true;
          this.hitEnemy(e, p.dmg, (e.x - p.x) * (p.repel || 3), (e.y - p.y) * (p.repel || 3));
        } else {
          if (this.proj.hasHit(p, e.id)) continue;
          this.proj.markHit(p, e.id);
          this.hitEnemy(e, p.dmg, p.vx * 0.05, p.vy * 0.05);
          p.pierce--;
          if (p.pierce < 0) break;
        }
      }
      // only start the cooldown once the effect actually connects, otherwise a fast
      // orbiting body can pass an enemy entirely between two ticks and waste the hit
      if (periodic) p.acc = hitAny ? p.tick : 0;
    }
  }

  hitEnemy(e: Enemy, dmg: number, kx: number, ky: number) {
    if (e.dead) return;
    const crit = this.rng() < 0.06 * this.stats.luck;
    const total = dmg * (crit ? 1.7 : 1);
    e.hp -= total;
    e.flash = 0.08;
    audio.sfx('hit_flesh', { vol: 0.06, rate: 0.9 + this.rng() * 0.35, minGap: 0.09 });
    // callers pass a rough push direction; cap it so auras cannot fling enemies across the map
    const klen = Math.hypot(kx, ky);
    const cap = 170;
    const kn = (klen > cap ? cap / klen : 1) * 0.55 / (e.def.weight ?? 1);
    e.kx += kx * kn; e.ky += ky * kn;
    this.texts.spawn(String(Math.round(total)), e.x, e.y - 8 * e.scale, crit ? '#ffd75e' : '#ffffff', crit ? 4.4 : 3.4);
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    const blood = e.def.boss ? 26 : e.elite ? 16 : 6;
    this.parts.burst(e.x, e.y, blood, {
      sprite: 'pt_smoke_01', tint: e.def.boss ? '#ff7b5c' : '#b3372f',
      spread: e.def.boss ? 190 : 90, ttl: e.def.boss ? 0.8 : 0.42, from: 0.22 * e.scale, to: 0.02,
    });
    audio.sfx('enemy_die', { vol: e.def.boss ? 0.6 : 0.22, rate: e.def.boss ? 0.6 : 0.9 + this.rng() * 0.35, minGap: 0.04 });
    if (e.def.boss) { this.camera.shake = 1.2; this.pendingChests++; }
    else if (e.elite) this.pendingChests++;

    const tier = GEM_TIERS.find(t => e.xp >= t.min)!;
    const gems = e.xp > 18 ? 3 : e.xp > 8 ? 2 : 1;
    for (let i = 0; i < gems; i++) {
      this.loot.spawn('xp', e.x, e.y, Math.max(1, Math.round(e.xp / gems)), 'gem', tier.tint, e.xp > 8 ? 1.25 : 1);
    }
    if (this.rng() < 0.05 * this.stats.luck) this.loot.spawn('gold', e.x, e.y, e.def.gold ?? 1, 'coin');
    if (this.rng() < 0.012) this.loot.spawn('food', e.x, e.y, Math.round(this.stats.maxHp * 0.3), 'food');
  }

  private contact(dt: number) {
    const near = this.hash.query(this.x, this.y, 26, this.buf);
    let touch = false;
    for (const e of near) {
      if (e.dead) continue;
      const rr = e.radius + 7;
      if (dist2(e.x, e.y, this.x, this.y) > rr * rr) continue;
      touch = true;
      const dx = this.x - e.x, dy = this.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.kx -= (dx / d) * 14;
      e.ky -= (dy / d) * 14;
      if (e.hitCd <= 0 && this.invuln <= 0) {
        e.hitCd = 0.62;
        this.damagePlayer(Math.max(1, e.damage - this.stats.armor), e);
      }
    }
    if (touch && this.invuln <= 0 && this.rng() < dt * 2) audio.sfx('thud', { vol: 0.1, rate: 1.4 });
  }

  damagePlayer(amount: number, from?: Enemy) {
    if (this.over) return;
    this.hp -= amount;
    this.invuln = 0.9;
    this.hitFlash = 1;
    this.camera.shake = Math.max(this.camera.shake, 0.55);
    audio.sfx('hurt', { vol: 0.5, rate: 0.9 });
    if (from) this.parts.burst(this.x, this.y, 5, { sprite: 'pt_smoke_01', tint: '#e3504a', spread: 70, ttl: 0.3, from: 0.16, to: 0.02 });
    if (this.hp <= 0) {
      if (this.revivesLeft > 0) {
        this.revivesLeft--;
        this.hp = Math.round(this.stats.maxHp * 0.6);
        this.invuln = 2.4;
        this.camera.shake = 1.6;
        for (const e of this.enemies.list) if (dist2(e.x, e.y, this.x, this.y) < 220 * 220) this.hitEnemy(e, 9999, 0, 0);
        audio.sfx('evolve', { vol: 0.7 });
      } else this.finish(false);
    }
  }

  private pickup(l: Loot) {
    if (l.kind === 'xp') {
      this.addXp(l.value);
      audio.sfx('xp', { vol: 0.16, rate: 0.95 + this.rng() * 0.3, minGap: 0.03 });
    } else if (l.kind === 'gold') {
      this.gold += Math.round(l.value * this.stats.wealth);
      audio.sfx('coin', { vol: 0.22, minGap: 0.04 });
    } else if (l.kind === 'food') {
      this.hp = Math.min(this.stats.maxHp, this.hp + l.value);
      this.texts.spawn('+' + l.value, this.x, this.y - 12, '#7dff9b', 4);
      audio.sfx('heal', { vol: 0.4 });
    } else if (l.kind === 'chest') {
      this.pendingChests++;
      audio.sfx('chest', { vol: 0.6 });
    }
  }

  addXp(v: number) {
    this.xp += v * this.stats.growth;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpToNext(this.level);
      this.pendingLevels++;
    }
  }

  // ---------------------------------------------------------------- director
  private spawnDirector(dt: number) {
    // the field should fill in gradually; a flat cap makes minute two a wall for slow builds
    const cap = Math.round(80 + (this.time / RUN_LENGTH) * 240);
    const half = Math.hypot(this.camera.viewW, this.camera.viewH) / this.camera.zoom * 0.62 + 30;
    const spawnAt = (id: string, hpMul = 1, speedMul = 1, elite = false) => {
      if (this.enemies.list.length >= cap) return;
      const a = this.rng() * TAU;
      this.enemies.spawn(id, this.x + Math.cos(a) * half, this.y + Math.sin(a) * half, hpMul, speedMul, elite);
    };
    const scale = 1 + Math.max(0, this.time - 120) / 300 * 0.55;

    for (let i = 0; i < WAVES.length; i++) {
      const w = WAVES[i];
      if (this.time < w.from || (w.to !== undefined && this.time > w.to)) continue;
      this.waveTimers[i] += dt;
      while (this.waveTimers[i] >= w.every) {
        this.waveTimers[i] -= w.every;
        for (let c = 0; c < w.count; c++) spawnAt(w.enemy, (w.hpMul ?? 1) * scale, w.speedMul ?? 1);
      }
    }

    while (this.eventIdx < EVENTS.length && this.time >= EVENTS[this.eventIdx].at) {
      const ev = EVENTS[this.eventIdx++];
      if (ev.kind === 'swarm') {
        const n = ev.count ?? 20;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          this.enemies.spawn(ev.enemy ?? 'bat', this.x + Math.cos(a) * half * 1.05, this.y + Math.sin(a) * half * 1.05, scale);
        }
        audio.sfx('powerup', { vol: 0.35, rate: 0.7 });
      } else if (ev.kind === 'elite') {
        for (let i = 0; i < (ev.count ?? 1); i++) spawnAt(ev.enemy ?? 'slime', scale, 1, true);
        audio.sfx('boss', { vol: 0.4, rate: 1.2 });
      } else if (ev.kind === 'boss') {
        spawnAt(ev.enemy ?? 'golem', scale, 1);
        this.camera.shake = 1.4;
        audio.sfx('boss', { vol: 0.8, rate: 0.6 });
      } else if (ev.kind === 'chest') {
        const a = this.rng() * TAU;
        this.loot.spawn('chest', this.x + Math.cos(a) * 70, this.y + Math.sin(a) * 70, 0, 'chest');
        audio.sfx('powerup', { vol: 0.4 });
      }
    }

    if (this.time >= this.reaperAt && this.time - dt < this.reaperAt) {
      for (let i = 0; i < 2; i++) {
        const a = this.rng() * TAU;
        this.enemies.spawn('reaper', this.x + Math.cos(a) * half * 1.3, this.y + Math.sin(a) * half * 1.3, 1);
      }
      this.camera.shake = 2;
      audio.sfx('boss', { vol: 0.9, rate: 0.45 });
    }
  }

  // ---------------------------------------------------------------- choices
  private ownedWeapon(id: string) { return this.weapons.find(w => w.id === id); }

  private canEvolve(w: WeaponInstance) {
    const def = weaponDef(w.id);
    if (!def.evolve || w.evolved || w.level < def.levels.length) return false;
    return (this.passives[def.evolve.needs] ?? 0) > 0;
  }

  private rollChoices(n: number, bonus: boolean): Choice[] {
    const out: Choice[] = [];
    const seen = new Set<string>();
    const push = (c: Choice) => { if (!seen.has(c.key) && out.length < n) { seen.add(c.key); out.push(c); } };

    for (const w of this.weapons) {
      if (this.canEvolve(w)) {
        const def = weaponDef(w.id);
        push({
          key: 'evo_' + w.id, kind: 'evolve', id: w.id, name: def.evolve!.name,
          label: '武器进化', desc: def.evolve!.extra + ' · 需要 ' + def.evolve!.needsName,
          sprite: def.evolve!.sprite, level: 99, max: 99, tint: '#ffb45c',
        });
      }
    }
    if (out.length < n) {
      const ups: Choice[] = [];
      const news: Choice[] = [];
      const pups: Choice[] = [];
      const pnews: Choice[] = [];
      for (const w of this.weapons) {
        const def = weaponDef(w.id);
        if (w.level < def.levels.length) {
          ups.push({
            key: 'wup_' + w.id, kind: 'weaponUp', id: w.id, name: def.name,
            label: `等级 ${w.level} → ${w.level + 1}`, desc: def.levels[w.level].desc,
            sprite: def.sprite, level: w.level + 1, max: def.levels.length,
          });
        }
      }
      if (this.weapons.length < 6) {
        for (const def of WEAPONS) if (!this.ownedWeapon(def.id)) {
          news.push({
            key: 'w_' + def.id, kind: 'weapon', id: def.id, name: def.name,
            label: '新武器', desc: def.blurb, sprite: def.sprite, level: 1, max: def.levels.length,
          });
        }
      }
      const ownedPassives = Object.keys(this.passives).length;
      for (const p of PASSIVES) {
        const lvl = this.passives[p.id] ?? 0;
        if (lvl > 0 && lvl < p.max) {
          pups.push({ key: 'pup_' + p.id, kind: 'passiveUp', id: p.id, name: p.name, label: `等级 ${lvl} → ${lvl + 1}`, desc: p.levelText(lvl + 1), sprite: p.sprite, level: lvl + 1, max: p.max });
        } else if (lvl === 0 && ownedPassives < 6) {
          pnews.push({ key: 'p_' + p.id, kind: 'passive', id: p.id, name: p.name, label: '新道具', desc: p.blurb, sprite: p.sprite, level: 1, max: p.max });
        }
      }
      const shuffle = (arr: Choice[]) => {
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
        return arr;
      };
      const luck = this.stats.luck;
      const buckets: [Choice[], number][] = [
        [shuffle(ups), 100],
        [shuffle(pups), 88],
        [shuffle(news), (bonus ? 70 : 42) * luck * (this.weapons.length < 4 ? 1.6 : 1)],
        [shuffle(pnews), (bonus ? 58 : 34) * luck],
      ];
      const flat = buckets.filter(([a]) => a.length > 0);
      let guard = 0;
      while (out.length < n && flat.length > 0 && guard++ < 40) {
        const total = flat.reduce((s2, [a, w]) => s2 + (a.length ? w : 0), 0);
        let r = this.rng() * total;
        for (let i = 0; i < flat.length; i++) {
          const [arr, w] = flat[i];
          if (!arr.length) continue;
          if (r < w) { push(arr.pop()!); break; }
          r -= w;
        }
      }
    }
    while (out.length < n) {
      push({ key: 'heal_' + out.length, kind: 'heal', id: 'heal', name: '烤鸡', label: '回复', desc: `立即回复 ${Math.round(this.stats.maxHp * 0.35)} 点生命`, sprite: 'food', level: 0, max: 0 });
      push({ key: 'gold_' + out.length, kind: 'gold', id: 'gold', name: '钱袋', label: '金币', desc: `获得 ${40 + this.level * 6} 金币`, sprite: 'coin', level: 0, max: 0 });
    }
    return out;
  }

  private openLevelUp() {
    this.paused = true;
    audio.sfx('levelup', { vol: 0.55 });
    this.hooks.onLevelUp(this.rollChoices(4, false));
  }

  private openChest() {
    this.paused = true;
    audio.sfx('chest', { vol: 0.6 });
    this.hooks.onChest(this.rollChoices(3, true));
  }

  choose(c: Choice | null) {
    if (c) {
      if (c.kind === 'weapon') this.weapons.push(makeWeapon(c.id));
      else if (c.kind === 'weaponUp') { const w = this.ownedWeapon(c.id); if (w) w.level++; }
      else if (c.kind === 'evolve') { const w = this.ownedWeapon(c.id); if (w) { w.evolved = true; audio.sfx('evolve', { vol: 0.7 }); } }
      else if (c.kind === 'passive' || c.kind === 'passiveUp') {
        this.passives[c.id] = (this.passives[c.id] ?? 0) + 1;
        const before = this.stats.maxHp;
        this.stats = this.computeStats();
        this.hp += Math.max(0, this.stats.maxHp - before);
      } else if (c.kind === 'heal') this.hp = Math.min(this.stats.maxHp, this.hp + Math.round(this.stats.maxHp * 0.35));
      else if (c.kind === 'gold') this.gold += 40 + this.level * 6;
      audio.sfx('ui_select', { vol: 0.4 });
    } else audio.sfx('ui_move', { vol: 0.3 });

    if (this.pendingLevels > 0) this.pendingLevels--;
    else if (this.pendingChests > 0) this.pendingChests--;

    this.stats = this.computeStats();
    if (this.pendingLevels > 0) { this.openLevelUp(); return; }
    if (this.pendingChests > 0) { this.openChest(); return; }
    this.paused = false;
  }

  finish(victory: boolean) {
    if (this.over) return;
    this.over = true;
    this.victory = victory;
    if (victory) {
      audio.sfx('fanfare', { vol: 0.7 });
      this.parts.burst(this.x, this.y, 40, { sprite: 'pt_star_01', tint: '#ffe08a', spread: 220, ttl: 1.1, from: 0.3, to: 0.02 });
      this.settle();
      return;
    }
    this.dying = true;
    this.dyingT = 0;
    this.camera.shake = 1.9;
    this.parts.burst(this.x, this.y, 30, { sprite: 'pt_smoke_01', tint: '#c8392f', spread: 150, ttl: 0.9, from: 0.26, to: 0.03 });
    audio.sfx('hurt', { vol: 0.7, rate: 0.45 });
  }

  private settle() {
    const bonus = Math.round((this.time / 30 + this.level * 2) * this.stats.wealth);
    this.gold += bonus;
    this.hooks.onEnd({
      victory: this.victory, time: this.time, level: this.level, kills: this.kills, gold: this.gold,
      weapons: this.weapons.map(w => weaponDef(w.id).name + (w.evolved ? '＋' : '')),
      character: this.char.name,
    });
  }

  // ---------------------------------------------------------------- render
  render(ctx: CanvasRenderingContext2D) {
    const b = this.camera.bounds(8);
    ctx.save();
    this.camera.apply(ctx);
    this.world.render(ctx, b, this.camera.zoom, this.time);
    this.proj.renderGround(ctx, b);
    this.loot.render(ctx, b);
    this.enemies.render(ctx, this.sortBuf, b, this.x);
    this.renderPlayer(ctx);
    this.proj.render(ctx, b);
    this.parts.render(ctx, b);
    this.texts.render((s, x, y, size, color, alpha) => {
      text(ctx, s, x, y, { size, color, align: 'center', shadow: `rgba(0,0,0,${alpha})` });
      ctx.globalAlpha = 1;
    });
    ctx.restore();

    this.renderScreenFx(ctx);
  }

  private renderPlayer(ctx: CanvasRenderingContext2D) {
    const bob = this.moving ? Math.sin(this.anim) * 1.1 : Math.sin(this.anim) * 0.35;
    ctx.globalAlpha = 0.3;
    draw(ctx, 'pt_circle_01', this.x, this.y + 7, { scale: 0.14, shade: '#000' });
    ctx.globalAlpha = 1;
    const blink = this.invuln > 0 && Math.floor(this.invuln * 18) % 2 === 0;
    const spr = frame(this.char.sprite);
    if (this.dying) {
      const k = Math.min(1, this.dyingT / 1.35);
      draw(ctx, spr, this.x, this.y + 6 * k, {
        scale: 1.35 * (1 - k * 0.25), angle: k * 1.5, alpha: 1 - k * 0.85,
        flipX: this.facing.x < 0, shade: '#ff6a62',
      });
    } else if (!blink) {
      draw(ctx, spr, this.x, this.y + bob, { scale: 1.35, flipX: this.facing.x < 0, shade: this.hitFlash > 0.4 ? '#ff8f8a' : undefined });
    }
    if (this.hitFlash > 0) {
      // damage feedback lives in the sprite shade and the screen flash, not a blob over the player
      ctx.globalAlpha = this.hitFlash * 0.35;
      draw(ctx, 'pt_spark_01', this.x, this.y, { scale: 0.5, shade: '#ff5a4a', angle: this.time * 6 });
      ctx.globalAlpha = 1;
    }
  }

  private renderScreenFx(ctx: CanvasRenderingContext2D) {
    const w = this.camera.viewW, h = this.camera.viewH;
    // night mood: cool tint plus a torch-like falloff around the player
    ctx.fillStyle = 'rgba(22,28,64,0.20)';
    ctx.fillRect(0, 0, w, h);
    const g0 = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.16, w / 2, h / 2, Math.max(w, h) * 0.7);
    g0.addColorStop(0, 'rgba(4,6,14,0)');
    g0.addColorStop(0.5, 'rgba(4,6,14,0.26)');
    g0.addColorStop(1, 'rgba(3,4,10,0.74)');
    ctx.fillStyle = g0;
    ctx.fillRect(0, 0, w, h);
    const hurt = 1 - clamp(this.hp / this.stats.maxHp, 0, 1);
    if (hurt > 0.55) {
      const pulse = 0.18 + 0.1 * Math.sin(this.time * 6);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.62);
      g.addColorStop(0, 'rgba(120,0,0,0)');
      g.addColorStop(1, `rgba(150,10,10,${(hurt - 0.55) * 1.6 * (0.6 + pulse)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,60,50,${this.hitFlash * 0.14})`;
      ctx.fillRect(0, 0, w, h);
    }
    // boss / reaper bar
    this.bossBar = null;
    let bd = Infinity;
    for (const e of this.enemies.list) {
      if (!e.def.boss || e.dead) continue;
      const d = dist2(e.x, e.y, this.x, this.y);
      if (d < bd) { bd = d; this.bossBar = e; }
    }
    if (this.bossBar) {
      const bw = Math.min(520, w * 0.5);
      bar(ctx, (w - bw) / 2, 58, bw, 16, this.bossBar.hp / this.bossBar.maxHp, '#c8392f', 'rgba(8,6,12,.85)');
      text(ctx, this.bossBar.def.name, w / 2, 52, { size: 13, color: '#ffd9d5', align: 'center' });
    }
    if (this.time > RUN_LENGTH - 45 && this.time < RUN_LENGTH) {
      text(ctx, '死神降临 · 坚持到最后', w / 2, h * 0.2, { size: 20, color: '#ff6a6a', align: 'center' });
    }
  }

  hud(fps: number): HudState {
    return {
      hp: Math.max(0, Math.ceil(this.hp)), maxHp: this.stats.maxHp,
      xp: this.xp, xpNext: this.xpNext, level: this.level,
      time: this.time, kills: this.kills, gold: this.gold,
      weapons: this.weapons.map(w => {
        const def = weaponDef(w.id);
        return { id: w.id, name: def.name, level: w.level, evolved: w.evolved, sprite: w.evolved && def.evolve ? def.evolve.sprite : def.sprite };
      }),
      enemies: this.enemies.list.length, fps,
      bossName: this.bossBar?.def.name,
    };
  }

  /** Debug helper: jump the clock forward for balance testing. */
  fastForward(seconds: number) {
    this.time = Math.min(RUN_LENGTH - 1, this.time + seconds);
    for (let i = 0; i < this.weapons.length; i++) this.weapons[i].timer = 0;
  }
}
