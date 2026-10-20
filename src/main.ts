import './style.css';
import { Input, Scheduler, clamp } from './core/engine';
import { draw, loadAtlas } from './core/render';
import { audio } from './core/audio';
import { UI, fmtTime } from './ui/ui';
import { World } from './game/world';
import { Run } from './game/run';
import type { RunSummary } from './game/run';
import { applyMetaCost, loadSave, writeSave } from './game/meta';
import type { SaveData } from './game/meta';
import { CHARACTERS, META, RUN_LENGTH } from './data/gameData';
import type { CharacterDef } from './data/gameData';

type State = 'boot' | 'title' | 'chars' | 'shop' | 'help' | 'credits' | 'run' | 'results';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
const ui = new UI(document.getElementById('ui') as HTMLElement);
const input = new Input();
input.attach();

let save: SaveData = loadSave();
let run: Run | null = null;
let state: State = 'boot';
let credits: { name: string; url: string; license: string; usedFor?: string }[] = [];
let selectedChar: CharacterDef | null = null;
const sched = new Scheduler(1 / 60);
let fps = 60, lastT = performance.now(), acc = 0, frames = 0, musicTrack = -1;

// ----------------------------------------------------------------- sizing
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(320, Math.floor(window.innerWidth * dpr));
  const h = Math.max(240, Math.floor(window.innerHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    ctx.imageSmoothingEnabled = false;
    idleWorld.clear();
    run?.world.clear();
  }
  if (run) {
    run.camera.viewW = w; run.camera.viewH = h;
    run.camera.zoom = clamp(Math.round(Math.min(w / 560, h / 330)), 2, 8);
  }
}
window.addEventListener('resize', resize);

// ----------------------------------------------------------------- flow
function startRun(char: CharacterDef) {
  selectedChar = char;
  resize();
  run = new Run(char, save, {
    onLevelUp: choices => ui.cards('升级！', `等级 ${run?.level ?? 1} · 选择一项强化`, choices, c => run?.choose(c)),
    onChest: choices => ui.cards('宝箱', '选择一件战利品', choices, c => run?.choose(c)),
    onEnd: s => endRun(s),
  });
  run.camera.viewW = canvas.width;
  run.camera.viewH = canvas.height;
  run.camera.zoom = clamp(Math.round(Math.min(canvas.width / 560, canvas.height / 330)), 2, 8);
  musicTrack = -1;
  state = 'run';
  ui.hide();
  ui.showHud(true);
  audio.music();
}

function endRun(s: RunSummary) {
  state = 'results';
  save.gold += s.gold;
  save.totalKills += s.kills;
  save.runs++;
  if (s.victory) save.wins++;
  save.bestTime = Math.max(save.bestTime, s.time);
  for (const c of ['mage', 'rogue', 'brute']) {
    if (save.unlocked.includes(c)) continue;
    const need = { mage: { gold: 200 }, rogue: { time: 600 }, brute: { kills: 5000 } }[c as 'mage' | 'rogue' | 'brute']!;
    if ((need.gold && save.gold >= need.gold) || (need.time && save.bestTime >= need.time) || (need.kills && save.totalKills >= need.kills)) {
      save.unlocked.push(c);
    }
  }
  writeSave(save);
  audio.stopMusic();
  ui.results(s, () => startRun(selectedChar ?? run!.char), () => gotoTitle());
}

function gotoTitle() {
  state = 'title';
  run = null;
  ui.showHud(false);
  ui.title(save, {
    start: () => { audio.init(); ui.chars(save, c => { audio.init(); startRun(c); }, () => gotoTitle()); },
    shop: () => { audio.init(); showShop(); },
    help: () => ui.help(() => gotoTitle()),
    credits: () => ui.credits(credits, () => gotoTitle()),
  });
}

function showShop() {
  state = 'shop';
  ui.shop(save, id => {
    const m = META.find(x => x.id === id)!;
    const lvl = save.meta[id] ?? 0;
    if (lvl >= m.max) return;
    if (applyMetaCost(save, id, m.cost(lvl))) { audio.sfx('powerup', { vol: 0.5 }); showShop(); }
    else audio.sfx('ui_move', { vol: 0.4 });
  }, () => gotoTitle());
}

