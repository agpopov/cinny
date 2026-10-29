import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditor, Editor, Node, Transforms } from 'slate';
import { withHistory } from 'slate-history';
import './register-unread-source.mjs';
import { sourceCallback } from './fixtures/composer-source.mjs';

const { takeEditorSubmission, restoreEditorSubmission } = await import(
  '../src/app/components/editor/submission.ts'
);
const { isEmptyEditor } = await import('../src/app/components/editor/utils.ts');
const { MessageAttempt } = await import('../src/app/utils/messageAttempt.ts');

// Execute real callbacks without compiling JSX or building the app.
const inputPath = '../../src/app/features/room/RoomInput.tsx';
const sendCallback = sourceCallback(inputPath, 'send');
const keyCallback = sourceCallback(inputPath, 'handleKeyDown');
function bind(code, dependencies) {
  return new Function(...Object.keys(dependencies), `return ${code}`)(
    ...Object.values(dependencies)
  );
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function composer(text = 'Первое сообщение', overrides = {}) {
  const editor = withHistory(createEditor());
  editor.children = [{ type: 'paragraph', children: [{ text }] }];
  Transforms.select(editor, Editor.end(editor, []));
  const state = { saved: [], requests: [], reply: undefined, focused: false };
  const network = deferred();
  const mx = {
    getUserId: () => '@me:test',
    getRoom: () => undefined,
    makeTxnId: () => 'transaction',
    sendMessage: (...args) => {
      state.requests.push(args);
      return network.promise;
    },
  };
  const dependencies = {
    editor,
    mx,
    sendingRef: { current: false },
    sendScope: { current: 0 },
    draftReady: true,
    failedDraft: undefined,
    submission: undefined,
    EventType: { RoomMessage: 'm.room.message' },
    replyDraft: undefined,
    room: { currentState: { getStateEvents: () => undefined } },
    roomId: '!room:test',
    threadId: null,
    setSending: (value) => {
      state.sending = value;
    },
    setSendError: (value) => {
      state.error = value;
    },
    setFailedDraft: (value) => {
      state.failed = value;
    },
    setReplyDraft: (value) => {
      state.reply = value;
    },
    setAutocompleteQuery: () => {},
    saveDraft: (nodes, reply) => state.saved.push(structuredClone({ nodes, reply })),
    flushDraft: async () => {},
    sendTypingStatus: () => {},
    ReactEditor: {
      focus: () => {
        state.focused = true;
      },
    },
    flushSync: (action) => action(),
    takeEditorSubmission,
    restoreEditorSubmission,
    isEmptyEditor,
    uploadBoardHandlers: { current: undefined },
    freshGroupMentionNodes: structuredClone,
    mentionsOutsideMarkdownCode: (nodes) => nodes,
    resolveGroupMentions: async () => new Map(),
    getBeginCommand: () => undefined,
    toPlainText: (nodes) => nodes.map(Node.string).join('\n'),
    toMatrixCustomHTML: (nodes) => nodes.map(Node.string).join('\n'),
    trimCustomHtml: (value) => value,
    customHtmlEqualsPlainText: (a, b) => a === b,
    getMentions: () => ({ users: new Set(), room: false }),
    getMentionContent: (users, room) => ({ user_ids: users, room }),
    assertMentionContentSize: () => {},
    isMarkdown: true,
    MsgType: { Text: 'm.text' },
    Command: {},
    commands: {},
    RelationType: { Thread: 'm.thread' },
    messageAttempt: new MessageAttempt(),
    ...overrides,
  };
  return { editor, state, network, dependencies, send: bind(sendCallback, dependencies) };
}

test('composer clears synchronously, keeps its caret and accepts typing before preparation and HTTP', async () => {
  const preparation = deferred();
  const c = composer(undefined, { resolveGroupMentions: () => preparation.promise });
  const sent = c.send();
  assert.equal(Editor.string(c.editor, []), '');
  assert.deepEqual(c.editor.selection, Editor.range(c.editor, []));
  assert.equal(c.state.focused, true);
  c.editor.insertText('Следующее сообщение');
  preparation.resolve(new Map());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(c.state.requests[0][2].body, 'Первое сообщение');
  assert.equal(Editor.string(c.editor, []), 'Следующее сообщение');
  c.editor.insertText(' без ожидания');
  c.network.resolve({ event_id: '$sent' });
  await sent;
  assert.equal(Editor.string(c.editor, []), 'Следующее сообщение без ожидания');
});

test('failure preserves a new draft and retries the original transaction and reply independently', async () => {
  const reply = { eventId: '$reply', userId: '@other:test', body: 'Reply' };
  const c = composer(undefined, { replyDraft: reply, threadId: '$thread' });
  const sent = c.send();
  c.editor.insertText('Новый черновик');
  c.network.reject(new Error('network down'));
  await sent;
  assert.equal(Editor.string(c.editor, []), 'Новый черновик');
  assert.equal(c.state.failed.reply, reply);
  assert.equal(c.state.saved.at(-1).nodes[0].children[0].text, '');
  c.network = deferred();
  c.dependencies.mx.sendMessage = (...args) => {
    c.state.requests.push(args);
    return Promise.resolve({ event_id: '$retried' });
  };
  await c.send(c.state.failed);
  assert.equal(Editor.string(c.editor, []), 'Новый черновик');
  assert.equal(c.state.requests.length, 2);
  assert.equal(c.state.requests[0][3], c.state.requests[1][3]);
  assert.equal(c.state.requests[1][1], '$thread');
  assert.equal(c.state.requests[1][2]['m.relates_to']['m.in_reply_to'].event_id, '$reply');
});

test('failure restores an empty editor, with the caret at the end and clean undo history', async () => {
  const c = composer();
  const sent = c.send();
  c.network.reject(new Error('denied'));
  await sent;
  assert.equal(Editor.string(c.editor, []), 'Первое сообщение');
  assert.deepEqual(c.editor.selection.focus, Editor.end(c.editor, []));
  assert.equal(c.editor.history.undos.length, 0);
});

test('attachments added during preparation belong to the next draft and are not sent by a retry', async () => {
  const preparation = deferred();
  const sentUploads = [];
  const board = { current: { handleSend: async () => sentUploads.push('original') } };
  const c = composer(undefined, {
    resolveGroupMentions: () => preparation.promise,
    uploadBoardHandlers: board,
  });
  const sent = c.send();
  board.current = { handleSend: async () => sentUploads.push('next draft') };
  c.editor.insertText('next draft');
  preparation.resolve(new Map());
  c.network.reject(new Error('network down'));
  await sent;
  assert.deepEqual(sentUploads, ['original']);
  c.dependencies.mx.sendMessage = async () => ({ event_id: '$retry' });
  await c.send(c.state.failed);
  assert.deepEqual(sentUploads, ['original']);
});

test('a completed send from a previous room cannot erase the current room or update its error', async () => {
  const c = composer();
  const sent = c.send();
  c.dependencies.sendScope.current += 1;
  c.editor.insertText('В другой комнате');
  c.network.reject(new Error('old room failure'));
  await sent;
  assert.equal(Editor.string(c.editor, []), 'В другой комнате');
  assert.equal(c.state.error, '');
  assert.equal(c.state.failed, undefined);
});

test('submission snapshots are independent and restoration never overwrites mention pills or new text', () => {
  const c = composer();
  const snapshot = takeEditorSubmission(c.editor);
  c.editor.insertText('new');
  assert.equal(restoreEditorSubmission(c.editor, snapshot), false);
  assert.equal(Node.string(snapshot[0]), 'Первое сообщение');
  c.editor.children = [
    {
      type: 'paragraph',
      children: [
        { text: '' },
        { type: 'mention', id: '@a:test', children: [{ text: '' }] },
        { text: '' },
      ],
    },
  ];
  c.editor.isVoid = (node) => node.type === 'mention';
  assert.equal(restoreEditorSubmission(c.editor, snapshot), false);
});

const { isKeyHotkey } = await import('is-hotkey');
function keyHandler(enterForNewline, composing = false) {
  let sends = 0;
  const handler = bind(keyCallback, {
    filePaste: { onKeyDown: () => {} },
    draftReady: true,
    isComposing: () => composing,
    enterForNewline,
    isKeyHotkey,
    submit: () => {
      sends += 1;
    },
    setReplyDraft: () => {},
    autocompleteQuery: undefined,
    setAutocompleteQuery: () => {},
  });
  return { handler, sends: () => sends };
}
function enter(properties = {}) {
  return {
    key: 'Enter',
    keyCode: 13,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...properties,
  };
}
test('Enter preference, Shift+Enter, Ctrl+Enter, IME, prevented keys and key repeats', () => {
  for (const enterForNewline of [false, true]) {
    for (const properties of [
      {},
      { ctrlKey: true },
      { shiftKey: true },
      { repeat: true },
      { defaultPrevented: true },
    ]) {
      const c = keyHandler(enterForNewline);
      const event = enter(properties);
      c.handler(event);
      const shouldSend =
        !event.repeat &&
        !properties.defaultPrevented &&
        !event.shiftKey &&
        (event.ctrlKey || !enterForNewline);
      assert.equal(c.sends(), Number(shouldSend), JSON.stringify({ enterForNewline, properties }));
    }
  }
  const c = keyHandler(false, true);
  const event = enter();
  c.handler(event);
  assert.equal(c.sends(), 0);
  assert.equal(event.defaultPrevented, false);
});

test('a new-thread composer sends emoji through the thread creator and completes only after acceptance', async () => {
  const gate = deferred();
  const calls = [];
  const c = composer('😺', {
    submission: {
      disabled: false,
      sendEvent: async (eventType, content) => {
        calls.push([eventType, content.body]);
        await gate.promise;
      },
      onComplete: async () => calls.push('completed'),
    },
  });
  const sending = c.send();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [['m.room.message', '😺']]);
  assert.equal(Editor.string(c.editor, []), '');
  assert.equal(c.state.requests.length, 0, 'the first event cannot escape into the room timeline');
  gate.resolve();
  await sending;
  assert.deepEqual(calls, [['m.room.message', '😺'], 'completed']);
});

