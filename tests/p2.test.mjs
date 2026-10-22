import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Direction,
  createClient,
  MatrixEvent,
  Room,
  ReceiptType,
  NotificationCountType,
} from 'matrix-js-sdk';
import { canPaginateTimeline } from '../src/app/utils/timelinePagination.ts';
import { createTaskQueue } from '../src/app/utils/taskQueue.ts';
import {
  notificationPolicy,
  createNotificationBatcher,
} from '../src/app/utils/notificationPolicy.ts';
import {
  attachmentFileLimit,
  ENCRYPTED_FILE_LIMIT,
  ATTACHMENT_QUEUE_LIMIT,
} from '../src/app/utils/attachmentLimits.ts';
import { collectAttention } from '../src/app/utils/attention.ts';
import { markMainTimelineAsRead, markThreadAsRead } from '../src/app/utils/notifications.ts';

const settings = {
  showNotifications: true,
  isNotificationSounds: true,
  notificationVolume: 70,
  notificationSoundMentionsOnly: false,
  dndUntil: 0,
  dndAllowMentions: false,
  dndAllowCalls: false,
  quietHoursEnabled: false,
  quietHoursStart: '19:00',
  quietHoursEnd: '09:00',
  quietHoursWeekends: false,
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('DND applies consistently to messages, invitations and calls', () => {
  for (const kind of ['message', 'invite', 'call']) {
    const result = notificationPolicy({ ...settings, dndUntil: -1 }, kind, true);
    assert.equal(result.allowed, false);
    assert.equal(result.visual, false);
    assert.equal(result.sound, false);
  }
});
test('only an explicit call exception bypasses DND, retaining common mute and volume', () => {
  const s = { ...settings, dndUntil: -1, dndAllowCalls: true, isNotificationSounds: false };
  assert.equal(notificationPolicy(s, 'call', true).visual, true);
  assert.equal(notificationPolicy(s, 'call', true).sound, false);
  assert.equal(notificationPolicy(s, 'invite').allowed, false);
  assert.equal(notificationPolicy(s, 'message', true).allowed, false);
});
test('mention exception never bypasses quiet hours for invitations or calls', () => {
  const s = { ...settings, quietHoursEnabled: true, dndAllowMentions: true };
  const evening = new Date(2026, 9, 22, 20, 0);
  assert.equal(notificationPolicy(s, 'message', true, evening).allowed, true);
  assert.equal(notificationPolicy(s, 'message', false, evening).allowed, false);
  for (const kind of ['invite', 'call'])
    assert.equal(notificationPolicy(s, kind, true, evening).allowed, false);
});
test('overnight hours, daytime hours, weekends and expiry use the provided local clock', () => {
  const s = { ...settings, quietHoursEnabled: true };
  for (const hour of [0, 8, 19, 23])
    assert.equal(
      notificationPolicy(s, 'invite', false, new Date(2026, 9, 22, hour)).allowed,
      false
    );
  for (const hour of [9, 12, 18])
    assert.equal(notificationPolicy(s, 'invite', false, new Date(2026, 9, 22, hour)).allowed, true);
  assert.equal(
    notificationPolicy({ ...s, quietHoursWeekends: true }, 'call', true, new Date(2026, 9, 24, 12))
      .allowed,
    false
  );
  assert.equal(
    notificationPolicy({ ...settings, dndUntil: 20 }, 'call', false, new Date(21)).allowed,
    true
  );
});
test('sound mode and malformed volume never produce an out-of-range audio volume', () => {
  const s = { ...settings, notificationSoundMentionsOnly: true };
  assert.equal(notificationPolicy(s, 'message').sound, false);
  assert.equal(notificationPolicy(s, 'message', true).sound, true);
  assert.equal(notificationPolicy(s, 'call').sound, true);
  for (const [value, expected] of [
    [300, 1],
    [-20, 0],
    [NaN, 0],
    [Infinity, 0],
    [50, 0.5],
  ]) {
    assert.equal(
      notificationPolicy({ ...settings, notificationVolume: value }, 'call').volume,
      expected
    );
  }
});
test('bursts coalesce by conversation while retaining the latest exact event target', async () => {
  const deliveries = [];
  const batcher = createNotificationBatcher(
    (value, count) => deliveries.push({ value, count }),
    10
  );
  batcher.add('room:main', '$one');
  batcher.add('room:main', '$two');
  batcher.add('room:thread', '$reply');
  await pause(30);
  assert.deepEqual(deliveries, [
    { value: '$two', count: 2 },
    { value: '$reply', count: 1 },
  ]);
  batcher.dispose();
});
test('burst preserves important mentions even when the last message is ordinary', async () => {
  const deliveries = [];
  const batcher = createNotificationBatcher(
    (value) => deliveries.push(value),
    5,
    (a, b) => ({ ...b, highlight: a.highlight || b.highlight })
  );
  batcher.add('r', { id: 'mention', highlight: true });
  batcher.add('r', { id: 'plain', highlight: false });
  await pause(15);
  assert.deepEqual(deliveries, [{ id: 'plain', highlight: true }]);
});
test('unmount cancels pending notifications and the queue is bounded under a room flood', async () => {
  let count = 0;
  const batcher = createNotificationBatcher(() => {
    count += 1;
  }, 5);
  for (let i = 0; i < 300; i += 1) batcher.add(String(i), i);
  await pause(20);
  assert.equal(count, 100);
  batcher.add('late', 1);
  batcher.dispose();
  await pause(15);
  assert.equal(count, 100);
});
test('file limits reject oversized encrypted files before allocating their buffers', () => {
  assert.equal(attachmentFileLimit(10, true), 10);
  assert.equal(attachmentFileLimit(ENCRYPTED_FILE_LIMIT * 2, true), ENCRYPTED_FILE_LIMIT);
  for (const invalid of [undefined, null, NaN, -1, 0, '100'])
    assert.equal(attachmentFileLimit(invalid, true), ENCRYPTED_FILE_LIMIT);
  assert.equal(attachmentFileLimit(ATTACHMENT_QUEUE_LIMIT, false), ATTACHMENT_QUEUE_LIMIT);
});
test('shared work queue serializes buffers, preserves FIFO and recovers after failure', async () => {
  const queue = createTaskQueue(1);
  let active = 0;
  let peak = 0;
  const started = [];
  const tasks = Array.from({ length: 12 }, (_, index) =>
    queue(async () => {
      active += 1;
      peak = Math.max(peak, active);
      started.push(index);
      await pause(1);
      active -= 1;
      if (index === 4) throw new Error('expected');
      return index;
    })
  );
  const results = await Promise.allSettled(tasks);
  assert.equal(peak, 1);
  assert.deepEqual(
    started,
    Array.from({ length: 12 }, (_, i) => i)
  );
  assert.equal(results[4].status, 'rejected');
  assert.equal(results[11].value, 11);
  for (const invalid of [0, -1, 1.1, Infinity]) assert.throws(() => createTaskQueue(invalid));
});
test('transfer queue admits at most two jobs across rooms', async () => {
  const queue = createTaskQueue(2);
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 30 }, () =>
      queue(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await pause(1);
        active -= 1;
      })
    )
  );
  assert.equal(peak, 2);
});

