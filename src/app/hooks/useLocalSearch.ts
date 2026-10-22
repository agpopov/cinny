/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue -- Sequential pages bound server load and allow cancellation. */
import { useEffect, useState } from 'react';
import {
  ClientEvent,
  Direction,
  MatrixEventEvent,
  RoomEvent,
  Method,
  EventStatus,
} from 'matrix-js-sdk';
import type { IEventWithRoomId, MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { LocalSearchIndex } from '../utils/localSearch';
import { PrivateStorage, privateAccountKey } from '../utils/privateStorage';
import { useMatrixClient } from './useMatrixClient';

const indexes = new WeakMap<MatrixClient, LocalSearchIndex>();
export const getLocalSearchIndex = (mx: MatrixClient) => {
  let index = indexes.get(mx);
  if (!index) {
    index = new LocalSearchIndex(
      new PrivateStorage(
        privateAccountKey(mx.baseUrl, mx.getSafeUserId(), mx.getDeviceId() ?? ''),
        'search'
      )
    );
    indexes.set(mx, index);
  }
  return index;
};

export const useSearchIndexSubscription = () => {
  const mx = useMatrixClient();
  useEffect(() => {
    const index = getLocalSearchIndex(mx);
    let active = true;
    const add = (event: MatrixEvent) => {
      const roomId = event.getRoomId();
      if (
        !roomId ||
        (event.status && event.status !== EventStatus.SENT) ||
        event.isDecryptionFailure() ||
        mx.getRoom(roomId)?.getMyMembership() !== 'join'
      )
        return;
      index.add(event.getEffectiveEvent() as IEventWithRoomId);
    };
    mx.on(RoomEvent.Timeline, add);
    mx.on(RoomEvent.LocalEchoUpdated, add);
    mx.on(MatrixEventEvent.Decrypted, add);
    mx.on(RoomEvent.Redaction, add);
    const scan = async () => {
      await index.ready;
      for (const room of mx.getRooms()) {
        if (!active) return;
        if (room.getMyMembership() === 'join') {
          room.getLiveTimeline().getEvents().forEach(add);
          room.getThreads().forEach((thread) => thread.liveTimeline.getEvents().forEach(add));
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      }
    };
    scan();
    mx.on(ClientEvent.Room, scan);
    const flush = () => {
      index.flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      active = false;
      mx.off(RoomEvent.Timeline, add);
      mx.off(RoomEvent.LocalEchoUpdated, add);
      mx.off(MatrixEventEvent.Decrypted, add);
      mx.off(RoomEvent.Redaction, add);
      mx.off(ClientEvent.Room, scan);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      index.dispose();
      indexes.delete(mx);
    };
  }, [mx]);
};

export const useLocalSearchStatus = () => {
  const mx = useMatrixClient();
  const index = getLocalSearchIndex(mx);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const bump = () => {
      if (!active || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        setVersion((value) => value + 1);
      }, 250);
    };
    index.ready.then(bump);
    const unsubscribe = index.subscribe(bump);
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [index]);
  return { index, version, count: index.events.size, error: index.error };
};

export const loadSearchHistory = async (
  mx: MatrixClient,
  roomIds: string[],
  signal: AbortSignal
) => {
  const index = getLocalSearchIndex(mx);
  const cursors = new PrivateStorage(
    privateAccountKey(mx.baseUrl, mx.getSafeUserId(), mx.getDeviceId() ?? ''),
    'search-cursors'
  );
  let unavailable = 0;
  let remaining = 0;
  for (const roomId of roomIds) {
    if (signal.aborted) break;
    if (mx.getRoom(roomId)?.getMyMembership() !== 'join') continue;
    // eslint-disable-next-line no-await-in-loop
    const cursor = await cursors.get<{ token?: string; done: boolean }>(roomId);
    if (cursor?.done) continue;
    // One page per room per explicit action. Failed/aborted pages never advance.
    // eslint-disable-next-line no-await-in-loop
    const page = await mx.http.authedRequest<
      Awaited<ReturnType<MatrixClient['createMessagesRequest']>>
    >(
      Method.Get,
      `/rooms/${encodeURIComponent(roomId)}/messages`,
      {
        ...(cursor?.token ? { from: cursor.token } : {}),
        limit: '100',
        dir: Direction.Backward,
        filter: JSON.stringify({ lazy_load_members: true }),
      },
      undefined,
      { abortSignal: signal, localTimeoutMs: 30000 }
    );

    let unavailableInRoom = 0;
    for (const raw of [...page.chunk].reverse()) {
      if (signal.aborted) break;
      const event = mx.getEventMapper()({ ...raw, room_id: roomId });
      // eslint-disable-next-line no-await-in-loop
      await mx.decryptEventIfNeeded(event);
      if (event.isDecryptionFailure()) {
        unavailable += 1;
        unavailableInRoom += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await index.add(event.getEffectiveEvent() as IEventWithRoomId);
    }
    if (signal.aborted) break;
    const done = !page.end || page.end === cursor?.token || page.chunk.length === 0;
    // Don't skip undecryptable history forever: keys may become available later.
    // eslint-disable-next-line no-await-in-loop
    if (!unavailableInRoom && (await index.flush()))
      await cursors.set(roomId, { token: page.end, done });
    if (!done) remaining += 1;
  }
  await index.flush();
  return { unavailable, remaining };
};
