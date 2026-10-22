import { ClientEvent, Room } from 'matrix-js-sdk';
import { useEffect, useMemo, useState } from 'react';
import { getAllParents } from '../utils/room';
import { useMatrixClient } from './useMatrixClient';

export const useImagePackRooms = (
  roomId: string,
  roomToParents: Map<string, Set<string>>
): Room[] => {
  const mx = useMatrixClient();
  const [syncedRooms, setSyncedRooms] = useState(() => mx.getRooms());
  const roomMap = useMemo(
    () => new Map(syncedRooms.map((room) => [room.roomId, room])),
    [syncedRooms]
  );

  useEffect(() => {
    const roomIds = new Set([roomId, ...getAllParents(roomToParents, roomId)]);
    const refresh = (room: Room) => {
      if (roomIds.has(room.roomId)) setSyncedRooms(mx.getRooms());
    };
    setSyncedRooms(mx.getRooms());
    mx.on(ClientEvent.Room, refresh);
    return () => {
      mx.removeListener(ClientEvent.Room, refresh);
    };
  }, [mx, roomId, roomToParents]);

  const imagePackRooms: Room[] = useMemo(() => {
    const allParentSpaces = [roomId].concat(Array.from(getAllParents(roomToParents, roomId)));
    return allParentSpaces.reduce<Room[]>((list, rId) => {
      const r = roomMap.get(rId);
      if (r) list.push(r);
      return list;
    }, []);
  }, [roomMap, roomId, roomToParents]);

  return imagePackRooms;
};
