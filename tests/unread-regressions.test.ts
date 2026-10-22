import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createClient,
  EventStatus,
  MatrixEvent,
  NotificationCountType,
  ReceiptType,
  Room,
} from 'matrix-js-sdk';
import {
  getLatestReceiptEvent,
  getUnreadInfo,
  mainTimelineHaveUnread,
  roomHaveNotification,
  roomHaveUnread,
} from '../src/app/utils/room';
import { markMainTimelineAsRead as markAsRead } from '../src/app/utils/notifications';
import { subscribeRoomUnread } from '../src/app/state/room/subscribeRoomUnread';

const me = '@alice:test';
let sequence = 0;
const message = (sender = '@bob:test', type = 'm.room.message', root = '') => {
  sequence += 1;
  return new MatrixEvent({
    event_id: `$${sequence}`,
    room_id: '!room:test',
    sender,
    origin_server_ts: sequence * 1000,
    type,
    content: {
      body: 'message',
      msgtype: 'm.text',
      ...(root && { 'm.relates_to': { rel_type: 'm.thread', event_id: root } }),
    },
  });
};

const fixture = (threads = false) => {
  const mx = createClient({ baseUrl: 'https://test.invalid', userId: me, timelineSupport: true });
  mx.supportsThreads = () => threads;
  const room = new Room('!room:test', mx, me);
  mx.store.storeRoom(room);
  const calls: { event: MatrixEvent; type: ReceiptType }[] = [];
  mx.sendReadReceipt = async (event, type = ReceiptType.Read) => {
    calls.push({ event: event!, type });
    room.addLocalEchoReceipt(me, event!, type);
    return {};
  };
  const add = (event: MatrixEvent) =>
    room.getUnfilteredTimelineSet().addLiveEvent(event, { addToState: false });
  const receipt = (event: MatrixEvent, type = ReceiptType.Read, threadId = '') =>
    room.addReceipt(
      new MatrixEvent({
        type: 'm.receipt',
        room_id: room.roomId,
        content: {
          [event.getId()!]: {
            [type]: { [me]: { ts: event.getTs(), ...(threadId && { thread_id: threadId }) } },
          },
        },
      })
    );
  return { mx, room, calls, add, receipt };
};

test('empty and service-only timelines do not create an unread dot', () => {
  const f = fixture();
  assert.equal(roomHaveUnread(f.mx, f.room), false);
  f.add(message('@bob:test', 'm.reaction'));
  assert.equal(roomHaveUnread(f.mx, f.room), false);
});

test('viewing the tail works when the old receipt is outside loaded history', async () => {
  const f = fixture();
  f.receipt(message());
  const latest = message();
  f.add(latest);
  f.room.setUnread(NotificationCountType.Total, 1);
  await markAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.calls[0].event.getId(), latest.getId());
  assert.equal(roomHaveUnread(f.mx, f.room), false);
  assert.equal(roomHaveNotification(f.room), false);
});

test('an SDK synthetic receipt does not prevent clearing stale counts', async () => {
  const f = fixture();
  const latest = message();
  f.add(latest);
  f.room.addLocalEchoReceipt(me, latest, ReceiptType.Read);
  f.room.setUnread(NotificationCountType.Total, 7);
  f.room.setUnread(NotificationCountType.Highlight, 2);
  await markAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.room.getUnreadNotificationCount(), 0);
  assert.equal(f.room.getUnreadNotificationCount(NotificationCountType.Highlight), 0);
});

test('our own latest event still sends the server a receipt', async () => {
  const f = fixture();
  const latest = message(me);
  f.add(latest);
  f.room.addLocalEchoReceipt(me, latest, ReceiptType.Read);
  await markAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.calls.length, 1);
});

test('private activity setting sends a private receipt', async () => {
  const f = fixture();
  f.add(message());
  await markAsRead(f.mx, f.room.roomId, true);
  assert.equal(f.calls[0].type, ReceiptType.ReadPrivate);
});

