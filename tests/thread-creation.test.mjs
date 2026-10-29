import assert from 'node:assert/strict';
import { test } from 'node:test';
import './register-unread-source.mjs';

const { ThreadCreationAttempt, buildThreadRootContent } = await import(
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
