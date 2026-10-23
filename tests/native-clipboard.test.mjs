import assert from 'node:assert/strict';
import { test } from 'node:test';
import './register-unread-source.mjs';
const { readNativeClipboardImage, hasNativeImageClipboard } = await import(
  '../src/app/utils/clipboard.ts'
);

const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]);
let commands;
let fail;
let encoded;
globalThis.isTauri = true;
globalThis.window = {
  __TAURI_INTERNALS__: {
    invoke: async (command, payload) => {
      commands.push([command, payload]);
      if (command === fail?.command) throw new Error(fail.message);
      if (command === 'plugin:clipboard-manager|read_image') return 42;
      if (command === 'plugin:image|size') return { width: 2, height: 1 };
      if (command === 'plugin:image|rgba') return pixels;
      if (command === 'plugin:resources|close') return undefined;
      throw new Error(command);
    },
  },
};
globalThis.ImageData = class {
  constructor(data, width, height) {
    Object.assign(this, { data, width, height });
  }
};
globalThis.document = {
  createElement: (tag) => {
    assert.equal(tag, 'canvas');
    return {
      getContext: () => ({
        putImageData: (data, x, y) => {
          assert.equal(x, 0);
          assert.equal(y, 0);
          assert.equal(data.width, 2);
          assert.equal(data.height, 1);
          assert.deepEqual(new Uint8Array(data.data), pixels);
        },
      }),
      toBlob: (callback, type) => {
        assert.equal(type, 'image/png');
        callback(encoded);
      },
    };
  },
};
function reset() {
  commands = [];
  fail = undefined;
  encoded = new Blob(['encoded PNG'], { type: 'image/png' });
}

test('native clipboard converts RGBA pixels to a PNG attachment and closes the resource', async () => {
  reset();
  const file = await readNativeClipboardImage();
  assert.equal(file.type, 'image/png');
  assert.match(file.name, /^screenshot-\d+\.png$/);
  assert.equal(await file.text(), 'encoded PNG');
  assert.deepEqual(
    commands.map(([name]) => name),
    [
      'plugin:clipboard-manager|read_image',
      'plugin:image|size',
      'plugin:image|rgba',
      'plugin:resources|close',
    ]
  );
  assert.deepEqual(commands.at(-1)[1], { rid: 42 });
});

test('native resources are closed on pixel and PNG encoding errors', async () => {
  for (const stage of ['rgba', 'encoding']) {
    reset();
    if (stage === 'rgba') fail = { command: 'plugin:image|rgba', message: 'pixel read failed' };
    else encoded = null;
    await assert.rejects(readNativeClipboardImage());
    assert.deepEqual(commands.at(-1), ['plugin:resources|close', { rid: 42 }]);
  }
});

test('empty or text-only native clipboard is silent while real failures propagate', async () => {
  reset();
  fail = {
    command: 'plugin:clipboard-manager|read_image',
    message:
      'The clipboard contents were not available in the requested format or the clipboard is empty.',
  };
  assert.equal(await readNativeClipboardImage(), undefined);
  assert.equal(commands.length, 1);
  reset();
  fail = { command: 'plugin:clipboard-manager|read_image', message: 'permission denied' };
  await assert.rejects(readNativeClipboardImage(), /permission denied/);
});

test('native image fallback is enabled only in a Linux desktop shell', () => {
  for (const [ua, native, expected] of [
    ['Mozilla X11 Linux x86_64', true, true],
    ['Mozilla Android Linux', true, false],
    ['Windows', true, false],
    ['Macintosh', true, false],
    ['Linux', false, false],
  ]) {
    Object.defineProperty(globalThis.navigator, 'userAgent', { configurable: true, value: ua });
    globalThis.isTauri = native;
    assert.equal(hasNativeImageClipboard(), expected, ua);
  }
});
