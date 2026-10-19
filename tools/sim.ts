/**
 * Headless regression + balance harness. Bundled for node with:
 *   npx vite build --ssr tools/sim.ts --outDir .sim --minify false && node .sim/sim.js
 * Exposed as `npm run sim`. Exits non-zero when an invariant breaks.
 */
import { mulberry32 } from '../src/core/engine';
import { Run } from '../src/game/run';
import type { Choice, RunSummary } from '../src/game/run';
import type { Enemy } from '../src/game/entities';
import { CHARACTERS, ENEMY_MAP, PASSIVES, RUN_LENGTH, WEAPONS } from '../src/data/gameData';
import type { SaveData } from '../src/game/meta';

const freshSave = (): SaveData => ({
  gold: 0, totalKills: 0, bestTime: 0, runs: 0, wins: 0, meta: {}, unlocked: ['knight'], muted: true,
});

type Policy = 'up' | 'wide' | 'random';
const RANKS: Record<Policy, Record<string, number>> = {
  up: { evolve: 0, weaponUp: 1, passiveUp: 2, passive: 3, weapon: 4, heal: 5, gold: 6 },
  wide: { evolve: 0, weapon: 1, passive: 3, weaponUp: 2, passiveUp: 4, heal: 5, gold: 6 },
  random: {},
};

interface Report {
  char: string; policy: Policy; end: number; victory: boolean; level: number;
  levelAt: Record<number, number>; kills: number; gold: number;
  maxEnemies: number; maxProjectiles: number; maxLoot: number; maxParticles: number;
  picks: number; msPerStep: number; errors: string[];
}

const DT = 1 / 60;

function simulate(charId: string, policy: Policy, opts: { seconds?: number; seedGold?: number; seed?: number } = {}): Report {
  const char = CHARACTERS.find(c => c.id === charId)!;
  const save = freshSave();
  if (opts.seedGold) save.gold = opts.seedGold;
  const errors: string[] = [];
  let ended: RunSummary | null = null;
  const levels: Record<number, number> = {};

  const run = new Run(char, save, {
    onLevelUp: () => {}, onChest: () => {}, onEnd: s => { ended = s; },
  }, opts.seed ?? 20251014);
  run.camera.viewW = 1920; run.camera.viewH = 1080; run.camera.zoom = 3;

  let picks = 0, maxEnemies = 0, maxProjectiles = 0, maxLoot = 0, maxParticles = 0;
  const total = Math.round((opts.seconds ?? RUN_LENGTH) * 60);
  const t0 = performance.now();

  for (let i = 0; i < total && !run.over; i++) {
    // Players engage to deal damage and only back off when touched; a pure-flee bot
    // starves every directional weapon because facing follows movement.
    let near = 1e9, nx = 0, ny = 0, threats = 0;
    for (const e of run.enemies.list) {
      const dx = e.x - run.x, dy = e.y - run.y;
      const d = Math.hypot(dx, dy);
      if (d < 200) threats++;
      if (d < near) { near = d; nx = dx; ny = dy; }
    }
    let ax = 0, ay = 0;
    if (near < 95) { ax = -nx; ay = -ny; }                    // keep out of touching range
    else if (near < 210) { ax = nx * 0.18; ay = ny * 0.18; }  // creep in only while safe
    let bl: null | { x: number; y: number } = null, bd = Infinity;
    for (const l of run.loot.list) {
      const d = Math.hypot(l.x - run.x, l.y - run.y);
      if (d < bd) { bd = d; bl = l; }
    }
    if (bl && (threats === 0 ? bd < 500 : bd < 110)) { ax += (bl.x - run.x) / bd * 90; ay += (bl.y - run.y) / bd * 90; }
    if (ax === 0 && ay === 0) { ax = Math.cos(i / 211) * 60; ay = Math.sin(i / 211) * 60; }
    const m = Math.hypot(ax, ay) || 1;

    run.update(DT, ax / m, ay / m);

    if (run.paused) {
      const choices = roll(run, policy);
      run.choose(choices[0] ?? null);
      picks++;
    }

    maxEnemies = Math.max(maxEnemies, run.enemies.list.length);
    maxProjectiles = Math.max(maxProjectiles, run.proj.list.length);
    maxLoot = Math.max(maxLoot, run.loot.list.length);
    maxParticles = Math.max(maxParticles, run.parts.list.length);
    const end = ended as RunSummary | null;
    if (end && !Number.isFinite(end.gold)) errors.push('run summary gold is non-finite');

    if (!Number.isFinite(run.x) || !Number.isFinite(run.y)) { errors.push(`player position went non-finite at t=${run.time.toFixed(1)}`); break; }
    if (run.enemies.list.length > 340) { errors.push(`enemy cap breached: ${run.enemies.list.length} at t=${run.time.toFixed(1)}`); break; }
    if (errors.length > 4) break;
    for (const mark of [180, 360, 600, 900]) {
      if (Math.abs(run.time - mark) < DT && levels[mark] === undefined) levels[mark] = run.level;
    }
  }

  const msPerStep = (performance.now() - t0) / Math.max(1, total);
  return {
    char: charId, policy, end: Math.round(run.time), victory: run.victory, level: run.level, levelAt: levels,
    kills: run.kills, gold: run.gold, maxEnemies, maxProjectiles, maxLoot, maxParticles, picks,
    msPerStep: +msPerStep.toFixed(3), errors,
  };
}

