import assert from 'node:assert/strict';
import { test } from 'node:test';
import './register-unread-source.mjs';
import { sourceCallback } from './fixtures/composer-source.mjs';

const { ThreadCreationAttempt, buildThreadRootContent, getThreadEventFingerprint } = await import(
  '../src/app/utils/threadCreation.ts'
);
const title = 'Обсуждаем релиз';
const content = {
  msgtype: 'm.text',
  body: 'Первое сообщение',
  'm.mentions': { user_ids: ['@peer:test'] },
};

function fixture() {
  const records = new Map();
  const requests = [];
  let txn = 0;
  let failReply = false;
  let failRootResponse = false;
  const accepted = new Map();
  const storage = {
    async get(key) {
      return structuredClone(records.get(key));
    },
    async set(key, value) {
      records.set(key, structuredClone(value));
    },
  };
  const mx = {
    makeTxnId: () => `txn-${++txn}`,
    getRoom: () => undefined,
    async sendMessage(roomId, threadId, body, txnId) {
      requests.push({ roomId, threadId, body: structuredClone(body), txnId });
      if (threadId && failReply) {
        failReply = false;
        throw new Error('offline');
      }
      if (!accepted.has(txnId)) accepted.set(txnId, { event_id: threadId ? '$reply' : '$root' });
      if (!threadId && failRootResponse) {
        failRootResponse = false;
        throw new Error('response lost');
      }
      return accepted.get(txnId);
    },
  };
  mx.sendEvent = async (roomId, threadId, eventType, body, txnId) => {
    try {
      return await mx.sendMessage(roomId, threadId, body, txnId);
    } finally {
      requests.at(-1).eventType = eventType;
    }
  };
  mx.getSafeUserId = () => '@me:test';
  return {
    storage,
    mx,
    requests,
    accepted,
    records,
    failReply: () => {
      failReply = true;
    },
    failRoot: () => {
      failRootResponse = true;
    },
  };
}

test('creates a standard root and first m.thread reply, including fallback for other clients', async () => {
  const f = fixture();
  const attempt = new ThreadCreationAttempt(f.storage, '!room:test');
  assert.equal(await attempt.send(f.mx, `  ${title}  `, content), '$root');
  assert.deepEqual(f.requests, [
    {
      roomId: '!room:test',
      threadId: null,
      body: { msgtype: 'm.text', body: title, 'm.mentions': {} },
      txnId: 'txn-1',
    },
    {
      roomId: '!room:test',
      threadId: '$root',
      body: {
        ...content,
        'm.relates_to': {
          rel_type: 'm.thread',
          event_id: '$root',
          'm.in_reply_to': { event_id: '$root' },
          is_falling_back: true,
        },
      },
      txnId: 'txn-2',
    },
  ]);
  assert.equal(content['m.relates_to'], undefined, 'caller content is not mutated');
});

test('an interrupted first reply resumes the same thread after reopening the client', async () => {
  const f = fixture();
  f.failReply();
  await assert.rejects(
    new ThreadCreationAttempt(f.storage, '!room:test').send(f.mx, title, content),
    /offline/
  );
  const reopened = new ThreadCreationAttempt(f.storage, '!room:test');
  assert.equal((await reopened.load()).rootId, '$root');
  assert.equal(await reopened.send(f.mx, title, content), '$root');
  assert.equal(f.requests.filter((request) => !request.threadId).length, 1);
  assert.equal(f.requests[1].txnId, f.requests[2].txnId);
  assert.equal(f.accepted.size, 2);
});

test('a lost root response reuses its transaction ID without making a duplicate root', async () => {
  const f = fixture();
  f.failRoot();
  await assert.rejects(
    new ThreadCreationAttempt(f.storage, '!room:test').send(f.mx, title, content),
    /response lost/
  );
  await new ThreadCreationAttempt(f.storage, '!room:test').send(f.mx, title, content);
  assert.equal(f.requests[0].txnId, f.requests[1].txnId);
  assert.equal(f.accepted.size, 2);
});

test('a failed checkpoint after accepting the root is safely retried', async () => {
  const f = fixture();
  const { set } = f.storage;
  let fail = true;
  f.storage.set = async (key, state) => {
    if (fail && state?.rootId) {
      fail = false;
      throw new Error('storage full');
    }
    await set(key, state);
  };
  await assert.rejects(
    new ThreadCreationAttempt(f.storage, '!room:test').send(f.mx, title, content),
    /storage full/
  );
  await new ThreadCreationAttempt(f.storage, '!room:test').send(f.mx, title, content);
  assert.equal(f.requests[0].txnId, f.requests[1].txnId);
  assert.equal(f.accepted.size, 2);
});