const me = '@me:test';
let sequence = 0;
const event = (roomId, body, sender = '@other:test', root) =>
  new MatrixEvent({
    event_id: `$p2-${++sequence}`,
    room_id: roomId,
    sender,
    origin_server_ts: sequence * 1000,
    type: 'm.room.message',
    content: {
      body,
      msgtype: 'm.text',
      ...(root ? { 'm.relates_to': { rel_type: 'm.thread', event_id: root } } : {}),
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
  const addRoom = (id) => {
    const room = new Room(id, mx, me, { timelineSupport: true });
    room.getMyMembership = () => 'join';
    mx.store.storeRoom(room);
    return room;
  };
  const add = (room, e) => room.getUnfilteredTimelineSet().addLiveEvent(e, { addToState: false });
  const addThread = (room, own = true) => {
    const root = event(room.roomId, 'root', own ? me : '@other:test');
    add(room, root);
    const thread = room.createThread(root.getId(), root, [], false);
    const reply = event(room.roomId, 'reply', '@other:test', root.getId());
    reply.setThread(thread);
    thread.timelineSet.addLiveEvent(reply, { addToState: false });
    room.setThreadUnreadNotificationCount(thread.id, NotificationCountType.Total, 1);
    return { thread, reply };
  };
  mx.sendReadReceipt = async (e, type = ReceiptType.Read, unthreaded = false) => {
    mx.getRoom(e.getRoomId()).addLocalEchoReceipt(me, e, type, unthreaded);
    return {};
  };
  return { mx, addRoom, add, addThread };
}
test('attention distinguishes ordinary unread, mentions, direct messages and followed threads', () => {
  const f = fixture();
  const ordinary = f.addRoom('!ordinary:test'),
    mention = f.addRoom('!mention:test'),
    direct = f.addRoom('!direct:test');
  for (const room of [ordinary, mention, direct]) f.add(room, event(room.roomId, room.roomId));
  mention.setUnread(NotificationCountType.Highlight, 1);
  f.addThread(ordinary);
  f.add(ordinary, event(ordinary.roomId, 'another main message'));
  const directs = new Set([direct.roomId]);
  const all = collectAttention(f.mx, [ordinary, mention, direct], directs, 'all');
  assert.equal(all.length, 4);
  assert.equal(all[0].highlight, true);
  assert.equal(collectAttention(f.mx, [ordinary, mention, direct], directs, 'me').length, 2);
  const threads = collectAttention(f.mx, [ordinary, mention, direct], directs, 'threads');
  assert.equal(threads.length, 1);
  assert.ok(threads[0].threadId);
});
test('foreign threads stay out of the queue unless they mention the user', () => {
  const f = fixture();
  const room = f.addRoom('!foreign:test');
  const { thread } = f.addThread(room, false);
  assert.equal(collectAttention(f.mx, [room], new Set(), 'threads').length, 0);
  room.setThreadUnreadNotificationCount(thread.id, NotificationCountType.Highlight, 1);
  assert.equal(
    collectAttention(f.mx, [room], new Set(), 'me').filter((item) => item.threadId).length,
    1
  );
});
test('attention opening points to the first unread event, preserving scope', () => {
  const f = fixture();
  const room = f.addRoom('!exact:test');
  const first = event(room.roomId, 'first'),
    last = event(room.roomId, 'last');
  f.add(room, first);
  f.add(room, last);
  assert.equal(collectAttention(f.mx, [room], new Set(), 'all')[0].event.getId(), first.getId());
});
test('reading a queue item removes only that scope, leaving thread and main independent', async () => {
  const f = fixture();
  const room = f.addRoom('!scopes:test');
  const { thread } = f.addThread(room);
  f.add(room, event(room.roomId, 'main'));
  assert.equal(collectAttention(f.mx, [room], new Set(), 'all').length, 2);
  await markMainTimelineAsRead(f.mx, room.roomId, false);
  const items = collectAttention(f.mx, [room], new Set(), 'all');
  assert.equal(items.length, 1);
  assert.equal(items[0].threadId, thread.id);
  await markThreadAsRead(f.mx, room, thread.id, true);
  assert.equal(collectAttention(f.mx, [room], new Set(), 'all').length, 0);
});
test('server receipt from another device removes stale main unread counters from the queue', () => {
  const f = fixture();
  const room = f.addRoom('!remote:test');
  const last = event(room.roomId, 'remote');
  f.add(room, last);
  room.setUnread(NotificationCountType.Total, 10);
  room.addReceipt(
    new MatrixEvent({
      type: 'm.receipt',
      room_id: room.roomId,
      content: { [last.getId()]: { 'm.read': { [me]: { ts: Date.now(), thread_id: 'main' } } } },
    })
  );
  assert.equal(collectAttention(f.mx, [room], new Set(), 'all').length, 0);
});

test('pagination requires a token and never fetches forward into an SDK live timeline', () => {
  const f = fixture();
  const room = f.addRoom('!pagination:test');
  const live = room.getLiveTimeline();
  assert.equal(canPaginateTimeline(live, true), false);
  live.setPaginationToken('older', Direction.Backward);
  assert.equal(canPaginateTimeline(live, true), true);
  live.setPaginationToken('future', Direction.Forward);
  assert.equal(canPaginateTimeline(live, false), false);
  const historical = room.getUnfilteredTimelineSet().addTimeline();
  historical.setPaginationToken('next', Direction.Forward);
  assert.equal(canPaginateTimeline(historical, false), true);
});