test('confirmed public and private receipts override delayed counts', () => {
  [ReceiptType.Read, ReceiptType.ReadPrivate].forEach((type) => {
    const f = fixture();
    const latest = message();
    f.add(latest);
    f.room.setUnread(NotificationCountType.Total, 9);
    f.room.setUnread(NotificationCountType.Highlight, 3);
    f.receipt(latest, type);
    assert.deepEqual(getUnreadInfo(f.room), { roomId: f.room.roomId, total: 0, highlight: 0 });
    assert.equal(roomHaveUnread(f.mx, f.room), false);
  });
});

test('an older receipt does not clear a newer message', () => {
  const f = fixture();
  const old = message();
  f.add(old);
  f.add(message());
  f.room.setUnread(NotificationCountType.Total, 1);
  f.receipt(old);
  assert.equal(getUnreadInfo(f.room).total, 1);
  assert.equal(roomHaveUnread(f.mx, f.room), true);
});

test('a new message restores unread after the latest confirmed receipt', () => {
  const f = fixture();
  const old = message();
  f.add(old);
  f.receipt(old);
  assert.equal(roomHaveUnread(f.mx, f.room), false);
  f.add(message());
  f.room.setUnread(NotificationCountType.Total, 1);
  assert.equal(getUnreadInfo(f.room).total, 1);
  assert.equal(roomHaveUnread(f.mx, f.room), true);
});

test('pending and failed outgoing messages cannot become receipt targets', async () => {
  const f = fixture();
  const persisted = message();
  f.add(persisted);
  [EventStatus.SENDING, EventStatus.NOT_SENT, EventStatus.QUEUED].forEach((status) => {
    const pending = message(me);
    pending.setStatus(status);
    f.add(pending);
  });
  assert.equal(getLatestReceiptEvent(f.room)?.getId(), persisted.getId());
  await markAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.calls[0].event.getId(), persisted.getId());
});

test('a message arriving during a read request keeps its count', async () => {
  const f = fixture();
  f.add(message());
  const send = f.mx.sendReadReceipt;
  f.mx.sendReadReceipt = async (...args) => {
    await send(...args);
    f.add(message());
    f.room.setUnread(NotificationCountType.Total, 1);
    return {};
  };
  await markAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.room.getUnreadNotificationCount(), 1);
  assert.equal(roomHaveUnread(f.mx, f.room), true);
});

test('a failed request preserves counts and can be retried despite its local echo', async () => {
  const f = fixture();
  f.add(message());
  f.room.setUnread(NotificationCountType.Total, 1);
  const send = f.mx.sendReadReceipt;
  f.mx.sendReadReceipt = async (...args) => {
    await send(...args);
    throw new Error('offline');
  };
  await assert.rejects(markAsRead(f.mx, f.room.roomId, false), /offline/);
  assert.equal(roomHaveNotification(f.room), true);
  f.mx.sendReadReceipt = send;
  await markAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.room.getUnreadNotificationCount(), 0);
});

test('duplicate read requests coalesce and a newer viewed message queues behind them', async () => {
  const f = fixture();
  const old = message();
  f.add(old);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const send = f.mx.sendReadReceipt;
  f.mx.sendReadReceipt = async (...args) => {
    await pending;
    return send(...args);
  };
  const first = markAsRead(f.mx, f.room.roomId, false);
  const duplicate = markAsRead(f.mx, f.room.roomId, false);
  const next = message();
  f.add(next);
  const newer = markAsRead(f.mx, f.room.roomId, false);
  release();
  await Promise.all([first, duplicate, newer]);
  assert.deepEqual(
    f.calls.map((c) => c.event.getId()),
    [old.getId(), next.getId()]
  );
});

test('a confirmed read with no counts does not send redundant requests', async () => {
  const f = fixture();
  const latest = message();
  f.add(latest);
  f.receipt(latest);
  await markAsRead(f.mx, f.room.roomId, false);
  assert.equal(f.calls.length, 0);
});

