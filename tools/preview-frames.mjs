// Renders a labeled contact sheet of atlas frames so sprite picks can be verified visually.
//   node tools/preview-frames.mjs <namesFile> <outPng> [zoom]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const namesFile = process.argv[2], outPath = process.argv[3], Z = +(process.argv[4] || 5);
const atlas = PNG.sync.read(fs.readFileSync('public/assets/atlas.png'));
const { frames } = JSON.parse(fs.readFileSync('public/assets/atlas.json', 'utf8'));
const names = fs.readFileSync(namesFile, 'utf8').split(/\s+/).filter(Boolean);

const CELL = 16 * Z + 10, LBL = 20, COLS = 12;
const rows = Math.ceil(names.length / COLS);
const o = new PNG({ width: COLS * CELL + 8, height: rows * (CELL + LBL) + 8 });
for (let i = 0; i < o.data.length; i += 4) { o.data[i] = 28; o.data[i + 1] = 30; o.data[i + 2] = 38; o.data[i + 3] = 255; }
const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= o.width || y >= o.height) return; const i = (y * o.width + x) * 4; o.data[i] = r; o.data[i + 1] = g; o.data[i + 2] = b; o.data[i + 3] = 255; };
const G = { '0':'11111 10001 10011 10101 11001 10001 11111','1':'01100 11100 01100 01100 01100 01100 11111','2':'11111 00001 00001 11111 10000 10000 11111','3':'11111 00001 00001 11111 00001 00001 11111','4':'00011 00111 01101 10001 11111 00001 00001','5':'11111 10000 11110 00001 00001 10001 11110','6':'11110 10000 11110 10001 10001 10011 11110','7':'11111 00001 00011 00110 01100 01000 01000','8':'11111 10001 10001 11111 10001 10001 11111','9':'11110 10001 10001 11111 00001 00010 11100','a':'00000 00000 11111 10001 11111 10001 10001'.replace(/ /g,''),'b':'11111 10001 10001 11110 10001 10001 11111'.replace(/ /g,''),'c':'01110 10001 10000 10000 10001 01110 00000'.replace(/ /g,''),'d':'11110 10001 10001 10001 10001 11110 00000'.replace(/ /g,''),'e':'11111 10000 10000 11110 10000 10000 11111'.replace(/ /g,''),'f':'11111 10000 10000 11110 10000 10000 10000'.replace(/ /g,''),'h':'10001 10001 10001 11111 10001 10001 10001'.replace(/ /g,''),'i':'01110 00100 00100 00100 00100 00100 01110'.replace(/ /g,''),'j':'00111 00010 00010 00010 00010 10010 01100'.replace(/ /g,''),'k':'10001 10010 10100 11000 10100 10010 10001'.replace(/ /g,''),'l':'10000 10000 10000 10000 10000 10000 11111'.replace(/ /g,''),'m':'10001 11111 11111 10101 10001 10001 10001'.replace(/ /g,''),'n':'11110 10001 10001 10001 10001 10001 10001'.replace(/ /g,''),'o':'01110 10001 10001 10001 10001 10001 01110'.replace(/ /g,''),'p':'11110 10001 10001 11110 10000 10000 10000'.replace(/ /g,''),'q':'01110 10001 10001 10001 10101 01111 00001'.replace(/ /g,''),'r':'11110 10001 10001 11110 10100 10010 10001'.replace(/ /g,''),'s':'01111 10000 10000 01110 00001 00001 11110'.replace(/ /g,''),'t':'11111 00100 00100 00100 00100 00100 00100'.replace(/ /g,''),'u':'10001 10001 10001 10001 10001 10001 01110'.replace(/ /g,''),'v':'10001 10001 10001 10001 10001 01010 00100'.replace(/ /g,''),'w':'10001 10001 10001 10101 11111 11111 10001'.replace(/ /g,''),'x':'10001 10001 01010 00100 01010 10001 10001'.replace(/ /g,''),'y':'10001 10001 01010 00100 00100 00100 00100'.replace(/ /g,''),'z':'11111 00001 00010 00100 01000 10000 11111'.replace(/ /g,''),'_':'00000 00000 00000 00000 00000 00000 11111'.replace(/ /g,''),'-':'00000 00000 00000 11111 00000 00000 00000'.replace(/ /g,''),':':'00000 00100 00100 00000 00100 00100 00000'.replace(/ /g,''),'.':'00000 00000 00000 00000 00000 01100 01100'.replace(/ /g,'')};
const text = (x, y, s, c) => {
  const FS = 2;
  for (let k = 0; k < s.length; k++) {
    const g = G[s[k]]; if (!g) continue;
    for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 5; xx++) if (g[yy * 5 + xx] === '1')
      for (let a = 0; a < FS; a++) for (let b = 0; b < FS; b++) put(x + (k * 6 + xx) * FS + a, y + yy * FS + b, c[0], c[1], c[2]);
  }
  return s.length * 6 * FS;
};

names.forEach((n, idx) => {
  const gx = idx % COLS, gy = (idx / COLS) | 0;
  const ox = 4 + gx * CELL, oy = 4 + gy * (CELL + LBL);
  const f = frames[n];
  if (!f) { text(ox, oy, '?' + n, [255, 80, 80]); return; }
  const [fx, fy, fw, fh] = f;
  for (let y = 0; y < fh * Z; y++) for (let x = 0; x < fw * Z; x++) {
    const si = ((fy + ((y / Z) | 0)) * 1024 + fx + ((x / Z) | 0)) * 4;
    if (atlas.data[si + 3] > 40) put(ox + x, oy + y, atlas.data[si], atlas.data[si + 1], atlas.data[si + 2]);
  }
  text(ox, oy + 16 * Z + 4, n, [255, 225, 90]);
});
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, PNG.sync.write(o));
console.log('wrote', outPath, names.length, 'frames', o.width + 'x' + o.height);
