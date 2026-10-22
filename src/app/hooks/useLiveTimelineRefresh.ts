import { useEffect } from 'react';
import { RoomEvent } from 'matrix-js-sdk';
import type { EventTimelineSetHandlerMap, Room, Thread } from 'matrix-js-sdk';

/** Limited sync replaces the live timeline for rooms as well as threads. */
export const useLiveTimelineRefresh = (
  room: Room,
  thread: Thread | undefined,
  onRefresh: () => void
) => {
  useEffect(() => {
    const timelineSet = thread?.timelineSet ?? room.getUnfilteredTimelineSet();
    const reset: EventTimelineSetHandlerMap[RoomEvent.TimelineReset] = (_room, resetSet) => {
      if (resetSet === timelineSet) onRefresh();
    };
    const refresh = (updatedRoom: Room) => {
      if (updatedRoom.roomId === room.roomId) onRefresh();
    };
    if (thread) thread.on(RoomEvent.TimelineReset, reset);
    else {
      room.on(RoomEvent.TimelineReset, reset);
      room.on(RoomEvent.TimelineRefresh, refresh);
    }
    return () => {
      if (thread) thread.removeListener(RoomEvent.TimelineReset, reset);
      else {
        room.removeListener(RoomEvent.TimelineReset, reset);
        room.removeListener(RoomEvent.TimelineRefresh, refresh);
      }
    };
  }, [room, thread, onRefresh]);
};
