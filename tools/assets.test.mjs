import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';

for (const base of ['/', '/night-survivors-ts/']) {
  test(`atlas loads under ${base} and preserves explicit URLs`, async t => {
    const { output } = await build({
      configFile: false,
      logLevel: 'silent',
      base,
      build: { ssr: 'src/core/render.ts', write: false, minify: false },
    });
    const { loadAtlas } = await import(
      `data:text/javascript;base64,${Buffer.from(output.find(o => o.type === 'chunk').code).toString('base64')}`
    );
    const requests = [];
    const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    t.after(() => {
      for (const [key, descriptor] of [['Image', previousImage], ['document', previousDocument]]) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    });
    globalThis.Image = class {
      width = 1;
      height = 1;
      set src(url) { requests.push(url); this.onload(); }
    };
    globalThis.document = {
      createElement: () => ({ getContext: () => ({ drawImage() {} }) }),
    };
    t.mock.method(globalThis, 'fetch', async url => {
      requests.push(url);
      return { json: async () => ({ frames: { test: [0, 0, 1, 1] } }) };
    });

    await loadAtlas();
    assert.deepEqual(requests, [base + 'assets/atlas.png', base + 'assets/atlas.json']);
    requests.length = 0;
    await loadAtlas('/custom/atlas.png', '/custom/atlas.json');
    assert.deepEqual(requests, ['/custom/atlas.png', '/custom/atlas.json']);
  });
}
