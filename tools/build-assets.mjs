// Builds runtime assets from the vendored open-source packs in assets-src/.
//   node tools/build-assets.mjs
// Outputs: public/assets/atlas.png, atlas.json, audio/*, fonts/*, licenses/*, CREDITS.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'public', 'assets');
const PAD = 1;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'audio'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'licenses'), { recursive: true });

/** @type {{name:string,w:number,h:number,px:Uint8ClampedArray}[]} */
const frames = [];

function addPixels(name, w, h, rgba) {
  frames.push({ name, w, h, px: rgba });
}

function fromPNG(name, png, scale = 1) {
  if (scale === 1) return addPixels(name, png.width, png.height, new Uint8ClampedArray(png.data));
  const w = Math.max(1, Math.round(png.width / scale)), h = Math.max(1, Math.round(png.height / scale));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
      const i = ((y * scale + sy) * png.width + (x * scale + sx)) * 4;
      r += png.data[i] * png.data[i + 3]; g += png.data[i + 1] * png.data[i + 3]; b += png.data[i + 2] * png.data[i + 3];
      a += png.data[i + 3]; n++;
    }
    const o = (y * w + x) * 4, al = a / n;
    out[o + 3] = Math.round(al);
    if (al > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
  }
  addPixels(name, w, h, out);
}

function cropTile(name, png, x, y, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const si = ((y + j) * png.width + (x + i)) * 4, di = (j * w + i) * 4;
    out[di] = png.data[si]; out[di + 1] = png.data[si + 1]; out[di + 2] = png.data[si + 2]; out[di + 3] = png.data[si + 3];
  }
  addPixels(name, w, h, out);
}

// ---- Kenney Tiny Dungeon: 132 tiles, 16x16, numbered to match Tiles/tile_00NN.png ----
const tdDir = path.join(SRC, 'kenney/tiny-dungeon/Tiles');
for (const f of fs.readdirSync(tdDir).filter(f => /^tile_\d+\.png$/.test(f)).sort()) {
  fromPNG(`td_${f.slice(5, 9)}`, PNG.sync.read(fs.readFileSync(path.join(tdDir, f))));
}

// ---- Kenney Roguelike/RPG: 57 x 31 grid of 16x16 tiles with 1px margin ----
const rl = PNG.sync.read(fs.readFileSync(path.join(SRC, 'kenney/roguelike-rpg-pack/roguelikeSheet_transparent.png')));
for (let r = 0; r < 31; r++) for (let c = 0; c < 57; c++) {
  if (c * 17 + 16 > rl.width || r * 17 + 16 > rl.height) continue;
  cropTile(`rl_${r}_${c}`, rl, c * 17, r * 17, 16, 16);
}

// ---- Kenney Particle Pack: 512px sources downscaled to 64px ----
const partDir = path.join(SRC, 'kenney/particle-pack/PNG');
for (const f of fs.readdirSync(partDir).filter(f => f.endsWith('.png'))) {
  fromPNG(`pt_${f.replace('.png', '')}`, PNG.sync.read(fs.readFileSync(path.join(partDir, f))), 8);
}

// ---- Kenney Fantasy UI Borders (48x48, used as 9-slice) ----
const uiDir = path.join(SRC, 'kenney/fantasy-ui-borders/Border');
for (const f of fs.readdirSync(uiDir).filter(f => f.endsWith('.png')).sort()) {
  fromPNG(`ui_${f.replace('panel-border-', 'border-').replace('.png', '')}`, PNG.sync.read(fs.readFileSync(path.join(uiDir, f))));
}

