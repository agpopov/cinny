import React, { useCallback, useState } from 'react';
import { Room, Thread } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Box, IconButton, Icon, Icons, Text, config } from 'folds';
import { NavItem, NavItemContent, NavButton } from '../../components/nav';
import { UnreadBadge, UnreadBadgeCenter } from '../../components/unread-badge';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { roomIdToThreadPanelAtomFamily } from '../../state/room/threadPanel';
import { getThreadUnread, useActiveRoomThreads, useThreadVersion } from '../room/thread/useThread';
import { useClosedNavCategoriesAtom } from '../../state/hooks/closedNavCategories';
import { makeNavCategoryId } from '../../state/closedNavCategories';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { getEventPreviewText } from '../../utils/notificationContent';
import * as css from './styles.css';

const COLLAPSED_LIMIT = 3;

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
  const title = getEventPreviewText(root, room);

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

export const useThreadsNav = (room: Room) => {
  const mx = useMatrixClient();
  const [enabled] = useSetting(settingsAtom, 'showThreadsInNav');
  const threads = useActiveRoomThreads(mx, room, enabled);
  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());
  const categoryId = makeNavCategoryId('threads', room.roomId);
  const collapsed = closedCategories.has(categoryId);
  const toggle = useCallback(
    () => setClosedCategories({ type: collapsed ? 'DELETE' : 'PUT', categoryId }),
    [setClosedCategories, collapsed, categoryId]
  );
  return { threads, collapsed, toggle };
};

type ThreadsToggleProps = {
  collapsed: boolean;
  onToggle: () => void;
};
/** Кнопка рядом с меню комнаты: сворачивает и разворачивает её треды. */
export function ThreadsToggle({ collapsed, onToggle }: ThreadsToggleProps) {
  const label = collapsed ? 'Показать треды' : 'Свернуть треды';
  return (
    <IconButton
      type="button"
      variant="Background"
      fill="None"
      radii="300"
      size="300"
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <Icon size="50" src={collapsed ? Icons.ChevronRight : Icons.ChevronBottom} />
    </IconButton>
  );
}

type RoomNavThreadsProps = {
  room: Room;
  threads: Thread[];
  collapsed: boolean;
  linkPath: string;
  selected: boolean;
};
export function RoomNavThreads({
  room,
  threads,
  collapsed,
  linkPath,
  selected,
}: RoomNavThreadsProps) {
  const navigate = useNavigate();
  const [panel, setPanel] = useAtomPanel(room.roomId);
  const [expanded, setExpanded] = useState(false);

  if (threads.length === 0 || collapsed) return null;

  const activeRootId =
    selected && panel?.view === 'thread' && panel.main ? panel.rootId : undefined;
  const visible = expanded ? threads : threads.slice(0, COLLAPSED_LIMIT);
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
      {threads.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          className={css.ThreadsMoreButton}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <Text as="span" size="T200" truncate>
            {expanded ? 'Свернуть' : `Показать ещё ${hidden}`}
          </Text>
        </button>
      )}
    </Box>
  );
}
