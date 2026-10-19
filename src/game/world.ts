// Procedural infinite ground: 8x8-tile chunks baked to offscreen canvases and cached.
import { hash2 } from '../core/engine';
import { draw } from '../core/render';
import { SPRSET } from '../data/sprites';

const TILE = 16;
const CHUNK = 8;

function pick(list: string[], v: number): string {
  return list[Math.min(list.length - 1, Math.floor(v * list.length))];
}

/** Smooth value noise in [0, 1] built from the integer hash. */
function noise(x: number, y: number, scale: number, salt: number) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, salt), b = hash2(x0 + 1, y0, salt);
  const c = hash2(x0, y0 + 1, salt), d = hash2(x0 + 1, y0 + 1, salt);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

export class World {
  private cache = new Map<string, HTMLCanvasElement>();
  private order: string[] = [];

  clear() { this.cache.clear(); this.order.length = 0; }

  private build(cx: number, cy: number, zoom: number): HTMLCanvasElement {
    const px = CHUNK * TILE * zoom;
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.scale(zoom, zoom);
    ctx.fillStyle = '#3d5228';
    ctx.fillRect(0, 0, CHUNK * TILE, CHUNK * TILE);

    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const wx = cx * CHUNK + tx, wy = cy * CHUNK + ty;
        const x = tx * TILE, y = ty * TILE;
        const n = noise(wx, wy, 26, 17);
        // jitter dissolves the blocky edges that pure thresholding leaves behind
        const v = n + (hash2(wx, wy, 5) - 0.5) * 0.06;
        let frame: string;
        if (v > 0.70) frame = pick(SPRSET.stone, hash2(wx, wy, 11));
        else if (v > 0.62) frame = pick(SPRSET.dirt, hash2(wx, wy, 13));
        else {
          const g = hash2(wx, wy, 3);
          frame = g > 0.988 ? pick(SPRSET.grass_accent, hash2(wx, wy, 7)) : pick(SPRSET.grass, g * 1.02);
        }
        draw(ctx, frame, x, y, { anchor: 0 });
        // per-tile tonal drift (not per-chunk, which would leave visible seams)
        const shade = (noise(wx, wy, 42, 71) - 0.5) * 0.14;
        if (Math.abs(shade) > 0.005) {
          ctx.globalAlpha = Math.abs(shade);
          ctx.fillStyle = shade > 0 ? '#04101f' : '#e8ffc0';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.globalAlpha = 1;
        }

        if (v <= 0.62) {
          const d = hash2(wx, wy, 41);
          if (d > 0.9955) draw(ctx, pick(SPRSET.tree, hash2(wx, wy, 43)), x, y - 8, { anchor: 0 });
          else if (d > 0.991) draw(ctx, pick(SPRSET.tree_orange, hash2(wx, wy, 44)), x, y - 6, { anchor: 0 });
          else if (d > 0.9865) draw(ctx, pick(SPRSET.bush, hash2(wx, wy, 45)), x, y, { anchor: 0 });
          else if (d > 0.972) draw(ctx, pick(SPRSET.flower, hash2(wx, wy, 46)), x, y, { anchor: 0 });
          else if (d > 0.949) draw(ctx, 'td_0064', x, y - 2, { anchor: 0 });
          else if (d > 0.938) draw(ctx, pick(SPRSET.grass_accent, hash2(wx, wy, 47)), x, y, { anchor: 0 });
          else if (d < 0.004) draw(ctx, 'rl_8_14', x, y, { anchor: 0 });
          else if (d < 0.008) draw(ctx, 'td_0072', x, y, { anchor: 0 });
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  /** Draws every chunk overlapping the camera bounds. */
  render(ctx: CanvasRenderingContext2D, b: { x0: number; y0: number; x1: number; y1: number }, zoom: number, time: number) {
    const c0 = Math.floor(b.x0 / (CHUNK * TILE)), c1 = Math.floor(b.x1 / (CHUNK * TILE));
    const r0 = Math.floor(b.y0 / (CHUNK * TILE)), r1 = Math.floor(b.y1 / (CHUNK * TILE));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const key = cx + ',' + cy;
      let canvas = this.cache.get(key);
      if (!canvas) {
        canvas = this.build(cx, cy, zoom);
        this.cache.set(key, canvas);
        this.order.push(key);
        if (this.order.length > 110) {
          const dead = this.order.shift()!;
          if (dead !== key) this.cache.delete(dead);
        }
      }
      ctx.drawImage(canvas, cx * CHUNK * TILE, cy * CHUNK * TILE, CHUNK * TILE, CHUNK * TILE);
    }
    // drifting fireflies: pure ambience, no gameplay effect
    const spanX = b.x1 - b.x0, spanY = b.y1 - b.y0;
    for (let i = 0; i < 12; i++) {
      const px = b.x0 + ((hash2(i, 1, 5) * spanX + time * (7 + i * 0.6)) % spanX);
      const py = b.y0 + ((hash2(i, 2, 6) * spanY + Math.sin(time * 0.7 + i) * 16) % spanY);
      draw(ctx, 'pt_circle_01', px, py, { scale: 0.08, shade: '#ffe58a', alpha: 0.25 + 0.25 * Math.sin(time * 2 + i) });
    }
  }
}