// ---- shelf pack ----
frames.sort((a, b) => (b.h - a.h) || (b.w - a.w) || (a.name < b.name ? -1 : 1));
const MAXW = 1024;
let x = PAD, y = PAD, shelfH = 0, placed = 0;
/** @type {Record<string,[number,number,number,number]>} */
const manifest = {};
for (const f of frames) {
  if (x + f.w + PAD > MAXW) { x = PAD; y += shelfH + PAD; shelfH = 0; }
  f.ax = x; f.ay = y; shelfH = Math.max(shelfH, f.h);
  manifest[f.name] = [x, y, f.w, f.h];
  x += f.w + PAD; placed++;
}
const atlasH = Math.min(MAXW, Math.ceil((frames.reduce((s, f) => s + (f.w + PAD) * (f.h + PAD), 0) + 4096) / MAXW) + 8);
const size = Math.max(256, 1 << Math.ceil(Math.log2(Math.max(MAXW, atlasH))));
const atlas = new PNG({ width: MAXW, height: size });
atlas.data.fill(0);
for (const f of frames) {
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
    const si = (j * f.w + i) * 4, di = ((f.ay + j) * MAXW + (f.ax + i)) * 4;
    atlas.data[di] = f.px[si]; atlas.data[di + 1] = f.px[si + 1]; atlas.data[di + 2] = f.px[si + 2]; atlas.data[di + 3] = f.px[si + 3];
  }
}
fs.writeFileSync(path.join(OUT, 'atlas.png'), PNG.sync.write(atlas));
fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify({ width: MAXW, height: size, frames: manifest }));
console.log(`atlas ${MAXW}x${size}, ${placed} frames`);

// ---- audio / fonts / licenses ----
const audioMap = {
  'kenney/digital-audio/pepSound1.ogg': 'xp.ogg',
  'kenney/digital-audio/powerUp1.ogg': 'levelup.ogg',
  'kenney/digital-audio/powerUp3.ogg': 'powerup.ogg',
  'kenney/digital-audio/threeTone1.ogg': 'evolve.ogg',
  'kenney/digital-audio/twoTone1.ogg': 'chest.ogg',
  'kenney/digital-audio/laser1.ogg': 'shot.ogg',
  'kenney/digital-audio/laser3.ogg': 'shoot_heavy.ogg',
  'kenney/digital-audio/zap2.ogg': 'hit.ogg',
  'kenney/digital-audio/highUp.ogg': 'heal.ogg',
  'kenney/digital-audio/lowDown.ogg': 'hurt.ogg',
  'kenney/digital-audio/tone1.ogg': 'ui_move.ogg',
  'kenney/digital-audio/phaseJump1.ogg': 'ui_select.ogg',
  'kenney/digital-audio/spaceTrash1.ogg': 'coin.ogg',
  'kenney/impact-sounds/impactPunch_medium_000.ogg': 'hit_flesh.ogg',
  'kenney/impact-sounds/impactWood_heavy_000.ogg': 'enemy_die.ogg',
  'kenney/impact-sounds/impactSoft_medium_000.ogg': 'thud.ogg',
  'kenney/impact-sounds/impactBell_heavy_000.ogg': 'boss.ogg',
  'kenney/impact-sounds/impactGlass_light_000.ogg': 'bottle.ogg',
  'kenney/impact-sounds/footstep_grass_000.ogg': 'step.ogg',
  'kenney/music-jingles/jingles_NES00.ogg': 'fanfare.ogg',
  'oga/atmospheric-ghostly-loops/ambient_001.m4a': 'music_a.m4a',
  'oga/atmospheric-ghostly-loops/ambient_002.m4a': 'music_b.m4a',
  'oga/atmospheric-ghostly-loops/ambient_003.m4a': 'music_c.m4a',
};
for (const [src, dst] of Object.entries(audioMap)) {
  const from = path.join(SRC, src);
  if (!fs.existsSync(from)) { console.warn('missing audio', src); continue; }
  fs.copyFileSync(from, path.join(OUT, 'audio', dst));
}
for (const [src, dst] of Object.entries({
  'kenney/kenney-fonts/Kenney Pixel.ttf': 'KenneyPixel.ttf',
  'kenney/kenney-fonts/Kenney Mini Square.ttf': 'KenneyMiniSquare.ttf',
  'kenney/kenney-fonts/Kenney Future.ttf': 'KenneyFuture.ttf',
  'kenney/kenney-fonts/Kenney High Square.ttf': 'KenneyHighSquare.ttf',
})) {
  fs.copyFileSync(path.join(SRC, src), path.join(OUT, 'fonts', dst));
}
const licMap = {
  'kenney/tiny-dungeon/License.txt': 'kenney-tiny-dungeon.txt',
  'kenney/roguelike-rpg-pack/License.txt': 'kenney-roguelike-rpg.txt',
  'kenney/particle-pack/License.txt': 'kenney-particle-pack.txt',
  'kenney/fantasy-ui-borders/License.txt': 'kenney-fantasy-ui-borders.txt',
  'kenney/kenney-fonts/License.txt': 'kenney-fonts.txt',
  'kenney/digital-audio/License.txt': 'kenney-digital-audio.txt',
  'kenney/impact-sounds/License.txt': 'kenney-impact-sounds.txt',
  'kenney/music-jingles/License.txt': 'kenney-music-jingles.txt',
};
// individual border PNGs for CSS border-image / background use in the DOM UI
fs.mkdirSync(path.join(OUT, 'ui'), { recursive: true });
for (const f of fs.readdirSync(uiDir).filter(f => f.endsWith('.png'))) {
  fs.copyFileSync(path.join(uiDir, f), path.join(OUT, 'ui', f.replace('panel-', '')));
}