test('main and thread receipts clear only their own counts', () => {
  const f = fixture(true);
  const root = message();
  f.add(root);
  const thread = f.room.createThread(root.getId()!, root, [], false);
  Object.defineProperty(thread, 'hasCurrentUserParticipated', { get: () => true });
  const reply = message('@bob:test', 'm.room.message', thread.id);
  reply.setThread(thread);
  thread.timelineSet.addLiveEvent(reply, { addToState: false });
  f.room.setUnread(NotificationCountType.Total, 2);
  f.room.setThreadUnreadNotificationCount(thread.id, NotificationCountType.Total, 3);
  f.receipt(root, ReceiptType.Read, 'main');
  assert.equal(getUnreadInfo(f.room).total, 3);
  assert.equal(mainTimelineHaveUnread(f.mx, f.room), false);
  f.receipt(reply, ReceiptType.ReadPrivate, thread.id);
  assert.equal(getUnreadInfo(f.room).total, 0);
  const next = message('@bob:test', 'm.room.message', thread.id);
  next.setThread(thread);
  thread.timelineSet.addLiveEvent(next, { addToState: false });
  assert.equal(getUnreadInfo(f.room).total, 3);
});

test('receipt and count events in one turn reconcile once with their final state', async () => {
  const f = fixture();
  f.add(message());
  f.room.setUnread(NotificationCountType.Total, 1);
  const updates: number[] = [];
  const cleanup = subscribeRoomUnread(f.room, () => updates.push(getUnreadInfo(f.room).total));
  await Promise.resolve();
  await markAsRead(f.mx, f.room.roomId, false);
  await Promise.resolve();
  assert.equal(updates[updates.length - 1], 0);
  updates.length = 0;
  f.add(message());
  f.room.setUnread(NotificationCountType.Total, 4);
  f.room.setUnread(NotificationCountType.Highlight, 2);
  await Promise.resolve();
  assert.deepEqual(updates, [4]);
  cleanup();
});

test('a partially loaded thread uses its bundled latest reply as the read boundary', () => {
  const f = fixture(true);
  const root = message();
  f.add(root);
  const thread = f.room.createThread(root.getId()!, root, [], false);
  Object.defineProperty(thread, 'hasCurrentUserParticipated', { get: () => true });
  const old = message('@bob:test', 'm.room.message', thread.id);
  old.setThread(thread);
  thread.timelineSet.addLiveEvent(old, { addToState: false });
  const latest = message('@bob:test', 'm.room.message', thread.id);
  latest.setThread(thread);
  Object.defineProperty(thread, 'replyToEvent', { get: () => latest });
  thread.liveTimeline.getEvents().push(root);
  assert.equal(getLatestReceiptEvent(f.room, thread)?.getId(), latest.getId());
  f.room.setThreadUnreadNotificationCount(thread.id, NotificationCountType.Total, 2);
  f.receipt(old, ReceiptType.Read, thread.id);
  assert.equal(getUnreadInfo(f.room).total, 2);
  f.receipt(latest, ReceiptType.ReadPrivate, thread.id);
  assert.equal(getUnreadInfo(f.room).total, 0);
});

test('a receipt-only update clears the indicator despite delayed server counts', async () => {
  const f = fixture();
  const latest = message();
  f.add(latest);
  f.room.setUnread(NotificationCountType.Total, 5);
  const updates: number[] = [];
  const cleanup = subscribeRoomUnread(f.room, () => updates.push(getUnreadInfo(f.room).total));
  await Promise.resolve();
  f.receipt(latest, ReceiptType.ReadPrivate);
  await Promise.resolve();
  assert.deepEqual(updates, [5, 0]);
  assert.equal(f.room.getUnreadNotificationCount(), 5);
  cleanup();
});

test('unsubscribing cancels queued updates and removes listeners', async () => {
  const f = fixture();
  let updates = 0;
  const cleanup = subscribeRoomUnread(f.room, () => {
    updates += 1;
  });
  cleanup();
  f.add(message());
  f.room.setUnread(NotificationCountType.Total, 1);
  await Promise.resolve();
  assert.equal(updates, 0);
});
