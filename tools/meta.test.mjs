import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

async function loadModule(entry) {
  const result = await build({
    root: fileURLToPath(new URL('..', import.meta.url)),
    logLevel: 'silent',
    build: { ssr: entry, write: false, minify: false },
  });
  const { code } = result.output.find(output => output.type === 'chunk' && output.isEntry);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const [{ defaultSave, loadSave, metaLevel }, { Run }, { CHARACTERS, META }] = await Promise.all([
  loadModule('src/game/meta.ts'),
  loadModule('src/game/run.ts'),
  loadModule('src/data/gameData.ts'),
]);

function readStored(raw, unavailable = false) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const writes = [];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        assert.equal(key, 'night-survivors.save.v1');
        if (unavailable) throw new Error('storage unavailable');
        return raw;
      },
      setItem: (...args) => writes.push(args),
      removeItem: (...args) => writes.push(args),
      clear: () => writes.push([]),
    },
  });
  try {
    const save = loadSave();
    assert.deepEqual(writes, [], 'reading a save must not overwrite stored data');
    return save;
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

function startRun(save) {
  return new Run(CHARACTERS[0], save, {
    onLevelUp() {}, onChest() {}, onEnd() {},
  }, 123);
}

test('valid saves preserve all progress and preferences', () => {
  const stored = {
    gold: 1200, totalKills: 321, bestTime: 125.5, runs: 4, wins: 1,
    meta: { m_hp: 2, m_might: 3 }, unlocked: ['knight', 'mage'], muted: true,
  };
  const save = readStored(JSON.stringify(stored));
  assert.deepEqual(save, stored);
  assert.ok(Number.isFinite(startRun(save).hp));
});

test('older partial saves retain valid fields and receive missing defaults', () => {
  const stored = { gold: 250, bestTime: 92.5, meta: { m_hp: 2 } };
  assert.deepEqual(readStored(JSON.stringify(stored)), { ...defaultSave(), ...stored });
});

test('null meta and unlocked fields recover without losing valid gold', () => {
  const save = readStored('{"gold":123,"meta":null,"unlocked":null}');
  assert.equal(save.gold, 123);
  assert.deepEqual(save.meta, {});
  assert.deepEqual(save.unlocked, ['knight']);
  assert.equal(metaLevel(save, 'm_might'), 0);
  assert.equal(save.unlocked.includes('mage'), false);
  assert.ok(Number.isFinite(startRun(save).hp));
});

test('invalid numbers and field types cannot poison run stats', () => {
  const save = readStored(`{
    "gold":"9","totalKills":1e400,"bestTime":-1,"runs":null,"wins":3,
    "meta":{"m_hp":"broken","m_armor":null,"m_speed":1e400,"m_luck":-1,"m_revive":0.5,"m_might":2},
    "muted":"false","unlocked":["mage",null,12,"knight","mage"]
  }`);
  assert.deepEqual(save, {
    ...defaultSave(), wins: 3, meta: { m_might: 2 }, unlocked: ['knight', 'mage'],
  });
  const run = startRun(save);
  assert.ok(Number.isFinite(run.hp));
  assert.ok(Object.values(run.stats).every(Number.isFinite));
});

test('out-of-range upgrades recover while valid progress and maximum levels survive', () => {
  const save = readStored('{"gold":123,"meta":{"m_hp":1e308,"m_cooldown":100,"m_might":2,"unknown":1}}');
  assert.equal(save.gold, 123);
  assert.deepEqual(save.meta, { m_might: 2 });
  const run = startRun(save);
  assert.ok(Number.isFinite(run.hp));
  assert.ok(run.stats.cooldown > 0);
  assert.ok(Object.values(run.stats).every(Number.isFinite));

  const levels = Object.fromEntries(META.map(upgrade => [upgrade.id, upgrade.max]));
  const maxSave = readStored(JSON.stringify({ meta: levels }));
  assert.deepEqual(maxSave.meta, levels);
  assert.ok(Object.values(startRun(maxSave).stats).every(Number.isFinite));
});

test('the default character remains available when unlocked is empty or incomplete', () => {
  assert.deepEqual(readStored('{"unlocked":[]}').unlocked, ['knight']);
  assert.deepEqual(readStored('{"unlocked":["mage"]}').unlocked, ['knight', 'mage']);
});

test('missing, malformed, and non-object saves fall back without writing', () => {
  for (const raw of [null, '', '{invalid', 'null', '[]', '123', '"invalid"']) {
    assert.deepEqual(readStored(raw), defaultSave());
  }
  assert.deepEqual(readStored(null, true), defaultSave());
});