test('completed attempts can be reopened without sending again, then cleared for a new topic', async () => {
  const f = fixture();
  const attempt = new ThreadCreationAttempt(f.storage, '!room:test');
  await attempt.send(f.mx, title, content);
  assert.equal(
    await new ThreadCreationAttempt(f.storage, '!room:test').send(f.mx, title, content),
    '$root'
  );
  assert.equal(f.requests.length, 2);
  await attempt.clear();
  await attempt.send(f.mx, 'Другая тема', content);
  assert.equal(f.requests[2].txnId, 'txn-3');
});

test('invalid or changed submissions cannot leave extra root messages behind', async () => {
  const f = fixture();
  const attempt = new ThreadCreationAttempt(f.storage, '!room:test');
  assert.throws(() => buildThreadRootContent('  '));
  assert.throws(() => buildThreadRootContent('a'.repeat(101)));
  await assert.rejects(attempt.send(f.mx, title, { msgtype: 'm.text', body: ' ' }));
  assert.equal(f.requests.length, 0);
  f.failReply();
  await assert.rejects(attempt.send(f.mx, title, content), /offline/);
  await assert.rejects(attempt.send(f.mx, 'Изменённое название', content), /предыдущую попытку/);
  assert.equal(f.requests.length, 2);
});

test('a form reopened during a send cannot repeat an attempt that has already completed', async () => {
  const f = fixture();
  const attempt = new ThreadCreationAttempt(f.storage, '!room:test');
  f.failReply();
  await assert.rejects(attempt.send(f.mx, title, content), /offline/);
  const staleForm = await attempt.load();
  await attempt.send(f.mx, title, content);
  await attempt.clear();
  await assert.rejects(attempt.send(f.mx, title, content, staleForm.rootTxn), /уже завершена/);
  assert.equal(f.requests.length, 3);
  assert.equal(f.accepted.size, 2);
});

test('storage failure prevents dispatch and parallel submissions cannot create two topics', async () => {
  const f = fixture();
  const { set } = f.storage;
  f.storage.set = async () => {
    throw new Error('storage unavailable');
  };
  const attempt = new ThreadCreationAttempt(f.storage, '!room:test');
  await assert.rejects(attempt.send(f.mx, title, content), /storage unavailable/);
  assert.equal(f.requests.length, 0);
  f.storage.set = set;
  const sending = attempt.send(f.mx, title, content);
  await assert.rejects(attempt.send(f.mx, title, content), /уже создаётся/);
  await sending;
  assert.equal(f.requests.length, 2);
});

test('a failed SDK local echo is resent, keeping its identity and thread relation', async () => {
  const f = fixture();
  const local = { status: 'not_sent' };
  const room = { getEventForTxnId: () => local, getLiveTimeline: () => ({ getEvents: () => [] }) };
  f.mx.getRoom = () => room;
  const resends = [];
  f.mx.resendEvent = async (event, target) => {
    resends.push([event, target]);
    return { event_id: resends.length === 1 ? '$root' : '$reply' };
  };
  await new ThreadCreationAttempt(f.storage, '!room:test').send(f.mx, title, content);
  assert.equal(resends.length, 2);
  assert.ok(resends.every(([event, target]) => event === local && target === room));
  assert.equal(f.requests.length, 0);
});

const pollType = 'org.matrix.msc3381.poll.start';
const firstEvents = [
  [
    'poll',
    pollType,
    {
      body: 'Когда встречаемся?\n1. Сегодня\n2. Завтра',
      [pollType]: {
        question: { 'org.matrix.msc1767.text': 'Когда встречаемся?' },
        kind: 'org.matrix.msc3381.poll.disclosed',
        max_selections: 1,
        answers: [
          { id: 'a', 'org.matrix.msc1767.text': 'Сегодня' },
          { id: 'b', 'org.matrix.msc1767.text': 'Завтра' },
        ],
      },
    },
  ],
  [
    'sticker',
    'm.sticker',
    { body: 'котик', url: 'mxc://test/sticker', info: { w: 256, h: 256, mimetype: 'image/webp' } },
  ],
  [
    'file',
    'm.room.message',
    {
      msgtype: 'm.file',
      body: 'report.pdf',
      filename: 'report.pdf',
      url: 'mxc://test/file',
      info: { size: 42, mimetype: 'application/pdf' },
    },
  ],
  [
    'encrypted video',
    'm.room.message',
    {
      msgtype: 'm.video',
      body: 'clip.webm',
      file: {
        url: 'mxc://test/encrypted',
        key: { kty: 'oct', k: 'private-key' },
        iv: 'iv',
        hashes: { sha256: 'hash' },
        v: 'v2',
      },
      info: {
        mimetype: 'video/webm',
        thumbnail_file: { url: 'mxc://test/thumbnail', key: { k: 'thumbnail-key' } },
      },
    },
  ],
  ['emoji', 'm.room.message', { msgtype: 'm.text', body: '😺' }],
];
for (const [label, eventType, payload] of firstEvents) {
  test(`a thread starts with ${label}, retaining its Matrix type, content and durable retry`, async () => {
    const f = fixture();
    f.failReply();
    await assert.rejects(
      new ThreadCreationAttempt(f.storage, '!room:test').send(
        f.mx,
        title,
        payload,
        undefined,
        eventType
      ),
      /offline/
    );
    const saved = await f.storage.get('!room:test');
    assert.equal(saved.eventType, eventType);
    assert.deepEqual(saved.content, payload);
    const reopened = new ThreadCreationAttempt(f.storage, '!room:test');
    await reopened.send(f.mx, title, saved.content, saved.rootTxn, saved.eventType);
    assert.equal(f.requests.filter((r) => !r.threadId).length, 1);
    assert.equal(f.requests[1].txnId, f.requests[2].txnId);
    assert.equal(f.requests[2].eventType ?? 'm.room.message', eventType);
    assert.deepEqual(f.requests[2].body, {
      ...payload,
      'm.relates_to': {
        rel_type: 'm.thread',
        event_id: '$root',
        'm.in_reply_to': { event_id: '$root' },
        is_falling_back: true,
      },
    });
    assert.equal(payload['m.relates_to'], undefined);
    assert.equal(f.accepted.size, 2);
  });
}

