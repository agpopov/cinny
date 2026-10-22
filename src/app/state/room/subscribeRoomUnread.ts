import { Room, RoomEvent, ThreadEvent } from 'matrix-js-sdk';

/** Reconcile after SDK receipts and counts have finished updating in this turn. */
export const subscribeRoomUnread = (room: Room, onChange: () => void): (() => void) => {
  let queued = false;
  let active = true;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (active) onChange();
    });
  };

  room.on(RoomEvent.Timeline, schedule);
  room.on(RoomEvent.Receipt, schedule);
  room.on(RoomEvent.UnreadNotifications, schedule);
  room.on(RoomEvent.Redaction, schedule);
  room.on(ThreadEvent.New, schedule);
  room.on(ThreadEvent.Update, schedule);
  room.on(ThreadEvent.NewReply, schedule);
  room.on(ThreadEvent.Delete, schedule);
  schedule();

  return () => {
    active = false;
    room.removeListener(RoomEvent.Timeline, schedule);
    room.removeListener(RoomEvent.Receipt, schedule);
    room.removeListener(RoomEvent.UnreadNotifications, schedule);
    room.removeListener(RoomEvent.Redaction, schedule);
    room.removeListener(ThreadEvent.New, schedule);
    room.removeListener(ThreadEvent.Update, schedule);
    room.removeListener(ThreadEvent.NewReply, schedule);
    room.removeListener(ThreadEvent.Delete, schedule);
  };
};
