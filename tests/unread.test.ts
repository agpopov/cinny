import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createClient,
  MatrixEvent,
  Room,
  ReceiptType,
  NotificationCountType,
  Thread,
} from 'matrix-js-sdk';
import {
  getLatestReceiptEvent,
  mainTimelineHaveUnread,
  isThreadUnread,
  isNotificationEvent,
  getRoomUnreadCounts,
} from '../src/app/utils/room';
import {
  markAsRead,
  markMainTimelineAsRead,
  markThreadAsRead,
} from '../src/app/utils/notifications';

const me = '@alice:test';
let sequence = 0;
const message = (body: string, sender = '@bob:test', root?: string, type = 'm.room.message') =>
  new MatrixEvent({
    event_id: `$${++sequence}`,
    room_id: '!room:test',
    sender,
    origin_server_ts: sequence * 1000,
    type,
    content: {
      body,
      msgtype: 'm.text',
      ...(root && { 'm.relates_to': { rel_type: 'm.thread', event_id: root } }),
    },
  });
function fixture() {
  const mx = createClient({
    baseUrl: 'https://test.invalid',
    userId: me,
    accessToken: 'test',
    timelineSupport: true,
  });
  mx.supportsThreads = () => true;
  const room = new Room('!room:test', mx, me);
  mx.store.storeRoom(room);
  const calls: { event: MatrixEvent; type: ReceiptType; unthreaded: boolean }[] = [];
  mx.sendReadReceipt = async (event, type = ReceiptType.Read, unthreaded = false) => {
    calls.push({ event: event!, type, unthreaded });
    room.addLocalEchoReceipt(me, event!, type, unthreaded);
    return {};
  };
  const add = (event: MatrixEvent) =>
    room.getUnfilteredTimelineSet().addLiveEvent(event, { addToState: false });
  const thread = (root: MatrixEvent, replies: MatrixEvent[]) => {
    add(root);
    const t = room.createThread(root.getId()!, root, [], false);
    for (const e of replies) {
      e.setThread(t);
      t.timelineSet.addLiveEvent(e, { addToState: false });
    }
    return t;
  };
  return { mx, room, calls, add, thread };
}

