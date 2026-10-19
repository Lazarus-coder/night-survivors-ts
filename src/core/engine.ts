// Small deterministic core: RNG, math, input, camera, spatial hash.

/**
 * Single source of randomness for gameplay. Seeded per run so a given seed replays
 * identically — that is what makes the headless balance harness trustworthy.
 * Audio jitter stays on Math.random so it never consumes the gameplay stream.
 */
export const RNG = { next: Math.random };

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-cell noise for procedural ground decoration. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export const TAU = Math.PI * 2;

/** 8-directional movement input + menus + pause. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  axisX = 0;
  axisY = 0;
  anyKey = false;

  private keys = [
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'Enter', 'Escape', 'KeyP', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Tab', 'KeyR', 'KeyM',
  ];

  attach() {
    window.addEventListener('keydown', (e) => {
      if (this.keys.includes(e.code)) e.preventDefault();
      if (!e.repeat) { this.pressed.add(e.code); this.anyKey = true; }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.axisX = 0; this.axisY = 0; });
  }

  isDown(code: string) { return this.down.has(code); }
  wasPressed(code: string) { return this.pressed.has(code); }

  update() {
    let x = 0, y = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    const pad = this.gamepadAxis();
    if (pad) { x = pad.x; y = pad.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.axisX = x; this.axisY = y;
  }

  private gamepadAxis() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const lx = p.axes[0] ?? 0, ly = p.axes[1] ?? 0;
      if (Math.abs(lx) > 0.25 || Math.abs(ly) > 0.25) return { x: lx, y: ly };
      const hx = p.axes[2] ?? 0, hy = p.axes[3] ?? 0;
      if (Math.abs(hx) > 0.25 || Math.abs(hy) > 0.25) return { x: hx, y: hy };
    }
    return null;
  }

  endFrame() { this.pressed.clear(); }
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 3;
  shake = 0;
  private sx = 0;
  private sy = 0;

  follow(tx: number, ty: number, w: number, h: number, dt: number) {
    this.x = lerp(this.x, tx, clamp(dt * 12, 0, 1));
    this.y = lerp(this.y, ty, clamp(dt * 12, 0, 1));
    this.shake = approach(this.shake, 0, dt * 26);
    const s = this.shake * this.shake;
    this.sx = (RNG.next() * 2 - 1) * s * 9;
    this.sy = (RNG.next() * 2 - 1) * s * 9;
    void w; void h;
  }

  worldToScreenX(wx: number) { return (wx - this.x) * this.zoom + this.sx * this.zoom + this.viewW / 2; }
  worldToScreenY(wy: number) { return (wy - this.y) * this.zoom + this.sy * this.zoom + this.viewH / 2; }
  viewW = 1920;
  viewH = 1080;

  apply(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, this.viewW / 2 - this.x * this.zoom + this.sx * this.zoom, this.viewH / 2 - this.y * this.zoom + this.sy * this.zoom);
  }

  /** World-space rectangle currently visible (with margin), for culling. */
  bounds(margin = 32) {
    const hw = this.viewW / 2 / this.zoom + margin, hh = this.viewH / 2 / this.zoom + margin;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }
}

/** Uniform grid used for enemy/enemy and weapon/enemy queries. */
export class SpatialHash<T extends { x: number; y: number; radius: number }> {
  private map = new Map<number, T[]>();
  private cell: number;
  constructor(cell = 48) { this.cell = cell; }

  private key(cx: number, cy: number) { return (cx + 32768) * 65536 + (cy + 32768); }

  clear() { this.map.clear(); }

  insert(o: T) {
    const c0 = Math.floor((o.x - o.radius) / this.cell), c1 = Math.floor((o.x + o.radius) / this.cell);
    const r0 = Math.floor((o.y - o.radius) / this.cell), r1 = Math.floor((o.y + o.radius) / this.cell);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = this.key(c, r);
      let arr = this.map.get(k);
      if (!arr) { arr = []; this.map.set(k, arr); }
      arr.push(o);
    }
  }

  query(x: number, y: number, radius: number, out: T[]): T[] {
    out.length = 0;
    const c0 = Math.floor((x - radius) / this.cell), c1 = Math.floor((x + radius) / this.cell);
    const r0 = Math.floor((y - radius) / this.cell), r1 = Math.floor((y + radius) / this.cell);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const arr = this.map.get(this.key(c, r));
      if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
    }
    return out;
  }
}

/** Fixed-step accumulator that keeps simulation stable at any refresh rate. */
export class Scheduler {
  acc = 0;
  private step: number;
  constructor(step = 1 / 60) { this.step = step; }
  run(dt: number, fn: (sdt: number) => void) {
    this.acc += Math.min(dt, 0.25);
    let guard = 0;
    while (this.acc >= this.step && guard++ < 8) { fn(this.step); this.acc -= this.step; }
  }
}
