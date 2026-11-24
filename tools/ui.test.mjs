import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'vite';

test('reward cards close after picking or skipping and leave any next reward visible', async t => {
  const { output } = await build({
    logLevel: 'silent',
    build: { ssr: 'src/ui/ui.ts', write: false },
  });
  const { code } = output.find(file => file.type === 'chunk' && file.isEntry);
  const { UI } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  globalThis.document = {
    createElement: () => ({ getContext: () => ({}), toDataURL: () => 'data:,' }),
  };
  t.after(() => { delete globalThis.document; });
  const screen = { innerHTML: '', querySelectorAll: () => [] };
  const hud = { querySelector: () => ({}) };
  const ui = new UI({ querySelector: selector => selector === '#screen' ? screen : hud });
  const choice = { name: 'Upgrade', sprite: 'coin' };
  const picked = [];

  ui.cards('First reward', '', [choice], value => {
    picked.push(value);
    ui.cards('Second reward', '', [choice], next => picked.push(next));
  });
  ui.cardKeys(null, true, true); // Skip and confirm arrived in the same frame.
  assert.deepEqual(picked, [null]);
  assert.match(screen.innerHTML, /Second reward/);
  ui.cardKeys(0, true, false);
  assert.deepEqual(picked, [null, choice]);
  assert.equal(ui.screen, 'none');
  assert.equal(screen.innerHTML, '');

  ui.cards('Final reward', '', [choice], value => picked.push(value));
  ui.cardKeys(null, false, true);
  assert.deepEqual(picked, [null, choice, null]);
  assert.equal(ui.screen, 'none');
  assert.equal(screen.innerHTML, '');
});