/** Mirrors what the DOM layer would hand back, without needing a document. */
function roll(run: Run, policy: Policy): Choice[] {
  const choices = (run as unknown as { rollChoices(n: number, bonus: boolean): Choice[] }).rollChoices(4, false);
  const rank = RANKS[policy];
  if (policy === 'random') return choices;
  return choices.slice().sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
}

// ------------------------------------------------------------- feature tests
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  return ok;
}

function makeRun(charId = 'knight', seed = 1234): Run {
  const run = new Run(CHARACTERS.find(c => c.id === charId)!, freshSave(), {
    onLevelUp: () => {}, onChest: () => {}, onEnd: () => {},
  }, seed);
  run.camera.viewW = 1920; run.camera.viewH = 1080; run.camera.zoom = 3;
  return run;
}

function testAllWeaponsFire(): boolean {
  let ok = true;
  for (const def of WEAPONS) {
    const run = makeRun();
    run.weapons.length = 0;
    run.weapons.push({ id: def.id, level: 8, timer: 0, evolved: false, phase: 0 });
    for (let i = 0; i < 60 * 25; i++) {
      run.update(DT, Math.sin(i / 30), Math.cos(i / 24));
      if (run.paused) run.choose(null);
    }
    const fired = run.kills > 0 || run.proj.list.length > 0;
    ok = check(`weapon ${def.id} (${def.kind}) fires`, fired, `kills=${run.kills}`) && ok;
  }
  return ok;
}

function testEvolution(): boolean {
  const run = makeRun();
  const def = WEAPONS[0];
  run.weapons.length = 0;
  run.weapons.push({ id: def.id, level: def.levels.length, timer: 0, evolved: false, phase: 0 });
  const choicesBefore = roll(run, 'up').map(c => c.kind);
  run.passives[def.evolve!.needs] = 1;
  run.stats = run.computeStats();
  const choices = roll(run, 'up');
  const evo = choices.find(c => c.kind === 'evolve');
  check('evolution hidden before the partner passive is owned', !choicesBefore.includes('evolve'));
  const ok = check('evolution offered once partner is owned', !!evo, `got ${choices.map(c => c.kind).join(',')}`);
  if (evo) {
    run.choose(evo);
    const evolved = run.weapons[0].evolved;
    return check('evolving mutates the weapon', evolved && ok);
  }
  return ok;
}

function testChestAndBoss(): boolean {
  const run = makeRun();
  let chestShown = 0;
  (run as unknown as { hooks: { onChest: () => void } }).hooks.onChest = () => { chestShown++; };
  const before = run.pendingChests;
  run.loot.spawn('chest', run.x + 10, run.y, 0, 'chest');
  for (let i = 0; i < 60 * 4 && !run.paused; i++) run.update(DT, 0, 0);
  const picked = run.pendingChests > before || run.paused;
  const ok1 = check('chest pickup queues a reward', picked);
  if (run.paused) run.choose(null);
  const ok2 = check('chest reward screen fired', chestShown > 0);
  const boss = run.enemies.spawn('golem', run.x + 60, run.y, 1);
  boss.hp = 1;
  run.hitEnemy(boss, 999, 0, 0);
  return check('boss death drops a chest', run.pendingChests > 0, `pending=${run.pendingChests}`) && ok1 && ok2;
}

