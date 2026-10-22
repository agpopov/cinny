import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Header,
  Icon,
  IconButton,
  Icons,
  Line,
  Scroll,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  color,
  config,
  toRem,
} from 'folds';
import { EventType, Room, RoomEvent, Thread, ThreadEvent } from 'matrix-js-sdk';
import { useAtom, useSetAtom } from 'jotai';
import classNames from 'classnames';
import { ReactEditor } from 'slate-react';
import * as css from './Thread.css';
import { ContainerColor } from '../../../styles/ContainerColor.css';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { UserAvatar } from '../../../components/user-avatar';
import { getMemberAvatarMxc, isFollowedThread } from '../../../utils/room';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { nameInitials } from '../../../utils/common';
import { getEventPreviewText, getSenderName } from '../../../utils/notificationContent';
import {
  ThreadPanelState,
  getThreadDraftKey,
  roomIdToThreadPanelAtomFamily,
  threadListFilterAtom,
} from '../../../state/room/threadPanel';
import {
  ensureThreadRootFirst,
  formatRelativeTime,
  formatReplyCount,
  getThreadLastActivity,
  getThreadLastReply,
  getThreadUnread,
  useFetchRoomThreads,
  useRoomThreads,
  useThreadVersion,
} from './useThread';
import { RoomTimeline } from '../RoomTimeline';
import { RoomInput } from '../RoomInput';
import { RoomInputPlaceholder } from '../RoomInputPlaceholder';
import { useEditor } from '../../../components/editor';
import { usePowerLevelsContext } from '../../../hooks/usePowerLevels';
import { useRoomCreators } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { useRoomEvent } from '../../../hooks/useRoomEvent';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { editableActiveElement } from '../../../utils/dom';

type PanelHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Переключение между боковой панелью и областью комнаты. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onClose: () => void;
};
function PanelHeader({
  title,
  subtitle,
  onBack,
  expanded,
  onToggleExpanded,
  onClose,
}: PanelHeaderProps) {
  return (
    <Header className={css.PanelHeader} variant="Background" size="600">
      <Box grow="Yes" alignItems="Center" gap="200">
        {onBack && (
          <IconButton variant="Background" onClick={onBack} aria-label="К списку тредов">
            <Icon src={Icons.ArrowLeft} />
          </IconButton>
        )}
        <Icon size="200" src={Icons.Thread} />
        <Box grow="Yes" direction="Column" style={{ minWidth: 0 }}>
          <Text size="H5" truncate>
            {title}
          </Text>
          {subtitle && (
            <Text size="T200" priority="300" truncate>
              {subtitle}
            </Text>
          )}
        </Box>
        {onToggleExpanded && (
          <TooltipProvider
            position="Bottom"
            align="End"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>{expanded ? 'Свернуть в боковую панель' : 'Открыть на всю область'}</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                ref={triggerRef}
                variant="Background"
                onClick={onToggleExpanded}
                aria-label={expanded ? 'Свернуть в боковую панель' : 'Открыть на всю область'}
              >
                <Icon src={expanded ? Icons.ArrowRight : Icons.External} />
              </IconButton>
            )}
          </TooltipProvider>
        )}
        <TooltipProvider
          position="Bottom"
          align="End"
          offset={4}
          tooltip={
            <Tooltip>
              <Text>Закрыть</Text>
            </Tooltip>
          }
        >
          {(triggerRef) => (
            <IconButton
              aria-label="Закрыть"
              ref={triggerRef}
              variant="Background"
              onClick={onClose}
            >
              <Icon src={Icons.Cross} />
            </IconButton>
          )}
        </TooltipProvider>
      </Box>
    </Header>
  );
}

// ---------------------------------------------------------------------------
// Список тредов
// ---------------------------------------------------------------------------