for (const [src, dst] of Object.entries(licMap)) {
  const from = path.join(SRC, src);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(OUT, 'licenses', dst));
}

const credits = {
  generatedBy: 'tools/build-assets.mjs',
  packs: [
    { name: 'Kenney · Tiny Dungeon', url: 'https://kenney.nl/assets/tiny-dungeon', license: 'CC0 1.0', usedFor: 'characters, enemies, weapons, items, dungeon props', frames: 'td_*' },
    { name: 'Kenney · Roguelike/RPG pack', url: 'https://kenney.nl/assets/roguelike-rpg-pack', license: 'CC0 1.0', usedFor: 'ground tiles, decor, pickups', frames: 'rl_*' },
    { name: 'Kenney · Particle Pack', url: 'https://kenney.nl/assets/particle-pack', license: 'CC0 1.0', usedFor: 'hit sparks, magic, blood and smoke effects', frames: 'pt_*' },
    { name: 'Kenney · Fantasy UI Borders', url: 'https://kenney.nl/assets/fantasy-ui-borders', license: 'CC0 1.0', usedFor: 'panels and level-up cards (9-slice)', frames: 'ui_*' },
    { name: 'Kenney · Fonts', url: 'https://kenney.nl/assets/kenney-fonts', license: 'CC0 1.0', usedFor: 'UI typography' },
    { name: 'Kenney · Digital Audio', url: 'https://kenney.nl/assets/digital-audio', license: 'CC0 1.0', usedFor: 'UI, weapon and pickup SFX' },
    { name: 'Kenney · Impact Sounds', url: 'https://kenney.nl/assets/impact-sounds', license: 'CC0 1.0', usedFor: 'hit/death SFX' },
    { name: 'Kenney · Music Jingles', url: 'https://kenney.nl/assets/music-jingles', license: 'CC0 1.0', usedFor: 'level-up fanfare' },
    { name: 'OpenGameArt · 4 Atmospheric Ghostly Loops (Independent Nu Ljudbank)', url: 'https://opengameart.org/content/4-atmospheric-ghostly-loops', license: 'CC0 1.0', usedFor: 'background music (20s loops, converted to m4a)' },
  ],
};
fs.writeFileSync(path.join(OUT, 'CREDITS.json'), JSON.stringify(credits, null, 2));
console.log('audio', fs.readdirSync(path.join(OUT, 'audio')).length, 'fonts', fs.readdirSync(path.join(OUT, 'fonts')).length);
