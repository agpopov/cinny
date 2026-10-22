import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { createClient, Room, MatrixEvent, EventStatus } from 'matrix-js-sdk';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
});
const { LocalSearchIndex, matchesSearch, searchDateBoundary } = await import(
  '../src/app/utils/localSearch.ts'
);
const { MessageAttempt } = await import('../src/app/utils/messageAttempt.ts');
const { CallControl } = await import('../src/app/plugins/call/CallControl.ts');
const { CallControlState } = await import('../src/app/plugins/call/CallControlState.ts');
const { checkCallDevices, callDeviceError } = await import('../src/app/utils/callDevices.ts');
const event = (id, body, extra = {}) => ({
  event_id: id,
  room_id: '!room:test',
  sender: '@me:test',
  type: 'm.room.message',
  origin_server_ts: 10,
  content: { body, msgtype: 'm.text' },
  ...extra,
});
const memoryStorage = (initial = []) => {
  const records = new Map(
    initial.map((event) => [
      JSON.stringify([event.room_id, event.event_id]),
      structuredClone(event),
    ])
  );
  return {
    records,
    values: async () => [...records.values()].map((record) => structuredClone(record)),
    set: async (key, value) =>
      value === undefined ? records.delete(key) : records.set(key, structuredClone(value)),
  };
};
test('local E2EE history search applies unicode, room, author, type and date filters', async () => {
  const index = new LocalSearchIndex(memoryStorage());
  const ts = new Date('2026-10-22T12:00:00').getTime();
  await index.add(event('$one', 'ПРИВЕТ ＡＢＣ', { origin_server_ts: ts }));
  await index.add(
    event('$two', 'photo.png', {
      content: { body: 'photo.png', msgtype: 'm.image' },
      origin_server_ts: ts,
    })
  );
  assert.equal(
    (
      await index.search({
        term: 'привет abc',
        rooms: ['!room:test'],
        senders: ['@me:test'],
        after: '2026-10-22',
        before: '2026-10-22',
      })
    ).total,
    1
  );
  assert.equal((await index.search({ rooms: [] })).total, 0);
  assert.equal((await index.search({ senders: ['@other:test'] })).total, 0);
  assert.equal((await index.search({ kind: 'attachment' })).total, 1);
  assert.equal((await index.search({ before: '2026-10-21' })).total, 0);
  assert.equal(searchDateBoundary('2026-02-30'), undefined);
  assert.equal(
    matchesSearch(event('$redacted', 'secret', { unsigned: { redacted_because: {} } }), {
      term: 'secret',
    }),
    false
  );
  index.dispose();
});
test('edits arriving before their target survive restart; forged edits and deleted content stay excluded', async () => {
  const storage = memoryStorage();
  let index = new LocalSearchIndex(storage);
  const edit = event('$edit', '* old', {
    origin_server_ts: 20,
    content: {
      'm.relates_to': { rel_type: 'm.replace', event_id: '$original' },
      'm.new_content': { body: 'new text', msgtype: 'm.text' },
    },
  });
  await index.add(edit);
  await index.add(event('$original', 'old text'));
  await index.add({
    ...edit,
    event_id: '$forged',
    sender: '@attacker:test',
    origin_server_ts: 30,
    content: { ...edit.content, 'm.new_content': { body: 'forged' } },
  });
  assert.equal((await index.search({ term: 'new text' })).total, 1);
  assert.equal((await index.search({ term: 'old text' })).total, 0);
  await index.flush();
  index.dispose();
  index = new LocalSearchIndex(storage);
  assert.equal((await index.search({ term: 'new text' })).total, 1);
  await index.add(event('$delete-edit', '', { type: 'm.room.redaction', redacts: '$edit' }));
  assert.equal((await index.search({ term: 'old text' })).total, 1);
  await index.add(
    event('$delete-original', '', { type: 'm.room.redaction', content: { redacts: '$original' } })
  );
  await index.add(event('$original', 'old text'));
  await index.flush();
  index.dispose();
  index = new LocalSearchIndex(storage);
  assert.equal((await index.search({ term: 'old text' })).total, 0);
  index.dispose();
});
test('local search paginates deterministically and retains thread navigation metadata', async () => {
  const index = new LocalSearchIndex(memoryStorage());
  for (let i = 0; i < 45; i++)
    await index.add(
      event(`$${i}`, 'match', {
        origin_server_ts: i,
        content: { body: 'match', 'm.relates_to': { rel_type: 'm.thread', event_id: '$root' } },
      })
    );
  const first = await index.search({ term: 'match' });
  const second = await index.search({ term: 'match' }, first.next);
  assert.equal(first.events.length, 20);
  assert.equal(second.events.length, 20);
  assert.equal(first.total, 45);
  assert.equal(first.events[0].content['m.relates_to'].event_id, '$root');
  assert.equal(new Set([...first.events, ...second.events].map((e) => e.event_id)).size, 40);
  index.dispose();
});
test('storage errors preserve searchable data and retry writes', async () => {
  const storage = memoryStorage();
  const write = storage.set;
  let fail = true;
  storage.set = async (...args) => {
    if (fail) throw new Error('quota');
    return write(...args);
  };
  const index = new LocalSearchIndex(storage);
  await index.add(event('$one', 'secret'));
  assert.equal(await index.flush(), false);
  assert.ok(index.error);
  assert.equal((await index.search({ term: 'secret' })).total, 1);
  fail = false;
  assert.equal(await index.flush(), true);
  assert.equal(storage.records.size, 1);
  index.dispose();
});
function clientFixture() {
  let count = 0;
  const calls = [];
  const pending = [];
  const room = {
    getEventForTxnId: (txnId) => pending.find((ev) => ev.getTxnId() === txnId),
    getLiveTimeline: () => ({ getEvents: () => [] }),
  };
  const mx = {
    makeTxnId: () => `txn${++count}`,
    getRoom: () => room,
    sendMessage: async (...args) => {
      calls.push(args);
      if (calls.length === 1) throw new Error('response lost');
      return { event_id: '$ok' };
    },
    resendEvent: async (event) => {
      calls.push(['resend', event]);
      return { event_id: '$ok' };
    },
    cancelPendingEvent: (event) => pending.splice(pending.indexOf(event), 1),
  };
  return { mx, calls, pending };
}
test('uncertain send retries the same transaction without duplicating the local echo', async () => {
  const { mx, calls, pending } = clientFixture();
  const attempt = new MessageAttempt();
  const content = { body: 'hello', msgtype: 'm.text' };
  await assert.rejects(attempt.send(mx, '!room:test', null, content), /response lost/);
  await assert.rejects(
    attempt.send(mx, '!room:test', null, { ...content, body: 'changed' }),
    /предыдущей отправки/
  );
  pending.push({ status: 'not_sent', getTxnId: () => calls[0][3] });
  await attempt.send(mx, '!room:test', null, content);
  assert.equal(calls[1][0], 'resend');
  assert.equal(calls.length, 2);
  assert.equal(attempt.pending, false);
});
test('HTTP retry without a pending echo keeps transaction ID; cancellation unlocks editing', async () => {
  const { mx, calls } = clientFixture();
  const attempt = new MessageAttempt();
  const content = { body: 'hello' };
  await assert.rejects(attempt.send(mx, '!r', null, content));
  await attempt.send(mx, '!r', null, content);
  assert.equal(calls[0][3], calls[1][3]);
  const another = clientFixture();
  const canceled = new MessageAttempt();
  await assert.rejects(canceled.send(another.mx, '!r', null, content));
  await canceled.cancel(another.mx, '!r');
  await canceled.send(another.mx, '!r', null, { body: 'edited' });
  assert.notEqual(another.calls[0][3], another.calls[1][3]);
});
for (const pendingEventOrdering of ['chronological', 'detached']) {
  test(`send, retry and cancel use real SDK transaction lookup with ${pendingEventOrdering} events`, async (t) => {
    const mx = createClient({ baseUrl: 'http://localhost', userId: '@me:test' });
    const room = new Room('!room:test', mx, '@me:test', { pendingEventOrdering });
    t.mock.method(mx, 'getRoom', () => room);
    let sends = 0;
    t.mock.method(mx, 'sendMessage', async (roomId, threadId, content, txnId) => {
      sends += 1;
      const local = new MatrixEvent({
        event_id: `~${txnId}`,
        room_id: roomId,
        sender: '@me:test',
        type: 'm.room.message',
        content,
      });
      local.setStatus(EventStatus.NOT_SENT);
      room.addPendingEvent(local, txnId);
      throw new Error('response lost');
    });
    const resend = t.mock.method(mx, 'resendEvent', async (local, target) => {
      assert.equal(target, room);
      assert.equal(local.getContent().body, 'hello');
      return { event_id: '$ok' };
    });
    const content = { body: 'hello', msgtype: 'm.text' };
    const attempt = new MessageAttempt();
    await assert.rejects(attempt.send(mx, room.roomId, null, content), /response lost/);
    await attempt.send(mx, room.roomId, null, content);
    assert.equal(resend.mock.callCount(), 1);
    assert.equal(sends, 1);
    const canceled = new MessageAttempt();
    await assert.rejects(canceled.send(mx, room.roomId, null, content), /response lost/);
    await canceled.cancel(mx, room.roomId);
    assert.equal(canceled.pending, false);
    assert.equal(
      room
        .getLiveTimeline()
        .getEvents()
        .some((ev) => ev.status === EventStatus.CANCELLED),
      false
    );
  });
}
for (const state of ['remote-echo', 'pending-sent']) {
  test(`a confirmed ${state} completes a restored attempt without another local echo or HTTP send`, async (t) => {
    const mx = createClient({ baseUrl: 'http://localhost', userId: '@me:test' });
    const room = new Room('!room:test', mx, '@me:test', { pendingEventOrdering: 'chronological' });
    t.mock.method(mx, 'getRoom', () => room);
    t.mock.method(mx, 'sendMessage', () =>
      assert.fail('accepted transaction must not be sent again')
    );
    const content = { body: 'hello', msgtype: 'm.text' };
    const event = new MatrixEvent({
      event_id: state === 'remote-echo' ? '$confirmed' : '~stable',
      room_id: room.roomId,
      sender: '@me:test',
      type: 'm.room.message',
      content,
      unsigned: { transaction_id: 'stable' },
    });
    if (state === 'remote-echo') {
      await room.addLiveEvents([event], { addToState: false });
      assert.equal(room.getEventForTxnId('stable'), undefined);
    } else {
      event.setStatus(EventStatus.SENDING);
      room.addPendingEvent(event, 'stable');
      room.updatePendingEvent(event, EventStatus.SENT, '$confirmed');
    }
    let saved = { txnId: 'stable', content, fingerprint: JSON.stringify(content) };
    const storage = {
      get: async () => saved,
      set: async (_, value) => {
        saved = value;
      },
    };
    const attempt = new MessageAttempt(storage, 'draft');
    assert.deepEqual(await attempt.send(mx, room.roomId, null, content), {
      event_id: '$confirmed',
    });
    assert.equal(saved, undefined);
    assert.equal(attempt.pending, false);
    assert.equal(room.getLiveTimeline().getEvents().length, 1);
  });
}
function callFixture(t, send) {
  t.mock.method(globalThis, 'MutationObserver', function () {
    return { observe() {}, disconnect() {} };
  });
  return new CallControl(
    new CallControlState(false, false, true),
    { transport: { send } },
    { contentDocument: { querySelectorAll: () => [] } }
  );
}
// MutationObserver is supplied only by a DOM; keep the rest of the controller real.
if (!globalThis.MutationObserver) globalThis.MutationObserver = class {};
test('widget device event preceding its ACK resolves the request', async (t) => {
  let control;
  control = callFixture(t, async () => {
    control.onMediaState({ detail: { data: { audio_enabled: true } } });
  });
  await control.toggleMicrophone();
  assert.equal(control.microphone, true);
  control.dispose();
});
test('device command times out and dispose releases pending work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const control = callFixture(t, () => new Promise(() => {}));
  const pending = control.toggleMicrophone();
  const rejection = assert.rejects(pending, /Устройство не ответило/);
  t.mock.timers.tick(10001);
  await rejection;
  assert.ok(control.error);
  const next = control.toggleVideo();
  const canceled = assert.rejects(next, /Звонок завершён/);
  control.dispose();
  await canceled;
});
test('device checks release acquired tracks and present permission errors', async (t) => {
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  t.after(() => delete globalThis.isSecureContext);
  let stopped = 0;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }],
      }),
    },
  });
  t.after(() => delete globalThis.navigator.mediaDevices);
  await checkCallDevices(true, true);
  assert.equal(stopped, 2);
  assert.match(callDeviceError({ name: 'NotAllowedError' }), /настройках/);
  assert.match(callDeviceError({ name: 'NotFoundError' }), /не найдены/);
});

