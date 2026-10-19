// Entity pools: enemies, projectiles, loot, particles and floating numbers.
import { RNG, TAU, dist2, hash2 } from '../core/engine';
import { draw } from '../core/render';
import { frame } from '../data/sprites';
import type { EnemyDef } from '../data/gameData';
import { ENEMY_MAP } from '../data/gameData';

export interface Bounds { x0: number; y0: number; x1: number; y1: number }

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number; y: number;
  hp: number; maxHp: number;
  radius: number; scale: number;
  speed: number; damage: number; xp: number; gold: number;
  flash: number; kx: number; ky: number;
  anim: number; alive: boolean; elite: boolean; tint?: string;
  hitCd: number; dead: boolean;
}

let enemySeq = 1;

export class Enemies {
  list: Enemy[] = [];
  private pool: Enemy[] = [];

  spawn(defId: string, x: number, y: number, hpMul = 1, speedMul = 1, elite = false): Enemy {
    const def = ENEMY_MAP[defId];
    const e: Enemy = this.pool.pop() ?? ({} as Enemy);
    e.def = def; e.id = enemySeq++;
    e.x = x; e.y = y;
    const em = (elite ? 7 : 1) * hpMul;
    e.hp = def.hp * em; e.maxHp = e.hp;
    e.radius = def.radius * (elite ? 1.35 : 1);
    e.scale = def.scale * (elite ? 1.5 : 1);
    e.speed = def.speed * speedMul * (elite ? 0.85 : 1);
    e.damage = def.damage * (elite ? 1.6 : 1);
    e.xp = Math.round(def.xp * (elite ? 12 : 1));
    e.gold = Math.round((def.gold ?? 1) * (elite ? 14 : 1));
    e.flash = 0; e.kx = 0; e.ky = 0; e.anim = hash2(enemySeq, 7, 3) * TAU;
    e.alive = true; e.elite = elite; e.hitCd = 0; e.dead = false;
    e.tint = elite ? '#ffd166' : def.tint;
    this.list.push(e);
    return e;
  }

  private kill(i: number) {
    const e = this.list[i];
    e.alive = false;
    this.pool.push(e);
    const last = this.list.length - 1;
    this.list[i] = this.list[last];
    this.list[last] = undefined as unknown as Enemy;
    this.list.pop();
  }

  update(dt: number, px: number, py: number, maxDist: number, sep: (e: Enemy) => void) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.hp <= 0 || e.dead) { this.kill(i); continue; }
      if (dist2(e.x, e.y, px, py) > maxDist * maxDist) { this.kill(i); continue; }
      const dx = px - e.x, dy = py - e.y;
      const len = Math.hypot(dx, dy) || 1;
      e.x += (dx / len) * e.speed * dt + e.kx * dt;
      e.y += (dy / len) * e.speed * dt + e.ky * dt;
      const kd = Math.pow(0.0016, dt);
      e.kx *= kd; e.ky *= kd;
      if (e.flash > 0) e.flash -= dt;
      if (e.hitCd > 0) e.hitCd -= dt;
      e.anim += dt * 6;
      sep(e);
    }
  }

  render(ctx: CanvasRenderingContext2D, sortBuf: Enemy[], b: Bounds, px: number) {
    sortBuf.length = 0;
    for (const e of this.list) {
      if (e.x < b.x0 || e.x > b.x1 || e.y < b.y0 || e.y > b.y1) continue;
      sortBuf.push(e);
    }
    sortBuf.sort((a, b) => a.y - b.y);
    for (const e of sortBuf) {
      const bob = Math.sin(e.anim) * 0.9;
      const spr = frame(e.def.sprite);
      // ground shadow
      ctx.globalAlpha = 0.28;
      draw(ctx, 'pt_circle_01', e.x, e.y + 7 * e.scale, { scale: 0.11 * e.scale, shade: '#000' });
      ctx.globalAlpha = 1;
      draw(ctx, spr, e.x, e.y + bob, {
        scale: e.scale,
        shade: e.flash > 0 ? '#ffffff' : e.tint,
        flipX: e.x > px,
      });
    }
  }
}