test('a creation submission waits for its first text before sending selected attachments', async () => {
  const gate = deferred();
  const calls = [];
  const c = composer(undefined, {
    submission: {
      disabled: false,
      sendEvent: async () => {
        calls.push('text');
        await gate.promise;
      },
      onComplete: async () => calls.push('completed'),
    },
    uploadBoardHandlers: { current: { handleSend: async () => calls.push('attachments') } },
  });
  const sending = c.send();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['text']);
  gate.resolve();
  await sending;
  assert.deepEqual(calls, ['text', 'attachments']);
});

test('a failed first-event send restores the text and never starts attachments or completes creation', async () => {
  const calls = [];
  const c = composer(undefined, {
    submission: {
      disabled: false,
      sendEvent: async () => {
        throw new Error('thread reply refused');
      },
      onComplete: async () => calls.push('completed'),
    },
    uploadBoardHandlers: { current: { handleSend: async () => calls.push('attachments') } },
  });
  await c.send();
  assert.equal(Editor.string(c.editor, []), 'Первое сообщение');
  assert.equal(c.state.error, 'thread reply refused');
  assert.deepEqual(calls, []);
});

test('without text the creation button sends attachments; a disabled creation sends nothing', async () => {
  const calls = [];
  const c = composer('', {
    submission: { disabled: true },
    uploadBoardHandlers: { current: { handleSend: async () => calls.push('attachments') } },
  });
  await c.send();
  assert.deepEqual(calls, []);
  const enabled = composer('', {
    submission: { disabled: false },
    uploadBoardHandlers: { current: { handleSend: async () => calls.push('attachments') } },
  });
  await enabled.send();
  assert.deepEqual(calls, ['attachments']);
});
