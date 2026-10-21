import {
  Direction,
  MatrixClient,
  MatrixEvent,
  NotificationCountType,
  ReceiptType,
  Room,
  Thread,
} from 'matrix-js-sdk';
import { getLatestReceiptEvent } from './room';

export { isThreadUnread } from './room';

const receiptType = (privateReceipt: boolean) =>
  privateReceipt ? ReceiptType.ReadPrivate : ReceiptType.Read;

// Coalesce observers/focus/scroll requests without suppressing retries after a failure.
const pendingReceipts = new WeakMap<
  Room,
  Map<string, { eventId: string; promise: Promise<void> }>
>();
const markScopeAsRead = (
  mx: MatrixClient,
  room: Room,
  privateReceipt: boolean,
  thread?: Thread
): Promise<void> => {
  const scope = thread?.id ?? 'main';
  let pending = pendingReceipts.get(room);
  if (!pending) {
    pending = new Map();
    pendingReceipts.set(room, pending);
  }
  const latest = getLatestReceiptEvent(room, thread);
  if (!latest) return Promise.resolve();
  const existing = pending.get(scope);
  if (existing) {
    return existing.eventId === latest.getId()
      ? existing.promise
      : existing.promise.then(() => markScopeAsRead(mx, room, privateReceipt, thread));
  }
  const requests = pending;
  const context = thread ?? room;
  const count = thread
    ? room.getThreadUnreadNotificationCount(thread.id)
    : room.getRoomUnreadNotificationCount();
  const highlight = thread
    ? room.getThreadUnreadNotificationCount(thread.id, NotificationCountType.Highlight)
    : room.getRoomUnreadNotificationCount(NotificationCountType.Highlight);
  // Only a real server receipt can suppress a request: an SDK synthetic receipt
  // can be left behind by a failed request or by sending our own last message.
  if (
    context.getReadReceiptForUserId(mx.getSafeUserId(), true, receiptType(privateReceipt))
      ?.eventId === latest.getId() &&
    !count &&
    !highlight
  ) {
    return Promise.resolve();
  }
  const request = mx
    .sendReadReceipt(latest, receiptType(privateReceipt))
    .then(() => {
      // A message arriving while the request was in flight must keep its badge.
      if (getLatestReceiptEvent(room, thread)?.getId() !== latest.getId()) return;
      context.setUnread(NotificationCountType.Total, 0);
      context.setUnread(NotificationCountType.Highlight, 0);
    })
    .finally(() => requests.delete(scope));
  requests.set(scope, { eventId: latest.getId()!, promise: request });
  return request;
};

/** Automatic reading affects only the visible conversation. */
export async function markMainTimelineAsRead(
  mx: MatrixClient,
  roomId: string,
  privateReceipt: boolean
) {
  const room = mx.getRoom(roomId);
  if (room) await markScopeAsRead(mx, room, privateReceipt);
}

export async function markThreadAsRead(
  mx: MatrixClient,
  room: Room,
  threadId: string,
  privateReceipt: boolean
) {
  const thread = room.getThread(threadId);
  if (thread) await markScopeAsRead(mx, room, privateReceipt, thread);
}

/** Explicit room action acknowledges everything, including threads outside the sync window. */
export async function markAsRead(mx: MatrixClient, roomId: string, privateReceipt: boolean) {
  const room = mx.getRoom(roomId);
  if (!room) return;
  // The main live timeline excludes thread replies. Ask for the actual room tail,
  // otherwise an unthreaded receipt could stop before the newest thread replies.
  const mainAtStart = getLatestReceiptEvent(room)?.getId();
  const threadsAtStart = room.getThreads().map((thread) => ({
    thread,
    eventId: getLatestReceiptEvent(room, thread)?.getId(),
  }));
  const response = await mx.createMessagesRequest(roomId, null, 1, Direction.Backward);
  const rawEvent = response.chunk[0];
  if (!rawEvent) return;
  const latest = new MatrixEvent({ ...rawEvent, room_id: roomId });
  await mx.sendReadReceipt(latest, receiptType(privateReceipt), true);
  // Preserve any events which arrived during the request. The server remains the
  // authority on subsequent syncs; never blanket-delete the room's unread atom.
  if (getLatestReceiptEvent(room)?.getId() === mainAtStart) {
    room.setUnread(NotificationCountType.Total, 0);
    room.setUnread(NotificationCountType.Highlight, 0);
  }
  threadsAtStart.forEach(({ thread, eventId }) => {
    if (getLatestReceiptEvent(room, thread)?.getId() !== eventId) return;
    thread.setUnread(NotificationCountType.Total, 0);
    thread.setUnread(NotificationCountType.Highlight, 0);
  });
}