function testDeathAndRevive(): boolean {
  const run = makeRun();
  let ended: RunSummary | null = null;
  (run as unknown as { hooks: { onEnd: (s: RunSummary) => void } }).hooks.onEnd = (s) => { ended = s; };
  run.revivesLeft = 1;
  run.damagePlayer(99999);
  const revived = !run.over && run.hp > 0;
  const ok1 = check('revive consumes one charge and keeps the run alive', revived && run.revivesLeft === 0);
  run.damagePlayer(99999);
  const immediate = run.over && !ended;
  // the collapse is a beat of slow motion, so onEnd only lands once it has played out
  for (let i = 0; i < 120 && !ended; i++) { run.dying = true; run.update(DT, 0, 0); }
  return check('death plays an animation before reporting the result', immediate && !!ended, `onEnd deferred=${immediate}`)
    && check('run is marked over at the moment of death', run.over) && ok1;
}

function testMetaAndXp(): boolean {
  const run = makeRun('mage');
  const base = run.computeStats();
  const save = freshSave();
  save.meta = { m_might: 5, m_hp: 5, m_armor: 3, m_cooldown: 3, m_revive: 1 };
  const boosted = new Run(CHARACTERS.find(c => c.id === 'mage')!, save, {
    onLevelUp: () => {}, onChest: () => {}, onEnd: () => {},
  }).computeStats();
  check('meta upgrades raise might/hp/armor', boosted.might > base.might && boosted.maxHp > base.maxHp && boosted.armor > base.armor,
    `${base.might.toFixed(2)}/${base.maxHp} -> ${boosted.might.toFixed(2)}/${boosted.maxHp}`);
  const lvl0 = run.level;
  run.addXp(100000);
  return check('xp overflow grants multiple levels', run.level > lvl0 + 10, `level ${lvl0} -> ${run.level}`);
}

function testEveryPassiveApplies(): boolean {
  let ok = true;
  for (const p of PASSIVES) {
    const run = makeRun();
    const before = run.computeStats();
    run.passives[p.id] = p.max;
    const after = run.computeStats();
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    ok = check(`passive ${p.id} changes stats at max level`, changed) && ok;
  }
  return ok;
}

/**
 * Objective per-weapon throughput, independent of bot skill: a ring of disposable dummies
 * measures coverage (kills landed), and a tanky dummy measures sustained dps.
 */
function testWeaponThroughput(): boolean {
  console.log('\n=== weapon throughput (20s, ring of live slimes + a tank) ===');
  console.log('weapon      lv1 clr  lv4 clr  lv8 clr  lv8 dps  value  evo value  evo/lv8');
  const rows: string[] = [];
  const values: Record<string, number> = {};
  for (const def of WEAPONS) {
    const l1 = probeWeapon(def.id, 1, false), l4 = probeWeapon(def.id, 4, false), l8 = probeWeapon(def.id, 8, false);
    const ev = probeWeapon(def.id, 8, true);
    const evoValue = ev.clears * ENEMY_MAP.slime.hp + ev.dps;
    // value = crowd dps (clears x slime ehp) + boss dps; the two roles a weapon must cover
    const value = l8.clears * ENEMY_MAP.slime.hp + l8.dps;
    values[def.id] = value;
    rows.push(`${def.id.padEnd(11)} ${String(l1.clears).padEnd(8)} ${String(l4.clears).padEnd(8)} ${String(l8.clears).padEnd(8)} ${String(l8.dps).padEnd(8)} ${String(value).padEnd(6)} ${String(evoValue).padEnd(10)} ${(evoValue / Math.max(1, value)).toFixed(2)}`);
  }
  rows.forEach(r => console.log(r));
  const list = Object.entries(values);
  const best = list.reduce((a, b) => (b[1] > a[1] ? b : a)), worst = list.reduce((a, b) => (b[1] < a[1] ? b : a));
  const spread = best[1] / Math.max(1, worst[1]);
  console.log(`  total-output spread at lv8: ${best[0]} ${best[1]} vs ${worst[0]} ${worst[1]} = ${spread.toFixed(1)}x`);
  return check('every weapon within 2.5x of the strongest on total output', spread <= 2.5, `${spread.toFixed(1)}x — ${worst[0]} is a trap pick`);
}