test('widget media state ACK completes unchanged-state commands without waiting for an event', async (t) => {
  const control = callFixture(t, async () => ({ audio_enabled: true, video_enabled: false }));
  await control.toggleMicrophone();
  assert.equal(control.microphone, true);
  control.dispose();
});

test('uncertain send transaction survives restart and is committed before dispatch', async () => {
  let saved;
  let fail = true;
  const calls = [];
  const storage = {
    get: async () => structuredClone(saved),
    set: async (_, value) => {
      saved = structuredClone(value);
    },
  };
  const mx = {
    makeTxnId: () => String(Math.random()),
    getRoom: () => ({
      getEventForTxnId: () => undefined,
      getLiveTimeline: () => ({ getEvents: () => [] }),
    }),
    sendMessage: async (...args) => {
      assert.equal(saved.txnId, args[3]);
      calls.push(args);
      if (fail) throw new Error('lost');
      return { event_id: '$ok' };
    },
  };
  let attempt = new MessageAttempt(storage, 'draft');
  await assert.rejects(attempt.send(mx, '!room', null, { body: 'secret' }));
  attempt = new MessageAttempt(storage, 'draft');
  fail = false;
  await attempt.send(mx, '!room', null, { body: 'secret' });
  assert.equal(calls[0][3], calls[1][3]);
  assert.equal(saved, undefined);
});