test('changing only the event type cannot replace a saved failed first event', async () => {
  const f = fixture();
  f.failReply();
  const attempt = new ThreadCreationAttempt(f.storage, '!room:test');
  await assert.rejects(attempt.send(f.mx, title, content), /offline/);
  await assert.rejects(
    attempt.send(f.mx, title, content, undefined, 'm.sticker'),
    /предыдущую попытку/
  );
  assert.equal(f.requests.length, 2);
});

const sendEventSource = sourceCallback(
  '../../src/app/features/room/thread/NewThread.tsx',
  'sendEvent'
);
function form(f, saved, refs = {}) {
  const state = { pending: saved };
  const dependencies = {
    queue: { current: Promise.resolve() },
    rootId: { current: saved?.replyId ? saved.rootId : undefined },
    firstEvent: {
      current: saved?.replyId
        ? {
            fingerprint: getThreadEventFingerprint(saved.eventType, saved.content),
            eventId: saved.replyId,
          }
        : undefined,
    },
    finishing: { current: false },
    ready: true,
    canMessage: true,
    permissions: { event: () => true },
    mx: f.mx,
    title,
    titles: { set: async () => {} },
    draftKey: 'new-thread',
    attempt: new ThreadCreationAttempt(f.storage, '!room:test'),
    pending: saved,
    setSending: () => {},
    setError: () => {},
    setPending: (value) => {
      state.pending = value;
    },
    getThreadEventFingerprint,
    ...refs,
  };
  const send = new Function(...Object.keys(dependencies), `return ${sendEventSource}`)(
    ...Object.values(dependencies)
  );
  return {
    send,
    state,
    refs: {
      queue: dependencies.queue,
      rootId: dependencies.rootId,
      firstEvent: dependencies.firstEvent,
      finishing: dependencies.finishing,
    },
  };
}

test('the creation composer serializes attachments into one thread and resumes after a failed first file', async () => {
  const f = fixture();
  f.failReply();
  const video = firstEvents.find(([label]) => label === 'encrypted video')[2];
  const current = form(f);
  const fallback = [];
  await assert.rejects(
    current.send('m.room.message', video, async (target) => fallback.push(target)),
    /offline/
  );
  const retry = form(f, current.state.pending, current.refs);
  await retry.send('m.room.message', retry.state.pending.content, async (target) =>
    fallback.push(target)
  );
  // Video decoding may produce a new thumbnail on retry; its uploaded file is the same.
  const refreshed = structuredClone(video);
  refreshed.info.thumbnail_file.url = 'mxc://test/new-thumbnail';
  await retry.send('m.room.message', refreshed, async (target) => fallback.push(target));
  await Promise.all([
    retry.send(
      'm.room.message',
      { ...video, file: { ...video.file, url: 'mxc://test/other-file' } },
      async (target) => fallback.push(target)
    ),
    retry.send('m.sticker', { body: 'sticker', url: 'mxc://test/sticker' }, async (target) =>
      fallback.push(target)
    ),
  ]);
  assert.deepEqual(fallback, ['$root', '$root']);
  assert.equal(f.requests.filter((r) => !r.threadId).length, 1);
  assert.equal(f.accepted.size, 2);
});

test('permissions and an empty title fail before dispatch; a closed completed composer cannot send again', async () => {
  const f = fixture();
  const closed = form(f);
  closed.refs.finishing.current = true;
  await assert.rejects(
    closed.send('m.room.message', content, async () => {}),
    /уже создан/
  );
  const denied = form(f, undefined, { permissions: { event: () => false } });
  await assert.rejects(
    denied.send('m.sticker', { body: 'sticker' }, async () => {}),
    /Нет прав/
  );
  const empty = form(f, undefined, { title: ' ' });
  await assert.rejects(
    empty.send('m.room.message', content, async () => {}),
    /название/
  );
  assert.equal(f.requests.length, 0);
});
