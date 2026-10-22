import type { IEventWithRoomId } from 'matrix-js-sdk';
import type { PrivateStorage } from './privateStorage';

export type SearchFilters = {
  term?: string;
  rooms?: string[];
  senders?: string[];
  after?: string;
  before?: string;
  kind?: string;
};
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
export const searchDateBoundary = (value?: string, end = false): number | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== Number(value.slice(0, 4)) ||
    date.getMonth() + 1 !== Number(value.slice(5, 7)) ||
    date.getDate() !== Number(value.slice(8, 10))
  )
    return undefined;
  if (end) date.setDate(date.getDate() + 1);
  return date.getTime();
};
export const matchesSearch = (event: IEventWithRoomId, filters: SearchFilters): boolean => {
  if (
    event.type === 'm.room.redaction' ||
    event.unsigned?.redacted_because ||
    event.content['m.relates_to']?.rel_type === 'm.replace'
  )
    return false;
  if (filters.rooms && !filters.rooms.includes(event.room_id)) return false;
  if (filters.senders?.length && !filters.senders.includes(event.sender)) return false;
  const after = searchDateBoundary(filters.after);
  const before = searchDateBoundary(filters.before, true);
  if (after !== undefined && event.origin_server_ts < after) return false;
  if (before !== undefined && event.origin_server_ts >= before) return false;
  const { content } = event;
  if (filters.kind && filters.kind !== 'all') {
    const kind = event.type === 'm.sticker' ? 'm.image' : content.msgtype;
    if (filters.kind === 'attachment') {
      if (typeof kind !== 'string' || !['m.image', 'm.video', 'm.audio', 'm.file'].includes(kind))
        return false;
    } else if (kind !== filters.kind) return false;
  }
  return (
    !filters.term || normalize(String(content.body ?? '')).includes(normalize(filters.term.trim()))
  );
};

type Storage = Pick<PrivateStorage, 'values' | 'set'>;
export class LocalSearchIndex {
  readonly ready: Promise<void>;

  readonly events = new Map<string, IEventWithRoomId>();

  error?: string;

  private readonly storage: Storage;

  private readonly listeners = new Set<() => void>();

  private writes = new Map<string, IEventWithRoomId | undefined>();

  private flushing: Promise<boolean> = Promise.resolve(true);

  private timer?: ReturnType<typeof setTimeout>;

  private active = true;

  constructor(storage: Storage) {
    this.storage = storage;
    this.ready = storage
      .values<IEventWithRoomId>()
      .then((events) => {
        if (this.active)
          events.forEach((event) =>
            this.events.set(LocalSearchIndex.key(event.room_id, event.event_id), event)
          );
      })
      .catch(() => {
        this.error =
          'Не удалось прочитать локальный индекс. Доступна только история текущего сеанса.';
      });
  }

  private static key(roomId: string, eventId: string) {
    return JSON.stringify([roomId, eventId]);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed() {
    this.listeners.forEach((listener) => listener());
  }

  async add(event: IEventWithRoomId): Promise<void> {
    await this.ready;
    if (!this.active || !event.event_id || !event.room_id) return;
    const key = LocalSearchIndex.key(event.room_id, event.event_id);
    if (event.type === 'm.room.redaction') {
      const redacts =
        (event as IEventWithRoomId & { redacts?: string }).redacts ?? event.content.redacts;
      if (typeof redacts === 'string') this.remove(event.room_id, redacts);
      return;
    }
    if (event.unsigned?.redacted_because) {
      this.remove(event.room_id, event.event_id);
      return;
    }
    if (
      !['m.room.message', 'm.sticker', 'm.poll.start', 'org.matrix.msc3381.poll.start'].includes(
        event.type
      )
    )
      return;
    if (this.events.get(key)?.type === 'm.room.redaction') return;
    this.put(key, structuredClone(event));
  }

  private put(key: string, event: IEventWithRoomId) {
    this.events.set(key, event);
    this.writes.set(key, event);
    // Bound device storage; the interface describes the index as device history.
    if (this.events.size > 50000) {
      const oldest = [...this.events.entries()]
        .filter(([, value]) => value.type !== 'm.room.redaction')
        .sort((a, b) => a[1].origin_server_ts - b[1].origin_server_ts)[0];
      if (oldest) {
        this.events.delete(oldest[0]);
        this.writes.set(oldest[0], undefined);
      }
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flush();
    }, 250);
    this.changed();
  }

  remove(roomId: string, eventId: string) {
    const key = LocalSearchIndex.key(roomId, eventId);
    const tombstone: IEventWithRoomId = {
      room_id: roomId,
      event_id: eventId,
      type: 'm.room.redaction',
      content: {},
      sender: '',
      origin_server_ts: Date.now(),
    };
    this.events.set(key, tombstone);
    this.writes.set(key, tombstone);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flush();
    }, 250);
    this.changed();
  }

  flush(): Promise<boolean> {
    this.flushing = this.flushing.then(async () => {
      const { writes } = this;
      this.writes = new Map();
      try {
        await Promise.all([...writes].map(([key, event]) => this.storage.set(key, event)));
        return true;
      } catch {
        writes.forEach((event, key) => {
          if (!this.writes.has(key)) this.writes.set(key, event);
        });
        this.error =
          'Не удалось сохранить индекс на устройстве. Поиск текущего сеанса продолжает работать.';
        this.changed();
        return false;
      }
    });
    return this.flushing;
  }

  async search(filters: SearchFilters, offset = 0, limit = 20) {
    await this.ready;
    // Keep originals and edits separately, so redacting an edit restores the
    // original and an edit arriving before its target still takes effect.
    const edits = new Map<string, IEventWithRoomId>();
    this.events.forEach((event) => {
      const relation = event.content['m.relates_to'];
      if (
        relation?.rel_type !== 'm.replace' ||
        typeof relation.event_id !== 'string' ||
        !event.content['m.new_content']
      )
        return;
      const targetKey = LocalSearchIndex.key(event.room_id, relation.event_id);
      const target = this.events.get(targetKey);
      if (!target || target.type === 'm.room.redaction' || target.sender !== event.sender) return;
      const previous = edits.get(targetKey);
      if (!previous || previous.origin_server_ts < event.origin_server_ts)
        edits.set(targetKey, event);
    });
    const events = [...this.events.entries()]
      .map(([key, original]) => {
        const edit = edits.get(key);
        return edit
          ? {
              ...original,
              content: {
                ...edit.content['m.new_content'],
                'm.relates_to': original.content['m.relates_to'],
              },
            }
          : original;
      })
      .filter((event) => matchesSearch(event, filters))
      .sort(
        (a, b) => b.origin_server_ts - a.origin_server_ts || a.event_id.localeCompare(b.event_id)
      );
    return {
      events: events.slice(offset, offset + limit),
      total: events.length,
      next: offset + limit < events.length ? offset + limit : undefined,
    };
  }

  dispose() {
    this.active = false;
    clearTimeout(this.timer);
    this.flush();
    this.listeners.clear();
  }
}