test('empty and service-only timelines have no unread dot', () => {
  const f = fixture();
  assert.equal(mainTimelineHaveUnread(f.mx, f.room), false);
  f.add(message('reaction', '@bob:test', undefined, 'm.reaction'));
  assert.equal(mainTimelineHaveUnread(f.mx, f.room), false);
});
test('stable and MSC polls are notification events, votes and edits are not', () => {
  for (const type of ['m.poll.start', 'org.matrix.msc3381.poll.start'])
    assert.equal(isNotificationEvent(message('poll', '@bob:test', undefined, type)), true);
  for (const type of ['m.poll.response', 'org.matrix.msc3381.poll.response', 'm.poll.end'])
    assert.equal(isNotificationEvent(message('vote', '@bob:test', undefined, type)), false);
});
test('main reading clears stale counts even when receipt already points to latest', async () => {
  const f = fixture();
  const event = message('main');
  f.add(event);
  f.room.addLocalEchoReceipt(me, event, ReceiptType.Read);
  f.room.setUnread(NotificationCountType.Total, 7);
  await markMainTimelineAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.room.getRoomUnreadNotificationCount(), 0);
  assert.equal(mainTimelineHaveUnread(f.mx, f.room), false);
});
test('reading main does not clear unread thread counters', async () => {
  const f = fixture();
  const root = message('root');
  const reply = message('reply', '@bob:test', root.getId());
  const t = f.thread(root, [reply]);
  f.room.setThreadUnreadNotificationCount(t.id, NotificationCountType.Total, 3);
  await markMainTimelineAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.calls[0].event.getId(), root.getId());
  assert.equal(f.room.getThreadUnreadNotificationCount(t.id), 3);
});
test('reading thread clears only that thread and sends a private receipt', async () => {
  const f = fixture();
  const root = message('root');
  const reply = message('reply', '@bob:test', root.getId());
  const t = f.thread(root, [reply]);
  f.room.setUnread(NotificationCountType.Total, 8);
  f.room.setThreadUnreadNotificationCount(t.id, NotificationCountType.Total, 3);
  await markThreadAsRead(f.mx, f.room, t.id, true);
  assert.equal(f.calls[0].type, ReceiptType.ReadPrivate);
  assert.equal(f.calls[0].event.getId(), reply.getId());
  assert.equal(f.room.getThreadUnreadNotificationCount(t.id), 0);
  assert.equal(f.room.getRoomUnreadNotificationCount(), 8);
  assert.equal(isThreadUnread(f.mx, f.room, t), false);
});
test('a newer message during receipt request keeps its counter', async () => {
  const f = fixture();
  f.add(message('old'));
  f.mx.sendReadReceipt = async () => {
    f.add(message('new'));
    f.room.setUnread(NotificationCountType.Total, 1);
    return {};
  };
  await markMainTimelineAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.room.getRoomUnreadNotificationCount(), 1);
  assert.equal(mainTimelineHaveUnread(f.mx, f.room), true);
});
test('failed receipt can be retried and does not clear counts', async () => {
  const f = fixture();
  f.add(message('old'));
  f.room.setUnread(NotificationCountType.Total, 1);
  const send = f.mx.sendReadReceipt;
  f.mx.sendReadReceipt = async () => {
    throw new Error('offline');
  };
  await assert.rejects(markMainTimelineAsRead(f.mx, f.room.roomId, false), /offline/);
  assert.equal(f.room.getRoomUnreadNotificationCount(), 1);
  f.mx.sendReadReceipt = send;
  await markMainTimelineAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.room.getRoomUnreadNotificationCount(), 0);
});
test('explicit mark uses actual server tail and an unthreaded receipt', async () => {
  const f = fixture();
  f.add(message('main'));
  const tail = message('outside loaded main history');
  f.mx.createMessagesRequest = async () => ({ chunk: [tail.event], start: 'a', end: 'b' } as any);
  await markAsRead(f.mx, f.room.roomId, true);
  assert.equal(f.calls[0].event.getId(), tail.getId());
  assert.equal(f.calls[0].unthreaded, true);
  assert.equal(f.calls[0].type, ReceiptType.ReadPrivate);
});
test('unsent events cannot be acknowledged', () => {
  const f = fixture();
  const event = message('pending');
  event.setStatus('not_sent' as any);
  f.add(event);
  assert.equal(getLatestReceiptEvent(f.room), undefined);
});