/** Realistic throughput: clear a stocked ring of live enemies, and chew on a tank. */
const SEEDS = [7, 21, 44];

function armWeapon(run: Run, id: string, level: number, evolved: boolean) {
  run.weapons.length = 0;
  run.weapons.push({ id, level, timer: 0, evolved, phase: 0 });
  if (evolved) run.passives[WEAPONS.find(w => w.id === id)!.evolve!.needs] = 1;
  run.stats = run.computeStats();
}

function probeWeapon(id: string, level: number, evolved: boolean): { clears: number; dps: number } {
  const steps = Math.round(20 * 60);
  let clears = 0, dps = 0;
  for (const seed of SEEDS) {
    const rnd = mulberry32(seed * 31 + 5);
    const run = makeRun('knight', seed);
    armWeapon(run, id, level, evolved);
    for (let i = 0; i < steps; i++) {
      while (run.enemies.list.length < 30) {
        const a = rnd() * Math.PI * 2;
        const d = 30 + rnd() * 120;
        run.enemies.spawn('slime', run.x + Math.cos(a) * d, run.y + Math.sin(a) * d, 1);
      }
      run.update(DT, 0, 0);
      if (run.paused) run.choose(null);
    }
    clears += run.kills;

    const t = makeRun('knight', seed + 1);
    armWeapon(t, id, level, evolved);
    // three dummies at different ranges: a reach-dependent weapon must not be scored 0
    const TANK_HP = 1e9;
    const tanks = [40, 80, 130].map(dx => {
      const e = t.enemies.spawn('brute', t.x + dx, t.y, TANK_HP / ENEMY_MAP.brute.hp);
      e.radius = 6;
      return e;
    });
    for (let i = 0; i < steps; i++) {
      tanks.forEach((e, k) => { e.x = t.x + [40, 80, 130][k]; e.y = t.y; });
      t.update(DT, 0, 0);
      if (t.paused) t.choose(null);
    }
    dps += tanks.reduce((a, e) => a + (TANK_HP - Math.max(0, e.hp)), 0) / 20;
  }
  return { clears: Math.round(clears / SEEDS.length), dps: Math.round(dps / SEEDS.length) };
}

/**
 * Bot-independent difficulty read: run the spawn director against a motionless dummy and
 * record how much enemy hp and how many contact hits arrive per second, then compare that
 * with what a build of the level the player should be at can actually output.
 */
function testPressureCurve(): boolean {
  console.log('\n=== swarm pressure vs build output (immobile dummy, cannot die) ===');
  console.log('  min  arriving-hp/s  hits/s  expected-lvl  build-out/s  margin');
  const run = makeRun('knight', 99);
  run.weapons.length = 0;                                  // measure the wave alone
  let hits = 0;
  const realDamage = run.damagePlayer.bind(run);
  (run as unknown as { damagePlayer: (a: number, e?: Enemy) => void }).damagePlayer = (a, e) => {
    const before = run.hp;
    realDamage(a, e);
    if (before !== run.hp) hits++;
    run.hp = run.stats.maxHp;                       // immortal probe, honest hit accounting
  };
  const seen = new Set<number>();
  let arriving = 0, rows = 0;
  let worst = Infinity, worstAt = 0;
  for (let step = 0; step < 60 * 900; step++) {
    run.update(DT, 0, 0);
    if (run.paused) run.choose(null);
    for (const e of run.enemies.list) {
      if (seen.has(e.id)) continue;
      if (Math.hypot(e.x - run.x, e.y - run.y) < 200) { seen.add(e.id); arriving += e.maxHp; }
    }
    if (step % 3600 === 3599) {
      const minutes = (step + 1) / 3600;
      const hpIn = arriving / 60;
      const lvl = Math.max(1, Math.round(minutes * 2.1));         // level a normal player is at
      const output = 62 * Math.pow(lvl, 1.34);                    // hp/s a normal build deletes
      const margin = output / Math.max(1, hpIn);
      if (margin < worst) { worst = margin; worstAt = minutes; }
      rows++;
      console.log(`${String(Math.round(minutes)).padStart(5)} ${hpIn.toFixed(0).padStart(15)} ${(hits / 60).toFixed(1).padStart(7)} ${String(lvl).padStart(13)} ${output.toFixed(0).padStart(12)} ${margin.toFixed(2).padStart(8)}`);
      arriving = 0; hits = 0;
    }
  }
  if (!rows) console.log('  (no samples)');
  console.log(`  worst margin ${worst.toFixed(2)} at minute ${worstAt} — below 0.8 means the wave outruns a normally-levelled player`);
  return check('swarm pressure stays within reach of a normally-levelled build', worst >= 0.8, `worst ${worst.toFixed(2)} @ min ${worstAt}`);
}

