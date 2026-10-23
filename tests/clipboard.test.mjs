import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createFilePasteHandler } from '../src/app/utils/filePaste.ts';
import { getDataTransferFiles } from '../src/app/utils/dom.ts';

const image = new File([new Uint8Array([1, 2, 3])], 'screenshot.png', { type: 'image/png' });
const key = (values = {}) => ({
  key: 'v',
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  defaultPrevented: false,
  ...values,
});
const paste = (values = {}) => ({
  clipboardData: { files: [], items: [], getData: () => '', ...values },
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function setup(options = {}) {
  const files = [];
  const errors = [];
  let reads = 0;
  const handler = createFilePasteHandler({
    getFiles: getDataTransferFiles,
    readImage: async () => {
      reads += 1;
      return image;
    },
    onFiles: (value) => files.push(...value),
    onError: () => errors.push('failed'),
    disabled: false,
    ...options,
  });
  return { handler, files, errors, reads: () => reads };
}

test('files and items clipboard paths each attach once, suppress default insertion and cancel native fallback', async () => {
  for (const data of [
    { files: [image], items: [{ kind: 'file', getAsFile: () => image }] },
    {
      items: [
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => image },
        { kind: 'file', getAsFile: () => null },
      ],
    },
  ]) {
    const s = setup();
    s.handler.onKeyDown(key());
    const e = paste(data);
    s.handler.onPaste(e);
    await delay(130);
    assert.deepEqual(s.files, [image]);
    assert.equal(e.defaultPrevented, true);
    assert.equal(s.reads(), 0);
    s.handler.dispose();
  }
});

test('empty Linux paste uses native image; no-event Ctrl+V and Shift+Insert also work', async () => {
  for (const mode of ['event', 'ctrl-v', 'shift-insert']) {
    const s = setup();
    if (mode === 'event') {
      const e = paste();
      s.handler.onPaste(e);
      assert.equal(e.defaultPrevented, true);
    } else
      s.handler.onKeyDown(
        mode === 'ctrl-v' ? key() : key({ key: 'Insert', ctrlKey: false, shiftKey: true })
      );
    await delay(130);
    assert.deepEqual(s.files, [image]);
    assert.equal(s.reads(), 1);
    s.handler.dispose();
  }
});

test('text and URLs keep normal paste and never read a stale clipboard image', async () => {
  for (const text of ['ordinary text', 'https://example.org']) {
    const s = setup();
    s.handler.onKeyDown(key());
    const e = paste({ getData: (type) => (type === 'text/plain' ? text : '') });
    s.handler.onPaste(e);
    await delay(130);
    assert.equal(e.defaultPrevented, false);
    assert.deepEqual(s.files, []);
    assert.equal(s.reads(), 0);
    s.handler.dispose();
  }
});

test('late DOM paste invalidates an in-flight key fallback instead of attaching twice', async () => {
  const pending = deferred();
  const s = setup({ readImage: () => pending.promise });
  s.handler.onKeyDown(key());
  await delay(130);
  s.handler.onPaste(paste({ files: [image] }));
  pending.resolve(image);
  await delay(0);
  assert.deepEqual(s.files, [image]);
  s.handler.dispose();
});

test('room/thread switch or unmount discards a pending native clipboard result', async () => {
  const pending = deferred();
  const s = setup({ readImage: () => pending.promise });
  s.handler.onPaste(paste());
  s.handler.dispose();
  s.handler.activate(); // React strict mode or a new context on the same handler.
  pending.resolve(image);
  await delay(0);
  assert.deepEqual(s.files, []);
});

test('read-only, ordinary web and modified shortcuts do not read the native clipboard', async () => {
  for (const options of [{ disabled: true }, { readImage: undefined }]) {
    const s = setup(options);
    s.handler.onKeyDown(key());
    const e = paste();
    s.handler.onPaste(e);
    await delay(130);
    assert.equal(e.defaultPrevented, false);
    assert.deepEqual(s.files, []);
    assert.equal(s.reads(), 0);
    s.handler.dispose();
  }
  const s = setup();
  for (const values of [
    { shiftKey: true },
    { altKey: true },
    { metaKey: true },
    { repeat: true },
    { defaultPrevented: true },
    { key: 'c' },
  ])
    s.handler.onKeyDown(key(values));
  await delay(130);
  assert.equal(s.reads(), 0);
  s.handler.dispose();
});

test('no-image clipboard is silent; unexpected native failures surface an error', async () => {
  const empty = setup({ readImage: async () => undefined });
  empty.handler.onPaste(paste());
  await delay(0);
  assert.deepEqual(empty.files, []);
  assert.deepEqual(empty.errors, []);
  const failed = setup({
    readImage: async () => {
      throw new Error('denied');
    },
  });
  failed.handler.onPaste(paste());
  await delay(0);
  assert.deepEqual(failed.files, []);
  assert.deepEqual(failed.errors, ['failed']);
});
