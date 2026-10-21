import React, { useState } from 'react';
import { Room } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { Box, Icon, Icons, Text, config } from 'folds';
import { NavItem, NavItemContent, NavButton } from '../../components/nav';
import { UnreadBadge, UnreadBadgeCenter } from '../../components/unread-badge';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { roomIdToThreadPanelAtomFamily } from '../../state/room/threadPanel';
import { getThreadUnread, useActiveRoomThreads, useThreadVersion } from '../room/thread/useThread';
import { getEventPreviewText } from '../../utils/notificationContent';

const COLLAPSED_LIMIT = 5;

function useAtomPanel(roomId: string) {
  const atom = roomIdToThreadPanelAtomFamily(roomId);
  return [useAtomValue(atom), useSetAtom(atom)] as const;
}

type ThreadNavItemProps = {
  room: Room;
  thread: ReturnType<typeof useActiveRoomThreads>[number];
  active: boolean;
  onOpen: (rootId: string) => void;
};
function ThreadNavItem({ room, thread, active, onOpen }: ThreadNavItemProps) {
  const mx = useMatrixClient();
  useThreadVersion(room, thread);
  const root = thread.rootEvent;
  if (!root) return null;

  const unread = getThreadUnread(mx, room, thread);
  const title = getEventPreviewText(root);

  return (
    <NavItem variant="Background" radii="400" aria-selected={active}>
      <NavButton onClick={() => onOpen(thread.id)} title={title}>
        <NavItemContent>
          <Box
            as="span"
            grow="Yes"
            alignItems="Center"
            gap="200"
            style={{ paddingLeft: config.space.S500 }}
          >
            <Icon
              size="50"
              src={unread.unread ? Icons.ThreadUnread : Icons.Thread}
              filled={active}
            />
            <Box as="span" grow="Yes">
              <Text priority={unread.unread ? '500' : '300'} as="span" size="T300" truncate>
                {title}
              </Text>
            </Box>
            {unread.unread && (
              <UnreadBadgeCenter>
                <UnreadBadge highlight={unread.highlight} count={unread.count} />
              </UnreadBadgeCenter>
            )}
          </Box>
        </NavItemContent>
      </NavButton>
    </NavItem>
  );
}

type RoomNavThreadsProps = {
  room: Room;
  linkPath: string;
  selected: boolean;
};
export function RoomNavThreads({ room, linkPath, selected }: RoomNavThreadsProps) {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const threads = useActiveRoomThreads(mx, room);
  const [panel, setPanel] = useAtomPanel(room.roomId);
  const [expanded, setExpanded] = useState(false);

  if (threads.length === 0) return null;

  const activeRootId =
    selected && panel?.view === 'thread' && panel.main ? panel.rootId : undefined;
  // Открытый тред всегда виден, даже если он за пределами свёрнутого списка.
  const visible =
    expanded || threads.length <= COLLAPSED_LIMIT
      ? threads
      : threads.filter((t, i) => i < COLLAPSED_LIMIT || t.id === activeRootId);
  const hidden = threads.length - visible.length;

  const handleOpen = (rootId: string) => {
    setPanel({ view: 'thread', rootId, main: true });
    if (!selected) navigate(linkPath);
  };

  return (
    <Box direction="Column" gap="100" role="group" aria-label="Активные треды">
      {visible.map((thread) => (
        <ThreadNavItem
          key={thread.id}
          room={room}
          thread={thread}
          active={thread.id === activeRootId}
          onOpen={handleOpen}
        />
      ))}
      {(hidden > 0 || (expanded && threads.length > COLLAPSED_LIMIT)) && (
        <NavItem variant="Background" radii="400">
          <NavButton onClick={() => setExpanded(!expanded)}>
            <NavItemContent>
              <Text as="span" size="T200" priority="300" style={{ paddingLeft: config.space.S500 }}>
                {expanded ? 'Свернуть' : `Ещё ${hidden}`}
              </Text>
            </NavItemContent>
          </NavButton>
        </NavItem>
      )}
    </Box>
  );
}