export type ProjKind = 'bullet' | 'arc' | 'orbit' | 'strike' | 'burn' | 'thrown';

export interface Projectile {
  alive: boolean; kind: ProjKind; sprite: string;
  x: number; y: number; vx: number; vy: number;
  life: number; ttl: number;
  dmg: number; radius: number; pierce: number;
  hits: number[]; hitn: number;
  rot: number; spin: number; homing: boolean; grav: number;
  weapon: string; tint?: string; repel: number; tick: number;
  orbitA: number; orbitR: number; follow: boolean; alpha: number; acc: number;
  scale: number;
}

export class Projectiles {
  list: Projectile[] = [];
  private pool: Projectile[] = [];

  spawn(p: Partial<Projectile>): Projectile {
    const o: Projectile = this.pool.pop() ?? ({ hits: [] } as unknown as Projectile);
    o.alive = true;
    o.kind = p.kind ?? 'bullet';
    o.sprite = p.sprite ?? 'pt_spark_01';
    o.x = p.x ?? 0; o.y = p.y ?? 0; o.vx = p.vx ?? 0; o.vy = p.vy ?? 0;
    o.life = 0; o.ttl = p.ttl ?? 1;
    o.dmg = p.dmg ?? 10; o.radius = p.radius ?? 10; o.pierce = p.pierce ?? 1;
    o.hits.length = 0; o.hitn = 0;
    o.rot = p.rot ?? 0; o.spin = p.spin ?? 0;
    o.homing = p.homing ?? false; o.grav = p.grav ?? 0;
    o.weapon = p.weapon ?? ''; o.tint = p.tint;
    o.repel = p.repel ?? 0; o.tick = p.tick ?? 0;
    o.orbitA = p.orbitA ?? 0; o.orbitR = p.orbitR ?? 0;
    o.follow = p.follow ?? false; o.alpha = p.alpha ?? 1; o.scale = p.scale ?? 1; o.acc = 0;
    this.list.push(o);
    return o;
  }

  private kill(i: number) {
    const p = this.list[i];
    p.alive = false;
    this.pool.push(p);
    const last = this.list.length - 1;
    this.list[i] = this.list[last];
    this.list[last] = undefined as unknown as Projectile;
    this.list.pop();
  }

  hasHit(p: Projectile, id: number) {
    for (let i = 0; i < p.hits.length; i++) if (p.hits[i] === id) return true;
    return false;
  }

  markHit(p: Projectile, id: number) {
    p.hits.push(id);
    p.hitn++;
  }

  update(dt: number, px: number, py: number, aim: () => { x: number; y: number } | null) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.ttl || p.pierce < 0) { this.kill(i); continue; }
      if (p.homing && p.kind === 'bullet') {
        const t = aim();
        if (t) {
          const dx = t.x - p.x, dy = t.y - p.y;
          const l = Math.hypot(dx, dy) || 1;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          p.vx += ((dx / l) * sp - p.vx) * Math.min(1, dt * 6);
          p.vy += ((dy / l) * sp - p.vy) * Math.min(1, dt * 6);
        }
      }
      if (p.grav) p.vy += p.grav * dt;
      if (p.follow) { p.x = px + Math.cos(p.orbitA) * p.orbitR; p.y = py + Math.sin(p.orbitA) * p.orbitR; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; }
      p.orbitA += p.spin * dt;
      p.rot += p.spin * dt * (p.kind === 'bullet' ? 0 : 1);
    }
  }

  /** Ground-level effects (auras, fires) render beneath entities. */
  renderGround(ctx: CanvasRenderingContext2D, b: Bounds) {
    for (const p of this.list) {
      if (p.kind !== 'burn') continue;
      if (p.x + p.radius < b.x0 || p.x - p.radius > b.x1 || p.y + p.radius < b.y0 || p.y - p.radius > b.y1) continue;
      const a = p.alpha * (0.75 + 0.25 * Math.sin(p.life * 9));
      draw(ctx, frame(p.sprite), p.x, p.y, {
        scale: p.scale * (1 + Math.sin(p.life * 8) * 0.04),
        angle: p.rot, alpha: a, shade: p.tint, blend: 'lighter',
      });
    }
  }

  render(ctx: CanvasRenderingContext2D, b: Bounds) {
    for (const p of this.list) {
      if (p.kind === 'burn') continue;
      if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
      draw(ctx, frame(p.sprite), p.x, p.y, {
        scale: p.scale, angle: p.rot, alpha: p.alpha, shade: p.tint,
      });
    }
  }
}

