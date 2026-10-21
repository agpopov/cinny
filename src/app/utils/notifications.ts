import { MatrixClient, MatrixEvent, NotificationCountType, ReceiptType, Room } from 'matrix-js-sdk';

const getLatestUnreadEvent = (
  events: MatrixEvent[],
  readEventId: string | null
): MatrixEvent | null => {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const latestEvent = events[i];
    if (latestEvent.getId() === readEventId) return null;
    if (!latestEvent.isSending()) return latestEvent;
  }
  return null;
};

const receiptType = (privateReceipt: boolean) =>
  privateReceipt ? ReceiptType.ReadPrivate : ReceiptType.Read;

/** Отметить прочитанной только основную ленту комнаты (без тредов). */
export async function markMainTimelineAsRead(
  mx: MatrixClient,
  roomId: string,
  privateReceipt: boolean
) {
  const room = mx.getRoom(roomId);
  if (!room) return;

  const timeline = room.getLiveTimeline().getEvents();
  if (timeline.length === 0) return;
  const readEventId = room.getEventReadUpTo(mx.getSafeUserId());
  const latestEvent = getLatestUnreadEvent(timeline, readEventId);
  if (latestEvent === null) return;

  await mx.sendReadReceipt(latestEvent, receiptType(privateReceipt));
}

const threadHasUnread = (room: Room, threadId: string) =>
  room.getThreadUnreadNotificationCount(threadId, NotificationCountType.Total) > 0 ||
  room.getThreadUnreadNotificationCount(threadId, NotificationCountType.Highlight) > 0;

/** Отметить прочитанным тред (до последнего загруженного ответа). */
export async function markThreadAsRead(
  mx: MatrixClient,
  room: Room,
  threadId: string,
  privateReceipt: boolean
) {
  const thread = room.getThread(threadId);
  if (!thread) return;

  // SDK считает тред прочитанным, если пользователь ещё не отправлял тредовых
  // отметок, — но сервер при этом может держать счётчик. Доверяем серверу.
  const serverUnread = threadHasUnread(room, threadId);
  const readEventId = serverUnread ? null : thread.getEventReadUpTo(mx.getSafeUserId());
  const events = thread.liveTimeline.getEvents();
  let latestEvent = getLatestUnreadEvent(events, readEventId);
  if (!latestEvent && events.length === 0) {
    // Тред ещё не загружен целиком — берём последний известный ответ.
    const lastReply = thread.replyToEvent;
    if (lastReply && lastReply.getId() !== readEventId && !lastReply.isSending()) {
      latestEvent = lastReply;
    }
  }
  if (!latestEvent) return;

  await mx.sendReadReceipt(latestEvent, receiptType(privateReceipt));
}

/**
 * Отметить прочитанной всю комнату: основную ленту и все треды с непрочитанным.
 * Используется для явных действий пользователя («Отметить прочитанным», Esc).
 */
export async function markAsRead(mx: MatrixClient, roomId: string, privateReceipt: boolean) {
  const room = mx.getRoom(roomId);
  if (!room) return;

  const threadIds = room
    .getThreads()
    .map((thread) => thread.id)
    .filter((threadId) => threadHasUnread(room, threadId));

  await Promise.allSettled([
    markMainTimelineAsRead(mx, roomId, privateReceipt),
    ...threadIds.map((threadId) => markThreadAsRead(mx, room, threadId, privateReceipt)),
  ]);
}