test('marking an unloaded room tail also clears the main unread dot', async () => {
  const f = fixture();
  f.add(message('loaded main'));
  const tail = message('unloaded reply');
  f.mx.createMessagesRequest = async () => ({ chunk: [tail.event], start: 'a' } as any);
  await markAsRead(f.mx, f.room.roomId, false);
  assert.equal(mainTimelineHaveUnread(f.mx, f.room), false);
});
test('threads without server counts still send a receipt on first read', async () => {
  const f = fixture();
  const root = message('root');
  const reply = message('reply', '@bob:test', root.getId());
  const t = f.thread(root, [reply]);
  assert.equal(isThreadUnread(f.mx, f.room, t), true);
  await markThreadAsRead(f.mx, f.room, t.id, false);
  assert.equal(f.calls.length, 1);
  assert.equal(isThreadUnread(f.mx, f.room, t), false);
});
test('root at the end of a thread cannot become its receipt target', async () => {
  const f = fixture();
  const root = message('root');
  const reply = message('reply', '@bob:test', root.getId());
  const t = f.thread(root, [reply]);
  t.liveTimeline.getEvents().push(root);
  assert.equal(getLatestReceiptEvent(f.room, t)?.getId(), reply.getId());
  await markThreadAsRead(f.mx, f.room, t.id, false);
  assert.equal(f.calls[0].event.getId(), reply.getId());
});
test('poll votes referring to thread root cannot replace the thread receipt', async () => {
  const f = fixture();
  const root = message('poll', me, undefined, 'org.matrix.msc3381.poll.start');
  const reply = message('reply', '@bob:test', root.getId());
  const t = f.thread(root, [reply]);
  const vote = message('vote', '@bob:test', undefined, 'org.matrix.msc3381.poll.response');
  vote.event.content = { 'm.relates_to': { rel_type: 'm.reference', event_id: root.getId() } };
  vote.setThread(t);
  t.liveTimeline.getEvents().push(vote);
  await markThreadAsRead(f.mx, f.room, t.id, false);
  assert.equal(f.calls[0].event.getId(), reply.getId());
});
test('bundled latest reply wins over an older partially loaded timeline', async () => {
  const f = fixture();
  const root = message('root');
  const old = message('old', '@bob:test', root.getId());
  const t = f.thread(root, [old]);
  const latest = message('latest', '@bob:test', root.getId());
  latest.setThread(t);
  Object.defineProperty(t, 'replyToEvent', { get: () => latest });
  await markThreadAsRead(f.mx, f.room, t.id, false);
  assert.equal(f.calls[0].event.getId(), latest.getId());
  assert.equal(isThreadUnread(f.mx, f.room, t), false);
});
test('duplicate observer calls share a request, and a newer read queues behind it', async () => {
  const f = fixture();
  const old = message('old');
  f.add(old);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const send = f.mx.sendReadReceipt;
  f.mx.sendReadReceipt = async (...args) => {
    await wait;
    return send(...args);
  };
  const first = markMainTimelineAsRead(f.mx, f.room.roomId, false);
  const duplicate = markMainTimelineAsRead(f.mx, f.room.roomId, false);
  const next = message('next');
  f.add(next);
  const newer = markMainTimelineAsRead(f.mx, f.room.roomId, false);
  release();
  await Promise.all([first, duplicate, newer]);
  assert.deepEqual(
    f.calls.map((c) => c.event.getId()),
    [old.getId(), next.getId()]
  );
});

test('confirmed main receipt overrides delayed notification counts', () => {
  const f = fixture();
  const event = message('main');
  f.add(event);
  f.room.setUnread(NotificationCountType.Total, 9);
  f.room.setUnread(NotificationCountType.Highlight, 2);
  f.room.addReceipt(
    new MatrixEvent({
      type: 'm.receipt',
      room_id: f.room.roomId,
      content: {
        [event.getId()!]: { 'm.read': { [me]: { ts: event.getTs(), thread_id: 'main' } } },
      },
    })
  );
  assert.deepEqual(getRoomUnreadCounts(f.room), { total: 0, highlight: 0 });
});
test('confirmed private thread receipt overrides delayed highlights but preserves newer replies', () => {
  const f = fixture();
  const root = message('root', me);
  const reply = message('reply', '@bob:test', root.getId());
  const t = f.thread(root, [reply]);
  f.room.setThreadUnreadNotificationCount(t.id, NotificationCountType.Total, 4);
  f.room.setThreadUnreadNotificationCount(t.id, NotificationCountType.Highlight, 1);
  f.room.addReceipt(
    new MatrixEvent({
      type: 'm.receipt',
      room_id: f.room.roomId,
      content: {
        [reply.getId()!]: { 'm.read.private': { [me]: { ts: reply.getTs(), thread_id: t.id } } },
      },
    })
  );
  assert.equal(isThreadUnread(f.mx, f.room, t), false);
  assert.deepEqual(getRoomUnreadCounts(f.room), { total: 0, highlight: 0 });
  const newer = message('later', '@bob:test', root.getId());
  newer.setThread(t);
  t.timelineSet.addLiveEvent(newer, { addToState: false });
  assert.equal(isThreadUnread(f.mx, f.room, t), true);
  assert.deepEqual(getRoomUnreadCounts(f.room), { total: 4, highlight: 1 });
});
