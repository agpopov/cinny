import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue, useStore } from 'jotai';
import { RoomEvent, ThreadEvent } from 'matrix-js-sdk';
import { Box, Button, Chip, Icon, IconButton, Icons, Scroll, Text, config } from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSearchParams } from 'react-router-dom';
import { Page, PageContent, PageContentCenter, PageHeader } from '../../../components/page';
import { BackRouteHandler } from '../../../components/BackRouteHandler';
import { SequenceCard } from '../../../components/sequence-card';
import { VirtualTile } from '../../../components/virtualizer';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { mDirectAtom } from '../../../state/mDirectList';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import { roomIdToThreadPanelAtomFamily } from '../../../state/room/threadPanel';
import { AttentionFilter, AttentionItem, collectAttention } from '../../../utils/attention';
import { getEventPreviewText } from '../../../utils/notificationContent';
import { markMainTimelineAsRead, markThreadAsRead } from '../../../utils/notifications';
import { requestRoomThreads } from '../../../features/room/thread/useThread';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';

export function Attention() {
  const mx = useMatrixClient();
  const store = useStore();
  const roomIds = useAtomValue(allRoomsAtom);
  const unread = useAtomValue(roomToUnreadAtom);
  const directs = useAtomValue(mDirectAtom);
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const [params, setParams] = useSearchParams();
  const requestedFilter = params.get('attention');
  const filter: AttentionFilter =
    requestedFilter === 'me' || requestedFilter === 'threads' ? requestedFilter : 'all';
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const { navigateRoom } = useRoomNavigate();
  const screenSize = useScreenSizeContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rooms = useMemo(() => roomIds.flatMap((id) => mx.getRoom(id) ?? []), [mx, roomIds]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        setVersion((v) => v + 1);
      }, 100);
    };
    const events = [
      RoomEvent.Receipt,
      RoomEvent.UnreadNotifications,
      RoomEvent.Timeline,
      ThreadEvent.Update,
      ThreadEvent.New,
      ThreadEvent.Delete,
    ] as const;
    rooms.forEach((room) => events.forEach((event) => room.on(event, refresh)));
    rooms.forEach((room) => requestRoomThreads(mx, room));
    return () => {
      clearTimeout(timer);
      rooms.forEach((room) => events.forEach((event) => room.removeListener(event, refresh)));
    };
  }, [mx, rooms]);

  const items = useMemo(
    () => collectAttention(mx, rooms, directs, filter),
    // Receipts in other sessions, including threads, invalidate the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mx, rooms, directs, filter, unread, version]
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 132,
    overscan: 4,
    getItemKey: (index) => items[index].key,
  });
  const open = (item: AttentionItem) => {
    if (item.threadId) {
      navigateRoom(item.room.roomId);
      store.set(roomIdToThreadPanelAtomFamily(item.room.roomId), {
        view: 'thread',
        rootId: item.threadId,
        eventId: item.event?.getId(),
      });
    } else {
      store.set(roomIdToThreadPanelAtomFamily(item.room.roomId), undefined);
      navigateRoom(item.room.roomId, item.event?.getId());
    }
  };
  const read = useCallback(
    async (item: AttentionItem) => {
      setPending((current) => new Set(current).add(item.key));
      setError('');
      try {
        if (item.threadId) await markThreadAsRead(mx, item.room, item.threadId, hideActivity);
        else await markMainTimelineAsRead(mx, item.room.roomId, hideActivity);
        setVersion((v) => v + 1);
      } catch {
        setError('Не удалось отметить прочитанным. Повторите действие после восстановления сети.');
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(item.key);
          return next;
        });
      }
    },
    [mx, hideActivity]
  );

  return (
    <Page>
      <PageHeader>
        {screenSize !== ScreenSize.Desktop && (
          <BackRouteHandler>
            {(onBack) => (
              <IconButton aria-label="Назад к списку" onClick={onBack}>
                <Icon src={Icons.ArrowLeft} />
              </IconButton>
            )}
          </BackRouteHandler>
        )}
        <Text size="H3">Центр внимания</Text>
      </PageHeader>
      <Box
        style={{ padding: config.space.S300 }}
        gap="200"
        wrap="Wrap"
        aria-label="Фильтр центра внимания"
      >
        {(
          [
            ['all', 'Всё непрочитанное'],
            ['me', 'Мне'],
            ['threads', 'Треды'],
          ] as const
        ).map(([value, label]) => (
          <Chip
            key={value}
            aria-pressed={filter === value}
            variant={filter === value ? 'Primary' : 'Surface'}
            onClick={() => setParams({ attention: value })}
          >
            <Text size="T300">{label}</Text>
          </Chip>
        ))}
        <Chip onClick={() => setParams({ attention: 'history' })}>
          <Text size="T300">История уведомлений</Text>
        </Chip>
      </Box>
      {error && <Text role="alert">{error}</Text>}
      <Text size="T200" style={{ padding: config.space.S300 }} role="status" aria-live="polite">
        {items.length ? `Ожидают внимания: ${items.length}` : 'Всё прочитано'}
      </Text>
      <Box grow="Yes" style={{ position: 'relative' }}>
        <Scroll ref={scrollRef} hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const item = items[virtualItem.index];
                  return (
                    <VirtualTile
                      key={item.key}
                      virtualItem={virtualItem}
                      ref={virtualizer.measureElement}
                      style={{ paddingBottom: config.space.S300 }}
                    >
                      <SequenceCard
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="200"
                        style={{ padding: config.space.S400 }}
                      >
                        <Text size="H4">
                          {item.room.name}
                          {item.threadId ? ' › тред' : ''}
                        </Text>
                        <Text size="T200">
                          {item.highlight ? 'Упоминание' : 'Непрочитанное'}
                          {item.direct && ' · Личное сообщение'}
                          {item.count > 0 ? ` · ${item.count}` : ''}
                        </Text>
                        <Text size="T300" truncate>
                          {item.event
                            ? getEventPreviewText(item.event, item.room)
                            : 'Новые сообщения'}
                        </Text>
                        <Box gap="200" wrap="Wrap">
                          <Button size="300" onClick={() => open(item)}>
                            <Text size="B300">Открыть сообщение</Text>
                          </Button>
                          <Button
                            size="300"
                            fill="Soft"
                            disabled={pending.has(item.key)}
                            onClick={() => read(item)}
                          >
                            <Text size="B300">
                              {pending.has(item.key) ? 'Сохранение…' : 'Прочитано'}
                            </Text>
                          </Button>
                        </Box>
                      </SequenceCard>
                    </VirtualTile>
                  );
                })}
              </div>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
