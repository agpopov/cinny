import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { ClientEvent, MatrixEventEvent, RoomStateEvent } from 'matrix-js-sdk';

const fixture = new URL('./fixtures/call-widget.mjs', import.meta.url).href;
const callEmbedUrl = new URL('../src/app/plugins/call/CallEmbed.ts', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL === callEmbedUrl &&
      ['./CallWidgetDriver', './CallControl', './types', 'matrix-widget-api'].includes(specifier)
    ) {
      return nextResolve(fixture, context);
    }
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { CallEmbed } = await import(callEmbedUrl);
const { checkIndexedDBSupport } = await import('../src/app/utils/featureCheck.ts');
const { selectFile, copyToClipboard } = await import('../src/app/utils/dom.ts');
const { tallyPoll } = await import('../src/app/utils/poll.ts');
const { sanitizeCustomHtml } = await import('../src/app/utils/sanitize.ts');

const mockGlobal = (t, name, value) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  });
};

test('ending repeated calls releases every Matrix subscription and iframe load callback', (t) => {
  const mx = new EventEmitter();
  mx.getRooms = () => [];
  mx.getSafeUserId = () => '@me:example.org';
  mockGlobal(t, 'document', { createElement: () => ({ style: {} }) });
  const room = { roomId: '!room:example.org' };
  const container = { append() {}, removeChild() {} };
  const events = [
    ClientEvent.Event,
    MatrixEventEvent.Decrypted,
    RoomStateEvent.Events,
    ClientEvent.ToDeviceEvent,
  ];
  const existingHandler = () => {};
  events.forEach((event) => mx.on(event, existingHandler));
  for (let i = 0; i < 20; i += 1) {
    const embed = new CallEmbed(mx, room, { getCompleteUrl: () => 'about:blank' }, container);
    events.forEach((event) => assert.equal(mx.listenerCount(event), 2));
    embed.dispose();
    events.forEach((event) => assert.deepEqual(mx.listeners(event), [existingHandler]));
    assert.equal(embed.iframe.onload, null);
  }
});

test('the IndexedDB probe closes its connection before deleting the temporary database', async (t) => {
  let closed = false;
  let deleted = false;
  const request = {
    result: {
      close: () => {
        closed = true;
      },
    },
  };
  mockGlobal(t, 'indexedDB', {
    open() {
      queueMicrotask(() => request.onsuccess());
      return request;
    },
    deleteDatabase() {
      assert.equal(closed, true, 'an open connection blocks database deletion');
      deleted = true;
    },
  });
  assert.equal(await checkIndexedDBSupport(), true);
  assert.equal(deleted, true);
});

test('the IndexedDB probe reports blocked storage without throwing', async (t) => {
  mockGlobal(t, 'indexedDB', {
    open() {
      throw new Error('SecurityError');
    },
  });
  assert.equal(await checkIndexedDBSupport(), false);
});

test('cancelling the system file chooser resolves and removes its event listeners', async (t) => {
  const input = new EventTarget();
  input.click = () => queueMicrotask(() => input.dispatchEvent(new Event('cancel')));
  mockGlobal(t, 'document', { createElement: () => input });
  const removed = [];
  const remove = input.removeEventListener.bind(input);
  input.removeEventListener = (...args) => {
    removed.push(args[0]);
    remove(...args);
  };
  const result = await Promise.race([
    selectFile('*', true),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('file chooser never settled')), 200);
      t.after(() => clearTimeout(timer));
    }),
  ]);
  assert.equal(result, undefined);
  assert.deepEqual(removed.sort(), ['cancel', 'change']);
});

test('clipboard fallback preserves multiline messages when the API is absent or rejects', async (t) => {
  class Element {
    focused = false;
    focus() {
      this.focused = true;
    }
  }
  const focus = new Element();
  let copyInput;
  let copied;
  mockGlobal(t, 'HTMLElement', Element);
  mockGlobal(t, 'document', {
    activeElement: focus,
    body: {
      append: (input) => {
        copyInput = input;
      },
    },
    createElement(tag) {
      assert.equal(tag, 'textarea');
      return { style: {}, select() {}, setSelectionRange() {}, remove() {} };
    },
    execCommand(command) {
      assert.equal(command, 'copy');
      copied = copyInput.value;
    },
  });
  const navigator = {};
  mockGlobal(t, 'navigator', navigator);
  const message = 'Первая строка\nВторая строка 🔑';
  copyToClipboard(message);
  assert.equal(copied, message);
  assert.equal(focus.focused, true);
  copied = undefined;
  navigator.clipboard = {
    writeText: async () => {
      throw new Error('NotAllowedError');
    },
  };
  copyToClipboard(message);
  await Promise.resolve();
  assert.equal(copied, message);
});

test('poll answers can use arbitrary IDs without inheriting object prototype properties', () => {
  const poll = {
    question: 'Which?',
    answers: ['__proto__', 'constructor', 'toString'].map((id) => ({ id, text: id })),
    disclosed: true,
    maxSelections: 1,
  };
  const votes = poll.answers.map(({ id }, index) => ({
    sender: `@user${index}:example.org`,
    ts: index,
    answers: [id],
  }));
  const result = tallyPoll(poll, votes);
  assert.equal(result.voters, 3);
  poll.answers.forEach(({ id }) => {
    assert.equal(Object.hasOwn(result.counts, id), true);
    assert.equal(result.counts[id], 1);
  });
});

test('poll tallies retain latest-vote, spoiled-vote and closing-time rules', () => {
  const poll = {
    question: 'Which?',
    answers: [{ id: 'a' }, { id: 'b' }],
    maxSelections: 1,
  };
  const result = tallyPoll(
    poll,
    [
      { sender: '@alice:example.org', ts: 1, answers: ['a'] },
      { sender: '@alice:example.org', ts: 2, answers: ['b'] },
      { sender: '@bob:example.org', ts: 3, answers: ['a', 'b'] },
      { sender: '@late:example.org', ts: 5, answers: ['a'] },
    ],
    4
  );
  assert.deepEqual(result.counts, { a: 0, b: 1 });
  assert.equal(result.voters, 1);
});

test('malformed noscript cannot expose hidden links through an implied close', () => {
  const html = sanitizeCustomHtml(
    '<div><noscript></div><a href="https://example.org/phishing">Hidden phishing link</a></noscript>'
  );
  assert.equal(html.includes('phishing'), false);
});

test('sanitizing messages preserves corporate mentions and removes executable HTML', () => {
  const html = sanitizeCustomHtml(
    '<span data-cinny-mention-group="team" data-mx-ping="1">@Team</span>' +
      '<a href="javascript:alert(1)" onclick="alert(1)">Link</a>' +
      '<mx-reply><blockquote>Old reply text</blockquote></mx-reply>' +
      '<p>Message body</p>'
  );
  assert.ok(html.includes('data-cinny-mention-group="team"'));
  assert.ok(html.includes('@Team'));
  assert.ok(html.includes('Message body'));
  for (const blocked of ['javascript:', 'onclick', 'Old reply text']) {
    assert.equal(html.includes(blocked), false, blocked);
  }
});