// ----------------------------------------------------------------- loop
function frame(now: number) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  acc += dt; frames++;
  if (acc >= 0.5) { fps = frames / acc; acc = 0; frames = 0; }

  input.update();
  handleKeys();

  if (state === 'run' && run) {
    if (!run.paused && (!run.over || run.dying)) {
      sched.run(dt, sdt => run!.update(sdt, input.axisX, input.axisY));
    }
    ctx.fillStyle = '#0a0b10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    run.render(ctx);
    ui.setHud(run.hud(fps));
    const track = Math.floor(run.time / 300);
    // Updating the run may have ended it and stopped the music.
    if (state === 'run' && track !== musicTrack) {
      if (musicTrack >= 0) audio.nextMusicTrack();
      musicTrack = track;
    }
  } else if (state !== 'boot') {
    drawIdleScene(dt);
  }

  input.endFrame();
  requestAnimationFrame(frame);
}

/** Slow-moving world behind the menus so the title screen is not a flat colour. */
let idleT = 0;
function drawIdleScene(dt: number) {
  idleT += dt;
  const w = canvas.width, h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0b10';
  ctx.fillRect(0, 0, w, h);
  const zoom = clamp(Math.round(Math.min(w / 560, h / 330)), 2, 8);
  const camX = Math.cos(idleT * 0.08) * 200, camY = Math.sin(idleT * 0.06) * 200;
  ctx.setTransform(zoom, 0, 0, zoom, w / 2 - camX * zoom, h / 2 - camY * zoom);
  const hw = w / 2 / zoom + 40, hh = h / 2 / zoom + 40;
  const b = { x0: camX - hw, y0: camY - hh, x1: camX + hw, y1: camY + hh };
  idleWorld.render(ctx, b, zoom, idleT);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(6,5,10,0.72)';
  ctx.fillRect(0, 0, w, h);
  const z2 = zoom * 2;
  ctx.setTransform(z2, 0, 0, z2, w / 2, h / 2 + 40 * z2);
  for (let i = 0; i < 5; i++) {
    const a = idleT * 0.5 + i * 1.4;
    draw(ctx, 'td_0121', Math.cos(a) * 60, Math.sin(a * 1.3) * 18, { scale: 1.2, alpha: 0.5 });
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

const idleWorld = new World();

// ----------------------------------------------------------------- boot
async function boot() {
  resize();
  ui.boot('载入素材…');
  try {
    await Promise.all([
      loadAtlas(),
      document.fonts.load("16px 'Kenney Mini'"),
      document.fonts.load("16px 'Kenney Pixel'"),
      fetch(`${import.meta.env.BASE_URL}assets/CREDITS.json`).then(r => r.json()),
    ]).then(([, , , c]) => { credits = (c as { packs: typeof credits }).packs; });
  } catch (err) {
    ui.boot('素材加载失败：' + String(err));
    return;
  }
  gotoTitle();
  requestAnimationFrame(t => { lastT = t; frame(t); });
}

function handleKeys() {
  if (input.wasPressed('KeyM')) {
    audio.setMuted(!audio.muted);
    save.muted = audio.muted;
    writeSave(save);
  }
  if (state === 'run' && run) {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
      if (ui.screen === 'levelup') return;
      run.paused = !run.paused;
      if (run.paused) ui.pause(() => { run!.paused = false; ui.hide(); }, () => endRun({ victory: false, time: run!.time, level: run!.level, kills: run!.kills, gold: run!.gold, weapons: [], character: run!.char.name }));
      else ui.hide();
    }
    if (ui.screen === 'levelup') {
      const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].findIndex(k => input.wasPressed(k));
      if (input.wasPressed('ArrowLeft')) ui.cardKeys(ui.cardIndex - 1, false, false);
      if (input.wasPressed('ArrowRight')) ui.cardKeys(ui.cardIndex + 1, false, false);
      ui.cardKeys(idx >= 0 ? idx : null, input.wasPressed('Enter') || idx >= 0, input.wasPressed('Space'));
    }
    if (input.wasPressed('Tab')) run.fastForward(60);
  }
}

audio.muted = save.muted;
window.addEventListener('pointerdown', () => { audio.init(); }, { once: true });
window.addEventListener('keydown', () => { audio.init(); }, { once: true });

// dev handle for console / automated playtesting
(window as unknown as Record<string, unknown>).__ns = {
  get run() { return run; },
  ui, input, save,
  start: (charId?: string) => {
    startRun(CHARACTERS.find(c => c.id === (charId ?? 'knight')) ?? CHARACTERS[0]);
  },
  gotoTitle,
  fmtTime,
  RUN_LENGTH,
};

boot();
