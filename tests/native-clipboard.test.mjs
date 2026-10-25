import assert from 'node:assert/strict';
import { test } from 'node:test';
import './register-unread-source.mjs';
const { readNativeClipboardImage, hasNativeImageClipboard } = await import(
  '../src/app/utils/clipboard.ts'
);

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let commands;
let result;
let failure;
globalThis.isTauri = true;
globalThis.window = {
  __TAURI_INTERNALS__: {
    invoke: async (command, payload) => {
      commands.push([command, payload]);
      assert.equal(command, 'desktop_read_clipboard_image');
      if (failure) throw new Error(failure);
      return result;
    },
  },
};
function reset() {
  commands = [];
  result = png.toString('base64');
  failure = undefined;
}

test('native GTK clipboard preserves PNG bytes and returns one attachment', async () => {
  reset();
  const file = await readNativeClipboardImage();
  assert.equal(file.type, 'image/png');
  assert.match(file.name, /^screenshot-\d+\.png$/);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png);
  assert.equal(commands.length, 1);
});

test('empty or text-only GTK clipboard is silent while real failures propagate', async () => {
  reset();
  result = null;
  assert.equal(await readNativeClipboardImage(), undefined);
  assert.equal(commands.length, 1);
  reset();
  failure = 'permission denied';
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
