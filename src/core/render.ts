// Atlas-backed sprite rendering with tinting, 9-slice panels and pixel text.

export interface Frame { x: number; y: number; w: number; h: number }

const frames: Record<string, Frame> = {};
let sheet: HTMLCanvasElement | null = null;
const tintCache = new Map<string, HTMLCanvasElement>();

export async function loadAtlas(url = '/assets/atlas.png', json = '/assets/atlas.json') {
  const [img, meta] = await Promise.all([
    new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('atlas load failed'));
      i.src = url;
    }),
    fetch(json).then(r => r.json()) as Promise<{ frames: Record<string, [number, number, number, number]> }>,
  ]);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, 0);
  sheet = c;
  for (const [k, v] of Object.entries(meta.frames)) frames[k] = { x: v[0], y: v[1], w: v[2], h: v[3] };
}


function tintCanvas(name: string, color: string, key: string) {
  const ck = key;
  const cached = tintCache.get(ck);
  if (cached) return cached;
  const f = frames[name];
  if (!f || !sheet) return null;
  const c = document.createElement('canvas');
  c.width = f.w; c.height = f.h;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(sheet, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  cx.globalCompositeOperation = 'source-atop';
  cx.fillStyle = color;
  cx.fillRect(0, 0, f.w, f.h);
  tintCache.set(ck, c);
  return c;
}

export interface DrawOpts {
  scale?: number;
  alpha?: number;
  angle?: number;
  flipX?: boolean;
  tint?: string;
  /** multiply tint over the sprite (keeps shading) */
  shade?: string;
  anchor?: number; // 0 = top-left, 0.5 = center
  offsetY?: number;
  /** 'lighter' makes tinted white particles glow instead of darkening the ground */
  blend?: GlobalCompositeOperation;
}

export function draw(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, o: DrawOpts = {}) {
  const f = frames[name];
  if (!f || !sheet) return;
  if (o.blend) ctx.globalCompositeOperation = o.blend;
  const s = o.scale ?? 1, a = o.anchor ?? 0.5;
  const w = f.w * s, h = f.h * s;
  const dx = x - w * a + (o.offsetY ?? 0) * 0, dy = y - h * a;
  if (o.alpha !== undefined && o.alpha < 1) ctx.globalAlpha = o.alpha;
  if (o.angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.angle);
    if (o.flipX) ctx.scale(-1, 1);
    ctx.drawImage(sheet, f.x, f.y, f.w, f.h, -w * a, -h * a, w, h);
    ctx.restore();
  } else {
    if (o.flipX) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(sheet, f.x, f.y, f.w, f.h, -w * a, dy - y, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(sheet, f.x, f.y, f.w, f.h, dx, dy, w, h);
    }
  }
  if (o.shade) {
    const t = tintCanvas(name, o.shade, name + '|s|' + o.shade);
    if (t) ctx.drawImage(t, dx, dy, w, h);
  }
  if (o.alpha !== undefined && o.alpha < 1) ctx.globalAlpha = 1;
  if (o.blend) ctx.globalCompositeOperation = 'source-over';
}

/** Draws a frame into a screen-space (unzoomed) context, used for icons. */
export function drawIcon(name: string, size = 48, tint?: string): string | HTMLCanvasElement {
  const f = frames[name];
  const c = document.createElement('canvas');
  const k = Math.max(1, Math.round(size / Math.max(f?.w ?? 16, f?.h ?? 16)));
  c.width = (f?.w ?? 16) * k; c.height = (f?.h ?? 16) * k;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = false;
  if (f && sheet) cx.drawImage(sheet, f.x, f.y, f.w, f.h, 0, 0, c.width, c.height);
  if (tint) {
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = tint;
    cx.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

export function iconURL(name: string, size = 48, tint?: string) {
  const el = drawIcon(name, size, tint);
  return typeof el === 'string' ? el : el.toDataURL();
}

export function text(
  ctx: CanvasRenderingContext2D, str: string, x: number, y: number,
  opts: { size?: number; color?: string; align?: CanvasTextAlign; font?: string; shadow?: string | false } = {},
) {
  const size = opts.size ?? 12;
  ctx.font = `${size}px ${opts.font ?? "'Kenney Mini', monospace"}`;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'middle';
  if (opts.shadow !== false) {
    ctx.fillStyle = opts.shadow ?? 'rgba(0,0,0,0.85)';
    ctx.fillText(str, x + Math.max(1, size * 0.1), y + Math.max(1, size * 0.1));
  }
  ctx.fillStyle = opts.color ?? '#fff';
  ctx.fillText(str, x, y);
}

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, fill: string, back = 'rgba(0,0,0,.6)') {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.max(0, Math.min(1, pct))), h - 2);
  ctx.strokeStyle = 'rgba(0,0,0,.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