type ThreadListItemProps = {
  room: Room;
  thread: Thread;
  onOpen: (thread: Thread) => void;
};
function ThreadListItem({ room, thread, onOpen }: ThreadListItemProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  useThreadVersion(room, thread);

  const root = thread.rootEvent;
  if (!root) return null;
  const rootSender = root.getSender() ?? '';
  const rootName = getSenderName(room, rootSender);
  const avatarMxc = getMemberAvatarMxc(room, rootSender);
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 64, 64, 'crop') ?? undefined
    : undefined;
  const lastReply = getThreadLastReply(room, thread);
  const unread = getThreadUnread(mx, room, thread);

  return (
    <button type="button" className={css.ListItem} onClick={() => onOpen(thread)}>
      <Box gap="300">
        <Avatar size="300" radii="Pill">
          <UserAvatar
            userId={rootSender}
            src={avatarUrl}
            alt={rootName}
            renderFallback={() => <Text size="H6">{nameInitials(rootName)}</Text>}
          />
        </Avatar>
        <Box grow="Yes" direction="Column" gap="100" style={{ minWidth: 0 }}>
          <Box alignItems="Center" gap="200">
            <Text size="T300" truncate style={{ flexGrow: 1 }}>
              <b>{rootName}</b>
            </Text>
            <Text size="T200" priority="300" style={{ flexShrink: 0 }}>
              {formatRelativeTime(getThreadLastActivity(thread))}
            </Text>
          </Box>
          <Text
            size="T300"
            className={css.ListItemRootText}
            style={{ fontWeight: unread.unread ? 600 : undefined }}
          >
            {root.isRedacted() ? 'Сообщение удалено' : getEventPreviewText(root, room)}
          </Text>
          <Box alignItems="Center" gap="200">
            <Icon size="50" src={unread.unread ? Icons.ThreadUnread : Icons.Thread} />
            <Text size="T200" style={{ color: color.Primary.Main }}>
              <b>{formatReplyCount(thread.length)}</b>
            </Text>
            {lastReply && (
              <Text size="T200" priority="300" truncate style={{ flexGrow: 1 }}>
                {lastReply.senderName}: {lastReply.text}
              </Text>
            )}
            {unread.count > 0 && (
              <Badge
                size="400"
                radii="Pill"
                fill="Solid"
                variant={unread.highlight ? 'Critical' : 'Primary'}
              >
                <Text as="span" size="L400">
                  {unread.count > 99 ? '99+' : unread.count}
                </Text>
              </Badge>
            )}
            {unread.unread && unread.count === 0 && <span className={css.UnreadDot} />}
          </Box>
        </Box>
      </Box>
    </button>
  );
}

type ThreadListProps = {
  room: Room;
  onOpenThread: (rootId: string) => void;
  onClose: () => void;
};
function ThreadList({ room, onOpenThread, onClose }: ThreadListProps) {
  const mx = useMatrixClient();
  const [filter, setFilter] = useAtom(threadListFilterAtom);
  const threads = useRoomThreads(room);
  const { state, reload, loadMore, canLoadMore } = useFetchRoomThreads(mx, room);

  const visible = filter === 'mine' ? threads.filter((t) => isFollowedThread(room, t)) : threads;

  return (
    <>
      <PanelHeader title="Треды" subtitle={room.name} onClose={onClose} />
      <Box className={css.FilterBar} gap="200">
        <Chip
          variant={filter === 'all' ? 'Primary' : 'SurfaceVariant'}
          radii="Pill"
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          <Text size="T200">Все</Text>
        </Chip>
        <Chip
          variant={filter === 'mine' ? 'Primary' : 'SurfaceVariant'}
          radii="Pill"
          aria-pressed={filter === 'mine'}
          onClick={() => setFilter('mine')}
        >
          <Text size="T200">Мои</Text>
        </Chip>
      </Box>
      <Line variant="Background" size="300" />
      <Box grow="Yes" direction="Column" style={{ minHeight: 0 }}>
        <Scroll variant="Background" visibility="Hover" hideTrack>
          <Box direction="Column" gap="100" style={{ padding: config.space.S200 }}>
            {visible.map((thread) => (
              <ThreadListItem
                key={thread.id}
                room={room}
                thread={thread}
                onOpen={(t) => onOpenThread(t.id)}
              />
            ))}
            {visible.length === 0 && state !== 'loading' && (
              <Box
                direction="Column"
                alignItems="Center"
                gap="200"
                style={{ padding: `${config.space.S700} ${config.space.S400}` }}
              >
                <Icon size="600" src={Icons.Thread} />
                <Text align="Center" size="H6">
                  {filter === 'mine' ? 'Нет ваших тредов' : 'Пока нет тредов'}
                </Text>
                <Text align="Center" size="T300" priority="300">
                  {filter === 'mine'
                    ? 'Здесь появятся треды, которые вы начали или в которых отвечали.'
                    : 'Наведите на сообщение и нажмите значок треда, чтобы начать обсуждение.'}
                </Text>
              </Box>
            )}
            {state === 'loading' && (
              <Box justifyContent="Center" style={{ padding: config.space.S400 }}>
                <Spinner variant="Secondary" />
              </Box>
            )}
            {state === 'error' && (
              <Box direction="Column" alignItems="Center" gap="200">
                <Text size="T300" priority="300" align="Center">
                  Не удалось загрузить список тредов с сервера.
                </Text>
                <Button size="300" variant="Secondary" fill="Soft" onClick={reload}>
                  <Text size="B300">Повторить</Text>
                </Button>
              </Box>
            )}
            {state === 'done' && canLoadMore && (
              <Box justifyContent="Center" style={{ padding: config.space.S200 }}>
                <Button size="300" variant="Secondary" fill="Soft" onClick={loadMore}>
                  <Text size="B300">Показать ещё</Text>
                </Button>
              </Box>
            )}
          </Box>
        </Scroll>
      </Box>
    </>
  );
}