export type LootKind = 'xp' | 'gold' | 'food' | 'chest';

export interface Loot {
  alive: boolean; kind: LootKind; value: number;
  x: number; y: number; vx: number; vy: number;
  t: number; pulled: boolean; sprite: string; tint?: string; scale: number;
}

export class LootManager {
  list: Loot[] = [];
  private pool: Loot[] = [];

  spawn(kind: LootKind, x: number, y: number, value: number, sprite: string, tint?: string, scale = 1): Loot {
    const o: Loot = this.pool.pop() ?? ({} as Loot);
    o.alive = true; o.kind = kind; o.value = value;
    o.x = x; o.y = y;
    const a = RNG.next() * TAU, s = kind === 'chest' ? 0 : 26 + RNG.next() * 30;
    o.vx = Math.cos(a) * s; o.vy = Math.sin(a) * s;
    o.t = 0; o.pulled = false; o.sprite = sprite; o.tint = tint; o.scale = scale;
    this.list.push(o);
    return o;
  }

  update(dt: number, px: number, py: number, magnet: number, onPick: (l: Loot) => void) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.t += dt;
      const d2 = dist2(o.x, o.y, px, py);
      const mr = o.kind === 'chest' ? 14 : magnet;
      if (!o.pulled && d2 < mr * mr) o.pulled = true;
      if (o.pulled) {
        const l = Math.sqrt(d2) || 1;
        const pull = 320 + (o.kind === 'chest' ? 0 : Math.max(0, 90 - l) * 3);
        o.vx += ((px - o.x) / l) * pull * dt * 6;
        o.vy += ((py - o.y) / l) * pull * dt * 6;
      }
      const damp = Math.pow(o.pulled ? 0.2 : 0.004, dt);
      o.vx *= damp; o.vy *= damp;
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (d2 < 64) { onPick(o); this.recycle(i); continue; }
    }
  }

  /** Drops the oldest non-chest items once the field is saturated. */
  trim(max: number): Loot[] {
    const out: Loot[] = [];
    for (let i = 0; i < this.list.length && this.list.length > max; i++) {
      const o = this.list[i];
      if (o.kind === 'chest') continue;
      this.list.splice(i, 1);
      o.alive = false;
      this.pool.push(o);
      out.push(o);
      i--;
    }
    return out;
  }

  private recycle(i: number) {
    const o = this.list[i];
    o.alive = false;
    this.pool.push(o);
    const last = this.list.length - 1;
    this.list[i] = this.list[last];
    this.list[last] = undefined as unknown as Loot;
    this.list.pop();
  }

  render(ctx: CanvasRenderingContext2D, b: Bounds) {
    for (const o of this.list) {
      if (o.x < b.x0 || o.x > b.x1 || o.y < b.y0 || o.y > b.y1) continue;
      const bob = Math.sin(o.t * 4 + o.x * 0.1) * 1.1;
      const y = o.y + bob;
      if (o.kind === 'xp') {
        // flat-tinted sheet gems read as solid squares, so crystals are drawn directly
        const s = 3.0 * o.scale;
        ctx.globalAlpha = 0.18;
        draw(ctx, 'pt_circle_01', o.x, y, { scale: 0.17 * o.scale, shade: o.tint });
        ctx.globalAlpha = 1;
        ctx.fillStyle = o.tint ?? '#7ee08a';
        ctx.beginPath();
        ctx.moveTo(o.x, y - s); ctx.lineTo(o.x + s * 0.7, y); ctx.lineTo(o.x, y + s); ctx.lineTo(o.x - s * 0.7, y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillRect(o.x - s * 0.28, y - s * 0.62, s * 0.3, s * 0.3);
      } else if (o.kind === 'gold') {
        ctx.fillStyle = '#8a6a17';
        ctx.beginPath(); ctx.arc(o.x, y, 3.1, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f5c542';
        ctx.beginPath(); ctx.arc(o.x, y - 0.4, 2.3, 0, TAU); ctx.fill();
      } else {
        draw(ctx, frame(o.sprite), o.x, y, { scale: o.scale });
      }
    }
  }
}

export interface Particle {
  alive: boolean; sprite: string;
  x: number; y: number; vx: number; vy: number;
  life: number; ttl: number; scale: number; from: number; to: number;
  rot: number; spin: number; tint?: string; alpha: number; fade: number;
}

export class Particles {
  list: Particle[] = [];
  private pool: Particle[] = [];

  spawn(p: Partial<Particle>) {
    if (this.list.length > 700) return;
    const o: Particle = this.pool.pop() ?? ({} as Particle);
    o.alive = true; o.sprite = p.sprite ?? 'pt_smoke_01';
    o.x = p.x ?? 0; o.y = p.y ?? 0; o.vx = p.vx ?? 0; o.vy = p.vy ?? 0;
    o.life = 0; o.ttl = p.ttl ?? 0.4;
    o.from = p.from ?? 0.3; o.to = p.to ?? 0;
    o.scale = o.from; o.rot = p.rot ?? 0; o.spin = p.spin ?? 0;
    o.tint = p.tint; o.alpha = p.alpha ?? 1; o.fade = p.fade ?? 1;
    this.list.push(o);
  }

  burst(x: number, y: number, n: number, opts: Partial<Particle> & { spread?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const a = RNG.next() * TAU;
      const sp = (opts.spread ?? 60) * (0.35 + RNG.next() * 0.9);
      this.spawn({
        ...opts, x, y,
        vx: Math.cos(a) * sp + (opts.vx ?? 0),
        vy: Math.sin(a) * sp + (opts.vy ?? 0),
        rot: RNG.next() * TAU,
        spin: (RNG.next() - 0.5) * 8,
      });
    }
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.life += dt;
      if (o.life >= o.ttl) {
        o.alive = false; this.pool.push(o);
        const last = this.list.length - 1;
        this.list[i] = this.list[last]; this.list[last] = undefined as unknown as Particle;
        this.list.pop();
        continue;
      }
      const k = o.life / o.ttl;
      o.scale = o.from + (o.to - o.from) * k;
      o.alpha = Math.max(0, 1 - Math.pow(k, o.fade));
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.vx *= Math.pow(0.15, dt); o.vy *= Math.pow(0.15, dt);
      o.rot += o.spin * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D, b: Bounds) {
    for (const o of this.list) {
      if (o.x < b.x0 || o.x > b.x1 || o.y < b.y0 || o.y > b.y1) continue;
      draw(ctx, frame(o.sprite), o.x, o.y, { scale: o.scale, angle: o.rot, alpha: o.alpha, shade: o.tint });
    }
  }
}

export interface FloatText {
  alive: boolean; text: string; x: number; y: number; vy: number;
  life: number; ttl: number; color: string; size: number;
}

export class FloatTexts {
  list: FloatText[] = [];
  private pool: FloatText[] = [];

  spawn(text: string, x: number, y: number, color = '#fff', size = 3.4, vy = -26) {
    if (this.list.length > 90) return;
    const o: FloatText = this.pool.pop() ?? ({} as FloatText);
    o.alive = true; o.text = text; o.x = x + (RNG.next() - 0.5) * 6; o.y = y;
    o.vy = vy; o.life = 0; o.ttl = 0.62; o.color = color; o.size = size;
    this.list.push(o);
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.life += dt;
      o.y += o.vy * dt;
      o.vy *= Math.pow(0.25, dt);
      if (o.life >= o.ttl) {
        o.alive = false; this.pool.push(o);
        const last = this.list.length - 1;
        this.list[i] = this.list[last]; this.list[last] = undefined as unknown as FloatText;
        this.list.pop();
      }
    }
  }

  render(textFn: (s: string, x: number, y: number, size: number, color: string, alpha: number) => void) {
    for (const o of this.list) {
      const k = o.life / o.ttl;
      textFn(o.text, o.x, o.y, o.size, o.color, 1 - k * k);
    }
  }
}
