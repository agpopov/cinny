import { useCallback, useEffect, useState } from 'react';
import { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import {
  getRoomMentionGroups,
  getSpaceMentionGroups,
  MENTION_GROUP_EVENT,
} from '../utils/mentionGroups';
import { useStateEventCallback } from './useStateEventCallback';

export function useMentionGroups(mx: MatrixClient, room: Room, spaceOnly = false) {
  const read = useCallback(
    () => (spaceOnly ? getSpaceMentionGroups(room) : getRoomMentionGroups(mx, room.roomId)),
    [mx, room, spaceOnly]
  );
  const [groups, setGroups] = useState(read);
  useEffect(() => {
    setGroups(read());
  }, [read]);
  useStateEventCallback(
    mx,
    useCallback(
      (event: MatrixEvent) => {
        if ([MENTION_GROUP_EVENT, 'm.space.child', 'm.room.member'].includes(event.getType()))
          setGroups(read());
      },
      [read]
    )
  );
  return groups;
}