// ---------------------------------------------------------------------------
// Просмотр треда
// ---------------------------------------------------------------------------

const useRoomThread = (room: Room, rootId: string): Thread | undefined => {
  const [thread, setThread] = useState<Thread | undefined>(
    () => room.getThread(rootId) ?? undefined
  );
  useEffect(() => {
    // SDK сам не заводит тред при первом ответе из UI: эхо ответа не попадёт в его ленту.
    const rootEvent = room.findEventById(rootId);
    setThread(
      room.getThread(rootId) ??
        (rootEvent ? room.createThread(rootId, rootEvent, [], false) : undefined)
    );
    const handleNew = (t: Thread) => {
      if (t.id === rootId) setThread(t);
    };
    room.on(ThreadEvent.New, handleNew);
    return () => {
      room.removeListener(ThreadEvent.New, handleNew);
    };
  }, [room, rootId]);
  return thread;
};

type ThreadViewProps = {
  room: Room;
  rootId: string;
  eventId?: string;
  /** Тред открыт на всю область комнаты. */
  main: boolean;
  onBack?: () => void;
  onToggleMain: () => void;
  onClose: () => void;
};
function ThreadView({
  room,
  rootId,
  eventId,
  main,
  onBack,
  onToggleMain,
  onClose,
}: ThreadViewProps) {
  const mx = useMatrixClient();
  const thread = useRoomThread(room, rootId);
  useThreadVersion(room, thread);
  const rootEvent = useRoomEvent(
    room,
    rootId,
    useCallback(() => thread?.rootEvent, [thread])
  );

  const editor = useEditor();
  const inputRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const draftKey = getThreadDraftKey(room.roomId, rootId);

  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canMessage = permissions.event(EventType.RoomMessage, mx.getSafeUserId());

  useEffect(() => {
    // Как в Discord: открыли тред — сразу можно писать.
    const timer = setTimeout(() => {
      // The user may already be typing in the main composer or another field.
      if (editableActiveElement()) return;
      try {
        ReactEditor.focus(editor);
      } catch {
        // поле ввода может быть ещё не смонтировано
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [editor, rootId]);

  const rootSender = rootEvent?.getSender();
  const rootPreview = rootEvent
    ? `${getSenderName(room, rootSender ?? '')}: ${getEventPreviewText(rootEvent, room)}`
    : undefined;
  const subtitle = main ? [room.name, rootPreview].filter(Boolean).join(' · ') : rootPreview;
  const ready = !!thread && thread.initialEventsFetched;
  const rootMoved = ready && !!thread && ensureThreadRootFirst(thread);
  useEffect(() => {
    // Лента могла уже отрисоваться со старым порядком — просим перечитать.
    if (rootMoved && thread) thread.emit(RoomEvent.TimelineReset, room, thread.timelineSet, true);
  }, [rootMoved, thread, room]);

  return (
    <>
      <PanelHeader
        title={thread ? `Тред · ${formatReplyCount(thread.length)}` : 'Новый тред'}
        subtitle={subtitle}
        onBack={onBack}
        expanded={main}
        onToggleExpanded={onToggleMain}
        onClose={onClose}
      />
      <Box ref={viewRef} grow="Yes" direction="Column" style={{ minHeight: 0 }}>
        {ready && thread ? (
          <RoomTimeline
            key={thread.id}
            room={room}
            thread={thread}
            eventId={eventId}
            roomInputRef={inputRef}
            editor={editor}
            draftKey={draftKey}
            editableName="ThreadInput"
          />
        ) : (
          <Box
            grow="Yes"
            direction="Column"
            justifyContent="End"
            gap="300"
            style={{ padding: config.space.S400 }}
          >
            {thread ? (
              <Box justifyContent="Center">
                <Spinner variant="Secondary" />
              </Box>
            ) : (
              <>
                {rootEvent && (
                  <Box
                    direction="Column"
                    gap="100"
                    style={{
                      padding: config.space.S300,
                      borderRadius: config.radii.R400,
                      border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
                    }}
                  >
                    <Text size="T300">
                      <b>{getSenderName(room, rootSender ?? '')}</b>
                    </Text>
                    <Text size="T300" style={{ wordBreak: 'break-word' }}>
                      {getEventPreviewText(rootEvent, room)}
                    </Text>
                  </Box>
                )}
                <Text size="T300" priority="300" align="Center">
                  Напишите первый ответ — и у сообщения появится тред.
                </Text>
              </>
            )}
          </Box>
        )}
      </Box>
      <Box
        shrink="No"
        direction="Column"
        style={{ padding: `0 ${config.space.S300} ${config.space.S300}` }}
      >
        {canMessage ? (
          <RoomInput
            ref={inputRef}
            room={room}
            roomId={room.roomId}
            editor={editor}
            fileDropContainerRef={viewRef}
            threadRootId={rootId}
            draftKey={draftKey}
            editableName="ThreadInput"
            placeholder="Ответить в треде…"
          />
        ) : (
          <RoomInputPlaceholder
            style={{ padding: config.space.S200 }}
            alignItems="Center"
            justifyContent="Center"
          >
            <Text align="Center">Нет прав на отправку сообщений в этой комнате</Text>
          </RoomInputPlaceholder>
        )}
      </Box>
    </>
  );
}

// ---------------------------------------------------------------------------
// Панель целиком
// ---------------------------------------------------------------------------

type ThreadPanelProps = {
  room: Room;
  state: ThreadPanelState;
};
export function ThreadPanel({ room, state }: ThreadPanelProps) {
  const screenSize = useScreenSizeContext();
  const setPanel = useSetAtom(roomIdToThreadPanelAtomFamily(room.roomId));
  const close = useCallback(() => setPanel(undefined), [setPanel]);
  const main = state.view === 'thread' && !!state.main;
  const mobile = screenSize !== ScreenSize.Desktop || main;

  return (
    <Box
      className={classNames(css.Panel, ContainerColor({ variant: 'Background' }), {
        [css.PanelMobile]: mobile,
      })}
      direction="Column"
      style={mobile ? undefined : { maxWidth: toRem(560) }}
    >
      {state.view === 'list' ? (
        <ThreadList
          room={room}
          onClose={close}
          onOpenThread={(rootId) => setPanel({ view: 'thread', rootId, fromList: true })}
        />
      ) : (
        <ThreadView
          key={state.rootId}
          room={room}
          rootId={state.rootId}
          eventId={state.eventId}
          main={main}
          onBack={main ? undefined : () => setPanel({ view: 'list' })}
          onToggleMain={() => setPanel({ ...state, main: !main })}
          onClose={close}
        />
      )}
    </Box>
  );
}