// ---------------------------------------------------------------------- main
async function main() {
  console.log('\n=== feature tests ===');
  const feats = [
    testAllWeaponsFire(),
    testEvolution(),
    testChestAndBoss(),
    testDeathAndRevive(),
    testMetaAndXp(),
    testEveryPassiveApplies(),
    testWeaponThroughput(),
    testPressureCurve(),
  ];

  console.log('\n=== balance: 15-minute runs (kiting bot) ===');
  console.log('char    policy  end   win lvl  kills  gold  pick  maxEn maxPr maxLt ms/step');
  const reports: Report[] = [];
  for (const c of CHARACTERS) {
    for (const policy of ['up', 'wide'] as Policy[]) {
      const r = simulate(c.id, policy, { seed: 1000 + CHARACTERS.indexOf(c) * 17 + (policy === 'up' ? 3 : 5) });
      reports.push(r);
      console.log(
        `${c.id.padEnd(7)} ${policy.padEnd(7)} ${String(r.end).padEnd(5)} ${String(r.victory).padEnd(5)} ${String(r.level).padEnd(4)} ${String(r.kills).padEnd(6)} ${String(r.gold).padEnd(5)} ${String(r.picks).padEnd(5)} ${String(r.maxEnemies).padEnd(5)} ${String(r.maxProjectiles).padEnd(5)} ${String(r.maxLoot).padEnd(5)} ${r.msPerStep}`
      );
      console.log(`        level curve: ${[180, 360, 600, 900].map(m => `${m / 60}m:${r.levelAt[m] ?? '-'}`).join('  ')}`);
      if (r.errors.length) console.log(`        ERRORS: ${r.errors.join(' | ')}`);
    }
  }

  console.log('\n=== meta progression: a geared save ===');
  const geared = simulate('brute', 'up', { seedGold: 5000, seed: 777 });
  console.log(`brute with 5000 banked gold: end=${geared.end} victory=${geared.victory} level=${geared.level} kills=${geared.kills}`);

  const wins = reports.filter(r => r.victory).length;
  const avgLevel = Math.round(reports.reduce((s, r) => s + r.level, 0) / reports.length);
  const worstMs = Math.max(...reports.map(r => r.msPerStep));
  let invariantFail = reports.some(r => r.errors.length) || feats.some(f => !f);

  const past10 = reports.filter(r => r.end >= 600).length;
  console.log(`\nsummary: avg level ${avgLevel} · ${wins}/${reports.length} survived to 15:00 · ${past10}/${reports.length} past 10:00`);
  console.log(`(the bot only flees and grabs gems; treat these as a floor on human performance, not a difficulty verdict)`);
  console.log(`worst sim step ${worstMs} ms of the 16.7 ms frame budget, before rendering`);
  const tooSoft = past10 < 2;
  if (tooSoft) console.log('NOTE: fewer than 2 bot runs reach 10:00 — the mid game may be punishing');
  invariantFail ||= reports.some(r => r.errors.length);
  console.log(invariantFail ? 'RESULT: FAILURES DETECTED\n' : 'RESULT: all checks passed\n');
  process.exit(invariantFail ? 1 : 0);
}

main();
