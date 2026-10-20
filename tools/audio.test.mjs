import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'vite';

const bundle = await build({
  configFile: false,
  base: '/night-survivors-ts/',
  logLevel: 'silent',
  build: { ssr: 'src/core/audio.ts', write: false, minify: false },
});
const code = bundle.output.find(file => file.type === 'chunk' && file.isEntry).code;
let instance = 0;

async function setup(t, failedTracks = []) {
  const requests = [], started = [], stopped = [];
  let release;
  const loading = new Promise(resolve => { release = resolve; });
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url);
    await loading;
    if (failedTracks.some(track => url.endsWith(track))) throw new Error('Optional audio unavailable');
    return { arrayBuffer: async () => new TextEncoder().encode(url).buffer };
  });
  class MockAudioContext {
    destination = {};
    currentTime = 1;
    createGain() {
      return { gain: { value: 0, linearRampToValueAtTime() {} }, connect(node) { return node; } };
    }
    async decodeAudioData(data) { return { duration: 20, url: new TextDecoder().decode(data) }; }
    createBufferSource() {
      return {
        buffer: null, loop: false, playbackRate: { value: 1 },
        connect(node) { return node; },
        start() { assert.ok(this.buffer, 'Playback must use a decoded buffer'); started.push(this); },
        stop() { stopped.push(this); },
      };
    }
  }
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { AudioContext: MockAudioContext }, configurable: true });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
  const { audio } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${instance++}`);
  return { audio, requests, started, stopped, release };
}

test('a run started during audio loading plays music once loading completes, then switches tracks', async t => {
  const { audio, requests, started, stopped, release } = await setup(t);
  const init = audio.init();
  assert.equal(requests.length, 22);
  assert.ok(requests.every(url => url.startsWith('/night-survivors-ts/assets/audio/')));
  audio.music();
  assert.equal(started.length, 0);
  release();
  await init;
  assert.equal(audio.ready, true);
  assert.equal(started.length, 1);
  assert.ok(started[0].buffer.url.endsWith('music_a.m4a'));
  audio.nextMusicTrack();
  assert.equal(started.length, 2);
  assert.equal(stopped[0], started[0]);
  assert.ok(started[1].buffer.url.endsWith('music_b.m4a'));
});

test('leaving a run before loading finishes cancels deferred music', async t => {
  const { audio, started, release } = await setup(t);
  const init = audio.init();
  audio.music();
  audio.stopMusic();
  release();
  await init;
  assert.equal(started.length, 0);
  audio.music();
  assert.equal(started.length, 1);
});

test('an unavailable first music track is skipped when playing and cycling', async t => {
  const { audio, started, release } = await setup(t, ['music_a.m4a']);
  const init = audio.init();
  release();
  await init;
  audio.music();
  audio.nextMusicTrack();
  audio.nextMusicTrack();
  assert.deepEqual(started.map(source => source.buffer.url.split('/').at(-1)), [
    'music_b.m4a', 'music_c.m4a', 'music_b.m4a',
  ]);
});

test('all music missing leaves audio ready and sound effects playable', async t => {
  const { audio, started, release } = await setup(t, ['music_a.m4a', 'music_b.m4a', 'music_c.m4a']);
  const init = audio.init();
  audio.music();
  release();
  await init;
  audio.nextMusicTrack();
  assert.equal(audio.ready, true);
  assert.equal(started.length, 0);
  audio.sfx('coin');
  assert.equal(started.length, 1);
  assert.ok(started[0].buffer.url.endsWith('coin.ogg'));
});