test('retry preserves the original resolved group mentions when membership changes', async () => {
  const { mx, calls } = clientFixture();
  const attempt = new MessageAttempt();
  await assert.rejects(
    attempt.send(
      mx,
      '!room',
      null,
      { body: '@group', 'm.mentions': { user_ids: ['@first:test'] } },
      'same-editor-draft'
    )
  );
  await attempt.send(
    mx,
    '!room',
    null,
    { body: '@group', 'm.mentions': { user_ids: ['@new:test'] } },
    'same-editor-draft'
  );
  assert.deepEqual(calls[1][2]['m.mentions'].user_ids, ['@first:test']);
  assert.equal(calls[0][3], calls[1][3]);
});

test('deafened calls mute audio attached later inside the widget root without clicking DOM controls', (t) => {
  let mutation;
  let observed;
  let disconnected = false;
  t.mock.method(globalThis, 'MutationObserver', function (callback) {
    mutation = callback;
    return {
      observe: (_, options) => {
        observed = options;
      },
      disconnect: () => {
        disconnected = true;
      },
    };
  });
  const audio = [{ muted: false }];
  const document = {
    body: { style: { setProperty() {} } },
    querySelectorAll: (selector) => {
      assert.equal(selector, 'audio');
      return audio;
    },
  };
  const control = new CallControl(
    new CallControlState(false, false, false),
    { transport: {} },
    { contentDocument: document }
  );
  control.startObserving();
  assert.equal(audio[0].muted, true);
  assert.equal(observed.subtree, true);
  audio.push({ muted: false });
  mutation();
  assert.equal(audio[1].muted, true);
  control.dispose();
  assert.equal(disconnected, true);
});
