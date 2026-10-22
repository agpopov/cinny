import { NotificationCountType } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import {
  getLatestReceiptEvent,
  isFollowedThread,
  isNotificationEvent,
  mainTimelineHaveUnread,
  isThreadUnread,
} from './room';

export type AttentionFilter = 'all' | 'me' | 'threads';
export type AttentionItem = {
  key: string;
  room: Room;
  event?: MatrixEvent;
  threadId?: string;
  highlight: boolean;
  direct: boolean;
  count: number;
  ts: number;
};

/** A live receipt-based queue: notification history alone is stale after another device reads. */
export const collectAttention = (
  mx: MatrixClient,
  rooms: Room[],
  directs: Set<string>,
  filter: AttentionFilter
): AttentionItem[] => {
  const items: AttentionItem[] = [];
  const userId = mx.getSafeUserId();
  rooms.forEach((room) => {
    if (room.isSpaceRoom() || room.getMyMembership() !== 'join') return;
    const direct = directs.has(room.roomId);
    if (filter !== 'threads' && mainTimelineHaveUnread(mx, room)) {
      const highlight = room.getRoomUnreadNotificationCount(NotificationCountType.Highlight) > 0;
      if (filter !== 'me' || highlight || direct) {
        const events = room.getLiveTimeline().getEvents();
        const event =
          events.find((candidate) => {
            const id = candidate.getId();
            return (
              id &&
              candidate.status === null &&
              (!candidate.threadRootId || candidate.threadRootId === id) &&
              candidate.getSender() !== userId &&
              isNotificationEvent(candidate) &&
              !room.hasUserReadEvent(userId, id)
            );
          }) ?? getLatestReceiptEvent(room);
        items.push({
          key: room.roomId,
          room,
          event,
          highlight,
          direct,
          count: room.getRoomUnreadNotificationCount(),
          ts: event?.getTs() ?? 0,
        });
      }
    }
    room.getThreads().forEach((thread) => {
      const count = room.getThreadUnreadNotificationCount(thread.id, NotificationCountType.Total);
      const highlight =
        room.getThreadUnreadNotificationCount(thread.id, NotificationCountType.Highlight) > 0;
      const info = { unread: isThreadUnread(mx, room, thread), count, highlight };
      if (!info.unread || (!info.highlight && !isFollowedThread(room, thread))) return;
      if (filter === 'me' && !info.highlight && !direct) return;
      const events = thread.liveTimeline.getEvents();
      const event =
        events.find((candidate) => {
          const id = candidate.getId();
          return (
            id &&
            id !== thread.id &&
            candidate.status === null &&
            candidate.getSender() !== userId &&
            isNotificationEvent(candidate) &&
            !room.hasUserReadEvent(userId, id)
          );
        }) ?? getLatestReceiptEvent(room, thread);
      items.push({
        key: `${room.roomId}:${thread.id}`,
        room,
        event,
        threadId: thread.id,
        highlight: info.highlight,
        direct,
        count: info.count,
        ts: event?.getTs() ?? 0,
      });
    });
  });
  return items.sort(
    (a, b) => Number(b.highlight) - Number(a.highlight) || b.ts - a.ts || a.key.localeCompare(b.key)
  );
};
